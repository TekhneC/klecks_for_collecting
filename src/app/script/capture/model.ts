export const CAPTURE_SCHEMA_VERSION = 1;
export const CAPTURE_RENDERER_VERSION = 'klecks-checkpoint-png-1';
export const CAPTURE_CODE_VERSION = '53e046b';

export type CaptureStatus = 'idle' | 'recording' | 'paused' | 'ended';

export type CreationMode = 'free' | 'assigned';

export type WorkMeta = {
    authorId: string;
    workId: string;
    title: string;
    creationMode: CreationMode;
    theme: string;
    referenceNote: string;
    referenceSource: string;
    licenseScope: string;
    tabletNote: string;
    driverNote: string;
};

export type TimePoint = {
    tPerformance: number;
    tProcess: number;
    tWall: number;
};

/**
 * Process time advances only while recording.
 * Explicit pause freezes it. Thinking with the pen up does not.
 * Page hide is not a pause.
 */
export class ProcessClock {
    status: CaptureStatus = 'idle';
    processMs = 0;
    wallOriginMs = 0;
    performanceOrigin = 0;
    private lastPerf = 0;
    private running = false;

    start(now: number, wallMs: number): void {
        this.status = 'recording';
        this.processMs = 0;
        this.wallOriginMs = wallMs;
        this.performanceOrigin = now;
        this.lastPerf = now;
        this.running = true;
    }

    continueFrom(now: number, wallMs: number, processMs: number): void {
        this.start(now, wallMs);
        this.processMs = processMs;
    }

    pause(now: number): number {
        this.advance(now);
        this.running = false;
        this.status = 'paused';
        return this.processMs;
    }

    resume(now: number): void {
        this.lastPerf = now;
        this.running = true;
        this.status = 'recording';
    }

    end(now: number): number {
        this.advance(now);
        this.running = false;
        this.status = 'ended';
        return this.processMs;
    }

    advance(now: number): number {
        if (this.running) {
            const delta = now - this.lastPerf;
            if (delta > 0) {
                this.processMs += delta;
            }
        }
        this.lastPerf = now;
        return this.processMs;
    }

    mark(now: number, wallNow: number): TimePoint {
        return {
            tPerformance: now,
            tProcess: this.advance(now),
            tWall: wallNow,
        };
    }
}

export type HistoryKind = 'push' | 'undo' | 'redo';

export type OperationRecord = {
    id: string;
    sequence: number;
    sessionId: string;
    workId: string;
    kind: HistoryKind | 'session' | 'stroke';
    tProcess: number;
    tWall: number;
    duringPause: boolean;
    branchParentSequence: number | null;
    targetSequence: number | null;
    undoDepthBefore: number;
    checkpointStatus: 'pending' | 'stored' | 'gap' | 'not-applicable';
    checkpointId: string | null;
    coversThroughSequence: number | null;
};

export class OperationLog {
    sequence = 0;
    undoDepth = 0;
    lastActiveSequence = 0;
    readonly operations: OperationRecord[] = [];

    push(partial: Omit<OperationRecord, 'sequence' | 'branchParentSequence' | 'undoDepthBefore' | 'targetSequence'> & {
        targetSequence?: number | null;
        kind: OperationRecord['kind'];
    }): OperationRecord {
        const undoDepthBefore = this.undoDepth;
        let branchParentSequence: number | null = null;
        let targetSequence = partial.targetSequence ?? null;
        if (partial.kind === 'undo') {
            this.undoDepth += 1;
            targetSequence = this.lastActiveSequence;
        } else if (partial.kind === 'redo') {
            this.undoDepth = Math.max(0, this.undoDepth - 1);
            targetSequence = this.lastActiveSequence;
        } else if (partial.kind === 'push' || partial.kind === 'stroke') {
            if (this.undoDepth > 0) {
                branchParentSequence = this.lastActiveSequence;
            }
            this.undoDepth = 0;
        }
        this.sequence += 1;
        const record: OperationRecord = {
            ...partial,
            sequence: this.sequence,
            branchParentSequence,
            undoDepthBefore,
            targetSequence,
        };
        if (partial.kind !== 'session') {
            this.lastActiveSequence = record.sequence;
        }
        this.operations.push(record);
        return record;
    }
}

export function newId(prefix: string): string {
    const cryptoObj = globalThis.crypto;
    if (cryptoObj?.randomUUID) {
        return `${prefix}-${cryptoObj.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const DEFAULT_CAPTURE_CONFIG = {
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    recordPreStabilizer: true,
    recordPostStabilizer: true,
    recordViewport: true,
    viewportDebounceMs: 120,
    flushIntervalMs: 1000,
    maxQueuedCheckpoints: 2,
    checkpointFlattened: true,
    checkpointLayersOn: ['start', 'pause', 'end', 'manual'] as const,
    autoSaveWhileStrokeOpen: 'inputs-only' as const,
    rgbConversion: 'none',
    alphaPolicy: 'png-retains-alpha',
};

export type CaptureConfig = typeof DEFAULT_CAPTURE_CONFIG;

export function drawingDurationMs(processMs: number): number {
    return processMs;
}
