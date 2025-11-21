/* eslint-disable no-restricted-syntax */
import { MessageFlags } from 'discord.js';

import { assertGuild, assertModerator } from './utils.ts';
import { addNickname, getAllNicknames, removeNickname } from '../data/pouch.ts';

import type { ChatInputCommandInteraction } from 'discord.js';

export async function handleAddNickname(interaction: ChatInputCommandInteraction): Promise<void> {
  const { guildId } = interaction;

  assertGuild(guildId);
  assertModerator(interaction);

  const user = interaction.options.getUser('user', true);
  const nickname = interaction.options.getString('nickname', true);

  await addNickname(guildId, nickname, user.id);
  await interaction.reply({
    content: `Linked nickname "${nickname}" to <@${user.id}>.`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleRemoveNickname(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const { guildId } = interaction;

  assertGuild(guildId);
  assertModerator(interaction);

  const nickname = interaction.options.getString('nickname', true);
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

export async function handleListNicknames(interaction: ChatInputCommandInteraction): Promise<void> {
  const { guildId } = interaction;
  assertGuild(guildId);

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
