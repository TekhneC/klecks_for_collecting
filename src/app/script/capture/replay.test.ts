import assert from 'node:assert/strict';
import { buildFilm, pointsAfterLastCheckpoint } from './replay.ts';

const film = buildFilm(
    [
        {
            channel: 'checkpoint',
            payload: { checkpointId: 'start', sequence: 0, tProcess: 0 },
        },
        {
            channel: 'stroke',
            payload: {
                strokeId: 's1',
                tProcess: 10,
                params: { brushId: 'penBrush', size: 20, opacity: 1, color: { r: 10, g: 20, b: 30 }, tool: 'brush' },
            },
        },
        {
            channel: 'post_stabilizer',
            payload: { strokeId: 's1', tProcess: 40, event: { type: 'down', x: 1, y: 2, pressure: 0.5 } },
        },
        {
            channel: 'post_stabilizer',
            payload: { strokeId: 's1', tProcess: 80, event: { type: 'move', x: 5, y: 6, pressure: 0 } },
        },
        {
            channel: 'post_stabilizer',
            payload: { strokeId: 's1', tProcess: 120, event: { type: 'move', x: 9, y: 8, pressure: 1 } },
        },
        {
            channel: 'checkpoint',
            payload: { checkpointId: 'after', sequence: 2, tProcess: 200 },
        },
        {
            channel: 'viewport',
            payload: { tProcess: 50, transform: { scale: 2, angleDeg: 0, x: 3, y: 4, isMirrored: false } },
        },
    ],
    { width: 100, height: 80 },
    240,
);

assert.equal(film.durationMs, 240);
assert.equal(film.width, 100);
assert.deepEqual(film.checkpointIds, ['start', 'after']);
const points = film.events.filter((event) => event.kind === 'point');
assert.equal(points.length, 2);
const mid = pointsAfterLastCheckpoint(film.events, 120);
assert.equal(mid.length, 2);
const done = pointsAfterLastCheckpoint(film.events, 200);
assert.equal(done.length, 0);
const views = film.events.filter((event) => event.kind === 'view');
assert.equal(views.length, 1);

const first = points[0];
const second = points[1];
assert.equal(first.kind, 'point');
assert.equal(second.kind, 'point');
if (first.kind === 'point' && second.kind === 'point') {
    assert.ok(first.width < second.width);
    assert.equal(first.color, 'rgb(10, 20, 30)');
    assert.equal(second.x0, 5);
    assert.equal(second.y0, 6);
}

console.log('replay.test ok');
