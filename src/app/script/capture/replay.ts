export type ReplayView = {
    scale: number;
    angleDeg: number;
    x: number;
    y: number;
    isMirrored: boolean;
};

export type ReplayPoint = {
    kind: 'point';
    t: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    width: number;
    color: string;
    alpha: number;
    eraser: boolean;
};

export type ReplayCheckpoint = { kind: 'checkpoint'; t: number; id: string };

export type ReplayViewEvent = { kind: 'view'; t: number; transform: ReplayView };

export type FilmEvent = ReplayPoint | ReplayCheckpoint | ReplayViewEvent;

export type Film = {
    width: number;
    height: number;
    durationMs: number;
    checkpointIds: string[];
    events: FilmEvent[];
};

type RecordLike = { channel: string; payload: unknown };

type StrokeStyle = {
    color: string;
    alpha: number;
    size: number;
    eraser: boolean;
    fixed: boolean;
};

const DEFAULT_STYLE: StrokeStyle = {
    color: '#222222',
    alpha: 1,
    size: 12,
    eraser: false,
    fixed: false,
};

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return value as Record<string, unknown>;
}

function num(value: unknown, fallback = 0): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function styleFromParams(params: unknown): StrokeStyle {
    const record = asRecord(params);
    if (!record) {
        return { ...DEFAULT_STYLE };
    }
    const color = asRecord(record.color);
    const brushId = typeof record.brushId === 'string' ? record.brushId : '';
    const tool = typeof record.tool === 'string' ? record.tool : '';
    const eraser = /eraser/i.test(brushId) || /eraser/i.test(tool);
    const fixed = /fixed|pixel/i.test(brushId);
    let alpha = num(record.opacity, 1);
    if (alpha > 1) {
        alpha = alpha / 100;
    }
    alpha = Math.min(1, Math.max(0, alpha));
    const rgb = color
        ? `rgb(${Math.round(num(color.r))}, ${Math.round(num(color.g))}, ${Math.round(num(color.b))})`
        : DEFAULT_STYLE.color;
    return {
        color: rgb,
        alpha,
        size: Math.max(0.5, num(record.size, DEFAULT_STYLE.size)),
        eraser,
        fixed,
    };
}

function widthFor(style: StrokeStyle, pressure: number): number {
    const clamped = Math.min(1, Math.max(0, pressure));
    const factor = style.fixed ? 1 : 0.15 + 0.85 * clamped;
    return Math.max(0.4, style.size * factor);
}

function operationTimes(records: RecordLike[]): Map<number, number> {
    const times = new Map<number, number>();
    for (const record of records) {
        if (record.channel !== 'operation') {
            continue;
        }
        const payload = asRecord(record.payload);
        if (!payload) {
            continue;
        }
        const sequence = payload.sequence;
        if (typeof sequence === 'number' && typeof payload.tProcess === 'number') {
            times.set(sequence, payload.tProcess);
        }
    }
    return times;
}

export function buildFilm(records: RecordLike[], fallback: { width: number; height: number }, processMs: number): Film {
    let width = fallback.width;
    let height = fallback.height;
    const styles = new Map<string, StrokeStyle>();
    const strokeTime = new Map<string, number>();
    const postStrokes = new Set<string>();
    for (const record of records) {
        const payload = asRecord(record.payload);
        if (!payload) {
            continue;
        }
        if (record.channel === 'session') {
            const canvas = asRecord(payload.canvas);
            if (canvas) {
                width = Math.max(1, num(canvas.width, width));
                height = Math.max(1, num(canvas.height, height));
            }
        }
        if (record.channel === 'stroke' && typeof payload.strokeId === 'string') {
            styles.set(payload.strokeId, styleFromParams(payload.params));
            if (typeof payload.tProcess === 'number') {
                strokeTime.set(payload.strokeId, payload.tProcess);
            }
        }
        if (record.channel === 'post_stabilizer' && typeof payload.strokeId === 'string') {
            postStrokes.add(payload.strokeId);
        }
    }

    const times = operationTimes(records);
    const events: FilmEvent[] = [];
    const lastPoint = new Map<string, { x: number; y: number }>();
    const checkpointIds: string[] = [];

    const pushPoint = (strokeId: string, t: number, x0: number, y0: number, x1: number, y1: number, pressure: number) => {
        if (pressure <= 0) {
            lastPoint.set(strokeId, { x: x1, y: y1 });
            return;
        }
        const style = styles.get(strokeId) ?? DEFAULT_STYLE;
        events.push({
            kind: 'point',
            t,
            x0,
            y0,
            x1,
            y1,
            width: widthFor(style, pressure),
            color: style.color,
            alpha: style.alpha,
            eraser: style.eraser,
        });
        lastPoint.set(strokeId, { x: x1, y: y1 });
    };

    for (const record of records) {
        const payload = asRecord(record.payload);
        if (!payload) {
            continue;
        }
        if (record.channel === 'checkpoint' && typeof payload.checkpointId === 'string') {
            const sequence = num(payload.sequence, 0);
            const t = typeof payload.tProcess === 'number' ? payload.tProcess : (times.get(sequence) ?? 0);
            checkpointIds.push(payload.checkpointId);
            events.push({ kind: 'checkpoint', t, id: payload.checkpointId });
        }
        if (record.channel === 'viewport') {
            const transform = asRecord(payload.transform);
            if (!transform || typeof payload.tProcess !== 'number') {
                continue;
            }
            events.push({
                kind: 'view',
                t: payload.tProcess,
                transform: {
                    scale: num(transform.scale, 1),
                    angleDeg: num(transform.angleDeg, 0),
                    x: num(transform.x, 0),
                    y: num(transform.y, 0),
                    isMirrored: Boolean(transform.isMirrored),
                },
            });
        }
        const useChannel =
            record.channel === 'post_stabilizer' ||
            (record.channel === 'pre_stabilizer' && typeof payload.strokeId === 'string' && !postStrokes.has(payload.strokeId));
        if (!useChannel || typeof payload.strokeId !== 'string' || typeof payload.tProcess !== 'number') {
            continue;
        }
        const strokeId = payload.strokeId;
        const t = payload.tProcess;
        if (record.channel === 'post_stabilizer') {
            const event = asRecord(payload.event);
            if (!event || typeof event.type !== 'string') {
                continue;
            }
            if (event.type === 'down' || event.type === 'move') {
                const x = num(event.x);
                const y = num(event.y);
                const previous = lastPoint.get(strokeId) ?? { x, y };
                pushPoint(strokeId, t, previous.x, previous.y, x, y, num(event.pressure, 1));
            } else if (event.type === 'line') {
                const x1 = num(event.x1);
                const y1 = num(event.y1);
                const previous = lastPoint.get(strokeId);
                const x0 = event.x0 == null ? (previous?.x ?? x1) : num(event.x0);
                const y0 = event.y0 == null ? (previous?.y ?? y1) : num(event.y0);
                pushPoint(strokeId, t, x0, y0, x1, y1, num(event.pressure1, num(event.pressure0, 1)));
            }
        } else {
            const x = num(payload.x);
            const y = num(payload.y);
            const previous = lastPoint.get(strokeId) ?? { x, y };
            const pressure = payload.pressureUsedByBrush == null ? 1 : num(payload.pressureUsedByBrush, 1);
            pushPoint(strokeId, t, previous.x, previous.y, x, y, pressure);
        }
    }

    events.sort((a, b) => a.t - b.t);
    const lastEvent = events.at(-1)?.t ?? 0;
    const strokeEnd = Math.max(0, ...strokeTime.values(), 0);
    return {
        width: Math.max(1, width),
        height: Math.max(1, height),
        durationMs: Math.max(1, processMs, lastEvent, strokeEnd),
        checkpointIds,
        events,
    };
}

/** Samples that still have to be drawn on top of the latest checkpoint at time t. */
export function pointsAfterLastCheckpoint(events: FilmEvent[], t: number): ReplayPoint[] {
    const until = events.filter((event) => event.t <= t);
    let checkpointAt = -1;
    for (let i = 0; i < until.length; i++) {
        if (until[i].kind === 'checkpoint') {
            checkpointAt = i;
        }
    }
    return until.slice(checkpointAt + 1).filter((event): event is ReplayPoint => event.kind === 'point');
}

export class CanvasReplay {
    readonly canvas: HTMLCanvasElement;
    readonly duration: number;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly film: Film;
    private readonly images: Map<string, CanvasImageSource>;
    private cursor = 0;
    private lastT = -1;
    private lastView: ReplayView | null = null;

    constructor(film: Film, images: Map<string, CanvasImageSource>) {
        this.film = film;
        this.images = images;
        this.canvas = document.createElement('canvas');
        this.canvas.width = film.width;
        this.canvas.height = film.height;
        const ctx = this.canvas.getContext('2d');
        if (!ctx) {
            throw new Error('无法创建回放画布');
        }
        this.ctx = ctx;
        this.duration = film.durationMs;
    }

    seek(t: number): ReplayView | null {
        const target = Math.max(0, Math.min(t, this.duration));
        if (target + 0.0001 < this.lastT) {
            this.cursor = 0;
            this.lastT = -1;
            this.lastView = null;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        const events = this.film.events;
        while (this.cursor < events.length && events[this.cursor].t <= target + 0.0001) {
            this.apply(events[this.cursor]);
            this.cursor++;
        }
        this.lastT = target;
        return this.lastView;
    }

    private apply(event: FilmEvent): void {
        if (event.kind === 'view') {
            this.lastView = event.transform;
            return;
        }
        if (event.kind === 'checkpoint') {
            const image = this.images.get(event.id);
            if (!image) {
                return;
            }
            this.ctx.save();
            this.ctx.globalAlpha = 1;
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(image, 0, 0, this.canvas.width, this.canvas.height);
            this.ctx.restore();
            return;
        }
        this.ctx.save();
        this.ctx.globalCompositeOperation = event.eraser ? 'destination-out' : 'source-over';
        this.ctx.globalAlpha = event.eraser ? 1 : event.alpha;
        this.ctx.strokeStyle = event.color;
        this.ctx.fillStyle = event.color;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.lineWidth = event.width;
        const length = Math.hypot(event.x1 - event.x0, event.y1 - event.y0);
        if (length < 0.01) {
            this.ctx.beginPath();
            this.ctx.arc(event.x1, event.y1, event.width / 2, 0, Math.PI * 2);
            this.ctx.fill();
        } else {
            this.ctx.beginPath();
            this.ctx.moveTo(event.x0, event.y0);
            this.ctx.lineTo(event.x1, event.y1);
            this.ctx.stroke();
        }
        this.ctx.restore();
    }
}
