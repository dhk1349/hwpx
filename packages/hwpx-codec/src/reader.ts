import type { HwpxDocument, Section } from './model/index.js';
import { HwpxParseError } from './errors.js';
import { openHwpxZip, readTextEntry, requireTextEntry, type HwpxZipContents } from './zip/index.js';
import { parseContainer, resolveOpfPath } from './container/index.js';
import { parseOpf, parseVersion, type OpfPackage } from './opf/index.js';
import { parseHeader } from './header/index.js';
import { parseSection } from './section/index.js';
import { preserveRaw, PreservedBagBuilder } from './preservation/index.js';

/**
 * HWPX 파일 (Uint8Array) 을 HwpxDocument 로 파싱한다.
 */
export async function readHwpx(bytes: Uint8Array): Promise<HwpxDocument> {
  const contents = await openHwpxZip(bytes);
  const containerXml = requireTextEntry(contents, 'META-INF/container.xml');
  const container = parseContainer(containerXml);
  const opfPath = resolveOpfPath(container);
  const opfXml = requireTextEntry(contents, opfPath);
  const opf = parseOpf(opfXml);

  const opfDir = dirname(opfPath);
  const headerHref = findHref(opf, 'header.xml') ?? 'header.xml';
  const headerPath = resolveEntry(contents, opfDir, headerHref);
  const headerXml = requireTextEntry(contents, headerPath);
  const header = parseHeader(headerXml);

  const sections: Section[] = [];
  for (const itemref of opf.spine) {
    const item = opf.manifest.find((m) => m.id === itemref.idref);
    if (!item) {
      throw new HwpxParseError(`OPF spine references unknown item "${itemref.idref}"`);
    }
    if (!isSectionItem(item)) continue;
    const path = resolveEntry(contents, opfDir, item.href);
    const xml = requireTextEntry(contents, path);
    sections.push(parseSection(xml, item.id));
  }

  const versionText = readTextEntry(contents, 'version.xml');
  const version = versionText
    ? parseVersion(versionText)
    : { major: 0, minor: 0, micro: 0, build: 0 };

  const binaries = new Map<string, Uint8Array>();
  for (const [path, data] of contents.entries) {
    if (path.startsWith('BinData/')) binaries.set(path, data);
  }

  // manifest ID → binary path. hp:pic/hc:img 의 binaryItemIDRef 가 ID 이므로 path 찾기용.
  const binaryMap = new Map<string, string>();
  for (const item of opf.manifest) {
    const resolved = resolveEntry(contents, opfDir, item.href);
    if (resolved.startsWith('BinData/') && contents.entries.has(resolved)) {
      binaryMap.set(item.id, resolved);
    }
  }

  const preserved = new PreservedBagBuilder();
  for (const [path, data] of contents.entries) {
    if (isKnownEntry(path, opfPath, headerPath, opf, opfDir, contents)) continue;
    if (path.startsWith('BinData/')) continue;
    preserved.add(path, preserveRaw(new TextDecoder('utf-8').decode(data), path));
  }

  const settingsPath = resolveEntry(contents, opfDir, 'settings.xml');
  const settingsText = readTextEntry(contents, settingsPath);
  const settings = settingsText ? preserveRaw(settingsText, 'settings.xml') : undefined;

  return {
    version,
    metadata: opf.metadata,
    header,
    sections,
    binaries,
    binaryMap,
    preserved: preserved.build(),
    settings,
  };
}

function findHref(opf: OpfPackage, suffix: string): string | undefined {
  return opf.manifest.find((m) => m.href.endsWith(suffix))?.href;
}

/**
 * Spine in some HWPX files contains non-section items (header, scripts, etc.).
 * Only treat items that look like a section as sections.
 */
function isSectionItem(item: { id: string; href: string; mediaType: string }): boolean {
  if (item.id === 'header') return false;
  if (!item.href.toLowerCase().endsWith('.xml')) return false;
  if (!/section\d+\.xml$/i.test(item.href)) return false;
  return true;
}

function dirname(path: string): string {
  const ix = path.lastIndexOf('/');
  return ix < 0 ? '' : path.slice(0, ix);
}

function joinPath(dir: string, href: string): string {
  if (!dir) return href;
  if (href.startsWith('/')) return href.slice(1);
  return `${dir}/${href}`;
}

/**
 * HWPX manifest hrefs may be either OPF-dir-relative (EPUB convention) or
 * package-root-relative (some HWPX writers do this when content.hpf already
 * lives under Contents/). Resolve by trying the joined path first, then the
 * raw href, preferring whichever actually exists in the ZIP.
 */
function resolveEntry(contents: HwpxZipContents, opfDir: string, href: string): string {
  for (const candidate of candidatePaths(opfDir, href)) {
    if (contents.entries.has(candidate)) return candidate;
  }
  return candidatePaths(opfDir, href)[0]!;
}

function candidatePaths(opfDir: string, href: string): string[] {
  if (href.startsWith('/')) return [href.slice(1)];
  if (!opfDir) return [href];
  return [joinPath(opfDir, href), href];
}

function isKnownEntry(
  path: string,
  opfPath: string,
  headerPath: string,
  opf: OpfPackage,
  opfDir: string,
  contents: HwpxZipContents,
): boolean {
  if (path === 'mimetype') return true;
  if (path === 'META-INF/container.xml') return true;
  if (path === 'version.xml') return true;
  if (path === opfPath) return true;
  if (path === headerPath) return true;
  if (path === resolveEntry(contents, opfDir, 'settings.xml')) return true;
  for (const item of opf.manifest) {
    if (resolveEntry(contents, opfDir, item.href) === path) return true;
  }
  return false;
}

export { openHwpxZip, type HwpxZipContents };
