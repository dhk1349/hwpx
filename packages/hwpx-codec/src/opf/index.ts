import type { Metadata, VersionInfo } from '../model/index.js';
import { HwpxParseError } from '../errors.js';
import {
  attrs,
  buildDocument,
  children,
  collectText,
  elem,
  findChild,
  findChildren,
  findRoot,
  findRootByLocalName,
  parseXml,
  tagName,
  text,
} from '../xml/index.js';

export interface OpfManifestItem {
  readonly id: string;
  readonly href: string;
  readonly mediaType: string;
}

export interface OpfSpineItemref {
  readonly idref: string;
}

export interface OpfPackage {
  readonly version?: string;
  readonly metadata: Metadata;
  readonly manifest: readonly OpfManifestItem[];
  readonly spine: readonly OpfSpineItemref[];
}

/**
 * Contents/content.hpf
 *
 *   <opf:package xmlns:opf="..." xmlns:dc="..." version="...">
 *     <opf:metadata>...dc:title, dc:creator, dc:date...</opf:metadata>
 *     <opf:manifest>
 *       <opf:item id="header" href="header.xml" media-type="application/xml"/>
 *       <opf:item id="section0" href="section0.xml" .../>
 *     </opf:manifest>
 *     <opf:spine>
 *       <opf:itemref idref="section0"/>
 *     </opf:spine>
 *   </opf:package>
 */
export function parseOpf(xml: string): OpfPackage {
  const doc = parseXml(xml);
  const pkg =
    findRoot(doc, 'opf:package') ??
    findRoot(doc, 'package') ??
    findRoot(doc, 'opf:Package') ??
    findRoot(doc, 'Package') ??
    findRootByLocalName(doc, 'package') ??
    findRootByLocalName(doc, 'Package');
  if (!pkg) {
    throw new HwpxParseError('content.hpf: missing <package> root');
  }

  const version = attrs(pkg)['version'];

  const metaNode = findChild(pkg, 'opf:metadata') ?? findChild(pkg, 'metadata');
  const metadata = metaNode ? parseMetadata(metaNode) : {};

  const manifestNode = findChild(pkg, 'opf:manifest') ?? findChild(pkg, 'manifest');
  const manifest: OpfManifestItem[] = [];
  if (manifestNode) {
    const items = [
      ...findChildren(manifestNode, 'opf:item'),
      ...findChildren(manifestNode, 'item'),
    ];
    for (const item of items) {
      const a = attrs(item);
      const id = a['id'];
      const href = a['href'];
      if (!id || !href) {
        throw new HwpxParseError('content.hpf: <item> missing id or href');
      }
      manifest.push({
        id,
        href,
        mediaType: a['media-type'] ?? 'application/octet-stream',
      });
    }
  }

  const spineNode = findChild(pkg, 'opf:spine') ?? findChild(pkg, 'spine');
  const spine: OpfSpineItemref[] = [];
  if (spineNode) {
    const refs = [...findChildren(spineNode, 'opf:itemref'), ...findChildren(spineNode, 'itemref')];
    for (const ref of refs) {
      const idref = attrs(ref)['idref'];
      if (!idref) {
        throw new HwpxParseError('content.hpf: <itemref> missing idref');
      }
      spine.push({ idref });
    }
  }

  return { version, metadata, manifest, spine };
}

function parseMetadata(node: Parameters<typeof children>[0]): Metadata {
  const out: Record<string, string> = {};
  for (const child of children(node)) {
    const name = tagName(child);
    if (!name) continue;
    const local = name.includes(':') ? name.split(':')[1] : name;
    if (!local) continue;
    const text = collectText(child).trim();
    if (!text) continue;
    out[local] = text;
  }
  return {
    title: out['title'],
    creator: out['creator'],
    date: out['date'],
    language: out['language'],
    subject: out['subject'],
    description: out['description'],
    publisher: out['publisher'],
  };
}

/**
 * version.xml
 *
 *   <ha:HCFVersion xmlns:ha="..." targetApplication="WORDPROC"
 *                  major="5" minor="1" micro="0" buildNumber="0" os="Windows"/>
 *
 * 일부 버전에서는 `build` 속성명을 쓰기도 한다.
 */
export function parseVersion(xml: string): VersionInfo {
  const doc = parseXml(xml);
  const root =
    findRoot(doc, 'ha:HCFVersion') ??
    findRoot(doc, 'HCFVersion') ??
    findRoot(doc, 'ha:version') ??
    findRoot(doc, 'version') ??
    findRootByLocalName(doc, 'HCFVersion') ??
    findRootByLocalName(doc, 'version');
  if (!root) {
    throw new HwpxParseError('version.xml: missing root element');
  }
  const a = attrs(root);
  return {
    major: toInt(a['major'], 0),
    minor: toInt(a['minor'], 0),
    micro: toInt(a['micro'], 0),
    build: toInt(a['buildNumber'] ?? a['build'], 0),
    targetApplication: a['targetApplication'],
  };
}

function toInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const OPF_NS = 'http://www.idpf.org/2007/opf';
const DC_NS = 'http://purl.org/dc/elements/1.1/';
const HA_NS = 'http://www.hancom.co.kr/hwpml/2011/app';

export function serializeOpf(pkg: OpfPackage): string {
  const metadataChildren: ReturnType<typeof elem>[] = [];
  const m = pkg.metadata;
  if (m.title) metadataChildren.push(elem('dc:title', {}, [text(m.title)]));
  if (m.creator) metadataChildren.push(elem('dc:creator', {}, [text(m.creator)]));
  if (m.date) metadataChildren.push(elem('dc:date', {}, [text(m.date)]));
  if (m.language) metadataChildren.push(elem('dc:language', {}, [text(m.language)]));
  if (m.subject) metadataChildren.push(elem('dc:subject', {}, [text(m.subject)]));
  if (m.description) metadataChildren.push(elem('dc:description', {}, [text(m.description)]));
  if (m.publisher) metadataChildren.push(elem('dc:publisher', {}, [text(m.publisher)]));

  const manifest = pkg.manifest.map((item) =>
    elem('opf:item', { id: item.id, href: item.href, 'media-type': item.mediaType }),
  );
  const spine = pkg.spine.map((s) => elem('opf:itemref', { idref: s.idref }));

  const root = elem(
    'opf:package',
    {
      'xmlns:opf': OPF_NS,
      'xmlns:dc': DC_NS,
      version: pkg.version ?? '1.0',
    },
    [
      elem('opf:metadata', {}, metadataChildren),
      elem('opf:manifest', {}, manifest),
      elem('opf:spine', {}, spine),
    ],
  );
  return buildDocument(root);
}

export function serializeVersion(v: VersionInfo): string {
  const root = elem('ha:HCFVersion', {
    'xmlns:ha': HA_NS,
    targetApplication: v.targetApplication ?? 'WORDPROC',
    major: String(v.major),
    minor: String(v.minor),
    micro: String(v.micro),
    buildNumber: String(v.build),
  });
  return buildDocument(root);
}
