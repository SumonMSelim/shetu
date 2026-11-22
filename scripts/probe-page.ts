/**
 * Render a page headlessly and dump its structure, for writing scraper
 * selectors. Development tool for source adapters (JavaScript portals).
 *
 * Usage:
 *   npm run probe:page -- --url <url> [--wait-selector ".card"] [--dump 2] [--settle 10000]
 */
import { chromium } from "playwright";

const args = process.argv.slice(2);
function arg(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const url = arg("url");
const waitSelector = arg("wait-selector");
const dumpCount = Number(arg("dump") ?? 2);
const settleMs = Number(arg("settle") ?? 10000);

if (!url) {
  console.error("Usage: npm run probe:page -- --url <url> [--wait-selector <sel>] [--dump <n>] [--settle <ms>]");
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
if (waitSelector) {
  try {
    await page.waitForSelector(waitSelector, { timeout: 20_000 });
  } catch {
    console.log(`wait-selector "${waitSelector}" did not appear; dumping anyway after settle`);
  }
}
await page.waitForTimeout(settleMs);

const info = await page.evaluate(() => {
  const classCounts = new Map<string, number>();
  for (const el of document.querySelectorAll<HTMLElement>("[class]")) {
    for (const cls of el.classList) {
      classCounts.set(cls, (classCounts.get(cls) ?? 0) + 1);
    }
  }
  const interesting = [...classCounts.entries()]
    .filter(([c]) => /card|result|programme|program|item|listing|row|search/i.test(c))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  return {
    title: document.title,
    bodyChars: document.body.innerText.length,
    headings: [...document.querySelectorAll("h1,h2,h3")].slice(0, 8).map((h) => h.tagName + " " + h.textContent?.trim().slice(0, 60)),
    interestingClasses: interesting,
  };
});

console.log(`title: ${info.title}`);
console.log(`body text chars: ${info.bodyChars}`);
console.log("headings:", info.headings);
console.log("candidate classes (card|result|programme|item|listing|row|search):");
for (const [cls, count] of info.interestingClasses) console.log(`  .${cls} x${count}`);

for (let i = 0; i < info.interestingClasses.length && i < dumpCount; i++) {
  const cls = info.interestingClasses[i][0];
  const el = document_item(page, cls, i);
  void el;
}

async function document_item(page: import("playwright").Page, cls: string, _i: number) {
  const samples = await page.evaluate((c) => {
    const els = [...document.querySelectorAll(`.${c}`)].slice(0, 3);
    return els.map((e) => e.outerHTML.slice(0, 700));
  }, cls);
  console.log(`\n--- sample .${cls} ---`);
  for (const s of samples) console.log(s, "\n");
  return null;
}

await browser.close();
