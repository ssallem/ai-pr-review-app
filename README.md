# AI PR Review Toolkit (Desktop)

> Claude로 한국어 PR 리뷰를 자동화하는 데스크톱 앱 — Tauri 2 기반

[![GitHub Sponsors](https://img.shields.io/github/sponsors/ssallem?label=Sponsor&logo=GitHub&color=ea4aaa)](https://github.com/sponsors/ssallem)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Made by FirstNode](https://img.shields.io/badge/Made_by-FirstNode-3a64f0.svg)](https://ai-review-kit.pages.dev)

사이트: https://ai-review-kit.pages.dev
다운로드: [Releases](https://github.com/ssallem/ai-pr-review-app/releases/latest)
개발자용 CLI: [ssallem/ai-pr-review-bot](https://github.com/ssallem/ai-pr-review-bot)

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

1. [Releases](https://github.com/ssallem/ai-pr-review-app/releases/latest)에서 OS별 빌드 다운로드:
   - Windows: `*.msi` (EV 코드 서명 — SmartScreen 경고 없음)
   - macOS: `*.dmg` (현재 unsigned — 첫 실행 시 "어쨌든 열기" 클릭 필요)
   - Linux: `*.AppImage`
2. 더블클릭으로 설치
3. 앱 실행 → Anthropic API 키 입력 ([발급](https://console.anthropic.com/settings/keys))
4. GitHub PR URL 붙여넣기 → "리뷰 시작"

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
