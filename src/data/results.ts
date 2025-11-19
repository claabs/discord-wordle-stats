import { promises as fs } from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
const filePath = path.join(dataDir, 'results.json');

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

interface ResultRecord {
  messageId: string;
  timestamp: number;
  content: string;
  winners: Winner[]; // array of {id, score} where id is userId or raw name
}

type Results = Record<string, Record<string, Record<string, ResultRecord>>>;
// Results[guildId][channelId][timestamp] = ResultRecord

async function ensureFile(): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify({}), 'utf8');
  }
}

export async function addResult(
  guildId: string,
  channelId: string,
  timestamp: number,
  record: ResultRecord,
): Promise<void> {
  await ensureFile();
  const raw = await fs.readFile(filePath, 'utf8');
  let data: Results = {};
  try {
    data = JSON.parse(raw || '{}');
  } catch {
    data = {};
  }
  data[guildId] ??= {};
  data[guildId][channelId] ??= {};
  // use timestamp as key to make it easy to query by time
  data[guildId][channelId][String(timestamp)] = record;
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export async function getResults(
  guildId: string,
  channelId: string,
): Promise<Record<string, ResultRecord>> {
  await ensureFile();
  const raw = await fs.readFile(filePath, 'utf8');
  const data: Results = JSON.parse(raw || '{}');
  const channelMap = data[guildId]?.[channelId];
  if (!channelMap) return {};
  return channelMap;
}

export async function getLastTimestamp(guildId: string, channelId: string): Promise<number> {
  const channelMap = await getResults(guildId, channelId);
  const timestamps = Object.keys(channelMap).map((k) => Number(k));
  if (timestamps.length === 0) return 0;
  return Math.max(...timestamps);
}
