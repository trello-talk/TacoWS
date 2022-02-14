import dotenv from 'dotenv';
import path from 'path';
import * as Sentry from '@sentry/node';
import '@sentry/tracing';
import { RewriteFrames } from '@sentry/integrations';

let dotenvPath = path.join(process.cwd(), '.env');
if (path.parse(process.cwd()).name === 'dist') dotenvPath = path.join(process.cwd(), '..', '.env');
dotenv.config({ path: dotenvPath });

import { logger } from './logger';
import { client } from './client';
import { cron as influxCron } from './influx';
import { client as redisClient } from './redis';
import { prisma } from './prisma';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new RewriteFrames({
      root: __dirname
    })
  ],

  environment: process.env.SENTRY_ENV || process.env.NODE_ENV || 'development',
  release: `taco-ws@${require('../../package.json').version}`,
  tracesSampleRate: process.env.SENTRY_SAMPLE_RATE ? parseFloat(process.env.SENTRY_SAMPLE_RATE) : 1.0
});

// SIGINT & uncaught exceptions
process.once('uncaughtException', async (err) => {
  logger.error('Uncaught Exception', err.stack);
  await disconnect();
  process.exit(0);
});

process.once('SIGINT', async () => {
  logger.info('Caught SIGINT');
  await disconnect();
  process.exit(0);
});

export async function start() {
  if (process.env.INFLUX_URL) influxCron.start();
  await redisClient.connect();
  await prisma.$connect();
  await client.connect();
}

export async function disconnect() {
  client.disconnect({ reconnect: false });
  redisClient.disconnect();
  influxCron.stop();
  await prisma.$disconnect();
}

start();
