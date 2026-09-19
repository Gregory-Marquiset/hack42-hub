import type { MessageSearchDocument } from "./model";
import {
  SearchStorage,
  listenForLogout,
  openSearchDatabase,
  requestValue,
  transactionDone,
} from "./storage";
import type { MessageBackfillState } from "./types";

const STORES = ["messages", "messageBackfill"] as const;
type Store = (typeof STORES)[number];

/**
 * A message only changes by an edit or a redaction, which every tab applies
 * alike from the same sync, so unlike SearchStorage this needs no cross-tab
 * lease: concurrent writes from several tabs are redundant, never
 * conflicting. Still listens for the "logout" broadcast so its connection
 * does not block SearchStorage's deleteDatabase call on the shared database
 * name.
 */
export class MessageSearchStorage {
  private db?: IDBDatabase;
  private disposed = false;
  private channel?: BroadcastChannel;
  state: "persistent" | "memory" = "memory";

  constructor(
    readonly name: string,
    private readonly onRevoked: () => void,
  ) {}

  private readonly revoke = () => {
    this.close();
    this.onRevoked();
  };

  async open(): Promise<{
    messages: MessageSearchDocument[];
    backfill: MessageBackfillState[];
  }> {
    try {
      this.channel = listenForLogout(this.name, this.revoke);
      const db = await openSearchDatabase(this.name, this.revoke);
      if (this.disposed) {
        db.close();
        return { messages: [], backfill: [] };
      }
      this.db = db;
      const tx = db.transaction(STORES, "readonly");
      const done = transactionDone(tx);
      const [messages, backfill] = await Promise.all([
        requestValue<MessageSearchDocument[]>(
          tx.objectStore("messages").getAll(),
        ),
        requestValue<MessageBackfillState[]>(
          tx.objectStore("messageBackfill").getAll(),
        ),
      ]);
      await done;
      this.state = "persistent";
      return { messages, backfill };
    } catch {
      this.state = "memory";
      return { messages: [], backfill: [] };
    }
  }

  /** One write transaction; a failure leaves the index in memory only. */
  private async write(
    stores: Store | readonly Store[],
    apply: (transaction: IDBTransaction) => void,
  ): Promise<void> {
    if (!this.db || this.disposed) return;
    try {
      const tx = this.db.transaction(stores, "readwrite");
      apply(tx);
      await transactionDone(tx);
    } catch {
      this.state = "memory";
      this.db?.close();
      this.db = undefined;
    }
  }

  async putMessages(docs: MessageSearchDocument[]): Promise<void> {
    if (docs.length === 0) return;
    await this.write("messages", (tx) => {
      const store = tx.objectStore("messages");
      for (const doc of docs) store.put(doc);
    });
  }

  /** Drops a redacted message, whose text must not stay searchable. */
  async deleteMessage(roomId: string, eventId: string): Promise<void> {
    await this.write("messages", (tx) =>
      tx.objectStore("messages").delete([roomId, eventId]),
    );
  }

  /** Drops everything indexed for a room the account is no longer in. */
  async deleteRoom(roomId: string): Promise<void> {
    await this.write(STORES, (tx) => {
      // Keys are [roomId, eventId]: an array sorts after every string, so
      // this range holds exactly the room's messages.
      tx.objectStore("messages").delete(
        IDBKeyRange.bound([roomId], [roomId, []]),
      );
      tx.objectStore("messageBackfill").delete(roomId);
    });
  }

  async putBackfillState(state: MessageBackfillState): Promise<void> {
    await this.write("messageBackfill", (tx) =>
      tx.objectStore("messageBackfill").put(state),
    );
  }

  /**
   * Erases the stored messages. They share their database with the
   * conversation index, which goes with them: only a logout calls this.
   */
  async remove(): Promise<void> {
    this.close();
    await SearchStorage.remove(this.name);
  }

  close(): void {
    this.disposed = true;
    this.db?.close();
    this.db = undefined;
    this.channel?.close();
    this.channel = undefined;
  }
}
