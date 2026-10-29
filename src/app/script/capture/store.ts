import { checkpointBlobIds } from './catalog';

const DB_NAME = 'klecks-capture-v1';
const DB_VERSION = 3;

export type StoredWork = {
    workId: string;
    title: string;
    authorId: string;
    updatedAt: string;
    processMs: number;
};

export type StoredRecord = {
    id?: number;
    workId: string;
    sessionId: string;
    channel: string;
    payload: unknown;
};

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('records')) {
                const records = db.createObjectStore('records', { keyPath: 'id', autoIncrement: true });
                records.createIndex('workId', 'workId');
            }
            if (!db.objectStoreNames.contains('blobs')) {
                db.createObjectStore('blobs');
            }
            if (!db.objectStoreNames.contains('submissions')) {
                db.createObjectStore('submissions', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('works')) {
                db.createObjectStore('works', { keyPath: 'workId' });
            }
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings');
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export class CaptureStore {
    private dbPromise: Promise<IDBDatabase> | null = null;

    private db(): Promise<IDBDatabase> {
        if (!this.dbPromise) {
            this.dbPromise = openDb();
        }
        return this.dbPromise;
    }

    async putRecords(records: StoredRecord[]): Promise<void> {
        if (records.length === 0) {
            return;
        }
        const db = await this.db();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('records', 'readwrite');
            const store = tx.objectStore('records');
            for (const record of records) {
                store.add(record);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    }

    async putBlob(id: string, blob: Blob): Promise<void> {
        const db = await this.db();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('blobs', 'readwrite');
            tx.objectStore('blobs').put(blob, id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async getBlob(id: string): Promise<Blob | undefined> {
        const db = await this.db();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction('blobs', 'readonly');
            const request = tx.objectStore('blobs').get(id);
            request.onsuccess = () => resolve(request.result as Blob | undefined);
            request.onerror = () => reject(request.error);
        });
    }

    async putWork(work: StoredWork): Promise<void> {
        const db = await this.db();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('works', 'readwrite');
            tx.objectStore('works').put(work);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async listWorks(): Promise<StoredWork[]> {
        const db = await this.db();
        const works = await new Promise<StoredWork[]>((resolve, reject) => {
            const tx = db.transaction('works', 'readonly');
            const request = tx.objectStore('works').getAll();
            request.onsuccess = () => resolve(request.result as StoredWork[]);
            request.onerror = () => reject(request.error);
        });
        return works.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    }

    async allRecords(): Promise<StoredRecord[]> {
        const db = await this.db();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction('records', 'readonly');
            const request = tx.objectStore('records').getAll();
            request.onsuccess = () => resolve(request.result as StoredRecord[]);
            request.onerror = () => reject(request.error);
        });
    }

    async recordsForWork(workId: string): Promise<StoredRecord[]> {
        const db = await this.db();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction('records', 'readonly');
            const request = tx.objectStore('records').index('workId').getAll(workId);
            request.onsuccess = () => resolve(request.result as StoredRecord[]);
            request.onerror = () => reject(request.error);
        });
    }

    async putSubmission(record: { id: string; workId: string; status: string; at: string }): Promise<void> {
        const db = await this.db();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('submissions', 'readwrite');
            tx.objectStore('submissions').put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async getSubmission(id: string): Promise<{ id: string; status: string } | undefined> {
        const db = await this.db();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction('submissions', 'readonly');
            const request = tx.objectStore('submissions').get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getSetting(key: string): Promise<unknown> {
        const db = await this.db();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction('settings', 'readonly');
            const request = tx.objectStore('settings').get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async putSetting(key: string, value: unknown): Promise<void> {
        const db = await this.db();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('settings', 'readwrite');
            tx.objectStore('settings').put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async deleteWork(workId: string): Promise<void> {
        const blobIds = checkpointBlobIds(await this.recordsForWork(workId));
        const db = await this.db();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(['records', 'blobs', 'works', 'submissions'], 'readwrite');
            const records = tx.objectStore('records');
            const cursorRequest = records.index('workId').openCursor(IDBKeyRange.only(workId));
            cursorRequest.onsuccess = () => {
                const cursor = cursorRequest.result;
                if (!cursor) {
                    return;
                }
                cursor.delete();
                cursor.continue();
            };
            const blobs = tx.objectStore('blobs');
            for (const id of blobIds) {
                blobs.delete(id);
            }
            tx.objectStore('works').delete(workId);
            const submissions = tx.objectStore('submissions');
            const all = submissions.getAll();
            all.onsuccess = () => {
                const rows = all.result as { id: string; workId?: string }[];
                for (const row of rows) {
                    if (row.workId === workId) {
                        submissions.delete(row.id);
                    }
                }
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    }
}
