# 开发优先级

更新：2026-10-21。依据是 [E0001](explorations/E0001-canvas-restore.md) 的文档与实现冲突，以及 `docs/capture/FIELDS.md`、`docs/capture/PERFORMANCE.md` 已写明的未验收项。不是来自 Decision。

| 顺序 | 工作 | 完成时能看到什么 |
| --- | --- | --- |
| P0 | 关闭 E0001：确认打开作品和继续绘画是否替换画布 | 有 Decision；使用说明和 `openSelectedWork` / `resumePaint` 只保留被接受的一边 |
| P0 | 保持验收边界 | 自动测试、内存日志耗时不被写成数位板笔感、约一小时创作或大文件回放的结果 |
| P1 | 监督标签、远程验收、24fps 原长视频 | 仍缺，直到本仓库有对应 Decision 才进入记录格式 |
| 不列入 | `package-lock.json` 根上的 `name` 被删去一行 | 与采集契约无关，本轮不处理 |

工具或界面润色不先于 E0001。不要把 iDrawProcess 的优先级表复制为本仓库的顺序。
