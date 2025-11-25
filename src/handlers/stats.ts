import { MessageFlags } from 'discord.js';

import { assertTextChannel } from './utils.ts';
import { isDev } from '../config.ts';
import {
  addNicknames,
  addResults,
  getAllNicknamesIn,
  getLastMessageId,
  getResults,
  getUserIdsFromNicknames,
  setLastMessageId,
} from '../data.ts';

import type {
  ChannelType,
  ChatInputCommandInteraction,
  FetchMessagesOptions,
  TextChannel,
} from 'discord.js';
import type { Logger } from 'pino';

import type { NicknameEntry, ResultDoc, Winner } from '../data.ts';

const WORDLE_BOT_USER_ID = '1211781489931452447';
// Points assigned for a failed Wordle attempt (X)
const DEFAULT_FAIL_SCORE = 7;

interface UserStats {
  sum: number;
  count: number;
  failCount: number;
  average: number;
  userIdOrNickname: string;
  isNickname: boolean;
}

/**
 * parse lines like: "👑 3/6: @nobody" or "4/6: @whatever @whatsup"
 */
function parseWinners(content: string): Winner[] {
  const lines = content.split(/\r?\n/);

  return lines.flatMap((line) => {
    const scoreLineMatch = /^(?:\s*👑\s*)?(\d+|X)\/6:\s*(.+)$/.exec(line);
    if (!scoreLineMatch) return [];
    const scoreStr = scoreLineMatch[1];
    const score: number | 'X' = scoreStr === 'X' ? 'X' : Number(scoreStr);
    const playerList = scoreLineMatch[2];

    if (!playerList) return [];

    // collect mention tokens that appear in this line (they include ids)
    const mentionRegex = /<@!?(\d+)>/g;
    const rawMentionList = Array.from(playerList.matchAll(mentionRegex), (m) => m[1]);
    const mentionList = rawMentionList.filter((id): id is string => !!id);
    const lineWinners: Winner[] = mentionList.map((id) => ({ id, score }));

    // Remove raw mention tokens (<@...>) from list so they don't interfere
    const remaining = (playerList ?? '').replaceAll(/<@!?\d+>/g, '').trim();

    // Extract substrings that start with '@' up to the next '@' (allow spaces)
    const atGapRegex = /@([^@]+)/g;
    const rawNicknameList = Array.from(remaining.matchAll(atGapRegex), (m) => m[1]);
    const nicknameList = rawNicknameList.filter((id): id is string => !!id);
    lineWinners.push(
      ...nicknameList
        .map((n) => n.trim())
        .filter(Boolean)
        .map((nickname) => ({ nickname, score })),
    );
    return lineWinners;
  });
}

function maxString(a: string, b: string): string {
  return a > b ? a : b;
}

async function matchNicknames(
  results: ResultDoc[],
  guildId: string,
  channel: TextChannel,
): Promise<string[]> {
  const allResultNicknames = new Set<string>();
  for (const result of results) {
    const winners = result.winners ?? [];
    for (const w of winners) {
      if ('nickname' in w) {
        allResultNicknames.add(w.nickname);
      }
    }
  }

  const storedNicknames = await getAllNicknamesIn(guildId, allResultNicknames);
  const unmatchedNicknames = allResultNicknames.difference(storedNicknames);

  if (unmatchedNicknames.size === 0) {
    return [];
  }

  const matchResults = await Promise.all(
    [...unmatchedNicknames].map(async (nickname) => {
      // Try cached members first
      let matchedMember = channel.members.find(
        (member) => member.nickname === nickname || member.displayName === nickname,
      );
      if (matchedMember) return { newNicknameEntry: { nickname, userId: matchedMember.id } };

      // Then query guild members
      const queryResults = await channel.guild.members.fetch({ query: nickname, limit: 1 });
      matchedMember = queryResults.find(
        (member) => member.nickname === nickname || member.displayName === nickname,
      );
      if (matchedMember) return { newNicknameEntry: { nickname, userId: matchedMember.id } };

      // No match found
      return { unresolvedNickname: nickname };
    }),
  );

  const newNicknameEntries = matchResults
    .map((res) => res.newNicknameEntry)
    .filter((e): e is NicknameEntry => !!e);
  await addNicknames(guildId, newNicknameEntries);

  return matchResults.map((match) => match.unresolvedNickname).filter((n): n is string => !!n);
}

async function calculateAverageScores(
  results: ResultDoc[],
  guildId: string,
  failScore: number,
): Promise<UserStats[]> {
  const acc: Record<
    string,
    { sum: number; count: number; failCount: number; isNickname: boolean }
  > = {};

  const unresolvedNicknames = new Set<string>();
  for (const result of results) {
    for (const winner of result.winners) {
      if ('nickname' in winner) {
        unresolvedNicknames.add(winner.nickname);
      }
    }
  }

  const nicknameToUserId: Record<string, string> = await getUserIdsFromNicknames(guildId, [
    ...unresolvedNicknames,
  ]);

  for (const result of results) {
    for (const winner of result.winners) {
      let userId: string | undefined;
      let isNickname = false;
      if ('id' in winner) {
        userId = winner.id;
      } else if ('nickname' in winner) {
        const resolvedUserId = nicknameToUserId[winner.nickname];
        isNickname = !resolvedUserId;
        userId = resolvedUserId ?? winner.nickname;
      }
      if (userId) {
        const score = winner.score === 'X' ? failScore : winner.score;
        const entry = acc[userId] ?? { sum: 0, count: 0, failCount: 0, isNickname };
        entry.sum += score;
        entry.count += 1;
        entry.failCount += winner.score === 'X' ? 1 : 0;
        acc[userId] = entry;
      }
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

  return userStats;
}

export async function handleStats(
  interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
  logger: Logger,
): Promise<void> {
  const { guildId } = interaction;

  // get the configured channel from the command
  const channel =
    interaction.options.getChannel<ChannelType.GuildText>('wordle-channel', false) ??
    interaction.channel;

  assertTextChannel(channel);
  const channelId = channel.id;

  const ignoreCache = interaction.options.getBoolean('ignore-cache', false) ?? false;

  const historyDays = interaction.options.getInteger('history-days', false);

  if (historyDays !== null && historyDays < 0) throw new Error('history-days must be positive');

  const failScore = interaction.options.getInteger('fail-score', false) ?? DEFAULT_FAIL_SCORE;

  await interaction.deferReply({
    flags: isDev ? MessageFlags.Ephemeral : undefined,
  });

  logger.info({ clearCache: ignoreCache, historyDays, channelId }, 'Starting stats calculation');

  const minDateTimestamp = historyDays
    ? Date.now() - historyDays * 24 * 60 * 60 * 1000
    : new Date('2025-05-01').getTime();

  let lastMessageId = await getLastMessageId(guildId, channelId);

  let lastProcessedMessage: string | undefined;
  let processedMessagesCount = 0;
  let continueFetchingMessages = true;

  /**
   * If ignoreCache is false and we have a lastMessage, process the message history chronologically until we run out of new messages
   * Else, process the message history in reverse chronological order until the minDateTimestamp
   */

  const fetchChronologically = !ignoreCache && !!lastMessageId;
  if (fetchChronologically) lastProcessedMessage = lastMessageId;

  logger.debug({ lastMessageId, fetchChronologically }, 'Fetching message history');

  const BATCH_SIZE = 100;
  /* eslint-disable no-await-in-loop */
  while (continueFetchingMessages) {
    const fetchOptions: FetchMessagesOptions = {
      limit: BATCH_SIZE,
    };
    if (fetchChronologically) {
      fetchOptions.after = lastProcessedMessage;
    } else {
      fetchOptions.before = lastProcessedMessage;
    }

    const messageBatch = await channel.messages.fetch(fetchOptions);
    if (messageBatch.size < BATCH_SIZE) {
      continueFetchingMessages = false;
    }

    const newResults: Omit<ResultDoc, 'type'>[] = [];
    for (const msg of messageBatch.values()) {
      lastMessageId = lastMessageId ? maxString(msg.id, lastMessageId) : msg.id;
      lastProcessedMessage = msg.id;

      // when processing reverse-chronological, stop when we reach the min timestamp
      if (!fetchChronologically && msg.createdTimestamp < minDateTimestamp) {
        continueFetchingMessages = false;
        break;
      }

      const { content } = msg;

      if (
        msg.author.id === WORDLE_BOT_USER_ID &&
        content.includes("Here are yesterday's results")
      ) {
        const winners = parseWinners(content);

        newResults.push({
          guildId,
          channelId,
          timestamp: msg.createdTimestamp,
          content,
          winners,
          messageId: msg.id,
        });

        processedMessagesCount += 1;
      }
    }
    await addResults(newResults);
  }
  /* eslint-enable no-await-in-loop */

  if (lastMessageId) {
    logger.debug({ channelId, lastMessageId }, 'Updating last processed message ID');
    await setLastMessageId(guildId, channelId, lastMessageId);
  }

  logger.debug({ channelId, processedMessagesCount }, 'Processed new Wordle results');

  const results = await getResults(guildId, channelId);

  const unresolvedNicknames = await matchNicknames(results, guildId, channel);

  const userStats = await calculateAverageScores(results, guildId, failScore);

  const sortedUserStats = userStats.toSorted((a, b) => a.average - b.average);

  const statsLines = sortedUserStats.map((stats, index) => {
    const rank = index + 1;
    const averageStr = stats.average.toFixed(3);
    const idDisplay = stats.isNickname ? stats.userIdOrNickname : `<@${stats.userIdOrNickname}>`;
    return `#${rank}: ${idDisplay} - Average Score: ${averageStr} (${stats.count} games, ${stats.failCount} fails)`;
  });

  const contentLines = [
    `Stats for ${results.length} games in <#${channelId}> (fails score as ${failScore}):`,
    ...statsLines,
  ];

  if (unresolvedNicknames.length > 0) {
    contentLines.push(
      `These nicknames need to be manually matched: ${unresolvedNicknames.map((n) => `\`${n}\``).join(', ')}.`,
    );
  }

  // truncate to fit within Discord message limit
  while (contentLines.join('\n').length > 2000) {
    contentLines.pop();
  }

  await interaction.editReply({
    content: contentLines.join('\n'),
  });
}
