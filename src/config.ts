import 'dotenv/config';

if (!process.env.BOT_TOKEN) {
  throw new Error('BOT_TOKEN environment variable is not set.');
}
export const botToken = process.env.BOT_TOKEN;

export const devGuildId = process.env.DEV_GUILD_ID;

export const ownerId = process.env.OWNER_ID;

export const logLevel = process.env.LOG_LEVEL ?? 'info';

export const dataPath = process.env.DATA_PATH ?? './data';
