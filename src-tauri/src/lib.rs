// Tauri command 등록부.
//
// Phase 1-C: OS keychain 접근을 위한 3개 명령 추가 (set / get / delete).
//   - Windows: Credential Manager
//   - macOS: Keychain Access
//   - Linux: Secret Service (libsecret)
//
// Phase 1-E (2026-05-18): Claude Code CLI subprocess 명령 2개 추가.
//   - `claude_code_check` — Max 모드 사용 가능 여부 확인 (claude --version)
//   - `claude_code_invoke` — diff/prompt 를 stdin 으로 보내고 stdout 회수
//
// 시크릿 평문 저장 금지 — 모든 API 키/토큰은 본 모듈을 통해서만 접근.

use std::env;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;

// 기존 데모 명령 — Phase 1-A 셋업 검증용. 사용자 코드에서 호출하지 않으면 제거 가능.
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// ===== keychain 명령 =====

/// keychain에 (service, key) 쌍으로 value 저장.
/// 같은 키가 이미 있으면 덮어쓴다.
#[tauri::command]
async fn keychain_set(service: String, key: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(&service, &key).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

/// keychain에서 value 조회. 항목 없음(NoEntry)은 에러가 아닌 `Ok(None)`으로 변환.
#[tauri::command]
async fn keychain_get(service: String, key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(&service, &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// keychain에서 항목 삭제. 항목 없음은 멱등하게 성공 처리.
#[tauri::command]
async fn keychain_delete(service: String, key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(&service, &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ===== Claude Code CLI 명령 =====
//
// Windows 사전 조건:
//   - npm 글로벌 bin (예: %APPDATA%\npm) 이 PATH 에 있어야 한다.
//   - `claude.ps1` 또는 `claude.cmd` 가 그 안에 있다 (Claude Code 공식 설치 시 자동).
//   - 직접 `Command::new("claude")` 는 .exe 만 탐색하므로 npm 환경에서 fail.
//   - 따라서 Windows 에서는 powershell -NoProfile -Command claude ... 형태로 우회.
//
// macOS/Linux:
//   - `claude` 가 PATH 에 직접 실행 가능한 스크립트로 존재 → 그대로 Command::new("claude").

/// Claude Code CLI 가용성 확인. 성공 시 버전 문자열 반환.
#[tauri::command]
async fn claude_code_check() -> Result<String, String> {
    let output = build_check_command()
        .output()
        .map_err(|e| format!("Claude Code 미설치 또는 PATH 미등록: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "claude --version 실패 (exit {}): {}",
            output.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if version.is_empty() {
        return Err("claude --version 출력이 비어있습니다.".to_string());
    }
    Ok(version)
}

/// Claude Code CLI 를 headless 로 호출 — `claude -p <prompt>` 에 diff 를 전달.
///
/// 시스템 경계 검증:
///   - prompt/diff 는 임시 파일에 쓴 뒤 쉘 redirect (`Get-Content` / `cat`) 로 stdin 에 흘림.
///   - 인자에 사용자 입력 직접 보간 X (파일 경로만 single-quote escape 후 삽입).
///
/// Phase 2-W (2026-05-22): stdin 직접 write → 임시 파일 경유로 전환.
///   - Claude CLI 가 piped stdin 10MB 제한을 강제 (대형 repo 리뷰 시 초과 → exit 1).
///   - 파일 경로로 받으면 사실상 무제한 (CLI 내부 mmap/read).
#[tauri::command]
async fn claude_code_invoke(prompt: String, diff: String) -> Result<String, String> {
    let full_input = format!("{}\n\n{}", prompt, diff);

    // 임시 파일 경로 (pid + 밀리초 → 동일 프로세스 내 동시 호출 충돌 방지).
    let temp_filename = format!(
        "claude-input-{}-{}.txt",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    let temp_path: PathBuf = env::temp_dir().join(&temp_filename);

    // UTF-8 로 쓰기 (BOM 없음). 한글/이모지 포함 안전.
    {
        let mut f = fs::File::create(&temp_path)
            .map_err(|e| format!("임시 파일 생성 실패: {}", e))?;
        f.write_all(full_input.as_bytes())
            .map_err(|e| format!("임시 파일 쓰기 실패: {}", e))?;
    }

    // 결과 (성공/실패 모두 cleanup 보장하기 위해 closure 형태로 분리).
    let result = run_claude_with_file(&temp_path);

    // best-effort cleanup — 실패해도 OS temp 청소로 해결.
    let _ = fs::remove_file(&temp_path);

    result
}

/// 임시 파일을 stdin 으로 redirect 해 `claude -p` 호출. 에러 메시지에 경로 노출 X.
fn run_claude_with_file(temp_path: &PathBuf) -> Result<String, String> {
    let output = build_invoke_command(temp_path)
        .output()
        .map_err(|e| format!(
            "Claude Code CLI 실행 실패: {}. Claude Code 가 설치되어 있나요? https://docs.claude.com/claude-code 설치 가이드 참고.",
            e
        ))?;

    if !output.status.success() {
        return Err(format!(
            "Claude CLI 종료 코드 {}: {}",
            output.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// 플랫폼별 `claude --version` 호출 Command 생성.
#[cfg(target_os = "windows")]
fn build_check_command() -> Command {
    let mut c = Command::new("powershell");
    c.args(["-NoProfile", "-NonInteractive", "-Command", "claude --version"]);
    c
}

#[cfg(not(target_os = "windows"))]
fn build_check_command() -> Command {
    let mut c = Command::new("claude");
    c.arg("--version");
    c
}

/// 플랫폼별 `claude -p` 호출 Command 생성 (임시 파일을 stdin 으로 redirect).
///
/// Phase 2-D (2026-05-22): `--output-format json` 추가.
///   - stdout 이 `{ "type": "result", "total_input_tokens": N, "total_output_tokens": M, "result": "..." }` JSON 으로 옴.
///   - claudeCode.ts 의 parseClaudeCodeOutput 가 파싱해서 usage 채움.
///   - 구버전 CLI (`--output-format` 미지원) 환경에서는 frontend 가 plain text 로 폴백.
///
/// Phase 2-W (2026-05-22): `$input` 직접 pipe → 임시 파일 redirect 로 전환.
///   - Windows: `Get-Content -Raw -Encoding UTF8 -LiteralPath '<path>'` → claude.
///     `$OutputEncoding` 을 UTF-8 로 강제해야 한글이 안 깨진다 (PS 5.1 default 는 ASCII).
///   - macOS/Linux: `cat '<path>' | claude` — locale 의존 인코딩 문제 없음.
#[cfg(target_os = "windows")]
fn build_invoke_command(temp_path: &PathBuf) -> Command {
    // PowerShell single-quote literal 안전 삽입: `'` → `''` 로 이중화.
    let escaped = temp_path.to_string_lossy().replace('\'', "''");
    let ps_command = format!(
        "$OutputEncoding = New-Object System.Text.UTF8Encoding $false; \
         [Console]::OutputEncoding = $OutputEncoding; \
         Get-Content -Raw -Encoding UTF8 -LiteralPath '{}' | claude -p --output-format json",
        escaped
    );
    let mut c = Command::new("powershell");
    c.args(["-NoProfile", "-NonInteractive", "-Command", &ps_command]);
    c
}

#[cfg(not(target_os = "windows"))]
fn build_invoke_command(temp_path: &PathBuf) -> Command {
    // sh single-quote literal escape: `'` → `'\''`.
    let escaped = temp_path.to_string_lossy().replace('\'', "'\\''");
    let sh_command = format!("cat '{}' | claude -p --output-format json", escaped);
    let mut c = Command::new("sh");
    c.args(["-c", &sh_command]);
    c
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Phase 2-C (2026-05-20): GitHub OAuth Device Flow / api.github.com / api.anthropic.com 호출은
        // 브라우저(WebView) CORS 제약을 받는다. plugin-http 가 Rust 계층에서 대신 호출 → 우회.
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            keychain_set,
            keychain_get,
            keychain_delete,
            claude_code_check,
            claude_code_invoke,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
