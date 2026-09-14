/**
 * RETRY PATTERN — Soucastky Library Pattern for TypeScript/Next.js
 * 
 * Exponential backoff with jitter for resilient API calls.
 * Usage:
 *   const result = await retryWithBackoff(async () => fetchApi(), { maxAttempts: 3 });
 */

import { logger } from '@/lib/logging/logger';

const log = logger('RETRY');

export interface RetryOptions {
  maxAttempts?: number;      // Default: 3
  baseDelayMs?: number;       // Default: 1000
  maxDelayMs?: number;        // Default: 30000 (30s cap)
  jitterFactor?: number;      // Default: 0.5 (±50% randomization)
  retryableErrors?: (number | string)[]; // Status codes to retry on (default: [429, 500, 502, 503])
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.5,
  retryableErrors: [429, 500, 502, 503],
};

/** Sleep for given milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Calculate delay with exponential backoff + jitter. */
function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
  const expDelay = options.baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(expDelay, options.maxDelayMs);
  
  // Jitter: ±jitterFactor of the delay
  const jitter = capped * options.jitterFactor;
  return Math.floor(capped - jitter + Math.random() * jitter * 2);
}

/**
 * Execute an async function with exponential backoff retry.
 * 
 * @param fn - Async function to execute
 * @param options - Retry configuration
 * @returns Result of the successful execution
 * @throws Last error if all attempts fail
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  customOptions?: Partial<RetryOptions>
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...customOptions };
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      const isRetryable = opts.retryableErrors.includes((lastError as any).code) ||
                          opts.retryableErrors.includes((lastError as any).status);
      
      if (!isRetryable && attempt === opts.maxAttempts - 1) {
        throw lastError; // Non-retryable on final attempt — fail fast
      }
      
      const delay = calculateDelay(attempt, opts);
      log.warn(`Attempt ${attempt + 1}/${opts.maxAttempts} failed — retrying in ${delay}ms`, {
        error: lastError.message,
      });
      
      if (attempt < opts.maxAttempts - 1) {
        await sleep(delay);
      }
    }
  }
  
  throw lastError ?? new Error('RetryWithBackoff failed with unknown error');
}

/**
 * Retry a fetch call specifically, handling HTTP errors.
 */
export interface FetchRetryOptions extends Omit<RetryOptions, 'retryableErrors'> {
  url: string;
  init?: RequestInit;
  onRetry?: (attempt: number, delayMs: number, error: Error) => void;
}

export async function fetchWithRetry(
  options: FetchRetryOptions
): Promise<Response> {
  const { url, init, onRetry, ...retryOpts } = options;
  
  return retryWithBackoff(
    async () => {
      const response = await fetch(url, init);
      
      if (!response.ok) {
        const status = response.status;
        const body = await response.text();
        
        // Check if this status is retryable
        const defaultRetryable = [429, 500, 502, 503];
        const isRetryable = defaultRetryable.includes(status);
        
        if (!isRetryable) {
          throw Object.assign(new Error(`HTTP ${status}: ${body}`), { status });
        }
        
        // For retryable statuses (e.g., 429 Too Many Requests), throw to trigger retry
        const err = new Error(`HTTP ${status} — will retry`);
        (err as any).status = status;
        throw err;
      }
      
      return response;
    },
    retryOpts
  ).catch(err => {
    if (onRetry) {
      onRetry(0, 0, err instanceof Error ? err : new Error(String(err)));
    }
    throw err;
  });
}
