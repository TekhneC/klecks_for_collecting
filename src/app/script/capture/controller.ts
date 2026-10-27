import { TDrawEvent } from '../klecks/kl-types';
import { TViewportTransform } from '../klecks/ui/project-viewport/project-viewport';
import { TEaselBrushCapture } from '../klecks/ui/easel/tools/easel-brush';
import { CanvasReplay, buildFilm } from './replay';
import {
    CAPTURE_CODE_VERSION,
    CAPTURE_RENDERER_VERSION,
    CAPTURE_SCHEMA_VERSION,
    DEFAULT_CAPTURE_CONFIG,
    OperationLog,
    ProcessClock,
    WorkMeta,
    newId,
} from './model';
import { CaptureStore, StoredRecord } from './store';
import { decodeZip, encodeZip } from './zip';
import { mountCapturePanel, CapturePanel } from './panel';

export type CaptureLayerInfo = {
    id: string;
    name: string;
    opacity: number;
    isVisible: boolean;
    mixModeStr: string;
    index: number;
    canvas: HTMLCanvasElement;
};

export type CaptureDrawParams = {
    tool: string;
    brushId: string | null;
    color: { r: number; g: number; b: number } | null;
    size: number | null;
    opacity: number | null;
    stabilizerUi: number | null;
    stabilizerBlend: number | null;
    layerId: string | null;
    layerName: string | null;
    brushFields: Record<string, string | number | boolean | null>;
};

export type CaptureRestoreLayer = {
    id: string;
    name: string;
    opacity: number;
    isVisible: boolean;
    mixModeStr: string;
    image: CanvasImageSource;
};

export type CaptureHost = {
    getDrawParams: () => CaptureDrawParams;
    getTransform: () => TViewportTransform | null;
    getCanvasSize: () => { width: number; height: number };
    getLayers: () => CaptureLayerInfo[];
    getHistorySummary: () => { keys: string[]; layerIds: string[]; memoryEstimateBytes: number } | null;
    setPaused: (paused: boolean) => void;
    setReplayLocked: (locked: boolean) => void;
    setReplayImage: (image: CanvasImageSource | null) => void;
    setTransform: (transform: TViewportTransform) => void;
    restoreProject: (state: {
        width: number;
        height: number;
        layers: CaptureRestoreLayer[] | null;
        flat: CanvasImageSource | null;
    }) => void;
    clearProject: () => void;
};

type QueueItem = StoredRecord;

const COORDINATE_NOTE =
    '画布坐标由 Klecks 用视口变换的逆矩阵，把指针相对画板元素的 CSS 像素 relX/relY 变换得到。pre_stabilizer 是稳定器之前、坐标变换之后的点。post_stabilizer 是 LineSanitizer 与 LineSmoothing 之后、笔刷实际收到的点。二者都不是屏幕坐标，也不是 Klecks 内部历史瓦片。';

const TIME_NOTE =
    'tPerformance 使用指针事件的 performance 时间轴；没有事件时间时用记录时刻的 performance.now()。tWall = 会话开始时的 Date.now() 与 performance.now() 之差，加上 tPerformance。tProcess 只扣除明确暂停，不扣除落笔间隙、思考或页面隐藏。';

const PRESSURE_NOTE =
    'pressureRaw 是浏览器 PointerEvent.pressure 原值，不把 0 改成 0.5，也不把 Klecks 为鼠标/触摸替换后的压力当作原始压力。pressureUsedByBrush 是 Klecks 归一化后交给笔刷的值。合并采样点若浏览器没有单独压力，则与父事件相同，并标 pressureSharedWithParent。';

const RANDOM_NOTE =
    'Klecks 部分笔刷在绘制时调用 Math.random。运行中的随机数状态无法读取，此处留空，不推测种子。';

function plainFields(source: object | null | undefined): Record<string, string | number | boolean | null> {
    const out: Record<string, string | number | boolean | null> = {};
    if (!source) {
        return out;
    }
    for (const key of Object.keys(source)) {
        const value = (source as Record<string, unknown>)[key];
        if (value == null || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
            out[key] = value as string | number | boolean | null;
        }
    }
    return out;
}

export function readPlainBrushFields(brush: object | null | undefined): Record<string, string | number | boolean | null> {
    return plainFields(brush);
}

export class CaptureController {
    private readonly clock = new ProcessClock();
    private readonly log = new OperationLog();
    private readonly store = new CaptureStore();
    private readonly panel: CapturePanel;
    private work: WorkMeta = {
        authorId: '',
        workId: '',
        title: '',
        creationMode: 'free',
        theme: '',
        referenceNote: '',
        referenceSource: '',
        licenseScope: '',
        tabletNote: '',
        driverNote: '',
    };
    private sessionId = '';
    private continuedFromSessionId: string | null = null;
    private queue: QueueItem[] = [];
    private pendingCheckpoint = 0;
    private strokeId: string | null = null;
    private strokeOpen = false;
    private duringPauseEdits = 0;
    private lastFlushError: string | null = null;
    private lastFlushAt: string | null = null;
    private persistedCount = 0;
    private viewportTimer: ReturnType<typeof setTimeout> | undefined;
    private flushTimer: ReturnType<typeof setInterval> | undefined;
    private lastViewport = '';
    private submissionId: string | null = null;
    private readonly performanceOriginWall: number;
    private captureCallbackMs = 0;
    private captureCallbackCount = 0;
    private player: CanvasReplay | null = null;
    private replayWorkId = '';
    private replaying = false;
    private playing = false;
    private replayTime = 0;
    private replayFrame = 0;
    private tickTime = 0;
    private savedTransform: TViewportTransform | null = null;
    private appliedViewKey = '';
    private loadToken = 0;
    private resumeProcessMs: number | null = null;
    private suppressHistory = false;
    private worksBackfilled = false;
    private replayHold = false;

    constructor(private readonly host: CaptureHost) {
        this.performanceOriginWall = Date.now() - performance.now();
        this.panel = mountCapturePanel({
            onStart: () => this.createWork(),
            onContinue: () => void this.resumePaint(),
            onPause: () => this.pause(),
            onResume: () => this.resume(),
            onEnd: () => this.end(),
            onSave: () => void this.flush(true),
            onExport: () => void this.exportZip(),
            onSubmit: () => void this.submitLocal(),
            onImport: (file) => void this.importZip(file),
            onRefresh: () => void this.refreshWorks(),
            onAuthor: () => void this.refreshWorks(),
            onCreate: () => this.createWork(),
            onWatch: () => void this.watch(),
            onResumePaint: () => void this.continuePaint(),
            onOpenWork: () => void this.openSelectedWork(),
            onSwitch: () => this.switchWork(),
            onPlay: () => void this.play(),
            onPauseReplay: () => this.pauseReplay(),
            onExitReplay: () => this.exitReplay(),
            onSeek: (timeMs) => void this.seekFromUi(timeMs),
            onSpeed: () => {
                if (this.playing) {
                    this.tickTime = performance.now();
                }
            },
            writeForm: (work) => {
                this.work = work;
            },
        });
        this.flushTimer = setInterval(() => {
            if (this.clock.status === 'recording' || this.clock.status === 'paused') {
                void this.flush(false);
            }
        }, DEFAULT_CAPTURE_CONFIG.flushIntervalMs);
        document.addEventListener('visibilitychange', () => {
            if (this.clock.status !== 'recording' && this.clock.status !== 'paused') {
                return;
            }
            this.enqueue('quality', {
                type: 'visibility',
                state: document.visibilityState,
                uncertain: true,
                note: '页面隐藏或恢复不是明确休息，过程时钟继续。',
                ...this.clock.mark(performance.now(), Date.now()),
            });
            void this.flush(false);
        });
        window.addEventListener('pagehide', () => {
            void this.flush(false);
        });
        this.render();
        this.syncCanvasLock();
        void this.refreshWorks();
    }

    onPreStabilizer(sample: TEaselBrushCapture): void {
        const t0 = performance.now();
        if (this.clock.status !== 'recording') {
            return;
        }
        const drawingButton = sample.button === undefined || sample.button === 'left' || sample.phase === 'up';
        if (!drawingButton && sample.phase !== 'down') {
            this.noteViewportSoon();
            return;
        }
        if (sample.phase === 'down' && sample.button && sample.button !== 'left') {
            this.enqueue('pointer', {
                channelKind: 'navigation',
                ...this.sampleBody(sample),
            });
            return;
        }
        if (sample.phase === 'down') {
            this.strokeOpen = true;
            this.strokeId = newId('stroke');
            const stroke = this.log.push({
                id: this.strokeId,
                sessionId: this.sessionId,
                workId: this.work.workId,
                kind: 'stroke',
                tProcess: this.clock.processMs,
                tWall: Date.now(),
                duringPause: this.clock.status === 'paused',
                checkpointStatus: 'not-applicable',
                checkpointId: null,
                coversThroughSequence: null,
            });
            this.enqueue('stroke', {
                strokeId: this.strokeId,
                tProcess: stroke.tProcess,
                params: this.host.getDrawParams(),
                randomState: null,
                randomStateNote: RANDOM_NOTE,
            });
        }
        if (!this.strokeId && sample.phase !== 'down') {
            return;
        }
        this.enqueue('pre_stabilizer', {
            strokeId: this.strokeId,
            ...this.sampleBody(sample),
        });
        if (sample.phase === 'up') {
            this.strokeOpen = false;
            const interrupted = sample.endedBy === 'cancel' || sample.endedBy === 'leave';
            this.enqueue('stroke_end', {
                strokeId: this.strokeId,
                interrupted,
                endedBy: sample.endedBy ?? 'up',
                ...this.clock.mark(sample.time || performance.now(), Date.now()),
            });
            this.strokeId = null;
        }
        this.captureCallbackMs += performance.now() - t0;
        this.captureCallbackCount++;
    }

    onPostStabilizer(event: TDrawEvent): void {
        if (this.clock.status !== 'recording') {
            return;
        }
        if (!DEFAULT_CAPTURE_CONFIG.recordPostStabilizer) {
            return;
        }
        const now = performance.now();
        this.enqueue('post_stabilizer', {
            strokeId: this.strokeId,
            event,
            pressureNote: '此压力是笔刷收到的归一化值，不是 pressureRaw。',
            ...this.clock.mark(now, Date.now()),
        });
    }

    onHistory(kind: 'push' | 'undo' | 'redo'): void {
        if (this.suppressHistory) {
            return;
        }
        if (this.clock.status !== 'recording') {
            return;
        }
        const duringPause = false;
        const time = this.clock.mark(performance.now(), Date.now());
        const summary = this.host.getHistorySummary();
        const record = this.log.push({
            id: newId('op'),
            sessionId: this.sessionId,
            workId: this.work.workId,
            kind,
            tProcess: time.tProcess,
            tWall: time.tWall,
            duringPause,
            checkpointStatus: 'pending',
            checkpointId: null,
            coversThroughSequence: null,
        });
        this.enqueue('operation', {
            ...record,
            history: summary,
            drawParams: this.host.getDrawParams(),
            layers: this.layerMeta(),
            canvas: this.host.getCanvasSize(),
        });
        if (!this.strokeOpen) {
            this.queueCheckpoint(record.sequence, 'flattened', time.tProcess);
        } else {
            record.checkpointStatus = 'gap';
            this.enqueue('quality', {
                type: 'checkpoint_deferred',
                sequence: record.sequence,
                note: '落笔过程中跳过画布读回，笔画结束后的下一次检查点覆盖该状态。',
            });
        }
        this.render();
    }

    noteViewportSoon(): void {
        if (this.clock.status !== 'recording' && this.clock.status !== 'paused') {
            return;
        }
        clearTimeout(this.viewportTimer);
        this.viewportTimer = setTimeout(() => this.commitViewport(), DEFAULT_CAPTURE_CONFIG.viewportDebounceMs);
    }

    private commitViewport(): void {
        const transform = this.host.getTransform();
        if (!transform) {
            return;
        }
        const key = JSON.stringify(transform);
        if (key === this.lastViewport) {
            return;
        }
        this.lastViewport = key;
        this.enqueue('viewport', {
            sampling: 'debounced_120ms',
            note: '视口记录在变化停顿后写入，不是连续轨迹，也不改变画布内容。',
            transform,
            ...this.clock.mark(performance.now(), Date.now()),
        });
    }

    private sampleBody(sample: TEaselBrushCapture) {
        const time = sample.time || performance.now();
        return {
            inputKind: 'pre_stabilizer' as const,
            phase: sample.phase,
            x: sample.x,
            y: sample.y,
            relX: sample.relX,
            relY: sample.relY,
            pressureRaw: sample.pressureRaw ?? null,
            pressureUsedByBrush: sample.pressure ?? null,
            pressureSharedWithParent: sample.isCoalesced,
            pointerType: sample.pointerType,
            pointerId: sample.pointerId,
            isCoalesced: sample.isCoalesced,
            button: sample.button ?? null,
            endedBy: sample.endedBy ?? null,
            coordinateNote: COORDINATE_NOTE,
            ...this.clock.mark(time, this.performanceOriginWall + time),
        };
    }

    private layerMeta() {
        return this.host.getLayers().map((layer) => ({
            id: layer.id,
            name: layer.name,
            opacity: layer.opacity,
            isVisible: layer.isVisible,
            mixModeStr: layer.mixModeStr,
            index: layer.index,
        }));
    }

    private enqueue(channel: string, payload: unknown): void {
        if (!this.sessionId) {
            return;
        }
        this.queue.push({
            workId: this.work.workId,
            sessionId: this.sessionId,
            channel,
            payload,
        });
    }

    private environment() {
        const nav = navigator as Navigator & { deviceMemory?: number };
        return {
            userAgent: navigator.userAgent,
            language: navigator.language,
            hardwareConcurrency: navigator.hardwareConcurrency ?? null,
            deviceMemoryGb: nav.deviceMemory ?? null,
            maxTouchPoints: navigator.maxTouchPoints ?? null,
            screen: {
                width: window.screen?.width ?? null,
                height: window.screen?.height ?? null,
                devicePixelRatio: window.devicePixelRatio ?? null,
            },
            tablet: this.work.tabletNote || null,
            driver: this.work.driverNote || null,
            missingDeviceNote: '驱动与数位板型号仅在表单填写时记录，未填写则为空，不根据浏览器信息推测。',
        };
    }

    private start(continued: boolean): void {
        this.panel.readInto(this.work);
        if (!this.work.authorId.trim()) {
            this.panel.setStatus('需要填写匿名作者编号。', 'error');
            return;
        }
        if (!this.work.workId.trim()) {
            this.work.workId = newId('work');
            this.panel.write(this.work);
        }
        if (!continued) {
            this.log.sequence = 0;
            this.log.undoDepth = 0;
            this.log.lastActiveSequence = 0;
            this.log.operations.splice(0, this.log.operations.length);
        }
        const previousSessionId = this.sessionId || null;
        this.sessionId = newId('session');
        this.continuedFromSessionId = continued ? previousSessionId : null;
        const now = performance.now();
        const resumeMs = this.resumeProcessMs ?? this.clock.processMs;
        this.resumeProcessMs = null;
        if (continued) {
            this.clock.continueFrom(now, Date.now(), resumeMs);
        } else {
            this.clock.start(now, Date.now());
        }
        this.syncCanvasLock();
        const size = this.host.getCanvasSize();
        this.enqueue('session', {
            type: 'start',
            continued,
            continuedFromSessionId: continued ? this.continuedFromSessionId : null,
            schemaVersion: CAPTURE_SCHEMA_VERSION,
            rendererVersion: CAPTURE_RENDERER_VERSION,
            codeVersion: CAPTURE_CODE_VERSION,
            config: DEFAULT_CAPTURE_CONFIG,
            work: this.work,
            canvas: size,
            layers: this.layerMeta(),
            environment: this.environment(),
            timeNote: TIME_NOTE,
            pressureNote: PRESSURE_NOTE,
            coordinateNote: COORDINATE_NOTE,
            startedAt: new Date().toISOString(),
            processMsAtStart: this.clock.processMs,
        });
        this.queueCheckpoint(0, 'start', this.clock.processMs);
        void this.rememberWork();
        this.panel.setStatus('正在采集。过程时钟已开始，思考时间会计入，明确暂停不计。');
        this.panel.collapse();
        this.render();
        void this.flush(true);
    }

    private pause(): void {
        if (this.clock.status !== 'recording') {
            return;
        }
        const processMs = this.clock.pause(performance.now());
        this.syncCanvasLock();
        this.enqueue('interval', {
            type: 'explicit_pause_start',
            processMs,
            at: new Date().toISOString(),
            note: '明确休息。过程时钟停止，画布输入无效，不会记入。',
        });
        this.queueCheckpoint(this.log.sequence, 'pause', processMs);
        this.panel.setStatus('已暂停休息。计时停止，画布输入无效。');
        this.render();
        void this.flush(true);
    }

    private resume(): void {
        if (this.clock.status !== 'paused') {
            return;
        }
        this.clock.resume(performance.now());
        this.syncCanvasLock();
        this.enqueue('interval', {
            type: 'explicit_pause_end',
            processMs: this.clock.processMs,
            duringPauseEdits: this.duringPauseEdits,
            at: new Date().toISOString(),
        });
        this.render();
        void this.flush(true);
    }

    private end(): void {
        if (this.clock.status !== 'recording' && this.clock.status !== 'paused') {
            return;
        }
        if (this.replaying) {
            this.exitReplay();
        }
        this.finishReplayHold(false);
        const processMs = this.clock.end(performance.now());
        this.syncCanvasLock();
        this.strokeOpen = false;
        this.enqueue('session', {
            type: 'end',
            processMs,
            drawingDurationMs: processMs,
            drawingDurationNote: '原始绘制时长等于过程时钟，已扣除明确暂停，未扣除思考或鼠标静止，也不等于回放长度或净落笔时长。',
            duringPauseEdits: this.duringPauseEdits,
            endedAt: new Date().toISOString(),
        });
        this.queueCheckpoint(this.log.sequence, 'end', processMs);
        void this.rememberWork();
        this.panel.setStatus(`已结束。原始绘制时长 ${(processMs / 1000).toFixed(1)} 秒。本地记录仍在，上传失败不会删除。`);
        this.render();
        void this.flush(true);
    }

    private queueCheckpoint(sequence: number, reason: string, tProcess: number): void {
        if (this.pendingCheckpoint >= DEFAULT_CAPTURE_CONFIG.maxQueuedCheckpoints) {
            this.enqueue('quality', {
                type: 'checkpoint_gap',
                sequence,
                reason,
                note: '检查点编码排队已满。操作记录保留，该序号没有独立画布图，回放将使用下一张成功的检查点并标明缺口。',
            });
            return;
        }
        requestAnimationFrame(() => {
            if (this.strokeOpen) {
                this.enqueue('quality', {
                    type: 'checkpoint_gap',
                    sequence,
                    reason,
                    note: '下一笔已经开始，跳过这次画布复制，避免在落笔时读回画布。',
                });
                return;
            }
            this.copyCheckpoint(sequence, reason, tProcess);
        });
    }

    private copyCheckpoint(sequence: number, reason: string, tProcess: number): void {
        const layers = this.host.getLayers();
        const size = this.host.getCanvasSize();
        const copies = layers.map((layer) => {
            const canvas = document.createElement('canvas');
            canvas.width = layer.canvas.width;
            canvas.height = layer.canvas.height;
            canvas.getContext('2d')?.drawImage(layer.canvas, 0, 0);
            return {
                id: layer.id,
                name: layer.name,
                opacity: layer.opacity,
                isVisible: layer.isVisible,
                mixModeStr: layer.mixModeStr,
                canvas,
            };
        });
        const flat = document.createElement('canvas');
        flat.width = size.width;
        flat.height = size.height;
        const ctx = flat.getContext('2d');
        if (ctx) {
            for (const layer of layers) {
                if (!layer.isVisible) {
                    continue;
                }
                ctx.globalAlpha = layer.opacity;
                ctx.drawImage(layer.canvas, 0, 0, size.width, size.height);
            }
            ctx.globalAlpha = 1;
        }
        this.pendingCheckpoint++;
        const checkpointId = newId('ckpt');
        void this.encodeCheckpoint(checkpointId, sequence, reason, tProcess, flat, copies).finally(() => {
            this.pendingCheckpoint = Math.max(0, this.pendingCheckpoint - 1);
        });
    }

    private async encodeCheckpoint(
        checkpointId: string,
        sequence: number,
        reason: string,
        tProcess: number,
        flat: HTMLCanvasElement,
        layers: {
            id: string;
            name: string;
            opacity: number;
            isVisible: boolean;
            mixModeStr: string;
            canvas: HTMLCanvasElement;
        }[],
    ): Promise<void> {
        try {
            const flatBlob = await canvasToPng(flat);
            await this.store.putBlob(checkpointId, flatBlob);
            const layerIds: string[] = [];
            const layerMeta: {
                id: string;
                name: string;
                blobId: string;
                opacity: number;
                isVisible: boolean;
                mixModeStr: string;
            }[] = [];
            for (const layer of layers) {
                const id = `${checkpointId}-${layer.id}`;
                await this.store.putBlob(id, await canvasToPng(layer.canvas));
                layerIds.push(id);
                layerMeta.push({
                    id: layer.id,
                    name: layer.name,
                    blobId: id,
                    opacity: layer.opacity,
                    isVisible: layer.isVisible,
                    mixModeStr: layer.mixModeStr,
                });
            }
            this.enqueue('checkpoint', {
                checkpointId,
                sequence,
                tProcess,
                layers: layerMeta,
                reason,
                mediaType: 'image/png',
                alpha: 'retained',
                rgbConversion: 'none',
                rgbNote: '检查点是 PNG，保留透明通道。本版本不生成铺底 RGB，避免把透明像素改写成某种背景色。',
                layerBlobIds: layerIds,
            });
            await this.flush(false);
        } catch (error) {
            this.lastFlushError = error instanceof Error ? error.message : String(error);
            this.enqueue('quality', {
                type: 'checkpoint_failed',
                checkpointId,
                sequence,
                message: this.lastFlushError,
            });
            this.render();
        }
    }

    private async flush(manual: boolean, silent = false): Promise<void> {
        if (this.strokeOpen && !manual) {
            const inputs = this.queue.filter((item) => item.channel === 'pre_stabilizer' || item.channel === 'post_stabilizer');
            if (inputs.length === 0) {
                return;
            }
        }
        const batch = this.queue.splice(0, this.queue.length);
        if (batch.length === 0) {
            if (manual && !silent) {
                this.panel.setStatus('没有待写入数据。');
            }
            return;
        }
        try {
            await this.store.putRecords(batch);
            this.persistedCount += batch.length;
            this.lastFlushAt = new Date().toISOString();
            this.lastFlushError = null;
        } catch (error) {
            this.queue = batch.concat(this.queue);
            this.lastFlushError = error instanceof Error ? error.message : String(error);
            this.panel.setStatus(`保存失败，${batch.length} 条仍在内存中，可导出。${this.lastFlushError}`, 'error');
        }
        this.render();
    }

    private async collectExport() {
        await this.flush(true);
        const stored = this.work.workId ? await this.store.recordsForWork(this.work.workId) : [];
        const record = {
            schemaVersion: CAPTURE_SCHEMA_VERSION,
            rendererVersion: CAPTURE_RENDERER_VERSION,
            codeVersion: CAPTURE_CODE_VERSION,
            config: DEFAULT_CAPTURE_CONFIG,
            work: this.work,
            sessionId: this.sessionId,
            status: this.clock.status,
            processMs: this.clock.processMs,
            operations: this.log.operations,
            records: stored.map((item) => ({ channel: item.channel, payload: item.payload })),
            lossBoundary: {
                crash: '上次成功写入 IndexedDB 之后、尚未 flush 的队列会丢失。目标间隔为 1 秒；落笔过程中非输入记录会等到笔画结束。',
                quota: '存储配额失败时队列留在内存，并可通过导出取出。',
                network: '当前没有远程提交服务。导出文件在本机。',
                checkpoints: '编码排队超过 2 张时，中间画布图可能缺失，操作日志不删。',
                replay: '回放在当前视口上按过程时间重绘，不写回 Klecks 历史。检查点对齐已完成的操作；两张检查点之间用稳定后的采样把笔画补上。',
            },
            performance: {
                captureCallbackCount: this.captureCallbackCount,
                captureCallbackMs: this.captureCallbackMs,
            },
        };
        const blobs = new Map<string, Blob>();
        for (const item of stored) {
            const payload = item.payload as { checkpointId?: string; layerBlobIds?: string[] };
            if (item.channel === 'checkpoint' && payload?.checkpointId) {
                const blob = await this.store.getBlob(payload.checkpointId);
                if (blob) {
                    blobs.set(`checkpoints/${payload.checkpointId}.png`, blob);
                }
                for (const layerId of payload.layerBlobIds ?? []) {
                    const layerBlob = await this.store.getBlob(layerId);
                    if (layerBlob) {
                        blobs.set(`checkpoints/${layerId}.png`, layerBlob);
                    }
                }
            }
        }
        return { record, blobs };
    }

    private async exportZip(): Promise<void> {
        const { record, blobs } = await this.collectExport();
        const entries = [
            { name: 'record.json', data: new TextEncoder().encode(JSON.stringify(record, null, 2)) },
        ];
        for (const [name, blob] of blobs) {
            entries.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
        }
        downloadBytes(encodeZip(entries), `${this.work.workId || 'klecks-capture'}.zip`);
        this.panel.setStatus('已导出 ZIP。这是本地文件，不代表远程提交已验收。');
    }

    private async submitLocal(): Promise<void> {
        if (!this.submissionId) {
            this.submissionId = newId('submit');
        }
        const existing = await this.store.getSubmission(this.submissionId);
        if (existing?.status === 'local_submitted') {
            this.panel.setStatus(`提交号 ${this.submissionId} 已在本地标记，未再次创建。没有远程服务，不能视为已验收。`);
            return;
        }
        await this.exportZip();
        await this.store.putSubmission({
            id: this.submissionId,
            workId: this.work.workId,
            status: 'local_submitted',
            at: new Date().toISOString(),
        });
        this.panel.setStatus(`本地提交包已生成（${this.submissionId}）。未连接远程服务，只完成本地校验与导出。`);
    }

    private async importZip(file: File): Promise<void> {
        const entries = decodeZip(new Uint8Array(await file.arrayBuffer()));
        const jsonEntry = entries.find((entry) => entry.name === 'record.json');
        if (!jsonEntry) {
            this.panel.setStatus('ZIP 中没有 record.json。', 'error');
            return;
        }
        const record = JSON.parse(new TextDecoder().decode(jsonEntry.data)) as {
            work?: WorkMeta;
            processMs?: number;
            records?: { channel: string; payload: unknown }[];
        };
        const images = new Map<string, CanvasImageSource>();
        for (const entry of entries) {
            const name = entry.name.split('/').pop() ?? '';
            if (!name.endsWith('.png')) {
                continue;
            }
            const bitmap = await createImageBitmap(new Blob([entry.data], { type: 'image/png' }));
            images.set(name.replace(/\.png$/, ''), bitmap);
        }
        const records = record.records ?? [];
        const size = this.host.getCanvasSize();
        const film = buildFilm(records, size, record.processMs ?? 0);
        this.player = new CanvasReplay(film, images);
        this.replayWorkId = record.work?.workId ?? '';
        if (record.work?.title) {
            this.panel.setWorks(
                [{ workId: this.replayWorkId || 'import', label: record.work.title || '导入的记录' }],
                this.replayWorkId || 'import',
            );
        }
        this.beginReplay();
        this.seekReplay(0);
        this.panel.setStatus('已从导出包加载记录。回放在当前画布上显示，不会修改作品历史。');
    }

    private createWork(): void {
        if (this.clock.status === 'recording') {
            return;
        }
        if (this.replaying) {
            this.exitReplay();
        }
        this.panel.readInto(this.work);
        if (!this.work.authorId.trim()) {
            this.panel.setStatus('需要填写匿名作者编号。', 'error');
            return;
        }
        this.work.workId = '';
        this.panel.write(this.work);
        this.closeOpenSession();
        void this.mutateCanvas(() => this.host.clearProject()).then(() => this.start(false));
    }

    private async watch(): Promise<void> {
        const workId = this.panel.getSelectedWorkId() || this.work.workId;
        if (!workId) {
            this.panel.setStatus('先选择作品。', 'error');
            return;
        }
        this.holdClockForReplay();
        this.replayWorkId = '';
        this.replaying = false;
        this.panel.collapse();
        await this.play();
        if (!this.replaying) {
            this.finishReplayHold(true);
            return;
        }
        this.panel.setStatus('正在观看回放。绘画计时已停止。');
    }

    private async continuePaint(): Promise<void> {
        const wasReplaying = this.replaying;
        if (wasReplaying) {
            this.exitReplay();
        }
        if (this.replayHold) {
            this.finishReplayHold(true);
            this.panel.setStatus('已继续绘画。回放没有改动画布。');
            return;
        }
        if (this.clock.status === 'paused') {
            this.resume();
            this.panel.setStatus('已继续绘画。');
            return;
        }
        if (this.clock.status === 'recording') {
            return;
        }
        await this.resumePaint();
    }

    private switchWork(): void {
        if (this.clock.status === 'recording' || this.clock.status === 'paused') {
            this.end();
        } else if (this.replaying) {
            this.exitReplay();
        }
        this.panel.showGate();
    }

    private async openSelectedWork(): Promise<void> {
        const workId = this.panel.getSelectedWorkId();
        if (!workId) {
            return;
        }
        if (this.clock.status === 'recording' || this.clock.status === 'paused') {
            this.panel.setStatus('先结束本轮，再切换作品。', 'error');
            await this.refreshWorks(this.work.workId);
            return;
        }
        if (this.replaying) {
            this.exitReplay();
        }
        const switching = this.work.workId !== workId;
        const records = await this.store.recordsForWork(workId);
        const restored = await this.mutateCanvas(() => this.restoreLastState(records));
        if (!restored) {
            this.panel.setStatus('这份作品没有可打开的画面。', 'error');
            return;
        }
        const authorId = this.panel.getAuthorId().trim();
        const stored = (await this.store.listWorks()).find((work) => work.workId === workId);
        const previous = this.workMetaFrom(records);
        this.work = {
            authorId: authorId || previous?.authorId || stored?.authorId || '',
            workId,
            title: previous?.title || stored?.title || '',
            creationMode: previous?.creationMode === 'assigned' ? 'assigned' : 'free',
            theme: previous?.theme || '',
            referenceNote: previous?.referenceNote || '',
            referenceSource: previous?.referenceSource || '',
            licenseScope: previous?.licenseScope || '',
            tabletNote: previous?.tabletNote || '',
            driverNote: previous?.driverNote || '',
        };
        this.panel.write(this.work);
        if (switching) {
            this.clock.status = 'idle';
            this.clock.processMs = 0;
            this.sessionId = '';
        }
        this.syncCanvasLock();
        await this.refreshWorks(workId);
        this.panel.collapse();
        this.panel.setStatus('已打开最后画面。可以观看回放，或继续绘画。');
    }

    private holdClockForReplay(): void {
        if (this.clock.status !== 'recording' || this.replayHold) {
            return;
        }
        const processMs = this.clock.pause(performance.now());
        this.replayHold = true;
        this.syncCanvasLock();
        this.enqueue('interval', {
            type: 'replay_hold_start',
            processMs,
            at: new Date().toISOString(),
            note: '观看回放。过程时钟停止，画布输入无效。',
        });
        this.render();
    }

    private finishReplayHold(resumeClock: boolean): void {
        if (!this.replayHold) {
            return;
        }
        this.replayHold = false;
        if (resumeClock && this.clock.status === 'paused') {
            this.clock.resume(performance.now());
        }
        this.syncCanvasLock();
        this.enqueue('interval', {
            type: 'replay_hold_end',
            processMs: this.clock.processMs,
            at: new Date().toISOString(),
        });
        this.render();
    }

    private async resumePaint(): Promise<void> {
        if (this.clock.status === 'recording') {
            return;
        }
        const authorId = this.panel.getAuthorId().trim();
        if (!authorId) {
            this.panel.setStatus('需要填写匿名作者编号。', 'error');
            return;
        }
        const workId = this.panel.getSelectedWorkId();
        if (!workId) {
            this.panel.setStatus('先选择该作者的已有作品。', 'error');
            return;
        }
        if (this.replaying) {
            this.exitReplay();
        }
        const records = await this.store.recordsForWork(workId);
        const sameLiveCanvas = this.work.workId === workId && this.clock.status !== 'idle';
        const liveProcessMs = sameLiveCanvas ? this.clock.processMs : 0;
        if (sameLiveCanvas) {
            if (this.clock.status === 'paused') {
                this.closeOpenSession();
            }
        } else {
            this.closeOpenSession();
            const restored = await this.mutateCanvas(() => this.restoreLastState(records));
            if (!restored) {
                this.panel.setStatus('这份作品没有可续画的画面。', 'error');
                return;
            }
        }
        const stored = (await this.store.listWorks()).find((work) => work.workId === workId);
        const previous = this.workMetaFrom(records);
        this.work = {
            authorId,
            workId,
            title: previous?.title || stored?.title || '',
            creationMode: previous?.creationMode === 'assigned' ? 'assigned' : 'free',
            theme: previous?.theme || '',
            referenceNote: previous?.referenceNote || '',
            referenceSource: previous?.referenceSource || '',
            licenseScope: previous?.licenseScope || '',
            tabletNote: previous?.tabletNote || '',
            driverNote: previous?.driverNote || '',
        };
        this.panel.write(this.work);
        this.resumeProcessMs = Math.max(stored?.processMs ?? 0, this.maxProcess(records), liveProcessMs);
        this.log.sequence = this.maxSequence(records);
        this.log.lastActiveSequence = this.log.sequence;
        this.log.undoDepth = 0;
        this.log.operations.splice(0, this.log.operations.length);
        this.sessionId = this.lastSessionId(records);
        this.start(true);
        this.panel.setStatus('已继续绘画。新的笔画记在同一作品上。');
    }

    private async refreshWorks(selectId?: string): Promise<void> {
        if (!this.worksBackfilled) {
            await this.backfillWorks();
            this.worksBackfilled = true;
        }
        const author = this.panel.getAuthorId().trim();
        const works = author
            ? (await this.store.listWorks()).filter((work) => work.authorId === author)
            : [];
        this.panel.setWorks(
            works.map((work) => ({
                workId: work.workId,
                label: work.title || work.workId,
            })),
            selectId,
        );
    }

    private async backfillWorks(): Promise<void> {
        const existing = new Set((await this.store.listWorks()).map((work) => work.workId));
        const grouped = new Map<string, { channel: string; payload: unknown }[]>();
        for (const record of await this.store.allRecords()) {
            if (!record.workId) {
                continue;
            }
            const list = grouped.get(record.workId) ?? [];
            list.push(record);
            grouped.set(record.workId, list);
        }
        for (const [workId, records] of grouped) {
            if (existing.has(workId)) {
                continue;
            }
            const meta = this.workMetaFrom(records);
            if (!meta?.authorId) {
                continue;
            }
            await this.store.putWork({
                workId,
                title: meta.title,
                authorId: meta.authorId,
                updatedAt: new Date().toISOString(),
                processMs: this.maxProcess(records),
            });
        }
    }

    private async rememberWork(): Promise<void> {
        if (!this.work.workId) {
            return;
        }
        await this.store.putWork({
            workId: this.work.workId,
            title: this.work.title,
            authorId: this.work.authorId,
            updatedAt: new Date().toISOString(),
            processMs: this.clock.processMs,
        });
        await this.refreshWorks(this.work.workId);
    }

    private syncCanvasLock(): void {
        const painting = this.clock.status === 'recording' && !this.replaying;
        this.host.setPaused(!painting);
    }

    private closeOpenSession(): void {
        if (this.clock.status !== 'paused' && this.clock.status !== 'recording') {
            return;
        }
        const wasPaused = this.clock.status === 'paused';
        const processMs = this.clock.end(performance.now());
        this.syncCanvasLock();
        this.strokeOpen = false;
        if (wasPaused) {
            this.enqueue('interval', {
                type: 'explicit_pause_end',
                processMs,
                duringPauseEdits: this.duringPauseEdits,
                at: new Date().toISOString(),
            });
        }
        this.enqueue('session', {
            type: 'end',
            processMs,
            drawingDurationMs: processMs,
            drawingDurationNote: '原始绘制时长等于过程时钟，已扣除明确暂停，未扣除思考或鼠标静止，也不等于回放长度或净落笔时长。',
            duringPauseEdits: this.duringPauseEdits,
            endedAt: new Date().toISOString(),
        });
    }

    private async mutateCanvas(change: () => void | Promise<boolean>): Promise<boolean> {
        this.suppressHistory = true;
        try {
            const result = await change();
            await new Promise((resolve) => setTimeout(resolve, 0));
            return result !== false;
        } finally {
            this.suppressHistory = false;
        }
    }

    private workMetaFrom(records: { channel: string; payload: unknown }[]): WorkMeta | null {
        let found: WorkMeta | null = null;
        for (const record of records) {
            if (record.channel !== 'session') {
                continue;
            }
            const payload = record.payload as { work?: WorkMeta };
            if (payload.work?.workId) {
                found = payload.work;
            }
        }
        return found;
    }

    private maxProcess(records: { channel: string; payload: unknown }[]): number {
        let max = 0;
        for (const record of records) {
            const payload = record.payload as { tProcess?: number; processMs?: number };
            if (typeof payload?.tProcess === 'number') {
                max = Math.max(max, payload.tProcess);
            }
            if (typeof payload?.processMs === 'number') {
                max = Math.max(max, payload.processMs);
            }
        }
        return max;
    }

    private maxSequence(records: { channel: string; payload: unknown }[]): number {
        let max = 0;
        for (const record of records) {
            const payload = record.payload as { sequence?: number };
            if (typeof payload?.sequence === 'number') {
                max = Math.max(max, payload.sequence);
            }
        }
        return max;
    }

    private lastSessionId(records: { sessionId: string }[]): string {
        return records.at(-1)?.sessionId ?? '';
    }

    private layersAt(
        records: { channel: string; payload: unknown }[],
        checkpoint: { sequence?: number },
    ): { id: string; name: string; opacity: number; isVisible: boolean; mixModeStr: string }[] {
        for (const record of records) {
            if (record.channel !== 'operation') {
                continue;
            }
            const payload = record.payload as {
                sequence?: number;
                layers?: { id: string; name: string; opacity: number; isVisible: boolean; mixModeStr: string }[];
            };
            if (payload.sequence === checkpoint.sequence && Array.isArray(payload.layers)) {
                return payload.layers;
            }
        }
        let layers: { id: string; name: string; opacity: number; isVisible: boolean; mixModeStr: string }[] = [];
        for (const record of records) {
            if (record.channel !== 'session') {
                continue;
            }
            const payload = record.payload as { layers?: typeof layers };
            if (Array.isArray(payload.layers)) {
                layers = payload.layers;
            }
        }
        return layers;
    }

    private async restoreLastState(records: { channel: string; payload: unknown }[]): Promise<boolean> {
        let best: {
            checkpointId?: string;
            tProcess?: number;
            sequence?: number;
            layers?: {
                id: string;
                name: string;
                blobId: string;
                opacity?: number;
                isVisible?: boolean;
                mixModeStr?: string;
            }[];
        } | null = null;
        let bestT = -1;
        for (const record of records) {
            if (record.channel !== 'checkpoint') {
                continue;
            }
            const payload = record.payload as {
                checkpointId?: string;
                tProcess?: number;
                sequence?: number;
                layers?: {
                    id: string;
                    name: string;
                    blobId: string;
                    opacity?: number;
                    isVisible?: boolean;
                    mixModeStr?: string;
                }[];
            };
            const t = payload.tProcess ?? 0;
            if (payload.checkpointId && t >= bestT) {
                best = payload;
                bestT = t;
            }
        }
        if (!best?.checkpointId) {
            return false;
        }
        const flatBlob = await this.store.getBlob(best.checkpointId);
        const flat = flatBlob ? await createImageBitmap(flatBlob) : null;
        const operationLayers = this.layersAt(records, best);
        const specs = best.layers?.length
            ? best.layers
            : operationLayers.map((layer) => ({
                  id: layer.id,
                  name: layer.name,
                  blobId: `${best.checkpointId}-${layer.id}`,
                  opacity: layer.opacity,
                  isVisible: layer.isVisible,
                  mixModeStr: layer.mixModeStr,
              }));
        const restored: CaptureRestoreLayer[] = [];
        for (const spec of specs) {
            const blob = await this.store.getBlob(spec.blobId);
            if (!blob) {
                continue;
            }
            const image = await createImageBitmap(blob);
            const meta = operationLayers.find((layer) => layer.id === spec.id);
            restored.push({
                id: spec.id,
                name: spec.name || meta?.name || '图层',
                opacity: spec.opacity ?? meta?.opacity ?? 1,
                isVisible: spec.isVisible ?? meta?.isVisible ?? true,
                mixModeStr: spec.mixModeStr || meta?.mixModeStr || 'source-over',
                image,
            });
        }
        if (restored.length === 0 && !flat) {
            return false;
        }
        const size = this.host.getCanvasSize();
        this.host.restoreProject({
            width: flat?.width || size.width,
            height: flat?.height || size.height,
            layers: restored.length ? restored : null,
            flat,
        });
        return true;
    }

    private async play(): Promise<void> {
        const workId = this.panel.getSelectedWorkId() || this.work.workId;
        if (!workId && !this.player) {
            this.panel.setStatus('还没有可回放的过程。', 'error');
            return;
        }
        const reload = Boolean(workId) && (this.replayWorkId !== workId || !this.replaying || !this.player);
        if (reload) {
            const loaded = await this.loadFilm(workId);
            if (!loaded) {
                this.panel.setStatus('还没有可回放的过程。', 'error');
                return;
            }
        }
        if (!this.player) {
            this.panel.setStatus('还没有可回放的过程。', 'error');
            return;
        }
        if (!this.replaying) {
            this.beginReplay();
        }
        if (reload || this.replayTime >= this.player.duration - 0.5) {
            this.seekReplay(0);
        }
        this.playing = true;
        this.tickTime = performance.now();
        cancelAnimationFrame(this.replayFrame);
        this.replayFrame = requestAnimationFrame((time) => this.onTick(time));
        this.render();
    }

    private pauseReplay(): void {
        this.playing = false;
        cancelAnimationFrame(this.replayFrame);
        this.render();
    }

    private exitReplay(): void {
        this.playing = false;
        this.replaying = false;
        cancelAnimationFrame(this.replayFrame);
        this.host.setReplayImage(null);
        this.host.setReplayLocked(false);
        this.syncCanvasLock();
        if (this.savedTransform) {
            this.host.setTransform(this.savedTransform);
        }
        this.savedTransform = null;
        this.appliedViewKey = '';
        this.panel.setStatus('已离开回放。回放没有改动画布。');
        this.render();
    }

    private async seekFromUi(timeMs: number): Promise<void> {
        this.pauseReplay();
        const workId = this.panel.getSelectedWorkId() || this.work.workId || this.replayWorkId;
        if (!this.player && workId) {
            const loaded = await this.loadFilm(workId);
            if (!loaded) {
                return;
            }
        }
        if (!this.player) {
            return;
        }
        if (!this.replaying) {
            this.beginReplay();
        }
        this.seekReplay(timeMs);
    }

    private beginReplay(): void {
        if (!this.savedTransform) {
            this.savedTransform = this.host.getTransform();
        }
        this.replaying = true;
        this.host.setReplayLocked(true);
        this.syncCanvasLock();
    }

    private seekReplay(timeMs: number): void {
        if (!this.player) {
            return;
        }
        this.replayTime = Math.max(0, Math.min(timeMs, this.player.duration));
        const view = this.player.seek(this.replayTime);
        this.host.setReplayImage(this.player.canvas);
        if (view) {
            const key = JSON.stringify(view);
            if (key !== this.appliedViewKey) {
                this.appliedViewKey = key;
                this.host.setTransform(view as TViewportTransform);
            }
        }
        this.render();
    }

    private onTick(timestamp: number): void {
        if (!this.playing || !this.player) {
            return;
        }
        const delta = timestamp - this.tickTime;
        this.tickTime = timestamp;
        if (delta > 0) {
            this.seekReplay(this.replayTime + delta * this.panel.getSpeed());
        }
        if (this.replayTime >= this.player.duration) {
            this.pauseReplay();
            return;
        }
        this.replayFrame = requestAnimationFrame((time) => this.onTick(time));
    }

    private async loadFilm(workId: string): Promise<boolean> {
        const token = ++this.loadToken;
        await this.flush(workId === this.work.workId, true);
        const stored = await this.store.recordsForWork(workId);
        const pending = workId === this.work.workId ? this.queue : [];
        const records = [...stored, ...pending];
        if (token !== this.loadToken) {
            return false;
        }
        const film = buildFilm(records, this.host.getCanvasSize(), workId === this.work.workId ? this.clock.processMs : 0);
        if (film.events.length === 0) {
            return false;
        }
        const images = new Map<string, CanvasImageSource>();
        for (const id of film.checkpointIds) {
            const blob = await this.store.getBlob(id);
            if (blob) {
                images.set(id, await createImageBitmap(blob));
            }
        }
        if (token !== this.loadToken) {
            return false;
        }
        this.player = new CanvasReplay(film, images);
        this.replayWorkId = workId;
        this.replayTime = 0;
        return true;
    }

    private render(): void {
        const queued = this.queue.length;
        this.panel.setStats({
            status: this.clock.status,
            processMs: this.clock.processMs,
            persisted: this.persistedCount,
            pending: queued,
            error: this.lastFlushError,
            pauseEdits: this.duringPauseEdits,
        });
        this.panel.setReplayUi({
            replaying: this.replaying,
            playing: this.playing,
            timeMs: this.replayTime,
            durationMs: this.player?.duration ?? 0,
        });
    }
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('PNG 编码失败'));
            }
        }, 'image/png');
    });
}

function downloadBytes(bytes: Uint8Array, filename: string): void {
    const blob = new Blob([bytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}
