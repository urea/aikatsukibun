import { sql } from '@vercel/postgres';

export default async function handler(request, response) {
  // GETリクエストのみ許可
  if (request.method !== 'GET') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const { video_id } = request.query || {};

  // 必須パラメータチェック
  if (!video_id) {
    return response.status(400).json({ error: 'Missing query parameter: video_id' });
  }

  try {
    // 特定の動画IDの譜面データを新しい順に取得
    const result = await sql`
      SELECT id, video_id, author, title, beatmap_data, created_at
      FROM beatmaps
      WHERE video_id = ${video_id}
      ORDER BY created_at DESC;
    `;

    return response.status(200).json(result.rows);
  } catch (error) {
    console.error('Get beatmaps error:', error);
    return response.status(500).json({ error: error.message });
  }
}
