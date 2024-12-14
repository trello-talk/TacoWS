import { CronJob } from 'cron';
import Eris from 'eris';

import { logger } from './logger';
import { prisma } from './prisma';
import { client as redisClient } from './redis';

export function onGuildJoin(guild: Eris.Guild) {
  logger.info(`Joined guild ${guild.name} (${guild.id})`);
}

export async function onGuildLeave(guild: Eris.Guild) {
  logger.info(`Left guild ${guild.name} (${guild.id}, unavailable=${guild.unavailable})`);
  // deactivate guild webhooks
  if (!guild.unavailable)
    await prisma.webhook.updateMany({
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
  logger.debug(`Channel ${channel.id} created in ${channel.guild.id}`);
  redisClient.del(`discord.channels:${channel.guild.id}`);
}

export function onChannelUpdate(channel: Eris.AnyChannel) {
  if (channel.type !== 0 && channel.type !== 5) return;
  logger.debug(`Channel ${channel.id} updated in ${channel.guild.id}`);
  redisClient.del(`discord.channels:${channel.guild.id}`);
}

export function onChannelDelete(channel: Eris.AnyChannel) {
  if (channel.type !== 0 && channel.type !== 5) return;
  logger.debug(`Channel ${channel.id} deleted in ${channel.guild.id}`);
  redisClient.del(`discord.channels:${channel.guild.id}`);
}

const ENTITLEMENTS_ENABLED = !!process.env.DISCORD_SKU_TIER_1 && !!process.env.DISCORD_SKU_TIER_2;

export async function onEntitlementCreate(entitlement: Eris.Entitlement) {
  logger.info(`Entitlement ${entitlement.id} created (guild=${entitlement.guildID}, user=${entitlement.userID}, sku=${entitlement.skuID}, type=${entitlement.type})`);
  const active = entitlement.endsAt ? Date.now() < entitlement.endsAt : true;

  try {
    await prisma.discordEntitlement.create({
      data: {
        id: entitlement.id,
        skuId: entitlement.skuID,
        type: entitlement.type,
        guildId: entitlement.guildID,
        userId: entitlement.userID,
        active,
        startsAt: entitlement.startsAt ? new Date(entitlement.startsAt) : null,
        endsAt: entitlement.endsAt ? new Date(entitlement.endsAt) : null
      }
    });
  } catch (e) {
    if (!entitlement.startsAt) return;
    console.error(`Error while handling new entitlement [${entitlement.id}]`, e);
    return;
  }

  // Apply entitlement
  if ((entitlement.skuID === process.env.DISCORD_SKU_TIER_1 || entitlement.skuID === process.env.DISCORD_SKU_TIER_2) && entitlement.guildID && active && ENTITLEMENTS_ENABLED) {
    const maxWebhooks = entitlement.skuID === process.env.DISCORD_SKU_TIER_2 ? 200 : 20;
    logger.info(`Benefits for ${entitlement.guildID} updated (maxWebhooks=${maxWebhooks})`);
    await prisma.server.upsert({
      where: {
        serverID: entitlement.guildID
      },
      create: {
        serverID: entitlement.guildID,
        maxWebhooks
      },
      update: {
        maxWebhooks
      }
    });
  }

  if (process.env.DISCORD_ENTITLEMENT_WEBHOOK)
    await fetch(process.env.DISCORD_ENTITLEMENT_WEBHOOK, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: `https://discord.com/application-directory/${entitlement.applicationID}/store/${entitlement.skuID}`,
        embeds: [{
          title: `Entitlement Created${!entitlement.startsAt ? ' [Test]' : ''}`,
          color: 0x2ecc71,
          description: [
            `SKU: ${entitlement.skuID}`,
            `User ID: ${entitlement.userID ?? '<none>'}`,
            `Guild ID: ${entitlement.guildID ?? '<none>'}`,
            `Starts At: ${entitlement.startsAt ? `<t:${Math.round(new Date(entitlement.startsAt).valueOf() / 1000)}` : '<none>'}`,
            `Ends At: ${entitlement.endsAt ? `<t:${Math.round(new Date(entitlement.endsAt).valueOf() / 1000)}` : '<none>'}`,
            `Type: ${Eris.Constants.EntitlementTypes[entitlement.type] ?? '<unknown>'} (${entitlement.type})`
          ].join('\n')
        }]
      })
    }).catch(() => {});
}

export async function onEntitlementUpdate(entitlement: Eris.Entitlement) {
  logger.info(`Entitlement ${entitlement.id} updated (guild=${entitlement.guildID}, user=${entitlement.userID}, sku=${entitlement.skuID}, type=${entitlement.type})`);

  const active = entitlement.endsAt ? Date.now() < entitlement.endsAt : true;
  try {
    const dbEntitlement = await prisma.discordEntitlement.upsert({
      where: {
        id: entitlement.id
      },
      update: {
        active,
        startsAt: entitlement.startsAt ? new Date(entitlement.startsAt) : null,
        endsAt: entitlement.endsAt ? new Date(entitlement.endsAt) : null
      },
      create: {
        id: entitlement.id,
        skuId: entitlement.skuID,
        type: entitlement.type,
        guildId: entitlement.guildID,
        userId: entitlement.userID,
        active,
        startsAt: entitlement.startsAt ? new Date(entitlement.startsAt) : null,
        endsAt: entitlement.endsAt ? new Date(entitlement.endsAt) : null
      }
    });
    if (!dbEntitlement.active && dbEntitlement.guildId && ENTITLEMENTS_ENABLED) await updateGuildBenefits(dbEntitlement.guildId);
  } catch (e) {
    if (!entitlement.startsAt) return;
    console.error(`Error while updating entitlement [${entitlement.id}]`, e);
    return;
  }

  if (process.env.DISCORD_ENTITLEMENT_WEBHOOK)
    await fetch(process.env.DISCORD_ENTITLEMENT_WEBHOOK, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: `https://discord.com/application-directory/${entitlement.applicationID}/store/${entitlement.skuID}`,
        embeds: [{
          title: `Entitlement Updated${!entitlement.startsAt ? ' [Test]' : ''}`,
          color: 0xe67e22,
          description: [
            `SKU: ${entitlement.skuID}`,
            `User ID: ${entitlement.userID ?? '<none>'}`,
            `Guild ID: ${entitlement.guildID ?? '<none>'}`,
            `Starts At: ${entitlement.startsAt ? `<t:${Math.round(new Date(entitlement.startsAt).valueOf() / 1000)}` : '<none>'}`,
            `Ends At: ${entitlement.endsAt ? `<t:${Math.round(new Date(entitlement.endsAt).valueOf() / 1000)}` : '<none>'}`,
            `Type: ${Eris.Constants.EntitlementTypes[entitlement.type] ?? '<unknown>'} (${entitlement.type})`
          ].join('\n')
        }]
      })
    }).catch(() => {});
}

export async function onEntitlementDelete(entitlement: Eris.Entitlement) {
  logger.info(`Entitlement ${entitlement.id} deleted (guild=${entitlement.guildID}, user=${entitlement.userID}, sku=${entitlement.skuID}, type=${entitlement.type})`);

  try {
    const dbEntitlement = await prisma.discordEntitlement.delete({
      where: {
        id: entitlement.id
      }
    });

    if (dbEntitlement.guildId && ENTITLEMENTS_ENABLED) await updateGuildBenefits(dbEntitlement.guildId);
  } catch (e) {
    if (!entitlement.startsAt) return;
    console.error(`Error while deleting entitlement [${entitlement.id}]`, e);
    return;
  }

  if (process.env.DISCORD_ENTITLEMENT_WEBHOOK)
    await fetch(process.env.DISCORD_ENTITLEMENT_WEBHOOK, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: `https://discord.com/application-directory/${entitlement.applicationID}/store/${entitlement.skuID}`,
        embeds: [{
          title: `Entitlement Deleted${!entitlement.startsAt ? ' [Test]' : ''}`,
          color: 0xe74c3c,
          description: [
            `SKU: ${entitlement.skuID}`,
            `User ID: ${entitlement.userID ?? '<none>'}`,
            `Guild ID: ${entitlement.guildID ?? '<none>'}`,
            `Type: ${Eris.Constants.EntitlementTypes[entitlement.type] ?? '<unknown>'} (${entitlement.type})`
          ].join('\n')
        }]
      })
    }).catch(() => {});
}

async function updateGuildBenefits(guildId: string) {
  const now = new Date();
  const otherEntitlements = await prisma.discordEntitlement.findMany({
    where: {
      OR: [
        {
          guildId,
          active: true,
          endsAt: { lt: now }
        },
        {
          guildId,
          active: true,
          endsAt: null
        }
      ]
    }
  });

  const maxWebhooks =
    otherEntitlements.find((e) => e.skuId === process.env.DISCORD_SKU_TIER_2) ? 200 :
    otherEntitlements.find((e) => e.skuId === process.env.DISCORD_SKU_TIER_1) ? 20 :
    5;

  logger.info(`Benefits for ${guildId} updated (maxWebhooks=${maxWebhooks})`);
  await prisma.server.upsert({
    where: {
      serverID: guildId
    },
    create: {
      serverID: guildId,
      maxWebhooks
    },
    update: {
      maxWebhooks
    }
  });

  // Restrict webhooks
  const webhooks = await prisma.webhook.findMany({
    take: maxWebhooks,
    where: { guildID: guildId },
    orderBy: [{ createdAt: 'asc' }]
  });
  await prisma.webhook.updateMany({
    where: {
      guildID: guildId,
      id: { notIn: webhooks.map((w) => w.id) }
    },
    data: { active: false }
  });
}

const entitlementCron = new CronJob('*/5 * * * *', onEntitlementCron, null, true, 'America/New_York');

async function onEntitlementCron() {
  const expiredEntitlements = await prisma.discordEntitlement.findMany({
    where: {
      active: true,
      endsAt: { gte: new Date() }
    }
  });
  await prisma.discordEntitlement.updateMany({
    where: {
      active: true,
      id: { in: expiredEntitlements.map((e) => e.id) }
    },
    data: { active: false }
  });
  const guildsToUpdate: string[] = [...new Set(expiredEntitlements.map((e) => e.guildId))];

  for (const guildId of guildsToUpdate) {
    if (guildId) await updateGuildBenefits(guildId);
  }
}
