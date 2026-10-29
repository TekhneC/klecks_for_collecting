import assert from 'node:assert/strict';
import { checkpointBlobIds, describeCollection, groupWorksByAuthor } from './catalog.ts';

const grouped = groupWorksByAuthor([
    { workId: 'w1', title: '较早', authorId: 'a', updatedAt: '2026-10-01T00:00:00.000Z', processMs: 1 },
    { workId: 'w2', title: '较新', authorId: 'a', updatedAt: '2026-10-03T00:00:00.000Z', processMs: 2 },
    { workId: 'w3', title: '另一位', authorId: 'b', updatedAt: '2026-10-02T00:00:00.000Z', processMs: 3 },
    { workId: 'w4', title: '缺作者', authorId: '', updatedAt: '2026-10-04T00:00:00.000Z', processMs: 4 },
]);

assert.deepEqual(
    grouped.map((group) => ({ label: group.label, works: group.works.map((work) => work.workId) })),
    [
        { label: '未填写作者', works: ['w4'] },
        { label: 'a', works: ['w2', 'w1'] },
        { label: 'b', works: ['w3'] },
    ],
);

const detail = describeCollection(
    [
        {
            channel: 'session',
            payload: {
                type: 'start',
                work: { workId: 'w2', title: '初稿', authorId: 'a', creationMode: 'free', theme: '', referenceNote: '', referenceSource: '', licenseScope: '', tabletNote: '', driverNote: '' },
                processMs: 10,
            },
        },
        { channel: 'stroke', payload: { tProcess: 20 } },
        { channel: 'checkpoint', payload: { tProcess: 30 } },
        { channel: 'operation', payload: { tProcess: 40 } },
        {
            channel: 'session',
            payload: {
                type: 'meta',
                work: { workId: 'w2', title: '改定', authorId: 'a', creationMode: 'assigned', theme: '静物', referenceNote: '', referenceSource: '', licenseScope: '', tabletNote: '', driverNote: '' },
            },
        },
    ],
    { processMs: 5, updatedAt: '2026-10-03T00:00:00.000Z' },
);

assert.equal(detail.info?.title, '改定');
assert.equal(detail.info?.creationMode, 'assigned');
assert.equal(detail.stats.sessions, 1);
assert.equal(detail.stats.strokes, 1);
assert.equal(detail.stats.checkpoints, 1);
assert.equal(detail.stats.operations, 1);
assert.equal(detail.stats.records, 5);
assert.equal(detail.stats.processMs, 40);
assert.equal(detail.stats.updatedAt, '2026-10-03T00:00:00.000Z');

assert.deepEqual(
    checkpointBlobIds([
        { channel: 'checkpoint', payload: { checkpointId: 'flat', layerBlobIds: ['layer-a', ''] } },
        { channel: 'stroke', payload: { checkpointId: 'ignored' } },
        { channel: 'checkpoint', payload: { checkpointId: 'flat', layerBlobIds: ['layer-b'] } },
    ]),
    ['flat', 'layer-a', 'layer-b'],
);
