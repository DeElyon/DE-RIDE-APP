import { neon } from '@neondatabase/serverless';
import { jwtVerify } from 'jose';
import { createRealtime, rawSql } from '@neon/realtime/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LiveQueryRequest = { kind?: 'support-messages' | 'disputes'; case_id?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const jwtSecret = process.env.JWT_ACCESS_SECRET;
    const realtimeSecret = process.env.NEON_REALTIME_SECRET;
    const databaseURL = process.env.DATABASE_URL;
    if (!token || !jwtSecret || jwtSecret.length < 32) return Response.json({ error: 'ERR_AUTH_REQUIRED' }, { status: 401 });
    if (!realtimeSecret || !databaseURL) return Response.json({ error: 'ERR_REALTIME_UNAVAILABLE' }, { status: 503 });

    const { payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret), { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || !UUID.test(payload.sub)) return Response.json({ error: 'ERR_INVALID_TOKEN' }, { status: 401 });
    const userID = payload.sub;
    const input = await request.json() as LiveQueryRequest;
    const database = neon(databaseURL);
    const realtime = createRealtime({ secret: realtimeSecret, db: decodeURIComponent(new URL(databaseURL).pathname.slice(1)) });

    if (input.kind === 'support-messages') {
      if (!input.case_id || !UUID.test(input.case_id)) return Response.json({ error: 'ERR_INVALID_REQUEST' }, { status: 400 });
      const accessible = await database`SELECT 1 FROM support_cases WHERE id=${input.case_id}::uuid AND requester_id=${userID}::uuid`;
      if (!accessible.length) return Response.json({ error: 'ERR_SUPPORT_CASE_NOT_FOUND' }, { status: 404 });
      const query = rawSql<{ id: string; sender_id: string; body: string; attachment_media_id: string | null; created_at: string }>(
        'SELECT id, sender_id, body, attachment_media_id, created_at FROM support_messages WHERE case_id = $1::uuid AND internal_note = false ORDER BY created_at ASC',
        [input.case_id],
      );
      return Response.json({ sealedQuery: await realtime.seal({ query }) });
    }

    if (input.kind === 'disputes') {
      const query = rawSql<{ id: string; reason: string; status: string; resolution: string | null; created_at: string; resolved_at: string | null }>(
        'SELECT id, reason, status, resolution, created_at, resolved_at FROM disputes WHERE opened_by = $1::uuid ORDER BY created_at DESC LIMIT 100',
        [userID],
      );
      return Response.json({ sealedQuery: await realtime.seal({ query }) });
    }

    return Response.json({ error: 'ERR_INVALID_REQUEST' }, { status: 400 });
  } catch {
    return Response.json({ error: 'ERR_REALTIME_UNAVAILABLE' }, { status: 503 });
  }
}
