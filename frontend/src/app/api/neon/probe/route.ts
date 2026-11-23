import { neon } from '@neondatabase/serverless';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { jwtVerify } from 'jose';
import { createRealtime, rawSql } from '@neon/realtime/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Service = 'postgres' | 'ai-gateway' | 'object-storage' | 'functions' | 'realtime';

async function requireUser(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!token || !secret || secret.length < 32) throw new Error('Authentication is not configured');
  await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] });
}

function databaseName() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return decodeURIComponent(new URL(url).pathname.slice(1));
}

export async function POST(request: Request) {
  try {
    await requireUser(request);
    const { service } = (await request.json()) as { service?: Service };

    if (service === 'postgres') {
      if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
      const sql = neon(process.env.DATABASE_URL);
      const [row] = await sql`select current_database() as database, 1 as connected`;
      return Response.json({ service, ...row });
    }

    if (service === 'ai-gateway') {
      const baseUrl = process.env.NEON_AI_GATEWAY_BASE_URL;
      const token = process.env.NEON_AI_GATEWAY_TOKEN;
      if (!baseUrl || !token) throw new Error('Neon AI Gateway is not configured');
      const response = await fetch(`${baseUrl}/v1/models`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(`AI Gateway models returned ${response.status}: ${JSON.stringify(payload)}`);
      const models = Array.isArray(payload.data) ? payload.data : [];
      const enabled = models.find((model: { enabled?: boolean }) => model.enabled);
      if (!enabled) return Response.json({ service, connected: true, inference: false, modelCount: models.length, reason: 'No model is enabled for this account. Add AI Gateway credits in Neon to run inference.' });
      const completion = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: enabled.id, messages: [{ role: 'user', content: 'Reply with exactly: Amebo is online.' }], max_tokens: 30 }),
      });
      const completionBody = await completion.json();
      if (!completion.ok) throw new Error(`AI Gateway inference returned ${completion.status}: ${JSON.stringify(completionBody)}`);
      return Response.json({ service, connected: true, inference: true, model: enabled.id, response: completionBody.choices?.[0]?.message?.content ?? '' });
    }

    if (service === 'object-storage') {
      const bucket = process.env.NEON_BUCKET_NAME ?? 'assets';
      const key = `health-check/${crypto.randomUUID()}.txt`;
      const expected = `DE RIDE Neon storage ${key}`;
      const s3 = new S3Client({ forcePathStyle: true });
      try {
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: expected, ContentType: 'text/plain' }));
        const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const actual = await object.Body?.transformToString();
        if (actual !== expected) throw new Error('Uploaded object did not match downloaded object');
        return Response.json({ service, connected: true, roundTrip: true, bucket });
      } finally {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
        s3.destroy();
      }
    }

    if (service === 'functions') {
      const functionUrl = process.env.NEON_HELLO_FUNCTION_URL;
      if (!functionUrl) throw new Error('NEON_HELLO_FUNCTION_URL is not configured');
      const response = await fetch(functionUrl, { cache: 'no-store' });
      const body = await response.text();
      if (!response.ok) throw new Error(`Neon Function returned ${response.status}: ${body}`);
      return Response.json({ service, connected: true, response: body });
    }

    if (service === 'realtime') {
      const secret = process.env.NEON_REALTIME_SECRET;
      if (!secret) throw new Error('NEON_REALTIME_SECRET is not configured');
      const realtime = createRealtime({ secret, db: databaseName() });
      const query = rawSql<{ id: number; message: string }>("SELECT 1 AS id, 'Neon Realtime connected' AS message");
      const sealedQuery = await realtime.seal({ query });
      return Response.json({ service, sealedQuery });
    }

    return Response.json({ error: 'Unknown service' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Neon service check failed';
    return Response.json({ error: message }, { status: 502 });
  }
}
