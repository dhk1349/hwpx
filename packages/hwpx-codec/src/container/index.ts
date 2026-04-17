import { HwpxParseError } from '../errors.js';
import {
  attrs,
  buildDocument,
  children,
  elem,
  findChild,
  findRoot,
  parseXml,
  tagName,
} from '../xml/index.js';

export interface ContainerRootfile {
  readonly fullPath: string;
  readonly mediaType: string;
}

export interface Container {
  readonly rootfiles: readonly ContainerRootfile[];
}

/**
 * META-INF/container.xml
 *
 *   <ocf:container xmlns:ocf="...">
 *     <ocf:rootfiles>
 *       <ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>
 *     </ocf:rootfiles>
 *   </ocf:container>
 */
export function parseContainer(xml: string): Container {
  const doc = parseXml(xml);
  const root = findRoot(doc, 'ocf:container') ?? findRoot(doc, 'container');
  if (!root) {
    throw new HwpxParseError('container.xml: missing <container> root');
  }
  const rootfilesNode = findChild(root, 'ocf:rootfiles') ?? findChild(root, 'rootfiles');
  if (!rootfilesNode) {
    throw new HwpxParseError('container.xml: missing <rootfiles>');
  }

  const rootfiles: ContainerRootfile[] = [];
  for (const child of children(rootfilesNode)) {
    const name = tagName(child);
    if (name !== 'ocf:rootfile' && name !== 'rootfile') continue;
    const a = attrs(child);
    const fullPath: string | undefined = a['full-path'];
    const mediaType: string | undefined = a['media-type'];
    if (!fullPath || !mediaType) {
      throw new HwpxParseError('container.xml: <rootfile> missing required attributes');
    }
    rootfiles.push({ fullPath, mediaType });
  }
  if (rootfiles.length === 0) {
    throw new HwpxParseError('container.xml: no <rootfile> entries');
  }
  return { rootfiles };
}

export function resolveOpfPath(container: Container): string {
  const hpf = container.rootfiles.find(
    (rf) => rf.mediaType === 'application/hwpml-package+xml' || rf.fullPath.endsWith('.hpf'),
  );
  if (!hpf) {
    throw new HwpxParseError('container.xml: no HWPX OPF rootfile');
  }
  return hpf.fullPath;
}

const OCF_NS = 'urn:oasis:names:tc:opendocument:xmlns:container';

export function serializeContainer(container: Container): string {
  const rootfileNodes = container.rootfiles.map((rf) =>
    elem('ocf:rootfile', {
      'full-path': rf.fullPath,
      'media-type': rf.mediaType,
    }),
  );
  const root = elem('ocf:container', { 'xmlns:ocf': OCF_NS }, [
    elem('ocf:rootfiles', {}, rootfileNodes),
  ]);
  return buildDocument(root);
}
