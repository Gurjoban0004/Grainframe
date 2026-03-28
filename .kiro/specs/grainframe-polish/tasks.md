# Implementation Plan: Grainframe Polish

## Overview

Polish, performance, and production-readiness pass. Eleven areas: landscape layout, OOM recovery hardening, performance timing, grain options wiring, PWA config + icons, UpdateToast component, accessibility audit, cross-browser compat doc, property-based tests, offline verification, and PERFORMANCE.md template.

## Tasks

- [x] 1. Landscape layout (App.css)
  - Add `@media (orientation: landscape)` block to `src/styles/App.css`
  - Switch `.app` to CSS Grid: `grid-template-columns: 1fr 80px`
  - `.camera-view` spans full height in left column (`grid-column: 1; grid-row: 1 / span 2`)
  - `.preset-selector` goes to right column as a vertical stack of small horizontal pills — use `flex-direction: column` and `overflow-y: auto`, do NOT use `writing-mode: vertical-lr`
  - `.action-bar` goes to right column below preset selector with `flex-direction: column`
  - No JS changes needed
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. OOM recovery hardening
  - [x] 2.1 Fix `IMAGE_TOO_LARGE` in `src/utils/errors.js`
    - Change `recoverable` from `false` to `true`
    - Update message to `"This image is too large to process. Try a smaller photo."`
    - _Requirements: 2.4_

  - [x] 2.2 Add OOM try/catch to `src/utils/image.js` `resizeToMax()`
    - Wrap `new OffscreenCanvas(...)` and `getImageData` calls in try/catch
    - Catch `RangeError` and errors whose message contains "memory" or "allocation"
    - Rethrow as `ErrorTypes.IMAGE_TOO_LARGE`
    - _Requirements: 2.1, 2.3_

  - [x] 2.3 Add OOM try/catch to `src/utils/export.js`
    - Wrap canvas operations in try/catch
    - Catch OOM errors, rethrow as `ErrorTypes.EXPORT_FAILED`
    - _Requirements: 2.1_

  - [ ]* 2.4 Write property test for OOM catch (Property 1)
    - **Property 1: OOM errors are caught and surfaced**
    - **Validates: Requirements 2.1**
    - Use `fc.oneof` to generate `RangeError` and memory-message errors
    - Mock `OffscreenCanvas` to throw, verify rejection is a known `ErrorTypes` value

- [x] 3. Performance timing in `useImagePipeline`
  - [x] 3.1 Add `performance.now()` timing around worker.process() calls
    - Bracket both `processPreview` and `processExport` worker calls with `t0`/`t1`
    - Log `"Pipeline preview: Xms"` / `"Pipeline export: Xms"` only when `import.meta.env.DEV` is true
    - Apply to both the worker path and the main-thread fallback path
    - _Requirements: 3.6_

  - [ ]* 3.2 Write property test for DEV timing log (Property 2)
    - **Property 2: DEV mode pipeline timing is always logged**
    - **Validates: Requirements 3.6**
    - Spy on `console.log`, set `import.meta.env.DEV = true`, call `processPreview`
    - Verify `console.log` was called with a string matching `/Pipeline preview: \d+ms/`

- [x] 4. Grain options wiring in `useImagePipeline`
  - [x] 4.1 Pass full options object to worker.process() calls
    - Preview call: `worker.process(clone, preset, { mode: 'preview', previewWidth: PREVIEW_MAX_DIM })`
    - Export call: `worker.process(clone, preset, { mode: 'export', previewWidth: PREVIEW_MAX_DIM, exportWidth: imageData.width })`
    - Extract `PREVIEW_MAX_DIM` constant (1024) at top of file if not already present
    - Update the main-thread fallback paths to pass the same options objects
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 4.2 Verify `src/pipeline/index.js` passes options through to `applyGrain()`
    - Confirm `applyGrain(out, preset, options)` call already passes the full options object (no change needed if correct)
    - _Requirements: 4.1, 4.2_

  - [x] 4.3 Write property test for grain blur radius scaling (Property 3)
    - **Property 3: Grain blur radius scales with export/preview ratio**
    - **Validates: Requirements 4.1, 4.2**
    - Use `fc.integer` for `previewWidth` (100–1024) and `exportWidth` (1025–4096), `fc.float` for `grainSize`
    - Preset uses flat fields: `{ grainIntensity, grainSize, grainSeed }` — NOT nested `grain.size`
    - Verify `blurRadius` in export mode equals `Math.max(0.5, grainSize * (exportWidth / previewWidth))`

  - [x] 4.4 Write property test for preview mode grain (Property 4)
    - **Property 4: Preview mode grain uses unscaled base size**
    - **Validates: Requirements 4.3**
    - Use `fc.record({ grainIntensity, grainSize, grainSeed })` — flat fields, not nested
    - Call `applyGrain` with `mode: 'preview'`, verify `blurRadius = Math.max(0.5, preset.grainSize)`

  - [x] 4.5 Write property test for export grain visibility (Property 5)
    - **Property 5: Export grain is visible for any non-zero intensity**
    - **Validates: Requirements 4.4**
    - Preset: `{ grainIntensity: intensity, grainSize: 1, grainSeed: 42 }` — flat fields, not nested
    - Use `fc.float({ min: 0.001, max: 0.04 })` for intensity, verify at least one pixel differs after `applyGrain`

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. PWA config and icons
  - [x] 6.1 Update `vite.config.js`
    - Add `navigateFallback: 'index.html'` to the `workbox` config
    - Add `icons` array to the manifest with all three sizes (192, 512, 180)
    - Do NOT add a `runtimeCaching` entry for blob: URLs — blob URLs never pass through the service worker
    - _Requirements: 5.1, 5.2, 8.6_

  - [x] 6.2 Verify `index.html` PWA meta tags
    - Confirm `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, `apple-touch-icon` link to `/icons/icon-180.png`, and `theme-color` are all present (already in file — verify only, add any missing)
    - _Requirements: 8.5_

  - [x] 6.3 Create `scripts/generate-icons.js` and generate PNG files
    - First run `npm install --save-dev canvas` in the `grainframe/` directory
    - Note: the `canvas` package requires native build tools (node-gyp, Python, C++ compiler). If the build fails, use the `sharp` package as a fallback: `npm install --save-dev sharp` and adapt the script to use `sharp` SVG-to-PNG conversion
    - If neither works, create the icons manually using any image editor and place them at `public/icons/icon-192.png`, `icon-512.png`, `icon-180.png`
    - Script draws `#0e0e0e` background and bold "G" in `#c9a96e` at sizes 192, 512, 180
    - Write PNG files to `public/icons/icon-{size}.png`
    - Run `node scripts/generate-icons.js` to generate the actual files
    - Verify `public/icons/icon-192.png`, `icon-512.png`, `icon-180.png` are created
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.7_

- [x] 7. UpdateToast component
  - [x] 7.1 Create `src/components/UpdateToast.jsx`
    - Listen for `navigator.serviceWorker` `controllerchange` event — do NOT import from `virtual:pwa-register/react` and do NOT use `onNeedRefresh` (it does not fire with `registerType: 'autoUpdate'`)
    - On `controllerchange`: set `visible = true`
    - Auto-dismiss after 3000ms via `setTimeout` in a `useEffect`
    - Render `<div className="update-toast" role="status" aria-live="polite">App updated</div>` when visible
    - Clean up the event listener on unmount
    - _Requirements: 9.1, 9.2, 9.5_

  - [x] 7.2 Create `src/styles/UpdateToast.css`
    - Position bottom-center: `bottom: calc(80px + env(safe-area-inset-bottom) + 12px)`
    - Background `#1a1a1a`, text `#f0ede8`
    - Ensure it does not overlap action bar controls
    - _Requirements: 9.3, 9.4_

  - [x] 7.3 Mount `<UpdateToast />` in `src/App.jsx`
    - Import and render inside the `.app` div
    - _Requirements: 9.1_

  - [ ]* 7.4 Write property test for UpdateToast auto-dismiss (Property 7)
    - **Property 7: UpdateToast auto-dismisses after 3 seconds**
    - **Validates: Requirements 9.2**
    - Use `vi.useFakeTimers()`, simulate `controllerchange` event on `navigator.serviceWorker`
    - Advance timers by 3000ms, verify toast is no longer visible
    - Do NOT use `onNeedRefresh` or `virtual:pwa-register/react` in the test

- [x] 8. Accessibility audit
  - [x] 8.1 Verify and fix aria-labels on all interactive buttons
    - Check `App.jsx` import and capture buttons (already have `aria-label` — verify)
    - Check `ExportButton.jsx` has `aria-label`
    - Check each preset button in `PresetSelector.jsx` has `aria-label`
    - Check `CompareButton.jsx` has `role="button"` and `aria-label="Show original photo"` (verify only)
    - _Requirements: 7.1, 7.2_

  - [x] 8.2 Verify and fix `ErrorBanner.jsx` ARIA attributes
    - Ensure `aria-live="polite"` and `role="alert"` are present
    - _Requirements: 7.3_

  - [x] 8.3 Add `focus-visible` outline to `src/index.css`
    - Add `:focus-visible { outline: 2px solid #c9a96e; outline-offset: 2px; }`
    - _Requirements: 7.4_

  - [ ]* 8.4 Write property test for aria-labels (Property 6)
    - **Property 6: All interactive buttons have aria-labels**
    - **Validates: Requirements 7.1**
    - Render App, query all `role="button"` elements, verify each has a non-empty `aria-label`

- [x] 9. Cross-browser compatibility doc
  - Create `BROWSER-COMPAT.md` at repo root
  - Include pass/fail table for: Safari iOS 15+, Safari iOS 16+, Chrome Android, Chrome desktop, Firefox desktop, Safari desktop
  - Note the synchronous main-thread fallback for environments without `OffscreenCanvas` (no setTimeout yields — existing Spec 2 implementation)
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

- [x] 10. Create PERFORMANCE.md template
  - Create `PERFORMANCE.md` at project root
  - Include a per-stage timing breakdown table with columns: Stage, Preview (ms), Export (ms), Notes
  - Stages: colorspace linearize, color transform, vignette, colorspace delinearize, tone curve, grain, sharpen
  - Include a section for overall pipeline time and the 800ms / 3s targets
  - Include instructions for how to fill it in using the DEV console logs from Task 3.1
  - _Requirements: 3.5_

- [x] 11. Offline verification (manual verification task — no code changes)
  - Build the app: `npm run build` in the `grainframe/` directory
  - Deploy to Vercel or serve locally with `npx serve dist`
  - Install the PWA to an iPhone home screen via Safari
  - Enable airplane mode
  - Launch the app from the home screen and verify it opens fully
  - Import a photo and process it through the pipeline — verify it works offline
  - If any asset fails to load: check `vite.config.js` `globPatterns` includes the missing file type and redeploy
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Tasks 4.3, 4.4, 4.5 are NOT optional — grain scaling is a core correctness requirement
- Preset schema uses flat fields: `grainIntensity`, `grainSize`, `grainSeed` — NOT nested `grain.intensity` etc. Verify against `src/presets/classic-chrome.json`
- Property tests go in `src/pipeline/__tests__/grain.test.js` (Properties 3, 4, 5) and `src/utils/__tests__/utils.test.js` (Properties 1, 2) and component test files (Properties 6, 7)
- Use fast-check for property-based tests, Vitest for all tests
- Task 4.2 is a verification step — if `pipeline/index.js` already passes options correctly, no code change is needed
- `BROWSER-COMPAT.md` is a template to be filled in after manual testing; the file itself is the coding deliverable
- Task 11 is a manual verification task — it produces no code changes but may reveal config fixes needed in Task 6.1
