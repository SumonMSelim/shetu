# Contributing to Shetu

Thank you for your interest in Shetu. Shetu is a reliable, trusted study-abroad
advisor built to protect students from agencies that profit from misinformation.
Contributions that make the guidance more accurate, more honest, more accessible,
or that add support for more destinations are very welcome.

## Code of Conduct

By participating in this project you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md). Please read it.

## Licensing of contributions

Shetu is licensed under the **GNU Affero General Public License v3.0**
(see [LICENSE](LICENSE)). By submitting a contribution, you agree that your
contribution is licensed under the same AGPL-3.0 terms.

## Ways to contribute

- **Improve or extend the knowledge base.** The most valuable contributions.
  Each destination lives in `src/lib/knowledge/`. Every fact must come from an
  official source and carry provenance (source name, URL, retrieval date). See
  the "Knowledge base rules" below.
- **Add a new destination.** Write a new data module and register it in
  `src/lib/knowledge/index.ts`. No agent or UI changes are needed.
- **Improve the agents.** Prompts and tools live in `src/lib/agent/`.
- **Fix bugs or improve the UI, accessibility, or docs.**

## Knowledge base rules (important)

Shetu's trustworthiness depends on one rule: **the agents may only state facts
that come from the cited knowledge base.** When you add or change a fact:

1. It must come from an **official or authoritative source** (a government
   portal, the official study-abroad body, a university, or an immigration
   service). Not a blog or an agency.
2. It must include complete **provenance**: `source`, `sourceUrl`, and
   `retrieved` (ISO date). Add `period` where a figure is year-specific.
3. Scholarships must state honest **caveats** (one-off vs recurring, partial vs
   full tuition). Never present a partial award as if it covers everything.
4. Red flags must include both **why** it is a warning sign and the **reality**
   of what an honest process looks like.

The integrity tests in `tests/knowledge.test.ts` enforce much of this. Run them.

## Development setup

See the **Running and deploying** section of the [README](README.md) for full
setup (Google OAuth, Bedrock access, environment variables). In short:

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

Requirements: Node.js 22+, an AWS account with Amazon Bedrock access, and a
Google OAuth client for sign-in.

## Before you open a pull request

Run all of these and make sure they pass:

```bash
npm run typecheck   # TypeScript, no errors
npm run build       # production build succeeds
npm test            # knowledge-base integrity tests
```

Then:

- Keep changes focused. One topic per pull request.
- Match the existing code style. Keep comments meaningful.
- **Do not use em dashes** anywhere (code, comments, copy). Use commas, full
  stops, or brackets. This keeps the writing style consistent and simple.
- Write user-facing copy in plain, simple English that a non-native English
  speaker can easily understand.
- **Never commit secrets.** No `.env` files, API keys, AWS account IDs, or real
  personal data. `.env*` is gitignored; keep it that way.

## Pull request process

1. Fork the repository and create a branch from `main`.
2. Make your change, with tests where it makes sense.
3. Ensure typecheck, build, and tests pass.
4. Open a pull request with a clear description: what changed, why, and how you
   tested it. For knowledge changes, link the official source.
5. A maintainer will review. Please be patient and responsive to feedback.

## Reporting bugs and requesting features

Open an issue. For bugs, include steps to reproduce, what you expected, and what
happened. For security issues, do **not** open a public issue; follow
[SECURITY.md](SECURITY.md) instead.

## Questions

Open a discussion or an issue. Thank you for helping students get guidance they
can trust.
