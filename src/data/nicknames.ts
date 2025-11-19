import { promises as fs } from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
const filePath = path.join(dataDir, 'nicknames.json');

type Nicknames = Record<string, Record<string, string>>;

async function ensureFile(): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify({}), 'utf8');
  }
}

export async function addNickname(
  guildId: string,
  nickname: string,
  userId: string,
): Promise<void> {
  await ensureFile();
  const raw = await fs.readFile(filePath, 'utf8');
  let data: Nicknames = {};
  try {
    data = JSON.parse(raw || '{}');
  } catch {
    data = {};
  }
  const normalized = nickname.trim();
  data[guildId] ??= {};
  data[guildId][normalized] = userId;
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export async function getUserIdFromNickname(
  guildId: string,
  nickname: string,
): Promise<string | undefined> {
  await ensureFile();
  const raw = await fs.readFile(filePath, 'utf8');
  try {
    const data: Nicknames = JSON.parse(raw || '{}');
    const normalized = nickname.trim();
    return data[guildId]?.[normalized];
  } catch {
    return undefined;
  }
}

export async function getAllNicknames(guildId: string): Promise<Record<string, string>> {
  await ensureFile();
  const raw = await fs.readFile(filePath, 'utf8');
  try {
    const data: Nicknames = JSON.parse(raw || '{}');
    return { ...(data[guildId] ?? {}) };
  } catch {
    return {};
  }
}

export async function removeNickname(guildId: string, nickname: string): Promise<boolean> {
  await ensureFile();
  const raw = await fs.readFile(filePath, 'utf8');
  try {
    const data: Nicknames = JSON.parse(raw || '{}');
    const normalized = nickname.trim();
    if (!data[guildId] || !(normalized in data[guildId])) return false;
    delete data[guildId][normalized];
    // If guild has no more nicknames, remove the guild key
    if (Object.keys(data[guildId]).length === 0) delete data[guildId];
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

export default { addNickname, getUserIdFromNickname };
