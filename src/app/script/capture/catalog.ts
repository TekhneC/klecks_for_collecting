import type { WorkMeta } from './model';

export type CatalogWork = {
    workId: string;
    title: string;
    authorId: string;
    updatedAt: string;
    processMs: number;
};

export type CatalogGroup = {
    authorId: string;
    label: string;
    works: CatalogWork[];
};

export type CollectionStats = {
    records: number;
    sessions: number;
    strokes: number;
    checkpoints: number;
    operations: number;
    processMs: number;
    updatedAt: string;
};

export type CollectionDetail = {
    info: WorkMeta | null;
    stats: CollectionStats;
};

export function checkpointBlobIds(records: { channel: string; payload: unknown }[]): string[] {
    const ids = new Set<string>();
    for (const record of records) {
        if (record.channel !== 'checkpoint' || !record.payload || typeof record.payload !== 'object') {
            continue;
        }
        const payload = record.payload as { checkpointId?: string; layerBlobIds?: string[] };
        if (payload.checkpointId) {
            ids.add(payload.checkpointId);
        }
        for (const id of payload.layerBlobIds ?? []) {
            if (id) {
                ids.add(id);
            }
        }
    }
    return [...ids];
}

export function groupWorksByAuthor(works: CatalogWork[]): CatalogGroup[] {
    const groups = new Map<string, CatalogWork[]>();
    const ordered = [...works].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    for (const work of ordered) {
        const key = work.authorId || '';
        const list = groups.get(key) ?? [];
        list.push(work);
        groups.set(key, list);
    }
    return [...groups.entries()]
        .sort((a, b) => ((a[1][0]?.updatedAt ?? '') < (b[1][0]?.updatedAt ?? '') ? 1 : -1))
        .map(([authorId, list]) => ({
            authorId,
            label: authorId || '未填写作者',
            works: list,
        }));
}

export function describeCollection(
    records: { channel: string; payload: unknown }[],
    stored: { processMs: number; updatedAt: string },
): CollectionDetail {
    let info: WorkMeta | null = null;
    let sessions = 0;
    let strokes = 0;
    let checkpoints = 0;
    let operations = 0;
    let processMs = stored.processMs;
    for (const record of records) {
        const payload = record.payload;
        if (!payload || typeof payload !== 'object') {
            continue;
        }
        const body = payload as {
            type?: string;
            work?: WorkMeta;
            processMs?: number;
            tProcess?: number;
        };
        if (record.channel === 'session') {
            if (body.type === 'start') {
                sessions += 1;
            }
            if (body.work?.workId) {
                info = body.work;
            }
            if (typeof body.processMs === 'number') {
                processMs = Math.max(processMs, body.processMs);
            }
        }
        if (record.channel === 'stroke') {
            strokes += 1;
        }
        if (record.channel === 'checkpoint') {
            checkpoints += 1;
        }
        if (record.channel === 'operation') {
            operations += 1;
        }
        if (typeof body.tProcess === 'number') {
            processMs = Math.max(processMs, body.tProcess);
        }
    }
    return {
        info,
        stats: {
            records: records.length,
            sessions,
            strokes,
            checkpoints,
            operations,
            processMs,
            updatedAt: stored.updatedAt,
        },
    };
}
