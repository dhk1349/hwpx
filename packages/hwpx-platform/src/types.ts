/**
 * 플랫폼 추상화 인터페이스. web/tauri 어댑터가 이를 구현하고,
 * hwpx-editor 는 어댑터를 주입받아 동일 코드로 동작한다.
 */

export type PlatformName = 'web' | 'tauri-desktop' | 'tauri-mobile' | 'memory';

export interface PlatformCapabilities {
  nativeMenu: boolean;
  fileHandle: boolean;
  filesystem: boolean;
  autoUpdate: boolean;
}

export interface OpenedFile {
  name: string;
  bytes: Uint8Array;
  /** 어댑터별로 의미가 다른 핸들 (예: web 의 FileSystemFileHandle, tauri 의 path 문자열) */
  handle?: unknown;
}

export interface SaveOptions {
  suggestedName: string;
  handle?: unknown;
}

export interface MenuHandlers {
  onOpen?: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onAbout?: () => void;
}

export interface RecentFile {
  name: string;
  handle: unknown;
  lastOpened: number;
}

export interface KVStore {
  get(key: string): Promise<Uint8Array | null>;
  set(key: string, value: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface PlatformAdapter {
  readonly name: PlatformName;
  readonly capabilities: PlatformCapabilities;

  openFile(opts?: { accept?: string[] }): Promise<OpenedFile | null>;
  saveFile(bytes: Uint8Array, opts: SaveOptions): Promise<{ handle?: unknown } | null>;
  saveAs(bytes: Uint8Array, opts: SaveOptions): Promise<{ handle?: unknown } | null>;

  recentFiles(): Promise<readonly RecentFile[]>;
  addRecentFile(file: RecentFile): Promise<void>;

  setMenuHandlers?(handlers: MenuHandlers): void;
  setWindowTitle?(title: string): void;
  registerShortcut?(combo: string, fn: () => void): () => void;
  notify?(opts: { title: string; body?: string }): Promise<void>;

  storage: KVStore;
}
