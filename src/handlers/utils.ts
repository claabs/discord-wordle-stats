import { GuildMember, TextChannel } from 'discord.js';

import { ownerId } from '../config.ts';

import type {
  ChatInputCommandInteraction,
  PermissionResolvable,
  TextBasedChannel,
} from 'discord.js';

export function assertModerator(interaction: ChatInputCommandInteraction): void {
  const { member } = interaction;
  const MODERATOR_PERMISSIONS: PermissionResolvable[] = [
    'Administrator',
    'ManageChannels',
    'KickMembers',
    'MoveMembers',
  ];
  let isModerator = false;
  if (member instanceof GuildMember) {
    isModerator =
      MODERATOR_PERMISSIONS.some((p) => member.permissions.has(p)) || ownerId === member.id;
  }
  if (!isModerator) throw new Error('You do not have permission to use this command');
}

export function assertGuild(guildId: string | null): asserts guildId is string {
  if (!guildId) {
    throw new Error('This command must be used in a guild');
  }
}

export function assertTextChannel(
  channel: TextBasedChannel | null,
): asserts channel is TextChannel {
  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error('Missing or invalid channel type');
  }
}
