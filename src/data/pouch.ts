/* eslint-disable no-restricted-syntax */
import PouchDB from 'pouchdb';
import PouchdbFind from 'pouchdb-find';

import { logger } from '../logger.ts';

PouchDB.plugin(PouchdbFind);

interface BaseWinner {
  score: number | 'X';
}
interface UserWinner extends BaseWinner {
  id: string;
}
interface NicknameWinner extends BaseWinner {
  nickname: string;
}

export type Winner = UserWinner | NicknameWinner;

export interface ResultDoc {
  _id: string;
  _rev?: string;
  type: 'result';
  guildId: string;
  channelId: string;
  messageId: string;
  timestamp: number;
  content: string;
  winners: Winner[];
}

export interface NicknameDoc {
  _id: string;
  _rev?: string;
  type: 'nickname';
  guildId: string;
  nickname: string;
  userId: string;
}

const db = new PouchDB<ResultDoc | NicknameDoc>('./data/db'); // file-backed (LevelDB) in Node

await db.createIndex({ index: { fields: ['timestamp'] } });
await db.createIndex({ index: { fields: ['type', 'guildId', 'nickname'] } });

function nickId(guildId: string, nickname: string): string {
  // encode nickname to be safe in _id
  return `nick:${guildId}:${encodeURIComponent(nickname)}`;
}

// Nickname helpers
export async function addNickname(
  guildId: string,
  nickname: string,
  userId: string,
): Promise<void> {
  const id = nickId(guildId, nickname);
  const doc: NicknameDoc = { _id: id, type: 'nickname', guildId, nickname, userId };
  const existing = await db.get<NicknameDoc>(id).catch(() => undefined);
  if (existing) {
    // eslint-disable-next-line no-underscore-dangle
    doc._rev = existing._rev;
  }
  await db.put(doc, { force: true });
}

export async function getUserIdFromNickname(
  guildId: string,
  nickname: string,
): Promise<string | undefined> {
  const id = nickId(guildId, nickname);
  try {
    const doc = await db.get<NicknameDoc>(id);
    return doc.userId;
  } catch {
    return undefined;
  }
}

export async function getAllNicknames(guildId: string): Promise<Record<string, string>> {
  const res = (await db.find({
    selector: { type: 'nickname', guildId },
    fields: ['nickname', 'userId'],
    limit: 10000,
  })) as PouchDB.Find.FindResponse<Pick<NicknameDoc, 'nickname' | 'userId'>>;
  if (res.warning) {
    logger.warn({ warning: res.warning }, 'getAllNicknames warning');
  }
  const out: Record<string, string> = Object.fromEntries(
    res.docs.map((d) => [d.nickname, d.userId]),
  );
  return out;
}

export async function removeNickname(guildId: string, nickname: string): Promise<boolean> {
  const id = nickId(guildId, nickname);
  try {
    const doc = await db.get<NicknameDoc>(id);
    await db.remove(doc);
    return true;
  } catch {
    return false;
  }
}

// Result helpers
export async function addResult(result: Omit<ResultDoc, '_id' | 'type'>): Promise<void> {
  const id = `result:${result.guildId}:${result.channelId}:${result.messageId}`;
  const doc: ResultDoc = { _id: id, type: 'result', ...result };
  const existing = await db.get<ResultDoc>(id).catch(() => undefined);
  if (existing) {
    // eslint-disable-next-line no-underscore-dangle
    doc._rev = existing._rev;
  }
  await db.put(doc, { force: true });
}

export async function getLatestTimestamp(guildId: string, channelId: string): Promise<number> {
  const res = (await db.find({
    selector: { type: 'result', guildId, channelId, timestamp: { $exists: true } },
    fields: ['timestamp'],
    sort: [{ timestamp: 'desc' }],
    limit: 1,
  })) as PouchDB.Find.FindResponse<Pick<ResultDoc, 'timestamp'>>;
  if (res.warning) {
    logger.warn({ warning: res.warning }, 'getLatestTimestamp warning');
  }
  const doc = res.docs[0];
  if (!doc) return 0;
  return doc.timestamp;
}

export async function getUniqueNicknamesFromResults(guildId: string): Promise<Set<string>> {
  // Only fetch results that contain at least one winner with a `nickname`.
  const res = (await db.find({
    selector: { type: 'result', guildId },
    fields: ['winners'],
    limit: 5000,
  })) as PouchDB.Find.FindResponse<Pick<ResultDoc, 'winners'>>;
  if (res.warning) {
    logger.warn({ warning: res.warning }, 'getUniqueNicknamesFromResults warning');
  }

  const set = new Set<string>();
  for (const d of res.docs) {
    const winners = d.winners ?? [];
    for (const w of winners) {
      if ('nickname' in w) {
        set.add(w.nickname);
      }
    }
  }

  return set;
}

export async function getResults(guildId: string, channelId: string): Promise<ResultDoc[]> {
  const res = (await db.find({
    selector: { type: 'result', guildId, channelId },
    limit: 10000,
  })) as PouchDB.Find.FindResponse<ResultDoc>;
  if (res.warning) {
    logger.warn({ warning: res.warning }, 'getResults warning');
  }

  return res.docs;
}
