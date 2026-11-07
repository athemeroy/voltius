use std::sync::Arc;
use tauri::AppHandle;

#[cfg(target_os = "android")]
const DEFAULT_KEEPALIVE_INTERVAL_SECS: u64 = 10;
#[cfg(not(target_os = "android"))]
const DEFAULT_KEEPALIVE_INTERVAL_SECS: u64 = 3;

#[cfg(target_os = "android")]
const DEFAULT_KEEPALIVE_MAX: usize = 6;
#[cfg(not(target_os = "android"))]
const DEFAULT_KEEPALIVE_MAX: usize = 3;

#[tauri::command]
pub async fn ssh_connect(
    app: AppHandle,
    session_id: String,
    host: String,
    port: u16,
    username: String,
    password: Option<String>,
    private_key: Option<String>,
    passphrase: Option<String>,
    jump_hosts: Option<Vec<crate::ssh::JumpHost>>,
    env_vars: Option<Vec<(String, String)>>,
    agent_forwarding: bool,
    pre_command: Option<String>,
    shell_integration: Option<bool>,
    known_hosts: tauri::State<'_, crate::ssh::KnownHosts>,
    pending_conflicts: tauri::State<'_, crate::ssh::PendingConflicts>,
    keepalive_interval_secs: Option<u64>,
    keepalive_max: Option<usize>,
    persist: Option<bool>,
    restore: Option<bool>,
    attach_only: Option<bool>,
    cols: Option<u16>,
    rows: Option<u16>,
    legacy_algorithms: Option<bool>,
    initial_cwd: Option<String>,
    proxy: Option<crate::ssh::Proxy>,
    knock: Option<crate::ssh::Knock>,
    terminal_colors: Option<crate::ssh::TerminalColors>,
    detached_ttl_secs: Option<u64>,
) -> Result<(), String> {
    let connected = crate::ssh::ssh_connect(
        app,
        session_id.clone(),
        &host,
        port,
        &username,
        password.as_deref(),
        private_key.as_deref(),
        passphrase.as_deref(),
        jump_hosts.unwrap_or_default(),
        env_vars.unwrap_or_default(),
        agent_forwarding,
        pre_command,
        shell_integration.unwrap_or(true),
        Arc::clone(&*known_hosts),
        Arc::clone(&*pending_conflicts),
        keepalive_interval_secs.unwrap_or(DEFAULT_KEEPALIVE_INTERVAL_SECS),
        keepalive_max.unwrap_or(DEFAULT_KEEPALIVE_MAX),
        persist.unwrap_or(true),
        restore.unwrap_or(false),
        attach_only.unwrap_or(false),
        cols.filter(|c| *c > 0).unwrap_or(80),
        rows.filter(|r| *r > 0).unwrap_or(24),
        legacy_algorithms.unwrap_or(false),
        initial_cwd,
        crate::ssh::HopRoute { proxy, knock },
        terminal_colors,
        detached_ttl_secs,
    )
    .await?;

    crate::ssh::STATE.add(session_id.clone(), connected).await;
    Ok(())
}
