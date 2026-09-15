/**
 * Job pool coordinator for bounded per-room message history backfill.
 * Separate from memberAcquisitions: backfill jobs are long paginating loops,
 * not one-shot calls. Concurrency capped at 2 (lower than member acquisition's 4)
 * to avoid starving the member-acquisition signal.
 */

type Job = {
  key: string;
  account: string;
  activity: number; // Timestamp of last activity
  added: number; // Timestamp when enqueued
  due: number; // Earliest time to dispatch
  run: (cancelled: () => boolean) => Promise<void>;
};

export class MessageBackfillCoordinator {
  private readonly queued = new Map<string, Job>();
  private readonly running = new Set<string>();
  private readonly MAX_CONCURRENCY = 2;
  private nextSchedule: ReturnType<typeof setTimeout> | undefined;

  enqueue(job: Job): void {
    // Dedup: no-op if already queued or running
    if (this.queued.has(job.key) || this.running.has(job.key)) {
      return;
    }
    this.queued.set(job.key, job);
    this.schedule();
  }

  cancel(account: string): void {
    // Remove all queued jobs for this account
    for (const [key, job] of this.queued.entries()) {
      if (job.account === account) {
        this.queued.delete(key);
      }
    }
  }

  private schedule(): void {
    if (this.running.size >= this.MAX_CONCURRENCY) return;

    const now = Date.now();
    let best: Job | null = null;
    let bestKey: string | null = null;

    // Find best eligible job (due <= now)
    const aged = now - 60_000; // 60s ago
    for (const [key, job] of this.queued.entries()) {
      if (job.due > now) continue; // Not due yet

      // Starvation guard: after 60s in queue, oldest-first wins regardless of account
      if (best === null) {
        best = job;
        bestKey = key;
      } else if (job.added < aged) {
        if (best.added >= aged || job.added < best.added) {
          best = job;
          bestKey = key;
        }
      } else if (best.added >= aged) {
        // Both recent: prefer different account than last job, then higher activity
        if (job.added < best.added) {
          best = job;
          bestKey = key;
        }
      }
    }

    if (!best || !bestKey) {
      // No eligible job yet; schedule retry at earliest due time
      let nextDue = Infinity;
      for (const job of this.queued.values()) {
        if (job.due < nextDue) nextDue = job.due;
      }
      if (nextDue !== Infinity) {
        clearTimeout(this.nextSchedule);
        this.nextSchedule = setTimeout(() => this.schedule(), nextDue - now);
      }
      return;
    }

    // Dispatch the best job
    this.queued.delete(bestKey);
    this.running.add(bestKey);

    const isCancelled = () => !this.running.has(bestKey);

    Promise.resolve()
      .then(() => best!.run(isCancelled))
      .catch(() => {
        // Swallow errors; the job is responsible for its own logging
      })
      .finally(() => {
        this.running.delete(bestKey!);
        this.schedule();
      });
  }
}

export const messageBackfills = new MessageBackfillCoordinator();
