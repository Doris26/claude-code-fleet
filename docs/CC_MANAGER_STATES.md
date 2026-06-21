# cc-manager Fleet — States, Lifecycle & Triggers

状态 · 生命周期 · 触发器 — claude-code-fleet mechanism reference

Answers to: task statuses · worker statuses · who decides each · when a tmux session is killed · why keepalive respawns · when DR runs.

---

## 1. Task status (`cc-task`) — 一个 task 有哪些 status / 谁决定

| Status | Set by (action) | Who triggers it |
|---|---|---|
| `assigned` | `cc-task add` (cc-recruit 创建时) | **Manager** — 招募 / 建任务时的默认初始态 |
| `in_progress` | `cc-task start` | **Manager**(或 worker 接手） |
| `blocked` | `cc-task block` | **Manager**（常在 cc-monitor `idle-on-blocker` 标记后） |
| (unblock) | `cc-task unblock` → 回 `assigned`/`in_progress` | **Manager** |
| `completed` | `cc-task done` | **多来源**：cc-monitor 自动 flip（deliverable + terminal verdict）· `:41`/`:17` 审计 cron · Manager · worker 自己（certified-terminal） |
| `cancelled` | `cc-task cancel` | **Manager**（如 user 要求取消，例：a cancelled task `T-fd131ceb`） |

> `completed` 是唯一**多来源**的状态：当有 deliverable 文件 **+** 终态 verdict 时，cc-monitor 会自动 flip，无需 manager 动手。其余状态基本都由 manager 决定。

---

## 2. Worker status (`workers.json`) — 一个 worker 有哪些 status / 谁决定

| Status | Meaning | Set by |
|---|---|---|
| `active` | 已招募 + 在跑 | `cc-recruit`（spawn 时） |
| `completed` | mandate 完成 / 自然结束 | `cc-retire`（带 verdict） |
| `retired` | manager 主动退休（缩编 / 重启清掉 / 不再需要） | `cc-retire` |

> 谁决定 = **MANAGER**：`cc-recruit` → `active`，`cc-retire` → `completed`/`retired`。
> cc-monitor 能**检测**到死掉的 pane（status=active 但 tmux 没了）并 **FLAG**，但**不会**自动翻 worker 状态 —— 由 manager 决定。
> 另有独立的 `watch` 布尔值 = 是否在 watch.list（manager 自己 status=active 但 watch=false）。

### 2b. 什么时候会 retire 一个 worker

由 **MANAGER** 跑 `cc-retire` 决定，触发条件：

| 触发 | 例子 |
|---|---|
| **bounded 任务完成**（deliverable + verdict 落地） | a bounded worker —— 交付落地后立即 retire |
| **user 要求取消** | a worker —— 你说 cancel → cc-retire |
| **探索型：命中 metric / 到 deadline / certified-terminal**（worker 跑了 `cc-task done`）→ keepalive 先 release | 8h 冲 metric 的任务命中或证明不可达 |
| **缩编 / 不再需要** | 重启清掉的 fleet |
| **mandate 完成后空转 / 造成 API 争用** | a worker —— "mandate complete + idle-looping" |
| **manager 交接** | 旧 manager —— 我接管时它 stand down + 被 kill |

> cc-monitor 能 **flag** 死掉的 pane,但**从不自动 retire**。
> 区分:**task** → `completed`/`cancelled`(cc-task);**worker** → `retired`/`completed`(cc-retire)。bounded worker 是任务完成触发 retire;探索型是 metric/deadline/certified-terminal 触发(keepalive 先 release,manager 再 retire)。

---

## 3. 什么时候 tmux 会被 cancel（kill）

**A) 主动 kill —— 只有 MANAGER 会 kill session：**
- `cc-retire <name> --kill` —— 任务完成 / 不再需要（例：a worker 完成交付后）
- 手动 `tmux kill-session` —— user 要求取消，或 manager 交接（新 manager 杀旧的）

**B) 意外死亡：**
- claude 进程退出（`/loop` 结束 · goal 完成 · crash）→
  - 若 session **没** shell-wrap（`claude; exec $SHELL`）→ tmux 把整个 session 销毁（「为什么死了session」bug）
  - 若 shell-wrap 了 → pane 存活（keepalive 可 respawn）

> **不会** kill session 的：`cc-watch`（只对 >75min 的 runaway turn 按 Esc，从不杀 session）· `keepalive`（只 respawn，从不杀）· `cc-rm`（只把它移出 watch.list，session 还活着）· `cc-monitor`（只 flag）。

---

## 4. keepalive — 为什么需要 respawn

- `/loop` 只能在 claude **进程活着**时驱动 worker；进程死了，**死进程无法自我重启**。
- 没有 respawn，一个无人值守的 time-boxed worker 中途死掉就会一直**躺尸**直到人发现 —— 有一次损失了约 **7 小时**。
- respawn = **自动恢复**：检测到「claude 退出但 pane 还在」（shell-wrap）→ 原地重启 claude → 重新载入 `/goal` anchor → 接着冲未完成的 metric。
- **只对「无人值守的长时探索」需要**；bounded / 短任务或有人盯着的不需要 → keepalive 是**选择性 arm** 的（一个 worker arm 了，另一个没 arm）。

> 批判视角：keepalive 的「re-nudge 空闲 worker」职责跟 `/loop` 大量重叠、基本可退役；真正**不可替代**的只有 **respawn-on-death**。可瘦身成 respawn-only。

---

## 5. 什么时候会跑 DR（deep research）

DR 由 **worker** 驱动；manager 只**路由 / nudge** DR，自己**从不跑** DR（红线）。`CCDR` = `/deep-research` 这个 slash 命令。

**触发时机：**
- 每个「新探索方向」→ 先跑 CCDR（Tier 1）
- 某个 approach 判 **DEAD** 但 metric 没达 → CCDR 找「**全新 mechanism**」（"a DEAD is not done"）
- **卡住**（同一错误 2+ 次 / "not sure"）
- 一个方向耗尽、但更大 goal 还开着 → keepalive / manager re-nudge「用 DR 找方向」

**DR 升级阶梯（HARD —— 同一 goal 反复达不到就升 TIER）：**

| Tier | Tool | Cost | 升级条件 |
|---|---|---|---|
| 1 | `CCDR` = `/deep-research`（Claude） | $0 | 每个新方向，先用它 |
| 2 | Gemini DR (Mode 3) | ~$2–9 | 同一 goal 跑了几轮 CCDR 还达不到 |
| 3 | OpenAI / ChatGPT DR | ~$10–25 | Gemini DR 也达不到 |

> 三档 DR **全部耗尽**后，才可提议「付费 DATA（订阅 / feed）」—— 这是 **user / 你的 approver 的花钱决策，绝不自动批**。

### 5b. worker 怎么知道要跑 CCDR(3 层)

| 层 | 怎么告诉 worker | 可靠性 |
|---|---|---|
| **1. 招募时显式写死** | 它的 `/goal` + `/loop` 直接写(如 "先 `/deep-research` 找 NEW mechanism,别重复 trend/tsmom/coint")—— 主要的常驻指令 | 强(是 anchor) |
| **2. onboarded doctrine** | cc-recruit 注入 "读 your team's skills/rules docs(DR ladder)" → worker 学到规则:每个新方向先 CCDR、DEAD≠完成→CCDR 找新 mechanism、卡住→升 tier,于是**自主**触发 | doctrine-based(LLM 自觉,非硬强制) |
| **3. manager backstop nudge** | worker 空转 / 卡住 / 关掉一个方向但大 goal 还开 → cc-decide 发 `DR:` token → `ts` 发 "用 DR 找方向";keepalive re-nudge | 兜底 |

> 一句话:**worker 靠 goal+loop+doctrine 自触发;manager 只在它没触发时 nudge。** 不像 *review*(manager 硬驱动,worker 删不掉),CCDR **没有硬强制** —— 第 3 层是兜底。
> **CCDR prompt 质量** 由一个 prompt 模板保证(goal+metric+DEAD-list+novelty bar+ranked-falsifiable deliverable+cites),cc-recruit **自动注入**每个 worker,杜绝 free-form 弱 prompt(漏 DEAD-list = 最大浪费源)。

---

## Appendix — `cc-watch` tick 的 9 个 stage（背景）

| # | Stage | Cost |
|---|---|---|
| 1 | Freeze-gate（FROZEN → exit 整 tick） | 廉价 bash |
| 2 | 单实例锁（mkdir + mtime-steal） | 廉价 bash |
| 3 | Keepalive tick（dead→respawn / idle→re-nudge / deadline→release） | 廉价 bash |
| 4 | Cost-guard（无 open task → 停 nudge） | 廉价 bash |
| 5 | Per-worker cost-guard（无自己的 open task → skip） | 廉价 bash |
| 6 | Per-worker brain `cc-decide` + **runaway watchdog**（mid-work >75min → Esc） | **LLM** |
| 7 | 应用 guards + `ts` 发送 | tmux send |
| 8 | `cc-review` 新 commit（oldest-3/tick → 派 review subagent → FAIL 则 repoke） | **LLM subagents** |
| 9 | `cc-monitor` 检测 passes（deliverable auto-flip / drift / dropped / uncommitted / session-health …） | 廉价 bash |

> 只有 stage **6（cc-decide）** 和 **8（cc-review）** 花 LLM token；其余都是廉价 bash。
