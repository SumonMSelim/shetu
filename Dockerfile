# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Shetu production image.
# Multi-stage build producing a small, non-root Next.js standalone server.
# The same image runs on AWS App Runner, ECS/Fargate, or anywhere else.
# ---------------------------------------------------------------------------

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build the standalone output. Next evaluates some server code during build and
# Auth.js wants a secret present, so a throwaway build-only value is supplied
# under a neutral name and mapped in just for the build. It is NOT a real secret
# and is not persisted in the final image (the runner stage never sets it).
ENV NEXT_TELEMETRY_DISABLED=1
ARG BUILD_PLACEHOLDER=build-only-not-a-secret
RUN AUTH_SECRET=$BUILD_PLACEHOLDER npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Run as an unprivileged user.
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# The standalone build bundles only the files needed to run.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# server.js is produced by Next's standalone output.
CMD ["node", "server.js"]
