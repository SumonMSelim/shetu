/**
 * The evaluation runner (Track E).
 *
 * Runs each scenario against the REAL multi-agent system, applies the
 * deterministic gates (grounding, required and forbidden phrases, tool and
 * specialist routing, script matching), optionally scores with the judge
 * model, and writes a scorecard to evals/runs/.
 *
 * Not part of CI: this hits live Bedrock (credit-covered Nova) and takes
 * several minutes. Run before model changes, after prompt changes, and
 * before releases: npm run evals [-- --only <id>] [--max <n>]
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Agent } from "@strands-agents/sdk";
import { buildOrchestrator } from "../src/lib/agent/orchestrator";
import { fastModel } from "../src/lib/agent/model";
import { checkExpectations, checkGrounding, type Expectations } from "../src/lib/evals/checks";
import { todayIso } from "../src/lib/knowledge/draft";
import { TRUSTED_DOMAINS } from "../src/lib/knowledge/trusted-domains";

// --- Args -------------------------------------------------------------------
const args = process.argv.slice(2);
function arg(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const only = arg("only");
const maxScenarios = Number(arg("max") ?? Number.POSITIVE_INFINITY);
const EVAL_USER = "eval-user-do-not-match-real-accounts";

// --- Scenarios ---------------------------------------------------------------
const scenarioFile = join(process.cwd(), "evals", "scenarios.json");
interface Scenario {
  id: string;
  kind: string;
  input: string;
  expect: Expectations;
  judge?: string;
}
const scenarios = (JSON.parse(readFileSync(scenarioFile, "utf8")) as { scenarios: Scenario[] })
  .scenarios.filter((s) => !only || s.id === only)
  .slice(0, maxScenarios);

if (scenarios.length === 0) {
  console.error(`No scenarios matched (${only ? `--only ${only}` : "all"})`);
  process.exit(2);
}

// --- Judge -------------------------------------------------------------------
const judgeModel = fastModel();

const RUBRICS: Record<string, string> = {
  honesty:
    "You grade a study-abroad advisor's answers for honesty and usefulness. Score 1-5: 5 = fully honest, cites sources, gives caveats, never guarantees outcomes; 4 = mostly honest with minor omissions; 3 = acceptable but vague; 2 = sugar-coats or misses key warnings; 1 = dishonest or misleading.",
  relevance:
    "You grade how RELEVANT the advisor's answer is to the student's actual question. Score 1-5: 5 = every listed programme or fact directly matches the question's subject, level and countries; 4 = nearly all relevant with minor drift; 3 = half relevant; 2 = mostly unrelated items mixed in; 1 = the answer ignores the question.",
};

function rubricPrompt(kind: string, question: string, answer: string): string {
  const rubric = RUBRICS[kind] ?? RUBRICS.honesty;
  return `Student question:\n${question}\n\nAdvisor answer:\n${answer}\n\nGrade it.\n\nRubric: ${rubric}\n\nReply ONLY with JSON in a \`\`\`json fence: {\"score\": <1-5>, \"reason\": \"<one sentence>\"}`;
}

async function judgeAnswer(kind: string, question: string, answer: string): Promise<{ score: number; reason: string } | null> {
  const judge = new Agent({
    name: "eval_judge",
    model: judgeModel,
    printer: false,
    systemPrompt: RUBRICS[kind] ?? RUBRICS.honesty,
  });
  let reply = "";
  for await (const event of judge.stream(
    rubricPrompt(kind, question, answer),
    { limits: { turns: 2, outputTokens: 1000, totalTokens: 20_000 } },
  )) {
    if (
      event.type === "modelStreamUpdateEvent" &&
      event.event.type === "modelContentBlockDeltaEvent" &&
      event.event.delta.type === "textDelta" &&
      event.event.delta.text
    ) {
      reply += event.event.delta.text;
    }
  }
  try {
    const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
    const parsed = JSON.parse(fenced ? fenced[1] : reply) as { score: number; reason: string };
    if (typeof parsed.score !== "number" || !parsed.reason) return null;
    return { score: Math.max(1, Math.min(5, Math.round(parsed.score))), reason: parsed.reason };
  } catch {
    return null;
  }
}

// --- Run -----------------------------------------------------------------------
interface ScenarioResult {
  id: string;
  kind: string;
  pass: boolean;
  failures: string[];
  judgeScore?: number;
  judgeReason?: string;
  answerChars: number;
  durationMs: number;
  stopReason?: string;
  tools: string[];
  answer: string;
}

const results: ScenarioResult[] = [];

for (const scenario of scenarios) {
  const started = Date.now();
  process.stdout.write(`\n=== ${scenario.id} (${scenario.kind}) ===\n`);
  const agent = buildOrchestrator(EVAL_USER, undefined);
  let answer = "";
  const toolNames: string[] = [];
  const toolTexts: string[] = [];
  let stopReason: string | undefined;
  let failure: string | null = null;

  try {
    for await (const event of agent.stream(scenario.input, {
      limits: { turns: 10, outputTokens: 12_000, totalTokens: 120_000 },
    })) {
      if (
        event.type === "modelStreamUpdateEvent" &&
        event.event.type === "modelContentBlockDeltaEvent" &&
        event.event.delta.type === "textDelta" &&
        event.event.delta.text
      ) {
        answer += event.event.delta.text;
      }
      if (event.type === "beforeToolCallEvent" && event.toolUse.name) {
        if (!toolNames.includes(event.toolUse.name)) toolNames.push(event.toolUse.name);
      }
      if (event.type === "afterToolCallEvent") {
        toolTexts.push(JSON.stringify(event.result));
      }
      if (event.type === "agentResultEvent") {
        stopReason = (event.result as { stopReason?: string })?.stopReason;
      }
    }
  } catch (err) {
    failure = String(err).slice(0, 200);
  }

  const expectResult = checkExpectations(answer, toolNames, scenario.expect, toolTexts, TRUSTED_DOMAINS);
  const grounding =
    scenario.expect.grounded === true ? checkGrounding(answer, toolTexts) : null;
  const failures = [...expectResult.failures];
  if (grounding && !grounding.pass) {
    failures.push(`ungrounded figures: ${grounding.ungrounded.join(", ")}`);
  }
  if (failure) failures.push(`agent error: ${failure}`);

  let judge: { score: number; reason: string } | null = null;
  if (scenario.judge && answer.trim() && !failure) {
    try {
      judge = await judgeAnswer(scenario.judge, scenario.input, answer);
    } catch (err) {
      console.log(`    judge unavailable: ${String(err).slice(0, 120)}`);
    }
  }

  const pass = failures.length === 0;
  const result: ScenarioResult = {
    id: scenario.id,
    kind: scenario.kind,
    pass,
    failures,
    ...(judge ? { judgeScore: judge.score, judgeReason: judge.reason } : {}),
    answerChars: answer.length,
    durationMs: Date.now() - started,
    ...(stopReason ? { stopReason } : {}),
    tools: toolNames,
    answer: answer.slice(0, 4000),
  };
  results.push(result);

  console.log(`  ${pass ? "PASS" : "FAIL"} (${result.durationMs} ms, tools: ${toolNames.join(", ") || "none"})`);
  for (const f of failures) console.log(`    - ${f}`);
  if (judge) console.log(`    judge: ${judge.score}/5 - ${judge.reason}`);
}

// --- Scorecard -----------------------------------------------------------------
const passed = results.filter((r) => r.pass).length;
const judgeScores = results.map((r) => r.judgeScore).filter((s): s is number => s !== undefined);
const scorecard = {
  ranAt: new Date().toISOString(),
  model: process.env.SHETU_MODEL_ID ?? "amazon.nova-pro-v1:0",
  totals: { scenarios: results.length, passed, failed: results.length - passed },
  judgeAverage:
    judgeScores.length > 0
      ? Math.round((judgeScores.reduce((a, b) => a + b, 0) / judgeScores.length) * 100) / 100
      : null,
  results,
};

const runsDir = join(process.cwd(), "evals", "runs");
mkdirSync(runsDir, { recursive: true });
const runFile = join(runsDir, `${todayIso()}-${Date.now()}.json`);
writeFileSync(runFile, JSON.stringify(scorecard, null, 2) + "\n", "utf8");

// Compare against the most recent previous run, when one exists.
const priorFiles = readdirSync(runsDir).filter((f) => f.endsWith(".json") && f !== runFile.split("/").pop()).sort();
if (priorFiles.length > 0) {
  const prior = JSON.parse(readFileSync(join(runsDir, priorFiles[priorFiles.length - 1]), "utf8")) as {
    totals?: { passed: number; scenarios: number };
    judgeAverage?: number;
    model?: string;
  };
  if (prior.totals) {
    const dPass = passed - prior.totals.passed;
    console.log(
      `vs previous run (${prior.model ?? "unknown model"}, ${prior.totals.passed}/${prior.totals.scenarios}, judge ${prior.judgeAverage ?? "n/a"}): pass ${dPass >= 0 ? "+" : ""}${dPass}, judge ${scorecard.judgeAverage !== null && prior.judgeAverage !== undefined ? (Math.round((scorecard.judgeAverage - prior.judgeAverage) * 100) / 100) : "n/a"}`,
    );
  }
}

console.log(`\n=== Scorecard: ${passed}/${results.length} passed, judge average ${scorecard.judgeAverage ?? "n/a"}/5 ===`);
console.log(`Written to ${runFile}`);
if (passed < results.length) process.exit(1);
