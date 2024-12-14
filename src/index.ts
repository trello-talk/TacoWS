/* eslint-disable import/first */
import '@sentry/tracing';

import { RewriteFrames } from '@sentry/integrations';
import * as Sentry from '@sentry/node';
import dotenv from 'dotenv';
import path from 'path';

let dotenvPath = path.join(process.cwd(), '.env');
if (path.parse(process.cwd()).name === 'dist') dotenvPath = path.join(process.cwd(), '..', '.env');
dotenv.config({ path: dotenvPath });

import { client } from './client';
import { cron as influxCron } from './influx';
import { logger } from './logger';
import { poster } from './poster';
import { prisma } from './prisma';
import { client as redisClient } from './redis';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new RewriteFrames({
      root: __dirname
    })
  ],

  environment: process.env.SENTRY_ENV || process.env.NODE_ENV || 'development',
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  release: `taco-ws@${require('../package.json').version}`,
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
  logger.info('Starting...');
  if (process.env.INFLUX_URL) influxCron.start();
  logger.info('Connecting to Redis...');
  await redisClient.connect();
  logger.info('Connecting to db...');
  await prisma.$connect();
  logger.info('Connecting to Discord...');
  await client.connect();
  logger.info('Ready!');
}

export async function disconnect() {
  client.disconnect({ reconnect: false });
  redisClient.disconnect();
  influxCron.stop();
  await prisma.$disconnect();
  poster?.stopInterval();
}

start();
