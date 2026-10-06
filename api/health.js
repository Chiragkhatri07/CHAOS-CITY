export default function handler(_request, response) {
  const redisReady = Boolean(process.env.REDIS_URL);
  response.status(redisReady ? 200 : 503).json({
    ok: redisReady,
    sharedState: redisReady,
    service: 'chaos-city'
  });
}
