import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: [
    '@anthropic-ai/sdk',
    '@google/genai',
    '@aws-sdk/client-bedrock-runtime',
    '@modelcontextprotocol/sdk',
    'better-sqlite3',
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  webpack(config: any) {
    config.module.rules.push({
      test: /\.ya?ml$/,
      type: 'asset/source',
    });
    return config;
  },
};

export default nextConfig;
