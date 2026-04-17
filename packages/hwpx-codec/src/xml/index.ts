import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { HwpxParseError } from '../errors.js';

/**
 * preserveOrder 모드의 노드 하나. fast-xml-parser 의 내부 표현을 그대로 재노출한다.
 *
 *   { "hp:p": [...children], ":@": { "@_id": "0" } }
 *   { "#text": "hello" }
 *
 * 자식 배열은 부모의 태그 이름을 키로 갖는 객체들의 배열이다.
 */
export interface OrderedNode {
  [key: string]: unknown;
}

const ATTR_KEY = ':@';
const ATTR_PREFIX = '@_';
const TEXT_KEY = '#text';

// preserveOrder 모드에서 fast-xml-parser 는 자동으로 ":@" 키 아래에
// 속성을 모아준다. attributesGroupName 을 별도 지정하면 이중 중첩이 발생한다.
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: true,
  removeNSPrefix: false,
});

const builder = new XMLBuilder({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  suppressEmptyNode: true,
  format: false,
});

export function parseXml(source: string): OrderedNode[] {
  if (/<!DOCTYPE/i.test(source)) {
    throw new HwpxParseError('DOCTYPE is not permitted in HWPX XML (XXE protection)');
  }
  try {
    return parser.parse(source) as OrderedNode[];
  } catch (err) {
    throw new HwpxParseError('Failed to parse XML', err);
  }
}

export function buildXml(nodes: OrderedNode[]): string {
  return builder.build(nodes) as string;
}

export function tagName(node: OrderedNode): string | undefined {
  for (const key of Object.keys(node)) {
    if (key === ATTR_KEY) continue;
    return key;
  }
  return undefined;
}

export function children(node: OrderedNode): OrderedNode[] {
  const name = tagName(node);
  if (!name) return [];
  const value = node[name];
  return Array.isArray(value) ? (value as OrderedNode[]) : [];
}

export function attrs(node: OrderedNode): Record<string, string> {
  const group = node[ATTR_KEY];
  if (!group || typeof group !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(group as Record<string, unknown>)) {
    if (k.startsWith(ATTR_PREFIX)) {
      out[k.slice(ATTR_PREFIX.length)] = String(v);
    }
  }
  return out;
}

export function textOf(node: OrderedNode): string | undefined {
  const name = tagName(node);
  if (name === TEXT_KEY) return String(node[TEXT_KEY] ?? '');
  return undefined;
}

export function findChild(node: OrderedNode, name: string): OrderedNode | undefined {
  for (const child of children(node)) {
    if (tagName(child) === name) return child;
  }
  return undefined;
}

export function findChildren(node: OrderedNode, name: string): OrderedNode[] {
  return children(node).filter((c) => tagName(c) === name);
}

/**
 * 문서 루트(파싱 결과 배열)에서 주어진 이름의 첫 요소를 찾는다.
 */
export function findRoot(doc: OrderedNode[], name: string): OrderedNode | undefined {
  for (const node of doc) {
    if (tagName(node) === name) return node;
  }
  return undefined;
}

/**
 * 문서 루트에서 네임스페이스 prefix 와 무관하게 로컬 이름으로 첫 요소를 찾는다.
 * 일부 HWPX 파일은 같은 의미인데도 다른 prefix (예: `hv:HCFVersion` vs `ha:HCFVersion`) 를 쓴다.
 */
export function findRootByLocalName(doc: OrderedNode[], localName: string): OrderedNode | undefined {
  for (const node of doc) {
    const name = tagName(node);
    if (!name) continue;
    if (localName === (name.includes(':') ? name.split(':')[1] : name)) return node;
  }
  return undefined;
}

export function collectText(node: OrderedNode): string {
  const name = tagName(node);
  if (name === TEXT_KEY) return String(node[TEXT_KEY] ?? '');
  let out = '';
  for (const child of children(node)) {
    out += collectText(child);
  }
  return out;
}

export { ATTR_KEY, ATTR_PREFIX, TEXT_KEY };

/**
 * preserveOrder 형식의 요소 노드를 만든다. 빈 attrs 객체는 생략한다.
 */
export function elem(
  name: string,
  attrs: Readonly<Record<string, string | undefined>> = {},
  children: OrderedNode[] = [],
): OrderedNode {
  const node: OrderedNode = { [name]: children };
  const filtered: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue;
    filtered[`${ATTR_PREFIX}${k}`] = v;
  }
  if (Object.keys(filtered).length > 0) {
    node[ATTR_KEY] = filtered;
  }
  return node;
}

export function text(value: string): OrderedNode {
  return { [TEXT_KEY]: value };
}

/**
 * raw XML 조각을 다시 OrderedNode 배열로 파싱해 다른 트리에 삽입할 수 있게 한다.
 * OpaqueInline / PreservedNode 의 라운드트립 시 사용.
 */
export function reparse(raw: string): OrderedNode[] {
  return parseXml(raw);
}

export const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export function buildDocument(root: OrderedNode): string {
  return XML_DECL + buildXml([root]);
}
