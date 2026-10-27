# Klecks 项目状态

更新：2026-10-21。阶段：上游 Klecks `53e046b`（0.11.3.3）上的未提交过程采集。尚无已接受 Decision。打开或续画是否用检查点替换画布，见 [E0001](governance/explorations/E0001-canvas-restore.md)，未关闭。

## 阅读顺序

1. [AGENTS.md](AGENTS.md)
2. 本文件
3. [共识边界](governance/project_consensus.md)
4. [决策索引](governance/decision_index.md)（目前为空）
5. [E0001](governance/explorations/E0001-canvas-restore.md)
6. [开发优先级](governance/development_priorities.md)
7. 采集细节：`docs/capture/FIELDS.md`、`docs/capture/PERFORMANCE.md`、`docs/capture/USAGE.md`

上游安装、构建和翻译仍以 [README.md](README.md) 为准。旁边的 iDrawProcess 仓库不在本索引内。

## 当前事实

| 范围 | 状态 | 证据与边界 |
| --- | --- | --- |
| 上游绘画应用 | 提交 `53e046b` | 提交说明为 0.11.3.3；采集代码把该哈希写死为 `CAPTURE_CODE_VERSION` |
| 过程采集 | 工作区未提交 | `src/app/script/capture/`，接入 `kl-app.ts`、画笔、历史和指针 |
| 记录格式 | 代码与字段说明一致 | `schemaVersion = 1`，渲染记录 `klecks-checkpoint-png-1`；缺监督、远程验收、24fps 视频 |
| 自动测试 | 2026-10-21 通过 | `model.test.ts`：2 万条内存日志 5.94ms；`replay.test.ts` 通过。不是数位板或长会话验收 |
| 使用说明 | 与界面、恢复行为不一致 | [E0001](governance/explorations/E0001-canvas-restore.md) |

## 优先级摘要

P0 是确认 E0001，以及不要把自动测试写成真人试采。已写明缺失的监督、远程验收和原长视频保持在决策之外。依据见 [开发优先级](governance/development_priorities.md)。
