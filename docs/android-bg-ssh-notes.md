# Android 后台 SSH 保活（源码核对）

核对范围：本 worktree `termius-wt-helpers`，分支 `chore/android-helpers`。只读源码。未打包，未在手机上验证。

## 结论

进程保活是前台服务 `com.voltius.app.VoltiusTunnelService`。有已连上的 SSH 终端会话，或有状态为 `Active` 的端口转发时拉起。两者都没有时停掉。触发点是会话数或隧道列表变化，不是 `Activity.onPause`。

`src-tauri` 下没有 `WakeLock`、`PARTIAL_WAKE_LOCK`、`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`、`BatteryManager`。

协议层 keepalive（russh 间隔探活）不拉这个服务。见文末。

## 路径

| 作用 | 路径 |
|------|------|
| 前台服务 | `src-tauri/gen/android/app/src/main/java/com/voltius/app/VoltiusTunnelService.kt` |
| 清单与权限 | `src-tauri/gen/android/app/src/main/AndroidManifest.xml` |
| Rust 侧同步 | `src-tauri/src/port_forward/keepalive.rs` |
| SSH 会话计数 | `src-tauri/src/ssh/session.rs` 的 `SessionManager::add` / `disconnect` |
| 隧道列表 | `src-tauri/src/port_forward/mod.rs` 的 `emit_state_for` / `teardown_key` |
| JNI 上下文 | `src-tauri/src/android_ctx.rs` 的 `with_env` / `load_class` |
| 通知权限请求 | `src-tauri/gen/android/app/src/main/java/com/voltius/app/MainActivity.kt` |
| 通知文案 | `src-tauri/gen/android/app/src/main/res/values/strings.xml`（中文在 `values-zh/strings.xml`） |
| 状态栏图标 | `src-tauri/gen/android/app/src/main/res/drawable/ic_stat_tunnel.xml` |

## 调用链

1. 终端会话写入 `SessionManager` 后计数。`add` 在 `insert` 之后调 `keepalive::sync_ssh_sessions(sessions.len())`。`disconnect` 在 `remove` 之后同样调用。计数没变就不再通知（`AtomicUsize` 比较）。
2. 连接命令成功后走 `state.add`。见 `src-tauri/src/commands/ssh.rs`。
3. 端口转发状态广播时，`emit_state_for` 持锁调 `keepalive::sync`。主机隧道拆掉时，`teardown_key` 在 `remove` 之后再 `sync`。
4. `active_tunnel_lines` 只收 `TunnelState::Active`。行排序后再比较，列表不变就不重发通知。
5. 仅 `target_os = "android"` 才调 JNI。其他平台的 `notify_sessions` / `notify_tunnels` 是空函数。
6. `notify_sessions` 调 `VoltiusTunnelService.updateSessions(Context, int)`。`notify_tunnels` 把行用 `\n` 拼成一个字符串，调 `updateTunnels(Context, String)`。类名是 `com.voltius.app.VoltiusTunnelService`，经 `android_ctx::load_class`。
7. JNI 上下文来自 `VoltiusKeychain.nativeInit`。`MainActivity.onCreate` 在 `super.onCreate` 之后调用它，传入 `applicationContext`。`nativeInit` 没跑时，`with_env` 返回错误，不 panic。

`MainActivity.onPause` 只调 `VoltiusBiometric.setForeground(this, false)`。它不启动隧道服务。

## 服务行为

以下都来自 `VoltiusTunnelService.kt`。

- 伴生对象里的 `tunnels` 加 `sessions` 大于 0，且服务还没在跑、也没在 `starting`，就 `ContextCompat.startForegroundService`。
- `onStartCommand` 必须先 `startForeground`。API 34 及以上类型是 `FOREGROUND_SERVICE_TYPE_SPECIAL_USE`，更低版本传 0。这步抛异常则 `stopSelf`，并返回 `START_NOT_STICKY`。
- 正常路径也返回 `START_NOT_STICKY`。源码没有在进程被杀后自动拉起该服务的逻辑。
- `tunnels` 为空且 `sessions == 0` 时，`stopForeground(STOP_FOREGROUND_REMOVE)` 再 `stopSelf`。
- 从后台 `startForegroundService` 失败时，`catch` 把 `starting` 置回 `false`。注释写的是 Android 12+ 会拒绝后台启动，下一次状态变化再试。本次没在设备上复现这句注释。
- 通知 ID 是 `0x7e1`。频道 ID 是 `tunnels`，重要性 `IMPORTANCE_LOW`。通知为 ongoing，`setOnlyAlertOnce(true)`，类别 `CATEGORY_SERVICE`。
- 展开列表最多 5 行（`MAX_LINES`），多出的用 `tunnel_notification_more`。
- 有 SSH 会话时，点通知走启动 Intent。只有隧道时，点通知打开 `voltius://port-forwarding`。
- 只有隧道数大于 0 才加「Stop tunnels」。Action 是 `com.voltius.app.action.STOP_TUNNELS`。

停隧道不断 SSH。Kotlin `nativeStopTunnels()` 对应 `Java_com_voltius_app_VoltiusTunnelService_nativeStopTunnels`。它异步调 `PortForwardManager::stop_all_tunnels`。该函数注释写明 SSH 会话保留。

第一次要启服务时，若 `MainActivity.instance` 非空，会调 `requestNotificationPermission`。API 33 以下直接返回。同一进程只问一次。已授予 `POST_NOTIFICATIONS` 则不再问。

## 清单

`AndroidManifest.xml` 声明了这三项权限：

- `android.permission.FOREGROUND_SERVICE`
- `android.permission.FOREGROUND_SERVICE_SPECIAL_USE`
- `android.permission.POST_NOTIFICATIONS`

服务 `android:name=".VoltiusTunnelService"`，`android:exported="false"`，`android:foregroundServiceType="specialUse"`。

`android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE` 的值是：

> Keeps SSH terminal sessions and port-forwarding tunnels opened by the user connected while the app is in the background

清单注释写：`dataSync` 在 Android 15 上每天会在 6 小时后停，所以没用该类型。这是注释，本次没在设备上核对。

服务类注释还写：进入后台大约一分钟后网络会被切，SSH 会掉。同样只是注释，本次没计时。

## 通知文案（默认英文）

- 频道名：`Background connections`（中文：后台连接）
- 会话标题：`%d SSH session connected` / `%d SSH sessions connected`（中文：已连接 %d 个 SSH 会话）
- 会话正文：`Tap to return to Voltius`
- 隧道标题：`%d port forwarded` / `%d ports forwarded`
- 隧道正文：`Tap to manage port forwarding`
- 停止按钮：`Stop tunnels`（中文：停止隧道）

中文 `plurals` 只有 `other`，没有 `one`。

## 不要和协议层 keepalive 混在一起

这些路径维护 SSH 链路，不启动前台服务：

- `src-tauri/src/ssh/client.rs` 的 `client_config`。`keepalive_interval_secs == 0` 时不设 `keepalive_interval`。
- `src-tauri/src/commands/ssh.rs` 在调用方没传时，间隔默认 3 秒，失败上限默认 3。
- `connect_authenticated` 把间隔传 0，一次性连接不开这个探活。
- `src-tauri/src/sftp/mod.rs` 的 `spawn_keepalive` 是 SFTP 通道探活。间隔或上限为 0 则直接返回。

`keepalive.rs` 里的单测只覆盖隧道行文案和「只列 Active」。没有 JNI 或前台服务测试。

## 真机验收步骤（Android 保活优化）

### 目的
验证在调整 `intervalSecs` 和 `max` 后，应用进入后台再切回前台，SSH 会话不会因保活探活超时而断开。

### 步骤
1.  **设置与连接**：在「设置」中将 SSH Keepalive 设为某个非默认值（例如 30s）。连接到一个远程 SSH 服务器，确保终端会话已建立。
2.  **触发后台**：点击手机 Home 键回到桌面，或通过任务切换器切换到其他应用，使 Termius 进入后台。
3.  **等待网络切换**：等待 Android 系统对后台应用的杀网/限制生效（通常约 1-2 分钟，观察系统通知栏是否出现保活通知）。
4.  **返回前台**：重新切换回 Termius。观察 SSH 终端界面。
5.  **预期结果**：
    -   SSH 连接保持活跃，不触发重连。
    -   UI 界面不应有「正在重连」或断开的对勾标志。
    -   终端能够立即响应键盘输入。

## 缺少的单测

-   `resolveKeepalive` 平台差异性测试：确保 `platform="android"` 时，返回的 `intervalSecs` 和 `max` 始终不低于 `ANDROID_KEEPALIVE`。
-   `resolveKeepalive` 边界条件测试：确保 `preset="off"` 时，即使平台是 `android`，也返回 `intervalSecs=0`（保活关闭）。
-   `resolveKeepalive` 预设覆盖测试：确保用户设定的更紧凑的预设（如果有）被 `ANDROID_KEEPALIVE` 强制拉长。
