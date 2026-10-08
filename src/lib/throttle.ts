/**
 * Serialized back-off for failed credential checks.
 *
 * Every check runs one at a time, and each failure holds the queue for a
 * growing delay (0.6 s, doubling, capped at 30 s) until a check succeeds.
 * Parallel guesses therefore wait behind each other instead of each paying one
 * short delay. It is per process and in memory, which is all a single-user
 * server needs, and it uses nothing but timers and promises so it runs in the
 * Edge middleware as well as Node routes.
 */
export class FailureThrottle {
  private queue: Promise<unknown> = Promise.resolve();
  private failures = 0;
  private pending = 0;

  constructor(
    private readonly baseMs = 600,
    private readonly maxMs = 30_000,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
    /** Attempts allowed to wait at once; beyond this, callers should refuse fast. */
    private readonly maxPending = 16
  ) {}

  /** Delay before the next attempt after `failures` consecutive failures. */
  backoffMs(failures = this.failures): number {
    if (failures <= 0) return 0;
    return Math.min(this.maxMs, this.baseMs * 2 ** (failures - 1));
  }

  get consecutiveFailures(): number {
    return this.failures;
  }

  /**
   * Whether the queue is full. A flood of guesses would otherwise pile up
   * promises without limit; refusing with 429 keeps memory bounded and tells
   * a real client to retry later.
   */
  get saturated(): boolean {
    return this.pending >= this.maxPending;
  }

  /**
   * Run `check` in turn. A false result counts as a failure and holds every
   * attempt queued behind it for the back-off delay; a true one resets it.
   */
  attempt(check: () => boolean | Promise<boolean>): Promise<boolean> {
    this.pending++;
    const work = async () => {
      const ok = await check();
      this.failures = ok ? 0 : this.failures + 1;
      if (!ok) await this.sleep(this.backoffMs());
      return ok;
    };
    const run = this.queue.then(work, work).finally(() => {
      this.pending--;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}
