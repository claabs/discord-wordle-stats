// Require the necessary discord.js classes
import { Client, Events, GatewayIntentBits, OAuth2Scopes } from 'discord.js';

import { deployCommands, nicknameCommand, statsCommand } from './commands.ts';
import { botToken } from './config.ts';
import {
  handleAddNickname,
  handleListNicknames,
  handleRemoveNickname,
} from './handlers/nickname.ts';
import { handleStats } from './handlers/stats.ts';
import { logger } from './logger.ts';

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

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === statsCommand.name) {
      await handleStats(interaction);
    } else if (interaction.commandName === nicknameCommand.name) {
      const sub = interaction.options.getSubcommand();
      if (sub === 'add') await handleAddNickname(interaction);
      else if (sub === 'remove') await handleRemoveNickname(interaction);
      else if (sub === 'list') await handleListNicknames(interaction);
    }
  }
});

// Log in to Discord with your client's token
client.login(botToken);
