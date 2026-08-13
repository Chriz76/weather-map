const isDebugEnabled = (window as unknown as Record<string, unknown>).WEATHER_DEBUG === true;
const prefix = '[Weather]';

const pad = (value: number | string, length = 2): string => String(value).padStart(length, '0');

const getTimestamp = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

const formatArgs = (level: string, ...args: unknown[]): unknown[] => [`${getTimestamp()} ${prefix} [${level}]`, ...args];

export const logger = {
  debug: (...args: unknown[]): void => {
    if (isDebugEnabled) {
      console.debug(...formatArgs('DEBUG', ...args));
    }
  },
  info: (...args: unknown[]): void => {
    console.info(...formatArgs('INFO', ...args));
  },
  warn: (...args: unknown[]): void => {
    console.warn(...formatArgs('WARN', ...args));
  },
  error: (...args: unknown[]): void => {
    console.error(...formatArgs('ERROR', ...args));
  },
};
