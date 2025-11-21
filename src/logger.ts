import 'dotenv/config';
import pino, { stdTimeFunctions } from 'pino';

import { logLevel } from './config.ts';

export const baseLogger = pino({
  formatters: {
    level: (label) => ({ level: label }),
  },
  level: logLevel,
  base: undefined,
  timestamp: stdTimeFunctions.isoTime,
});
