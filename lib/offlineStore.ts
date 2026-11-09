// Offline reading (Settings → Extras): seforim downloaded to the phone (IndexedDB), to read with no internet.
// Browser-only.
import type { SourceData } from './db';

export type OfflineBook = { title: string; he: string; kind: string; shape: unknown; refs: string[]; savedAt: string };

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('chavrusa-offline', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('texts'); r.result.createObjectStore('books'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => { const q = fn(db.transaction(store, mode).objectStore(store)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
export const offlineOn = () => { try { return localStorage.getItem('chavrusa-offline') === '1'; } catch { return false; } };
export const putText = (ref: string, s: SourceData) => tx('texts', 'readwrite', (o) => o.put(s, ref));
export const getOfflineText = (ref: string) => tx<SourceData | undefined>('texts', 'readonly', (o) => o.get(ref)).catch(() => undefined);
export const putBook = (b: OfflineBook) => tx('books', 'readwrite', (o) => o.put(b, b.title));
export const getBook = (title: string) => tx<OfflineBook | undefined>('books', 'readonly', (o) => o.get(title)).catch(() => undefined);
export const listBooks = () => tx<OfflineBook[]>('books', 'readonly', (o) => o.getAll() as IDBRequest<OfflineBook[]>).catch(() => [] as OfflineBook[]);
export async function removeBook(title: string) {
  const b = await getBook(title);
  for (const r of b?.refs ?? []) await tx('texts', 'readwrite', (o) => o.delete(r)).catch(() => {});
  await tx('books', 'readwrite', (o) => o.delete(title)).catch(() => {});
}
