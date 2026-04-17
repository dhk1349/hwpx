import JSZip from 'jszip';
import { HwpxParseError } from '../errors.js';

export const HWPX_MIMETYPE = 'application/hwp+zip';

export interface HwpxZipEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface HwpxZipContents {
  readonly entries: ReadonlyMap<string, Uint8Array>;
  readonly order: readonly string[];
}

export async function openHwpxZip(bytes: Uint8Array): Promise<HwpxZipContents> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (err) {
    throw new HwpxParseError('Failed to open HWPX as ZIP container', err);
  }

  const order: string[] = [];
  const entries = new Map<string, Uint8Array>();

  const files = Object.keys(zip.files);
  for (const path of files) {
    const entry = zip.files[path];
    if (!entry || entry.dir) continue;
    order.push(path);
  }

  await Promise.all(
    order.map(async (path) => {
      const entry = zip.files[path];
      if (!entry) return;
      const data = await entry.async('uint8array');
      entries.set(path, data);
    }),
  );

  const mimetype = entries.get('mimetype');
  if (!mimetype) {
    throw new HwpxParseError('HWPX is missing "mimetype" entry');
  }
  const mimeText = new TextDecoder('utf-8').decode(mimetype).trim();
  if (mimeText !== HWPX_MIMETYPE) {
    throw new HwpxParseError(`Unexpected mimetype "${mimeText}" (expected "${HWPX_MIMETYPE}")`);
  }

  return { entries, order };
}

export function readTextEntry(contents: HwpxZipContents, path: string): string | undefined {
  const bytes = contents.entries.get(path);
  if (!bytes) return undefined;
  return new TextDecoder('utf-8').decode(bytes);
}

export function requireTextEntry(contents: HwpxZipContents, path: string): string {
  const text = readTextEntry(contents, path);
  if (text === undefined) {
    throw new HwpxParseError(`Missing required entry "${path}"`);
  }
  return text;
}

export async function buildHwpxZip(entries: readonly HwpxZipEntry[]): Promise<Uint8Array> {
  const zip = new JSZip();
  const mimetype = entries.find((e) => e.path === 'mimetype');
  if (!mimetype) {
    throw new HwpxParseError('Cannot build HWPX without "mimetype" entry');
  }
  zip.file('mimetype', toArrayBuffer(mimetype.bytes), {
    compression: 'STORE',
    createFolders: false,
  });
  for (const entry of entries) {
    if (entry.path === 'mimetype') continue;
    zip.file(entry.path, toArrayBuffer(entry.bytes), {
      compression: 'DEFLATE',
      createFolders: false,
    });
  }
  return zip.generateAsync({ type: 'uint8array' });
}

/**
 * JSZip 의 instanceof 검사가 cross-realm (예: jsdom + node 동일 vitest 워커) 에서
 * 깨질 수 있어 ArrayBuffer 로 변환한다. 동일 realm 에선 사실상 무비용 복사.
 */
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}
