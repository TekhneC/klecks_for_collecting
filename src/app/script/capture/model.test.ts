import assert from 'node:assert/strict';
import { ProcessClock, OperationLog, drawingDurationMs } from './model.ts';
import { crc32, decodeZip, encodeZip } from './zip.ts';

const clock = new ProcessClock();
clock.start(1000, 1_700_000_000_000);
clock.advance(1800);
assert.equal(clock.processMs, 800);
const pausedAt = clock.pause(2000);
assert.equal(pausedAt, 1000);
clock.advance(50_000);
assert.equal(clock.processMs, 1000);
clock.resume(60_000);
clock.advance(61_500);
assert.equal(clock.processMs, 2500);
assert.equal(drawingDurationMs(clock.processMs), 2500);
clock.end(62_000);
assert.equal(clock.status, 'ended');
assert.equal(clock.processMs, 3000);

const continued = new ProcessClock();
continued.continueFrom(10, 20, 3000);
continued.advance(10 + 400);
assert.equal(continued.processMs, 3400);

const log = new OperationLog();
const base = {
    id: 'op',
    sessionId: 's',
    workId: 'w',
    tProcess: 1,
    tWall: 2,
    duringPause: false,
    checkpointStatus: 'not-applicable' as const,
    checkpointId: null,
    coversThroughSequence: null,
};
const first = log.push({ ...base, id: 'a', kind: 'push' });
const undone = log.push({ ...base, id: 'b', kind: 'undo' });
assert.equal(undone.targetSequence, first.sequence);
assert.equal(log.operations.length, 2);
const branched = log.push({ ...base, id: 'c', kind: 'push' });
assert.equal(branched.branchParentSequence, undone.sequence);
assert.equal(log.operations[0].id, 'a');

const payload = new TextEncoder().encode('klecks-capture');
assert.equal(crc32(payload) >>> 0, crc32(payload) >>> 0);
const zipped = encodeZip([
    { name: 'record.json', data: payload },
    { name: 'checkpoints/a.png', data: new Uint8Array([1, 2, 3, 4]) },
]);
const decoded = decodeZip(zipped);
assert.equal(decoded.length, 2);
assert.equal(new TextDecoder().decode(decoded[0].data), 'klecks-capture');
assert.deepEqual(Array.from(decoded[1].data), [1, 2, 3, 4]);

const started = performance.now();
const benchLog = new OperationLog();
for (let i = 0; i < 20000; i++) {
    benchLog.push({ ...base, id: 'p' + i, kind: 'push' });
}
const elapsed = performance.now() - started;
console.log(`BENCH_20K_OPS_MS=${elapsed.toFixed(2)}`);
assert.ok(elapsed < 1000, `in-memory log too slow: ${elapsed}`);

console.log('capture model tests passed');
