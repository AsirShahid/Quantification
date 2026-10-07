import test from 'node:test';
import assert from 'node:assert/strict';
import { samplePreview, channelSettingsKey, automaticSettings, displayRanges, renderPreview } from './channel-preview.ts';
import { analyzeImage, type DecodedImage, type AnalysisOptions } from './image-analysis.ts';

const image: DecodedImage = {
  width: 4, height: 1, channelCount: 3, bitDepth: 16, analysisBitDepth: 16,
  samples: new Uint16Array([0, 0, 0, 10, 100, 1000, 200, 2000, 20000, 220, 2200, 22000]),
  rgba: new Uint8ClampedArray(16), sourceFormat: 'test', originalShape: '1x4x3', originalAxes: ['Y','X','C'],
  selectedShape: '1x4x3', selectedAxes: ['Y','X','C'], planeSelection: {}, processing: 'native-integer-samples',
  processingLocation: 'browser', quantitativeStatus: 'experimental', sourceSha256: 'test',
};
const options: AnalysisOptions = {
  stain: 'Vimentin (IF)', signalChannel: 'red', minThreshold: 100, maxThreshold: 65535,
  removeBackground: false, backgroundTolerance: 18, outsideMode: 'exclude', structure: 'Whole tissue', rois: [],
};

test('automatic thresholds and brightness ranges follow each channel native intensity scale', () => {
  const red = automaticSettings(image, options.stain, 'red');
  const green = automaticSettings(image, options.stain, 'green');
  const blue = automaticSettings(image, options.stain, 'blue');
  assert.equal(red.minimum, 11);
  assert.equal(green.minimum, 101);
  assert.equal(blue.minimum, 1001);
  assert.equal(blue.maximum, 65535);
  assert.deepEqual(displayRanges(image), [220, 2200, 22000]);
});

test('display brightness does not mutate native data or change measurements; threshold updates change overlay', () => {
  const before = Array.from(image.samples!);
  const baseline = analyzeImage(image, options);
  const ranges = displayRanges(image);
  const original = renderPreview(image, 'red', ranges, [1,1,1], options, 'original');
  const brighter = renderPreview(image, 'red', ranges, [2,2,2], options, 'original');
  assert.notDeepEqual(original, brighter);
  assert.equal(brighter[5], 0);
  assert.equal(brighter[6], 0);
  assert.notDeepEqual(renderPreview(image, 'composite', ranges, [1,1,1], options, 'overlay'),
    renderPreview(image, 'composite', ranges, [1,1,1], { ...options, minThreshold: 210 }, 'overlay'));
  assert.deepEqual(Array.from(image.samples!), before);
  assert.equal(analyzeImage(image, options).rawIntDen, baseline.rawIntDen);
  assert.equal(analyzeImage(image, options).positivePixels, baseline.positivePixels);
});

test('downsampled previews preserve exact native samples and uniform black has no automatic positives', () => {
  const preview = samplePreview(image, 2);
  assert.equal(preview.width, 2);
  assert.deepEqual(Array.from(preview.samples!), [0,0,0,200,2000,20000]);
  const black = { ...image, samples: new Uint16Array(12) };
  const auto = automaticSettings(black, options.stain, 'red');
  assert.equal(auto.minimum, 1);
  assert.equal(analyzeImage(black, { ...options, minThreshold: auto.minimum }).positivePixels, 0);
});


test('fluorescence channel settings persist across marker names without sharing colors or brightfield transforms', () => {
  assert.equal(channelSettingsKey('DAPI (IF)', 'blue'), channelSettingsKey('ApoJ / Clusterin (IF)', 'blue'));
  assert.notEqual(channelSettingsKey('DAPI (IF)', 'red'), channelSettingsKey('DAPI (IF)', 'blue'));
  assert.notEqual(channelSettingsKey('PAS', 'red'), channelSettingsKey('DAPI (IF)', 'red'));
});
