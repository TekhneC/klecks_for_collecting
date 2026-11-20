# D0001 采集会话流转与画布恢复规则

状态：已接受（2026-10-27 确立绘画进程中换作品前先保存；2026-11-19 确立非绘画进程替换与关闭 Klecks 自带恢复并关闭 [E0001](../explorations/E0001-canvas-restore.md)；2026-11-20 确立结束回首页置 `idle` 与作品信息页自动暂停/恢复，同日合并为本文件）。已于 2026-11-20 全部实现。

## 决定

### 1. 画布恢复来源
- Klecks 自带的恢复（启动时标签页恢复、浏览器存储、恢复面板与横幅）不保留，避免收集者混淆两套恢复来源。
- 画布只经采集检查点恢复。

### 2. 非绘画进程中的打开与续画
- 过程时钟不在 `recording` / `paused`（即 `idle` 或 `ended`）时，打开已有作品或继续绘画，一律用目标作品最晚的采集检查点替换当前画布；没有可恢复画面时拒绝。
- 此时当前画布已保存或本无当前画布，替换不会丢失收集内容。

### 3. 绘画进程中切换、打开或续画另一幅作品
- 正在绘画进程中（过程时钟为 `recording` 或 `paused`）点击「切换作品」、打开已有作品，或转到另一幅作品继续绘画时：
  1. 先提示保存当前绘画；用户取消则留在当前画布。
  2. 用户确认后，先结束本轮、写入末位检查点并刷入本地存储；保存失败则留在当前画布并报错，不丢弃数据。
  3. 保存完成后，再用目标作品最晚的采集检查点替换当前画布（或进入首页待选择）。

### 4. 结束本轮与作品信息页
- **点击「结束」**：写入 `session.end`、等待末位检查点编码落盘并刷入本地存储；保存失败则留在当前画布并提示错误；保存成功后过程时钟复位为 `idle`，页面回到首页（入口门禁页），等待新建作品或从已有作品打开/续画。不再停留在绘制页的 `ended` 状态。
- **进入「作品信息」页**：若进入前过程时钟处于 `recording`，自动进入 `paused`（过程时钟冻结、画布锁定），填写信息的时间不计入绘画时长。点击「返回绘画」回到画布时，若本次暂停由进入作品信息页自动触发，自动恢复为 `recording`；若进入前原本就是手动 `paused`，返回后保持 `paused`。

## 实现落点（2026-11-20）

- `src/app/script/capture/model.ts`：`ProcessClock.reset()`。
- `src/app/script/capture/controller.ts`：`finalizeCurrentSession`、`end`、`switchWork`、`openSelectedWork`、`resumePaint`、`holdClockForWorkInfo` / `finishWorkInfoHold`、`editWorkInfo` / `cancelWorkInfo`。
- `src/app/script/capture/panel.ts`：作品信息页引导文案。
- `src/app/script/main-standalone.ts`、`src/app/script/app/kl-app.ts`、`src/app/script/klecks/ui/tool-tabs/file-ui.ts`：关闭 Klecks 自带恢复与存储入口。
- `docs/capture/USAGE.md`：试采步骤与上述规则同步。
