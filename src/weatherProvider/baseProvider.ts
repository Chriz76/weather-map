export abstract class BaseProvider {
  /**
   * Fetch an image blob for a given timestamp using provider config.
   * Providers can pass a precomputed `cacheBuster` string to keep behaviour
   * consistent with existing implementations.
   */
  public static async fetchWeatherImageBlob(
    timestamp: string,
    config: Record<string, unknown>,
    cacheBuster?: string,
    signal?: AbortSignal
  ): Promise<Blob> {
    const cfg = config as Record<string, unknown> | undefined;
    const baseUrl = cfg && typeof cfg.baseUrl === 'string' ? cfg.baseUrl : '';
    const cb = typeof cacheBuster === 'string' ? cacheBuster : `cb=${Date.now()}`;
    const imageUrl = `${baseUrl}${timestamp}Z.webp?${cb}`;

    const response = await fetch(imageUrl, { cache: 'no-cache', signal: signal ?? null });
    if (!response.ok) throw new Error('Image could not be loaded');
    return await response.blob();
  }
}

export default BaseProvider;
