import type { MessageSearchDocument } from "./model";
import {
  SEARCH_DB_VERSION,
  SearchStorage,
  requestValue,
  transactionDone,
  upgradeSearchSchema,
} from "./storage";
import type { MessageBackfillState } from "./types";

const STORES = ["messages", "messageBackfill"] as const;

/**
 * A message only changes by an edit or a redaction, which every tab applies
 * alike from the same sync, so unlike SearchStorage this needs no cross-tab
 * lease: concurrent writes from several tabs are redundant, never
 * conflicting. Still listens for the
 * "logout" broadcast so its connection does not block SearchStorage's
 * deleteDatabase call on the shared database name.
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

  async open(): Promise<{
    messages: MessageSearchDocument[];
    backfill: MessageBackfillState[];
  }> {
    try {
      if (typeof BroadcastChannel !== "undefined") {
        this.channel = new BroadcastChannel(this.name);
        this.channel.onmessage = (event: MessageEvent) => {
          if (event.data === "logout") {
            this.close();
            this.onRevoked();
          }
        };
      }
      const request = indexedDB.open(this.name, SEARCH_DB_VERSION);
      request.onupgradeneeded = () => upgradeSearchSchema(request.result);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        let expired = false;
        const timer = setTimeout(() => {
          expired = true;
          reject(new Error("Message search database opening timed out"));
        }, 2_000);
        request.onsuccess = () => {
          clearTimeout(timer);
          if (expired) request.result.close();
          else resolve(request.result);
        };
        request.onerror = () => {
          clearTimeout(timer);
          reject(request.error);
        };
      });
      if (this.disposed) {
        db.close();
        return { messages: [], backfill: [] };
      }
      this.db = db;
      db.onversionchange = () => {
        this.close();
        this.onRevoked();
      };
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

  async putMessages(docs: MessageSearchDocument[]): Promise<void> {
    if (!this.db || this.disposed || docs.length === 0) return;
    try {
      const tx = this.db.transaction("messages", "readwrite");
      const store = tx.objectStore("messages");
      for (const doc of docs) store.put(doc);
      await transactionDone(tx);
    } catch {
      this.state = "memory";
      this.db?.close();
      this.db = undefined;
    }
  }

  /** Drops a redacted message, whose text must not stay searchable. */
  async deleteMessage(roomId: string, eventId: string): Promise<void> {
    if (!this.db || this.disposed) return;
    try {
      const tx = this.db.transaction("messages", "readwrite");
      tx.objectStore("messages").delete([roomId, eventId]);
      await transactionDone(tx);
    } catch {
      this.state = "memory";
      this.db?.close();
      this.db = undefined;
    }
  }

  /** Drops everything indexed for a room the account is no longer in. */
  async deleteRoom(roomId: string): Promise<void> {
    if (!this.db || this.disposed) return;
    try {
      const tx = this.db.transaction(STORES, "readwrite");
      // Keys are [roomId, eventId]: an array sorts after every string, so
      // this range holds exactly the room's messages.
      tx.objectStore("messages").delete(
        IDBKeyRange.bound([roomId], [roomId, []]),
      );
      tx.objectStore("messageBackfill").delete(roomId);
      await transactionDone(tx);
    } catch {
      this.state = "memory";
      this.db?.close();
      this.db = undefined;
    }
  }

  async putBackfillState(state: MessageBackfillState): Promise<void> {
    if (!this.db || this.disposed) return;
    try {
      const tx = this.db.transaction("messageBackfill", "readwrite");
      tx.objectStore("messageBackfill").put(state);
      await transactionDone(tx);
    } catch {
      this.state = "memory";
      this.db?.close();
      this.db = undefined;
    }
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
