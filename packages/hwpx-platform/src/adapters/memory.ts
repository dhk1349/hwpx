import type { KVStore, OpenedFile, PlatformAdapter, RecentFile, SaveOptions } from '../types.js';

class MemoryStorage implements KVStore {
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

export class MemoryAdapter implements PlatformAdapter {
  readonly name = 'memory' as const;
  readonly capabilities = {
    nativeMenu: false,
    fileHandle: false,
    filesystem: false,
    autoUpdate: false,
  };
  readonly storage = new MemoryStorage();

  private recents: RecentFile[] = [];
  private lastSaved: { bytes: Uint8Array; opts: SaveOptions } | null = null;
  private nextOpen: OpenedFile | null = null;

  setNextOpen(file: OpenedFile | null) {
    this.nextOpen = file;
  }
  getLastSaved() {
    return this.lastSaved;
  }

  async openFile() {
    return this.nextOpen;
  }
  async saveFile(bytes: Uint8Array, opts: SaveOptions) {
    this.lastSaved = { bytes, opts };
    return { handle: opts.handle };
  }
  async saveAs(bytes: Uint8Array, opts: SaveOptions) {
    return this.saveFile(bytes, opts);
  }
  async recentFiles() {
    return this.recents;
  }
  async addRecentFile(file: RecentFile) {
    this.recents.unshift(file);
  }
}
