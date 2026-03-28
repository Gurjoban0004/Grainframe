# Requirements Document

## Introduction

Phase 3 polish, performance, and production readiness for the Grainframe PWA. This phase covers landscape layout adaptation, out-of-memory recovery verification, performance optimization, grain resolution consistency, offline verification, cross-browser compatibility, accessibility, PWA icon generation, and a PWA update notification. The goal is a native-feeling, production-ready iPhone PWA with no UI freezes, sub-800ms preview rendering, and full offline capability.

## Glossary

- **App**: The Grainframe React + Vite PWA
- **Pipeline**: The image processing pipeline in `/src/pipeline/`, running in a Web Worker
- **Preview**: The downscaled (max 1024px) processed image shown in the UI
- **Export**: The full-resolution processed image saved by the user
- **OOM**: Out-of-memory condition, typically a `RangeError` or allocation failure thrown by the browser during canvas operations
- **Memory_Module**: The module at `/src/utils/memory.js`
- **Grain_Stage**: The film grain stage in `/src/pipeline/grain.js`
- **PresetSelector**: The horizontal preset strip component at the bottom of the UI
- **CameraView**: The full-screen image preview component
- **CompareButton**: The button that reveals the original (unprocessed) photo while held
- **ErrorBanner**: The dismissible error notification component at the top of the viewport
- **Service_Worker**: The Workbox-generated service worker managed by `vite-plugin-pwa`
- **PWA**: Progressive Web App installed to the iPhone home screen via Safari
- **VoiceOver**: The iOS screen reader used for accessibility testing

---

## Requirements

### Requirement 1: Landscape Layout

**User Story:** As a user, I want the app to be usable in landscape orientation, so that I can use Grainframe without rotating my phone.

#### Acceptance Criteria

1. WHEN the device orientation is landscape, THE App SHALL use a two-column layout: the CameraView fills the left column and the PresetSelector plus action bar stack vertically in a right column of fixed width (approximately 80px).
2. WHEN the device orientation is landscape, THE App SHALL ensure all controls (capture button, import button, export button, preset selector, compare button) remain visible and reachable without scrolling.
3. WHEN the device orientation is landscape, THE CameraView SHALL expand to fill the available space not occupied by the right column.
4. THE App SHALL implement landscape layout using a `@media (orientation: landscape)` CSS rule without JavaScript orientation detection.
5. IF the device is in landscape orientation, THEN THE App SHALL NOT display a "rotate your device" message.

---

### Requirement 2: OOM Recovery

**User Story:** As a user, I want the app to recover gracefully when processing a very large image, so that I see a helpful error instead of a crash or silent failure.

**Scope note:** The OOM retry logic (downscale to 50% and retry) is already implemented in `useImagePipeline`. This requirement covers only: (a) verifying that existing recovery works end-to-end, and (b) adding try/catch protection to canvas operations outside the pipeline worker that are not yet guarded — specifically export canvas creation in `utils/export.js` and image loading in `utils/image.js`.

#### Acceptance Criteria

1. WHEN a canvas operation in `utils/export.js` or `utils/image.js` throws a `RangeError` or an error whose message contains "memory" or "allocation", THE App SHALL catch the error and surface it as a user-facing error rather than an unhandled rejection.
2. WHEN the existing OOM retry in `useImagePipeline` succeeds at 50% resolution, THE App SHALL display the processed image without showing an error to the user.
3. IF both the original and 50%-resolution attempts fail with an OOM error, THEN THE App SHALL display the `IMAGE_TOO_LARGE` error via the ErrorBanner.
4. THE `IMAGE_TOO_LARGE` error in `utils/errors.js` SHALL have `recoverable: true`, the message "This image is too large to process. Try a smaller photo.", and SHALL be treated by the ErrorBanner as a recoverable error with a "Try Again" action that re-opens the file picker.
5. THE App SHALL NOT duplicate the downscale-and-retry logic that already exists in `useImagePipeline`.

---

### Requirement 3: Performance Targets

**User Story:** As a user, I want the app to feel fast on my iPhone, so that switching presets and exporting images does not feel sluggish.

#### Acceptance Criteria

1. WHEN a preview is requested on an iPhone 12 or newer running Safari, THE Pipeline SHALL complete preview rendering in under 800ms from the time the image data is sent to the Web Worker.
2. WHEN an export is requested for a 12MP JPEG image on an iPhone 12 or newer running Safari, THE Pipeline SHALL complete export processing in under 3 seconds.
3. WHEN the Pipeline is processing, THE App SHALL keep the main thread unblocked so that the loading indicator animates without interruption.
4. IF the 800ms preview target is not met during profiling, THEN THE App SHALL reduce the preview resolution from 1024px to 768px on the longest side to bring rendering within the target.
5. IF the 3-second export target is not met during profiling, THEN THE App SHALL produce a `PERFORMANCE.md` file documenting per-stage timing breakdown (colorspace conversion, color transform, vignette, tone curve, grain, sharpen) measured via `performance.now()`.
6. THE `useImagePipeline` hook SHALL log `"Pipeline [preview|export]: Xms"` to the console in development mode (`import.meta.env.DEV`) using `performance.now()` timestamps bracketing the worker round-trip.

---

### Requirement 4: Grain Resolution Consistency

**User Story:** As a user, I want the film grain to look perceptually similar between the preview and the exported image, so that the exported result matches what I saw on screen.

#### Acceptance Criteria

1. THE Grain_Stage SHALL scale the grain `size` parameter proportionally to the ratio of export resolution to preview resolution before applying grain at export resolution.
2. WHEN processing in export mode, THE Grain_Stage SHALL use a `blurRadius` equal to `baseSize * (exportWidth / previewWidth)` where `previewWidth` is the max preview dimension (1024px, or 768px if the preview resolution was reduced per Requirement 3.4).
3. WHEN processing in preview mode, THE Grain_Stage SHALL use the base `size` parameter without scaling.
4. THE Grain_Stage SHALL NOT produce grain that is invisible at export resolution for any preset with `grain.intensity` greater than 0.
5. THE Grain_Stage SHALL NOT produce grain that is visually overwhelming at preview resolution for any preset with `grain.intensity` at or below 0.04.

---

### Requirement 5: Offline Functionality

**User Story:** As a user, I want the app to work fully offline after the first load, so that I can use Grainframe without an internet connection.

**Scope note:** The service worker is already configured via `vite-plugin-pwa`. This requirement covers verification and fixing any gaps in the existing configuration — not reimplementing the service worker.

#### Acceptance Criteria

1. WHEN the PWA is launched in airplane mode after a prior successful load, THE App SHALL open and display the full UI without a network request.
2. WHEN the PWA is launched offline, THE Service_Worker SHALL serve all app assets (JS, CSS, HTML, PNG, JSON) from the Workbox cache.
3. WHEN the PWA is launched offline, THE Service_Worker SHALL serve all preset JSON files from the Workbox cache.
4. WHEN the PWA is launched offline, THE App SHALL allow the user to capture or import a photo and process it through the full pipeline.
5. THE Service_Worker SHALL use `NetworkOnly` caching for user-captured or imported image files so that user photos are never written to the service worker cache.

---

### Requirement 6: Cross-Browser Compatibility

**User Story:** As a developer, I want documented cross-browser test results, so that I know which browsers are supported and which have known limitations.

#### Acceptance Criteria

1. THE App SHALL function correctly on Safari iOS 15+ as the primary target browser.
2. WHERE OffscreenCanvas is available (Safari iOS 16+), THE App SHALL use OffscreenCanvas for pipeline canvas operations inside the Web Worker.
3. WHERE OffscreenCanvas is not available, THE App SHALL run the pipeline synchronously on the main thread (the existing fallback path implemented in Spec 2) without adding `setTimeout` yields.
4. THE App SHALL function correctly on Chrome for Android (latest stable release).
5. THE App SHALL function correctly on Chrome desktop (latest stable release).
6. THE App SHALL function correctly on Firefox desktop (latest stable release).
7. THE App SHALL function correctly on Safari desktop (latest stable release).
8. THE App SHALL produce a `BROWSER-COMPAT.md` document recording pass/fail status for each target browser listed in acceptance criteria 1 through 7.

---

### Requirement 7: Accessibility

**User Story:** As a user relying on assistive technology, I want all controls to be reachable and labelled, so that I can use Grainframe with VoiceOver on iOS.

#### Acceptance Criteria

1. THE App SHALL provide an `aria-label` attribute on every interactive button, including capture, import, export, compare, and preset selection buttons.
2. THE CompareButton SHALL have `role="button"` and `aria-label="Show original photo"`.
3. THE ErrorBanner SHALL have `aria-live="polite"` and `role="alert"` so that screen readers announce errors without interrupting the user.
4. THE App SHALL apply a `focus-visible` outline using the gold accent color (`#c9a96e`) with a 2px offset on all interactive elements.
5. THE App SHALL maintain a logical tab order so that keyboard and VoiceOver navigation proceeds from top to bottom: error banner, compare button, export button, preset selector, action bar.
6. WHEN VoiceOver is active on iOS, THE App SHALL allow navigation to and activation of all interactive controls without requiring a gesture unsupported by VoiceOver.
7. THE App SHALL ensure all interactive tap targets are at minimum 44×44px in size.

---

### Requirement 8: PWA Icons

**User Story:** As a user, I want the app to have a proper icon when installed to my iPhone home screen, so that Grainframe looks like a native app.

#### Acceptance Criteria

1. THE App SHALL provide a PNG icon at 192×192 pixels at `/public/icons/icon-192.png`.
2. THE App SHALL provide a PNG icon at 512×512 pixels at `/public/icons/icon-512.png`.
3. THE App SHALL provide a PNG icon at 180×180 pixels at `/public/icons/icon-180.png` for use as the Apple touch icon.
4. THE App SHALL render each icon with a dark background color of `#0e0e0e` and a "G" lettermark in the accent color `#c9a96e`.
5. THE App SHALL reference the 180×180 icon via `<link rel="apple-touch-icon" href="/icons/icon-180.png">` in `index.html`.
6. THE App SHALL reference all three icon sizes in the `vite-plugin-pwa` manifest configuration so they are included in the web app manifest.
7. WHEN the PWA is installed to the iPhone home screen, THE App SHALL display the "G" lettermark icon rather than a blank or default icon.

---

### Requirement 9: PWA Update Notification

**User Story:** As a user, I want to know when the app has been updated, so that I am aware I am running the latest version.

#### Acceptance Criteria

1. WHEN `vite-plugin-pwa`'s `onNeedRefresh` callback fires (indicating a new service worker is waiting), THE App SHALL display a toast notification with the text "App updated".
2. THE toast notification SHALL be visible for 3 seconds and then dismiss automatically without requiring user interaction.
3. THE toast notification SHALL NOT block or obscure the main UI controls during its display.
4. THE toast notification SHALL use the app's existing color palette: dark background (`#1a1a1a`), warm white text (`#f0ede8`).
5. THE App SHALL use `vite-plugin-pwa`'s `useRegisterSW` hook (or equivalent) to detect the update event — no custom service worker logic is required.
