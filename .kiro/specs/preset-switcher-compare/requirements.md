# Requirements Document

## Introduction

This feature adds two new film-look presets (Soft Film and Velvia) to the Grainframe app, a horizontal scrollable PresetSelector UI component for switching between all three presets, and a CompareButton that lets users press and hold to see the original unprocessed photo for instant before/after comparison. App.jsx is updated to wire these components together, manage active preset state, and pass the correct preset to the processing pipeline.

## Glossary

- **App**: The top-level React component (`App.jsx`) that owns global state and composes all UI components.
- **Pipeline**: The image processing pipeline in `/src/pipeline/index.js` that accepts an `ImageData` and a preset object and returns a processed `ImageData`.
- **Preset**: A JSON configuration object that parameterises all five pipeline stages (color, vignette, tone curve, grain, sharpen).
- **PresetSelector**: The horizontal scrollable pill-row UI component that displays available presets and allows the user to activate one.
- **CompareButton**: A press-and-hold button that temporarily shows the unprocessed original image while pressed, reverting to the processed image on release.
- **Original_ImageData**: The preview-resolution `ImageData` of the photo before any pipeline processing. Stored at preview resolution (max 1024px longest side) only.
- **Processed_ImageData**: The preview-resolution `ImageData` produced by running the Pipeline on the Original_ImageData with the active Preset.
- **Active_Preset**: The currently selected Preset whose parameters are applied to the Pipeline.
- **Pill**: A small rounded label element in the PresetSelector representing one Preset.
- **Cross-fade**: A CSS opacity transition between two overlapping canvas/image elements during preset switching.
- **Preview_Resolution**: Maximum 1024px on the longest side; the resolution used for all comparison and preview rendering.

---

## Requirements

### Requirement 1: Soft Film Preset Definition

**User Story:** As a photographer, I want a warm, faded film look, so that my photos have a soft, Instagram-friendly aesthetic distinct from Classic Chrome.

#### Acceptance Criteria

1. THE App SHALL include a preset file at `src/presets/soft-film.json` that conforms to the Grainframe preset schema.
2. THE `soft-film` Preset SHALL define a `toneCurve` with per-channel control points that lift blacks higher than Classic Chrome (shadow output ≥ 25 at input 0) to produce a faded-matte base.
3. THE `soft-film` Preset SHALL define `colorAdjust` values with `warmth > 0` and `saturation` between 0.75 and 0.90 to produce warm, slightly desaturated tones.
4. THE `soft-film` Preset SHALL define `grain.intensity` ≤ 0.02 to produce lower grain than Classic Chrome.
5. THE `soft-film` Preset SHALL define `vignette.intensity` ≤ 0.15 to produce a subtle or absent vignette.
6. WHEN the Pipeline processes an image with the `soft-film` Preset, THE Pipeline SHALL produce output that is visually distinct from Classic Chrome output on the same image (warmer tones, higher black lift, lower contrast).

### Requirement 2: Velvia Preset Definition

**User Story:** As a photographer, I want a vivid, high-saturation film look, so that my landscape and nature photos have punchy, vibrant colors distinct from the other presets.

#### Acceptance Criteria

1. THE App SHALL include a preset file at `src/presets/velvia.json` that conforms to the Grainframe preset schema.
2. THE `velvia` Preset SHALL define a `toneCurve` with minimal black lift (shadow output ≤ 10 at input 0) and strong highlight compression (output ≤ 230 at input 255) to produce deep shadows and rolled-off highlights.
3. THE `velvia` Preset SHALL define `colorAdjust` values with `saturation` ≥ 1.15 and `bMult` ≥ 1.06 to produce deep blues and high overall saturation.
4. THE `velvia` Preset SHALL define `grain.intensity` between 0.025 and 0.035 to produce slightly more grain than Classic Chrome.
5. THE `velvia` Preset SHALL define `vignette.intensity` ≥ 0.20 to produce a noticeable vignette that reinforces the punchy look.
6. WHEN the Pipeline processes an image with the `velvia` Preset, THE Pipeline SHALL produce output that is visually distinct from both Classic Chrome and Soft Film on the same image (higher saturation, deeper shadows, stronger vignette).

### Requirement 3: Preset Distinctiveness

**User Story:** As a user, I want each preset to look clearly different, so that switching presets gives me meaningfully different creative options.

#### Acceptance Criteria

1. WHEN the Pipeline processes the same source image with each of the three Presets (classic-chrome, soft-film, velvia), THE Pipeline SHALL produce three outputs where no two outputs are perceptually identical.
2. THE `soft-film` output SHALL have a higher average shadow luminance than the `classic-chrome` output on the same image (reflecting the higher black lift).
3. THE `velvia` output SHALL have a higher average saturation than the `classic-chrome` output on the same image.

### Requirement 4: PresetSelector Component — Structure and Visibility

**User Story:** As a user, I want to see available presets as a scrollable row of labels, so that I can quickly understand and choose between looks.

#### Acceptance Criteria

1. THE PresetSelector SHALL render a horizontally scrollable row of Pill elements, one per available Preset, in the order: Classic Chrome, Soft Film, Velvia.
2. WHILE no photo has been loaded into the App, THE PresetSelector SHALL not be visible.
3. WHEN a photo has been loaded and a Processed_ImageData is available, THE PresetSelector SHALL become visible.
4. THE PresetSelector SHALL render at the bottom of the viewport above the action bar, spanning the full viewport width.
5. THE PresetSelector SHALL support touch-based horizontal scrolling on iOS Safari without requiring a two-finger gesture (`-webkit-overflow-scrolling: touch` or `overflow-x: scroll` with `touch-action: pan-x`).

### Requirement 5: PresetSelector Component — Active State and Interaction

**User Story:** As a user, I want to see which preset is active and be able to tap another to switch, so that I have clear feedback and control.

#### Acceptance Criteria

1. THE PresetSelector SHALL display the Active_Preset's Pill with a 2px solid border in `#c9a96e` (gold accent) to indicate it is selected.
2. WHEN the user taps a Pill that is not the Active_Preset, THE App SHALL update the Active_Preset to the tapped Preset.
3. WHEN the Active_Preset changes, THE App SHALL re-run the Pipeline on the Original_ImageData with the new Active_Preset and update the Processed_ImageData.
4. WHILE the Pipeline is processing after a preset switch, THE PresetSelector SHALL display a loading indicator (gold accent dot or thin progress bar) to signal that processing is in progress.
5. WHEN the Pipeline completes after a preset switch, THE PresetSelector SHALL hide the loading indicator.
6. WHEN the Active_Preset changes and a new Processed_ImageData is available, THE App SHALL apply a 150ms cross-fade transition between the previous and new preview images.
7. THE cross-fade transition SHALL complete within 150ms and SHALL NOT produce a jarring flash or blank frame between the old and new preview.

### Requirement 6: Compare Button — Press and Hold

**User Story:** As a user, I want to press and hold a button to quickly see the original unprocessed photo, so that I can judge the effect of the active preset by seeing the full image toggle between processed and unprocessed.

#### Acceptance Criteria

1. THE App SHALL render a CompareButton in the top-left corner of the preview area. THE CompareButton SHALL only be visible after a photo has been processed.
2. THE CompareButton SHALL display a label "ORIGINAL" or an eye icon, styled with the secondary text color (`#888`) and a minimum tap target of 44x44px.
3. WHEN the user presses down on the CompareButton (`pointerdown` or `touchstart`), THE CameraView SHALL immediately replace the displayed canvas content with the unprocessed Original image (`previewImageData` from `useCamera`). There SHALL be no transition or animation — the swap must be instant so the user can see the difference clearly.
4. WHEN the user releases the CompareButton (`pointerup`, `touchend`, or `pointerleave`), THE CameraView SHALL immediately restore the displayed canvas content to the current Processed_ImageData. Again, no transition — instant swap.
5. WHILE the user is holding the CompareButton, THE CompareButton SHALL show a visible pressed state (e.g., gold accent border or slight background change) to confirm the press is registered.
6. THE CompareButton SHALL use pointer events (`pointerdown`, `pointerup`, `pointerleave`) as the primary input method, with touch events (`touchstart`, `touchend`) as fallback for older iOS versions. THE CompareButton SHALL call `preventDefault()` on `touchstart` to prevent iOS long-press context menus.
7. THE CompareButton SHALL have `aria-label="Show original photo"`.
8. WHILE the CompareButton is held, THE App SHALL NOT run any pipeline processing. It simply swaps which ImageData is drawn to the existing canvas. No new canvas is created.
9. THE swap SHALL be implemented by calling `putImageData` (or `drawImage`) on the existing CameraView canvas with the `previewImageData` (original) on press, and with the Processed_ImageData (filtered) on release. This is a single canvas operation, not a component swap.
10. THE CompareButton interaction SHALL work correctly while the PresetSelector is visible — pressing the button does not interfere with preset selection or scrolling.

### Requirement 7: App Integration — State Management

**User Story:** As a developer, I want App.jsx to own preset and comparison state, so that all child components receive consistent data.

#### Acceptance Criteria

1. THE App SHALL maintain an `activePreset` state variable initialised to the `classic-chrome` Preset.
2. THE App SHALL maintain an `originalImageData` state variable that stores the Original_ImageData at Preview_Resolution after a photo is loaded, and SHALL NOT update this variable when the Active_Preset changes.
3. THE App SHALL pass the `activePreset` to the Pipeline when processing both preview and export images.
4. WHEN `fullImageData` is available and the user triggers export, THE App SHALL process the export using the `activePreset`.
5. THE App SHALL pass `previewImageData` (unprocessed) and `preview` (processed) to CameraView. CameraView decides which to draw based on the CompareButton press state.
6. WHEN a new photo is loaded, THE App SHALL reset `activePreset` to `classic-chrome` and clear any existing `originalImageData` and `preview`.

### Requirement 8: App Integration — Preset Switching Performance

**User Story:** As a user, I want preset switching to feel fast and responsive, so that I can quickly audition different looks.

#### Acceptance Criteria

1. WHEN the user taps a new Preset Pill, THE App SHALL begin Pipeline processing within one animation frame (≤ 16ms after the tap event).
2. WHEN the Pipeline completes after a preset switch, THE App SHALL display the new Processed_ImageData within 1 second of the user's tap on a device equivalent to iPhone 12 or newer (JPEG input at Preview_Resolution).
3. THE App SHALL cancel any in-flight Pipeline request when a new preset is selected before the previous request completes, ensuring only the most recently selected preset's result is displayed.
