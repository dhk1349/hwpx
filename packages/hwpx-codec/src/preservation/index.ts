import type { PreservedBag, PreservedNode } from '../model/index.js';
import { buildXml, type OrderedNode } from '../xml/index.js';

/**
 * 파서가 해석하지 못한 XML 서브트리를 raw 문자열로 보존한다. writer 가
 * 저장 시 원위치로 다시 주입한다.
 */
export function preserveNode(node: OrderedNode, path?: string): PreservedNode {
  return {
    raw: buildXml([node]),
    path,
  };
}

export function preserveRaw(raw: string, path?: string): PreservedNode {
  return { raw, path };
}

export class PreservedBagBuilder {
  private readonly nodes = new Map<string, PreservedNode>();

  add(key: string, node: PreservedNode): void {
    this.nodes.set(key, node);
  }

  build(): PreservedBag {
    return { nodes: new Map(this.nodes) };
  }
}
