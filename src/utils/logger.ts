/**
 * True with `?debug=true` (see index.html). Exported so diagnostic code can skip its own book
 * keeping entirely instead of collecting numbers that are never written.
 */
export const isDebugEnabled = window.WEATHER_DEBUG === true;

/**
 * True with `?perf=true` (and, for convenience, with `?debug=true`); both set it in index.html.
 *
 * A perf run is meant to be read from a clean console, so it is deliberately not tied to
 * {@link isDebugEnabled}: the measurements write through `logger.info`, while `logger.debug` stays
 * silent and eruda is not loaded.
 */
export const isPerfEnabled = window.WEATHER_PERF === true;
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
