import { sql } from '@vercel/postgres';

export default async function handler(request, response) {
  try {
    // 1. beatmaps テーブルの作成
    await sql`
      CREATE TABLE IF NOT EXISTS beatmaps (
        id SERIAL PRIMARY KEY,
        video_id VARCHAR(50) NOT NULL,
        author VARCHAR(100) NOT NULL DEFAULT 'Anonymous',
        title VARCHAR(255) DEFAULT '',
        beatmap_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // 2. 検索高速化インデックスの作成
    await sql`
      CREATE INDEX IF NOT EXISTS idx_beatmaps_video_id ON beatmaps(video_id);
    `;

    return response.status(200).json({ message: 'Database initialized successfully' });
  } catch (error) {
    console.error('Database init error:', error);
    return response.status(500).json({ error: error.message });
  }
}
