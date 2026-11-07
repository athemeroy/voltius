# 多 Agent 协作约定

本仓多人（含 AI Agent）并行开发时按本文执行。移动端输入相关改动还须遵守
[mobile-input-architecture.md](./mobile-input-architecture.md)。

## 1. 核心原则

**一个 Agent = 一条分支 = 一个 worktree。**

- 主工作区 `~/projects/termius` 只留给人工查看、合入与集成，禁止多个 Agent 同时改同一份工作区。
- Agent 不直接推 `main` / `dev`；做完 commit，需要保留的再 push + 开 PR。
- 开工前必须有「合同」：接口 / 模块边界文档已落地（如 `docs/mobile-input-architecture.md`），再开并行。

## 2. 开工顺序

1. **收干净基线**：脏工作区先收成 `feat/...-foundation` 并测绿，或 stash；禁止从脏 `main` 各开一份 worktree。
2. **定合同**：真相源文档（行为规格 + 分层 + Intent/类型）单独合入后再拆任务。
3. **拆任务**：互不抢同一文件、互不改同一对外契约；每个任务写清目标、路径白名单、路径黑名单、验收命令。
4. **开 worktree**：从同一基线 commit 开分支与目录。
5. **串行合入**：按依赖顺序一次合一个；合完立刻跑相关测试；下一分支 rebase 到新基线后再测。

## 3. Git / worktree

| 项 | 约定 |
|----|------|
| 分支名 | `agent/<任务短名>` 或 `feat/<模块>-<摘要>` |
| 目录 | 主仓旁 `../termius-wt-<任务>`（例：`../termius-wt-gestures`） |
| 依赖 | 每个 worktree 各自安装；不要共用一个未隔离的开发库/缓存 |
| 端口/临时文件 | 按 worktree 分开，避免互踩 |
| 提交 | Agent 做完必须 commit；要留的 push + PR |
| 合入 | 串行；`git` 无冲突 ≠ 能跑 |
| 主线 | 禁止 Agent 直推 `main`；上游 PR 习惯打 `dev`，本地可先合到自己的集成支 |

示例：

```bash
git worktree add -b feat/mobile-gestures-g4 ../termius-wt-gestures <baseline-sha>
cd ../termius-wt-gestures
# …只改白名单路径…
git add -A && git commit -m "feat: implement G4 long-press drag arrow keys"
```

用完删除：

```bash
git worktree remove ../termius-wt-gestures
git branch -d feat/mobile-gestures-g4   # 已合入后
```

## 4. 任务书模板（开 Agent 时贴上）

```
目标：
基线 commit：
分支 / worktree：
只能动（白名单）：
禁止动（黑名单）：锁文件、无关 i18n、CI、架构文档真相源（除非任务就是改合同）
验收：
合入顺序提示：（例如先 Intent 类型，再纯核，再 bind，最后 UI）
```

默认黑名单（任务未写明则禁止）：

- `pnpm-lock.yaml` / `Cargo.lock` 大范围无关变更
- 全量 i18n 语言包（只改任务需要的 key）
- 同时改合同文档与实现却不先冻结合同

## 5. 本仓怎么拆（移动端输入）

按 [mobile-input-architecture.md](./mobile-input-architecture.md) **三层**拆，不要按「前端 / 后端」拆。

可并行示例：

| Agent | 白名单 | 备注 |
|-------|--------|------|
| A | `src/input/gestures/**` + 对应 `.test.ts` | G4 / G8 / G9 纯逻辑 |
| B | `src/components/mobile/KeyLibrarySheet*`、`keyGroups*`、按键行 UI | K3 等，不挂 touch |
| C | `src-tauri/**` 键盘相关（如 `TerminalKeyboard.kt`、`terminal_kbd.rs`） | 与 JS 手势错开 |
| D | `docs/**` 或限定范围的 i18n | |

禁止并行：

- 同时改 `src/input/bind/**` 与 `recognizer.ts` 的对外 Intent 形状
- 同时改 `gestureConfig` 阈值又改所有调用方（先合配置合同）
- 多个 Agent 同时改 `MobileTerminalGestures` 或迁移中的同一文件

合入顺序建议：Intent / 类型合同 → 纯核（gestures/terminal）→ bind → UI 组件 → 平台（tauri/android）。

## 6. 当前半成品纪律

若主工作区仍有未提交的 mobile-input 迁移：

1. **先别开第二、第三个 Agent 并行**。
2. 把半成品收成 `feat/mobile-input-foundation`（或同等名），测绿后再按缺口规格（G4 / G8 / G9 / K3 等）开 worktree。
3. 新 Agent 接到任务时：先读本文 + `mobile-input-architecture.md`；若发现自己在主目录脏树上改，应停下并要求单独 worktree。

## 7. 验收底线

- 纯逻辑改动：对应 `.test.ts` 在 node 环境通过。
- 触及行为规格：先改/对齐 `docs/mobile-input-architecture.md`，再改代码。
- PR / 合入前至少：相关单测 + 你日常的 tauri / android 冒烟（任务书写明命令）。
