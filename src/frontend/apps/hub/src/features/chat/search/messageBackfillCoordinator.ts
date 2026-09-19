/**
 * Job pool for the bounded per-room message history backfill, shared by every
 * account: first come, first served, two at a time, so paginating history
 * never competes much with the rest of the client's requests.
 */

const MAX_CONCURRENCY = 2;

type Job = {
  /** Deduplicates: a key already queued or running is not queued again. */
  key: string;
  /** What `cancel` removes: every job of one search index. */
  account: string;
  /** Checks `cancelled()` between its steps and stops once it is true. */
  run: (cancelled: () => boolean) => Promise<void>;
};

export class MessageBackfillCoordinator {
  private readonly queued: Job[] = [];
  private readonly running = new Map<string, Job>();
  private readonly cancelled = new Set<string>();

  enqueue(job: Job): void {
    if (
      this.running.has(job.key) ||
      this.queued.some((queued) => queued.key === job.key)
    ) {
      return;
    }
    this.queued.push(job);
    this.dispatch();
  }

  /** Drops the account's queued jobs and tells its running ones to stop. */
  cancel(account: string): void {
    for (let index = this.queued.length - 1; index >= 0; index--) {
      if (this.queued[index].account === account) this.queued.splice(index, 1);
    }
    for (const [key, job] of this.running) {
      if (job.account === account) this.cancelled.add(key);
    }
  }

  private dispatch(): void {
    while (this.running.size < MAX_CONCURRENCY && this.queued.length > 0) {
      const job = this.queued.shift()!;
      this.running.set(job.key, job);
      Promise.resolve()
        .then(() => job.run(() => this.cancelled.has(job.key)))
        // The job reports its own failures; the pool only moves on.
        .catch(() => {})
        .finally(() => {
          this.running.delete(job.key);
          this.cancelled.delete(job.key);
          this.dispatch();
        });
    }
  }
}

export const messageBackfills = new MessageBackfillCoordinator();
