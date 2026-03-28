# Implementation Plan: Preset Switcher & Compare

## Overview

Implement two new film presets (Soft Film, Velvia), a PresetSelector pill bar, a CompareButton for press-and-hold before/after comparison, and wire everything together in App.jsx. The dual-canvas cross-fade and two-effect draw model in CameraView are the core rendering changes.

## Tasks

- [x] 1. Add soft-film.json and velvia.json preset files
  - Create `src/presets/soft-film.json` with all flat fields matching the design spec (warmth, saturation, rMult, gMult, bMult, vignetteIntensity, grainIntensity, grainSize, grainSeed, sharpenAmount, toneCurve with rgb/r/g/b arrays)
  - Create `src/presets/velvia.json` with all flat fields matching the design spec
  - Use the complete toneCurve arrays from the design doc (5 control points per channel)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 1.1 Write unit tests for preset schema conformance
    - Load both JSON files and assert all required fields exist with correct types
    - Assert soft-film shadow output ≥ 25 (toneCurve.rgb[0][1]), saturation in 0.75–0.90, grainIntensity ≤ 0.02, vignetteIntensity ≤ 0.15
    - Assert velvia shadow output ≤ 10, saturation ≥ 1.15, bMult ≥ 1.06, grainIntensity in 0.025–0.035, vignetteIntensity ≥ 0.20
    - _Requirements: 1.1–1.5, 2.1–2.5_

- [x] 2. Add validatePreset utility and wire into App.jsx
  - Add `validatePreset(preset)` to `src/utils/presets.js` (new file) checking all `REQUIRED_PRESET_FIELDS` and toneCurve channels
  - Call `validatePreset` in `App.jsx` before each `processPreview` and `processExport` call
  - _Requirements: 7.3, 7.4_

  - [ ]* 2.1 Write unit tests for validatePreset
    - Assert throws with descriptive message when a required field is missing
    - Assert throws when toneCurve.r/g/b are absent
    - Assert passes for valid classic-chrome, soft-film, velvia presets
    - _Requirements: 7.3_

- [x] 3. Implement PresetSelector component
  - Create `src/components/PresetSelector.jsx` rendering a `<div role="toolbar">` with a horizontally scrollable pill row
  - Accept props: `presets`, `activePresetId`, `onSelect`, `isProcessing`, `visible`
  - Return null when `visible` is false
  - Apply `pill--active` class to the active pill; apply `processing` class to active pill when `isProcessing` is true
  - Create `src/styles/PresetSelector.css` with: `overflow-x: scroll; touch-action: pan-x; -webkit-overflow-scrolling: touch` on scroll container; `.pill--active { border: 2px solid #c9a96e; }`; `@keyframes pulse` animation for `.pill--active.processing`; pill min-height 44px
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.4, 5.5_

  - [ ]* 3.1 Write property test for pill render order (Property 4)
    - **Property 4: PresetSelector renders pills in declared order**
    - **Validates: Requirements 4.1**

  - [ ]* 3.2 Write property test for active pill styling (Property 5)
    - **Property 5: Active pill receives gold border styling**
    - **Validates: Requirements 5.1**

  - [ ]* 3.3 Write property test for pill tap triggering onSelect (Property 6)
    - **Property 6: Pill tap invokes onSelect with correct id**
    - **Validates: Requirements 5.2**

  - [ ]* 3.4 Write unit tests for PresetSelector
    - Assert returns null when `visible=false`
    - Assert correct pill count and text order for a mock presets array
    - Assert `pill--active` on correct pill, not on others
    - Assert `processing` class added to active pill when `isProcessing=true`
    - _Requirements: 4.2, 5.1, 5.4, 5.5_

- [x] 4. Implement CompareButton component
  - Create `src/components/CompareButton.jsx` with `aria-label="Show original photo"` and text label "ORIGINAL"
  - Accept props: `onPressStart`, `onPressEnd`, `visible`; return null when `visible` is false
  - Handle `pointerdown`/`pointerup`/`pointerleave` as primary events; `touchstart`/`touchend` as fallback; call `preventDefault()` on `touchstart`
  - Apply `compare-btn--pressed` CSS class while held
  - Create `src/styles/CompareButton.css` with `position: absolute; top: 12px; left: 12px`; min 44×44px tap target; gold accent pressed state
  - _Requirements: 6.1, 6.2, 6.5, 6.6, 6.7_

  - [ ]* 4.1 Write unit tests for CompareButton
    - Assert `aria-label="Show original photo"` present
    - Assert `onPressStart` fires on `pointerdown`, `onPressEnd` fires on `pointerup` and `pointerleave`
    - Assert returns null when `visible=false`
    - _Requirements: 6.1, 6.2, 6.6, 6.7_

- [x] 5. Refactor CameraView to dual-canvas with two draw effects
  - Add `canvasBackRef` and `canvasFrontRef` refs; render two stacked `<canvas>` elements with z-index 1 and 2
  - Add `showOriginal` prop
  - Implement Effect 1 (depends on `[showOriginal, previewImageData, preview]`): instant `putImageData` to `canvasFront` — no CSS transition
  - Implement Effect 2 (depends on `[preview]`): dual-canvas cross-fade sequence — draw to `canvasBack`, add `fading` class to `canvasFront`, on `transitionend` draw to `canvasFront`, remove `fading`, clear `canvasBack`; skip if `showOriginal` is true
  - Update `src/styles/CameraView.css`: add `.canvas-front { transition: opacity 150ms ease; }` and `.canvas-front.fading { opacity: 0; }`
  - Remove the old single `canvasRef` and its two effects
  - _Requirements: 5.6, 5.7, 6.3, 6.4, 6.8, 6.9_

  - [ ]* 5.1 Write unit tests for CameraView draw effects
    - Assert Effect 1 calls `putImageData` with `previewImageData` when `showOriginal=true`
    - Assert Effect 1 calls `putImageData` with `preview` when `showOriginal=false`
    - Assert Effect 2 adds `fading` class to `canvasFront` when new `preview` arrives
    - Assert Effect 2 is skipped when `showOriginal=true`
    - _Requirements: 6.3, 6.4, 6.8_

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Update App.jsx — state, preset wiring, and layout
  - Import `softFilm` and `velvia` JSON; define `PRESETS = [classicChrome, softFilm, velvia]`
  - Add `activePreset` state (init `classicChrome`) and `showOriginal` state (init `false`)
  - Add `handleSelectPreset(id)` that sets `activePreset` and calls `processPreview` with `validatePreset` guard
  - Update `useEffect` on `previewImageData` to reset `activePreset` to `classicChrome` on new photo load
  - Pass `showOriginal` to `CameraView`; render `PresetSelector` and `CompareButton` with correct props
  - Pass `preset={activePreset}` to `ExportButton`
  - Update `src/styles/App.css`: change `.app` to `display: flex; flex-direction: column; height: 100dvh`; add `.camera-view { flex: 1; }`, `.preset-selector { height: 48px; flex-shrink: 0; }`, `.action-bar { height: calc(80px + env(safe-area-inset-bottom)); flex-shrink: 0; }`
  - Move `.action-bar` out of CameraView's absolute positioning into the flex column
  - _Requirements: 4.3, 4.4, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.3_

  - [ ]* 7.1 Write property test for pipeline called with active preset (Property 7)
    - **Property 7: Pipeline is always called with the active preset**
    - **Validates: Requirements 5.3, 7.3, 7.4**

  - [ ]* 7.2 Write property test for no processing while compare held (Property 8)
    - **Property 8: No pipeline processing while compare is held**
    - **Validates: Requirements 6.8**

  - [ ]* 7.3 Write property test for originalImageData immutability (Property 9)
    - **Property 9: originalImageData is immutable across preset changes**
    - **Validates: Requirements 7.2**

  - [ ]* 7.4 Write property test for activePreset reset on photo load (Property 10)
    - **Property 10: activePreset resets to classic-chrome on new photo load**
    - **Validates: Requirements 7.6**

  - [ ]* 7.5 Write unit tests for App state management
    - Assert `activePreset` resets to classic-chrome when new `previewImageData` arrives
    - Assert `processPreview` is called with the newly selected preset after `handleSelectPreset`
    - Assert `showOriginal` is set to true on `onPressStart` and false on `onPressEnd`
    - _Requirements: 7.1, 7.2, 7.5, 7.6_

- [x] 8. Add pipeline property-based tests for preset distinctiveness
  - [ ]* 8.1 Write property test for three preset outputs being pixel-distinct (Property 1)
    - **Property 1: Three preset outputs are pixel-distinct**
    - **Validates: Requirements 3.1**

  - [ ]* 8.2 Write property test for soft-film shadow lift (Property 2)
    - **Property 2: Soft-film lifts shadows above classic-chrome**
    - **Validates: Requirements 3.2**

  - [ ]* 8.3 Write property test for velvia saturation boost (Property 3)
    - **Property 3: Velvia boosts saturation above classic-chrome**
    - **Validates: Requirements 3.3**

- [x] 9. Wire in-flight cancellation and performance guard
  - Verify `useImagePipeline`'s existing `requestIdRef` mechanism correctly discards stale results when `handleSelectPreset` is called rapidly
  - If needed, add an `AbortController` or request-ID check to ensure only the latest preset's result updates `preview` state
  - _Requirements: 8.2, 8.3_

  - [ ]* 9.1 Write property test for in-flight request supersession (Property 11)
    - **Property 11: In-flight pipeline requests are superseded by newer ones**
    - **Validates: Requirements 8.3**

- [x] 10. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Effect 1 and Effect 2 in CameraView must not interfere — Effect 1 is always instant, Effect 2 always cross-fades
- Property tests use fast-check with tag format: `// Feature: preset-switcher-compare, Property N: <text>`
- `validatePreset` errors propagate through `useImagePipeline`'s existing catch/ErrorBanner path
