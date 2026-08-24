export type DecodedImage = {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  bitDepth: number;
  sourceFormat: string;
};

export type RoiRect = { x: number; y: number; width: number; height: number };

export type AnalysisOptions = {
  stain: string;
  signalChannel: 'red' | 'green' | 'blue' | 'grayscale';
  minThreshold: number;
  maxThreshold: number;
  removeBackground: boolean;
  backgroundTolerance: number;
  outsideMode: 'exclude' | 'report';
  structure: string;
  rois: RoiRect[];
};

export type AnalysisResult = {
  analyzedPixels: number;
  positivePixels: number;
  positivePercent: number;
  mean: number;
  mode: number;
  min: number;
  max: number;
  perimeter: number;
  intDen: number;
  rawIntDen: number;
  backgroundPixels: number;
  backgroundPositivePixels: number;
  backgroundPositivePercent: number;
  excludedPercent: number;
  tissueMask: Uint8Array;
  regionMask: Uint8Array;
  positiveMask: Uint8Array;
  displayRgba: Uint8ClampedArray;
};

const MAX_BROWSER_PIXELS = 30_000_000;

export async function decodeMicroscopyFile(file: File): Promise<DecodedImage> {
  const extension = file.name.toLowerCase().split('.').pop() ?? '';
  if (extension === 'nd2') {
    return decodeNd2WithCompanion(file);
  }

  const buffer = await file.arrayBuffer();
  if (extension === 'tif' || extension === 'tiff') return decodeTiff(buffer);
  if (extension === 'jp2' || extension === 'j2k' || extension === 'jpx') return decodeJp2(buffer);
  return decodeBrowserImage(file);
}

async function decodeNd2WithCompanion(file: File): Promise<DecodedImage> {
  const body = new FormData();
  body.append('file', file);
  let response: Response;
  try {
    response = await fetch('/api/decode', { method: 'POST', body });
  } catch {
    throw new Error('The ND2 companion could not be reached. TIFF and JP2 still run directly in the browser.');
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(
      detail?.error ??
        'ND2 is enabled in the self-hosted installation. For this private test site, convert the file to OME-TIFF first.',
    );
  }
  const png = await response.blob();
  const decoded = await decodeBrowserImage(new File([png], `${file.name}.png`, { type: 'image/png' }));
  return { ...decoded, sourceFormat: 'ND2' };
}

async function decodeTiff(buffer: ArrayBuffer): Promise<DecodedImage> {
  const utifModule = await import('utif');
  const UTIF = utifModule.default ?? utifModule;
  const ifds = UTIF.decode(buffer);
  if (!ifds.length) throw new Error('No image plane was found in this TIFF.');
  UTIF.decodeImage(buffer, ifds[0]);
  const rgba = new Uint8ClampedArray(UTIF.toRGBA8(ifds[0]));
  const width = ifds[0].width;
  const height = ifds[0].height;
  validateDimensions(width, height);
  const bitDepth = Number(ifds[0].t258?.[0] ?? 8);
  return { width, height, rgba, bitDepth, sourceFormat: 'TIFF' };
}

async function decodeJp2(buffer: ArrayBuffer): Promise<DecodedImage> {
  const { JpxImage } = await import('jpeg2000');
  const image = new JpxImage();
  image.parse(new Uint8Array(buffer));
  validateDimensions(image.width, image.height);
  const rgba = new Uint8ClampedArray(image.width * image.height * 4);

  for (const tile of image.tiles) {
    const components = image.componentsCount;
    for (let y = 0; y < tile.height; y++) {
      for (let x = 0; x < tile.width; x++) {
        const src = (y * tile.width + x) * components;
        const dst = ((tile.top + y) * image.width + tile.left + x) * 4;
        const gray = tile.items[src] ?? 0;
        rgba[dst] = components > 1 ? tile.items[src] : gray;
        rgba[dst + 1] = components > 1 ? tile.items[src + 1] : gray;
        rgba[dst + 2] = components > 2 ? tile.items[src + 2] : gray;
        rgba[dst + 3] = 255;
      }
    }
  }
  return { width: image.width, height: image.height, rgba, bitDepth: 8, sourceFormat: 'JP2' };
}

async function decodeBrowserImage(file: File): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(file);
  validateDimensions(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('The browser could not create an image canvas.');
  context.drawImage(bitmap, 0, 0);
  const rgba = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
  bitmap.close();
  return { width: canvas.width, height: canvas.height, rgba, bitDepth: 8, sourceFormat: file.type || 'Image' };
}

function validateDimensions(width: number, height: number) {
  if (!width || !height) throw new Error('The image dimensions are invalid.');
  if (width * height > MAX_BROWSER_PIXELS) {
    throw new Error(
      `This image contains ${(width * height / 1_000_000).toFixed(1)} million pixels. The test site limit is 30 million pixels per plane; use tiled images or the self-hosted analysis service.`,
    );
  }
}

export function analyzeImage(image: DecodedImage, options: AnalysisOptions): AnalysisResult {
  const { width, height, rgba } = image;
  const length = width * height;
  const displayRgba = makeDisplayRgba(rgba, length);
  const backgroundMask = options.removeBackground
    ? findConnectedBackground(displayRgba, width, height, options.backgroundTolerance)
    : new Uint8Array(length);

  let backgroundPixels = countMask(backgroundMask);
  if (backgroundPixels / length < 0.002) {
    backgroundMask.fill(0);
    backgroundPixels = 0;
  }

  const tissueMask = new Uint8Array(length);
  const regionMask = new Uint8Array(length);
  const roiMask = makeRoiMask(width, height, options.rois);
  const useWholeTissue = options.structure === 'Whole tissue';
  for (let i = 0; i < length; i++) {
    tissueMask[i] = backgroundMask[i] ? 0 : 1;
    regionMask[i] = tissueMask[i] && (useWholeTissue || roiMask[i]) ? 1 : 0;
  }

  const positiveMask = new Uint8Array(length);
  const histogram = new Uint32Array(256);
  let analyzedPixels = 0;
  let positivePixels = 0;
  let rawIntDen = 0;
  let min = 255;
  let max = 0;
  let backgroundPositivePixels = 0;

  for (let i = 0; i < length; i++) {
    const p = i * 4;
    const score = stainScore(rgba[p], rgba[p + 1], rgba[p + 2], options.stain, options.signalChannel);
    const isPositive = score >= options.minThreshold && score <= options.maxThreshold;
    if (regionMask[i]) {
      analyzedPixels++;
      histogram[score]++;
      rawIntDen += score;
      if (score < min) min = score;
      if (score > max) max = score;
      if (isPositive) {
        positiveMask[i] = 1;
        positivePixels++;
      }
    } else if (backgroundMask[i] && isPositive) {
      backgroundPositivePixels++;
    }
  }

  let mode = 0;
  for (let i = 1; i < histogram.length; i++) if (histogram[i] > histogram[mode]) mode = i;
  const mean = analyzedPixels ? rawIntDen / analyzedPixels : 0;
  const positivePercent = analyzedPixels ? (positivePixels / analyzedPixels) * 100 : 0;
  const backgroundPositivePercent = backgroundPixels ? (backgroundPositivePixels / backgroundPixels) * 100 : 0;

  return {
    analyzedPixels,
    positivePixels,
    positivePercent,
    mean,
    mode,
    min: analyzedPixels ? min : 0,
    max: analyzedPixels ? max : 0,
    perimeter: maskPerimeter(positiveMask, width, height),
    intDen: rawIntDen,
    rawIntDen,
    backgroundPixels,
    backgroundPositivePixels,
    backgroundPositivePercent,
    excludedPercent: (backgroundPixels / length) * 100,
    tissueMask,
    regionMask,
    positiveMask,
    displayRgba,
  };
}

function stainScore(
  r: number,
  g: number,
  b: number,
  stain: string,
  signalChannel: AnalysisOptions['signalChannel'],
): number {
  if (stain === 'Sirius Red') return clamp(Math.round(r - (g + b) / 2));
  if (stain === 'PAS') return clamp(Math.round((r + b) / 2 - g));
  if (stain === 'H&E — hematoxylin') return clamp(Math.round(b - (r + g) / 2 + 64));
  if (stain === 'H&E — eosin') return clamp(Math.round((r + b) / 2 - g + 64));
  if (stain.includes('(IF)')) {
    if (signalChannel === 'red') return r;
    if (signalChannel === 'green') return g;
    if (signalChannel === 'blue') return b;
    return Math.round((r + g + b) / 3);
  }
  return Math.round((r + g + b) / 3);
}

function clamp(value: number) {
  return Math.max(0, Math.min(255, value));
}

function makeDisplayRgba(source: Uint8ClampedArray, length: number) {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < length; i++) {
    const p = i * 4;
    histogram[Math.round((source[p] + source[p + 1] + source[p + 2]) / 3)]++;
  }
  const high = percentileFromHistogram(histogram, length, 0.995);
  const scale = high > 0 && high < 210 ? 235 / high : 1;
  const output = new Uint8ClampedArray(source.length);
  for (let i = 0; i < length; i++) {
    const p = i * 4;
    output[p] = clamp(Math.round(source[p] * scale));
    output[p + 1] = clamp(Math.round(source[p + 1] * scale));
    output[p + 2] = clamp(Math.round(source[p + 2] * scale));
    output[p + 3] = 255;
  }
  return output;
}

function percentileFromHistogram(histogram: Uint32Array, total: number, percentile: number) {
  const target = total * percentile;
  let count = 0;
  for (let i = 0; i < histogram.length; i++) {
    count += histogram[i];
    if (count >= target) return i;
  }
  return 255;
}

function findConnectedBackground(rgba: Uint8ClampedArray, width: number, height: number, tolerance: number) {
  const length = width * height;
  const mask = new Uint8Array(length);
  const queue = new Int32Array(length);
  const reference = dominantBorderColor(rgba, width, height);
  let head = 0;
  let tail = 0;

  const tryAdd = (index: number) => {
    if (mask[index]) return;
    const p = index * 4;
    const distance = Math.sqrt(
      (rgba[p] - reference[0]) ** 2 +
      (rgba[p + 1] - reference[1]) ** 2 +
      (rgba[p + 2] - reference[2]) ** 2,
    );
    if (distance <= tolerance) {
      mask[index] = 1;
      queue[tail++] = index;
    }
  };

  for (let x = 0; x < width; x++) { tryAdd(x); tryAdd((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y++) { tryAdd(y * width); tryAdd(y * width + width - 1); }

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    if (x > 0) tryAdd(index - 1);
    if (x < width - 1) tryAdd(index + 1);
    if (index >= width) tryAdd(index - width);
    if (index < length - width) tryAdd(index + width);
  }
  return mask;
}

function dominantBorderColor(rgba: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 500));
  const sample = (index: number) => {
    const p = index * 4;
    const key = (rgba[p] >> 4) * 256 + (rgba[p + 1] >> 4) * 16 + (rgba[p + 2] >> 4);
    const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bin.count++;
    bin.r += rgba[p]; bin.g += rgba[p + 1]; bin.b += rgba[p + 2];
    bins.set(key, bin);
  };
  for (let x = 0; x < width; x += stride) { sample(x); sample((height - 1) * width + x); }
  for (let y = stride; y < height - 1; y += stride) { sample(y * width); sample(y * width + width - 1); }
  let best = { count: 1, r: 255, g: 255, b: 255 };
  for (const bin of bins.values()) if (bin.count > best.count) best = bin;
  return [best.r / best.count, best.g / best.count, best.b / best.count];
}

function makeRoiMask(width: number, height: number, rois: RoiRect[]) {
  const mask = new Uint8Array(width * height);
  for (const roi of rois) {
    const x0 = Math.max(0, Math.floor(roi.x));
    const y0 = Math.max(0, Math.floor(roi.y));
    const x1 = Math.min(width, Math.ceil(roi.x + roi.width));
    const y1 = Math.min(height, Math.ceil(roi.y + roi.height));
    for (let y = y0; y < y1; y++) mask.fill(1, y * width + x0, y * width + x1);
  }
  return mask;
}

function countMask(mask: Uint8Array) {
  let count = 0;
  for (let i = 0; i < mask.length; i++) count += mask[i];
  return count;
}

function maskPerimeter(mask: Uint8Array, width: number, height: number) {
  let perimeter = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (!mask[index]) continue;
      if (x === 0 || !mask[index - 1]) perimeter++;
      if (x === width - 1 || !mask[index + 1]) perimeter++;
      if (y === 0 || !mask[index - width]) perimeter++;
      if (y === height - 1 || !mask[index + width]) perimeter++;
    }
  }
  return perimeter;
}
