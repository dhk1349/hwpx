import { useSyncExternalStore } from 'react';
import type { EditorController } from './Editor.js';

/**
 * EditorController.subscribe 를 React 의 외부 store 로 어댑트.
 * `controller` 가 null 일 때는 항상 fallback 을 반환한다.
 *
 * selector 결과는 매 호출마다 동일성 (===) 비교되므로 객체 대신 primitive
 * 또는 캐시된 참조를 반환하라.
 */
export function useEditorObservable<T>(
  controller: EditorController | null,
  selector: (c: EditorController) => T,
  fallback: T,
): T {
  return useSyncExternalStore(
    (cb) => (controller ? controller.subscribe(cb) : noop),
    () => (controller ? selector(controller) : fallback),
    () => fallback,
  );
}

const noop = () => {};
