'use client';

import { createAuthClient } from '@neon/auth';

let client: ReturnType<typeof createAuthClient> | undefined;

export function getNeonAuthClient() {
  const baseUrl = process.env.NEXT_PUBLIC_NEON_AUTH_BASE_URL;
  if (!baseUrl) throw new Error('NEXT_PUBLIC_NEON_AUTH_BASE_URL is not configured');
  client ??= createAuthClient(baseUrl);
  return client;
}
