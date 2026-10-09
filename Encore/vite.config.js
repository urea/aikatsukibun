import { defineConfig, loadEnv } from 'vite';
import { createSharedVideosHandler } from './server/shared-videos.js';
import { createNeonStore } from './server/neon-store.js';
import videoIds from './videos.json' with { type: 'json' };

// ローカルも公開版と同じAPIを使う。接続情報はフロントへ渡さない。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [{
      name: 'encore-shared-api',
      configureServer(server) {
        const handler = createSharedVideosHandler({
          store: createNeonStore(env.DATABASE_URL),
          reservedIds: videoIds,
          rateLimitSalt: env.DATABASE_URL,
          getClientAddress: request => request.headers.get('x-encore-dev-address') || 'local',
        });
        server.middlewares.use('/api/videos', async (request, response, next) => {
          if (request.url?.split('?')[0] !== '/' && request.url?.split('?')[0] !== '') return next();
          try {
            const chunks = [];
            let size = 0;
            for await (const chunk of request) {
              size += chunk.length;
              if (size <= 16384) chunks.push(chunk);
            }
            if (size > 16384) {
              response.writeHead(413, { 'Content-Type': 'application/json' });
              response.end(JSON.stringify({ error: '入力内容が大きすぎます。' }));
              return;
            }
            const headers = new Headers();
            for (const [key, value] of Object.entries(request.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
            headers.set('x-encore-dev-address', request.socket.remoteAddress || 'local');
            const method = request.method || 'GET';
            const result = await handler(new Request(`http://${request.headers.host}/api/videos`, {
              method, headers, ...(method === 'GET' || method === 'HEAD' ? {} : { body: Buffer.concat(chunks) }),
            }));
            response.writeHead(result.status, Object.fromEntries(result.headers));
            response.end(Buffer.from(await result.arrayBuffer()));
          } catch {
            response.writeHead(503, { 'Content-Type': 'application/json' });
            response.end(JSON.stringify({ error: '共有データに接続できませんでした。' }));
          }
        });
      },
    }],
  };
});
