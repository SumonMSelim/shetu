# Shetu: an honest AI advisor that protects students from predatory study-abroad agencies

> Submission for the *Strands SDK: Workshop to Ship* hackathon (Education track).

## The problem I set out to solve

Every year, an enormous number of students try to go abroad for higher
education. For most of them it is the biggest, most expensive, and most
confusing decision of their lives, and they start it with almost no reliable
information. So they do the natural thing: they turn to an agency.

A lot of those agencies are good. But many make their money precisely from the
fact that the student cannot tell good information from bad. They promise things
no one can promise ("guaranteed admission", "guaranteed visa"). They quote a
scholarship as if it covers everything, when it is a one-off partial grant. They
quietly leave out the real cost of living, the insurance, the visa proof-of-funds
requirement, so the "affordable" plan collapses after the student has already
paid a large upfront fee for services that were free to begin with. In the worst
cases, they simply take the money and disappear.

I have watched this happen to people around me. The students who get hurt most
are the ones with the least access to honest, independent advice, often the ones
who can least afford to lose the money.

So I built **Shetu** (the word means *bridge*): a conversational AI advisor whose
entire job is to be the honest, independent voice those students never had.

## What Shetu does

After a one-click Google sign-in, the student just talks to Shetu in a chat.
There is no form maze, no dashboard to learn. They can ask anything:

- *"Assess how ready I am for a master's abroad."*
- *"What does a year there really cost, all in?"*
- *"Which scholarships could I actually get, and do they cover full tuition?"*
- *"An agency says they guarantee my admission and a scholarship if I pay an
  upfront fee. Is that legit?"*
- *"Help me improve my statement of purpose."*
- *"Give me an IELTS writing task at my level and score my answer."*

Shetu answers in plain language, and crucially, **every factual claim is tied to
a verified source**. It will tell a student the hard truth: that a scholarship is
only €5,000 and one-off, that they also need to prove ~€13,500 in funds for the
visa, that no one can guarantee a visa, and that the "all-inclusive package fee"
an agency is pushing is a red flag.

Students can also keep their documents in a private **Vault** (and have the agent
review them), and whenever a decision feels too big for a chatbot, they can ask
Shetu to arrange a **real human mentor**.

The first version focuses its knowledge on **the Netherlands** (a popular,
relatively affordable, English-friendly destination), using data from the
official Study in NL portal. But nothing about the product is Netherlands-specific:
the destination knowledge is a pluggable data layer, so new countries can be
added without touching the agents or the interface.

## How it is built with the Strands Agents SDK

This is where the workshop paid off. A single chatbot would have been easy, but
it would also have been shallow, and worse, it would have been tempted to make
things up. I wanted an architecture that was both genuinely multi-agent and
structurally honest.

### A team of specialists, not one know-it-all

Shetu uses the Strands SDK's **agents-as-tools** pattern. One **orchestrator**
agent talks to the student and decides which specialist to delegate to:

```
                 Orchestrator (Shetu)  ── talks to the student
                          │
     ┌──────────┬─────────┼──────────┬─────────────┐
     ▼          ▼         ▼          ▼             ▼
 Readiness  Opportunity  Cost &    Document      IELTS
            Matcher      Scam Guard Coach         Prep
```

Each specialist is its own Strands `Agent` with a focused system prompt. The
orchestrator holds them as tools via `.asTool()`, so the model routes a question
to the specialist best suited to it, and can combine several for a complex
question. The **Cost & Scam Guard** is the heart of the mission: it produces an
itemised, realistic cost picture and checks any agency offer against a catalogue
of known predatory tactics.

### Structural honesty: the agents cannot make facts up

The single most important design decision: **the agents are not allowed to state
a destination fact from the model's memory.** Every figure, deadline, and rule
comes from a verified knowledge base exposed through Strands tools
(`get_costs`, `get_scholarships`, `get_visa_info`, `get_red_flags`, and so on).
Each record in that knowledge base carries its own source and URL, so the agent
can cite where a number came from, and a shared "honesty charter" in every system
prompt forbids guarantees, forbids hiding costs, and forces the real-cost-vs-fee
distinction.

The result is an agent that is confident where it has grounds to be and honest
about the limits of what it knows, the opposite of the agencies it is meant to
replace.

### The rest of the stack

- **Model:** Amazon Bedrock, Claude (via a cross-region inference profile), using
  the Strands `BedrockModel`. A cheaper Haiku model handles lighter work like
  IELTS drills, configured through Strands' per-agent model selection.
- **Streaming:** the orchestrator run is streamed to the browser, so the student
  sees the answer appear token by token and sees *which specialist is working*.
- **App:** Next.js (TypeScript) for both the chat UI and the API.
- **Auth:** Auth.js with Google sign-in.
- **Vault:** Amazon S3, fully private, with per-user isolation and presigned
  uploads/downloads. The student always keeps their own originals.
- **Data:** Amazon DynamoDB (single table) for profiles, document metadata, and
  mentorship requests.
- **Infrastructure as code:** AWS CDK provisions everything (S3, DynamoDB, ECR,
  and an App Runner service) with an IAM role scoped tightly to Bedrock-invoke
  plus exactly that one bucket and table. The app ships as a Docker image.

## The measurable impact

The point of Shetu is to move numbers that matter to a student:

- **Agency fees avoided.** The official steps Shetu guides a student through,
  searching programmes, applying, and applying for scholarships like the NL
  Scholarship, are free. Students routinely pay agencies hundreds of dollars for
  these. Every one of those is money kept.
- **Hidden costs surfaced before they commit.** By itemising tuition + living +
  insurance + visa proof-of-funds up front, Shetu stops the "it looked
  affordable" trap that pushes families into debt or a failed visa.
- **Red flags caught before money changes hands.** The Scam Guard names specific
  predatory tactics the moment a student describes them.
- **Readiness gaps identified early**, when there is still time to fix them.

## What I learned

The biggest lesson was that *architecture is an ethical choice*. The grounded-tools
design is not just a technical nicety; it is what makes an AI advisor
trustworthy enough to deserve a vulnerable student's trust. The Strands SDK made
that design cheap to express: specialists as tools, grounded tools with typed
schemas, per-agent models, and streaming were all a few lines each, which let me
spend my time on the knowledge base and the honesty rules rather than on
plumbing an agent loop.

I also learned how far a focused knowledge base beats a bigger prompt. Narrowing
the demo to one country made the answers specific and verifiable, and the
pluggable design means breadth is now just a data task.

## Try it

- **Source code:** *(public repository link)*
- **Live demo:** `https://shetu.mol.la`
- **Demo video:** *(link, under 3 minutes)*

Shetu gives source-cited guidance, but it is deliberately clear that it is a
starting point, not a replacement for the official university and immigration
pages, or for professional legal advice. The goal is simple: make sure no student
has to rely on someone who profits from keeping them in the dark.
