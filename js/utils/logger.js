const isDebugEnabled = window.WEATHER_DEBUG === true;
const prefix = '[Weather]';

const pad = (value, length = 2) => String(value).padStart(length, '0');

const getTimestamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

const formatArgs = (level, ...args) => [`${getTimestamp()} ${prefix} [${level}]`, ...args];

export const logger = {
  debug: (...args) => {
    if (isDebugEnabled) {
      console.debug(...formatArgs('DEBUG', ...args));
    }
  },
  info: (...args) => {
    console.info(...formatArgs('INFO', ...args));
  },
  warn: (...args) => {
    console.warn(...formatArgs('WARN', ...args));
  },
  error: (...args) => {
    console.error(...formatArgs('ERROR', ...args));
  },
};
