import { describe, expect, it } from "vitest";

import { MessageBackfillCoordinator } from "../messageBackfillCoordinator";

/** A job that waits to be released, recording what it saw. */
const pendingJob = (key: string, account = "account") => {
  let release: () => void = () => {};
  const job = {
    key,
    account,
    started: false,
    sawCancelled: undefined as boolean | undefined,
    release: () => release(),
    run: async (cancelled: () => boolean) => {
      job.started = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      job.sawCancelled = cancelled();
    },
  };
  return job;
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("MessageBackfillCoordinator", () => {
  it("runs two jobs at a time, first come first served", async () => {
    const pool = new MessageBackfillCoordinator();
    const [first, second, third] = ["a", "b", "c"].map((key) =>
      pendingJob(key),
    );
    [first, second, third].forEach((job) => pool.enqueue(job));
    await settle();

    expect([first.started, second.started, third.started]).toEqual([
      true,
      true,
      false,
    ]);

    first.release();
    await settle();
    expect(third.started).toBe(true);
  });

  it("does not queue a key already queued or running", async () => {
    const pool = new MessageBackfillCoordinator();
    const job = pendingJob("a");
    const duplicate = pendingJob("a");
    pool.enqueue(job);
    pool.enqueue(duplicate);
    await settle();

    expect(job.started).toBe(true);
    expect(duplicate.started).toBe(false);
  });

  it("drops queued jobs and stops running ones on cancel", async () => {
    const pool = new MessageBackfillCoordinator();
    const running = pendingJob("a", "revoked");
    const other = pendingJob("b", "kept");
    const queued = pendingJob("c", "revoked");
    [running, other, queued].forEach((job) => pool.enqueue(job));
    await settle();

    pool.cancel("revoked");
    running.release();
    other.release();
    await settle();

    expect(running.sawCancelled).toBe(true);
    expect(other.sawCancelled).toBe(false);
    expect(queued.started).toBe(false);
  });
});
