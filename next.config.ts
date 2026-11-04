import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained build for the Docker image / App Runner.
  output: "standalone",
  // The Strands SDK and AWS SDK are server-only; keep them external to the
  // client bundle and let Node resolve them at runtime.
  serverExternalPackages: ["@strands-agents/sdk"],
  experimental: {
    // Chat streaming relies on long-lived server responses.
    proxyTimeout: 120_000,
  },
};

export default nextConfig;
