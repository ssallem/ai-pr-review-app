# AI PR Review Toolkit (Desktop)

> Claude로 한국어 PR 리뷰를 자동화하는 데스크톱 앱 — Tauri 2 기반

[![GitHub Sponsors](https://img.shields.io/github/sponsors/ssallem?label=Sponsor&logo=GitHub&color=ea4aaa)](https://github.com/sponsors/ssallem)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Made by FirstNode](https://img.shields.io/badge/Made_by-FirstNode-3a64f0.svg)](https://ai-review-kit.pages.dev)

사이트: https://ai-review-kit.pages.dev
개발자용 CLI: [ssallem/ai-pr-review-bot](https://github.com/ssallem/ai-pr-review-bot)

### ⬇️ 다운로드 (Windows v0.1.0)

- **권장 · MSI 설치 (EV 코드 서명)** — [AI PR Review Toolkit_0.1.0_x64_en-US.msi](https://github.com/ssallem/ai-pr-review-app/releases/download/v0.1.0/AI%20PR%20Review%20Toolkit_0.1.0_x64_en-US.msi)
- **대체 · NSIS Setup (EXE)** — [AI PR Review Toolkit_0.1.0_x64-setup.exe](https://github.com/ssallem/ai-pr-review-app/releases/download/v0.1.0/AI%20PR%20Review%20Toolkit_0.1.0_x64-setup.exe)
- **전체 릴리스 페이지** — [github.com/ssallem/ai-pr-review-app/releases](https://github.com/ssallem/ai-pr-review-app/releases)

> macOS · Linux 빌드는 v0.2에서 추가 예정. 그동안은 아래 [개발자 빌드](#개발자-빌드) 참고.

---

## 무엇을 하나

GitHub PR 링크 입력만으로 Claude AI가 한국어 PR 리뷰를 작성합니다.

- **사용자 PC에서 모든 처리** — 사용자 코드·API 키가 외부 서버로 안 나감
- **사용자 본인 API 키** — Anthropic 구독·결제는 사용자가 직접 (앱 무료)
- **OS keychain 안전 저장** — Windows Credential Manager / macOS Keychain
- **Mac/Win/Linux** — 단일 바이너리 (~10MB)

## 실측 dogfood

- 대상: 1,800 LOC PR (Chrome Extension)
- AI 처리: 약 5분 (Claude Sonnet 4-6)
- 사람 검토: 5~15분
- 합계: 10~20분
- 수동 시니어 리뷰 추정: 50~90분
- **시간 절감 70~85%**
- 발견: WARNING 5건 + SUGGESTION 8건 + 칭찬 2건

자세한 결과: [라이브 데모 페이지](https://ai-review-kit.pages.dev/demo)

---

## 설치 (사용자)

### Windows (v0.1.0 — 정식 출시)

위 [⬇️ 다운로드 (Windows v0.1.0)](#%EF%B8%8F-다운로드-windows-v010) 섹션의 MSI 또는 EXE 중 하나를 받는다.

| 파일 | 용도 | 권장 상황 |
|------|------|----------|
| `AI PR Review Toolkit_0.1.0_x64_en-US.msi` | MSI 설치 관리자 | 일반 사용자 (그룹 정책·MDM 환경 포함) |
| `AI PR Review Toolkit_0.1.0_x64-setup.exe` | NSIS Setup | MSI 차단 환경 또는 개인 PC |

두 파일 모두 **JCG Inc. EV 코드 서명** 적용 — SmartScreen 경고 없이 즉시 설치된다.

### macOS / Linux

현재 빌드 미제공 — **v0.2에서 추가 예정**. 그동안은 아래 [개발자 빌드](#개발자-빌드) 절차로 직접 빌드해서 사용할 수 있다.

### 설치 후

1. 다운로드한 파일을 더블클릭해 설치
2. 앱 실행 → Anthropic API 키 입력 ([발급](https://console.anthropic.com/settings/keys))
3. GitHub PR URL 붙여넣기 → "리뷰 시작"

## 개발자 빌드

전제: Node 22+, Rust 1.75+, Tauri 2 시스템 의존성 ([Tauri 설치 가이드](https://tauri.app/start/prerequisites/))

```bash
git clone https://github.com/ssallem/ai-pr-review-app
cd ai-pr-review-app
npm install
npm run tauri dev
```

배포 빌드:
```bash
npm run tauri build
# 결과: src-tauri/target/release/bundle/
```

## 기술 스택

- **Tauri 2** + Rust (네이티브 앱 셸 + keychain)
- **React 19** + TypeScript strict (UI)
- **Tailwind v3.4** + Pretendard (디자인 시스템)
- **@anthropic-ai/sdk** (Claude API)
- **keyring 3** (OS keychain)

## 후원

이 도구가 도움됐다면:

- [GitHub Sponsors](https://github.com/sponsors/ssallem)
- 카카오페이 송금 (앱 안 About 화면의 QR 코드)

## 라이선스

MIT License. Copyright (c) 2026 FirstNode.

## 만든 사람

**FirstNode** · ssallem@kakao.com · GitHub [@ssallem](https://github.com/ssallem)
