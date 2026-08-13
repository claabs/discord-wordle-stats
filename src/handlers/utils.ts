import { GuildMember, OAuth2Scopes, PermissionFlagsBits, TextChannel } from 'discord.js';

import { ownerId } from '../config.ts';

import type {
  Channel,
  ChatInputCommandInteraction,
  Client,
  Message,
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

export function assertTextChannel(
  channel: TextBasedChannel | null,
): asserts channel is TextChannel {
  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error('Missing or invalid channel type');
  }
}
export const WORDLE_BOT_USER_ID = '1211781489931452447';

export function isScoreSummaryMessage(msg: Message): boolean {
  return (
    msg.author.id === WORDLE_BOT_USER_ID && msg.content.includes("Here are yesterday's results")
  );
}

export function canSendMessage(channel: Channel | null): boolean {
  if (!(channel instanceof TextChannel)) return false;
  const botMember = channel.guild.members.me;
  if (!botMember) return false;
  const permissions = channel.permissionsFor(botMember);
  return (
    permissions.has(PermissionFlagsBits.ViewChannel) &&
    permissions.has(PermissionFlagsBits.SendMessages)
  );
}

export function generateInviteUrl(client: Client<true>): string {
  return client.generateInvite({
    scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
    permissions: ['ViewChannel', 'ReadMessageHistory', 'SendMessages'],
  });
}
