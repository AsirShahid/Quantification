import test from 'node:test';
import assert from 'node:assert/strict';
import { applyChannelViewInPlace, prepareMicroscopyFiles } from './viewer-utils.mjs';

test('folder files are filtered and naturally sorted by relative path', () => {
  const files = [
    { name: 'tile10.tif', webkitRelativePath: 'kidney/tile10.tif' },
    { name: 'notes.csv', webkitRelativePath: 'kidney/notes.csv' },
    { name: 'tile2.ND2', webkitRelativePath: 'kidney/sub/tile2.ND2' },
    { name: 'tile1.jp2', webkitRelativePath: 'kidney/sub/tile1.jp2' },
  ];

  assert.deepEqual(
    prepareMicroscopyFiles(files).map((file) => file.webkitRelativePath),
    ['kidney/sub/tile1.jp2', 'kidney/sub/tile2.ND2', 'kidney/tile10.tif'],
  );
});

test('an RGB channel is rendered in place as a grayscale Fiji-style view', () => {
  const pixels = new Uint8ClampedArray([
    10, 20, 30, 255,
    40, 50, 60, 255,
  ]);

  assert.equal(applyChannelViewInPlace(pixels, 'green'), pixels);
  assert.deepEqual(Array.from(pixels), [20, 20, 20, 255, 50, 50, 50, 255]);

  const composite = new Uint8ClampedArray([1, 2, 3, 255]);
  applyChannelViewInPlace(composite, 'composite');
  assert.deepEqual(Array.from(composite), [1, 2, 3, 255]);
});
