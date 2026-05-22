# AI PR Review Toolkit v1.0.0 — 정식 출시 🎉

> 2026-05-22 정식 출시. Windows EV 서명, GitHub Device Flow 인증,
> 최근 리뷰 10건 로컬 캐시, 전체 소스 리뷰(repo 전체 + 필터),
> Claude Code(Max) / Anthropic API 키 양 모드 지원, 다크 테마 정식화.

기존 v0.1.0 출시 내역은 아래 v0.1.0 섹션 참조.

---

# AI PR Review Toolkit v0.1.0 — 첫 출시 🎉

## 한 줄 요약

GitHub PR을 **Claude**로 한국어 코드 리뷰 + 자동 수정 프롬프트 생성하는 Windows 데스크톱 앱. **EV 코드사인 적용**으로 SmartScreen 마찰 0.

---

## 🔧 v0.1.0 재빌드 (2026-05-22) — CRITICAL 버그 수정

이전 v0.1.0 빌드는 GitHub 인증 토큰이 Windows Credential Manager에 실제로 저장되지 않는 버그가 있었습니다. 같은 v0.1.0 태그에 새 asset으로 교체된 버전을 다운로드해 주세요.

**수정된 증상**
- Settings에서 GitHub 계정 연결 직후 "✓ 연결됨" 표시 → 재진입 시 사라지던 문제
- private repo PR URL 입력 시 "404 not found" 에러로 접근 불가

**원인**: Tauri 빌드의 keyring 의존성이 Windows native backend를 링크하지 않아 mock fallback이 사용되고 있었습니다.

**기존 v0.1.0 사용자에게 필요한 액션**:
1. 새 MSI/EXE를 다운로드해 덮어쓰기 설치
2. 앱 실행 후 Settings → "GitHub 계정으로 연결"로 **재로그인** (이전 빌드는 wincred에 실제 데이터가 없어 마이그레이션 손실은 없습니다)

추가 개선:
- private repo PR fetch 실패 시 "Settings 열기 →" 안내 박스 자동 표시 (인라인 CTA)

---

## ✨ 추가 기능 (2026-05-22) — 최근 리뷰 로컬 캐시

분석 결과를 로컬 PC에 캐시해 같은 PR을 다시 볼 때 Claude를 재호출하지 않습니다.

- **최근 리뷰 10건 자동 캐시** — 이전엔 5건 메타데이터만 저장 → 이제 10건 본문까지 보관
- **클릭 즉시 표시** — "최근 리뷰" 항목 클릭 시 Result 화면으로 바로 진입 (✓ 캐시됨 배지로 표시)
- **다시 분석 버튼** — 캐시된 항목 우측의 ↻ 버튼으로 강제 재분석 가능 (코드가 갱신된 PR에 유용)
- **저장 위치**: 사용자 PC의 localStorage. 공유 PC라면 사용 후 캐시를 수동으로 지우세요.
- **Settings에서 정리 가능** — "리뷰 데이터" 섹션에서 캐시 본문만 지우거나 최근 리뷰 전체를 삭제할 수 있습니다 (공유 PC 사용 후 권장).

---

## ✨ UX 개선 (2026-05-22)

### Result 화면 캐시 표시
캐시된 리뷰를 "최근 리뷰"에서 클릭해 진입하면 Hero 영역에 **"✓ 캐시됨 · YYYY. M. D. 분석"** emerald 배지가 표시되어 신규 분석과 한눈에 구분됩니다.

### 다크 테마 가독성 17곳 정정
다크 모드에서 흐리게 보이던 텍스트들을 한 단계 밝게 조정했습니다.

- 메인 입력 화면 최근 리뷰 영역의 URL/날짜·이슈 카운트/하단 안내
- About 화면의 부제, 버전 배지(투명도 조정), "Made by FirstNode" 라벨
- 후원 섹션의 안내 문구 + 카드 부제 (GitHub Sponsors · 카카오페이)
- Result 화면의 PR URL 줄과 캐시 토큰 수치
- 헤더 라벨("코드 리뷰", 앱 제목 등)도 다크 환경에서 채도 보강

CSS 토큰 정의는 보존하고 각 사용처에 `dark:` variant를 적용하는 방식이라 기존 라이트 모드 화면은 영향 없습니다.

---

## 🆕 전체 소스 리뷰 (2026-05-22)

> 2026-05-22 갱신: Claude Code(Max) 모드도 지원하도록 확장

GitHub repo URL을 입력하면 **변경분이 아닌 repo 전체 코드**를 분석하는 신규 기능이 추가됐습니다. 기존 PR/commit/compare 리뷰가 "이번 변경에 이슈가 있는지"를 보는 것이라면, 전체 소스 리뷰는 "코드베이스 전반의 강점·약점·개선 우선순위"를 한 눈에 파악할 때 유용합니다.

**사용 방법**
1. URL 입력란에 `https://github.com/owner/repo` 형식의 repo URL 붙여넣기
2. "최근 PR 목록" 옆에 등장하는 **📚 전체 소스 리뷰** 카드 클릭
3. inline 패널에서 필터 입력 (선택):
   - 디렉토리 prefix (예: `src/, lib/`)
   - 확장자 (예: `.ts, .tsx, .py`)
   - 자동 제외: `node_modules`, `dist`, `build`, `.git`, lock 파일, binary 등
4. **사이즈 계산** 버튼 → 파일 수, LOC, 예상 입력/출력 토큰, 예상 비용(USD + KRW) 미리보기
5. **전체 소스 리뷰 시작** → Claude Sonnet이 5가지 관점(잠재 버그 / 보안 / 코드 품질 / 테스트 / 아키텍처)으로 분석

**제한 사항 (v0.1)**
- 단일 호출 한계: 약 50,000 LOC (초과 시 알파벳 순서로 일부 파일 절단 + 절단 안내)
- Claude Code(Max) / Anthropic API 키 두 모드 모두 지원 — Claude Code 모드는 본인 구독 사용으로 추가 비용 0
- GitHub 토큰 권장: 비인증 시 rate limit 60/h라 대규모 repo fetch 중 차단 위험. Settings → "GitHub 계정으로 연결"
- 캐시: 결과는 "최근 리뷰" 항목에 저장. 다만 캐시 만료 후에는 재분석을 위해 URL을 다시 붙여넣어야 합니다 (v0.2에서 재분석 단축 예정)

**비용 가이드 (Sonnet 4.x 기준)**
- 1,000 LOC repo: 약 $0.01 (~₩15)
- 10,000 LOC repo: 약 $0.05~0.07 (~₩70~100)
- 50,000 LOC repo: 약 $0.25~0.30 (~₩350~420)

prompt caching이 적용되어 동일 시스템 프롬프트를 쓰는 두 번째 이후 분석은 더 저렴해집니다.

**Claude Code(Max) 모드 사용 시**: 비용 0 (본인 구독 요금 외). 단, 50K LOC 한계는 동일(같은 Claude 모델 호출).

---

## ✨ 주요 기능

1. **GitHub URL 입력만으로 리뷰** — PR / commit / compare 3가지 URL 형식 지원
2. **Claude Max 모드 지원** — API 키 없이 본인 PC의 Claude Code CLI 사용 (Claude 구독자만 가능)
3. **GitHub Device Flow 인증** — `gh auth login`과 동일한 8자리 코드 패턴, private repo 접근 가능
4. **단계별 진행 표시** — 4단계 timeline + 경과시간 + 분석 중인 파일 목록 (3~5분 분석이 멈춰 보이는 문제 방지)
5. **AI 수정 프롬프트 자동 생성** — 결과 화면 하단에 Claude Code / Codex / 일반 AI용 프롬프트 제공 → 클립보드 복사 → 본인 PC의 AI 도구에 붙여넣기 → 자동 수정
6. **EV 코드사인** — JCG Inc. (FirstNode 소유) Authenticode 서명 적용 → Windows SmartScreen 경고 없음

---

## 💝 후원 채널 (자발적)

이 프로젝트가 도움이 되셨다면 응원 부탁드립니다.

- ❤️ [GitHub Sponsors](https://github.com/sponsors/ssallem)
- 📱 카카오페이 송금 QR — 앱 내 About 화면에서 확인

---

## 📦 설치 방법

1. 아래 **Assets**에서 `AI_PR_Review_Toolkit_0.1.0_x64_en-US.msi` 다운로드
2. 더블클릭 → 설치 마법사 → 완료
3. 시작 메뉴에서 **"AI PR Review Toolkit"** 실행
4. 첫 실행 시:
   - **Claude Code 사용자**: 모드 선택만 하면 끝 (API 키 불필요)
   - **Anthropic API 키 사용자**: API 키 입력 (안전하게 OS 자격 증명 관리자에 저장됨)
5. **GitHub 인증** (8자리 코드 입력) → **PR URL** 붙여넣기 → **리뷰 시작**

---

## 🔐 보안

- **API 키 · GitHub 토큰**: Windows Credential Manager (`wincred`)에 저장 — 평문 노출 0
- **모든 API 호출은 본인 PC에서 직접 수행** (Anthropic · GitHub) — 우리 서버를 경유하지 않음
- **코드 · diff 외부 유출 없음** — 사용자의 PC와 Anthropic / GitHub 사이에서만 데이터 이동
- **Authenticode 서명**:
  - 발급자: **JCG Inc.** (FirstNode 소유)
  - Thumbprint: `F382A7A6DDFD342F44AE9E0010A328BD487CEDE5`

---

## 📋 시스템 요구사항

- **OS**: Windows 10 1809+ / Windows 11 (x64)
- **WebView2 Runtime**: Windows 10/11에 기본 포함
- **Claude Max 모드 사용 시**: [Claude Code](https://docs.claude.com/en/docs/claude-code) CLI 설치 필요

---

## 🐞 알려진 제약

- **Mac / Linux 빌드**는 v0.2에서 제공 예정 (Apple Developer 코드사인 도입 후)
- **Organization repo**는 OAuth App 권한 grant 필요 — GitHub `Settings → Applications`에서 권한 부여
- **PR 분석은 약 3~5분 소요** (Claude Sonnet 모델 사용)

---

## 🙏 만든 사람

[**FirstNode**](https://ai-review-kit.pages.dev) by **ssallem** · MIT License

---

## 📚 더 알아보기

- 🌐 공식 사이트: <https://ai-review-kit.pages.dev>
- 💻 소스 코드: <https://github.com/ssallem/ai-pr-review-app>
- 🐛 이슈 / 피드백: <https://github.com/ssallem/ai-pr-review-app/issues>

---

**감사합니다!** 🎉

이 도구가 도움이 되셨다면 **GitHub Star ⭐** 또는 **후원**으로 응원 부탁드립니다.
