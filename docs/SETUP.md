# Shetu - setup and deployment

This guide covers everything from a fresh checkout to a running deployment at
`https://shetu.mol.la`.

---

## 1. Prerequisites

- **Node.js 22+** and npm
- **Docker** (for building the production image)
- **AWS account** with:
  - Amazon Bedrock model access enabled (see step 3)
  - permission to deploy CDK (S3, DynamoDB, ECR, App Runner, IAM)
- **AWS CLI v2**, authenticated (`aws sts get-caller-identity` should succeed)
- A **Google Cloud** account (for the OAuth sign-in client)
- A **Cloudflare**-managed domain (`mol.la`) with `npx wrangler` available

---

## 2. Create the Google OAuth client

Shetu signs users in with Google. Create an OAuth client:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create (or select) a project, e.g. **Shetu**.
3. Open **APIs & Services → OAuth consent screen**.
   - User type: **External**.
   - Fill in app name (**Shetu**), your support email, and a developer email.
   - Scopes: the defaults (`openid`, `email`, `profile`) are enough. Save.
   - While testing, add your own Google account under **Test users** (or publish
     the app when you are ready for anyone to sign in).
4. Open **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Name: **Shetu Web**.
   - **Authorised JavaScript origins:**
     - `http://localhost:3000`
     - `https://shetu.mol.la`
   - **Authorised redirect URIs** (this is the important part - Auth.js uses a
     fixed callback path):
     - `http://localhost:3000/api/auth/callback/google`
     - `https://shetu.mol.la/api/auth/callback/google`
   - Create. Copy the **Client ID** and **Client secret**.

You now have `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.

> If you later change the domain, add its origin and `/api/auth/callback/google`
> redirect URI here, or sign-in will fail with `redirect_uri_mismatch`.

---

## 3. Enable Bedrock model access

1. In the AWS Console, open **Amazon Bedrock → Model access** in your region
   (default `us-east-1`).
2. Request/enable access to the Claude models Shetu uses:
   - Claude Sonnet 4.5
   - Claude Haiku 4.5 (used for lighter tasks)
3. Shetu invokes them through **cross-region inference profiles**
   (`us.anthropic.claude-sonnet-4-5-...`), which is the recommended path and
   avoids on-demand throughput errors.

---

## 4. Configure environment

Copy the example and fill it in:

```bash
cp .env.example .env.local
```

```ini
AUTH_URL=http://localhost:3000
AUTH_SECRET=         # openssl rand -base64 33
AUTH_GOOGLE_ID=      # from step 2
AUTH_GOOGLE_SECRET=  # from step 2
AWS_REGION=us-east-1
SHETU_MODEL_ID=us.anthropic.claude-sonnet-4-5-20250929-v1:0
SHETU_FAST_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0
SHETU_VAULT_BUCKET=shetu-vault     # real name is set by CDK in production
SHETU_TABLE_NAME=shetu-app         # real name is set by CDK in production
```

Generate a secret:

```bash
openssl rand -base64 33   # paste into AUTH_SECRET
```

AWS credentials come from your normal AWS CLI/SSO setup locally, and from the
App Runner instance role in production - never hard-coded.

---

## 5. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000, sign in with Google, and chat.

> Locally, the Vault and mentorship features talk to real S3/DynamoDB. For a
> pure local chat demo you can skip them, or deploy the infra first (step 7) and
> point `SHETU_VAULT_BUCKET` / `SHETU_TABLE_NAME` at the created resources.

---

## 6. Build the Docker image

```bash
docker build -t shetu:latest .
```

The image is a non-root Next.js standalone server listening on port 3000.

---

## 7. Deploy the infrastructure (AWS CDK)

The CDK app provisions S3, DynamoDB, ECR, the IAM instance role (scoped to
Bedrock invoke + this bucket + this table), and the App Runner service.

```bash
cd infra
npm install
npx cdk bootstrap            # first time only, per account/region
```

First deploy creates the ECR repo. Push the image to it, then deploy the
service:

```bash
# Get your account id and region
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGION=us-east-1

# Create the ECR repo via a first synth/deploy of just the repo, OR let the
# full deploy create it and then push + redeploy. Simplest path:
npx cdk deploy \
  -c authSecret="$(openssl rand -base64 33)" \
  -c googleId=YOUR_GOOGLE_CLIENT_ID \
  -c googleSecret=YOUR_GOOGLE_CLIENT_SECRET \
  -c appUrl=https://shetu.mol.la \
  -c imageTag=latest

# Note the EcrRepositoryUri output, then push the image:
aws ecr get-login-password --region $REGION \
  | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

docker tag shetu:latest <EcrRepositoryUri>:latest
docker push <EcrRepositoryUri>:latest
```

App Runner has `autoDeploymentsEnabled`, so pushing `:latest` triggers a rollout.
The stack output **AppRunnerServiceUrl** is your service host.

> For a hardened setup, move `authSecret` / `googleSecret` into AWS Secrets
> Manager and reference them in the stack instead of passing them as context.

---

## 8. Point shetu.mol.la at the service (Cloudflare)

App Runner gives you a default `*.awsapprunner.com` URL. To serve it at
`shetu.mol.la`:

1. In App Runner → your service → **Custom domains**, add `shetu.mol.la`. App
   Runner returns DNS validation records (CNAMEs) and a target.
2. Add the records in Cloudflare with `wrangler`, for example:

   ```bash
   # validation + the app CNAME (values come from the App Runner console)
   npx wrangler dns record create mol.la \
     --name shetu --type CNAME --content <service-host>.awsapprunner.com --proxied false
   ```

   Add any validation CNAMEs App Runner asks for the same way. Keep the record
   **DNS-only** (grey cloud) until the certificate validates; you can enable the
   proxy afterward if you want Cloudflare in front.
3. Wait for App Runner to show the custom domain as **Active** (certificate
   issued). Then `https://shetu.mol.la` serves the app.

Finally, confirm the Google OAuth client (step 2) has
`https://shetu.mol.la/api/auth/callback/google` as an authorised redirect URI,
and that `appUrl` / `AUTH_URL` is `https://shetu.mol.la`.

---

## Troubleshooting

- **`redirect_uri_mismatch` on sign-in** - the exact callback URL is not in the
  Google client's authorised redirect URIs. It must be
  `<AUTH_URL>/api/auth/callback/google`.
- **Bedrock `on-demand throughput isn't supported`** - use the `us.` inference
  profile IDs (already the default), not bare model IDs.
- **Bedrock `AccessDeniedException`** - model access not enabled for that model
  in that region, or the instance role lacks `bedrock:InvokeModel*`.
- **Vault upload fails in the browser** - the S3 bucket CORS `allowedOrigins`
  must include your app URL; the CDK stack sets this from `appUrl`.
