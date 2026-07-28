import stdev from '@stdlib/stats-base-stdev';
import { channelMention, MessageFlags, TextChannel, userMention } from 'discord.js';

import { assertTextChannel, isScoreSummaryMessage } from './utils.ts';
import { isDev, onlyCache } from '../config.ts';
import {
  addNicknames,
  addResults,
  getAllNicknamesIn,
  getLastMessageId,
  getLatestStatSummary,
  getResults,
  getUserIdsFromNicknames,
  setLastMessageId,
  setLatestStatSummary,
} from '../data.ts';

import type {
  ChannelType,
  ChatInputCommandInteraction,
  FetchMessagesOptions,
  GuildTextBasedChannel,
  Message,
} from 'discord.js';
import type { Logger } from 'pino';

import type { NicknameEntry, ResultDoc, UserStats, Winner } from '../data.ts';

// Points assigned for a failed Wordle attempt (X)
const DEFAULT_FAIL_SCORE = 7;

type SortMode = 'average' | 'confidence';

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

interface SaveHistoricalResultsInput {
  logger: Logger;
  ignoreCache: boolean;
  historyDays?: number;
  guildId: string;
  channel: GuildTextBasedChannel;
}

async function saveHistoricalResults(input: SaveHistoricalResultsInput) {
  const { logger, ignoreCache, historyDays, guildId, channel } = input;
  const channelId = channel.id;
  logger.info({ clearCache: ignoreCache, historyDays, channelId }, 'Parsing historical results');

  const minDateTimestamp = historyDays
    ? Date.now() - historyDays * 24 * 60 * 60 * 1000
    : new Date('2025-05-01').getTime();

  let lastMessageId = onlyCache ? undefined : await getLastMessageId(guildId, channelId);

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

  if (!onlyCache) {
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

      logger.trace({ fetchOptions }, 'Fetching message batch');
      const messageBatch = await channel.messages.fetch(fetchOptions);
      logger.trace({ messageCount: messageBatch.size }, 'Fetched message batch');
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

        if (isScoreSummaryMessage(msg)) {
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
  }
}

function getLatestResult(results: ResultDoc[]): ResultDoc {
  let latestResult: ResultDoc | undefined;
  for (const result of results) {
    if (!latestResult || new Date(result.timestamp) > new Date(latestResult.timestamp)) {
      latestResult = result;
    }
  }
  if (!latestResult) throw new Error('No Wordle results available to parse.');
  return latestResult;
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
  const tempUserStats = new Map<
    string,
    { sum: number; count: number; failCount: number; isNickname: boolean; scores: number[] }
  >();

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
        const entry = tempUserStats.get(userId) ?? {
          sum: 0,
          count: 0,
          failCount: 0,
          isNickname,
          scores: [],
        };
        entry.sum += score;
        entry.count += 1;
        entry.failCount += winner.score === 'X' ? 1 : 0;
        entry.scores.push(score);
        tempUserStats.set(userId, entry);
      }
    }
  }

  const userStats = tempUserStats.entries().map(([userId, v]): UserStats => {
    const average = v.sum / v.count;
    let scoreStdev = stdev(v.scores.length, 1, v.scores, 1);
    if (Number.isNaN(scoreStdev)) {
      scoreStdev = 2; // Realistic fallback for Wordle, can be fine-tuned.
    }
    const upperBound = Math.min(average + 1.96 * (scoreStdev / Math.sqrt(v.count)), 7); // 95% upper bound. max 7

    return {
      sum: v.sum,
      count: v.count,
      failCount: v.failCount,
      average,
      upperBound,
      userIdOrNickname: userId,
      isNickname: v.isNickname,
    };
  });

  return [...userStats];
}

function renderRank(rank: number): string {
  if (rank === 1) return '# 🥇';
  if (rank === 2) return '## 🥈';
  if (rank === 3) return '### 🥉';
  return `#**${rank.toFixed(0)}:**`;
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

  const historyDays = interaction.options.getInteger('history-days', false) ?? undefined;

  if (historyDays !== undefined && historyDays < 0)
    throw new Error('history-days must be positive');

  const failScore = interaction.options.getInteger('fail-score', false) ?? DEFAULT_FAIL_SCORE;

  const sortMode: SortMode =
    (interaction.options.getString('sort-mode', false) as SortMode | undefined) ?? 'confidence';

  await interaction.deferReply({
    flags: isDev ? MessageFlags.Ephemeral : undefined,
  });

  await saveHistoricalResults({ logger, ignoreCache, historyDays, guildId, channel });

  const results = await getResults(guildId, channelId);

  const latestResult = getLatestResult(results);

  const unresolvedNicknames = onlyCache ? [] : await matchNicknames(results, guildId, channel);

  const userStats = await calculateAverageScores(results, guildId, failScore);

  await setLatestStatSummary({
    guildId,
    channelId,
    userStats,
    timestamp: latestResult.timestamp,
    messageId: latestResult.messageId,
  });

  let sortedUserStats: UserStats[] = [];
  // Sort by score ascending, then count descending for ties
  if (sortMode === 'average') {
    sortedUserStats = userStats.toSorted((a, b) => a.average - b.average || b.count - a.count);
  } else if (sortMode === 'confidence') {
    sortedUserStats = userStats.toSorted(
      (a, b) => a.upperBound - b.upperBound || b.count - a.count,
    );
  }

  const statsLines = sortedUserStats.map((stats, index) => {
    const rank = index + 1;
    const idDisplay = stats.isNickname
      ? stats.userIdOrNickname
      : userMention(stats.userIdOrNickname);
    const primaryScore =
      sortMode === 'average'
        ? `${stats.average.toFixed(3)} avg`
        : `${stats.upperBound.toFixed(3)} U`;
    const secondaryScore =
      sortMode === 'average'
        ? `${stats.upperBound.toFixed(2)} U`
        : `${stats.average.toFixed(2)} avg`;
    return `${renderRank(rank)} ${primaryScore} - ${idDisplay} (${secondaryScore}, ${stats.count} game${stats.count === 1 ? '' : 's'}, ${stats.failCount} fail${stats.failCount === 1 ? '' : 's'})`;
  });

  const sortDescription =
    sortMode === 'average' ? 'average score' : '95% confidence upper bound (U)';
  const contentLines = [
    `-# Stats for ${results.length} game${results.length === 1 ? '' : 's'} in ${channelMention(channelId)} (fails score as ${failScore}). Sorted by ${sortDescription}.`,
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

export async function handleResultsMessageCreated(
  msg: Message<true>,
  logger: Logger,
): Promise<void> {
  const { guildId, channelId, channel } = msg;
  logger.info('Parsing results message created');
  if (!(channel instanceof TextChannel)) {
    logger.warn({ channelType: channel.type }, 'Invalid channel type, must be text channel');
    return;
  }
  const prevStatSummary = await getLatestStatSummary(guildId, channelId);
  await saveHistoricalResults({
    ignoreCache: false,
    logger,
    guildId,
    channel,
  });

  const results = await getResults(guildId, channelId);

  const latestResult = getLatestResult(results);

  await matchNicknames(results, guildId, channel);

  const newUserStats = await calculateAverageScores(results, guildId, DEFAULT_FAIL_SCORE);

  await setLatestStatSummary({
    guildId,
    channelId,
    userStats: newUserStats,
    timestamp: latestResult.timestamp,
    messageId: latestResult.messageId,
  });

  if (!prevStatSummary) {
    logger.warn('No previous user stats to compare against');
    return;
  }
  const prevUserStats = prevStatSummary.userStats;

  if (prevStatSummary.messageId === latestResult.messageId) {
    logger.warn('Comparing the same results message, skipping');
    return;
  }

  const prevSortedUserStats = prevUserStats.toSorted(
    (a, b) => a.upperBound - b.upperBound || b.count - a.count,
  );

  const newSortedUserStats = newUserStats.toSorted(
    (a, b) => a.upperBound - b.upperBound || b.count - a.count,
  );

  const prevUserRank = new Map<string, number>();
  for (const [index, userStat] of prevSortedUserStats.entries()) {
    prevUserRank.set(userStat.userIdOrNickname, index + 1);
  }

  interface RankChange {
    userIdOrNickname: string;
    isNickname: boolean;
    newRank: number;
    oldRank?: number;
    diff?: number;
  }
  const rankChanges: RankChange[] = [];
  for (const [index, userStat] of newSortedUserStats.entries()) {
    const oldRank = prevUserRank.get(userStat.userIdOrNickname);
    const newRank = index + 1;
    if (oldRank !== newRank) {
      const diff = oldRank === undefined ? oldRank : newRank - oldRank;
      rankChanges.push({
        userIdOrNickname: userStat.userIdOrNickname,
        newRank,
        oldRank,
        diff,
        isNickname: userStat.isNickname,
      });
    }
  }

  const sortedRankChanges = rankChanges.toSorted((a, b) => {
    let compareResult;
    if (a.diff !== undefined && b.diff !== undefined) {
      // sort low to high
      compareResult = a.diff - b.diff;
    }
    // then sort by rank top ranks to bottom ranks
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    return compareResult || a.newRank - b.newRank;
  });

  const statsLines = sortedRankChanges.map((rankChange) => {
    let diffChange: string;
    if (!rankChange.diff) {
      diffChange = '🆕';
    } else if (rankChange.diff < 0) {
      // if diff is negative, the user moved up the rankings (5 -> 4)
      diffChange = `🔼 +${(rankChange.diff * -1).toFixed(0)}`;
    } else {
      // if diff is positive, the user moved down the rankings (1 -> 2)
      diffChange = `🔻 -${rankChange.diff.toFixed(0)}`;
    }
    const idDisplay = rankChange.isNickname
      ? rankChange.userIdOrNickname
      : userMention(rankChange.userIdOrNickname);
    const rankBeforeAfter =
      rankChange.oldRank === undefined
        ? `? ➡️ #${rankChange.newRank}`
        : `#${rankChange.oldRank} to #${rankChange.newRank}`;
    return `${diffChange} ${idDisplay} (${rankBeforeAfter})`;
  });

  const contentLines = [`## Ranking order changed!`, ...statsLines];

  // truncate to fit within Discord message limit
  while (contentLines.join('\n').length > 2000) {
    contentLines.pop();
  }

  logger.debug('Replying to message');

  msg.reply(contentLines.join('\n'));
}
