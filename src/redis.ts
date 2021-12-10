import Redis from 'ioredis';

export const client = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  keyPrefix: process.env.REDIS_PREFIX,
  password: process.env.REDIS_PASSWORD,
  lazyConnect: true
});
