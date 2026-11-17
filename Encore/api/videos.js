import catalog from '../catalog.json' with { type: 'json' };
import { createSharedVideosHandler } from '../server/shared-videos.js';
import { createConfiguredStore, rateLimitSaltFor, usesD1 } from '../server/configured-store.js';
import { createPublicationSnapshot } from '../server/publication-snapshot.js';

let handler;
function handle(request) {
  if (!handler) {
    try {
      const config = process.env;
      const d1 = usesD1(config);
      const storeId = d1 ? config.ENCORE_D1_BLOB_STORE_ID : config.BLOB_STORE_ID;
      const token = d1 ? config.ENCORE_D1_BLOB_READ_WRITE_TOKEN : config.BLOB_READ_WRITE_TOKEN;
      const pathname = d1 ? config.ENCORE_D1_BLOB_PATHNAME : undefined;
      const snapshot = storeId || token ? createPublicationSnapshot({ storeId, token, pathname }) : undefined;
      handler = createSharedVideosHandler({
        store: createConfiguredStore(config),
        snapshot,
        reservedIds: Object.keys(catalog),
        rateLimitSalt: rateLimitSaltFor(config),
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
