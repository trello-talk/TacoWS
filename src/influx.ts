import { InfluxDB, Point } from '@influxdata/influxdb-client';
import { CronJob } from 'cron';
import { hostname } from 'os';

import { client as erisClient } from './client';
import { logger } from './logger';
import { prisma } from './prisma';

export const client = process.env.INFLUX_URL ? new InfluxDB({ url: process.env.INFLUX_URL, token: process.env.INFLUX_TOKEN }) : null;

export const cron = new CronJob('*/5 * * * *', collect, null, false, 'America/New_York');

async function collect() {
  if (!process.env.INFLUX_URL || !process.env.INFLUX_TOKEN) return;
  const timestamp = cron.lastDate();

  // Get postgres counts
  const dbUserCount = await prisma.user.count();
  const webhookCount = await prisma.webhook.count();

  const writeApi = client.getWriteApi(process.env.INFLUX_ORG, process.env.INFLUX_BUCKET, 's');
  const points = [
    new Point('webhook_traffic')
      .tag('server', process.env.SERVER_NAME || hostname())
      .tag('bot', process.env.BOT_NAME || 'taco')
      .intField('servers', erisClient.guilds.size)
      .intField(
        'channels',
        erisClient.guilds.reduce((prev, val) => prev + val.channels.size, 0)
      )
      .intField('webhooks', webhookCount)
      .intField('databaseUsers', dbUserCount)
      .intField('processMemUsage', process.memoryUsage().heapUsed / 1000000)
      .timestamp(timestamp)
  ];

  // Insert shard data
  const serverMap = {};
  erisClient.guilds.map((guild) => {
    const shardID = guild.shard.id;
    if (serverMap[shardID]) serverMap[shardID] += 1;
    else serverMap[shardID] = 1;
  });

  erisClient.shards.map((shard) =>
    points.push(
      new Point('shards')
        .tag('server', process.env.SERVER_NAME || hostname())
        .tag('bot', process.env.BOT_NAME || 'taco')
        .tag('shard', String(shard.id))
        .intField('ms', isFinite(shard.latency) ? shard.latency : 0)
        .stringField('status', shard.status || 'unknown')
        .intField('guilds', serverMap[shard.id])
        .timestamp(timestamp)
    )
  );

  // Send to influx
  try {
    writeApi.writePoints(points);
    await writeApi.close();
    logger.log('Sent stats to Influx.');
  } catch (e) {
    logger.error('Error sending stats to Influx.', e);
  }
}
