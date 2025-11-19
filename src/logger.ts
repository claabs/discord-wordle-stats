import 'dotenv/config';
import pino, { stdTimeFunctions } from 'pino';

import { logLevel } from './config.ts';

export const logger = pino({
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  level: logLevel,
  base: undefined,
  timestamp: stdTimeFunctions.isoTime,
});
