<p align="center">
  <img src="public/logo.svg" width="96" height="96" alt="Shetu logo" />
</p>

<h1 align="center">Shetu</h1>

<p align="center"><em>Your honest guide to studying abroad.</em></p>

---

## The problem

Every year, huge numbers of students try to study abroad for higher education.
Most of them start with little reliable information, so they turn to agencies for
help with choosing programmes, finding scholarships, understanding costs,
preparing documents, and navigating visas.

Many of those agencies profit from the information gap. They overpromise
("guaranteed admission and visa"), sugar-coat or hide the real costs, push
scholarships that do not exist or do not cover what they claim, charge large
upfront fees for services that are actually free, and in the worst cases simply
scam students who have saved for years.

The students who are hurt most are exactly the ones with the least access to
trustworthy, independent guidance.

## What Shetu does

Shetu is a conversational AI advisor that gives students **honest, source-cited
guidance** so they can make decisions without depending on a predatory agency.
Everything happens through a chat interface after a one-click Google sign-in:

- **Readiness assessment** - an honest read of your profile and the concrete gaps to close.
- **Opportunity matching** - realistic programmes and funding, with honest fit reasoning.
- **Real costs and scam detection** - a brutally honest, itemised cost picture, and a check of any agency offer against known predatory red flags.
- **Document coaching** - structured feedback on your statement of purpose, CV, or motivation letter.
- **IELTS preparation** - band explanations, targeted practice, and realistic scoring.
- **A private document Vault** - store your documents securely; you always keep your own originals.
- **Human mentorship on request** - when a decision is high-stakes or personal, Shetu arranges a real person.

Two design choices make Shetu trustworthy where agencies are not:

1. **Grounded facts only.** The agents can state a destination fact (a fee, a
   deadline, a rule) only if it comes from a verified knowledge base behind a
   tool. Each record carries its source, so answers are cited and auditable, not
   invented.
2. **An honesty charter.** Every agent is instructed never to guarantee
   outcomes, never to hide costs, and to separate real government/university
   costs from agency service fees.

Shetu is destination-agnostic by design. This initial version ships a verified
knowledge base for **the Netherlands** (sourced from the official
[Study in NL](https://www.studyinnl.org) portal and the Dutch immigration
service). Adding another country is purely a data operation - no agent or UI
changes.

## Architecture

Shetu is built with the **[Strands Agents SDK](https://strandsagents.com)
(TypeScript)** using the *agents-as-tools* multi-agent pattern. A single
orchestrator talks to the student and delegates to focused specialists.

```
                         ┌──────────────────────────────┐
     Student  ◀────────▶ │   Orchestrator (Shetu)        │
  (chat UI, streaming)   │   warm, conversational        │
                         └──────────────┬───────────────┘
                                        │ delegates to specialists (as tools)
          ┌───────────────┬─────────────┼───────────────┬───────────────┐
          ▼               ▼             ▼               ▼               ▼
    ┌───────────┐  ┌─────────────┐ ┌───────────┐ ┌─────────────┐ ┌───────────┐
    │ Readiness │  │ Opportunity │ │ Cost &    │ │ Document    │ │ IELTS     │
    │           │  │ Matcher     │ │ Scam Guard│ │ Coach       │ │ Prep      │
    └─────┬─────┘  └──────┬──────┘ └─────┬─────┘ └──────┬──────┘ └───────────┘
          │               │              │              │
          └───────────────┴──────┬───────┴──────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │  Grounded knowledge tools │  get_costs, get_scholarships,
                    │  (cited, verified data)   │  get_visa_info, get_red_flags, …
                    └──────────────────────────┘

   Orchestrator also holds: vault_list / vault_read / request_mentorship
```

- **Model:** Amazon Bedrock, Claude (cross-region inference profile), via the Strands `BedrockModel`.
- **Grounding:** every destination fact is served by a tool from a cited knowledge base, never from the model's memory.
- **Streaming:** the orchestrator run is streamed to the browser as newline-delimited JSON (text chunks plus "which specialist is working" markers).

### Tech stack

| Layer | Choice |
|------|--------|
| Agents | Strands Agents SDK (TypeScript), multi-agent agents-as-tools |
| Model | Amazon Bedrock - Claude Sonnet 4.6 (+ Haiku 4.5 for light tasks) |
| App | Next.js (App Router), React, TypeScript |
| Auth | Auth.js v5, Google sign-in |
| Vault | Amazon S3 (encrypted, private, presigned uploads/downloads) |
| Data | Amazon DynamoDB (single-table: profiles, documents, mentorship) |
| Infra | AWS CDK (TypeScript) → App Runner + ECR + S3 + DynamoDB |
| Container | Docker (Next.js standalone, non-root) |

## Project layout

```
src/
  app/                 Next.js routes (landing, chat, vault, mentorship) + API
    api/chat           streaming multi-agent endpoint
    api/vault          presigned S3 upload/list
    api/mentorship     mentorship requests
  components/          Chat, Vault, header UI
  lib/
    agent/             orchestrator, specialists, prompts, model, tools
    knowledge/         destination knowledge bases (Netherlands) + types
    aws/               S3 vault, DynamoDB repository, clients
  auth.ts              Auth.js (Google) config
  proxy.ts             route protection
infra/                 AWS CDK app (App Runner, S3, DynamoDB, ECR, IAM)
Dockerfile             production image
```

## Running and deploying

### Prerequisites

- Node.js 22+ and npm
- An AWS account with Amazon Bedrock access (Claude models enabled)
- A Google OAuth client (for sign-in)
- Docker (for the production image)

### Run locally

```bash
npm install
cp .env.example .env.local   # fill in the values (see below)
npm run dev
```

Set these in `.env.local`:

- `AUTH_URL` - `http://localhost:3000` locally
- `AUTH_SECRET` - generate with `openssl rand -base64 33`
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` - from your Google OAuth web client
  (authorised redirect URI: `<AUTH_URL>/api/auth/callback/google`)
- `AWS_REGION` - e.g. `us-east-1`
- `SHETU_MODEL_ID` / `SHETU_FAST_MODEL_ID` - Bedrock cross-region inference profiles
- `SHETU_VAULT_BUCKET` / `SHETU_TABLE_NAME` - the S3 bucket and DynamoDB table names

AWS credentials come from your local AWS profile for development, and from the
task IAM role in production (never hard-coded).

### Deploy to AWS

Infrastructure is defined with AWS CDK in `infra/` and provisions a VPC, an ECS
Fargate service behind an Application Load Balancer, and an IAM task role scoped
to Bedrock plus the S3 bucket and DynamoDB table. The container image is built
from the `Dockerfile` at deploy time.

```bash
cd infra
npm install
npx cdk bootstrap          # first time per account/region
npx cdk deploy \
  -c appUrl=https://your-domain \
  -c authSecret="$(openssl rand -base64 33)" \
  -c googleId=YOUR_GOOGLE_CLIENT_ID \
  -c googleSecret=YOUR_GOOGLE_CLIENT_SECRET \
  -c certArn=YOUR_ACM_CERT_ARN
```

Put your domain in front with your DNS provider (a CNAME to the load balancer),
and terminate TLS with an ACM certificate on the load balancer.

## A note on scope

Shetu gives source-cited guidance, but it is **not** a substitute for the
official university admissions and immigration pages, nor for legal or
immigration advice. Figures change yearly; every data record carries the date it
was last checked. The project exists to give students a reliable starting point,
not to replace the final official checks they must always do themselves.

## Contributing and community

Contributions are welcome, especially improvements to the knowledge base and
support for new destinations.

- [CONTRIBUTING.md](CONTRIBUTING.md) - how to set up, the knowledge-base rules, and the PR process
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) - how we treat each other
- [SECURITY.md](SECURITY.md) - how to report a vulnerability privately

## License

GNU Affero General Public License v3.0 (AGPL-3.0). See [LICENSE](LICENSE).

Shetu is network-facing software. Under the AGPL, if you run a modified version
and let others interact with it over a network, you must also make your modified
source available to those users. See the license for the exact terms.
