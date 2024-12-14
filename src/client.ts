import Eris from 'eris';

import { onChannelCreate, onChannelDelete, onChannelUpdate, onGuildJoin, onGuildLeave, onWebhooksUpdate } from './events';
import { logger } from './logger';
import { start as startPoster } from './poster';

export const client = new Eris.Client(process.env.DISCORD_BOT_TOKEN, {
  gateway: {
    maxShards: 'auto',
    intents: ['guilds', 'guildWebhooks']
  },
  messageLimit: 0
});

// Events
client.on('ready', async () => {
  logger.info('All shards ready.');
  client.editStatus('online', { type: 4, name: 'taco', state: 'Watching Trello boards • tacobot.app' });
  await startPoster();
});
client.on('disconnect', () => logger.warn('All shards Disconnected.'));
client.on('reconnecting', () => logger.warn('Reconnecting client.'));
client.on('debug', (message) => logger.debug(message));

client.on('guildCreate', onGuildJoin);
client.on('guildDelete', onGuildLeave);
client.on('webhooksUpdate', onWebhooksUpdate);
client.on('channelCreate', onChannelCreate);
client.on('channelUpdate', onChannelUpdate);
client.on('channelDelete', onChannelDelete);

// Shard Events
client.on('connect', (id) => logger.info(`Shard ${id} connected.`));
client.on('error', (error, id) => logger.error(`Error in shard ${id}`, error));
client.on('hello', (_, id) => logger.debug(`Shard ${id} recieved hello.`));
client.on('warn', (message, id) => logger.warn(`Warning in Shard ${id}`, message));
client.on('shardReady', (id) => logger.info(`Shard ${id} ready.`));
client.on('shardResume', (id) => logger.warn(`Shard ${id} resumed.`));
client.on('shardDisconnect', (error, id) => logger.warn(`Shard ${id} disconnected`, error));
