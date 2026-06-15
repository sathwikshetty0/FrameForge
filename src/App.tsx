import { useReducer, useEffect, useCallback } from 'react';
import type { AppState, AppError, MetadataResult, ScoringResult, UploadError, ElaResult } from './lib/types';
import { loadExifr, parseExifFull } from './lib/exif-parser';
import { analyze } from './lib/detection-engine';
import { analyzePixels } from './lib/pixel-analysis-engine';
import { computeScore } from './lib/scoring';
import { UploadZone } from './components/UploadZone';
import { ForensicReport } from './components/ForensicReport';
import { ReportExporter } from './components/ReportExporter';

// --- Extended State (adds analysisTimestamp and rawExif) ---

interface ExtendedAppState extends AppState {
  analysisTimestamp: Date | null;
  rawExif: Record<string, unknown> | null;
  elaResult: ElaResult | null;
}

// --- Action Types ---

type AppAction =
  | { type: 'FILE_ACCEPTED'; file: File }
  | { type: 'BUFFER_READY'; buffer: ArrayBuffer; thumbnail: string }
  | { type: 'ANALYSIS_COMPLETE'; metadata: MetadataResult; result: ScoringResult; rawExif: Record<string, unknown>; elaResult: ElaResult | null }
  | { type: 'ERROR'; error: AppError }
  | { type: 'RESET' };

// --- Initial State ---

const initialState: ExtendedAppState = {
  pipeline: 'IDLE',
  file: null,
  thumbnail: null,
  metadata: null,
  result: null,
  error: null,
  scanStartTime: null,
  analysisTimestamp: null,
  rawExif: null,
  elaResult: null,
};

// --- Reducer ---

function appReducer(state: ExtendedAppState, action: AppAction): ExtendedAppState {
  switch (action.type) {
    case 'FILE_ACCEPTED':
      // Reset all state, transition to LOADING
      return {
        ...initialState,
        pipeline: 'LOADING',
        file: action.file,
      };

    case 'BUFFER_READY':
      // Transition to SCANNING, record scanStartTime
      return {
        ...state,
        pipeline: 'SCANNING',
        thumbnail: action.thumbnail,
        scanStartTime: Date.now(),
      };

    case 'ANALYSIS_COMPLETE':
      // Transition to COMPLETE, record analysisTimestamp
      return {
        ...state,
        pipeline: 'COMPLETE',
        metadata: action.metadata,
        result: action.result,
        rawExif: action.rawExif,
        elaResult: action.elaResult,
        analysisTimestamp: new Date(),
      };

    case 'ERROR':
      // Transition to ERROR from any state
      return {
        ...state,
        pipeline: 'ERROR',
        error: action.error,
      };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// --- App Component ---

function App() {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Pre-load exifr library on mount
  useEffect(() => {
    loadExifr().catch(() => {
      dispatch({
        type: 'ERROR',
        error: {
          phase: 'library',
          message: 'EXIF parsing library could not be loaded. Analysis unavailable.',
        },
      });
    });
  }, []);

  // Handle file acceptance from UploadZone
  const handleFileAccepted = useCallback((file: File) => {
    dispatch({ type: 'FILE_ACCEPTED', file });

    // Read the file as ArrayBuffer and generate thumbnail
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      const thumbnail = URL.createObjectURL(file);
      dispatch({ type: 'BUFFER_READY', buffer, thumbnail });

      // Start the analysis pipeline
      const scanStart = Date.now();
      runAnalysis(buffer, file.size, file.name, scanStart);
    };
    reader.onerror = () => {
      dispatch({
        type: 'ERROR',
        error: {
          phase: 'parse',
          message: 'Failed to read the image file.',
        },
      });
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // Draw image buffer to a temporary canvas to obtain ImageData
  async function getImageData(buffer: ArrayBuffer): Promise<ImageData | null> {
    try {
      const blob = new Blob([buffer]);
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0);
      return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    } catch {
      return null;
    }
  }

  // Run the parse → detect → score pipeline
  async function runAnalysis(buffer: ArrayBuffer, fileSize: number, filename: string, scanStart: number) {
    try {
      const { metadata, rawExif } = await parseExifFull(buffer);

      // Obtain ImageData from a temporary canvas for pixel-level analysis
      const imageData = await getImageData(buffer);

      // Run pixel analysis separately to get elaResult
      let elaResult: ElaResult | null = null;
      let pixelSignal: import('./lib/types').DetectionSignal | null = null;
      if (imageData) {
        const pixelResult = await analyzePixels({ imageData });
        elaResult = pixelResult.ela;
        pixelSignal = pixelResult.signal;
      }

      // Call analyze without imageData (to avoid double-computing pixel analysis)
      // but with fileBuffer and filename for PNG metadata and filename detection
      const signals = await analyze(metadata, fileSize, null, buffer, filename);

      // Combine signals: detection engine signals + pixel analysis signal
      const allSignals = pixelSignal ? [...signals, pixelSignal] : signals;

      const result = computeScore(allSignals, metadata);

      // Enforce minimum 500ms animation time
      const elapsed = Date.now() - scanStart;
      const remaining = Math.max(0, 500 - elapsed);

      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }

      dispatch({ type: 'ANALYSIS_COMPLETE', metadata, result, rawExif, elaResult });
    } catch (error) {
      dispatch({
        type: 'ERROR',
        error: {
          phase: 'detect',
          message: error instanceof Error ? error.message : 'Analysis error. Please try again.',
        },
      });
    }
  }

  // Handle upload errors from UploadZone
  const handleUploadError = useCallback((error: UploadError) => {
    dispatch({
      type: 'ERROR',
      error: {
        phase: 'upload',
        message: error.message,
      },
    });
  }, []);

  return (
    <div style={appStyles.container}>
      <h1 style={appStyles.title}>FrameForge Verify</h1>

      {state.pipeline === 'ERROR' && state.error && (
        <div role="alert" style={appStyles.errorBanner}>{state.error.message}</div>
      )}

      <UploadZone
        onFileAccepted={handleFileAccepted}
        onError={handleUploadError}
        isProcessing={state.pipeline === 'LOADING' || state.pipeline === 'SCANNING'}
      />

      <ForensicReport
        state={state.pipeline}
        metadata={state.metadata}
        result={state.result}
        thumbnail={state.thumbnail}
        rawExif={state.rawExif}
        elaResult={state.elaResult}
      />

      <ReportExporter
        metadata={state.metadata}
        result={state.result}
        fileName={state.file?.name ?? null}
        analysisTimestamp={state.analysisTimestamp}
        isComplete={state.pipeline === 'COMPLETE'}
      />
    </div>
  );
}

const appStyles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  title: {
    margin: 0,
    fontSize: '1.5rem',
    fontWeight: 700,
  },
  errorBanner: {
    padding: '12px 16px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid #ef4444',
    borderRadius: '6px',
    color: '#ef4444',
    fontSize: '14px',
  },
};

export default App;
