'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent,
} from 'react';
import {
  analyzeImage,
  decodeMicroscopyFile,
  type AnalysisResult,
  type DecodedImage,
  type RoiRect,
} from './lib/image-analysis';

type ViewMode = 'overlay' | 'original' | 'mask';
type OutsideMode = 'exclude' | 'report';
type SignalChannel = 'red' | 'green' | 'blue' | 'grayscale';

const STAIN_OPTIONS = [
  'Sirius Red',
  'alpha-SMA (IF)',
  'Vimentin (IF)',
  'Lotus lectin / LTL (IF)',
  'PAS',
  'H&E — hematoxylin',
  'H&E — eosin',
];

const STRUCTURE_OPTIONS = [
  'Whole tissue',
  'Glomeruli',
  'Podocytes',
  'Proximal tubules',
  'All tubules',
  'Interstitial region',
];

const DEFAULT_THRESHOLDS: Record<string, [number, number]> = {
  'Sirius Red': [6, 255],
  'alpha-SMA (IF)': [40, 255],
  Vimentin: [40, 255],
  'Vimentin (IF)': [40, 255],
  'Lotus lectin / LTL (IF)': [40, 255],
  PAS: [10, 255],
  'H&E — hematoxylin': [70, 255],
  'H&E — eosin': [70, 255],
};

const DEFAULT_CHANNELS: Record<string, SignalChannel> = {
  'alpha-SMA (IF)': 'red',
  'Vimentin (IF)': 'red',
  'Lotus lectin / LTL (IF)': 'green',
};

function stripExtension(name: string) {
  return name.replace(/\.[^.]+$/, '');
}

function formatInteger(value: number) {
  return Math.round(value).toLocaleString('en-US');
}

function formatDecimal(value: number, digits = 2) {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatBytes(value: number) {
  if (!value) return 'bundled example';
  if (value < 1_000_000) return `${(value / 1_000).toFixed(0)} KB`;
  return `${(value / 1_000_000).toFixed(1)} MB`;
}

export default function Workbench({ userName }: { userName: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sampleId, setSampleId] = useState('i901 · tile_x003_y013');
  const [sourceName, setSourceName] = useState('tile_x003_y013.jp2');
  const [sourceSize, setSourceSize] = useState(0);
  const [image, setImage] = useState<DecodedImage | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [stain, setStain] = useState('Sirius Red');
  const [signalChannel, setSignalChannel] = useState<SignalChannel>('red');
  const [structure, setStructure] = useState('Whole tissue');
  const [minThreshold, setMinThreshold] = useState(6);
  const [maxThreshold, setMaxThreshold] = useState(255);
  const [removeBackground, setRemoveBackground] = useState(true);
  const [outsideMode, setOutsideMode] = useState<OutsideMode>('exclude');
  const [backgroundTolerance, setBackgroundTolerance] = useState(18);
  const [rois, setRois] = useState<RoiRect[]>([]);
  const [draftRoi, setDraftRoi] = useState<RoiRect | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [view, setView] = useState<ViewMode>('overlay');
  const [loading, setLoading] = useState(true);
  const [draggingFile, setDraggingFile] = useState(false);
  const [message, setMessage] = useState('Loading the bundled Sirius Red reference tile…');
  const [error, setError] = useState('');

  const initials = useMemo(
    () =>
      userName
        .split(/\s|@/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || 'KQ',
    [userName],
  );

  const runAnalysis = useCallback(
    (decoded = image) => {
      if (!decoded) return;
      if (structure !== 'Whole tissue' && rois.length === 0) {
        setResult(null);
        setMessage(`Draw one or more ${structure.toLowerCase()} regions on the image, then analyze.`);
        return;
      }
      setLoading(true);
      setError('');
      window.setTimeout(() => {
        try {
          const nextResult = analyzeImage(decoded, {
            stain,
            signalChannel,
            minThreshold,
            maxThreshold,
            removeBackground,
            backgroundTolerance,
            outsideMode,
            structure,
            rois,
          });
          setResult(nextResult);
          setMessage(
            outsideMode === 'report'
              ? 'Analysis complete. Tissue and outside-tissue values are shown separately.'
              : 'Analysis complete. Review the overlay before exporting.',
          );
        } catch (analysisError) {
          setError(analysisError instanceof Error ? analysisError.message : 'The image could not be analyzed.');
        } finally {
          setLoading(false);
        }
      }, 20);
    },
    [image, stain, signalChannel, minThreshold, maxThreshold, removeBackground, backgroundTolerance, outsideMode, structure, rois],
  );

  const openFile = useCallback(async (file: File, preserveSampleId = false) => {
    setLoading(true);
    setError('');
    setMessage(`Opening ${file.name}…`);
    try {
      const decoded = await decodeMicroscopyFile(file);
      setImage(decoded);
      setSourceName(preserveSampleId ? 'tile_x003_y013.jp2' : file.name);
      setSourceSize(preserveSampleId ? 16_000_000 : file.size);
      if (!preserveSampleId) setSampleId(stripExtension(file.name));
      setRois([]);
      if (preserveSampleId) {
        setResult(analyzeImage(decoded, {
          stain: 'Sirius Red',
          signalChannel: 'red',
          minThreshold: 6,
          maxThreshold: 255,
          removeBackground: true,
          backgroundTolerance: 18,
          outsideMode: 'exclude',
          structure: 'Whole tissue',
          rois: [],
        }));
        setMessage('Bundled reference analyzed. Adjust the threshold to see the mask and measurements change.');
      } else {
        setResult(null);
        setMessage('Image ready. Adjust the settings, then analyze.');
      }
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'The file could not be opened.');
      setMessage('Choose another file or use the self-hosted ND2 companion.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/reference-tile.jpg')
      .then((response) => response.blob())
      .then((blob) => {
        if (!active) return;
        return openFile(new File([blob], 'reference-tile.jpg', { type: 'image/jpeg' }), true);
      })
      .catch(() => {
        if (active) {
          setLoading(false);
          setError('The bundled reference image could not be loaded. You can still choose your own file.');
        }
      });
    return () => {
      active = false;
    };
  }, [openFile]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) return;

    const source = result?.displayRgba ?? image.rgba;
    const pixels = new Uint8ClampedArray(source);
    if (result && view !== 'original') {
      for (let i = 0; i < result.positiveMask.length; i++) {
        const p = i * 4;
        if (view === 'mask') {
          const selected = result.regionMask[i] === 1;
          const positive = result.positiveMask[i] === 1;
          pixels[p] = positive ? 207 : selected ? 235 : 28;
          pixels[p + 1] = positive ? 54 : selected ? 241 : 36;
          pixels[p + 2] = positive ? 112 : selected ? 237 : 32;
          pixels[p + 3] = 255;
        } else if (result.positiveMask[i]) {
          pixels[p] = Math.round(pixels[p] * 0.35 + 214 * 0.65);
          pixels[p + 1] = Math.round(pixels[p + 1] * 0.35 + 52 * 0.65);
          pixels[p + 2] = Math.round(pixels[p + 2] * 0.35 + 112 * 0.65);
        } else if (!result.tissueMask[i]) {
          pixels[p] = Math.round(pixels[p] * 0.28);
          pixels[p + 1] = Math.round(pixels[p + 1] * 0.28);
          pixels[p + 2] = Math.round(pixels[p + 2] * 0.28);
        }
      }
    }
    context.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);

    const allRois = draftRoi ? [...rois, draftRoi] : rois;
    context.save();
    context.strokeStyle = '#69a7ff';
    context.fillStyle = 'rgba(76, 139, 234, .12)';
    context.lineWidth = Math.max(2, image.width / 700);
    context.setLineDash([Math.max(5, image.width / 180), Math.max(4, image.width / 260)]);
    allRois.forEach((roi, index) => {
      context.fillRect(roi.x, roi.y, roi.width, roi.height);
      context.strokeRect(roi.x, roi.y, roi.width, roi.height);
      context.setLineDash([]);
      context.font = `700 ${Math.max(12, image.width / 85)}px Arial`;
      context.fillStyle = '#ddebff';
      context.fillText(`R${index + 1}`, roi.x + 6, Math.max(18, roi.y + 20));
      context.fillStyle = 'rgba(76, 139, 234, .12)';
      context.setLineDash([Math.max(5, image.width / 180), Math.max(4, image.width / 260)]);
    });
    context.restore();
  }, [image, result, view, rois, draftRoi]);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const file = files[0];
      if (file) void openFile(file);
    },
    [openFile],
  );

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) handleFiles(event.target.files);
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingFile(false);
    handleFiles(event.dataTransfer.files);
  };

  const pointInImage = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!image) return { x: 0, y: 0 };
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * image.width,
      y: ((event.clientY - bounds.top) / bounds.height) * image.height,
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || !image) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointInImage(event);
    setDraftRoi({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || !draftRoi) return;
    const point = pointInImage(event);
    setDraftRoi({ ...draftRoi, width: point.x - draftRoi.x, height: point.y - draftRoi.y });
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || !draftRoi) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const normalized: RoiRect = {
      x: draftRoi.width < 0 ? draftRoi.x + draftRoi.width : draftRoi.x,
      y: draftRoi.height < 0 ? draftRoi.y + draftRoi.height : draftRoi.y,
      width: Math.abs(draftRoi.width),
      height: Math.abs(draftRoi.height),
    };
    if (normalized.width > 5 && normalized.height > 5) setRois((current) => [...current, normalized]);
    setDraftRoi(null);
    setResult(null);
  };

  const chooseStain = (value: string) => {
    const [minimum, maximum] = DEFAULT_THRESHOLDS[value] ?? [0, 255];
    setStain(value);
    setSignalChannel(DEFAULT_CHANNELS[value] ?? 'red');
    setMinThreshold(minimum);
    setMaxThreshold(maximum);
    setResult(null);
  };

  const chooseStructure = (value: string) => {
    setStructure(value);
    setRois([]);
    setDrawing(value !== 'Whole tissue');
    setResult(null);
    setMessage(
      value === 'Whole tissue'
        ? 'Whole-tissue mode uses the automatically separated tissue area.'
        : `Draw boxes around every ${value.toLowerCase()} region you want included.`,
    );
  };

  const exportCsv = () => {
    if (!result || !image) return;
    const values = [
      sampleId, stain, stain.includes('(IF)') ? signalChannel : 'stain score', structure, result.positivePercent.toFixed(4), result.analyzedPixels,
      result.positivePixels, result.mean.toFixed(4), result.mode, result.min, result.max,
      result.perimeter, result.intDen.toFixed(4), result.rawIntDen.toFixed(4), minThreshold,
      maxThreshold, result.backgroundPixels, result.backgroundPositivePercent.toFixed(4), sourceName,
    ];
    const headers = [
      'Sample_ID', 'Stain', 'Signal_Channel', 'Structure', 'Percent_Area', 'Area', 'Positive_Area', 'Mean', 'Mode',
      'Min', 'Max', 'Perim', 'IntDen', 'RawIntDen', 'MinThreshold', 'MaxThreshold',
      'Background_Area', 'Background_Positive_Percent', 'Source_File',
    ];
    const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = `${headers.map(escape).join(',')}\n${values.map(escape).join(',')}\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sampleId.replace(/[^a-z0-9_-]+/gi, '_') || 'sample'}_quantification.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark" aria-hidden="true"><span /></span><div><p>KidneyQuant</p><span>stain analysis workbench</span></div></div>
        <div className="privacy-state"><i /> On-device analysis</div>
        <div className="profile" title={userName}>{initials}</div>
      </header>

      <section className="workspace-heading">
        <div><p className="eyebrow">New analysis</p><h1>Turn stained tissue into auditable measurements.</h1><p className="lede">Upload a microscopy image, separate tissue from slide background, select any structure-specific regions, then review every counted pixel.</p></div>
        <div className="format-badges"><span>TIFF</span><span>JP2</span><span>ND2 self-host</span></div>
      </section>

      <section className="workbench-grid">
        <aside className="control-panel">
          <div className="panel-title"><span>01</span><div><h2>Set up analysis</h2><p>Sample and staining details</p></div></div>
          <label className="field-label" htmlFor="sample-id">Sample ID <b>required</b></label>
          <input id="sample-id" className="text-input" value={sampleId} onChange={(event) => setSampleId(event.target.value)} />

          <label className="field-label" htmlFor="stain">Staining</label>
          <select id="stain" className="select-input" value={stain} onChange={(event) => chooseStain(event.target.value)}>{STAIN_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select>

          {stain.includes('(IF)') && <><label className="field-label" htmlFor="signal-channel">Positive signal channel</label><select id="signal-channel" className="select-input" value={signalChannel} onChange={(event) => { setSignalChannel(event.target.value as SignalChannel); setResult(null); }}><option value="red">Red</option><option value="green">Green</option><option value="blue">Blue</option><option value="grayscale">Grayscale</option></select></>}

          <label className="field-label" htmlFor="structure">Structure to quantify</label>
          <select id="structure" className="select-input" value={structure} onChange={(event) => chooseStructure(event.target.value)}>{STRUCTURE_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select>

          {structure !== 'Whole tissue' && <div className="roi-controls"><button type="button" className={drawing ? 'active' : ''} onClick={() => setDrawing((current) => !current)}>{drawing ? 'Drawing regions' : 'Draw regions'}</button><button type="button" onClick={() => { setRois([]); setResult(null); }}>Clear ({rois.length})</button></div>}

          <div className="switch-row"><div><strong>Remove slide background</strong><span>Border-connected area outside tissue</span></div><button type="button" className={`toggle ${removeBackground ? 'active' : ''}`} aria-pressed={removeBackground} onClick={() => { setRemoveBackground((current) => !current); setResult(null); }}><i /></button></div>

          {removeBackground && <><label className="field-label compact" htmlFor="outside-mode">Outside-tissue handling</label><select id="outside-mode" className="select-input" value={outsideMode} onChange={(event) => { setOutsideMode(event.target.value as OutsideMode); setResult(null); }}><option value="exclude">Exclude from calculations</option><option value="report">Exclude and report separately</option></select><label className="field-label compact" htmlFor="background-tolerance">Background tolerance <span>{backgroundTolerance}</span></label><input id="background-tolerance" className="single-range" type="range" min="4" max="60" value={backgroundTolerance} onChange={(event) => { setBackgroundTolerance(Number(event.target.value)); setResult(null); }} /></>}

          <div className="threshold-card"><div className="threshold-title"><strong>Positive stain threshold</strong><span>Manual</span></div><label htmlFor="minimum-threshold">Minimum <b>{minThreshold}</b></label><input id="minimum-threshold" className="single-range berry" type="range" min="0" max="255" value={minThreshold} onChange={(event) => { setMinThreshold(Math.min(Number(event.target.value), maxThreshold)); setResult(null); }} /><label htmlFor="maximum-threshold">Maximum <b>{maxThreshold}</b></label><input id="maximum-threshold" className="single-range berry" type="range" min="0" max="255" value={maxThreshold} onChange={(event) => { setMaxThreshold(Math.max(Number(event.target.value), minThreshold)); setResult(null); }} /></div>

          <button type="button" className="primary-button" disabled={!image || loading || !sampleId.trim()} onClick={() => runAnalysis()}>{loading ? 'Working…' : 'Analyze image'} <span>→</span></button>
          <p className="validation-note">Research-use workflow. Thresholds and structure regions must be reviewed before statistical analysis.</p>
        </aside>

        <section className="image-stage">
          <div className="stage-toolbar"><div className="file-chip" title={sourceName}><i /> {sourceName} <span>{formatBytes(sourceSize)}</span></div><div className="view-tabs" aria-label="Image view">{(['overlay', 'original', 'mask'] as ViewMode[]).map((option) => <button key={option} type="button" className={view === option ? 'active' : ''} onClick={() => setView(option)}>{option}</button>)}</div><button className="replace-button" type="button" onClick={() => fileInput.current?.click()}>Replace</button><input ref={fileInput} type="file" accept=".nd2,.tif,.tiff,.jp2,.j2k,.jpx" hidden onChange={onFileChange} /></div>

          <div className={`image-canvas ${draggingFile ? 'dragging' : ''} ${drawing ? 'drawing' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDraggingFile(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDraggingFile(false)} onDrop={onDrop}>
            {image && <canvas ref={canvasRef} aria-label="Microscopy image analysis preview" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />}
            {!image && <div className="empty-canvas"><strong>No image open</strong><span>Choose a TIFF, JP2, or ND2 file.</span></div>}
            {(draggingFile || !image) && <button type="button" className="central-dropzone" onClick={() => fileInput.current?.click()}><strong>Drop ND2, TIFF, or JP2</strong><span>or choose a file</span></button>}
            {image && <button type="button" className="dropzone" onClick={() => fileInput.current?.click()}><strong>Drop ND2, TIFF, or JP2</strong><span>or choose a file</span></button>}
            {drawing && <div className="drawing-hint">Drag on the image to add a region</div>}
            <div className="legend"><span><i className="positive" /> Positive stain</span><span><i className="structure" /> Selected region</span><span><i className="excluded" /> Excluded</span></div>
          </div>

          <div className={`analysis-message ${error ? 'error' : ''}`} role="status"><i>{error ? '!' : loading ? '…' : '✓'}</i><span>{error || message}</span></div>
          <div className="stage-caption"><span>{image ? `${image.width.toLocaleString()} × ${image.height.toLocaleString()} px` : '—'}</span><span>{image ? `${image.sourceFormat} · ${image.bitDepth}-bit source` : '—'}</span><span>{removeBackground ? 'Background separation on' : 'Background included'}</span></div>
        </section>

        <aside className="results-panel">
          <div className="panel-title"><span>02</span><div><h2>Review result</h2><p>{result ? 'Current measurement' : 'Awaiting analysis'}</p></div></div>
          <div className="primary-metric"><span>Positive area</span><strong>{result ? formatDecimal(result.positivePercent) : '—'}{result && <small>%</small>}</strong><p>of {structure.toLowerCase()} analysis area</p></div>
          <div className="sample-summary"><span>Sample ID</span><strong>{sampleId || 'Required'}</strong></div>
          <dl className="metric-list"><div><dt>Area</dt><dd>{result ? `${formatInteger(result.analyzedPixels)} px²` : '—'}</dd></div><div><dt>Positive area</dt><dd>{result ? `${formatInteger(result.positivePixels)} px²` : '—'}</dd></div><div><dt>Mean</dt><dd>{result ? formatDecimal(result.mean) : '—'}</dd></div><div><dt>Mode</dt><dd>{result ? result.mode : '—'}</dd></div><div><dt>Min / Max</dt><dd>{result ? `${result.min} / ${result.max}` : '—'}</dd></div><div><dt>Perim</dt><dd>{result ? `${formatInteger(result.perimeter)} px` : '—'}</dd></div><div><dt>IntDen</dt><dd>{result ? formatInteger(result.intDen) : '—'}</dd></div><div><dt>RawIntDen</dt><dd>{result ? formatInteger(result.rawIntDen) : '—'}</dd></div><div><dt>Threshold</dt><dd>{minThreshold} — {maxThreshold}</dd></div></dl>
          {result && outsideMode === 'report' && <div className="background-report"><span>Outside tissue</span><strong>{formatInteger(result.backgroundPixels)} px²</strong><small>{formatDecimal(result.backgroundPositivePercent)}% positive, reported separately</small></div>}
          <div className={`quality-card ${!result ? 'neutral' : ''}`}><i>{result ? '✓' : 'i'}</i><div><strong>{result ? 'Mask ready for review' : 'No finalized result yet'}</strong><span>{result ? `${formatDecimal(result.excludedPercent, 1)}% slide/background excluded` : 'Open an image and run analysis'}</span></div></div>
          <button type="button" className="export-button" disabled={!result || !sampleId.trim()} onClick={exportCsv}>Export CSV</button>
          <p className="calibration-note">Area and perimeter use pixels. Add calibrated pixel size in a future validated workflow for µm² and µm.</p>
        </aside>
      </section>
    </main>
  );
}
