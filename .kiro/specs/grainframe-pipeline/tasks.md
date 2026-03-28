# Implementation Plan: Grainframe Image Processing Pipeline

## Overview

Implement and validate the full Grainframe pipeline in `grainframe/src/pipeline/`. Most modules already exist; the primary work is implementing the missing `color.js` module, wiring up the test suite with Vitest + fast-check, and verifying all 16 correctness properties.

## Tasks

- [x] 1. Install fast-check and configure Vitest
  - Add `fast-check` and `vitest` as dev dependencies in `grainframe/package.json`
  - Add a `test` script: `"test": "vitest --run"`
  - Create `grainframe/src/pipeline/__tests__/` directory
  - _Requirements: 3.1 (testing strategy)_

- [x] 2. Implement `color.js` — Color Grading in Linear Light
  - [x] 2.1 Implement `applyColor(imageData, preset)` in `grainframe/src/pipeline/color.js`
    - Convert sRGB → linear via `srgbToLinearLUT`
    - Apply `rMult`, `gMult`, `bMult` per-channel multipliers
    - Convert linear RGB → HSL, scale S by `saturation`, convert back
    - Add `warmth` to R channel, subtract from B channel in linear light
    - Convert linear → sRGB via `linearToSrgbLUT`
    - Zero imports from any UI framework or React
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 2.2 Write property test for color module no-op identity (Property 3)
    - **Property 3: Color Module No-Op Identity**
    - **Validates: Requirements 4.1, 4.5**
    - File: `__tests__/color.test.js`

  - [ ]* 2.3 Write property test for saturation zero produces grayscale (Property 4)
    - **Property 4: Saturation Zero Produces Grayscale**
    - **Validates: Requirements 4.3**
    - File: `__tests__/color.test.js`

  - [ ]* 2.4 Write property test for warmth channel shifts (Property 5)
    - **Property 5: Warmth Shifts Red and Blue Channels**
    - **Validates: Requirements 4.4**
    - File: `__tests__/color.test.js`

- [x] 3. Validate `colorspace.js` with tests
  - [x] 3.1 Write unit tests for `colorspace.js`
    - Test `srgbToLinearLUT[0] === 0` and `srgbToLinearLUT[255] ≈ 1`
    - Test LUT lengths are exactly 256
    - File: `__tests__/colorspace.test.js`
    - _Requirements: 1.1, 1.2, 1.4_

  - [ ]* 3.2 Write property test for color space round-trip (Property 1)
    - **Property 1: Color Space Round-Trip**
    - **Validates: Requirements 1.5**
    - File: `__tests__/colorspace.test.js`

- [x] 4. Validate `tonecurve.js` with tests
  - [x] 4.1 Write unit tests for `tonecurve.js`
    - Test identity curve `[[0,0],[255,255]]` produces identity LUT
    - Test `buildToneCurveLUTs` returns `r`, `g`, `b` Uint8Arrays of length 256
    - File: `__tests__/tonecurve.test.js`
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 4.2 Write property test for tone curve LUT validity (Property 2)
    - **Property 2: Tone Curve LUT Validity**
    - **Validates: Requirements 3.1, 3.2**
    - File: `__tests__/tonecurve.test.js`

- [x] 5. Checkpoint — Ensure all tests pass so far
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Validate `vignette.js` with tests
  - [x] 6.1 Write unit tests for `vignette.js`
    - Test that `vignetteIntensity=0` leaves all pixels unchanged
    - Test that center pixels are not darkened
    - File: `__tests__/vignette.test.js`
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 6.2 Write property test for vignette only darkens (Property 6)
    - **Property 6: Vignette Only Darkens**
    - **Validates: Requirements 5.2**
    - File: `__tests__/vignette.test.js`

  - [ ]* 6.3 Write property test for vignette corner cap (Property 7)
    - **Property 7: Vignette Corner Cap**
    - **Validates: Requirements 5.4**
    - File: `__tests__/vignette.test.js`

- [x] 7. Validate `grain.js` with tests
  - [x] 7.1 Write unit tests for `grain.js`
    - Test that `grainIntensity=0` leaves all pixels unchanged
    - File: `__tests__/grain.test.js`
    - _Requirements: 6.1, 6.2_

  - [ ]* 7.2 Write property test for grain determinism (Property 8)
    - **Property 8: Grain Determinism**
    - **Validates: Requirements 6.1**
    - File: `__tests__/grain.test.js`

  - [ ]* 7.3 Write property test for grain luminance dependence (Property 9)
    - **Property 9: Grain Luminance Dependence**
    - **Validates: Requirements 6.3**
    - File: `__tests__/grain.test.js`

  - [ ]* 7.4 Write property test for grain channel asymmetry (Property 10)
    - **Property 10: Grain Channel Asymmetry**
    - **Validates: Requirements 6.4**
    - File: `__tests__/grain.test.js`

  - [ ]* 7.5 Write property test for grain intensity clamp (Property 11)
    - **Property 11: Grain Intensity Clamp**
    - **Validates: Requirements 6.6**
    - File: `__tests__/grain.test.js`

- [x] 8. Validate `sharpen.js` with tests
  - [x] 8.1 Write unit tests for `sharpen.js`
    - Test that `sharpenAmount=0` leaves all pixels unchanged
    - File: `__tests__/sharpen.test.js`
    - _Requirements: 7.1, 7.5_

  - [ ]* 8.2 Write property test for sharpen no-op at zero (Property 12)
    - **Property 12: Sharpen Amount Zero Is No-Op**
    - **Validates: Requirements 7.2**
    - File: `__tests__/sharpen.test.js`

  - [ ]* 8.3 Write property test for sharpen output clamped (Property 13)
    - **Property 13: Sharpen Output Clamped**
    - **Validates: Requirements 7.3**
    - File: `__tests__/sharpen.test.js`

  - [ ]* 8.4 Write property test for sharpen amount cap (Property 14)
    - **Property 14: Sharpen Amount Cap**
    - **Validates: Requirements 7.4**
    - File: `__tests__/sharpen.test.js`

- [x] 9. Validate `blur.js` with tests
  - [x] 9.1 Write unit tests for `blur.js`
    - Test that `gaussianBlur` returns an ImageData with the same width and height as input
    - File: `__tests__/blur.test.js`
    - _Requirements: 8.3_

- [x] 10. Validate `index.js` (pipeline orchestrator) with tests
  - [x] 10.1 Write unit tests for `index.js`
    - Test that `processImage` returns an ImageData with the same dimensions as input
    - Test stage ordering by verifying Classic Chrome lifts blacks and compresses highlights
    - File: `__tests__/index.test.js`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ]* 10.2 Write property test for processImage does not mutate input (Property 15)
    - **Property 15: processImage Does Not Mutate Input**
    - **Validates: Requirements 9.1, 9.6**
    - File: `__tests__/index.test.js`

  - [ ]* 10.3 Write property test for Classic Chrome lifts blacks and compresses highlights (Property 16)
    - **Property 16: Classic Chrome Lifts Blacks and Compresses Highlights**
    - **Validates: Requirements 12.5**
    - File: `__tests__/index.test.js`

- [x] 11. Validate `bridge.js` and `worker.js` with tests
  - [x] 11.1 Write unit tests for `bridge.js`
    - Test that `createPipelineWorker()` returns an object with `process` and `terminate` methods
    - Test that `process()` returns a Promise
    - Test that `terminate()` rejects any pending promise
    - File: `__tests__/bridge.test.js`
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 12. Validate Classic Chrome preset with tests
  - [x] 12.1 Write unit tests for the Classic Chrome preset
    - Test that all required fields are present and within valid ranges
    - Test `grainIntensity` is in [0.01, 0.04]
    - Test tone curve shadow output > 0 and highlight output < 255
    - File: `__tests__/presets.test.js`
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [x] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each property test must run a minimum of 100 iterations (`{ numRuns: 100 }` or higher)
- Tag each property test with a comment: `// Feature: grainframe-pipeline, Property N: <Title>`
- `color.js` is the only pipeline module that needs to be created from scratch
- All other pipeline modules already exist and only need test coverage
- Run tests with: `npx vitest --run` from the `grainframe/` directory
