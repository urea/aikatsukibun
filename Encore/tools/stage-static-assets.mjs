import { cp, mkdir, writeFile } from 'node:fs/promises';

const source = new URL('../dist/assets/', import.meta.url);
const destination = new URL('../../output/encore-static-host/', import.meta.url);

await mkdir(destination, { recursive: true });
// 配信済みHTMLが参照している過去のハッシュ付きファイルも残す。
await cp(source, new URL('assets/', destination), { recursive: true });
await writeFile(new URL('_headers', destination), `/assets/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=31536000, immutable
  X-Content-Type-Options: nosniff
`);
