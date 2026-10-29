import assert from 'node:assert/strict';
import { isAdminPassword, passwordHash, randomSalt } from './admin-lock.ts';

const salt = randomSalt();
assert.equal(salt.length, 32);
const hash = await passwordHash('studio-key', salt);
assert.equal(await passwordHash('studio-key', salt), hash);
assert.notEqual(await passwordHash('other-key', salt), hash);
assert.equal(isAdminPassword({ salt, hash }), true);
assert.equal(isAdminPassword({ salt: '', hash }), false);
assert.equal(isAdminPassword(null), false);
