import { Poster } from 'dbots';
import { logger } from './logger';
import { client } from './client';

export let poster: Poster | null = null;

export async function start() {
  const apiKeys: Record<string, string> = {
    discordbotsgg: process.env.DBOTS_BOTSGG,
    discordextremelist: process.env.DBOTS_EXTREMELIST,
    topgg: process.env.DBOTS_TOPGG,
    discords: process.env.DBOTS_DISCORDS,
    discordboats: process.env.DBOTS_BOATS,
    discordbotlist: process.env.DBOTS_BOTLIST
  };

  for (const key in apiKeys) {
    if (!apiKeys[key]) delete apiKeys[key];
  }

  if (Object.keys(apiKeys).length === 0) return void logger.info('No API keys found. Skipping poster');
  logger.info('Poster API Keys:', Object.keys(apiKeys).join(', '));

  poster = new Poster({
    client,
    apiKeys,
    clientLibrary: 'eris',
    useSharding: false,
    voiceConnections: () => 0
  });

  poster.addHandler('autopostSuccess', () => logger.info('Posted stats to all bot lists.'));
  poster.addHandler('autopostFail', (e) => logger.error('Failed to post stats to all bot lists.', e));
  poster.addHandler('postSuccess', () => logger.debug('Posted stats to a bot lists.'));
  poster.addHandler('postFail', (e) => logger.error('Failed to post stats to a bot list.', e));

  try {
    await poster.post();
  } catch (e) {
    logger.error('Failed to post.', e);
  }

  poster.startInterval();
  logger.info('Poster started.');
}
