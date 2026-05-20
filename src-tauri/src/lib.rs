// Tauri command 등록부.
//
// Phase 1-C: OS keychain 접근을 위한 3개 명령 추가 (set / get / delete).
//   - Windows: Credential Manager
//   - macOS: Keychain Access
//   - Linux: Secret Service (libsecret)
//
// 시크릿 평문 저장 금지 — 모든 API 키/토큰은 본 모듈을 통해서만 접근.

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            keychain_set,
            keychain_get,
            keychain_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
