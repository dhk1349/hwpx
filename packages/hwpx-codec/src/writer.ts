import type { HwpxDocument } from './model/index.js';
import { HwpxWriteError, HwpxParseError } from './errors.js';
import { buildHwpxZip, HWPX_MIMETYPE, type HwpxZipEntry } from './zip/index.js';
import { serializeContainer, type Container } from './container/index.js';
import { serializeOpf, serializeVersion, type OpfPackage } from './opf/index.js';
import { serializeHeader } from './header/index.js';
import { serializeSection } from './section/index.js';

const DEFAULT_OPF_DIR = 'Contents';

/**
 * HwpxDocument → .hwpx (Uint8Array)
 *
 * 라운드트립 정책:
 *   - mimetype 은 항상 STORE 압축으로 첫 엔트리
 *   - container.xml / content.hpf / header.xml / sectionN.xml 은 모델에서 재생성
 *   - settings.xml 은 PreservedNode 가 있으면 raw 그대로
 *   - PreservedBag (Preview/, Scripts/ 등) 도 raw 그대로 다시 주입
 *   - BinData/* 는 binaries 맵에서 그대로 복사
 */
export async function writeHwpx(doc: HwpxDocument): Promise<Uint8Array> {
  const entries: HwpxZipEntry[] = [];
  const enc = new TextEncoder();

  entries.push({ path: 'mimetype', bytes: enc.encode(HWPX_MIMETYPE) });

  entries.push({
    path: 'version.xml',
    bytes: enc.encode(serializeVersion(doc.version)),
  });

  const sectionFiles: { id: string; href: string }[] = doc.sections.map((s, i) => ({
    id: s.id || `section${i}`,
    href: `section${i}.xml`,
  }));

  const manifest = [
    { id: 'header', href: 'header.xml', mediaType: 'application/xml' },
    ...sectionFiles.map((s) => ({
      id: s.id,
      href: s.href,
      mediaType: 'application/xml',
    })),
    { id: 'settings', href: 'settings.xml', mediaType: 'application/xml' },
  ];
  const spine = sectionFiles.map((s) => ({ idref: s.id }));

  const opf: OpfPackage = {
    version: '1.0',
    metadata: doc.metadata,
    manifest,
    spine,
  };

  const opfPath = `${DEFAULT_OPF_DIR}/content.hpf`;
  entries.push({ path: opfPath, bytes: enc.encode(serializeOpf(opf)) });

  const container: Container = {
    rootfiles: [{ fullPath: opfPath, mediaType: 'application/hwpml-package+xml' }],
  };
  entries.push({
    path: 'META-INF/container.xml',
    bytes: enc.encode(serializeContainer(container)),
  });

  entries.push({
    path: `${DEFAULT_OPF_DIR}/header.xml`,
    bytes: enc.encode(serializeHeader(doc.header)),
  });

  doc.sections.forEach((sec, i) => {
    entries.push({
      path: `${DEFAULT_OPF_DIR}/${sectionFiles[i]!.href}`,
      bytes: enc.encode(serializeSection(sec)),
    });
  });

  const settingsBytes = doc.settings
    ? enc.encode(doc.settings.raw)
    : enc.encode(DEFAULT_SETTINGS_XML);
  entries.push({ path: `${DEFAULT_OPF_DIR}/settings.xml`, bytes: settingsBytes });

  for (const [path, data] of doc.binaries) {
    if (!path.startsWith('BinData/')) {
      throw new HwpxWriteError(`Binary entry "${path}" must live under BinData/`);
    }
    entries.push({ path, bytes: data });
  }

  for (const [path, node] of doc.preserved.nodes) {
    if (entries.some((e) => e.path === path)) continue;
    entries.push({ path, bytes: enc.encode(node.raw) });
  }

  try {
    return await buildHwpxZip(entries);
  } catch (err) {
    if (err instanceof HwpxParseError || err instanceof HwpxWriteError) throw err;
    throw new HwpxWriteError('Failed to build HWPX zip', err);
  }
}

const DEFAULT_SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"/>`;
