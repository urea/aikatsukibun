import catalog from '../catalog.json' with { type: 'json' };
import { createSharedVideosHandler } from '../server/shared-videos.js';
import { createNeonStore } from '../server/neon-store.js';

let handler;
function handle(request) {
  if (!handler) {
    try {
      const connectionString = process.env.DATABASE_URL;
      handler = createSharedVideosHandler({
        store: createNeonStore(connectionString),
        reservedIds: Object.keys(catalog),
        rateLimitSalt: process.env.ENCORE_RATE_LIMIT_SALT || connectionString,
      });
    } catch {
      return Response.json({ error: '共有データを利用できません。時間をおいて、もう一度お試しください。' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
  }
  return handler(request);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
