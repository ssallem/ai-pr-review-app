# AI PR Review Toolkit — 빌드 + EV 서명 통합 스크립트
# 사용법: pwsh -File scripts/build-and-sign.ps1
# - npm run tauri build → msi/exe 생성 (5~10분)
# - sign-windows.ps1 → EV 서명 + 검증
# - dist 경로 출력

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Phase 1: Tauri 빌드 ===" -ForegroundColor Cyan
Write-Host ""

# Tauri build — Rust release + msi 생성 (서명 X), 5~10분 소요
# 참고: tauri.conf.json bundle.windows 에서 certificateThumbprint/timestampUrl 제거 →
#       Tauri는 unsigned msi/exe만 생성. 서명은 Phase 2에서 sign-windows.ps1이 단독 수행
#       (이중 서명 충돌 방지, local-fx 패턴 align)
npm run tauri build
if ($LASTEXITCODE -ne 0) {
  Write-Host "[ERROR] tauri build 실패. Visual Studio Build Tools와 SafeNet USB가 연결되어 있나요?" -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "=== Phase 2: Windows EV 서명 (검증 + 미서명 산출물 보완) ===" -ForegroundColor Cyan
Write-Host ""

# 같은 폴더의 sign-windows.ps1 호출
$signScript = Join-Path $PSScriptRoot "sign-windows.ps1"
& pwsh -File $signScript

if ($LASTEXITCODE -ne 0) {
  Write-Host "[ERROR] 서명 단계 실패." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "=== 빌드 + 서명 모두 완료 ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "산출물 위치:" -ForegroundColor Yellow
Get-ChildItem "src-tauri/target/release/bundle/msi/*.msi" -ErrorAction SilentlyContinue | ForEach-Object {
  $sizeMb = [math]::Round($_.Length / 1MB, 1)
  Write-Host "  $($_.FullName) ($sizeMb MB)"
}
Get-ChildItem "src-tauri/target/release/bundle/nsis/*.exe" -ErrorAction SilentlyContinue | ForEach-Object {
  $sizeMb = [math]::Round($_.Length / 1MB, 1)
  Write-Host "  $($_.FullName) ($sizeMb MB)"
}
Write-Host ""
