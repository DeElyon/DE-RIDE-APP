import type { NextConfig } from 'next';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

const repoRoot = resolve(process.cwd(), '..');
const envFile = ['.env', '.env.local']
  .map((name) => resolve(repoRoot, name))
  .find((path) => existsSync(path));
if (envFile) loadDotenv({ path: envFile, override: false });

const config: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_NEON_AUTH_BASE_URL: process.env.NEON_AUTH_BASE_URL,
    NEXT_PUBLIC_NEON_REALTIME_URL: process.env.NEON_REALTIME_URL,
  },
};
export default config;
