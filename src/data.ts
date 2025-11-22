import path from 'node:path';

import PouchDB from 'pouchdb';
import PouchdbFind from 'pouchdb-find';

import { dataPath } from './config.ts';
import { baseLogger as logger } from './logger.ts';

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
  type: 'result';
  guildId: string;
  channelId: string;
  messageId: string;
  timestamp: number;
  content: string;
  winners: Winner[];
}

export interface NicknameDoc {
  type: 'nickname';
  guildId: string;
  nickname: string;
  userId: string;
}

export interface LastMessageDoc {
  type: 'lastMessage';
  guildId: string;
  channelId: string;
  messageId: string;
}

export type NicknameEntry = Pick<NicknameDoc, 'nickname' | 'userId'>;

const db = new PouchDB<ResultDoc | NicknameDoc | LastMessageDoc>(path.join(dataPath, 'db'));

await db.createIndex({ index: { fields: ['type', 'guildId', 'nickname'] } });
await db.createIndex({ index: { fields: ['type', 'guildId', 'channelId'] } });

function nicknameId(guildId: string, nickname: string): string {
  // encode nickname to be safe in _id
  return `nickname:${guildId}:${encodeURIComponent(nickname)}`;
}

function lastMessageId(guildId: string, channelId: string): string {
  return `lastMessage:${guildId}:${channelId}`;
}

// Nickname helpers
export async function addNickname(
  guildId: string,
  nickname: string,
  userId: string,
): Promise<void> {
  const id = nicknameId(guildId, nickname);
  const existing = await db.get<NicknameDoc>(id).catch(() => undefined);
  const baseDoc: PouchDB.Core.Document<NicknameDoc> = {
    _id: id,
    type: 'nickname',
    guildId,
    nickname,
    userId,
  };
  if (existing) {
    // eslint-disable-next-line no-underscore-dangle
    const doc: PouchDB.Core.ExistingDocument<NicknameDoc> = { ...baseDoc, _rev: existing._rev };
    await db.put(doc, { force: true });
  } else {
    await db.put(baseDoc);
  }
}

export async function addNicknames(guildId: string, entries: NicknameEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await db.bulkDocs(
    entries.map((entry) => {
      const id = nicknameId(guildId, entry.nickname);
      const doc: PouchDB.Core.Document<NicknameDoc> = {
        _id: id,
        type: 'nickname',
        guildId,
        nickname: entry.nickname,
        userId: entry.userId,
      };
      return doc;
    }),
  );
}

export async function getUserIdsFromNicknames(
  guildId: string,
  nicknames: string[],
): Promise<Record<string, string>> {
  const res = await db.allDocs<NicknameDoc>({
    include_docs: true,
    keys: nicknames.map((nickname) => nicknameId(guildId, nickname)),
    limit: 5000,
  });
  const docs = res.rows
    .map((row) => 'doc' in row && row.doc)
    .filter((doc): doc is PouchDB.Core.ExistingDocument<NicknameDoc> => !!doc);
  return Object.fromEntries(docs.map((doc) => [doc.nickname, doc.userId]));
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
  const id = nicknameId(guildId, nickname);
  try {
    const doc = await db.get<NicknameDoc>(id);
    await db.remove(doc);
    return true;
  } catch {
    return false;
  }
}

export async function addResults(results: Omit<ResultDoc, 'type'>[]): Promise<void> {
  if (results.length === 0) return;
  await db.bulkDocs(
    results.map((result) => {
      const id = `result:${result.guildId}:${result.channelId}:${result.messageId}`;
      const doc: PouchDB.Core.Document<ResultDoc> = { _id: id, type: 'result', ...result };
      return doc;
    }),
  );
}

export async function getLastMessageId(
  guildId: string,
  channelId: string,
): Promise<string | undefined> {
  const id = lastMessageId(guildId, channelId);
  try {
    const res = await db.get<LastMessageDoc>(id);
    return res.messageId;
  } catch {
    return undefined;
  }
}
export async function setLastMessageId(
  guildId: string,
  channelId: string,
  messageId: string,
): Promise<void> {
  const id = lastMessageId(guildId, channelId);
  const existing = await db.get<LastMessageDoc>(id).catch(() => undefined);
  const baseDoc: PouchDB.Core.Document<LastMessageDoc> = {
    _id: id,
    type: 'lastMessage',
    guildId,
    channelId,
    messageId,
  };
  if (existing) {
    // eslint-disable-next-line no-underscore-dangle
    const doc: PouchDB.Core.ExistingDocument<LastMessageDoc> = { ...baseDoc, _rev: existing._rev };
    await db.put(doc, { force: true });
  } else {
    await db.put(baseDoc);
  }
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
