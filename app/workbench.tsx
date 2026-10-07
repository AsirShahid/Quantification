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
  type DecodedImage,
  type RoiRect,
} from './lib/image-analysis';
import {
  analysisRecordToCsv,
  type AnalysisRecord,
  type AnalysisSettingsSnapshot,
} from './lib/analysis-record';
import { prepareMicroscopyFiles } from './lib/viewer-utils.mjs';

import { prepareMacroImage, type ConversionRange } from './lib/macro-workflow';
import { averageThresholds, type ReferenceTile, type StudyTile } from './lib/study';
import { captureChannels } from './lib/channel-capture';
import { NumberField } from './channel-controls';
import RoiEditor from './roi-editor';
import ChannelTile from './channel-tile';
import ResultsPanel from './results-panel';
import { analyzeChannels } from './lib/channel-analysis';
import ChannelControls from './channel-controls';
import { samplePreview, channelSettingsKey, automaticSettings, displayRanges, renderPreview, type ChannelSettings } from './lib/channel-preview';
import { loadMicroscopyFile } from './lib/image-loader';
import StainingPanelControls from './staining-panel';
import { activeAssignment, type StainingPanel } from './lib/stain-channels';

type ViewMode = 'overlay' | 'original';
type OutsideMode = 'exclude' | 'report';
type SignalChannel = 'red' | 'green' | 'blue' | 'grayscale';
type DisplayChannel = 'composite' | 'red' | 'green' | 'blue';

const SYNTHETIC_DEMO_NAME = 'synthetic-demo-tile.jpg';
const SIGNAL_CHANNELS: { value: SignalChannel; label: string }[] = [
  { value: 'red', label: 'Red' },
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
  { value: 'grayscale', label: 'Grayscale' },
];

const STAIN_OPTIONS = [
  'Sirius Red',
  'alpha-SMA (IF)',
  'Vimentin (IF)',
  'Lotus lectin / LTL (IF)',
  'DAPI (IF)',
  'ApoJ / Clusterin (IF)',
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
  'DAPI (IF)': 'blue',
};

function stripExtension(name: string) {
  return name.replace(/\.[^.]+$/, '');
}


function formatBytes(value: number) {
  if (!value) return '0 B';
  if (value < 1_000_000) return `${(value / 1_000).toFixed(0)} KB`;
  return `${(value / 1_000_000).toFixed(1)} MB`;
}

function formatPlaneSelection(selection: DecodedImage['planeSelection']) {
  const entries = Object.entries(selection);
  return entries.length ? entries.map(([axis, value]) => `${axis}=${value}`).join(', ') : 'single image plane';
}

function errorMessage(value: unknown, fallback: string) {
  return value instanceof Error && value.message.trim() ? value.message : fallback;
}

function safeExportName(sampleId: string) {
  return sampleId.replace(/[^a-z0-9_-]+/gi, '_') || 'sample';
}

function downloadText(contents: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function availableSignalChannels(image: DecodedImage | null) {
  if (!image || image.channelCount >= 3) return SIGNAL_CHANNELS;
  if (image.channelCount === 2) return SIGNAL_CHANNELS.filter(({ value }) => value !== 'blue');
  return SIGNAL_CHANNELS.filter(({ value }) => value === 'grayscale');
}

function drawRoiOverlay(
  context: CanvasRenderingContext2D,
  imageWidth: number,
  rois: RoiRect[],
  draftRoi: RoiRect | null,
) {
  const visibleRois = draftRoi ? [...rois, draftRoi] : rois;
  context.save();
  context.strokeStyle = '#69a7ff';
  context.fillStyle = 'rgba(76, 139, 234, .12)';
  context.lineWidth = Math.max(2, imageWidth / 700);
  context.setLineDash([Math.max(5, imageWidth / 180), Math.max(4, imageWidth / 260)]);
  visibleRois.forEach((roi, index) => {
    if(roi.points?.length) {context.beginPath();roi.points.forEach((point,i)=>{if(i)context.lineTo(point.x,point.y);else context.moveTo(point.x,point.y);});context.closePath();context.fill();context.stroke();}
    else {context.fillRect(roi.x, roi.y, roi.width, roi.height);context.strokeRect(roi.x, roi.y, roi.width, roi.height);}
    context.setLineDash([]);
    context.font = `700 ${Math.max(12, imageWidth / 85)}px Arial`;
    context.fillStyle = '#ddebff';
    context.fillText(`R${index + 1}`, roi.x + 6, Math.max(18, roi.y + 20));
    context.fillStyle = 'rgba(76, 139, 234, .12)';
    context.setLineDash([Math.max(5, imageWidth / 180), Math.max(4, imageWidth / 260)]);
  });
  context.restore();
}

export default function Workbench({ userName }: { userName: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const roisRef = useRef<RoiRect[]>([]);
  const draftRoiRef = useRef<RoiRect | null>(null);
  const draftFrameRef = useRef<number | null>(null);
  const openRequestId = useRef(0);
  const thresholdMaximumRef = useRef(255);
  const openController = useRef<AbortController | null>(null);
  const analysisRequestId = useRef(0);
  const [sampleId, setSampleId] = useState('synthetic-demo-tile');
  const [sourceName, setSourceName] = useState(SYNTHETIC_DEMO_NAME);
  const [sourceSize, setSourceSize] = useState(0);
  const [sourceLastModified, setSourceLastModified] = useState(0);
  const [rawImage, setImage] = useState<DecodedImage | null>(null);
  const [channelRecords, setChannelRecords] = useState<AnalysisRecord[]>([]);
  const [exporting, setExporting] = useState(false);
  const [analysisRecord, setAnalysisRecord] = useState<AnalysisRecord | null>(null);
  const [stain, setStain] = useState('Lotus lectin / LTL (IF)');
  const [conversionOverrides,setConversionOverrides]=useState<ConversionRange[]|undefined>();
  const image=useMemo(()=>rawImage ? prepareMacroImage(rawImage,stain==='Sirius Red',conversionOverrides):null,[rawImage,stain,conversionOverrides]);
  const [studySample,setStudySample]=useState('');
  const [references,setReferences]=useState<ReferenceTile[]>([]);
  const [accepted,setAccepted]=useState<Record<string,ChannelSettings>|null>(null);
  const referenceDefaultsRef=useRef<Record<string,ChannelSettings>|null>(null);
  const acceptedRef=useRef<Record<string,ChannelSettings>|null>(null);
  const [studyTiles,setStudyTiles]=useState<StudyTile[]>([]);
  const [projectTiles,setProjectTiles]=useState<StudyTile[]>([]);
  const [projectReferences,setProjectReferences]=useState<ReferenceTile[]>([]);
  const [batchBusy,setBatchBusy]=useState(false);
  const batchCancel=useRef(false);
  const [drawShape,setDrawShape]=useState<'freehand'|'rectangle'>('freehand');
  const profile=stain==='Sirius Red'?'sirius-magenta':'fluorescence-8bit';

  const [stainingPanel, setStainingPanel] = useState<StainingPanel>({
    coStained: 'unspecified', activeId: null,
    assignments: [{ id: 'primary', marker: 'Lotus lectin / LTL', channel: 'green', reagent: '' }],
  });
  const [signalChannel, setSignalChannel] = useState<SignalChannel>('green');
  const [structure, setStructure] = useState('Whole tissue');
  const [minThreshold, setMinThreshold] = useState(6);
  const [maxThreshold, setMaxThreshold] = useState(255);
  const [removeBackground, setRemoveBackground] = useState(false);
  const [outsideMode, setOutsideMode] = useState<OutsideMode>('exclude');
  const [backgroundTolerance, setBackgroundTolerance] = useState(18);
  const [rois, setRois] = useState<RoiRect[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [view, setView] = useState<ViewMode>('original');
  const [loading, setLoading] = useState(true);
  const [draggingFile, setDraggingFile] = useState(false);
  const [folderFiles, setFolderFiles] = useState<File[]>([]);
  const [folderIndex, setFolderIndex] = useState(0);
  const [message, setMessage] = useState('Loading the bundled procedurally generated synthetic demo tile…');
  const [error, setError] = useState('');
  const thresholdMax=profile==='sirius-magenta'?1:255;
  const [brightness, setBrightness] = useState(1);
  const [channelSettings, setChannelSettings] = useState<Record<string, ChannelSettings>>({});
  const previewImage = useMemo(() => image ? samplePreview(image) : null, [image]);
  const ranges = useMemo(() => previewImage ? displayRanges(previewImage) : [255, 255, 255], [previewImage]);
  const suggestions = useMemo(() => Object.fromEntries(SIGNAL_CHANNELS.map(({ value }) => [value,
    previewImage ? automaticSettings(previewImage, stain, value) : { minimum: 0, maximum: 255, brightness: 1 },
  ])) as Record<SignalChannel, ChannelSettings>, [previewImage, stain]);

  useEffect(() => {
    if (!previewImage) return;
    const frame = requestAnimationFrame(() => {
      const next = channelSettings[channelSettingsKey(stain, signalChannel)] ?? suggestions[signalChannel];
      setMinThreshold(next.minimum);
      setMaxThreshold(next.maximum);
      setBrightness(next.brightness);
    });
    return () => cancelAnimationFrame(frame);
  }, [previewImage, stain, signalChannel, suggestions, channelSettings]);

  const previewOptions = useMemo(() => ({
    stain, signalChannel, minThreshold, maxThreshold, removeBackground, backgroundTolerance,
    outsideMode, structure, rois: rois.map((roi) => ({
      points:roi.points?.map(p=>({x:p.x*(previewImage?.width??1)/(image?.width??1),y:p.y*(previewImage?.height??1)/(image?.height??1)})),
      x: roi.x * (previewImage?.width ?? 1) / (image?.width ?? 1),
      y: roi.y * (previewImage?.height ?? 1) / (image?.height ?? 1),
      width: roi.width * (previewImage?.width ?? 1) / (image?.width ?? 1),
      height: roi.height * (previewImage?.height ?? 1) / (image?.height ?? 1),
    })),
  }), [stain, signalChannel, minThreshold, maxThreshold, removeBackground, backgroundTolerance, outsideMode, structure, rois, previewImage, image]);
  const previewBrightness = useMemo(() => image?.channelCount === 1 || signalChannel === 'grayscale' ? [brightness, brightness, brightness]
    : (['red', 'green', 'blue'] as const).map((channel) => channel === signalChannel ? brightness : channelSettings[channelSettingsKey(stain, channel)]?.brightness ?? 1),
  [image, brightness, signalChannel, channelSettings, stain]);

  const previewDisplayMinimum = useMemo(() => (['red', 'green', 'blue'] as const).map(channel =>
    channelSettings[channelSettingsKey(stain, image?.channelCount === 1 ? 'grayscale' : channel)]?.displayMinimum ?? 0), [channelSettings, stain, image]);
  const previewDisplayMaximum = useMemo(() => (['red', 'green', 'blue'] as const).map((channel, index) =>
    channelSettings[channelSettingsKey(stain, image?.channelCount === 1 ? 'grayscale' : channel)]?.displayMaximum ?? ranges[index]), [channelSettings, stain, image, ranges]);

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

  const invalidateAnalysis = useCallback(() => {
    analysisRequestId.current++;
    setAnalysisRecord(null); setChannelRecords([]);
    setError('');
    setMessage('Settings changed — rerun analysis');
    if (image) setLoading(false);
  }, [image]);

  const runAnalysis = useCallback(
    (decoded = image) => {
      if (!decoded) return;
      if(decoded.analysisWorkflow==='sirius-magenta' && decoded.channelCount!==3) {setError('Sirius Red requires a three-channel RGB image.');return;}
      const channels=decoded.analysisWorkflow==='sirius-magenta'?['red']:decoded.channelCount===1?['grayscale']:decoded.channelCount===2?['red','green']:['red','green','blue'];
      if(acceptedRef.current && channels.some(channel=>!acceptedRef.current![channelSettingsKey(stain,channel as SignalChannel)])) {setError('This tile has different channels from the accepted reference set. Start a new study for it.');return;}

      if (stainingPanel.activeId && !activeAssignment(stainingPanel, decoded.channelCount)) {
        setError('Choose a stain name and an available image channel before analysis.');
        return;
      }
      if (structure !== 'Whole tissue' && rois.length === 0) {
        setAnalysisRecord(null); setChannelRecords([]);
        setError('No analyzable ROI is defined. Add at least one region, then rerun analysis.');
        return;
      }
      const settings: AnalysisSettingsSnapshot = {
        stainingPanel,
        stain,
        signalChannel,
        minThreshold,
        maxThreshold,
        removeBackground,
        backgroundTolerance,
        outsideMode,
        structure,
        rois: rois.map((roi) => ({ ...roi })),
      };
      const provenance = {
        analyst: userName,
        sampleId: studySample.trim() || sampleId.trim(),
        sourceName,
        sourceSize,
        sourceLastModified,
      };
      const requestId = ++analysisRequestId.current;
      setLoading(true);
      setError('');
      setAnalysisRecord(null); setChannelRecords([]);
      setMessage('Analyzing image…');
      // Two animation frames guarantee that the working state is painted before
      // the bounded synchronous analysis begins. Request IDs still discard stale work.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (requestId !== analysisRequestId.current) return;
          try {
            const records = analyzeChannels(decoded, settings, channelSettings, provenance);
            if (requestId !== analysisRequestId.current) return;
            setChannelRecords(records);
            if(acceptedRef.current) {
              const entry:StudyTile={id:decoded.sourceSha256+sourceName,name:sourceName,records,screenshots:captureChannels(decoded,channelSettings,settings),displaySettings:structuredClone(channelSettings),reference:references.some(r=>r.id===decoded.sourceSha256+sourceName)};
              setStudyTiles(current=>[...current.filter(tile=>tile.id!==entry.id),entry]);
            }
            setAnalysisRecord(records.find(record => record.analysis.signalChannel === signalChannel) ?? records[0]);
            setMessage(
              settings.removeBackground && settings.outsideMode === 'report'
                ? 'Analysis complete. Tissue and outside-tissue values are shown separately.'
                : 'Analysis complete. Review the overlay before exporting.',
            );
          } catch (analysisError) {
            if (requestId === analysisRequestId.current) {
              setAnalysisRecord(null); setChannelRecords([]);
              setError(errorMessage(analysisError, 'The image could not be analyzed.'));
            }
          } finally {
            if (requestId === analysisRequestId.current) setLoading(false);
          }
        });
      });
    },
    [
      image, stain, stainingPanel, signalChannel, minThreshold, maxThreshold, removeBackground, backgroundTolerance,
      outsideMode, structure, rois, userName, sampleId, sourceName, sourceSize, sourceLastModified, channelSettings, studySample, references,
    ],
  );

  const openFile = useCallback(async (file: File, demonstration = false, displayName = file.name) => {
    const requestId = ++openRequestId.current;
    openController.current?.abort();
    const controller = new AbortController();
    openController.current = controller;
    analysisRequestId.current++;
    setLoading(true);
    setError('');
    setAnalysisRecord(null); setChannelRecords([]);
    setImage(null);
    setChannelSettings(acceptedRef.current ?? referenceDefaultsRef.current ?? {});
    setConversionOverrides(undefined);
    setView('original');
    setStainingPanel((current) => ({ ...current, activeId: null }));
    setSourceName(displayName);
    setSourceSize(file.size);
    setSourceLastModified(file.lastModified);
    setMessage(`Opening ${file.name}…`);
    try {
      const decoded = await loadMicroscopyFile(file, controller.signal);
      if (controller.signal.aborted || requestId !== openRequestId.current) return;
      const nextMaximum = 255;
      const scale = nextMaximum / thresholdMaximumRef.current;
      setMinThreshold((current) => Math.round(current * scale));
      setMaxThreshold((current) => Math.round(current * scale));
      thresholdMaximumRef.current = nextMaximum;

      setImage(decoded);
      setSignalChannel((current) => {
        if (decoded.channelCount <= 1) return 'grayscale';
        return decoded.channelCount === 2 && current === 'blue' ? 'red' : current;
      });
      if (!demonstration) setSampleId(stripExtension(displayName).replaceAll('/', ' · '));
      setRois([]);
      if (demonstration) {
        setMessage(`Bundled ${SYNTHETIC_DEMO_NAME} ready — procedurally generated synthetic data; no specimen or acquisition. Demonstration only; not validated for quantitative use.`);
      } else {
        setMessage('Image ready. Adjust the settings, then analyze.');
      }
    } catch (openError) {
      if (!controller.signal.aborted && requestId === openRequestId.current) {
        setError(`Could not decode ${displayName}: ${errorMessage(openError, 'The file could not be opened.')}`);
        setMessage('Choose another supported file or verify that the private image companion is healthy.');
      }
    } finally {
      if (!controller.signal.aborted && requestId === openRequestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`/${SYNTHETIC_DEMO_NAME}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Reference request failed with HTTP ${response.status}.`);
        return response.blob();
      })
      .then((blob) => {
        if (!active || openRequestId.current > 0) return;
        return openFile(new File([blob], SYNTHETIC_DEMO_NAME, { type: 'image/jpeg', lastModified: 0 }), true);
      })
      .catch((referenceError) => {
        if (active && openRequestId.current === 0) {
          setLoading(false);
          setError(`The bundled reference image could not be loaded: ${errorMessage(referenceError, 'Unknown decode error')}`);
        }
      });
    return () => {
      active = false;
    };
  }, [openFile]);

  const paintCanvas = useCallback((draftRoi = draftRoiRef.current) => {
    const canvas = canvasRef.current;
    const baseCanvas = baseCanvasRef.current;
    if (!canvas || !baseCanvas || canvas.width !== baseCanvas.width || canvas.height !== baseCanvas.height) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(baseCanvas, 0, 0);
    if (image) {
      context.save();
      context.scale(canvas.width / image.width, canvas.height / image.height);
      drawRoiOverlay(context, image.width, roisRef.current, draftRoi);
      context.restore();
    }
  }, [image]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !previewImage) return;
    const baseCanvas = document.createElement('canvas');
    canvas.width = baseCanvas.width = previewImage.width;
    canvas.height = baseCanvas.height = previewImage.height;
    const pixels = renderPreview(previewImage, 'composite', previewDisplayMaximum, previewBrightness, previewOptions, view, previewDisplayMinimum);
    baseCanvas.getContext('2d')?.putImageData(new ImageData(pixels, previewImage.width, previewImage.height), 0, 0);
    baseCanvasRef.current = baseCanvas;
    paintCanvas();
  }, [previewImage, previewDisplayMinimum, previewDisplayMaximum, previewBrightness, previewOptions, view, paintCanvas]);

  useEffect(() => {
    roisRef.current = rois;
    paintCanvas();
  }, [rois, paintCanvas]);

  useEffect(() => () => {
    openController.current?.abort();
    if (draftFrameRef.current !== null) window.cancelAnimationFrame(draftFrameRef.current);
  }, []);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const prepared = prepareMicroscopyFiles(files);
      if (!prepared.length) {
        setError('No ND2, TIFF, or JP2 files were found.');
        return;
      }
      if(!studySample) setStudySample(prepared[0]?.webkitRelativePath.split('/')[0] || stripExtension(prepared[0]?.name||'Sample'));
      setFolderFiles(prepared);
      setFolderIndex(0);
      const first = prepared[0];
      void openFile(first, false, first.webkitRelativePath || first.name);
    },
    [openFile,studySample],
  );

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) handleFiles(event.target.files);
    event.target.value = '';
  };

  const onFolderChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) handleFiles(event.target.files);
    event.target.value = '';
  };

  const openFolderFile = (index: number) => {
    const file = folderFiles[index];
    if (!file || loading) return;
    setFolderIndex(index);
    void openFile(file, false, file.webkitRelativePath || file.name);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingFile(false);
    if (loading) return;
    handleFiles(event.dataTransfer.files);
  };

  const pointInImage = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!image) return { x: 0, y: 0 };
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(image.width, ((event.clientX - bounds.left) / bounds.width) * image.width)),
      y: Math.max(0, Math.min(image.height, ((event.clientY - bounds.top) / bounds.height) * image.height)),
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing || !image) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointInImage(event);
    draftRoiRef.current = { x: point.x, y: point.y, width: 0, height: 0, ...(drawShape==='freehand'?{points:[point]}:{}) };
    paintCanvas();
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const draftRoi = draftRoiRef.current;
    if (!drawing || !draftRoi) return;
    const point = pointInImage(event);
    draftRoiRef.current = { ...draftRoi, ...(draftRoi.points ? {points:[...draftRoi.points,point]}:{}), width: point.x - draftRoi.x, height: point.y - draftRoi.y };
    if (draftFrameRef.current === null) {
      draftFrameRef.current = window.requestAnimationFrame(() => {
        draftFrameRef.current = null;
        paintCanvas();
      });
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const draftRoi = draftRoiRef.current;
    if (!drawing || !draftRoi) return;
    const point = pointInImage(event);
    const finishedRoi = { ...draftRoi, width: point.x - draftRoi.x, height: point.y - draftRoi.y };
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    let normalized: RoiRect = {
      x: Math.round(finishedRoi.width < 0 ? finishedRoi.x + finishedRoi.width : finishedRoi.x),
      y: Math.round(finishedRoi.height < 0 ? finishedRoi.y + finishedRoi.height : finishedRoi.y),
      width: Math.round(Math.abs(finishedRoi.width)),
      height: Math.round(Math.abs(finishedRoi.height)),
    };
    if(finishedRoi.points && finishedRoi.points.length>=3) {
      const points=[...finishedRoi.points,point];const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
      normalized={x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys),points};
    }
    draftRoiRef.current = null;
    if (draftFrameRef.current !== null) {
      window.cancelAnimationFrame(draftFrameRef.current);
      draftFrameRef.current = null;
    }
    if (normalized.width > 5 && normalized.height > 5) {
      setRois(current=>[...current,structuredClone(normalized)]);
      invalidateAnalysis();
    }
    paintCanvas(null);
  };

  const onPointerCancel = () => {
    draftRoiRef.current = null;
    if (draftFrameRef.current !== null) {
      window.cancelAnimationFrame(draftFrameRef.current);
      draftFrameRef.current = null;
    }
    paintCanvas(null);
  };

  const addCentralRoi = () => {
    if (!image) return;
    const width = Math.max(1, Math.round(image.width * 0.25));
    const height = Math.max(1, Math.round(image.height * 0.25));
    setRois((current) => [
      ...current,
      { x: Math.round((image.width - width) / 2), y: Math.round((image.height - height) / 2), width, height },
    ]);
    invalidateAnalysis();
  };

  const updateRoi = (index: number, field: keyof RoiRect, value: number) => {
    if (!image || !Number.isFinite(value)) return;
    setRois((current) => current.map((roi, roiIndex) => {
      if (roiIndex !== index) return roi;
      const next = { ...roi };
      if (field === 'x') {
        next.x = Math.max(0, Math.min(image.width, value));
        next.width = Math.min(next.width, image.width - next.x);
      } else if (field === 'y') {
        next.y = Math.max(0, Math.min(image.height, value));
        next.height = Math.min(next.height, image.height - next.y);
      } else if (field === 'width') {
        next.width = Math.max(0, Math.min(image.width - next.x, value));
      } else {
        next.height = Math.max(0, Math.min(image.height - next.y, value));
      }
      return next;
    }));
    invalidateAnalysis();
  };

  const deleteRoi = (index: number) => {
    setRois((current) => current.filter((_, roiIndex) => roiIndex !== index));
    invalidateAnalysis();
  };

  const chooseStain = (value: string) => {
    const [minimum, maximum] = DEFAULT_THRESHOLDS[value] ?? [0, 255];
    setStain(value);
    setChannelSettings({});
    const requested = DEFAULT_CHANNELS[value] ?? 'red';
    setSignalChannel(availableSignalChannels(image).some(({ value }) => value === requested) ? requested : image?.channelCount === 1 ? 'grayscale' : 'red');
    setStainingPanel((current) => value.includes('(IF)') ? {...current,activeId:'primary',assignments:[{id:'primary',marker:value.replace(' (IF)',''),channel:requested,reagent:''}]} : ({coStained:'unspecified',activeId:null,assignments:[{id:'primary',marker:'',channel:'red',reagent:''}]}));
    setMinThreshold(Math.round(minimum * thresholdMax / 255));
    setMaxThreshold(Math.round(maximum * thresholdMax / 255));
    invalidateAnalysis();
  };

  const changeStainingPanel = (next: StainingPanel) => {
    setStainingPanel(next);
    const selected = activeAssignment(next, image?.channelCount ?? 3);
    if (selected) {
      setStain(`${selected.marker.trim()} (IF)`);
      setSignalChannel(selected.channel);
    }
    invalidateAnalysis();
  };

  const chooseStructure = (value: string) => {
    onPointerCancel();
    setStructure(value);
    setRois([]);
    setDrawing(value !== 'Whole tissue');
    invalidateAnalysis();
  };

  const chooseDisplayChannel = (channel: DisplayChannel) => {
    if (channel !== 'composite') {
      setSignalChannel(channel);
      const assigned = stainingPanel.assignments.filter((item) => item.channel === channel && item.marker.trim());
      if (stain.includes('(IF)') && assigned.length === 1) {
        setStain(`${assigned[0].marker.trim()} (IF)`);
        setStainingPanel((current) => ({ ...current, activeId: assigned[0].id }));
      } else {
        if (stain.includes('(IF)') && channel !== signalChannel) setStain('Channel intensity (IF)');
        setStainingPanel((current) => ({ ...current, activeId: null }));
      }
      if (channelRecords.length) setAnalysisRecord(channelRecords.find(record => record.analysis.signalChannel === channel) ?? null);
      else invalidateAnalysis();
    }
  };

  const updateChannelSettings = (channel: SignalChannel, next: ChannelSettings, displayOnly = false) => {
    setChannelSettings((current) => ({ ...current, [channelSettingsKey(stain, channel)]: next }));
    if (displayOnly) {
      if (channel === signalChannel) setBrightness(next.brightness);
      return;
    }
    if (channel !== 'grayscale') chooseDisplayChannel(channel);
    else { setSignalChannel(channel); invalidateAnalysis(); }
    invalidateAnalysis();
    setMinThreshold(next.minimum); setMaxThreshold(next.maximum); setBrightness(next.brightness);

  };

  const toggleDrawing = () => {
    if (drawing) onPointerCancel();
    setDrawing(!drawing);
  };

  const currentSettings = () => Object.fromEntries((image?.channelCount===1 ? ['grayscale'] as const : profile==='sirius-magenta' ? ['red'] as const : image?.channelCount===2 ? ['red','green'] as const : ['red','green','blue'] as const).map(channel=>[channelSettingsKey(stain,channel), channel===signalChannel ? {...channelSettings[channelSettingsKey(stain,channel)],minimum:minThreshold,maximum:maxThreshold,brightness} : channelSettings[channelSettingsKey(stain,channel)]??suggestions[channel]]));
  const saveReference = () => {
    if(!image || accepted) return;
    const settings=currentSettings();
    try {
      const next=[...references.filter(r=>r.id!==image.sourceSha256+sourceName),{id:image.sourceSha256+sourceName,name:`${studySample || sampleId} / ${sourceName}`,settings,conversion:image.conversionRanges,rois:structuredClone(rois),regionCategory:structure}];
      averageThresholds(next,profile==='sirius-magenta');referenceDefaultsRef.current=Object.fromEntries(Object.entries(settings).map(([key,v])=>[key,{minimum:v.minimum,maximum:v.maximum,brightness:1}]));setReferences(next);setMessage(`Saved reference ${next.length}: ${sourceName}`);
    } catch(cause) {setError(errorMessage(cause,'Reference could not be saved.'));}
  };
  const acceptThresholds = () => {
    try {const next=averageThresholds(references,profile==='sirius-magenta');setAccepted(next);acceptedRef.current=next;setChannelSettings(next);setStudyTiles([]);invalidateAnalysis();setMessage('Shared thresholds accepted. Analyze each tile or run the folder.');}
    catch(cause){setError(errorMessage(cause,'Thresholds could not be accepted.'));}
  };
  const finishSample=()=>{setProjectTiles(current=>[...current,...studyTiles]);setProjectReferences(current=>[...current,...references]);setStudySample('');setFolderFiles([]);resetStudy();};
  const resetStudy=()=>{referenceDefaultsRef.current=null;setReferences([]);setAccepted(null);acceptedRef.current=null;setStudyTiles([]);invalidateAnalysis();};
  const analyzeFolder = async () => {
    if(!accepted || !folderFiles.length || structure!=='Whole tissue' || rois.length) return;
    setBatchBusy(true);setLoading(true);batchCancel.current=false;setError('');
    const failures:string[]=[];
    try {
      for(let index=0;index<folderFiles.length;index++) {
        if(batchCancel.current) break;
        const file=folderFiles[index],name=file.webkitRelativePath||file.name;
        setMessage(`Analyzing tile ${index+1}/${folderFiles.length}: ${name}`);
        await new Promise(resolve=>setTimeout(resolve,0));
        try {
          const raw=await loadMicroscopyFile(file,new AbortController().signal);
          const reference=references.find(r=>r.id===raw.sourceSha256+name);
          const decoded=prepareMacroImage(raw,profile==='sirius-magenta',reference?.conversion as ConversionRange[]|undefined);
          const channel=profile==='sirius-magenta'?'red':decoded.channelCount===1?'grayscale':'red';
          const shared=accepted[channelSettingsKey(stain,channel)];
          const required=profile==='sirius-magenta'?['red']:decoded.channelCount===1?['grayscale']:decoded.channelCount===2?['red','green']:['red','green','blue'];
          if(!shared || required.some(c=>!accepted[channelSettingsKey(stain,c as SignalChannel)])) throw new Error('Channel set differs from reference tiles.');
          const settings:AnalysisSettingsSnapshot={stain,stainingPanel,signalChannel:channel,minThreshold:shared.minimum,maxThreshold:shared.maximum,structure,rois:[],removeBackground,backgroundTolerance,outsideMode};
          const records=analyzeChannels(decoded,settings,accepted,{analyst:userName,sampleId:studySample.trim()||sampleId,sourceName:name,sourceSize:file.size,sourceLastModified:file.lastModified});
          const entry:StudyTile={id:decoded.sourceSha256+name,name,records,screenshots:captureChannels(decoded,accepted,settings),displaySettings:structuredClone(accepted),reference:references.some(r=>r.id===decoded.sourceSha256+name)};
          setStudyTiles(current=>[...current.filter(r=>r.id!==entry.id),entry]);
        } catch(cause) {failures.push(`${name}: ${errorMessage(cause,'Failed')}`);}
      }
      setMessage(batchCancel.current?'Folder run stopped; completed tiles retained.':'Folder run complete. Review and export the sample workbook.');
      if(failures.length)setError(`Skipped ${failures.length} tile(s): ${failures.join('; ')}`);
    } finally {setBatchBusy(false);setLoading(false);}
  };
  const saveScreenshot=()=>{
    if(!image)return;
    const screenshots=captureChannels(image,currentSettings(),{...previewOptions,rois});
    const link=document.createElement('a');link.href=screenshots.all;link.download=`${safeExportName(sampleId)}_four_channels.png`;link.click();
  };

  const exportCsv = () => {
    if (!analysisRecord) return;
    downloadText(
      analysisRecordToCsv(analysisRecord),
      'text/csv;charset=utf-8',
      `${safeExportName(analysisRecord.sampleId)}_quantification.csv`,
    );
  };

  const exportJson = () => {
    if (!analysisRecord) return;
    downloadText(
      `${JSON.stringify(channelRecords, null, 2)}\n`,
      'application/json;charset=utf-8',
      `${safeExportName(analysisRecord.sampleId)}_quantification.json`,
    );
  };

  const exportExcel = async () => {
    if (!channelRecords.length && !studyTiles.length && !projectTiles.length) return;
    const snapshot = channelRecords.length ? channelRecords : (studyTiles[0]??projectTiles[0]).records;
    setExporting(true);
    try {
      const { channelWorkbook } = await import('./lib/workbook-export');
      const collected=[...projectTiles,...studyTiles];
      const exportedTiles=collected.length?collected:image?[{id:image.sourceSha256+sourceName,name:sourceName,records:snapshot,screenshots:captureChannels(image,currentSettings(),{...previewOptions,rois}),displaySettings:currentSettings(),reference:false}]:[];
      const bytes = await channelWorkbook(snapshot, exportedTiles, [...projectReferences,...references], accepted);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url; link.download = `${safeExportName(snapshot[0].sampleId)}_staining_study.xlsx`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(errorMessage(cause, 'The workbook could not be exported.')); }
    finally { setExporting(false); }
  };
  const signalChannels = availableSignalChannels(image);
  const channelMappingDisclosure = image?.channelMapping
    ? `${image.channelMapping.method === 'nd2-color-metadata' ? 'ND2 channel colors' : 'Unverified source-order colors'}: ${image.channelMapping.sourceIndices.map((index, slot) => `source ${index + 1} (${image.channelMapping!.sourceNames[slot] || 'unnamed'}) → ${image.channelCount === 1 ? 'grayscale' : ['Red', 'Green', 'Blue'][slot]}`).join('; ')}.`
    : image?.sourceFormat === 'ND2'
    ? 'Channel colors are unverified. Update and restart the Python companion, then reopen this ND2 to read its channel mapping.'
    : image?.channelCount === 2
    ? 'Two source channels mapped: channel 1 → display R and channel 2 → display G. No Blue source channel is present.'
    : image?.channelCount === 1
      ? 'One source channel is rendered as a grayscale composite.'
      : '';

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark" aria-hidden="true"><span /></span><div><p>KidneyQuant</p><span>stain analysis workbench</span></div></div>
        <div className="privacy-state"><i /> {image ? `Source processing: ${image.processingLocation === 'browser' ? 'this browser' : 'private companion'}` : 'Source processing location pending'}</div>
        <div className="profile" title={userName}>{initials}</div>
      </header>

      <section className="workspace-heading">
        <div><p className="eyebrow">New analysis</p><h1>Turn stained tissue into auditable measurements.</h1><p className="lede">Upload a microscopy image, separate tissue from slide background, select any structure-specific regions, then review every counted pixel.</p></div>
        <div className="format-badges"><span>TIFF</span><span>JP2</span><span>ND2 self-host</span><span>Folders</span></div>
      </section>

      <section className="workbench-grid">
        <aside className="control-panel">{batchBusy && <button type="button" onClick={()=>{batchCancel.current=true;}}>Stop after current tile</button>}<fieldset disabled={batchBusy} className="study-disabled">
          <div className="panel-title"><span>01</span><div><h2>Set up analysis</h2><p>Sample and staining details</p></div></div>
          <label className="field-label" htmlFor="sample-id">Sample ID <b>required</b></label>
          <input id="sample-id" className="text-input" value={sampleId} onChange={(event) => { setSampleId(event.target.value); invalidateAnalysis(); }} />

          <label className="field-label" htmlFor="stain">Staining</label>
          <select id="stain" disabled={references.length>0||studyTiles.length>0} className="select-input" value={stain} onChange={(event) => chooseStain(event.target.value)}>{(STAIN_OPTIONS.includes(stain) ? STAIN_OPTIONS : [...STAIN_OPTIONS, stain]).map((option) => <option key={option}>{option}</option>)}</select>

          {stain.includes('(IF)') && <><label className="field-label" htmlFor="signal-channel">Positive signal channel</label><select id="signal-channel" className="select-input" value={signalChannel} onChange={(event) => { setSignalChannel(event.target.value as SignalChannel); setStainingPanel((current) => ({ ...current, activeId: null })); invalidateAnalysis(); }}>{signalChannels.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></>}

          <StainingPanelControls panel={stainingPanel} channelCount={image?.channelCount ?? 3} disabled={loading||references.length>0||studyTiles.length>0} onChange={changeStainingPanel} />

          <section className="study-controls">
            <h3>Sample folder workflow</h3>
            <label className="field-label" htmlFor="study-sample">Sample name for workbook</label>
            <input id="study-sample" className="text-input" value={studySample} disabled={references.length>0 || studyTiles.length>0} onChange={e=>setStudySample(e.target.value)} placeholder="e.g. K929" />
            <p className="validation-note">Open one sample folder. Review approximately 10 reference tiles; save each chosen minimum with the same maximum. Then accept their average and quantify the full set.</p>
            <button type="button" className="export-button" disabled={!image||loading||!!accepted} onClick={saveReference}>Save reference tile ({references.length})</button>
            {references.length>0 && <details><summary>Review reference thresholds</summary>{references.map(r=><div key={r.id} className="reference-row"><strong>{r.name}</strong>{Object.entries(r.settings).map(([key,v])=><div key={key}>{key.split(':').pop()}: {v.minimum}–{v.maximum}</div>)}<button disabled={!!accepted} type="button" onClick={()=>setReferences(current=>current.filter(item=>item.id!==r.id))}>Remove</button></div>)}</details>}
            {references.length>0 && <div className="validation-note">{Object.entries(averageThresholds(references,profile==='sirius-magenta')).map(([key,v])=><div key={key}>{key.split(':').pop()}: mean {v.average.toFixed(4)} → applied {v.minimum}; max {v.maximum}</div>)}</div>}
            <button type="button" className="export-button" disabled={!references.length||!!accepted||loading} onClick={acceptThresholds}>{accepted?'Shared thresholds locked':'Accept average thresholds'}</button>
            <button type="button" className="export-button" disabled={!accepted||!folderFiles.length||loading||structure!=='Whole tissue'||!!rois.length} onClick={analyzeFolder}>Quantify folder ({folderFiles.length} tiles)</button>
            <p className="validation-note">For glomeruli or manual tissue crops: outline each tile, then Analyze all channels to save it. Folder automation is for whole images only; outlines are never copied to another tile.</p>
            <p className="validation-note">Results are kept in this browser session. Export before closing or refreshing the page.</p><p>{studyTiles.length} tiles saved for this sample · {projectTiles.length} tiles in completed samples</p><button type="button" className="export-button" disabled={!studyTiles.length||loading} onClick={finishSample}>Finish sample / start next</button>
            <details><summary>Saved tiles</summary>{studyTiles.map(tile=><div className="reference-row" key={tile.id}>{tile.name}<button type="button" onClick={()=>setStudyTiles(current=>current.filter(t=>t.id!==tile.id))}>Remove result</button></div>)}</details>
            <button type="button" className="stain-action" disabled={loading} onClick={resetStudy}>Start new threshold study / clear results</button>
          </section>
          {image && rawImage?.samples && rawImage.analysisBitDepth!==8 && <details className="conversion-settings"><summary>8-bit conversion settings</summary><p className="validation-note">Conversion happens before appearance adjustments. Default: each source channel’s full-image minimum and maximum. Fiji’s importer may choose a different initial range; enter that range here for a controlled comparison. Changing it clears this threshold study. Source pixels are retained.</p>{image.conversionRanges?.map((range,i)=><div key={i}><strong>{['Red','Green','Blue'][i]}</strong>{(['minimum','maximum'] as const).map(field=><label key={field}>{field}<NumberField id={`conversion-${i}-${field}`} label={`Conversion channel ${i+1} ${field}`} value={range[field]} min={field==='maximum'?range.minimum:0} max={field==='minimum'?range.maximum:65535} onCommit={value=>{const next=image.conversionRanges!.map(r=>({...r}));next[i][field]=Math.max(field==='maximum'?range.minimum:0,Math.min(field==='minimum'?range.maximum:65535,Number(value)));resetStudy();setConversionOverrides(next);setChannelSettings({});}} /></label>)}</div>)}</details>}

          <label className="field-label" htmlFor="roi-category">ROI category</label>
          <select id="roi-category" className="select-input" value={structure} onChange={(event) => chooseStructure(event.target.value)}>{STRUCTURE_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select>
          <p className="validation-note">Circle each glomerulus or outline tissue to keep. Only pixels inside the outlines are measured; overlapping outlines count once. With no outline, Whole tissue uses the full image unless slide-background removal is enabled.</p>

          {<>
            <label className="field-label" htmlFor="draw-shape">Outline tool</label><select id="draw-shape" value={drawShape} onChange={e=>setDrawShape(e.target.value as 'freehand'|'rectangle')} className="select-input"><option value="freehand">Freehand — circle tissue / glomeruli</option><option value="rectangle">Rectangle crop</option></select><div className="roi-controls">
              <button type="button" disabled={!image} onClick={addCentralRoi}>Add region</button>
              <button type="button" className={drawing ? 'active' : ''} disabled={!image} aria-pressed={drawing} onClick={toggleDrawing}>{drawing ? 'Drawing regions' : 'Draw regions'}</button>
              <button type="button" disabled={!rois.length} onClick={() => { setRois([]); invalidateAnalysis(); }}>Clear ({rois.length})</button>
            </div>
            {rois.length>0 && <RoiEditor rois={rois} onUpdate={updateRoi} onDelete={deleteRoi}/>}
          </>}

          <div className="switch-row"><div><strong>Remove slide background</strong><span>Border-connected source-RGB distance mask</span></div><button type="button" className={`toggle ${removeBackground ? 'active' : ''}`} aria-label="Remove slide background" aria-pressed={removeBackground} onClick={() => { setRemoveBackground((current) => !current); invalidateAnalysis(); }}><i /></button></div>

          {removeBackground && <><label className="field-label compact" htmlFor="outside-mode">Outside-tissue handling</label><select id="outside-mode" className="select-input" value={outsideMode} onChange={(event) => { setOutsideMode(event.target.value as OutsideMode); invalidateAnalysis(); }}><option value="exclude">Exclude from calculations</option><option value="report">Exclude and report separately</option></select><label className="field-label compact" htmlFor="background-tolerance">Background tolerance <span>{backgroundTolerance}</span></label><input id="background-tolerance" className="single-range" type="range" min="4" max="60" value={backgroundTolerance} onChange={(event) => { setBackgroundTolerance(Number(event.target.value)); invalidateAnalysis(); }} /></>}

          <div className="channel-settings-group">
            <h3>Channel brightness &amp; thresholds</h3>
            <p className="validation-note">Fluorescence thresholds use the converted 8-bit copy (0–255). Sirius Red uses one magenta-score threshold (0–1) in the Red control group. Appearance changes after conversion do not change counts.</p>
            {(image?.channelCount === 1 ? ['grayscale'] as const : ['red', 'green', 'blue'] as const).map((channel) =>
              <ChannelControls key={channel} channel={channel} limit={profile==='sirius-magenta' ? 1 : thresholdMax} locked={!!accepted || (profile==='sirius-magenta' && channel!=='red')}
                settings={channel === signalChannel ? { ...channelSettings[channelSettingsKey(stain, channel)], minimum: minThreshold, maximum: maxThreshold, brightness } : channelSettings[channelSettingsKey(stain, channel)] ?? suggestions[channel]}
                active={signalChannel === channel} disabled={!image || loading || !availableSignalChannels(image).some((item) => item.value === channel)}
                markerLabel={stainingPanel.assignments.filter((item) => item.channel === channel && item.marker.trim()).map((item) => item.marker).join(' + ')}
                onSelect={() => { if (channel !== 'grayscale') chooseDisplayChannel(channel); }}
                displayMaximum={ranges[channel === 'grayscale' ? 0 : { red: 0, green: 1, blue: 2 }[channel]]}
                onDisplayChange={(next) => updateChannelSettings(channel, next, true)}
                onChange={(next) => updateChannelSettings(channel, next)}
                onAuto={() => updateChannelSettings(channel, suggestions[channel])} />)}
            <p className="validation-note">Display min/max control contrast without changing measurements. Detection thresholds select pixels to count; press Enter or leave a number field to apply. Auto resets display and suggests a starting threshold. Accepted study thresholds stay locked. Manual fluorescence settings remain saved per color until another image is opened.</p>
          </div>
          <p className="validation-note">{profile==='sirius-magenta' ? 'Sirius Red score = (max(R,G,B) − G) / max(R,G,B), range 0–1. The maximum 1 includes every finite magenta score.' : 'Detection thresholds operate on the 8-bit analysis copy, independently of later appearance adjustments.'}</p>

          <button type="button" className="primary-button" disabled={!image || loading || !sampleId.trim()} onClick={() => runAnalysis()}>{loading ? 'Working…' : accepted ? 'Analyze all channels · save tile' : 'Analyze all channels'} <span>→</span></button>
          <p className="validation-note">Research-use workflow. Thresholds and ROI regions must be reviewed before statistical analysis.</p>
        </fieldset></aside>

        <section className="image-stage" aria-busy={loading}>
          <div className="stage-toolbar">
            <div className="file-chip" title={sourceName}><i /> {sourceName} <span>{formatBytes(sourceSize)}</span></div>
            {folderFiles.length > 1 && <div className="folder-nav" aria-label="Folder image navigation"><button type="button" aria-label="Previous file" disabled={loading || folderIndex === 0} onClick={() => openFolderFile(folderIndex - 1)}>‹</button><span>{folderIndex + 1} / {folderFiles.length}</span><button type="button" aria-label="Next file" disabled={loading || folderIndex === folderFiles.length - 1} onClick={() => openFolderFile(folderIndex + 1)}>›</button></div>}
            <button type="button" className="replace-button" disabled={!image||loading} onClick={saveScreenshot}>Save 4-channel PNG</button><div className="view-tabs" aria-label="Image view"><button type="button" aria-pressed={view==='overlay'} onClick={()=>setView(view==='original'?'overlay':'original')}>{view==='overlay'?'Hide counted pixels':'Show counted pixels'}</button></div>
            <div className="open-actions"><button className="replace-button" type="button" onClick={() => fileInput.current?.click()}>Open file</button><button className="replace-button" type="button" onClick={() => folderInput.current?.click()}>Open folder</button></div>
            <input ref={fileInput} type="file" multiple accept=".nd2,.tif,.tiff,.jp2,.j2k,.jpx" hidden onChange={onFileChange} />
            <input ref={folderInput} type="file" accept=".nd2,.tif,.tiff,.jp2,.j2k,.jpx" multiple hidden onChange={onFolderChange} {...{ webkitdirectory: '', directory: '' }} />
          </div>

          {image && channelMappingDisclosure && <p className="live-preview-note">{channelMappingDisclosure}</p>}

          <div className={`image-canvas ${draggingFile ? 'dragging' : ''} ${drawing ? 'drawing' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDraggingFile(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDraggingFile(false)} onDrop={onDrop}>
            {image && previewImage && <div className="channel-grid">
              <div className="channel-tile"><div className="tile-title">{view === 'original' ? 'Composite' : 'Composite / detection'}</div><div className="channel-image"><canvas ref={canvasRef} aria-label="Microscopy image analysis preview" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} /></div><small>{view === 'original' ? 'Composite image' : `Live ${signalChannel} threshold ${view}`}</small></div>
              {(['red', 'green', 'blue'] as const).map((channel) => <ChannelTile key={channel} image={previewImage} channel={channel} ranges={ranges} options={previewOptions} view={view}
                settings={channel === signalChannel ? { ...channelSettings[channelSettingsKey(stain, channel)], minimum: minThreshold, maximum: maxThreshold, brightness } : channelSettings[channelSettingsKey(stain, channel)] ?? suggestions[channel]}
                active={signalChannel === channel} onSelect={() => chooseDisplayChannel(channel)}
                disabled={loading}
                markerLabel={stainingPanel.assignments.filter((item) => item.channel === channel && item.marker.trim()).map((item) => item.marker).join(' + ')}
                />)}
            </div>}
            {!image && <div className="empty-canvas"><strong>No image open</strong><span>Choose a TIFF, JP2, ND2 file, or folder.</span></div>}
            {(draggingFile || !image) && <button type="button" className="central-dropzone" disabled={loading} onClick={() => fileInput.current?.click()}><strong>Drop ND2, TIFF, or JP2</strong><span>or choose a file</span></button>}

            {drawing && <div className="drawing-hint">Draw around tissue or a glomerulus on the composite; release to close the outline</div>}
            {view !== 'original' && <div className="legend"><span><i className="positive" /> Positive stain</span><span><i className="structure" /> Selected region</span><span><i className="excluded" /> Excluded</span></div>}
          </div>

          <div className={`analysis-message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'}><i>{error ? '!' : loading ? '…' : analysisRecord ? '✓' : 'i'}</i><span>{error || message}</span></div>
          <p className="live-preview-note">Live preview uses a smaller image for responsiveness. Click Analyze all channels for full-resolution measurements and exports. Draw tissue or glomerular outlines on the composite view.</p>
          <details className="image-details"><summary>Image details</summary><div className="stage-caption">
            <span>{image ? `${image.width.toLocaleString()} × ${image.height.toLocaleString()} px` : '—'}</span>
            <span>{image ? `Source: ${image.sourceFormat}` : '—'}</span>
            <span>{image ? `Source bit depth: ${image.bitDepth}-bit` : '—'}</span>
            <span>{image ? `Original shape: ${image.originalShape}` : '—'}</span>
            <span>{image ? `Original axes: ${image.originalAxes.join(', ')}` : '—'}</span>
            <span>{image ? `Selected shape: ${image.selectedShape}` : '—'}</span>
            <span>{image ? `Selected axes: ${image.selectedAxes.join(', ')}` : '—'}</span>
            <span>{image ? `Plane selection: ${formatPlaneSelection(image.planeSelection)}` : '—'}</span>
            <span>{image ? `Processing: ${image.processing} (${image.processingLocation})` : '—'}</span>
            <span>{removeBackground ? 'Background separation on' : 'Background included'}</span>
          </div></details>
          {image && <p className="validation-note" style={{ padding: '0 15px 12px', margin: 0 }}>
            {image.quantitativeStatus === 'demonstration'
              ? `Bundled ${SYNTHETIC_DEMO_NAME} is procedurally generated synthetic data with no specimen or acquisition. Demonstration only; measurements are experimental and not validated.`
              : 'Experimental quantification only — source processing, stain scoring, and thresholds are not validated.'}
          </p>}
        </section>

        <ResultsPanel records={channelRecords} hasStudy={studyTiles.length+projectTiles.length>0} exporting={exporting} onExcel={exportExcel} onCsv={exportCsv} onJson={exportJson} />
      </section>
    </main>
  );
}
