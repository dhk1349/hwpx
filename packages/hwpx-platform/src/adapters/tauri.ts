import type {
  KVStore,
  MenuHandlers,
  OpenedFile,
  PlatformAdapter,
  RecentFile,
  SaveOptions,
} from '../types.js';

/**
 * Tauri 데스크톱/모바일 어댑터.
 *
 * `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs` 는
 * 브라우저 빌드에서 끌려가지 않도록 동적 import 한다.
 *
 * 메뉴 핸들러는 setMenuHandlers 로 주입받아 보관만 하고, Phase 5+ 에서
 * Rust 측 menu 이벤트와 본격 연결한다 (현재는 단축키만 사용).
 */
export class TauriAdapter implements PlatformAdapter {
  readonly name: 'tauri-desktop' | 'tauri-mobile';
  readonly capabilities = {
    nativeMenu: true,
    fileHandle: true,
    filesystem: true,
    autoUpdate: true,
  };
  readonly storage: KVStore;
  private menuHandlers: MenuHandlers = {};

  constructor(opts?: { isMobile?: boolean }) {
    this.name = opts?.isMobile ? 'tauri-mobile' : 'tauri-desktop';
    this.storage = new TauriKvStore();
  }

  async openFile(_opts?: { accept?: string[] }): Promise<OpenedFile | null> {
    const dialog = await loadDialog();
    const fs = await loadFs();
    const path = await dialog.open({
      multiple: false,
      filters: [{ name: 'HWPX', extensions: ['hwpx'] }],
    });
    if (typeof path !== 'string') return null;
    const bytes = await fs.readFile(path);
    return {
      name: basename(path),
      bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
      handle: path,
    };
  }

  async saveFile(bytes: Uint8Array, opts: SaveOptions): Promise<{ handle?: unknown } | null> {
    const path = typeof opts.handle === 'string' ? opts.handle : null;
    if (path) {
      const fs = await loadFs();
      await fs.writeFile(path, bytes);
      return { handle: path };
    }
    return this.saveAs(bytes, opts);
  }

  async saveAs(bytes: Uint8Array, opts: SaveOptions): Promise<{ handle?: unknown } | null> {
    const dialog = await loadDialog();
    const fs = await loadFs();
    const path = await dialog.save({
      defaultPath: opts.suggestedName,
      filters: [{ name: 'HWPX', extensions: ['hwpx'] }],
    });
    if (typeof path !== 'string') return null;
    await fs.writeFile(path, bytes);
    return { handle: path };
  }

  async recentFiles(): Promise<readonly RecentFile[]> {
    return [];
  }
  async addRecentFile(_file: RecentFile) {
    /* Phase 7 */
  }

  setMenuHandlers(handlers: MenuHandlers) {
    this.menuHandlers = handlers;
  }
  getMenuHandlers(): MenuHandlers {
    return this.menuHandlers;
  }

  async setWindowTitle(title: string): Promise<void> {
    try {
      const win = await loadWindow();
      const w = win.getCurrentWindow();
      await w.setTitle(title);
    } catch {
      /* not a Tauri runtime — ignore */
    }
  }
}

/* ---------------------------- dynamic imports ----------------------------- */

interface DialogModule {
  open(opts: {
    multiple?: boolean;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<string | string[] | null>;
  save(opts: {
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<string | null>;
}

interface FsModule {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, contents: Uint8Array): Promise<void>;
}

interface WindowModule {
  getCurrentWindow(): { setTitle(title: string): Promise<void> };
}

async function loadDialog(): Promise<DialogModule> {
  const mod = await import(/* @vite-ignore */ '@tauri-apps/plugin-dialog');
  return mod as unknown as DialogModule;
}
async function loadFs(): Promise<FsModule> {
  const mod = await import(/* @vite-ignore */ '@tauri-apps/plugin-fs');
  return mod as unknown as FsModule;
}
async function loadWindow(): Promise<WindowModule> {
  const mod = await import(/* @vite-ignore */ '@tauri-apps/api/window');
  return mod as unknown as WindowModule;
}

function basename(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return idx >= 0 ? path.slice(idx + 1) : path;
}

/* ----------------------------- Tauri KV store ----------------------------- */

class TauriKvStore implements KVStore {
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
