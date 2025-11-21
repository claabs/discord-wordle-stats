// Require the necessary discord.js classes
import { Client, Events, GatewayIntentBits, MessageFlags, OAuth2Scopes } from 'discord.js';

import { deployCommands, nicknameCommand, statsCommand } from './commands.ts';
import { botToken } from './config.ts';
import {
  handleAddNickname,
  handleListNicknames,
  handleRemoveNickname,
} from './handlers/nickname.ts';
import { handleStats } from './handlers/stats.ts';
import { logger } from './logger.ts';

import type { ChatInputCommandInteraction } from 'discord.js';

// Create a new client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
  ],
  allowedMentions: { parse: [] },
});

client.once(Events.ClientReady, async (readyClient) => {
  logger.info({ nickname: readyClient.user.tag }, 'Client ready');
  const inviteUrl = client.generateInvite({
    scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
    permissions: ['ViewChannel', 'ReadMessageHistory'],
  });
  logger.info({ inviteUrl }, 'Invite URL');
  await deployCommands(readyClient.user.id);
});

async function errorWrap(
  handler: (interaction: ChatInputCommandInteraction) => Promise<void>,
  interaction: ChatInputCommandInteraction,
) {
  try {
    await handler(interaction);
  } catch (err) {
    logger.error({ err }, 'Error handling interaction');
    const content =
      err instanceof Error ? err.message : 'There was an error while executing this command!';
    if (interaction.deferred) {
      await interaction.editReply({
        content,
      });
    } else {
      await interaction.reply({
        content,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === statsCommand.name) {
      await errorWrap(handleStats, interaction);
    } else if (interaction.commandName === nicknameCommand.name) {
      const sub = interaction.options.getSubcommand();
      if (sub === 'add') await errorWrap(handleAddNickname, interaction);
      else if (sub === 'remove') await errorWrap(handleRemoveNickname, interaction);
      else if (sub === 'list') await errorWrap(handleListNicknames, interaction);
    }
  }
});

// Log in to Discord with your client's token
client.login(botToken);
