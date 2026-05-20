export default function handler(request, response) {
  try {
    return response.status(200).json({
      status: "ok",
      nodeVersion: process.version,
      hasPostgresUrl: !!process.env.POSTGRES_URL,
      postgresUrlLength: process.env.POSTGRES_URL ? process.env.POSTGRES_URL.length : 0,
      envKeys: Object.keys(process.env).filter(k => k.includes('POSTGRES') || k.includes('DATABASE'))
    });
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}
