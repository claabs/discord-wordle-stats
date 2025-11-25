import { MessageFlags } from 'discord.js';

import { assertModerator } from './utils.ts';
import { addNickname, getAllUserNicknames, removeNickname } from '../data.ts';

import type { ChatInputCommandInteraction } from 'discord.js';
import type { Logger } from 'pino';

export interface UserNicknames {
  userId: string;
  nicknames: string[];
}

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

function formatUserNicknames(userNicknames: UserNicknames): string {
  const { userId, nicknames } = userNicknames;
  const mention = `<@${userId}>`;
  const formatted = nicknames.map((n) => `\`${n}\``).join(', ');
  return `${mention}: ${formatted}`;
}

export async function handleListNicknames(
  interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
  logger: Logger,
): Promise<void> {
  const { guildId } = interaction;

  logger.info('Listing nicknames');

  const startTokenUser = interaction.options.getUser('start-token', false);

  const userNicknames = await getAllUserNicknames(guildId, startTokenUser?.id);
  if (!userNicknames.length) {
    await interaction.reply({
      content: 'No nicknames stored for this guild.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const contentLines: string[] = [];

  // eslint-disable-next-line no-restricted-syntax
  for (const userNickname of userNicknames) {
    contentLines.push(formatUserNicknames(userNickname));
    if (contentLines.join('\n').length > 2000) {
      contentLines.pop();
      break;
    }
  }

  await interaction.reply({ content: contentLines.join('\n'), flags: MessageFlags.Ephemeral });
}
