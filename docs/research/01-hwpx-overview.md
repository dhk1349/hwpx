# HWPX 포맷 개요

## 1. 정의

**HWPX**는 한글과컴퓨터(Hancom)의 한글 워드프로세서(HWP) 문서를 XML 기반으로 표현한 개방형 문서 포맷이다. 국가표준 **KS X 6101** 으로 등록된 **OWPML(Open Word-processor Markup Language)** 규격을 따른다.

- 확장자: `.hwpx` (한글 2010 이상 지원)
- 대체 확장자: `.owpml` (한글 2018 이상, 동일 스펙)
- 컨테이너: ZIP(무손실 압축) 안에 XML 파일들이 위치
- 표준: KS X 6101 (최신본 KS X 6101:2024)
- 유사 표준: ODF, OOXML과 동일한 "ZIP + XML" 접근

## 2. 탄생 배경

- 1990년대부터 사용된 HWP 5.0 **바이너리 포맷**은 외부 시스템이 내용을 파싱하거나 재가공하기 어려움
- 2011년 12월, 한글과컴퓨터가 국내 문서 표준화위원회와 2년 공동개발을 거쳐 OWPML을 KS X 6101 표준으로 지정
- 2010년 한글 2010 버전부터 `.hwpx` 확장자를 지원
- 2023년경부터 정부기관 공공문서 기본 저장 형식으로 HWPX를 권장

## 3. HWP(바이너리) vs HWPX(XML) 비교

| 항목        | HWP (5.0 바이너리)                 | HWPX (OWPML XML)                 |
| ----------- | ---------------------------------- | -------------------------------- |
| 내부 형식   | CFB(Compound File Binary) 바이너리 | ZIP + XML                        |
| 가독성      | 전용 뷰어 필요                     | 텍스트 에디터로 열람 가능        |
| 데이터 추출 | 복잡한 역공학 필요                 | XML 파서로 직접 파싱             |
| 확장 / 연계 | 어려움                             | 웹/클라우드/AI 자동화에 적합     |
| 표준화      | 비공개 스펙                        | KS X 6101 공개 표준              |
| 파일 크기   | 일반적으로 더 작음                 | XML로 인해 더 큼 (압축으로 보완) |

## 4. 활용 맥락

- **공공/법무/교육**: 한국 공공 문서의 사실상 표준
- **데이터 파이프라인**: RAG / LLM / 검색엔진에 한국어 공문서를 인덱싱하기 위한 추출 대상
- **협업/클라우드**: 한컴스페이스 등 웹 기반 편집 환경 연동
- **웹 에디터**: 본 프로젝트의 주 목표 — 브라우저에서 HWPX를 열고/편집/저장

## 5. 주요 참고자료

- [한컴테크 — HWPX 포맷 구조 살펴보기](https://tech.hancom.com/hwpxformat/)
- [한컴테크 — Python을 통한 HWPX 파싱 1](https://tech.hancom.com/python-hwpx-parsing-1/)
- [한컴테크 — Python을 통한 HWPX 파싱 2](https://tech.hancom.com/python-hwpx-parsing-2/)
- [한컴 다운로드 센터 — HWP/OWPML 형식 명세](https://www.hancom.com/support/downloadCenter/hwpOwpml)
- [hancom-io/hwpx-owpml-model (GitHub, 공식 필터 모델)](https://github.com/hancom-io/hwpx-owpml-model)
- [HWPX 가이드 — HWP와 HWPX의 차이](https://www.inline-ai.com/blog/hwpx-guide)
- [NHN Cloud Meetup — 새로운 한/글 파일 포맷 HWPX](https://meetup.nhncloud.com/posts/311)
