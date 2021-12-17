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
  if (process.env.INFLUX_DB_HOST) influxCron.start();
  await redisClient.connect();
  await client.connect();
  client.editStatus('online', {
    name: 'boards scroll by me',
    type: 3
  });
}

export async function disconnect() {
  client.disconnect({ reconnect: false });
  redisClient.disconnect();
  influxCron.stop();
}

start();
