# AI PR Review Toolkit — Windows MSI 서명 스크립트
# 사용법: pwsh -File scripts/sign-windows.ps1
# 전제: SafeNet USB EV 인증서(JCG Inc.) 연결, signtool.exe PATH 등록 또는 SDK 설치

param(
  [string]$Thumbprint = "F382A7A6DDFD342F44AE9E0010A328BD487CEDE5",
  [string]$TimestampUrl = "http://ts.ssl.com",
  [string]$BundlePath = "src-tauri/target/release/bundle"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== AI PR Review Toolkit — Windows 서명 시작 ===" -ForegroundColor Cyan
Write-Host "  Thumbprint: $Thumbprint" -ForegroundColor Gray
Write-Host ""

# 1. signtool 자동 탐색 — Windows Kits\10\bin\*\x64\signtool.exe 최신 버전 (local-fx 패턴)
$signtoolExe = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1
if ($signtoolExe) {
    $signtoolPath = $signtoolExe.FullName
    Write-Host "    Found signtool: $signtoolPath" -ForegroundColor Gray
} else {
    $signtoolPath = "signtool"
    Write-Host "    signtool not found in Windows SDK, using PATH fallback" -ForegroundColor Yellow
}
Write-Host "[INFO] signtool: $signtoolPath" -ForegroundColor Gray

# 2. 인증서 thumbprint 확인 (SafeNet USB 연결 검증)
$cert = Get-ChildItem "Cert:\CurrentUser\My" -ErrorAction SilentlyContinue |
  Where-Object { $_.Thumbprint -eq $Thumbprint }
if (-not $cert) {
  Write-Host "[ERROR] Thumbprint $Thumbprint 인증서를 찾을 수 없습니다." -ForegroundColor Red
  Write-Host "  SafeNet USB가 연결되어 있나요?" -ForegroundColor Yellow
  Write-Host "  다음 명령으로 인증서 목록 확인:" -ForegroundColor Yellow
  Write-Host "    Get-ChildItem Cert:\CurrentUser\My | Where-Object Subject -like '*JCG*'" -ForegroundColor Gray
  exit 1
}
Write-Host "[INFO] 인증서: $($cert.Subject)" -ForegroundColor Gray
Write-Host "[INFO] 만료: $($cert.NotAfter)" -ForegroundColor Gray

# 3. 서명 대상 msi 찾기
$msiDir = Join-Path $BundlePath "msi"
$msiFiles = @()
if (Test-Path $msiDir) {
  $msiFiles = Get-ChildItem -Path $msiDir -Filter "*.msi" -ErrorAction SilentlyContinue
}
if ($msiFiles.Count -eq 0) {
  Write-Host "[ERROR] msi 파일 없음: $msiDir" -ForegroundColor Red
  Write-Host "  먼저 'npm run tauri build' 실행하세요." -ForegroundColor Yellow
  exit 1
}

# 4. 각 msi 서명
foreach ($msi in $msiFiles) {
  Write-Host ""
  Write-Host "[SIGN] $($msi.Name)" -ForegroundColor Green

  & $signtoolPath sign `
    /sha1 $Thumbprint `
    /tr $TimestampUrl `
    /td sha256 `
    /fd sha256 `
    /d "AI PR Review Toolkit" `
    /du "https://ai-review-kit.pages.dev" `
    $msi.FullName

  if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] 서명 실패: $($msi.Name) (exit $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
  }

  # 5. 서명 검증
  & $signtoolPath verify /pa /v $msi.FullName | Select-String -Pattern "Successfully verified|Signature Hash Algorithm"

  if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] 서명 + 검증 완료: $($msi.FullName)" -ForegroundColor Green
  }
}

# 6. nsis 설치 파일도 있으면 서명
$nsisDir = Join-Path $BundlePath "nsis"
$nsisFiles = @()
if (Test-Path $nsisDir) {
  $nsisFiles = Get-ChildItem -Path $nsisDir -Filter "*.exe" -ErrorAction SilentlyContinue
}
foreach ($nsis in $nsisFiles) {
  Write-Host ""
  Write-Host "[SIGN] $($nsis.Name)" -ForegroundColor Green
  & $signtoolPath sign `
    /sha1 $Thumbprint /tr $TimestampUrl /td sha256 /fd sha256 `
    /d "AI PR Review Toolkit" /du "https://ai-review-kit.pages.dev" `
    $nsis.FullName
  if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] 서명 완료: $($nsis.FullName)" -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "=== 서명 작업 완료 ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "다음 단계:" -ForegroundColor Yellow
Write-Host "  1. SmartScreen 즉시 평판 OK (EV 서명) — 다운로드 친구 PC에서 검증"
Write-Host "  2. GitHub Release v0.1.0 생성:"
Write-Host "     gh release create v0.1.0 $BundlePath/msi/*.msi --title 'v0.1.0 첫 출시' --notes-file RELEASE_NOTES.md"
Write-Host ""
