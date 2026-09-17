import type { MessageSearchDocument } from "./model";
import {
  SEARCH_DB_VERSION,
  requestValue,
  transactionDone,
  upgradeSearchSchema,
} from "./storage";
import type { MessageBackfillState } from "./types";

const STORES = ["messages", "messageBackfill"] as const;

/**
 * Messages are immutable once indexed (a given eventId never changes), so
 * unlike SearchStorage this needs no cross-tab lease: concurrent puts from
 * several tabs are just redundant, never conflicting. Still listens for the
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

  close(): void {
    this.disposed = true;
    this.db?.close();
    this.db = undefined;
    this.channel?.close();
    this.channel = undefined;
  }
}
