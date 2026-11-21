import { createHash } from 'node:crypto';
import { defineConfig, loadEnv } from 'vite';
import { createSharedVideosHandler } from './server/shared-videos.js';
import { createConfiguredStore, rateLimitSaltFor } from './server/configured-store.js';
import videoIds from './videos.json' with { type: 'json' };

function externalAssets(baseUrl) {
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
    throw new Error('ENCORE_ASSET_BASE_URL には公開用のHTTPS URLを設定してください。');
  }
  return {
    name: 'encore-external-assets',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const index = bundle['index.html'];
        if (typeof index?.source !== 'string') throw new Error('外部配信用のHTMLを確認できません。');
        // Viteは外部配信時も相対パスでビルドし、ファイルを両方の配信先に置けるようにする。
        const assetTags = /<(?:script|link)\b[^>]*\b(src|href)="(\.\/assets\/[\w.-]+)"[^>]*>/g;
        const fallBackScript = `<script>document.addEventListener('error', (event) => {
  const asset = event.target;
  const path = asset instanceof Element && asset.getAttribute('data-local-asset');
  if (!path) return;
  asset.removeAttribute('data-local-asset');
  if (asset instanceof HTMLScriptElement) {
    const localScript = document.createElement('script');
    localScript.type = asset.type;
    localScript.src = path;
    localScript.integrity = asset.integrity;
    document.head.append(localScript);
  } else {
    asset.href = path;
  }
}, true);</script>`;
        index.source = index.source.replace(assetTags, (tag, attribute, path) => {
          const remote = new URL(path, base).href.replaceAll('&', '&amp;');
          let replacement = `${attribute}="${remote}" data-local-asset="${path.slice(1)}"`;
          if (/\.(?:css|js)$/.test(path)) {
            const asset = bundle[path.slice(2)];
            const bytes = asset?.type === 'chunk' ? asset.code : asset?.source;
            const hash = createHash('sha384').update(bytes).digest('base64');
            replacement += ` integrity="sha384-${hash}"`;
          }
          return tag.replace(`${attribute}="${path}"`, replacement);
        }).replace(/<meta charset="UTF-8"\s*\/>/, charset => `${charset}\n  ${fallBackScript}`);
      },
    },
  };
}

// ローカルも公開版と同じAPIを使う。接続情報はフロントへ渡さない。
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const assetBaseUrl = command === 'build' && env.ENCORE_ASSET_BASE_URL?.trim();
  return {
    ...(assetBaseUrl ? { base: './' } : {}),
    plugins: [{
      name: 'encore-shared-api',
      configureServer(server) {
        const handler = createSharedVideosHandler({
          store: createConfiguredStore(env),
          reservedIds: videoIds,
          rateLimitSalt: rateLimitSaltFor(env),
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
            const queryIndex = request.url?.indexOf('?') ?? -1;
            const query = queryIndex < 0 ? '' : request.url.slice(queryIndex);
            const result = await handler(new Request(`http://${request.headers.host}/api/videos${query}`, {
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
    }, ...(assetBaseUrl ? [externalAssets(assetBaseUrl)] : [])],
  };
});
