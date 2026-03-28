# Implementation Plan: Grainframe UI

## Overview

Bottom-up implementation: pure utils first, then hooks, then components, then App composition. The pipeline (`/src/pipeline/`) is already implemented and treated as a black box. Classic Chrome preset is hardcoded — no switching UI.

## Tasks

- [ ] 1. Implement utility modules
  - [x] 1.1 Implement `src/utils/errors.js`
    - Export `ErrorTypes` object with keys `IMAGE_LOAD_FAILED`, `IMAGE_TOO_LARGE`, `PROCESSING_FAILED`, `EXPORT_FAILED`
    - Each entry has a `message` string and a `recoverable` boolean
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 1.2 Write property test for error types (Property 1)
    - **Property 1: Error types are well-formed**
    - Use `fc.constantFrom(...Object.keys(ErrorTypes))` to iterate all keys
    - Assert `typeof e.message === 'string' && e.message.length > 0 && typeof e.recoverable === 'boolean'`
    - `{ numRuns: 100 }`
    - **Validates: Requirements 1.2, 1.3**

  - [x] 1.3 Implement `src/utils/memory.js`
    - Export `getMaxDimension()`: returns `3000` on iOS (`/iPad|iPhone|iPod/` + no `window.MSStream`), `4000` otherwise
    - Export `downscale(imageData, factor)`: create canvas at `floor(w*factor) × floor(h*factor)`, draw source via temp canvas + `drawImage`, return `getImageData`
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 1.4 Write property test for `downscale` (Property 2)
    - **Property 2: downscale produces correct dimensions**
    - Generators: `fc.integer({ min: 1, max: 200 })`, `fc.integer({ min: 1, max: 200 })`, `fc.double({ min: 0.1, max: 1.0, noNaN: true })`
    - Assert `result.width === Math.floor(w * factor) && result.height === Math.floor(h * factor)`
    - `{ numRuns: 100 }`
    - **Validates: Requirements 2.3**

  - [x] 1.5 Implement `src/utils/image.js`
    - Export `loadImage(blob)`: call `createImageBitmap(blob, { imageOrientation: 'none' })`; on throw, retry `createImageBitmap(blob)` without options
    - Export `resizeToMax(imageData, maxDimension)`: compute `scale = maxDimension / Math.max(w, h)`; if `scale >= 1` return input unchanged; else create canvas at `floor(w*scale) × floor(h*scale)`, draw source, return `getImageData`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 1.6 Write property tests for `resizeToMax` (Properties 3, 4, 5)
    - **Property 3: resizeToMax never exceeds maxDimension**
      - Generators: `fc.integer({ min: 1, max: 500 })`, `fc.integer({ min: 1, max: 500 })`, `fc.integer({ min: 1, max: 500 })`
      - Assert `Math.max(result.width, result.height) <= maxDim`
      - `{ numRuns: 100 }`
      - **Validates: Requirements 3.4**
    - **Property 4: resizeToMax preserves aspect ratio**
      - Generators: `fc.integer({ min: 2, max: 500 })`, `fc.integer({ min: 2, max: 500 })`, `fc.integer({ min: 1, max: 100 })`
      - Use `fc.pre(maxDim < Math.max(w, h))` to constrain
      - Assert `Math.abs(originalRatio - resultRatio) < 0.02`
      - `{ numRuns: 100 }`
      - **Validates: Requirements 3.4**
    - **Property 5: resizeToMax is identity when already within bounds**
      - Generators: `fc.integer({ min: 1, max: 100 })`, `fc.integer({ min: 1, max: 100 })`, `fc.integer({ min: 0, max: 100 })`
      - Compute `maxDim = Math.max(w, h) + extra` inside property body (no `fc.sample`)
      - Assert `result.width === w && result.height === h`
      - `{ numRuns: 100 }`
      - **Validates: Requirements 3.4**

  - [x] 1.7 Implement `src/utils/exif.js`
    - Export `readOrientation(blob)`: read first 64KB, scan for `0xFFE1` APP1 marker, verify `Exif\0\0` signature, parse TIFF header byte order, walk IFD0 for tag `0x0112`, return value 1–8 (default 1)
    - Export `detectAutoRotation()`: use a hardcoded base64 1×2 JPEG with orientation=6; call `createImageBitmap`; if result is 2×1 set `_autoRotates = true`, else `false`; cache in module-level `let _autoRotates = null`
    - Export `applyOrientation(bitmap, orientation)`: create canvas (swap dimensions for 90°/270°), apply transform matrix per orientation table, draw bitmap, return `getImageData`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 1.8 Implement `src/utils/export.js`
    - Export `makeFilename(presetId, timestamp = Date.now())`: return `grainframe-${presetId}-${timestamp}.jpg`
    - Export `exportImage(blob, filename)`: create `File` from blob; if `navigator.canShare?.({ files: [file] })` call `navigator.share`; catch non-`AbortError` and throw `ErrorTypes.EXPORT_FAILED`; fallback: create `<a download>`, click, `URL.revokeObjectURL`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 1.9 Write property test for `makeFilename` (Property 6)
    - **Property 6: Export filename matches required format**
    - Generators: `fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-z0-9-]+$/.test(s))`, `fc.integer({ min: 0 })`
    - Assert `name === \`grainframe-${presetId}-${timestamp}.jpg\``
    - `{ numRuns: 100 }`
    - **Validates: Requirements 5.4**

- [x] 2. Checkpoint — Ensure all utility tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Implement hooks
  - [x] 3.1 Implement `src/hooks/useWorker.js`
    - Accept a `factory` function; call it in `useEffect([], [])`; store worker in state
    - Return `{ worker, error }`; if `factory()` throws, set `error` and return `worker: null`
    - Cleanup: `return () => w.terminate()` in the effect
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ]* 3.2 Write unit tests for `useWorker`
    - Test: factory throws → returns `null` worker + error set
    - Test: unmount → `terminate()` called on worker
    - _Requirements: 8.2, 8.3_

  - [x] 3.3 Implement `src/hooks/useImagePipeline.js`
    - Static import `processImage` from `../pipeline/index.js` (worker fallback)
    - Call `useWorker(createPipelineWorker)` from `bridge.js`
    - State: `preview`, `isProcessing`, `error`
    - `requestIdRef = useRef(0)`: increment before each `processPreview` call; only apply result if `myId === requestIdRef.current`
    - `processPreview(imageData, preset)`: set `preview = null` at start; clone buffer before transfer; if `worker` null fall back to `processImage(clone, preset, { mode: 'preview' })`; OOM recovery: catch `RangeError` or "memory"/"allocation" message, `downscale(imageData, 0.5)`, retry once, then set `PROCESSING_FAILED`; set `isProcessing = false` in `finally` only if `myId === requestIdRef.current`
    - `processExport(imageData, preset)`: clone buffer; worker or main-thread fallback; return processed `ImageData`
    - Return `{ preview, isProcessing, error, processPreview, processExport }`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 16.1, 16.2, 16.3_

  - [ ]* 3.4 Write unit tests for `useImagePipeline`
    - Test: worker error → sets `PROCESSING_FAILED`
    - Test: OOM error → retries at 0.5 scale
    - Test: stale request discarded (race condition guard)
    - _Requirements: 7.5, 7.6, 2.4_

  - [ ]* 3.5 Write property test for `processPreview` buffer preservation (Property 9)
    - **Property 9: processPreview does not neuter the original ImageData**
    - Create an `ImageData`, call `processPreview`, assert `imageData.data.byteLength > 0` after the call
    - `{ numRuns: 100 }`
    - **Validates: Requirements 7.4**

  - [x] 3.6 Implement `src/hooks/useCamera.js`
    - `captureRef = useRef(null)`, `importRef = useRef(null)`
    - `triggerCapture = () => captureRef.current?.click()`, `triggerImport = () => importRef.current?.click()`
    - State: `previewImageData`, `fullImageData`, `error`
    - `handleFileChange(event)`: immediately set `previewImageData = null`, `fullImageData = null`, `error = null`; then: `loadImage(file)` → `detectAutoRotation()` + `readOrientation(file)` → `applyOrientation(bitmap, orientation)` → `resizeToMax(imageData, 1024)` → `resizeToMax(imageData, getMaxDimension())`; catch `RangeError`/allocation errors → `IMAGE_TOO_LARGE`; catch all others → `IMAGE_LOAD_FAILED`
    - Return `{ captureRef, importRef, handleFileChange, triggerCapture, triggerImport, previewImageData, fullImageData, error }`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 3.7 Write unit tests for `useCamera`
    - Test: `handleFileChange` resets `previewImageData` and `fullImageData` to null immediately
    - Test: load failure → sets `IMAGE_LOAD_FAILED`
    - Test: allocation failure → sets `IMAGE_TOO_LARGE`
    - _Requirements: 6.4, 6.5, 6.6_

- [x] 4. Checkpoint — Ensure all hook tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement components
  - [x] 5.1 Implement `src/components/EmptyState.jsx`
    - Render "grainframe" centered, lowercase, `letter-spacing: 0.12em`
    - Render subtitle "tap to capture or import a photo" in `var(--color-secondary)` (`#888`)
    - Import `src/styles/EmptyState.css`
    - _Requirements: 9.1, 9.2_

  - [ ]* 5.2 Write unit tests for `EmptyState`
    - Test: renders "grainframe" text
    - Test: renders subtitle text
    - _Requirements: 9.1, 9.2_

  - [x] 5.3 Implement `src/components/ErrorBanner.jsx`
    - Props: `error` (AppError | null), `onRetry` (function), `onDismiss` (function)
    - Apply `.error-banner.visible` class when `error` is non-null; slide-down 200ms ease-out
    - Display `error.message`; show "Try Again" button when `error.recoverable === true`
    - Auto-dismiss after 5000ms via `useEffect` (clear timeout on unmount/error change)
    - `aria-live="polite"`, error accent `#c94e4e`
    - Import `src/styles/ErrorBanner.css`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ]* 5.4 Write unit tests for `ErrorBanner`
    - Test: `.visible` class applied when error present
    - Test: "Try Again" shown only when `recoverable: true`
    - Test: auto-dismiss fires after 5s (fake timers)
    - _Requirements: 11.1, 11.3, 11.4_

  - [x] 5.5 Implement `src/components/ExportButton.jsx`
    - Props: `fullImageData` (ImageData | null), `processExport` (function), `preset` (object), `onError` (function)
    - Internal state: `status` — `'idle' | 'processing' | 'saved'`
    - `handleExport`: set `status = 'processing'`; `processedData = await processExport(fullImageData, preset)`; draw to `OffscreenCanvas`; `canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 })`; `makeFilename(preset.id)`; `exportImage(blob, filename)`; set `status = 'saved'`; `setTimeout(() => setStatus('idle'), 1500)`; catch → `onError(ErrorTypes.EXPORT_FAILED)`, `setStatus('idle')`; `finally`: `processedData = null`, `URL.revokeObjectURL(blobUrl)` if applicable
    - Render: disabled + "Processing…" + spinner when `status === 'processing'`; "Saved" when `status === 'saved'`; default "Export" when idle
    - `aria-label="Export image"`, `position: fixed; top: calc(var(--safe-top) + 12px); right: calc(var(--safe-right) + 12px)`
    - Disabled (no-op) when `fullImageData` is null
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [ ]* 5.6 Write unit tests for `ExportButton`
    - Test: disabled during export (`status === 'processing'`)
    - Test: shows "Saved" on success, returns to idle after 1500ms
    - Test: `processedData = null` in finally block (memory cleanup)
    - _Requirements: 12.2, 12.3, 12.7_

  - [x] 5.7 Implement `src/components/CameraView.jsx` and `src/styles/CameraView.css`
    - Props: `captureRef`, `importRef`, `handleFileChange`, `preview` (processed ImageData | null), `previewImageData` (unprocessed ImageData | null), `isProcessing` (boolean)
    - Render two hidden `<input type="file">` elements: one with `capture="environment" accept="image/*"` attached to `captureRef`, one with `accept="image/*"` attached to `importRef`; both with `onChange={handleFileChange}`
    - Render `.progress-bar` (2px, `var(--color-accent)` `#c9a96e`, `position: absolute; top: 0`); add `.active` class when `isProcessing`; CSS animation `progress-slide` (translateX -100% → 100%, 1.2s infinite)
    - Single canvas (`canvasRef`): `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain`
    - `useEffect([previewImageData])`: if null → `canvas.classList.remove('loaded')`; else set `canvas.width/height`, `ctx.putImageData(previewImageData)`, `canvas.classList.add('loaded')` (triggers `opacity: 0 → 1` 200ms transition)
    - `useEffect([preview])`: if non-null → `ctx.putImageData(preview)` (canvas already visible, no transition)
    - Render `EmptyState` when `previewImageData` is null
    - Render action bar: capture button (72px circle, white border, dark center, `aria-label="Take photo"`, `onClick={triggerCapture}`); import button (44×44px tap target, `aria-label="Import from library"`, `onClick={triggerImport}`)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 15.3_

  - [ ]* 5.8 Write unit tests for `CameraView`
    - Test: renders `EmptyState` when no image
    - Test: renders canvas when `previewImageData` is set
    - Test: `.progress-bar.active` present when `isProcessing` is true
    - _Requirements: 10.1, 10.6, 15.3_

- [ ] 6. Implement App composition and global styles
  - [x] 6.1 Write `src/styles/App.css` with CSS variables and root layout
    - Define `--color-bg: #0e0e0e`, `--color-text: #f0ede8`, `--color-secondary: #888`, `--color-accent: #c9a96e`, `--color-error: #c94e4e`, `--font-stack`
    - Define `--safe-top/bottom/left/right` via `env(safe-area-inset-*)` with `0px` fallback
    - `html, body, #root { height: 100%; margin: 0; overflow: hidden; background: var(--color-bg); color: var(--color-text); font-family: var(--font-stack); }`
    - `.app { position: relative; width: 100%; height: 100%; padding: safe areas; box-sizing: border-box; }`
    - _Requirements: 13.2, 13.3_

  - [x] 6.2 Write `src/App.jsx`
    - Static import `classicChrome` from `./presets/classic-chrome.json`
    - Call `useCamera()` → destructure `{ captureRef, importRef, handleFileChange, triggerCapture, triggerImport, previewImageData, fullImageData, error: cameraError }`
    - Call `useImagePipeline()` → destructure `{ preview, isProcessing, error: pipelineError, processPreview, processExport }`
    - `useEffect([previewImageData])`: when `previewImageData` changes to non-null, call `processPreview(previewImageData, classicChrome)`
    - `activeError = cameraError || pipelineError`
    - `onRetry`: clear relevant error state
    - Pass to `CameraView`: `captureRef`, `importRef`, `handleFileChange`, `preview`, `previewImageData`, `isProcessing`
    - Pass to `ExportButton`: `fullImageData`, `processExport`, `preset={classicChrome}`, `onError`
    - Pass to `ErrorBanner`: `error={activeError}`, `onRetry`, `onDismiss`
    - Import `./styles/App.css`
    - _Requirements: 13.1, 13.7, 15.1, 15.2_

  - [x] 6.3 Verify `src/main.jsx` mounts via `createRoot`
    - Confirm `createRoot(document.getElementById('root')).render(<App />)` — no manual service worker registration
    - _Requirements: 14.1, 14.2_

- [x] 7. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Pipeline (`/src/pipeline/`) is already implemented — no pipeline tasks included
- `vite-plugin-pwa` and `fast-check` are already in `devDependencies`
- `index.html` already has iOS PWA meta tags; `main.jsx` already uses `createRoot`
- Classic Chrome preset is hardcoded — no `PresetSelector` or `CompareSlider` tasks
- Property tests live in `src/utils/__tests__/`; unit tests in `src/utils/__tests__/`, `src/hooks/__tests__/`, `src/components/__tests__/`
- Two-canvas cross-fade is deferred to Spec 3; this spec uses single canvas with CSS opacity fade-in
