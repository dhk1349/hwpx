import type { KVStore, OpenedFile, PlatformAdapter, RecentFile, SaveOptions } from '../types.js';

/**
 * 브라우저 어댑터.
 *  - File System Access API 가 있으면 핸들 기반으로 열고/저장한다 (덮어쓰기 가능).
 *  - 없으면 input[type=file] 로 열고, a[download] blob 으로 다운로드한다.
 *
 * IndexedDB 기반 KVStore 는 brower 환경에서만 동작하며 그 외엔 in-memory fallback.
 */
export class WebAdapter implements PlatformAdapter {
  readonly name = 'web' as const;
  readonly capabilities = {
    nativeMenu: false,
    fileHandle: hasFileSystemAccess(),
    filesystem: false,
    autoUpdate: false,
  };
  readonly storage: KVStore = makeStorage();

  async openFile(opts?: { accept?: string[] }): Promise<OpenedFile | null> {
    const accept = opts?.accept ?? ['.hwpx'];
    if (this.capabilities.fileHandle) {
      try {
        return await openViaFileSystemAccess(accept);
      } catch (e) {
        if (isAbort(e)) return null;
        throw e;
      }
    }
    return await openViaInputFallback(accept);
  }

  async saveFile(bytes: Uint8Array, opts: SaveOptions): Promise<{ handle?: unknown } | null> {
    const handle = opts.handle as FileSystemHandle | undefined;
    if (handle && typeof (handle as FileSystemFileHandle).createWritable === 'function') {
      try {
        const writable = await (handle as FileSystemFileHandle).createWritable();
        await writable.write(bytes);
        await writable.close();
        return { handle };
      } catch (e) {
        if (isAbort(e)) return null;
        throw e;
      }
    }
    return this.saveAs(bytes, opts);
  }

  async saveAs(bytes: Uint8Array, opts: SaveOptions): Promise<{ handle?: unknown } | null> {
    const w = winFs();
    if (w?.showSaveFilePicker) {
      try {
        const handle = await w.showSaveFilePicker({
          suggestedName: opts.suggestedName,
          types: [
            {
              description: 'HWPX',
              accept: { 'application/hwp+zip': ['.hwpx'] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(bytes);
        await writable.close();
        return { handle };
      } catch (e) {
        if (isAbort(e)) return null;
        throw e;
      }
    }
    downloadFallback(bytes, opts.suggestedName);
    return { handle: undefined };
  }

  async recentFiles(): Promise<readonly RecentFile[]> {
    return [];
  }
  async addRecentFile(_file: RecentFile) {
    /* Phase 7 IndexedDB 마이그레이션 시 구현 */
  }
}

/* ------------------------- File System Access ----------------------------- */

interface FileSystemHandle {
  readonly kind: 'file' | 'directory';
  readonly name: string;
}
interface FileSystemFileHandle extends FileSystemHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: Uint8Array | Blob | string): Promise<void>;
    close(): Promise<void>;
  }>;
}
interface OpenPickerOpts {
  multiple?: boolean;
  types?: { description?: string; accept: Record<string, string[]> }[];
}
interface SavePickerOpts {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}
interface WindowWithFs {
  showOpenFilePicker?: (opts?: OpenPickerOpts) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (opts?: SavePickerOpts) => Promise<FileSystemFileHandle>;
}

function winFs(): WindowWithFs | undefined {
  if (typeof window === 'undefined') return undefined;
  return window as unknown as WindowWithFs;
}

function hasFileSystemAccess(): boolean {
  const w = winFs();
  return Boolean(w?.showOpenFilePicker && w?.showSaveFilePicker);
}

async function openViaFileSystemAccess(accept: string[]): Promise<OpenedFile | null> {
  const w = winFs();
  if (!w?.showOpenFilePicker) return null;
  const [handle] = await w.showOpenFilePicker({
    multiple: false,
    types: [
      {
        description: 'HWPX',
        accept: { 'application/hwp+zip': accept },
      },
    ],
  });
  if (!handle) return null;
  const file = await handle.getFile();
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { name: file.name, bytes, handle };
}

function openViaInputFallback(accept: string[]): Promise<OpenedFile | null> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept.join(',');
    input.onchange = async () => {
      try {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        const bytes = new Uint8Array(await file.arrayBuffer());
        resolve({ name: file.name, bytes });
      } catch (e) {
        reject(e);
      }
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

function downloadFallback(bytes: Uint8Array, name: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([bytes as BlobPart], { type: 'application/hwp+zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isAbort(e: unknown): boolean {
  if (e instanceof Error && (e.name === 'AbortError' || e.name === 'NotAllowedError')) {
    return true;
  }
  return false;
}

/* --------------------------------- KV ------------------------------------- */

function makeStorage(): KVStore {
  if (typeof indexedDB !== 'undefined') return new IdbStore();
  return new MemoryStore();
}

class MemoryStore implements KVStore {
  private map = new Map<string, Uint8Array>();
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: Uint8Array) {
    this.map.set(key, value);
  }
  async delete(key: string) {
    this.map.delete(key);
  }
  async list(prefix?: string) {
    return [...this.map.keys()].filter((k) => !prefix || k.startsWith(prefix));
  }
}

class IdbStore implements KVStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('hwpx-platform', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  async get(key: string): Promise<Uint8Array | null> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly');
      const store = tx.objectStore('kv');
      const r = store.get(key);
      r.onsuccess = () => resolve((r.result as Uint8Array | undefined) ?? null);
      r.onerror = () => reject(r.error);
    });
  }
  async set(key: string, value: Uint8Array): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async delete(key: string): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async list(prefix?: string): Promise<string[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly');
      const r = tx.objectStore('kv').getAllKeys();
      r.onsuccess = () => {
        const keys = (r.result as IDBValidKey[]).map(String);
        resolve(prefix ? keys.filter((k) => k.startsWith(prefix)) : keys);
      };
      r.onerror = () => reject(r.error);
    });
  }
}
