/* eslint-disable no-continue */
/* eslint-disable no-restricted-syntax */
import { MessageFlags } from 'discord.js';

import {
  addNickname,
  addResult,
  getAllNicknames,
  getLatestTimestamp,
  getResults,
  getUniqueNicknamesFromResults,
  getUserIdFromNickname,
} from '../data/pouch.ts';
import { logger } from '../logger.ts';
import { assertGuild, assertTextChannel } from './utils.ts';

import type { ChannelType, ChatInputCommandInteraction, GuildMember } from 'discord.js';

import type { Winner } from '../data/pouch.ts';

const WORDLE_BOT_USER_ID = '1211781489931452447';
// Points assigned for a failed Wordle attempt (X)
const FAIL_SCORE = 7;

interface UserStats {
  sum: number;
  count: number;
  failCount: number;
  average: number;
  userIdOrNickname: string;
  isNickname: boolean;
}

interface ScoreResult {
  resultsCount: number;
  userStats: UserStats[];
}

async function calculateAverageScores(guildId: string, channelId: string): Promise<ScoreResult> {
  const results = await getResults(guildId, channelId);

  const acc: Record<
    string,
    { sum: number; count: number; failCount: number; isNickname: boolean }
  > = {};

  for (const result of results) {
    for (const winner of result.winners) {
      let userId: string | undefined;
      let isNickname = false;
      if ('id' in winner) {
        userId = winner.id;
      } else if ('nickname' in winner) {
        // eslint-disable-next-line no-await-in-loop
        const resolvedUserId = await getUserIdFromNickname(guildId, winner.nickname);
        isNickname = !resolvedUserId;
        userId = resolvedUserId ?? winner.nickname;
      }
      if (!userId) continue;
      const score = winner.score === 'X' ? FAIL_SCORE : winner.score;
      const entry = acc[userId] ?? { sum: 0, count: 0, failCount: 0, isNickname };
      entry.sum += score;
      entry.count += 1;
      entry.failCount += winner.score === 'X' ? 1 : 0;
      acc[userId] = entry;
    }
  }

  const userStats: UserStats[] = Object.entries(acc).map(([k, v]) => ({
    sum: v.sum,
    count: v.count,
    failCount: v.failCount,
    average: v.sum / v.count,
    userIdOrNickname: k,
    isNickname: v.isNickname,
  }));

  return {
    resultsCount: Object.keys(results).length,
    userStats,
  };
}

export async function handleStats(interaction: ChatInputCommandInteraction): Promise<void> {
  const { guildId } = interaction;
  assertGuild(guildId);

  // get the configured channel from the command
  const channel =
    interaction.options.getChannel<ChannelType.GuildText>('wordle-channel', false) ??
    interaction.channel;

  assertTextChannel(channel);

  const ignoreCache = interaction.options.getBoolean('ignore-cache', false) ?? false;

  const historyDays = interaction.options.getInteger('history-days', false);

  if (historyDays !== null && historyDays < 0) throw new Error('history-days must be positive');

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  });

  logger.info(
    { clearCache: ignoreCache, historyDays, guildId, channelId: channel.id },
    'Starting stats calculation',
  );

  const minDateTimestamp = historyDays
    ? Date.now() - historyDays * 24 * 60 * 60 * 1000
    : new Date('2025-05-01').getTime();

  const lastMessageTimestamp = ignoreCache ? 0 : await getLatestTimestamp(guildId, channel.id);

  let lastProcessedMessage: string | undefined;
  let processedMessagesCount = 0;
  let continueFetchingMessages = true;

  logger.debug({ lastMessageTimestamp }, 'Fetching message history');

  // We'll page through history in batches of 100 until we reach the last stored timestamp
  while (continueFetchingMessages) {
    // fetch messages; if beforeId is set, fetch messages before that id
    // use 100 per batch
    // eslint-disable-next-line no-await-in-loop
    const messageBatch = await channel.messages.fetch({ limit: 100, before: lastProcessedMessage });
    if (!messageBatch || messageBatch.size === 0) {
      continueFetchingMessages = false;
    }

    for (const msg of messageBatch.values()) {
      // stop when we hit a message older-or-equal to last stored timestamp
      if (msg.createdTimestamp <= lastMessageTimestamp || msg.createdTimestamp < minDateTimestamp) {
        // we've reached stored data; stop processing
        continueFetchingMessages = false;
        break;
      }

      // filter messages from the Wordle bot id and containing the expected marker
      if (msg.author.id !== WORDLE_BOT_USER_ID) {
        lastProcessedMessage = msg.id;
        continue;
      }
      const content = msg.content ?? '';
      if (!content.includes("Here are yesterday's results")) {
        lastProcessedMessage = msg.id;
        continue;
      }

      // parse lines like: "👑 3/6: @Nobody" or "4/6: @Batsy @wagcmassyla"
      const lines = content.split(/\r?\n/);

      const winners: Winner[] = [];

      for (const line of lines) {
        const scoreLineMatch = /^(?:\s*👑\s*)?(\d+|X)\/6:\s*(.+)$/.exec(line);
        if (!scoreLineMatch) continue;
        const scoreStr = scoreLineMatch[1];
        const score: number | 'X' = scoreStr === 'X' ? 'X' : Number(scoreStr);
        const playerList = scoreLineMatch[2];

        if (!playerList) continue;

        // collect mention tokens that appear in this line (they include ids)
        const mentionRegex = /<@!?(\d+)>/g;
        const rawMentionList = Array.from(playerList.matchAll(mentionRegex), (m) => m[1]);
        const mentionList = rawMentionList.filter((id): id is string => !!id);
        winners.push(...mentionList.map((id) => ({ id, score })));

        // Remove raw mention tokens (<@...>) from list so they don't interfere
        const remaining = (playerList ?? '').replace(/<@!?\d+>/g, '').trim();

        // Extract substrings that start with '@' up to the next '@' (allow spaces)
        const atGapRegex = /@([^@]+)/g;
        const nicknameMatch = atGapRegex.exec(remaining);
        const nicknameList = nicknameMatch?.slice(1) ?? [];
        winners.push(
          ...nicknameList
            .map((n) => n.trim())
            .filter(Boolean)
            .map((nickname) => ({ nickname, score })),
        );
      }

      // store the result using the message timestamp
      // eslint-disable-next-line no-await-in-loop
      await addResult({
        guildId,
        channelId: channel.id,
        timestamp: msg.createdTimestamp,
        content,
        winners,
        messageId: msg.id,
      });
      lastProcessedMessage = msg.id;

      processedMessagesCount += 1;
    }
  }

  logger.debug(
    { guildId, channelId: channel.id, processedMessagesCount },
    'Processed new Wordle results',
  );

  const allResultNicknames = await getUniqueNicknamesFromResults(guildId);

  const allStoredNicknames = new Set<string>(Object.keys(await getAllNicknames(guildId)));
  const unmatchedNicknames = allResultNicknames.difference(allStoredNicknames);

  const unresolvedNicknames: string[] = [];

  if (unmatchedNicknames.size > 0) {
    for (const nickname of Array.from(unmatchedNicknames)) {
      let matchedMember: GuildMember | undefined;
      for (const member of channel.members.values()) {
        if (member.nickname === nickname || member.displayName === nickname) {
          matchedMember = member;
          break;
        }
      }

      if (matchedMember) {
        // eslint-disable-next-line no-await-in-loop
        await addNickname(guildId, nickname, matchedMember.id);
      } else {
        unresolvedNicknames.push(nickname);
      }
    }
  }

  const scores = await calculateAverageScores(guildId, channel.id);

  const sortedUserStats = scores.userStats.sort((a, b) => a.average - b.average);

  const statsLines = sortedUserStats.map((stats, index) => {
    const rank = index + 1;
    const averageStr = stats.average.toFixed(3);
    const idDisplay = stats.isNickname ? stats.userIdOrNickname : `<@${stats.userIdOrNickname}>`;
    return `#${rank}: ${idDisplay} - Average Score: ${averageStr} (${stats.count} games, ${stats.failCount} fails)`;
  });

  const contentLines = [
    `Stats for ${scores.resultsCount} games (fails score as ${FAIL_SCORE}):`,
    ...statsLines,
  ];

  if (unresolvedNicknames.length) {
    contentLines.push(
      `These nicknames need to be manually matched: ${unresolvedNicknames.map((n) => `\`${n}\``).join(', ')}.`,
    );
  }
  await interaction.editReply({
    content: contentLines.join('\n'),
  });
}
