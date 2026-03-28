# Design Document: Grainframe UI

## Overview

The Grainframe UI layer is a React PWA that connects the existing `/src/pipeline/` image processing engine to user interaction. It is structured as four layers:

1. **Utils** (`/src/utils/`) — pure functions for errors, memory, image loading, EXIF, and export
2. **Hooks** (`/src/hooks/`) — React hooks that manage state, worker lifecycle, and camera inputs
3. **Components** (`/src/components/`) — presentational React components
4. **App** (`/src/App.jsx`) — root composition, global state, and theme

The pipeline (`/src/pipeline/`) is already implemented and is treated as a black box. The UI layer only interacts with it via `createPipelineWorker()` from `bridge.js`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  App.jsx                                                │
│  state: { error }                                       │
│  preset = classicChrome (static import)                 │
│                                                         │
│  ┌──────────────┐  ┌──────────────────────┐  ┌───────┐ │
│  │  CameraView  │  │     ExportButton     │  │Error  │ │
│  │  captureRef  │  │  fullImageData ──────┼──┤Banner │ │
│  │  importRef   │  │  processExport ──────┘  └───────┘ │
│  │  handleFile  │  │  preset              │            │
│  │  preview     │  └──────────────────────┘            │
│  │  isProcessing│                                      │
│  └──────┬───────┘                                      │
│         │                                              │
│  ┌──────▼────────────────────────────────────────────┐ │
│  │  useCamera()          useImagePipeline()          │ │
│  │  returns captureRef,  returns preview,            │ │
│  │  importRef,           isProcessing,               │ │
│  │  handleFileChange,    processPreview,             │ │
│  │  previewImageData,    processExport               │ │
│  │  fullImageData        useWorker(factory)          │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  utils/errors  utils/memory  utils/image         │   │
│  │  utils/exif    utils/export                      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  /src/pipeline/ (already implemented)            │   │
│  │  bridge.js → worker.js → index.js                │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Explicit prop flow:**
- `App` passes `fullImageData` and `processExport` down to `ExportButton`
- `App` passes `captureRef`, `importRef`, `handleFileChange`, `preview`, and `isProcessing` down to `CameraView`
- `App` passes `error` and `onRetry` down to `ErrorBanner`

---

## Data Flow

```
User taps capture/import
        │
        ▼
useCamera: <input type="file"> change event
        │
        ▼
Image_Util.loadImage(blob)          ← createImageBitmap, imageOrientation:'none'
        │
        ▼
EXIF_Util.readOrientation(blob)     ← parse JPEG EXIF bytes
EXIF_Util.applyOrientation(bitmap)  ← rotate canvas if browser doesn't auto-rotate
        │
        ▼
Image_Util.resizeToMax(imageData, 1024)      → previewImageData
Image_Util.resizeToMax(imageData, ceiling)   → fullImageData
        │
        ▼
App: auto-invoke processPreview(previewImageData, preset)
        │
        ▼
useImagePipeline: clone imageData → postMessage to Pipeline_Worker (transferable)
        │
        ▼
Pipeline_Worker: processImage(imageData, preset) → postMessage result back
        │
        ▼
useImagePipeline: update preview state
        │
        ▼
CameraView: draw processed ImageData to canvas with 200ms cross-fade
        │
        ▼
User taps Export
        │
        ▼
ExportButton: processExport(fullImageData, preset) → canvas.toBlob(quality=0.92)
        │
        ▼
Export_Util.exportImage(blob, filename)
        │
        ├─ navigator.canShare → navigator.share(File)   [iOS]
        └─ <a download> + revokeObjectURL               [fallback]
```


---

## State Management

### App-level state

```js
// App.jsx
const [error, setError] = useState(null);          // active AppError | null
const preset = classicChrome;                       // static import, no switching UI
```

App owns `error` because ErrorBanner is a sibling of CameraView and ExportButton. Errors from any hook bubble up via callbacks passed down as props.

### useCamera state

```js
// internal to useCamera
const [previewImageData, setPreviewImageData] = useState(null);
const [fullImageData, setFullImageData] = useState(null);
const [error, setCameraError] = useState(null);
```

Returns `{ captureRef, importRef, handleFileChange, triggerCapture, triggerImport, previewImageData, fullImageData, error }`. The hook owns the two `<input>` refs and the loaded image state. CameraView renders the hidden inputs and attaches the refs and handler.

### useImagePipeline state

```js
// internal to useImagePipeline
const [preview, setPreview] = useState(null);      // processed ImageData
const [isProcessing, setIsProcessing] = useState(false);
const [error, setPipelineError] = useState(null);
```

Returns `{ preview, isProcessing, error, processPreview, processExport }`.

### Error bubbling

Each hook exposes its own `error` field. App reads them and merges into a single active error for ErrorBanner:

```js
const activeError = cameraError || pipelineError || exportError;
```

The "Try Again" button in ErrorBanner calls a `onRetry` callback passed from App, which clears the relevant error state.

---

## Module Interfaces

### `/src/utils/errors.js`

```js
export const ErrorTypes = {
  IMAGE_LOAD_FAILED: {
    message: 'Could not load the image. Please try a different file.',
    recoverable: true,
  },
  IMAGE_TOO_LARGE: {
    message: 'This image is too large to process on this device.',
    recoverable: false,
  },
  PROCESSING_FAILED: {
    message: 'Processing failed. Please try again.',
    recoverable: true,
  },
  EXPORT_FAILED: {
    message: 'Export failed. Please try again.',
    recoverable: true,
  },
};
```

No functions — pure data. Consumers import the specific error type they need.

---

### `/src/utils/memory.js`

```js
/**
 * Returns the maximum image dimension for the current platform.
 * @returns {number} 3000 on iOS, 4000 elsewhere
 */
export function getMaxDimension(): number

/**
 * Downscale an ImageData by a factor.
 * Uses an OffscreenCanvas (or regular canvas fallback) to draw and read back.
 * @param {ImageData} imageData
 * @param {number} factor  e.g. 0.5 to halve both dimensions
 * @returns {ImageData}
 */
export function downscale(imageData, factor): ImageData
```

iOS detection:
```js
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}
```

`downscale` implementation: create a canvas at `floor(w*factor) × floor(h*factor)`, draw the source ImageData onto it via `putImageData` on a temp canvas then `drawImage`, return `ctx.getImageData(0,0,w,h)`.

---

### `/src/utils/image.js`

```js
/**
 * Load a Blob into an ImageBitmap.
 * Attempts createImageBitmap with { imageOrientation: 'none' } first.
 * Falls back to createImageBitmap without options if that throws.
 * @param {Blob} blob
 * @returns {Promise<ImageBitmap>}
 */
export async function loadImage(blob): Promise<ImageBitmap>

/**
 * Scale an ImageData proportionally so neither dimension exceeds maxDimension.
 * Returns the original ImageData unchanged if already within bounds.
 * @param {ImageData} imageData
 * @param {number} maxDimension
 * @returns {ImageData}
 */
export function resizeToMax(imageData, maxDimension): ImageData
```

`resizeToMax` implementation: compute `scale = maxDimension / Math.max(w, h)`. If `scale >= 1` return input unchanged. Otherwise create canvas at `floor(w*scale) × floor(h*scale)`, draw source, return `getImageData`.

`loadImage` → `ImageBitmap` (not `ImageData`). The caller (useCamera) draws the bitmap to a canvas to get `ImageData`.


---

### `/src/utils/exif.js`

```js
/**
 * Read the EXIF orientation tag from a JPEG Blob.
 * Reads only the first ~64KB of the blob (enough for EXIF header).
 * Returns 1 (normal) if no EXIF data found or not a JPEG.
 * @param {Blob} blob
 * @returns {Promise<number>}  EXIF orientation value 1–8
 */
export async function readOrientation(blob): Promise<number>

/**
 * Apply canvas rotation/flip to correct for EXIF orientation.
 * Only called when the browser does NOT auto-apply EXIF orientation.
 * @param {ImageBitmap} bitmap
 * @param {number} orientation  EXIF orientation value 1–8
 * @returns {ImageData}
 */
export function applyOrientation(bitmap, orientation): ImageData

/**
 * Detect at startup whether the browser auto-applies EXIF orientation
 * when createImageBitmap is called. Result is cached for the session.
 * @returns {Promise<boolean>}
 */
export async function detectAutoRotation(): Promise<boolean>
```

#### EXIF parsing approach

JPEG EXIF is in the APP1 marker (`0xFFE1`). The algorithm:
1. Read first 64KB of blob as `ArrayBuffer`
2. Scan for `0xFFE1` marker
3. Verify `Exif\0\0` signature at offset +4
4. Parse TIFF header to determine byte order (little/big endian)
5. Walk IFD0 entries looking for tag `0x0112` (Orientation)
6. Return the value (1–8), default 1 if not found

#### Auto-rotation detection

At module load time (lazy, on first call), create a minimal 1×1 JPEG with orientation=6 (90° CW) embedded in EXIF. Call `createImageBitmap` on it. If the resulting bitmap has `width=1, height=1` the browser auto-rotated (swapped dimensions). Cache the boolean result in a module-level variable.

```js
let _autoRotates = null; // null = not yet detected

export async function detectAutoRotation() {
  if (_autoRotates !== null) return _autoRotates;
  // ... create test JPEG, call createImageBitmap, check dimensions
  _autoRotates = result;
  return _autoRotates;
}
```

#### Orientation transform matrix (for applyOrientation)

| Value | Transform |
|-------|-----------|
| 1 | identity |
| 2 | flip horizontal |
| 3 | rotate 180° |
| 4 | flip vertical |
| 5 | rotate 90° CW + flip horizontal |
| 6 | rotate 90° CW |
| 7 | rotate 90° CCW + flip horizontal |
| 8 | rotate 90° CCW |

`applyOrientation` creates a canvas with swapped dimensions for 90°/270° rotations, applies the transform matrix, draws the bitmap, returns `getImageData`.

---

### `/src/utils/export.js`

```js
/**
 * Export a processed image blob.
 * Primary: navigator.share with File (iOS share sheet).
 * Fallback: <a download> with object URL.
 * @param {Blob} blob       JPEG blob at quality 0.92
 * @param {string} filename  e.g. "grainframe-classic-chrome-1718000000000.jpg"
 * @returns {Promise<void>}  Rejects with ErrorTypes.EXPORT_FAILED on failure
 */
export async function exportImage(blob, filename): Promise<void>

/**
 * Generate the export filename.
 * @param {string} presetId   e.g. "classic-chrome"
 * @param {number} [timestamp]  defaults to Date.now()
 * @returns {string}  "grainframe-{presetId}-{timestamp}.jpg"
 */
export function makeFilename(presetId, timestamp = Date.now()): string
```

`exportImage` implementation:
```js
export async function exportImage(blob, filename) {
  const file = new File([blob], filename, { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Grainframe' });
    } catch (err) {
      if (err.name !== 'AbortError') {
        throw ErrorTypes.EXPORT_FAILED;
      }
    }
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
```

Note: `AbortError` means the user dismissed the share sheet — not a failure, so it is swallowed.

---

### `/src/hooks/useWorker.js`

```js
/**
 * Generic Web Worker lifecycle hook.
 * @param {() => Worker} factory  Function that creates the worker
 * @returns {{ worker: Worker|null, error: Error|null }}
 */
export function useWorker(factory)
```

Implementation:
```js
export function useWorker(factory) {
  const [worker, setWorker] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let w;
    try {
      w = factory();
      setWorker(w);
    } catch (err) {
      setError(err);
      return;
    }
    return () => w.terminate();
  }, []);  // factory is stable (passed once)

  return { worker, error };
}
```

If `factory()` throws (e.g. Worker not supported), `worker` is `null` and `error` is set. The caller (`useImagePipeline`) checks for `null` and falls back to main-thread execution.

---

### `/src/hooks/useImagePipeline.js`

```js
/**
 * Manages the pipeline worker lifecycle and exposes process functions.
 * @returns {{
 *   preview: ImageData|null,
 *   isProcessing: boolean,
 *   error: object|null,
 *   processPreview: (imageData: ImageData, preset: object) => Promise<void>,
 *   processExport: (imageData: ImageData, preset: object) => Promise<ImageData>
 * }}
 */
export function useImagePipeline()
```

Key implementation notes:
- Uses `useWorker(createPipelineWorker)` internally
- If `worker` is null (Worker unavailable), `processPreview` and `processExport` fall back to calling `processImage` from `/src/pipeline/index.js` directly on the main thread (static import)
- Before transferring to worker, clone the buffer: `new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height)`
- OOM recovery: catch `RangeError` or errors with "memory"/"allocation" in message, call `downscale(imageData, 0.5)`, retry once, then set `PROCESSING_FAILED`
- **Race condition guard:** use a `requestId` counter ref to discard stale results. Increment before each `processPreview` call; only apply the result if the id still matches when the worker responds
- **State reset:** set `preview` to `null` at the start of each `processPreview` call to prevent showing a stale processed image while the new one is in flight

```js
const requestIdRef = useRef(0);

async function processPreview(imageData, preset) {
  const myId = ++requestIdRef.current;  // increment before async work
  setPreview(null);                     // clear stale preview immediately
  setIsProcessing(true);
  setError(null);
  try {
    const clone = cloneImageData(imageData);
    let result;
    if (worker) {
      result = await worker.process(clone, preset, 'preview');
    } else {
      result = processImage(clone, preset, { mode: 'preview' });
    }
    // Only apply if this is still the latest request
    if (myId !== requestIdRef.current) return;
    setPreview(result);
  } catch (err) {
    if (myId !== requestIdRef.current) return;
    if (isOOMError(err)) {
      // retry at half resolution
      try {
        const smaller = downscale(imageData, 0.5);
        const clone2 = cloneImageData(smaller);
        const result2 = worker
          ? await worker.process(clone2, preset, 'preview')
          : processImage(clone2, preset, { mode: 'preview' });
        if (myId !== requestIdRef.current) return;
        setPreview(result2);
      } catch {
        setError(ErrorTypes.PROCESSING_FAILED);
      }
    } else {
      setError(ErrorTypes.PROCESSING_FAILED);
    }
  } finally {
    if (myId === requestIdRef.current) setIsProcessing(false);
  }
}
```


---

### `/src/hooks/useCamera.js`

```js
/**
 * Manages camera capture and library import.
 * @returns {{
 *   captureRef: React.RefObject,
 *   importRef: React.RefObject,
 *   handleFileChange: (event: Event) => void,
 *   triggerCapture: () => void,
 *   triggerImport: () => void,
 *   previewImageData: ImageData|null,
 *   fullImageData: ImageData|null,
 *   error: object|null
 * }}
 */
export function useCamera()
```

The hook returns `captureRef` and `importRef` so CameraView can attach them to the hidden `<input>` elements it renders. It also returns `handleFileChange` so CameraView can wire the `onChange` handler. Internally:

```js
const captureRef = useRef(null);  // <input capture="environment" accept="image/*">
const importRef  = useRef(null);  // <input accept="image/*">

const triggerCapture = () => captureRef.current?.click();
const triggerImport  = () => importRef.current?.click();
```

**State reset on new file:** When `handleFileChange` fires, immediately set both `previewImageData` and `fullImageData` to `null` before starting the async load. This prevents stale images from showing while the new file loads:

```js
async function handleFileChange(event) {
  const file = event.target.files[0];
  if (!file) return;
  // Reset immediately — don't show stale image
  setPreviewImageData(null);
  setFullImageData(null);
  setError(null);
  try {
    // ... load pipeline
  } catch (err) { ... }
}
```

File processing pipeline on `change` event:
```
file = event.target.files[0]
  → loadImage(file)                          // ImageBitmap
  → detectAutoRotation()                     // cached boolean
  → readOrientation(file)                    // EXIF tag 1–8
  → applyOrientation(bitmap, orientation)    // ImageData (full res)
  → resizeToMax(imageData, 1024)             // previewImageData
  → resizeToMax(imageData, getMaxDimension()) // fullImageData
```

Error handling: wrap entire pipeline in try/catch. `RangeError` or allocation errors → `IMAGE_TOO_LARGE`. Any other error → `IMAGE_LOAD_FAILED`.

---

## Canvas Rendering Strategy

CameraView uses a **single canvas with CSS opacity fade-in** for this spec. The two-canvas cross-fade approach is deferred to Spec 3 when preset switching requires it.

```
┌─────────────────────────────────┐
│  .camera-view (position:relative)│
│  ┌─────────────────────────────┐ │
│  │ .progress-bar (z:10)        │ │  ← 2px accent bar, visible when isProcessing
│  └─────────────────────────────┘ │
│  ┌─────────────────────────────┐ │
│  │ canvas.camera-canvas        │ │  ← single canvas, fades in on first load
│  └─────────────────────────────┘ │
└─────────────────────────────────┘
```

**First image load:**
1. Draw `previewImageData` (unprocessed) to canvas immediately — canvas starts at `opacity: 0`
2. Trigger CSS transition: `opacity: 0 → 1` over 200ms ease
3. When processed `ImageData` arrives from worker, call `putImageData` directly — no transition needed since canvas is already visible

**Subsequent images (new file selected):**
1. `useCamera` sets `previewImageData` to `null` → canvas hides (opacity back to 0 via class removal)
2. New `previewImageData` arrives → draw placeholder, fade in again

**Loading indicator:**
A 2px `position: absolute; top: 0` progress bar using `var(--color-accent)` (`#c9a96e`) is rendered inside `.camera-view`. It is visible (`opacity: 1`) when `isProcessing` is `true` and hidden (`opacity: 0`) otherwise. It uses an indeterminate CSS animation (sliding gradient or width oscillation) to indicate activity without a known completion time.

```css
.progress-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--color-accent);
  opacity: 0;
  transition: opacity 150ms;
  z-index: 10;
}
.progress-bar.active {
  opacity: 1;
  animation: progress-slide 1.2s ease-in-out infinite;
}
@keyframes progress-slide {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
```

**Object-fit behavior:** The canvas is sized to `width: 100%; height: 100%` via CSS. The canvas pixel dimensions are set to match the ImageData dimensions. CSS scales the canvas to fill the viewport while preserving aspect ratio.

**useEffect for drawing:**
```js
useEffect(() => {
  if (!previewImageData) {
    // Reset canvas opacity for next image
    canvasRef.current?.classList.remove('loaded');
    return;
  }
  const canvas = canvasRef.current;
  canvas.width = previewImageData.width;
  canvas.height = previewImageData.height;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(previewImageData, 0, 0);
  canvas.classList.add('loaded');  // triggers opacity: 0 → 1 transition
}, [previewImageData]);

useEffect(() => {
  if (!preview) return;
  const canvas = canvasRef.current;
  const ctx = canvas.getContext('2d');
  ctx.putImageData(preview, 0, 0);
  // canvas already visible — no transition needed
}, [preview]);
```

---

## Memory Management Strategy

Full-resolution `ImageData` is expensive (~48MB for a 4000×3000 image). The lifecycle is:

| Stage | Who holds it | When released |
|-------|-------------|---------------|
| `fullImageData` | `useCamera` state | When new image loaded or component unmounts |
| Cloned buffer for worker | Transferred (neutered) | Immediately after `postMessage` |
| Processed full-res result | `ExportButton` local state | After `canvas.toBlob` completes + `URL.revokeObjectURL` |

**Export flow:**
1. `ExportButton` calls `processExport(fullImageData, preset)` → receives processed `ImageData`
2. Draws to an offscreen canvas → `canvas.toBlob('image/jpeg', 0.92)` → `Blob`
3. Calls `exportImage(blob, filename)`
4. In `finally`: set processed ImageData ref to null, call `URL.revokeObjectURL` if applicable

**Explicit cleanup in ExportButton's export handler:**
```js
async function handleExport() {
  let processedData = null;
  let blobUrl = null;
  setStatus('processing');
  try {
    processedData = await processExport(fullImageData, preset);
    const canvas = new OffscreenCanvas(processedData.width, processedData.height);
    const ctx = canvas.getContext('2d');
    ctx.putImageData(processedData, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
    const filename = makeFilename(preset.id);
    await exportImage(blob, filename);
    setStatus('saved');
    setTimeout(() => setStatus('idle'), 1500);
  } catch (err) {
    onError(ErrorTypes.EXPORT_FAILED);
    setStatus('idle');
  } finally {
    processedData = null;   // release full-res ImageData
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    }
  }
}
```

`useCamera` keeps `fullImageData` in state only until the next image is loaded. It does not hold a reference after the export is complete — the export hook holds its own reference during the export operation.

---

## Worker Fallback Strategy

```
useWorker(createPipelineWorker)
        │
        ├─ success → worker instance available
        │            useImagePipeline uses worker.process()
        │
        └─ throws  → worker = null
                     useImagePipeline calls processImage() from pipeline/index.js
                     (static import — always bundled)
                     calls processImage() synchronously on main thread
                     (UI may stutter on large images, but app remains functional)
```

`processImage` is a **static import** at the top of `useImagePipeline.js`. Since the pipeline is always needed as a fallback, there is no benefit to dynamic import — Vite's worker bundling handles the code split for the worker entry point separately. Static import keeps the fallback path synchronous and simple:

```js
import { processImage } from '../pipeline/index.js';

// In processPreview, when worker is null:
result = processImage(clone, preset, { mode: 'preview' });
```

---

## EXIF Detection Approach

The auto-rotation detection uses a **minimal synthetic JPEG** with a known orientation tag:

1. A hardcoded 1×2 pixel JPEG with EXIF orientation=6 (90° CW) is embedded as a base64 constant in `exif.js`
2. On first call to `detectAutoRotation()`, decode it to a `Blob`, call `createImageBitmap(blob)`
3. If the resulting bitmap is 2×1 (dimensions swapped), the browser auto-rotated → `_autoRotates = true`
4. If the resulting bitmap is 1×2 (original dimensions), the browser did not auto-rotate → `_autoRotates = false`
5. Cache in module-level `let _autoRotates = null`

This detection runs once per session, lazily on first image load. The result is stable for the session lifetime.

The synthetic JPEG approach is reliable across all browsers because it doesn't depend on any browser API for detection — it uses the browser's own `createImageBitmap` behavior as the oracle.

---

## CSS Architecture

### File structure

```
src/styles/
  App.css          ← global reset, CSS variables, root layout, safe areas
  CameraView.css   ← full-screen canvas, action bar, capture button, import icon
  EmptyState.css   ← centered text, letter-spacing
  ErrorBanner.css  ← slide-down animation, error color
  PresetSelector.css  ← (future use, stub)
  CompareSlider.css   ← (future use, stub)
src/index.css      ← Vite default, can be emptied or removed
```

Each component imports its own CSS file directly.

### Key layout decisions

**Root layout (`App.css`):**
```css
:root {
  --color-bg: #0e0e0e;
  --color-text: #f0ede8;
  --color-secondary: #888;
  --color-accent: #c9a96e;
  --color-error: #c94e4e;
  --font-stack: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
}

html, body, #root {
  height: 100%;
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-stack);
  overflow: hidden;
}

.app {
  position: relative;
  width: 100%;
  height: 100%;
  padding-top: var(--safe-top);
  padding-bottom: var(--safe-bottom);
  padding-left: var(--safe-left);
  padding-right: var(--safe-right);
  box-sizing: border-box;
}
```

**CameraView (`CameraView.css`):**
```css
.camera-view {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.camera-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.action-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding-bottom: calc(var(--safe-bottom) + 16px);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
}

.capture-btn {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 3px solid #fff;
  background: #1a1a1a;
  min-width: 44px;
  min-height: 44px;
}

.import-btn {
  width: 44px;
  height: 44px;
  /* icon inside */
}
```

**ErrorBanner (`ErrorBanner.css`):**
```css
.error-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  padding: calc(var(--safe-top) + 12px) 16px 12px;
  background: var(--color-error);
  transform: translateY(-100%);
  transition: transform 200ms ease-out;
  z-index: 100;
}

.error-banner.visible {
  transform: translateY(0);
}
```

**ExportButton:** positioned `position: fixed; top: calc(var(--safe-top) + 12px); right: calc(var(--safe-right) + 12px)`.


---

## Data Models

### AppError

```ts
{
  message: string;      // user-facing message
  recoverable: boolean; // whether "Try Again" should be shown
}
```

### Preset (from `/src/presets/classic-chrome.json`)

The preset shape matches the actual JSON files exactly — flat top-level fields, with `toneCurve` as the only nested object:

```ts
{
  id: string;
  name: string;
  // Color adjustments (flat, top-level)
  rMult: number;           // e.g. 0.97
  gMult: number;           // e.g. 0.95
  bMult: number;           // e.g. 1.02
  saturation: number;      // e.g. 0.82
  warmth: number;          // e.g. -0.005
  vignetteIntensity: number; // e.g. 0.45
  // Tone curve — per-channel control points in sRGB space (0–255)
  toneCurve: {
    rgb: [number, number][];  // master curve (applied to all channels)
    r:   [number, number][];
    g:   [number, number][];
    b:   [number, number][];
  };
  // Grain
  grainIntensity: number;  // e.g. 0.025
  grainSize: number;       // e.g. 1.2
  grainSeed: number;       // e.g. 7
  // Sharpen
  sharpenAmount: number;   // e.g. 0.1
}
```

Note: there is no `colorAdjust`, `grain`, `vignette`, or `sharpen` nesting — all fields are at the top level except `toneCurve`.

### ImageData (Web API)

Standard `ImageData` with `.data` (Uint8ClampedArray), `.width`, `.height`. Used throughout as the primary pixel buffer type.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Error types are well-formed

*For any* key in `ErrorTypes`, the entry must have a non-empty `message` string and a `recoverable` field that is strictly a boolean.

**Validates: Requirements 1.2, 1.3**

---

### Property 2: downscale produces correct dimensions

*For any* `ImageData` with positive integer dimensions and any `factor` in `(0, 1]`, calling `downscale(imageData, factor)` must return a new `ImageData` whose `width` equals `Math.floor(imageData.width * factor)` and whose `height` equals `Math.floor(imageData.height * factor)`.

**Validates: Requirements 2.3**

---

### Property 3: resizeToMax never exceeds maxDimension

*For any* `ImageData` with positive integer dimensions and any positive integer `maxDimension`, calling `resizeToMax(imageData, maxDimension)` must return an `ImageData` where `Math.max(result.width, result.height) <= maxDimension`.

**Validates: Requirements 3.4**

---

### Property 4: resizeToMax preserves aspect ratio

*For any* `ImageData` with positive integer dimensions and any positive integer `maxDimension` smaller than the longest side, calling `resizeToMax(imageData, maxDimension)` must return an `ImageData` where `result.width / result.height` is approximately equal to `imageData.width / imageData.height` (within floating-point rounding of 1px).

**Validates: Requirements 3.4**

---

### Property 5: resizeToMax is identity when already within bounds

*For any* `ImageData` where `Math.max(width, height) <= maxDimension`, calling `resizeToMax(imageData, maxDimension)` must return the original `ImageData` unchanged (same reference or same dimensions and pixel data).

**Validates: Requirements 3.4**

---

### Property 6: Export filename matches required format

*For any* non-empty `presetId` string and any non-negative integer `timestamp`, `makeFilename(presetId, timestamp)` must return a string matching the pattern `grainframe-{presetId}-{timestamp}.jpg` exactly.

**Validates: Requirements 5.4**

---

### Property 7: useCamera produces preview within 1024px

*For any* image loaded via `useCamera`, the resulting `previewImageData` must have `Math.max(width, height) <= 1024`.

**Validates: Requirements 6.4**

---

### Property 8: useCamera produces full within Resolution_Ceiling

*For any* image loaded via `useCamera`, the resulting `fullImageData` must have `Math.max(width, height) <= getMaxDimension()`.

**Validates: Requirements 6.4**

---

### Property 9: processPreview does not neuter the original ImageData

*For any* `ImageData` passed to `processPreview`, after the call returns, the original `imageData.data.buffer` must not be detached (i.e. `imageData.data.byteLength > 0`).

**Validates: Requirements 7.4**

---

## Error Handling

| Error | Source | Recovery |
|-------|--------|----------|
| `IMAGE_LOAD_FAILED` | `useCamera` — `loadImage` throws | User can retry by selecting another file |
| `IMAGE_TOO_LARGE` | `useCamera` — canvas allocation fails | Not recoverable; user must use a smaller image |
| `PROCESSING_FAILED` | `useImagePipeline` — worker error or OOM after retry | User can retry; hook will re-run pipeline |
| `EXPORT_FAILED` | `exportImage` — `navigator.share` rejects (non-AbortError) | User can retry export |

All errors surface to `App` via the hook's `error` return value. App passes the active error to `ErrorBanner`. The "Try Again" button calls `onRetry` which clears the error state and re-triggers the failed operation.

OOM recovery in `useImagePipeline`:
1. Catch `RangeError` or error message containing "memory" or "allocation"
2. Call `downscale(imageData, 0.5)` on the original (non-transferred) copy
3. Retry the pipeline once with the smaller image
4. If retry also fails, set `PROCESSING_FAILED`

---

## Testing Strategy

### Dual approach

Both unit tests and property-based tests are required. They are complementary:
- Unit tests verify specific examples, edge cases, and integration points
- Property tests verify universal correctness across all valid inputs

### Property-based testing

Library: **fast-check** (already in `devDependencies` at `^3.23.2`).

Each property test runs a minimum of **100 iterations** (fast-check default is 100; set explicitly via `{ numRuns: 100 }`).

Each test is tagged with a comment referencing the design property:
```js
// Feature: grainframe-ui, Property 2: downscale produces correct dimensions
```

**Property test locations:** `src/utils/__tests__/`

#### Property 1 — Error types are well-formed
```js
// Feature: grainframe-ui, Property 1: error types are well-formed
fc.assert(fc.property(
  fc.constantFrom(...Object.keys(ErrorTypes)),
  (key) => {
    const e = ErrorTypes[key];
    return typeof e.message === 'string' && e.message.length > 0
      && typeof e.recoverable === 'boolean';
  }
), { numRuns: 100 });
```

#### Property 2 — downscale produces correct dimensions
```js
// Feature: grainframe-ui, Property 2: downscale produces correct dimensions
fc.assert(fc.property(
  fc.integer({ min: 1, max: 200 }),
  fc.integer({ min: 1, max: 200 }),
  fc.double({ min: 0.1, max: 1.0, noNaN: true }),
  (w, h, factor) => {
    const src = new ImageData(w, h);
    const result = downscale(src, factor);
    return result.width === Math.floor(w * factor)
      && result.height === Math.floor(h * factor);
  }
), { numRuns: 100 });
```

#### Property 3 — resizeToMax never exceeds maxDimension
```js
// Feature: grainframe-ui, Property 3: resizeToMax never exceeds maxDimension
fc.assert(fc.property(
  fc.integer({ min: 1, max: 500 }),
  fc.integer({ min: 1, max: 500 }),
  fc.integer({ min: 1, max: 500 }),
  (w, h, maxDim) => {
    const src = new ImageData(w, h);
    const result = resizeToMax(src, maxDim);
    return Math.max(result.width, result.height) <= maxDim;
  }
), { numRuns: 100 });
```

#### Property 4 — resizeToMax preserves aspect ratio
```js
// Feature: grainframe-ui, Property 4: resizeToMax preserves aspect ratio
fc.assert(fc.property(
  fc.integer({ min: 2, max: 500 }),
  fc.integer({ min: 2, max: 500 }),
  fc.integer({ min: 1, max: 100 }),  // maxDim smaller than image
  (w, h, maxDim) => {
    fc.pre(maxDim < Math.max(w, h));
    const src = new ImageData(w, h);
    const result = resizeToMax(src, maxDim);
    const originalRatio = w / h;
    const resultRatio = result.width / result.height;
    return Math.abs(originalRatio - resultRatio) < 0.02;
  }
), { numRuns: 100 });
```

#### Property 5 — resizeToMax is identity when within bounds
```js
// Feature: grainframe-ui, Property 5: resizeToMax is identity when already within bounds
fc.assert(fc.property(
  fc.integer({ min: 1, max: 100 }),
  fc.integer({ min: 1, max: 100 }),
  fc.integer({ min: 0, max: 100 }),
  (w, h, extra) => {
    const maxDim = Math.max(w, h) + extra;  // always >= longest side
    const src = new ImageData(w, h);
    const result = resizeToMax(src, maxDim);
    return result.width === w && result.height === h;
  }
), { numRuns: 100 });
```

#### Property 6 — Export filename format
```js
// Feature: grainframe-ui, Property 6: export filename matches required format
fc.assert(fc.property(
  fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-z0-9-]+$/.test(s)),
  fc.integer({ min: 0 }),
  (presetId, timestamp) => {
    const name = makeFilename(presetId, timestamp);
    return name === `grainframe-${presetId}-${timestamp}.jpg`;
  }
), { numRuns: 100 });
```

#### Properties 7 & 8 — useCamera image dimensions
These are integration tests using React Testing Library with a mocked `loadImage`. Generate random image dimensions, verify the hook produces correctly bounded outputs.

#### Property 9 — processPreview does not neuter original
Integration test: create an `ImageData`, call `processPreview`, assert `imageData.data.byteLength > 0` after the call.

### Unit tests

Located in `src/utils/__tests__/`, `src/hooks/__tests__/`, `src/components/__tests__/`.

Focus areas:
- `errors.js`: structural shape of `ErrorTypes` (example)
- `exif.js`: known JPEG blobs with specific orientation tags → expected rotation (examples)
- `export.js`: `navigator.share` mock → called with correct File; fallback path creates `<a>` element (examples)
- `useWorker.js`: factory throws → returns null + error; unmount → terminate called (examples)
- `useImagePipeline.js`: worker error → sets PROCESSING_FAILED; OOM → retries at 0.5 (examples)
- `CameraView`: renders EmptyState when no image; renders canvas when image present (examples)
- `ErrorBanner`: visible class applied when error present; auto-dismiss after 5s (examples)
- `ExportButton`: disabled during export; shows "Saved" on success (examples)

