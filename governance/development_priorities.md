# 开发优先级

更新：2026-11-20。依据是已接受的 [D0001](decisions/D0001-session-lifecycle-and-canvas-restore.md)，以及 `docs/capture/FIELDS.md`、`docs/capture/PERFORMANCE.md` 已写明的未验收项。本表本身不是 Decision。

| 顺序 | 工作 | 状态 / 完成时能看到什么 |
| --- | --- | --- |
| P0 | 实现 D0001 并重写 `USAGE.md` | 已于 2026-11-20 完成 |
| P0 | 保持验收边界 | 自动测试、内存日志耗时不被写成数位板笔感、约一小时创作或大文件回放的结果；下一步需真人试采与真实数位板验收 |
| P1 | 监督标签、远程验收、24fps 原长视频 | 仍缺，直到本仓库有对应 Decision 才进入记录格式 |
| 不列入 | `package-lock.json` 根上的 `name` 被删去一行 | 与采集契约无关，本轮不处理 |

工具或界面润色不先于 P0。`97af788`（2026-11-19）的界面调整早于 P0 完成，已在 [PROJECT_STATE.md](../PROJECT_STATE.md) 记为事实。不要把 iDrawProcess 的优先级表复制为本仓库的顺序。
