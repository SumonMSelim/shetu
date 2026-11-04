# Security Policy

Shetu handles personal information that students trust us with: their Google
account basics, their profile details, and documents they upload to the Vault.
We take the security of that data seriously. Thank you for helping keep it safe.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Instead, report privately using one of these:

- Use GitHub's **private vulnerability reporting**: go to the repository's
  **Security** tab and choose **Report a vulnerability**.
- Or email the maintainer at the address listed on the project's public
  repository profile.

Please include:

- A description of the issue and the type of vulnerability.
- Steps to reproduce, or a proof of concept.
- The affected component (for example: authentication, the Vault, the chat API,
  the knowledge tools, or the infrastructure).
- The potential impact as you see it.

We will acknowledge your report, keep you informed as we investigate, and credit
you if you would like, once a fix is released. Please give us a reasonable time
to fix the issue before any public disclosure.

## Scope

In scope:

- The web application (`src/`): authentication, session handling, the chat and
  Vault and mentorship APIs, input validation, access control between users.
- The agent tools (`src/lib/agent/`) and whether they can be made to leak data
  or act outside the signed-in user's own data.
- The infrastructure definitions (`infra/`): IAM scoping, storage access,
  public exposure.

Out of scope:

- Vulnerabilities in third-party dependencies that are already publicly known
  and awaiting an upstream fix (please still let us know).
- Issues that require a compromised user device or a self-inflicted
  misconfiguration.
- The accuracy of study-abroad guidance. That is handled through normal issues
  and the knowledge-base review process, not as a security report.

## Our security practices

These are the design choices that protect user data. If you find a place where
the code does not live up to them, that is worth reporting.

- **No secrets in the repository.** All secrets (`AUTH_SECRET`, Google OAuth
  client secret, AWS credentials) come from the environment or an IAM role, not
  from source. `.env*` is gitignored.
- **AWS credentials come from an IAM role** in production (App Runner instance
  role), scoped to only the actions and resources Shetu needs: Bedrock invoke,
  and the specific S3 bucket and DynamoDB table.
- **The document Vault is private.** The S3 bucket blocks all public access, is
  encrypted at rest, and enforces TLS. Browsers upload and download only through
  short-lived presigned URLs.
- **Per-user data isolation.** Vault objects are namespaced per user, and the
  user-scoped tools are built per request with the signed-in user's id bound in,
  so one user's requests cannot touch another user's data.
- **Input validation.** API request bodies are validated with Zod schemas.
- **Least-privilege auth.** Sign-in uses Google OAuth with only basic scopes
  (`openid`, `email`, `profile`). Sessions are JWT-based.

## Supported versions

Shetu is under active development. Security fixes are applied to the `main`
branch. There are no long-term support branches at this time.

## A note for self-hosters

Shetu is AGPL-3.0 licensed and can be self-hosted. If you run your own instance,
you are responsible for its security: set a strong `AUTH_SECRET`, keep your AWS
IAM policies tightly scoped, keep dependencies updated, and do not expose your
environment variables. The infrastructure in `infra/` provides secure defaults,
review them before deploying.
