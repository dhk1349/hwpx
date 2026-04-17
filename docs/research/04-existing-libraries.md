# 기존 HWP/HWPX 라이브러리 조사

웹 에디터 구현 시 참고하거나 부분적으로 재활용할 수 있는 오픈소스 프로젝트들.

## 1. JavaScript / TypeScript

### hahnlee/hwp.js

- **URL**: https://github.com/hahnlee/hwp.js
- **언어**: TypeScript (96%)
- **라이선스**: Apache-2.0
- **범위**: HWP 5.0 **바이너리** 파서 + 뷰어 (React 기반)
- **HWPX 지원**: ❌ (HWP 바이너리 전용)
- **의존성**: `hwplib`, `cfb-js`, `pako`, `pdf.js`
- **유용성**: 웹에서 HWP 렌더링 구조/React 컴포넌트 구조 참고

### @ssabrojs/hwpxjs

- **URL**: https://www.npmjs.com/package/@ssabrojs/hwpxjs
- **범위**: HWPX 파서 (Node 환경 위주)
- **상태**: 활발성 낮음, 상세 문서 제한적
- **유용성**: 브라우저 번들링에 맞게 포팅/대체 검토

### openhwp/openhwp (Rust, WASM 후보)

- **URL**: https://github.com/openhwp/openhwp
- **언어**: Rust
- **라이선스**: (저장소 참조)
- **지원**: HWPX 읽기/쓰기 ✅, HWP 읽기 ✅, KS X 6101:2024 준수
- **구성**: `hwp`, `hwpx`, `ir`(중간표현), `document`, `primitive` 크레이트
- **유용성**: WASM으로 컴파일하여 브라우저에서 고성능 파싱 백엔드로 사용 가능

## 2. Python

### airmang/python-hwpx

- **URL**: https://github.com/airmang/python-hwpx
- **언어**: Pure Python
- **지원 범위**: ✅ 읽기/수정/생성, 단락/표/이미지/도형/메모/각주/미주/북마크/하이퍼링크, 머리글/바닥글
- **미지원**: 암호화된 HWPX, HWP 5.0 바이너리
- **유용성**: 서버사이드 변환기나 테스트 픽스처 생성용으로 활용 가능

## 3. Java

### neolord0/hwpxlib

- **URL**: https://github.com/neolord0/hwpxlib
- **언어**: Java
- **지원 범위**: 읽기/쓰기, 암호화 HWPX 지원, 텍스트 추출(`TextExtractor`), 객체 검색(`ObjectFinder`), 빈 문서 생성(`BlankFileMaker`)
- **지원 요소**: run, tbl, shapeObject, connectLine, Chart
- **유용성**: 요소 트리 설계의 사실상 레퍼런스

## 4. Go

### hanpama/hwp

- **URL**: https://pkg.go.dev/github.com/hanpama/hwp
- **언어**: Go
- **유용성**: 서버사이드 배치 변환기 프로토타입 참고용

## 5. C/C++

### hancom-io/hwpx-owpml-model

- **URL**: https://github.com/hancom-io/hwpx-owpml-model
- **언어**: C++ / C
- **공개 주체**: 한글과컴퓨터 공식
- **범위**: OOXML 구조 기반의 OWPML 필터 모델 (텍스트 추출 수준 샘플 포함)
- **의존성**: Expat XML Parser, TideSDK
- **유용성**: **공식 레퍼런스** — 요소 이름/속성 명명 규칙 권위 있는 출처
- **한계**: Windows/VS2017 빌드 환경 의존, 예제는 제한적

### hancom-io/metatag-ex

- **URL**: https://github.com/hancom-io/metatag-ex
- **유용성**: 메타태그 추출 예시 — OPF metadata 다루기 참고

## 6. 뷰어 전용

- **한컴오피스 Viewer (Apple App Store)**: 표준 동작 참조
- **hwpconverter.com**: HWP/HWPX → PDF/DOCX 변환, 동작 관찰 가능

## 7. 본 프로젝트에서의 활용 방침

| 용도                               | 선택                                                                  |
| ---------------------------------- | --------------------------------------------------------------------- |
| 브라우저 클라이언트 파싱/직렬화    | **자체 구현 (TypeScript)** + JSZip + fast-xml-parser (또는 DOMParser) |
| 고성능 WASM 백엔드 (옵션)          | **openhwp (Rust)** 의 `hwpx` 크레이트를 `wasm-pack` 으로 컴파일 검토  |
| 테스트 픽스처 생성 (서버 스크립트) | **python-hwpx** 로 다양한 요소를 가진 샘플 hwpx 생성                  |
| 레퍼런스 정합성 검증               | **hwpxlib(Java)** 또는 한컴오피스 Viewer 결과와 diff                  |
| 요소 명세 권위                     | **hancom-io/hwpx-owpml-model** + 한컴 공식 PDF                        |

## 참고자료

- [hahnlee/hwp.js](https://github.com/hahnlee/hwp.js)
- [airmang/python-hwpx](https://github.com/airmang/python-hwpx)
- [neolord0/hwpxlib](https://github.com/neolord0/hwpxlib)
- [openhwp/openhwp](https://github.com/openhwp/openhwp)
- [hancom-io/hwpx-owpml-model](https://github.com/hancom-io/hwpx-owpml-model)
