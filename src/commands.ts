import { ChannelType, REST, Routes, SlashCommandBuilder } from 'discord.js';

import { botToken } from './config.ts';

export const statsCommand = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Get Wordle stats')
  .addChannelOption((channel) =>
    channel
      .setName('wordle-channel')
      .setDescription('Your Wordle text channel. The default is this channel.')
      .setRequired(false)
      .addChannelTypes(ChannelType.GuildText),
  )
  .addBooleanOption((option) =>
    option
      .setName('ignore-cache')
      .setDescription('If true, forces reprocessing of all messages in the channel')
      .setRequired(false),
  )
  .addIntegerOption((option) =>
    option
      .setName('history-days')
      .setDescription(
        'Number of days back the message history should be read. Defaults to read until 2025-05-01.',
      )
      .setRequired(false),
  );

export const nicknameCommand = new SlashCommandBuilder()
  .setName('nickname')
  .setDescription('Manage nickname mappings')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Link a past nickname to a user')
      .addUserOption((user) =>
        user.setName('user').setDescription('The user to link the nickname to').setRequired(true),
      )
      .addStringOption((nickname) =>
        nickname
          .setName('nickname')
          .setDescription('The nickname to link to the user')
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove a linked nickname')
      .addStringOption((nickname) =>
        nickname.setName('nickname').setDescription('The nickname to remove').setRequired(true),
      ),
  )
  .addSubcommand((sub) => sub.setName('list').setDescription('List all nicknames'));

const commands = [statsCommand.toJSON(), nicknameCommand.toJSON()];

export async function deployCommands(clientId: string): Promise<void> {
  const rest = new REST().setToken(botToken);
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
}
