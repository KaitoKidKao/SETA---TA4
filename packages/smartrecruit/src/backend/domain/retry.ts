import pino from 'pino';

const log = pino({ name: 'smartrecruit/retry' });

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    baseDelay?: number;
    backoffFactor?: number;
  },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? Number(process.env.SMARTRECRUIT_MAX_RETRIES ?? '3');
  const baseDelay = options?.baseDelay ?? Number(process.env.SMARTRECRUIT_BASE_DELAY_MS ?? '1000');
  const backoffFactor =
    options?.backoffFactor ?? Number(process.env.SMARTRECRUIT_BACKOFF_FACTOR ?? '2');

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      if (attempt > maxRetries) {
        log.error({ err: error, attempt }, 'Max retries reached. Throwing error.');
        throw error;
      }

      const errStr = String(error.message || error).toLowerCase();
      const isRateLimit =
        errStr.includes('429') ||
        errStr.includes('rate limit') ||
        errStr.includes('too many requests') ||
        errStr.includes('quota');
      const isNetworkError =
        errStr.includes('fetch') ||
        errStr.includes('network') ||
        errStr.includes('timeout') ||
        errStr.includes('econnreset') ||
        errStr.includes('socket');

      const isRetryable =
        isRateLimit || isNetworkError || error.status === 429 || error.statusCode === 429;

      if (!isRetryable) {
        log.warn({ err: error, attempt }, 'Non-retryable error encountered. Throwing immediately.');
        throw error;
      }

      // Exponential Backoff with Jitter: baseDelay * (backoffFactor ^ (attempt - 1)) + random jitter
      const delay = baseDelay * backoffFactor ** (attempt - 1) + Math.random() * 100;

      log.warn(
        { err: error, attempt, nextRetryInMs: Math.round(delay) },
        `Retryable error encountered. Retrying in ${Math.round(delay)}ms...`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
