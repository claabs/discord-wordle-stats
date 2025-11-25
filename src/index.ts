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
import { baseLogger } from './logger.ts';

import type { ChatInputCommandInteraction } from 'discord.js';
import type { Logger } from 'pino';

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
  baseLogger.info({ nickname: readyClient.user.tag }, 'Client ready');
  const inviteUrl = client.generateInvite({
    scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
    permissions: ['ViewChannel', 'ReadMessageHistory'],
  });
  baseLogger.info({ inviteUrl }, 'Invite URL');
  await deployCommands(readyClient.user.id);
});

async function handlerWrap(
  handler: (
    interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
    logger: Logger,
  ) => Promise<void>,
  interaction: ChatInputCommandInteraction,
) {
  const logger = baseLogger.child({ guildId: interaction.guildId, interactionId: interaction.id });
  try {
    if (!interaction.inGuild()) {
      throw new Error('This command can only be used in a guild');
    }
    await handler(interaction, logger);
  } catch (error) {
    logger.error({ error }, 'Error handling interaction');
    const content =
      error instanceof Error ? error.message : 'There was an error while executing this command!';
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
      await handlerWrap(handleStats, interaction);
    } else if (interaction.commandName === nicknameCommand.name) {
      const sub = interaction.options.getSubcommand();
      if (sub === 'add') await handlerWrap(handleAddNickname, interaction);
      else if (sub === 'remove') await handlerWrap(handleRemoveNickname, interaction);
      else if (sub === 'list') await handlerWrap(handleListNicknames, interaction);
    }
  }
});

// Log in to Discord with your client's token
client.login(botToken);
