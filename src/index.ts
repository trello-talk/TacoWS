import dotenv from 'dotenv';
import path from 'path';
import { Notifier } from '@airbrake/node';

let dotenvPath = path.join(process.cwd(), '.env');
if (path.parse(process.cwd()).name === 'dist') dotenvPath = path.join(process.cwd(), '..', '.env');
dotenv.config({ path: dotenvPath });

import { logger } from './logger';
import { client } from './client';
import { cron as influxCron } from './influx';
import { client as redisClient } from './redis';
import { prisma } from './prisma';

export let airbrake: Notifier | null = null;
if (process.env.AIRBRAKE_PROJECT_KEY)
  airbrake = new Notifier({
    projectId: parseInt(process.env.AIRBRAKE_PROJECT_ID, 10),
    projectKey: process.env.AIRBRAKE_PROJECT_KEY,
    environment: process.env.AIRBRAKE_ENV,
    keysBlocklist: [process.env.DISCORD_TOKEN, process.env.DATABASE_URL]
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
