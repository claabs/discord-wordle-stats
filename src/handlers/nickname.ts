/* eslint-disable no-restricted-syntax */
import { GuildMember, MessageFlags } from 'discord.js';

import { ownerId } from '../config.ts';
import { addNickname, getAllNicknames, removeNickname } from '../data/pouch.ts';

import type {
  APIInteractionGuildMember,
  ChatInputCommandInteraction,
  PermissionResolvable,
} from 'discord.js';

export function isModerator(member: GuildMember | APIInteractionGuildMember | null): boolean {
  const MODERATOR_PERMISSIONS: PermissionResolvable[] = [
    'Administrator',
    'ManageChannels',
    'KickMembers',
    'MoveMembers',
  ];
  if (!member) return false;
  if (member instanceof GuildMember) {
    return MODERATOR_PERMISSIONS.some((p) => member.permissions.has(p)) || ownerId === member.id;
  }
  return true;
}

export async function handleAddNickname(interaction: ChatInputCommandInteraction): Promise<void> {
  const { member, guildId } = interaction;

  if (!isModerator(member)) {
    await interaction.reply({
      content: 'You do not have permission to use this command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!guildId) {
    await interaction.reply({ content: 'This command must be used in a guild.', ephemeral: true });
    return;
  }

  const user = interaction.options.getUser('user', true);
  const nickname = interaction.options.getString('nickname', true);

  try {
    await addNickname(guildId, nickname, user.id);
    await interaction.reply({
      content: `Linked nickname "${nickname}" to <@${user.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to add nickname', err);
    await interaction.reply({
      content: 'Failed to add nickname. See logs for details.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

export async function handleRemoveNickname(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const { member, guildId } = interaction;

  if (!isModerator(member)) {
    await interaction.reply({
      content: 'You do not have permission to use this command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!guildId) {
    await interaction.reply({ content: 'This command must be used in a guild.', ephemeral: true });
    return;
  }

  const nickname = interaction.options.getString('nickname', true);
  try {
    const removed = await removeNickname(guildId, nickname);
    if (removed) {
      await interaction.reply({ content: `Removed nickname "${nickname}".`, ephemeral: true });
    } else {
      await interaction.reply({ content: `Nickname "${nickname}" not found.`, ephemeral: true });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to remove nickname', err);
    await interaction.reply({
      content: 'Failed to remove nickname. See logs for details.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

export async function handleListNicknames(interaction: ChatInputCommandInteraction): Promise<void> {
  const { guildId } = interaction;

  if (!guildId) {
    await interaction.reply({
      content: 'This command must be used in a guild.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

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
