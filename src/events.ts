import Eris from 'eris';
import { logger } from './logger';
import { prisma } from './prisma';
import { client as redisClient } from './redis';

export function onGuildJoin(guild: Eris.Guild) {
  logger.info(`Joined guild ${guild.name} (${guild.id})`);
}

export function onGuildLeave(guild: Eris.Guild) {
  logger.info(`Left guild ${guild.name} (${guild.id})`);
  // deactivate guild webhooks
  prisma.webhook.updateMany({
    where: { guildID: guild.id },
    data: { active: false }
  });
}

interface WebhooksUpdateEvent {
  guildID: string;
  channelID: string;
}

export function onWebhooksUpdate({ channelID, guildID }: WebhooksUpdateEvent) {
  logger.info(`Webhooks updated in ${guildID} (channel ${channelID})`);
  redisClient.del(`discord.webhooks:${guildID}`);
}

export function onChannelCreate(channel: Eris.AnyChannel) {
  if (channel.type !== 0 && channel.type !== 5) return;
  logger.info(`Channel ${channel.id} created in ${channel.guild.id}`);
  redisClient.del(`discord.channels:${channel.guild.id}`);
}

export function onChannelUpdate(channel: Eris.AnyChannel) {
  if (channel.type !== 0 && channel.type !== 5) return;
  logger.info(`Channel ${channel.id} updated in ${channel.guild.id}`);
  redisClient.del(`discord.channels:${channel.guild.id}`);
}

export function onChannelDelete(channel: Eris.AnyChannel) {
  if (channel.type !== 0 && channel.type !== 5) return;
  logger.info(`Channel ${channel.id} deleted in ${channel.guild.id}`);
  redisClient.del(`discord.channels:${channel.guild.id}`);
}
