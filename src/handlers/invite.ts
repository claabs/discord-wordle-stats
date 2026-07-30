import { MessageFlags } from 'discord.js';

import { generateInviteUrl } from './utils.ts';

import type { ChatInputCommandInteraction } from 'discord.js';
import type { Logger } from 'pino';

export async function handleInvite(
  interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
  logger: Logger,
): Promise<void> {
  logger.info('Handling invite command');
  const url = generateInviteUrl(interaction.client);
  await interaction.reply({
    content: url,
    flags: MessageFlags.Ephemeral,
  });
}
