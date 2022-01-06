import { CronJob } from 'cron';
import { InfluxDB, FieldType, IPoint } from 'influx';
import { logger } from './logger';
import { prisma } from './prisma';
import { client as erisClient } from './client';

export const client = new InfluxDB({
  database: process.env.INFLUX_DB_NAME || 'taco',
  host: process.env.INFLUX_DB_HOST,
  port: parseInt(process.env.INFLUX_DB_PORT, 10),
  username: process.env.INFLUX_DB_USER,
  password: process.env.INFLUX_DB_PASSWORD,
  schema: [
    {
      measurement: 'shards',
      fields: {
        ms: FieldType.INTEGER,
        state: FieldType.STRING,
        guilds: FieldType.INTEGER
      },
      tags: ['bot', 'shard', 'cluster']
    },
    {
      measurement: 'websocket_counts',
      fields: {
        servers: FieldType.INTEGER,
        channels: FieldType.INTEGER,
        webhooks: FieldType.INTEGER,
        databaseUsers: FieldType.INTEGER,
        processMemUsage: FieldType.FLOAT
      },
      tags: ['bot', 'cluster']
    }
  ]
});

export const cron = new CronJob('*/5 * * * *', collect, null, false, 'America/New_York');

async function collect(timestamp = new Date()) {
  if (!process.env.INFLUX_DB_HOST) return;

  // Get postgres counts
  const dbUserCount = await prisma.user.count();
  const webhookCount = await prisma.webhook.count();

  const defaultTags = {
    bot: process.env.INFLUX_DB_BOT,
    cluster: process.env.INFLUX_DB_CLUSTER
  };
  const influxPoints: IPoint[] = [
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
  erisClient.guilds.map((guild) => {
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
  logger.info('Sent stats to InfluxDB.');
}
