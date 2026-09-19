import type { SearchRoom } from "./model";

export type SearchDelta = {
  id: string;
  count?: number | null;
  name?: string;
  alias?: string;
  members: { id: string; name: string; joined: boolean }[];
  invalid?: boolean;
};
export type SyncEdge = {
  oldToken?: string;
  token: string;
};
export type SearchCheckpoint = SyncEdge & {
  rooms: SearchDelta[];
  left: string[];
};
export type SearchSnapshot = {
  format: "classic-lazy-v2";
  token?: string;
  journal: SyncEdge[];
};
type StoredSnapshot = Omit<SearchSnapshot, "format"> & { format: string };
type Lease = { owner: string; generation: number; expires: number };

export const requestValue = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export const transactionDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

/**
 * SearchStorage and MessageSearchStorage open separate connections to the
 * same database name, so whichever connection wins the upgrade race must
 * create every store either side needs. Guarded by `contains` so this stays
 * safe to call again as later versions add stores.
 */
const SEARCH_DB_VERSION = 2;

const upgradeSearchSchema = (db: IDBDatabase): void => {
  if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
  if (!db.objectStoreNames.contains("rooms"))
    db.createObjectStore("rooms", { keyPath: "id" });
  if (!db.objectStoreNames.contains("messages")) {
    const messages = db.createObjectStore("messages", {
      keyPath: ["roomId", "eventId"],
    });
    messages.createIndex("roomId", "roomId");
  }
  if (!db.objectStoreNames.contains("messageBackfill"))
    db.createObjectStore("messageBackfill", { keyPath: "roomId" });
};

/**
 * Hands `revoke` the "logout" broadcast another tab sends before deleting
 * the database (see `SearchStorage.remove`). Close the channel with the
 * connection.
 */
export const listenForLogout = (
  name: string,
  revoke: () => void,
): BroadcastChannel | undefined => {
  if (typeof BroadcastChannel === "undefined") return undefined;
  const channel = new BroadcastChannel(name);
  channel.onmessage = (event: MessageEvent) => {
    if (event.data === "logout") revoke();
  };
  return channel;
};

/**
 * Opens the shared search database, upgraded for every store either side
 * needs, or rejects after two seconds (a blocked upgrade never settles).
 * A version change - another tab deleting it - revokes the connection.
 */
export const openSearchDatabase = async (
  name: string,
  revoke: () => void,
): Promise<IDBDatabase> => {
  const request = indexedDB.open(name, SEARCH_DB_VERSION);
  request.onupgradeneeded = () => upgradeSearchSchema(request.result);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      reject(new Error("Search database opening timed out"));
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
  db.onversionchange = revoke;
  return db;
};

export const searchDatabaseName = (
  owner: string,
  accountId: string,
  homeserver: string,
  userId: string,
): string => {
  const url = new URL(homeserver);
  url.hash = "";
  url.search = "";
  return `hub-conversation-search:${encodeURIComponent(
    JSON.stringify([owner, accountId, url.href.replace(/\/$/, ""), userId]),
  )}`;
};

/** A rebuildable database. No Matrix sync or crypto store is opened here. */
export class SearchStorage {
  private db?: IDBDatabase;
  private readonly owner = crypto.randomUUID();
  private generation?: number;
  private disposed = false;
  private channel?: BroadcastChannel;
  state: "persistent" | "memory" | "other-tab" = "memory";

  constructor(
    readonly name: string,
    private readonly onRevoked: () => void,
  ) {}

  private readonly revoke = () => {
    this.close();
    this.onRevoked();
  };

  async open(): Promise<{ snapshot?: SearchSnapshot; rooms: SearchRoom[] }> {
    try {
      this.channel = listenForLogout(this.name, this.revoke);
      const db = await openSearchDatabase(this.name, this.revoke);
      if (this.disposed) {
        db.close();
        return { rooms: [] };
      }
      this.db = db;
      const tx = db.transaction(["meta", "rooms"], "readonly");
      const done = transactionDone(tx);
      const [snapshot, rooms] = await Promise.all([
        requestValue<StoredSnapshot | undefined>(
          tx.objectStore("meta").get("snapshot"),
        ),
        requestValue<SearchRoom[]>(tx.objectStore("rooms").getAll()),
      ]);
      await done;
      this.state = "other-tab";
      // V1 stored full checkpoints and an unused anchor. Tokens alone are
      // enough to resume the rooms, so those legacy fields are not copied.
      const compatible =
        snapshot?.format === "classic-lazy-v1" ||
        snapshot?.format === "classic-lazy-v2";
      return {
        rooms,
        snapshot: compatible
          ? {
              format: "classic-lazy-v2",
              token: snapshot.token,
              journal: snapshot.journal.map(({ oldToken, token }) => ({
                oldToken,
                token,
              })),
            }
          : undefined,
      };
    } catch {
      this.state = "memory";
      return { rooms: [] };
    }
  }

  /** Checks the lease and commits checkpoint + changed relations atomically. */
  async save(
    capture: () => {
      snapshot: SearchSnapshot;
      changed: SearchRoom[];
      removed: string[];
      allRooms: Iterable<SearchRoom>;
    },
  ): Promise<void> {
    if (!this.db || this.disposed) return;
    try {
      const tx = this.db.transaction(["meta", "rooms"], "readwrite");
      const done = transactionDone(tx);
      const meta = tx.objectStore("meta");
      let wrote = false;
      const leaseRequest: IDBRequest<Lease | undefined> = meta.get("lease");
      leaseRequest.onsuccess = () => {
        const lease = leaseRequest.result;
        const now = Date.now();
        if (
          this.disposed ||
          (lease && lease.owner !== this.owner && lease.expires > now)
        ) {
          this.state = "other-tab";
          return;
        }
        const acquired = lease?.owner !== this.owner;
        // A revoked generation never writes its outstanding response.
        if (!acquired && this.generation !== lease?.generation) return;
        this.generation = acquired
          ? (lease?.generation ?? 0) + 1
          : lease.generation;
        meta.put(
          {
            owner: this.owner,
            generation: this.generation,
            expires: now + 15_000,
          } satisfies Lease,
          "lease",
        );
        const rooms = tx.objectStore("rooms");
        // Capture and structured-clone inside this synchronous transaction
        // callback: a newer sync must not advance only half the checkpoint.
        const { snapshot, changed, removed, allRooms } = capture();
        if (acquired) rooms.clear();
        for (const room of acquired ? allRooms : changed) rooms.put(room);
        for (const id of removed) rooms.delete(id);
        meta.put(snapshot, "snapshot");
        wrote = true;
      };
      await done;
      if (wrote) this.state = "persistent";
    } catch {
      this.state = "memory";
      this.db?.close();
      this.db = undefined;
    }
  }

  close(): void {
    this.disposed = true;
    if (this.db && this.generation !== undefined) {
      try {
        const tx = this.db.transaction("meta", "readwrite");
        const meta = tx.objectStore("meta");
        const request: IDBRequest<Lease | undefined> = meta.get("lease");
        request.onsuccess = () => {
          const lease = request.result;
          if (
            lease?.owner === this.owner &&
            lease.generation === this.generation
          ) {
            meta.put({ ...lease, expires: 0 }, "lease");
          }
        };
      } catch {
        // Already closed or evicted; expiration still releases the lease.
      }
    }
    this.db?.close();
    this.db = undefined;
    this.channel?.close();
    this.channel = undefined;
  }

  async remove(): Promise<void> {
    this.close();
    await SearchStorage.remove(this.name);
  }

  static async remove(name: string): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    // Revoke before deletion, so another tab's queued transaction cannot
    // resurrect an index after logout, even when database deletion is blocked.
    const channel =
      typeof BroadcastChannel === "undefined"
        ? undefined
        : new BroadcastChannel(name);
    channel?.postMessage("logout");
    channel?.close();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  }
}
