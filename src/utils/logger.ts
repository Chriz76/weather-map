const isDebugEnabled = (window as any).WEATHER_DEBUG === true;
const prefix = '[Weather]';

const pad = (value: number | string, length = 2) => String(value).padStart(length, '0');

const getTimestamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

const formatArgs = (level: string, ...args: any[]) => [`${getTimestamp()} ${prefix} [${level}]`, ...args];

export const logger = {
  debug: (...args: any[]) => {
    if (isDebugEnabled) {
      console.debug(...formatArgs('DEBUG', ...args));
    }
  },
  info: (...args: any[]) => {
    console.info(...formatArgs('INFO', ...args));
  },
  warn: (...args: any[]) => {
    console.warn(...formatArgs('WARN', ...args));
  },
  error: (...args: any[]) => {
    console.error(...formatArgs('ERROR', ...args));
  },
};
