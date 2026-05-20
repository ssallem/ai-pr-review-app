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

use std::io::Write;
use std::process::{Command, Stdio};

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

/// Claude Code CLI 를 headless 로 호출 — `claude -p <prompt>` 에 diff 를 stdin 으로 전달.
///
/// 시스템 경계 검증:
///   - prompt/diff 는 모두 stdin 으로만 전달 → 쉘 인젝션 차단.
///   - 인자에 사용자 입력 직접 보간 X.
#[tauri::command]
async fn claude_code_invoke(prompt: String, diff: String) -> Result<String, String> {
    let full_input = format!("{}\n\n{}", prompt, diff);

    let mut child = build_invoke_command()
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!(
            "Claude Code CLI 실행 실패: {}. Claude Code 가 설치되어 있나요? https://docs.claude.com/claude-code 설치 가이드 참고.",
            e
        ))?;

    {
        let stdin = child.stdin.as_mut().ok_or("stdin 핸들 획득 실패")?;
        stdin
            .write_all(full_input.as_bytes())
            .map_err(|e| format!("stdin 쓰기 실패: {}", e))?;
    }
    // stdin drop → EOF 전달 (wait_with_output 내부에서 처리).

    let output = child
        .wait_with_output()
        .map_err(|e| format!("프로세스 대기 실패: {}", e))?;

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

/// 플랫폼별 `claude -p` 호출 Command 생성 (stdin 입력 대기 모드).
#[cfg(target_os = "windows")]
fn build_invoke_command() -> Command {
    // powershell 의 `$input` 자동 변수로 stdin 을 claude 에 파이프.
    // -p 는 headless print mode (Claude Code CLI).
    let mut c = Command::new("powershell");
    c.args([
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$input | claude -p",
    ]);
    c
}

#[cfg(not(target_os = "windows"))]
fn build_invoke_command() -> Command {
    let mut c = Command::new("claude");
    c.arg("-p");
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
