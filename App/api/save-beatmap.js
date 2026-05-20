import { sql } from '@vercel/postgres';

export default async function handler(request, response) {
  // POSTリクエストのみ許可
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const { video_id, author, title, beatmap_data } = request.body || {};

  // バリデーション
  if (!video_id || !beatmap_data) {
    return response.status(400).json({ error: 'Missing required fields: video_id and beatmap_data' });
  }

  try {
    const authorName = author && author.trim() !== '' ? author.trim().substring(0, 100) : 'Anonymous';
    const beatmapTitle = title && title.trim() !== '' ? title.trim().substring(0, 255) : '';

    // INSERT処理 (beatmap_dataオブジェクトをJSON文字列化して安全にバインドします)
    const result = await sql`
      INSERT INTO beatmaps (video_id, author, title, beatmap_data)
      VALUES (${video_id}, ${authorName}, ${beatmapTitle}, ${JSON.stringify(beatmap_data)})
      RETURNING id, created_at;
    `;

    return response.status(201).json({
      message: 'Beatmap saved successfully',
      id: result.rows[0].id,
      created_at: result.rows[0].created_at
    });
  } catch (error) {
    console.error('Save beatmap error:', error);
    return response.status(500).json({ error: error.message });
  }
}
