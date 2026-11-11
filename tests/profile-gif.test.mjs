import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseImageFraming, profileGifLimits, validateProfileGif } from '../lib/profile/animation.ts';

const frames = Buffer.from('R0lGODlhAgACAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAFAAAACwAAAAAAgACAAAIBgABCAQQEAAh+QQBFAABACwAAAAAAgACAIEAAP8AAAAAAAAAAAAIBgABCAQQEAA7', 'base64');

test('profile GIF limits distinguish avatars from covers and reject malformed data', () => {
  assert.equal(validateProfileGif(frames, 'avatar'), null);
  assert.equal(validateProfileGif(frames, 'cover'), null);
  assert.match(validateProfileGif(frames.subarray(0, -1), 'avatar'), /inválido/);
  assert.match(validateProfileGif(Buffer.from('<script>alert(1)</script>'), 'cover'), /inválido/);
  assert.match(validateProfileGif(Buffer.alloc(profileGifLimits.avatar.bytes + 1), 'avatar'), /500 KB/);
  assert.match(validateProfileGif(Buffer.alloc(profileGifLimits.cover.bytes + 1), 'cover'), /2 MB/);
  const largeCanvas = Buffer.from(frames);
  largeCanvas.writeUInt16LE(513, 6);
  assert.match(validateProfileGif(largeCanvas, 'avatar'), /resolução/);
  assert.equal(validateProfileGif(largeCanvas, 'cover'), null);
  const longDelay = Buffer.from(frames);
  const control = longDelay.indexOf(Buffer.from([0x21, 0xf9]));
  longDelay.writeUInt16LE(1201, control + 4);
  assert.match(validateProfileGif(longDelay, 'cover'), /mais curto/);
});

test('profile GIF framing accepts only finite coordinates and zoom in the editor range', () => {
  assert.deepEqual(parseImageFraming({ zoom: 1.5, x: 0, y: 100 }), { zoom: 1.5, x: 0, y: 100 });
  for (const zoom of [0, 3.01, NaN, '2', Infinity]) assert.equal(parseImageFraming({ zoom, x: 50, y: 50 }), null);
  assert.equal(parseImageFraming({ zoom: 2, x: -1, y: 50 }), null);
});
