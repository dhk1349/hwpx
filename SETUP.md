# Setup Guide

HWPX Editor 개발 환경을 세팅하기 위한 가이드. macOS / Windows 기준.

## 요구사항 요약

| 도구      | 버전               | 용도                               |
| --------- | ------------------ | ---------------------------------- |
| Node.js   | 20.x LTS 이상      | TS 빌드 / Vite / Vitest            |
| pnpm      | 9.12 이상          | monorepo 패키지 매니저             |
| Rust      | 1.77 이상 (stable) | Tauri 2 백엔드                     |
| Tauri CLI | 2.x                | 데스크톱 번들링                    |
| Python    | 3.10 이상 (선택)   | `tools/fixtures/` 테스트 샘플 생성 |

## macOS

### 1. Xcode Command Line Tools

```bash
xcode-select --install
```

### 2. Node.js (nvm 권장)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
# 새 셸 세션
nvm install 20
nvm use 20
node -v   # v20.x
```

### 3. pnpm

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm -v   # 9.12.0
```

### 4. Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustc --version   # 1.77+
```

### 5. Tauri CLI

pnpm 스크립트로 호출되므로 전역 설치는 선택사항이다.

```bash
# (선택) 전역
cargo install tauri-cli --version "^2.0"

# 혹은 package.json에 포함된 @tauri-apps/cli 사용
pnpm --filter @hwpx/desktop exec tauri --version
```

## Windows

### 1. Microsoft Visual C++ Build Tools

- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) 설치
- "Desktop development with C++" 워크로드 선택
- Windows 10/11 SDK 포함

### 2. WebView2 Runtime

- Windows 11에는 기본 포함. Windows 10은 [Evergreen installer](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) 설치.

### 3. Node.js / pnpm / Rust

```powershell
# Node.js 20 — https://nodejs.org/ 공식 설치 파일
# 또는 nvs/fnm

# pnpm
corepack enable
corepack prepare pnpm@9.12.0 --activate

# Rust
# https://www.rust-lang.org/tools/install 에서 rustup-init.exe 실행
rustup target add x86_64-pc-windows-msvc
```

## 프로젝트 초기화

```bash
git clone <repo>
cd hwpx
pnpm install
```

### 개발 서버

```bash
# 웹만
pnpm dev:web
# → http://localhost:1420

# 데스크톱 (Tauri)
pnpm dev:desktop
```

### 테스트

```bash
pnpm test             # Vitest watch
pnpm test -- --run    # 1회 실행 (CI 모드)
pnpm lint
pnpm typecheck
pnpm format:check
```

### 데스크톱 번들 빌드

```bash
# 현재 플랫폼용
pnpm --filter @hwpx/desktop tauri build

# 결과물
# macOS: apps/desktop/src-tauri/target/release/bundle/dmg/*.dmg
# Windows: apps/desktop/src-tauri/target/release/bundle/msi/*.msi
```

## 코드 서명 (배포용, 선택)

릴리스 빌드에서만 필요. 개발 중에는 무시해도 된다.

### macOS

- Apple Developer Program 계정
- Developer ID Application 인증서 (Keychain)
- App-specific password (notarization용)

환경변수:

```bash
export APPLE_ID="you@example.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # app-specific password
export APPLE_TEAM_ID="XXXXXXXXXX"
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (XXXXXXXXXX)"
```

### Windows

- EV code signing 인증서 (SmartScreen 평판 즉시 획득) 또는 표준 OV 인증서
- `signtool.exe` (Windows SDK 포함)

환경변수는 `.github/workflows/release.yml`의 `WINDOWS_CERTIFICATE` 참고.

## 테스트 샘플 생성 (선택)

```bash
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install python-hwpx
python tools/fixtures/generate.py
```

## 트러블슈팅

### `pnpm install` 실패 — `node-gyp`

Python 3 설치 확인. Windows에서는 Python이 PATH에 있어야 한다.

### Tauri `dev`에서 검은 화면

1. `pnpm --filter @hwpx/web dev`가 1420 포트에서 응답하는지 확인.
2. `apps/desktop/src-tauri/tauri.conf.json`의 `devUrl`이 `http://localhost:1420`인지 확인.
3. macOS에서 WebKit 캐시 문제: `~/Library/Caches/app.hwpx.editor` 삭제 후 재시도.

### Rust 컴파일 OOM (Windows)

`cargo.toml`의 debug profile에 `codegen-units = 16`, `incremental = true` 설정 확인.
메모리가 8GB 이하라면 `CARGO_BUILD_JOBS=2` 환경변수로 병렬도를 낮춘다.

### `.hwpx` 파일 연결이 안 될 때

macOS: `open -a "HWPX Editor" ~/Documents/sample.hwpx`로 수동 테스트.
설치 후에도 Finder가 인식 못하면 `/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -f /Applications/HWPX\ Editor.app` 재등록.
