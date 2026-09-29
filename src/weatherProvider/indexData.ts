import * as parsing from '../utils/parsing';
import type { IndexData } from '../types';

/**
 * Fetches and validates the `<baseUrl>index.json` payload shared by all providers.
 *
 * Only the known index fields are copied over, so unexpected or malformed keys are dropped.
 * @param baseUrl Provider base URL (must end with `/`).
 * @throws When the endpoint responds with a non-OK status.
 */
export async function fetchIndexData(baseUrl: string): Promise<IndexData> {
  const response = await fetch(`${baseUrl}index.json?cb=${Date.now()}`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`index.json could not be loaded (status: ${response.status})`);

  const json: unknown = await response.json();
  const out: IndexData = {};
  if (!parsing.isObject(json)) return out;

  const generatedAt = json['generated_at'];
  const timestamps = json['available_timestamps'];
  const currentHour = json['current_hour'];
  const apiVersion = json['api_version'];

  if (parsing.isString(generatedAt)) out.generated_at = generatedAt;
  if (parsing.isUnknownArray(timestamps)) out.available_timestamps = timestamps.filter(parsing.isString);
  if (parsing.isString(currentHour)) out.current_hour = currentHour;
  if (parsing.isString(apiVersion)) out.api_version = apiVersion;

  return out;
}
