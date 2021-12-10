import { CronJob } from 'cron';
import Influx from 'influx';
import { logger } from './logger';
import { prisma } from './prisma';
import { client as erisClient } from './client';

export const client = new Influx.InfluxDB({
  database: process.env.INFLUX_DB_NAME,
  host: process.env.INFLUX_DB_HOST,
  port: parseInt(process.env.INFLUX_DB_PORT, 10),
  username: process.env.INFLUX_DB_USER,
  password: process.env.INFLUX_DB_PASSWORD,
  schema: [
    {
      measurement: 'shards',
      fields: {
        ms: Influx.FieldType.INTEGER,
        state: Influx.FieldType.STRING,
        guilds: Influx.FieldType.INTEGER
      },
      tags: ['bot', 'shard', 'cluster']
    },
    {
      measurement: 'websocket_counts',
      fields: {
        servers: Influx.FieldType.INTEGER,
        channels: Influx.FieldType.INTEGER,
        webhooks: Influx.FieldType.INTEGER,
        databaseUsers: Influx.FieldType.INTEGER,
        processMemUsage: Influx.FieldType.FLOAT
      },
      tags: ['bot', 'cluster']
    }
  ]
});

export const cron = new CronJob('*/5 * * * *', collect, null, false, 'America/New_York');

async function collect(timestamp = new Date()) {
  if (!process.env.INFLUX_DB_NAME) return;

  // Get postgres counts
  const dbUserCount = await prisma.user.count();
  const webhookCount = await prisma.webhook.count();

  const defaultTags = {
    bot: process.env.INFLUX_DB_BOT,
    cluster: process.env.INFLUX_DB_CLUSTER
  };
  const influxPoints: Influx.IPoint[] = [
    {
      measurement: 'websocket_counts',
      tags: {
        bot: process.env.INFLUX_DB_BOT,
        cluster: process.env.INFLUX_DB_CLUSTER
      },
      fields: {
        servers: erisClient.guilds.size,
        channels: erisClient.guilds.reduce((prev, val) => prev + val.channels.size, 0),
        webhooks: webhookCount,
        databaseUsers: dbUserCount,
        processMemUsage: process.memoryUsage().heapUsed / 1000000
      },
      timestamp: timestamp || cron.lastDate()
    }
  ];

  // Insert shard data
  const serverMap = {};
  this.client.guilds.map((guild) => {
    const shardID = guild.shard.id;
    if (serverMap[shardID]) serverMap[shardID] += 1;
    else serverMap[shardID] = 1;
  });

  erisClient.shards.map((shard) =>
    influxPoints.push({
      measurement: 'shards',
      tags: { ...defaultTags, shard: String(shard.id) },
      fields: {
        ms: isFinite(shard.latency) ? shard.latency : 0,
        state: shard.status,
        guilds: serverMap[shard.id]
      },
      timestamp
    })
  );

  // Send to influx
  await client.writePoints(influxPoints);
  logger.info('Sent stats to Influx.');
}
