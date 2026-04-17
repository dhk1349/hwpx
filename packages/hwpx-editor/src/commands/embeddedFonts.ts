/**
 * HWPX 문서 내부(BinData/)에 임베딩된 TTF/OTF 폰트를 런타임 `@font-face` 로 주입한다.
 * 사용자의 시스템에 원본 폰트가 없어도 문서 작성 시 지정된 모양으로 표시되도록 하기 위함.
 *
 * 전역 document 의 FontFace 집합을 건드리므로 여러 문서를 동시에 열 경우
 * family 이름 충돌 가능성이 있다 — MVP 에서는 마지막에 열린 문서가 우선한다.
 */
import type { HwpxDocument } from '@hwpx/codec';

type FontFormat = 'truetype' | 'opentype' | 'woff' | 'woff2' | 'embedded-opentype';

const MIME_BY_TYPE: Record<string, FontFormat> = {
  ttf: 'truetype',
  otf: 'opentype',
  woff: 'woff',
  woff2: 'woff2',
  eot: 'embedded-opentype',
};

/**
 * 현재 등록된 font family 를 추적해 중복 로드를 막는다.
 * key = family name, value = blob URL (cleanup 용).
 */
const registered = new Map<string, string>();

function findFontBinary(
  doc: HwpxDocument,
  ref: string | undefined,
  type: string | undefined,
): { bytes: Uint8Array; format: FontFormat } | undefined {
  const format = MIME_BY_TYPE[(type ?? 'ttf').toLowerCase()] ?? 'truetype';
  const candidates: string[] = [];
  if (ref) {
    // 1순위: manifest ID → path
    const mapped = doc.binaryMap?.get(ref);
    if (mapped) candidates.push(mapped);
    candidates.push(`BinData/${ref}`);
    candidates.push(`BinData/${ref}.${type ?? 'ttf'}`);
  }
  for (const key of doc.binaries.keys()) {
    if (ref && key.includes(ref)) candidates.push(key);
  }
  for (const path of candidates) {
    const bytes = doc.binaries.get(path);
    if (bytes && bytes.byteLength > 0) return { bytes, format };
  }
  return undefined;
}

/**
 * 문서 로드 시 한 번 호출. 이전 등록을 정리하고 현재 doc 의 임베딩 폰트들을 등록한다.
 * FontFace API 가 지원되지 않는 환경에서는 조용히 건너뛴다.
 */
export async function registerEmbeddedFonts(doc: HwpxDocument): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;

  // 이전 등록 해제
  for (const [family, url] of registered) {
    const toRemove: FontFace[] = [];
    if (document.fonts && typeof document.fonts.forEach === 'function') {
      document.fonts.forEach((f) => {
        if (f.family.replace(/^"|"$/g, '') === family) toRemove.push(f);
      });
    }
    for (const f of toRemove) document.fonts.delete(f);
    URL.revokeObjectURL(url);
  }
  registered.clear();

  for (const face of doc.header.fontFaces) {
    if (!face.isEmbedded || !face.name) continue;
    const bin = findFontBinary(doc, face.binaryItemIDRef, face.type);
    if (!bin) continue;
    try {
      const blob = new Blob([bin.bytes as BlobPart], { type: `font/${face.type ?? 'ttf'}` });
      const url = URL.createObjectURL(blob);
      // FontFace 생성자는 ArrayBuffer 또는 URL 문자열을 받는다. URL 경로를 전달하면 브라우저가 fetch 한다.
      const ff = new FontFace(face.name, `url(${JSON.stringify(url)}) format("${bin.format}")`);
      await ff.load();
      document.fonts.add(ff);
      registered.set(face.name, url);
    } catch (err) {
      console.warn('[hwpx] failed to register embedded font', face.name, err);
    }
  }
}

/** 테스트용 / 현재 등록된 family 이름 목록 */
export function registeredFontFamilies(): readonly string[] {
  return [...registered.keys()];
}
