export interface TranslationCacheIdentity {
  readonly contentId: string;
  readonly trackId: string;
  readonly sourceText: string;
  readonly targetLanguage: string;
  readonly provider: string;
  readonly endpoint: string;
  readonly model: string;
}

interface CacheRecord {
  readonly key: string;
  readonly value: string;
  readonly accessedAt: number;
}

export async function translationCacheKey(
  identity: TranslationCacheIdentity,
): Promise<string> {
  const canonical = JSON.stringify([
    identity.contentId,
    identity.trackId,
    identity.sourceText.trim().replace(/\s+/g, ' '),
    identity.targetLanguage,
    identity.provider,
    new URL(identity.endpoint).origin +
      new URL(identity.endpoint).pathname.replace(/\/$/, ''),
    identity.model,
  ]);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export class IndexedDbTranslationCache {
  readonly #databaseName: string;
  readonly #capacity: number;
  #revision = 0;

  constructor(
    databaseName = 'duetsub-translations',
    capacity = 4_000,
  ) {
    this.#databaseName = databaseName;
    this.#capacity = capacity;
  }

  async get(
    key: string,
  ): Promise<{ readonly hit: false } | { readonly hit: true; readonly value: string }> {
    const db = await this.#open();
    const record = await request<CacheRecord | undefined>(
      db.transaction('translations').objectStore('translations').get(key),
    );
    if (record === undefined) return { hit: false };
    await this.#write({ ...record, accessedAt: this.#timestamp() });
    return { hit: true, value: record.value };
  }

  async put(key: string, value: string): Promise<void> {
    if (!value) return;
    await this.#write({ key, value, accessedAt: this.#timestamp() });
    await this.#evict();
  }

  async #write(record: CacheRecord): Promise<void> {
    const db = await this.#open();
    await transactionDone(
      db.transaction('translations', 'readwrite'),
      (store) => store.put(record),
    );
  }

  async #evict(): Promise<void> {
    const db = await this.#open();
    const count = await request<number>(
      db.transaction('translations').objectStore('translations').count(),
    );
    if (count <= this.#capacity) return;
    const transaction = db.transaction('translations', 'readwrite');
    const index = transaction.objectStore('translations').index('accessedAt');
    await new Promise<void>((resolve, reject) => {
      const cursorRequest = index.openCursor();
      cursorRequest.onerror = () => reject(cursorRequest.error);
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor !== null) cursor.delete();
        resolve();
      };
    });
    await completed(transaction);
  }

  #timestamp(): number {
    this.#revision = (this.#revision + 1) % 1_000;
    return Date.now() * 1_000 + this.#revision;
  }

  #open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(this.#databaseName, 1);
      open.onerror = () => reject(open.error);
      open.onupgradeneeded = () => {
        const store = open.result.createObjectStore('translations', {
          keyPath: 'key',
        });
        store.createIndex('accessedAt', 'accessedAt');
      };
      open.onsuccess = () => resolve(open.result);
    });
  }
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onerror = () => reject(value.error);
    value.onsuccess = () => resolve(value.result);
  });
}

async function transactionDone(
  transaction: IDBTransaction,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<void> {
  action(transaction.objectStore('translations'));
  await completed(transaction);
}

function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
