/* eslint-disable no-restricted-syntax */
import { MessageFlags } from 'discord.js';

import { assertModerator } from './utils.ts';
import { addNickname, getAllNicknames, removeNickname } from '../data.ts';

import type { ChatInputCommandInteraction } from 'discord.js';
import type { Logger } from 'pino';

export async function handleAddNickname(
  interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
  logger: Logger,
): Promise<void> {
  const { guildId } = interaction;

  assertModerator(interaction);

  const user = interaction.options.getUser('user', true);
  const nickname = interaction.options.getString('nickname', true);

  logger.info({ nickname, userId: user.id }, 'Adding nickname');

  await addNickname(guildId, nickname, user.id);
  await interaction.reply({
    content: `Linked nickname "${nickname}" to <@${user.id}>.`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleRemoveNickname(
  interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
  logger: Logger,
): Promise<void> {
  const { guildId } = interaction;

  assertModerator(interaction);

  const nickname = interaction.options.getString('nickname', true);

  logger.info({ nickname }, 'Removing nickname');
  const removed = await removeNickname(guildId, nickname);
  if (removed) {
    await interaction.reply({
      content: `Removed nickname "${nickname}".`,
      flags: MessageFlags.Ephemeral,
    });
  } else {
    await interaction.reply({
      content: `Nickname "${nickname}" not found.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

export async function handleListNicknames(
  interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
  logger: Logger,
): Promise<void> {
  const { guildId } = interaction;

  logger.info('Listing nicknames');

  const all = await getAllNicknames(guildId);
  const entries = Object.entries(all);
  if (entries.length === 0) {
    await interaction.reply({
      content: 'No nicknames stored for this guild.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Group by userId
  const byUser: Record<string, string[]> = {};
  for (const [nickname, userId] of entries) {
    byUser[userId] ??= [];
    byUser[userId].push(nickname);
  }

  // Format output
  const blocks: string[] = [];
  for (const userId of Object.keys(byUser)) {
    const names = byUser[userId] ?? [];
    const mention = `<@${userId}>`;
    const formatted = names.map((n) => `\`${n}\``).join(', ');
    blocks.push(`${mention}: ${formatted}`);
  }
  const content = blocks.join('\n');

  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}
