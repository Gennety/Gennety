export type CorporateApiPlatform = "slack" | "atlassian";

interface QueueState {
  nextAvailableAt: number;
  chain: Promise<unknown>;
}

const MIN_DELAY_MS: Record<CorporateApiPlatform, number> = {
  slack: 1_000,
  atlassian: 500,
};

const queues = new Map<CorporateApiPlatform, QueueState>();

function retryAfterMs(response: Response) {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) return null;
  const seconds = Number(retryAfter);
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : null;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function enqueueCorporateApiCall<T>(
  platform: CorporateApiPlatform,
  operation: () => Promise<T>
): Promise<T> {
  const current = queues.get(platform) ?? { nextAvailableAt: 0, chain: Promise.resolve() };

  const run = current.chain
    .catch(() => undefined)
    .then(async () => {
      const waitMs = Math.max(0, current.nextAvailableAt - Date.now());
      if (waitMs > 0) await delay(waitMs);
      try {
        return await operation();
      } finally {
        current.nextAvailableAt = Date.now() + MIN_DELAY_MS[platform];
      }
    });

  current.chain = run;
  queues.set(platform, current);
  return run;
}

export async function fetchWithCorporateRateLimit(
  platform: CorporateApiPlatform,
  url: string,
  init: RequestInit,
  options: { retries?: number } = {}
) {
  const retries = options.retries ?? 2;

  return enqueueCorporateApiCall(platform, async () => {
    let lastResponse: Response | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const response = await fetch(url, init);
      if (response.status !== 429 && response.status < 500) return response;

      lastResponse = response;
      const waitMs = retryAfterMs(response) ?? 1_000 * 2 ** attempt;
      if (attempt < retries) await delay(waitMs);
    }
    return lastResponse as Response;
  });
}

export const __test = {
  retryAfterMs,
  queues,
};
