# Klecks 项目状态

更新：2026-11-20。阶段：上游 Klecks `53e046b`（0.11.3.3）之上已有过程采集层本地提交，未推送。已接受 1 条 Decision：[D0001](governance/decisions/D0001-session-lifecycle-and-canvas-restore.md)，已实现。[E0001](governance/explorations/E0001-canvas-restore.md) 已关闭。

## 阅读顺序

1. [AGENTS.md](AGENTS.md)
2. 本文件
3. [共识边界](governance/project_consensus.md)
4. [决策索引](governance/decision_index.md)
5. [D0001](governance/decisions/D0001-session-lifecycle-and-canvas-restore.md)
6. [开发优先级](governance/development_priorities.md)
7. 采集细节：`docs/capture/FIELDS.md`、`docs/capture/PERFORMANCE.md`、`docs/capture/USAGE.md`

上游安装、构建和翻译仍以 [README.md](README.md) 为准。旁边的 iDrawProcess 仓库不在本索引内。

## 当前事实

| 范围 | 状态 | 证据与边界 |
| --- | --- | --- |
| 上游绘画应用 | 基线提交 `53e046b` | 提交说明为 0.11.3.3；采集代码把该哈希写死为 `CAPTURE_CODE_VERSION` |
| 过程采集 | 已在本地提交（`0c42feb` 本地采集、`a73a21b` 作品目录与作品信息页、`97af788` 界面布局调整，以及 11-20 的 D0001 实现与文档同步） | `src/app/script/capture/`，接入 `kl-app.ts`、画笔、历史和指针 |
| 画布替换与会话流转 | D0001 已实现 | 绘画中换作品前先提示保存并落盘末位检查点；非绘画中打开/续画一律用末位检查点替换；点「结束」保存后时钟复位 `idle` 回首页；进「作品信息」页自动暂停、返回绘画自动恢复 |
| Klecks 自带恢复 | 已关闭，符合 D0001 | `main-standalone.ts` 不初始化 IndexedDB 和标签页恢复；`file-ui.ts` 隐藏浏览器存储与恢复入口 |
| 记录格式 | 代码与字段说明一致 | `schemaVersion = 1`，渲染记录 `klecks-checkpoint-png-1`；缺监督、远程验收、24fps 视频 |
| 自动测试 | 2026-11-20 全部通过 | `model.test.ts`（2 万条内存日志 5.94ms）、`replay.test.ts`、`catalog.test.ts`、`admin-lock.test.ts` 通过；`npm run build` 打包通过。不是数位板或长会话验收 |
| 使用说明 | 已于 2026-11-20 与代码同步 | `docs/capture/USAGE.md` 已按当前入口页、停靠栏及 D0001 重写 |

## 优先级摘要

D0001 已落地，后续 P0 是保持验收边界并安排真人试采与真实数位板验收。`97af788` 的界面润色先于上述工作完成，与优先级表不符，记为事实。依据见 [开发优先级](governance/development_priorities.md)。
