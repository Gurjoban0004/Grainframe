# Requirements Document

## Introduction

The Grainframe UI layer connects the existing `/src/pipeline/` image processing engine to user interaction. It covers photo capture and import via native iOS file inputs, EXIF orientation handling, resolution management, Web Worker integration, processed preview display, preset selection, export via the Web Share API, and all error states. The result is a full-screen, dark-themed PWA camera app that feels native on iPhone and degrades gracefully on desktop.

The pipeline itself (`/src/pipeline/`) is already implemented. This spec covers everything that sits between the user and that pipeline.

---

## Glossary

- **App**: The Grainframe React PWA as a whole.
- **Camera_Hook**: The `useCamera` React hook (`/src/hooks/useCamera.js`).
- **Pipeline_Hook**: The `useImagePipeline` React hook (`/src/hooks/useImagePipeline.js`).
- **Worker_Hook**: The `useWorker` React hook (`/src/hooks/useWorker.js`).
- **Pipeline_Worker**: The Web Worker running `/src/pipeline/worker.js`.
- **Pipeline**: The image processing engine in `/src/pipeline/index.js`.
- **CameraView**: The `CameraView` React component.
- **EmptyState**: The `EmptyState` React component.
- **ErrorBanner**: The `ErrorBanner` React component.
- **ExportButton**: The `ExportButton` React component.
- **PresetSelector**: The `PresetSelector` React component.
- **CompareSlider**: The `CompareSlider` React component.
- **Error_Util**: The error definitions module at `/src/utils/errors.js`.
- **Memory_Util**: The memory management module at `/src/utils/memory.js`.
- **Image_Util**: The image loading module at `/src/utils/image.js`.
- **EXIF_Util**: The EXIF orientation module at `/src/utils/exif.js`.
- **Export_Util**: The export module at `/src/utils/export.js`.
- **Preview_ImageData**: An `ImageData` object scaled to a maximum of 1024px on the longest side.
- **Full_ImageData**: An `ImageData` object scaled to the resolution ceiling (3000px on iOS, 4000px elsewhere) but otherwise at full capture resolution.
- **Preset**: A JSON object conforming to the preset schema defined in the grainframe spec (id, name, toneCurve, colorAdjust, grain, vignette, sharpen).
- **iOS**: A device whose `navigator.userAgent` matches `/iPad|iPhone|iPod/` and does not match `window.MSStream`.
- **Resolution_Ceiling**: 3000px on iOS, 4000px on all other platforms.
- **EXIF_Orientation**: The orientation tag embedded in a JPEG file's EXIF metadata.

---

## Requirements

### Requirement 1: Error Type Definitions

**User Story:** As a developer, I want a centralised set of typed error definitions, so that all user-facing error messages and recovery strategies are consistent across the app.

#### Acceptance Criteria

1. THE Error_Util SHALL export an `ErrorTypes` object containing at minimum the keys `IMAGE_LOAD_FAILED`, `IMAGE_TOO_LARGE`, `PROCESSING_FAILED`, and `EXPORT_FAILED`.
2. THE Error_Util SHALL assign each error type a `message` string that is suitable for display to the user.
3. THE Error_Util SHALL assign each error type a `recoverable` boolean indicating whether the user can retry the operation.
4. WHEN `recoverable` is `true` for an error type, THE ErrorBanner SHALL display a "Try Again" action alongside the error message.

---

### Requirement 2: Memory and Resolution Management

**User Story:** As a user on an iOS device, I want the app to respect device memory limits, so that processing large photos does not crash the browser tab.

#### Acceptance Criteria

1. THE Memory_Util SHALL export a `getMaxDimension()` function that returns `3000` when running on iOS and `4000` otherwise.
2. THE Memory_Util SHALL detect iOS by testing `navigator.userAgent` against `/iPad|iPhone|iPod/` and the absence of `window.MSStream`.
3. THE Memory_Util SHALL export a `downscale(imageData, factor)` function that returns a new `ImageData` with both dimensions multiplied by `factor`.
4. WHEN a canvas allocation or `getImageData` call throws a `RangeError` or an error whose message contains "memory" or "allocation", THE Pipeline_Hook SHALL call `downscale` with `factor = 0.5` and retry the pipeline once before surfacing a `PROCESSING_FAILED` error.

---

### Requirement 3: Image Loading

**User Story:** As a user, I want my selected photo to load correctly regardless of its format or orientation, so that I see the right image before processing begins.

#### Acceptance Criteria

1. THE Image_Util SHALL export a `loadImage(blob)` function that resolves to an `ImageBitmap` using `createImageBitmap`.
2. WHEN `createImageBitmap` supports the `imageOrientation` option, THE Image_Util SHALL call it with `{ imageOrientation: 'none' }` to suppress browser auto-rotation.
3. IF `createImageBitmap` with `{ imageOrientation: 'none' }` throws, THEN THE Image_Util SHALL retry the call without any options as a fallback.
4. THE Image_Util SHALL export a `resizeToMax(imageData, maxDimension)` function that returns a new `ImageData` scaled proportionally so that neither dimension exceeds `maxDimension`, leaving images already within bounds unchanged.

---

### Requirement 4: EXIF Orientation Handling

**User Story:** As a user, I want photos taken in portrait or landscape orientation to appear correctly rotated, so that the preview and export match what I captured.

#### Acceptance Criteria

1. THE EXIF_Util SHALL export a function that reads the EXIF orientation tag from a JPEG `Blob` without loading the full image.
2. THE EXIF_Util SHALL detect at startup whether the current browser auto-applies EXIF orientation when `createImageBitmap` is called, and SHALL cache that result for the lifetime of the session.
3. WHEN the browser does not auto-apply EXIF orientation, THE EXIF_Util SHALL apply the correct canvas rotation manually based on the EXIF orientation tag value.
4. WHEN the browser does auto-apply EXIF orientation, THE EXIF_Util SHALL skip manual rotation to prevent double-rotation.

---

### Requirement 5: Image Export

**User Story:** As a user on iOS, I want to save my processed photo to my camera roll via the native share sheet, so that I can keep the image outside the app.

#### Acceptance Criteria

1. THE Export_Util SHALL export an `exportImage(blob, filename)` function.
2. WHEN `navigator.canShare` is available and returns `true` for a `File` object, THE Export_Util SHALL call `navigator.share` with the processed image as a `File` to trigger the native iOS share sheet.
3. IF `navigator.canShare` is unavailable or returns `false`, THEN THE Export_Util SHALL fall back to creating an `<a>` element with a `download` attribute and an object URL, clicking it programmatically, and then revoking the object URL.
4. THE Export_Util SHALL format the filename as `grainframe-[presetId]-[timestamp].jpg` where `[timestamp]` is the Unix timestamp in milliseconds at the time of export.
5. IF `navigator.share` throws or rejects, THEN THE Export_Util SHALL reject with an `EXPORT_FAILED` error so the caller can surface it to the user.

---

### Requirement 6: Camera and Import Hook

**User Story:** As a user, I want to take a photo with my camera or import one from my library, so that I have an image to process.

#### Acceptance Criteria

1. THE Camera_Hook SHALL manage two hidden `<input type="file">` elements: one with `capture="environment"` and `accept="image/*"` for camera capture, and one with only `accept="image/*"` for library import.
2. THE Camera_Hook SHALL return `{ triggerCapture, triggerImport, imageData, error }` where `triggerCapture` and `triggerImport` are functions that programmatically click the respective hidden inputs.
3. WHEN a file is selected via either input, THE Camera_Hook SHALL load the file using Image_Util, apply EXIF orientation via EXIF_Util, and apply the Resolution_Ceiling via Memory_Util.
4. THE Camera_Hook SHALL produce both a Preview_ImageData (max 1024px) and a Full_ImageData (max Resolution_Ceiling) from the selected file.
5. IF image loading fails for any reason, THEN THE Camera_Hook SHALL set `error` to an `IMAGE_LOAD_FAILED` error type value.
6. THE Camera_Hook SHALL attempt to load all files regardless of size. THE Camera_Hook SHALL only set `error` to `IMAGE_TOO_LARGE` if loading or canvas allocation actually fails during processing.

---

### Requirement 7: Image Pipeline Hook

**User Story:** As a developer, I want a React hook that manages the pipeline Web Worker lifecycle, so that components can request preview and export processing without managing worker state directly.

#### Acceptance Criteria

1. THE Pipeline_Hook SHALL create a Pipeline_Worker on mount and terminate it on unmount.
2. THE Pipeline_Hook SHALL expose a `processPreview(previewImageData, preset)` function that sends the Preview_ImageData to the Pipeline_Worker and resolves with the processed `ImageData`.
3. THE Pipeline_Hook SHALL expose a `processExport(fullImageData, preset)` function that sends the Full_ImageData to the Pipeline_Worker and resolves with the processed `ImageData`.
4. THE Pipeline_Hook SHALL clone `imageData` before transferring it to the Pipeline_Worker so the original remains available for before/after comparison.
5. THE Pipeline_Hook SHALL return `{ preview, isProcessing, error }` where `preview` is the latest processed Preview_ImageData, `isProcessing` is `true` while the worker is running, and `error` holds any pipeline error.
6. IF the Pipeline_Worker throws or posts an error message, THEN THE Pipeline_Hook SHALL set `error` to a `PROCESSING_FAILED` error type value.

---

### Requirement 8: Generic Worker Lifecycle Hook

**User Story:** As a developer, I want a generic Web Worker lifecycle hook, so that worker creation and cleanup are handled consistently and safely.

#### Acceptance Criteria

1. THE Worker_Hook SHALL accept a worker factory function and return the created worker instance.
2. THE Worker_Hook SHALL terminate the worker when the component that owns the hook unmounts.
3. IF `Worker` construction throws, THEN THE Worker_Hook SHALL set an error state and return `null` for the worker, allowing the caller to fall back to main-thread execution.

---

### Requirement 9: Empty State Display

**User Story:** As a first-time user, I want to see a clear prompt when no photo is loaded, so that I understand how to start using the app.

#### Acceptance Criteria

1. THE EmptyState SHALL display the text "grainframe" centered in the viewport in lowercase with `letter-spacing: 0.12em`.
2. THE EmptyState SHALL display the subtitle "tap to capture or import a photo" in the secondary text color `#888`.
3. THE CameraView SHALL render EmptyState when no image has been loaded.

---

### Requirement 10: Camera View

**User Story:** As a user, I want a full-screen camera-style interface with a shutter button and gallery import icon, so that the app feels like a native camera app.

#### Acceptance Criteria

1. THE CameraView SHALL render a full-screen `<canvas>` element that displays the processed preview image.
2. THE CameraView SHALL render two hidden `<input type="file">` elements managed by Camera_Hook.
3. THE CameraView SHALL render a capture button that is a circle of 72px diameter with a white border and dark center, centered in the action bar, with `aria-label="Take photo"`.
4. THE CameraView SHALL render a gallery import icon to the left of the capture button inside a tap target of at least 44×44px, with `aria-label="Import from library"`.
5. WHEN a processed preview image is available, THE CameraView SHALL draw it onto the canvas and apply a 200ms ease fade-in transition.
6. WHEN no image is loaded, THE CameraView SHALL render EmptyState in place of the canvas content.
7. THE CameraView SHALL apply `env(safe-area-inset-*)` CSS insets to all interactive elements so they are not obscured by iPhone notches or the Dynamic Island.
8. WHILE the preview pipeline is processing, THE CameraView SHALL display the unprocessed Preview_ImageData on the canvas as a placeholder. WHEN the processed preview becomes available, THE CameraView SHALL replace it with a 200ms cross-fade transition.

---

### Requirement 11: Error Banner

**User Story:** As a user, I want to see a clear, non-blocking error message when something goes wrong, so that I know what happened and can try again.

#### Acceptance Criteria

1. THE ErrorBanner SHALL slide down from the top of the viewport using a 200ms ease-out transition when an error is present.
2. THE ErrorBanner SHALL display the error `message` string from the active error type.
3. WHEN the active error type has `recoverable: true`, THE ErrorBanner SHALL display a "Try Again" button.
4. THE ErrorBanner SHALL auto-dismiss after 5 seconds.
5. THE ErrorBanner SHALL use `#c94e4e` as the error accent color.
6. THE ErrorBanner SHALL have `aria-live="polite"` so screen readers announce the error.

---

### Requirement 12: Export Button

**User Story:** As a user, I want a clearly visible export button that shows me processing status and confirms when my photo has been saved.

#### Acceptance Criteria

1. THE ExportButton SHALL be positioned in the top-right corner of the viewport.
2. WHILE an export is in progress, THE ExportButton SHALL display "Processing…" with a spinner and SHALL be disabled.
3. WHEN export completes successfully, THE ExportButton SHALL display "Saved" for 1500ms before returning to its default state.
4. THE ExportButton SHALL call Export_Util with JPEG quality `0.92` when triggered.
5. THE ExportButton SHALL have `aria-label="Export image"`.
6. IF export fails, THEN THE ExportButton SHALL surface an `EXPORT_FAILED` error to the ErrorBanner.
7. WHEN export completes (success or failure), THE ExportButton SHALL release the full-resolution processed ImageData and revoke any Blob URLs created during export via `URL.revokeObjectURL()`.

---

### Requirement 13: App Composition and Theming

**User Story:** As a user, I want the app to have a consistent dark, film-inspired visual style across all components, so that the experience feels cohesive and intentional.

#### Acceptance Criteria

1. THE App SHALL compose CameraView, ExportButton, and ErrorBanner into a single full-screen layout.
2. THE App SHALL apply a background color of `#0e0e0e`, primary text color of `#f0ede8`, and the system font stack `-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif` as global CSS defaults.
3. THE App SHALL apply `env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`, `env(safe-area-inset-left)`, and `env(safe-area-inset-right)` to the root layout so content is not obscured on notched iPhones.
4. THE App SHALL set `viewport-fit=cover` in the HTML `<meta name="viewport">` tag to enable safe area inset support.
5. ALL interactive elements in the App SHALL have a minimum tap target size of 44×44px.
6. ALL buttons in the App SHALL have an `aria-label` attribute.
7. THE App SHALL default to the Classic Chrome preset (loaded from `/src/presets/classic-chrome.json`) as the active preset. No preset switching UI is needed in this spec.

---

### Requirement 14: React Entry Point

**User Story:** As a developer, I want a standard React entry point that mounts the app without manual service worker registration, so that PWA behaviour is handled entirely by vite-plugin-pwa.

#### Acceptance Criteria

1. THE App SHALL be mounted via `createRoot` in `main.jsx` targeting the `#root` DOM element.
2. THE App SHALL NOT register a service worker manually; vite-plugin-pwa handles service worker registration automatically.

---

### Requirement 15: Automatic Preview on Image Load

**User Story:** As a user, I want my photo to be processed with the active preset automatically as soon as I select it, so that I see the film look immediately without any extra steps.

#### Acceptance Criteria

1. WHEN a new image is loaded via Camera_Hook, THE App SHALL automatically invoke `processPreview` on the Preview_ImageData using the Classic Chrome preset.
2. THE App SHALL use the Classic Chrome preset for all processing. Preset selection will be added in a future spec.
3. WHILE the preview pipeline is running, THE App SHALL display a loading indicator using the accent color `#c9a96e`.
4. WHEN the processed preview is ready, THE CameraView SHALL display it within 1000ms of the image being selected on an iPhone 12 or newer (JPEG input).

---

### Requirement 16: UI Thread Non-Blocking Processing

**User Story:** As a user, I want the UI to remain responsive while my photo is being processed, so that I can still interact with the app during processing.

#### Acceptance Criteria

1. THE Pipeline_Hook SHALL send all image processing work to the Pipeline_Worker via `postMessage` with transferable `ArrayBuffer` objects.
2. WHILE the Pipeline_Worker is processing, THE App's main thread SHALL remain unblocked and interactive.
3. IF the Pipeline_Worker is unavailable (Worker construction fails), THEN THE Worker_Hook SHALL fall back to executing the pipeline on the main thread.

---

### Requirement 17: PWA Installability on iOS

**User Story:** As an iOS user, I want to install Grainframe to my home screen and use it like a native app, so that I have quick access without opening a browser.

#### Acceptance Criteria

1. THE App SHALL include the HTML meta tags `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, and `apple-touch-icon` required for iOS PWA installation.
2. THE App SHALL function correctly when launched from the iOS home screen in standalone display mode, including camera capture, import, processing, and export.
3. WHEN the app is running as an installed PWA, THE ExportButton SHALL trigger the native iOS share sheet via `navigator.share` so the user can save the image to their camera roll.
