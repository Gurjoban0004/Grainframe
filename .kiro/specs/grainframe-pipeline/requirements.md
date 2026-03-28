# Requirements Document

## Introduction

The Grainframe Image Processing Pipeline is a framework-agnostic, pure-function image processing system that applies a sequence of photographic film emulation effects to an ImageData object. The pipeline operates in two color spaces — linear light for physically accurate operations and sRGB/perceptual space for tone and grain operations — and is designed to run in a Web Worker for non-blocking performance. The pipeline supports a preset-driven configuration (e.g., Classic Chrome) and produces output suitable for both live preview and full-resolution export.

## Glossary

- **Pipeline**: The ordered sequence of image processing stages executed on an ImageData object.
- **ImageData**: A standard Web API object containing raw RGBA pixel data, width, and height.
- **Preset**: A JSON configuration object defining parameters for all pipeline stages.
- **Linear_Light**: A linear radiometric color space where values are proportional to physical light intensity.
- **sRGB**: The standard gamma-encoded color space used for display; values are perceptually uniform.
- **LUT**: Look-Up Table — a pre-computed array mapping input values (0–255) to output values.
- **Tone_Curve**: A per-channel brightness/contrast adjustment defined by control points and interpolated as a spline.
- **Vignette**: A radial darkening effect applied at the image edges.
- **Grain**: Simulated film grain noise added to the image.
- **Unsharp_Mask**: A sharpening technique that subtracts a blurred version of the image from the original.
- **Catmull_Rom**: A type of cubic spline interpolation used to generate smooth tone curves from control points.
- **Worker**: A Web Worker thread that runs the pipeline off the main browser thread.
- **Bridge**: The main-thread JavaScript module that manages Worker lifecycle and message passing.
- **OffscreenCanvas**: A browser API for canvas rendering outside the main thread.
- **Transferable**: A Web API mechanism for zero-copy transfer of ArrayBuffer/ImageData between threads.
- **Colorspace_Module**: The pipeline module responsible for sRGB ↔ linear light conversion.
- **Canvas_Utils**: The pipeline module providing canvas and context creation helpers.
- **Tone_Curve_Module**: The pipeline module that builds and applies tone curve LUTs.
- **Color_Module**: The pipeline module that applies color grading in linear light.
- **Grain_Module**: The pipeline module that generates and applies film grain.
- **Vignette_Module**: The pipeline module that applies radial vignette in linear light.
- **Sharpen_Module**: The pipeline module that applies unsharp mask sharpening.
- **Blur_Module**: The pipeline module providing Gaussian blur as a utility.
- **Index_Module**: The pipeline entry point that orchestrates all stages.

---

## Requirements

### Requirement 1: Color Space Conversion

**User Story:** As a developer, I want accurate sRGB ↔ linear light conversion, so that color operations are physically correct.

#### Acceptance Criteria

1. THE Colorspace_Module SHALL export a 256-entry pre-computed LUT named `srgbToLinearLUT` mapping 8-bit sRGB values to linear light values in the range [0.0, 1.0].
2. THE Colorspace_Module SHALL export a 256-entry pre-computed LUT named `linearToSrgbLUT` mapping 256 evenly-spaced linear light values back to 8-bit sRGB values.
3. THE Colorspace_Module SHALL NOT export per-pixel conversion functions as the public API; LUTs SHALL be the sole public interface.
4. WHEN a value of 0 is converted from sRGB to linear, THE Colorspace_Module SHALL produce 0.0.
5. WHEN a value of 255 is converted from sRGB to linear and back, THE Colorspace_Module SHALL produce a value within ±1 of 255 (round-trip property).
6. THE Colorspace_Module SHALL contain zero imports from any UI framework or React.

### Requirement 2: Canvas and Context Utilities

**User Story:** As a developer, I want a reliable canvas creation utility, so that pipeline stages can render off-screen without depending on the DOM.

#### Acceptance Criteria

1. THE Canvas_Utils SHALL export a `createCanvas(width, height)` function that returns an OffscreenCanvas when the browser supports it, and falls back to a standard HTMLCanvasElement otherwise.
2. THE Canvas_Utils SHALL export a `getContext(canvas, options)` function that attempts to obtain a `2d` context with Display P3 color space, and falls back to a standard `2d` context if Display P3 is unavailable.
3. IF OffscreenCanvas is unavailable, THEN THE Canvas_Utils SHALL create a canvas element via `document.createElement('canvas')` without throwing an error.
4. THE Canvas_Utils SHALL contain zero imports from any UI framework or React.

### Requirement 3: Tone Curve Application

**User Story:** As a developer, I want a tone curve applied in sRGB space, so that brightness and contrast adjustments match perceptual expectations.

#### Acceptance Criteria

1. WHEN a preset provides per-channel control points, THE Tone_Curve_Module SHALL generate a 256-entry LUT per channel (R, G, B) using Catmull-Rom spline interpolation.
2. THE Tone_Curve_Module SHALL apply a monotonicity clamp to each generated LUT so that output values never decrease as input values increase.
3. WHEN the tone curve is applied to an ImageData, THE Tone_Curve_Module SHALL perform a direct array lookup per pixel with no floating-point math at apply time.
4. THE Tone_Curve_Module SHALL operate exclusively on sRGB (gamma-encoded) pixel values, not on linear light values.
5. THE Tone_Curve_Module SHALL contain zero imports from any UI framework or React.

### Requirement 4: Color Grading in Linear Light

**User Story:** As a developer, I want color grading (saturation, channel multipliers, warmth) applied in linear light, so that color math is physically accurate.

#### Acceptance Criteria

1. THE Color_Module SHALL convert input pixel values from sRGB to linear light before any color operation using `srgbToLinearLUT`.
2. THE Color_Module SHALL apply per-channel multipliers (`rMult`, `gMult`, `bMult`) from the preset to linear light values.
3. THE Color_Module SHALL apply a saturation scaling operation by converting linear RGB to HSL, scaling the S component by the preset's saturation factor, and converting back to linear RGB.
4. THE Color_Module SHALL apply a warmth shift by adding a preset-defined offset to the R channel and subtracting it from the B channel in linear light.
5. THE Color_Module SHALL convert results back to sRGB using `linearToSrgbLUT` after all color operations are complete.
6. THE Color_Module SHALL contain zero imports from any UI framework or React.

### Requirement 5: Vignette in Linear Light

**User Story:** As a developer, I want a radial vignette applied in linear light using multiply blend, so that edge darkening is physically accurate.

#### Acceptance Criteria

1. THE Vignette_Module SHALL compute a radial falloff per pixel where the inner radius is 50% of the shorter image dimension and the outer radius is 75% of the longer image dimension.
2. THE Vignette_Module SHALL apply the vignette using multiply blend: `pixel *= 1.0 - (intensity * falloff)`.
3. THE Vignette_Module SHALL operate on linear light values (after sRGB-to-linear conversion).
4. THE Vignette_Module SHALL limit the maximum corner darkening to 25% (i.e., falloff at corners SHALL NOT exceed 0.25 when intensity is 1.0).
5. THE Vignette_Module SHALL contain zero imports from any UI framework or React.

### Requirement 6: Film Grain

**User Story:** As a developer, I want luminance-dependent film grain, so that shadows receive more grain as in real film.

#### Acceptance Criteria

1. THE Grain_Module SHALL generate a noise field using a seeded pseudo-random number generator so that grain is reproducible for a given seed.
2. THE Grain_Module SHALL apply a Gaussian blur to the noise field using `ctx.filter = 'blur(Xpx)'` to simulate grain clumping.
3. THE Grain_Module SHALL scale grain intensity inversely with pixel luminance so that darker pixels receive more grain than brighter pixels.
4. THE Grain_Module SHALL apply slightly more grain to the R and B channels than to the G channel to simulate color film grain variation.
5. THE Grain_Module SHALL scale grain size proportionally to the ratio between export resolution and preview resolution.
6. THE Grain_Module SHALL clamp the maximum grain intensity to 0.04 (i.e., no pixel channel SHALL be shifted by more than 4% of full scale due to grain alone).
7. THE Grain_Module SHALL contain zero imports from any UI framework or React.

### Requirement 7: Sharpening via Unsharp Mask

**User Story:** As a developer, I want unsharp mask sharpening applied in sRGB space, so that edge enhancement is perceptually correct.

#### Acceptance Criteria

1. THE Sharpen_Module SHALL produce a blurred version of the input using `ctx.filter = 'blur(1px)'`.
2. THE Sharpen_Module SHALL compute the sharpened output as `output = original + (original - blurred) * amount`.
3. THE Sharpen_Module SHALL clamp all output values to the range [0, 255].
4. THE Sharpen_Module SHALL limit the sharpening amount to a maximum of 0.3.
5. THE Sharpen_Module SHALL operate on sRGB (gamma-encoded) pixel values.
6. THE Sharpen_Module SHALL contain zero imports from any UI framework or React.

### Requirement 8: Gaussian Blur Utility

**User Story:** As a developer, I want a reusable Gaussian blur helper, so that grain and sharpen stages can blur image data efficiently.

#### Acceptance Criteria

1. THE Blur_Module SHALL apply Gaussian blur using `ctx.filter = 'blur(Xpx)'` when the canvas 2D context supports the `filter` property.
2. IF `ctx.filter` is unavailable, THEN THE Blur_Module SHALL fall back to a three-pass box blur algorithm.
3. THE Blur_Module SHALL accept an ImageData object and a blur radius, and return a blurred ImageData object.
4. THE Blur_Module SHALL contain zero imports from any UI framework or React.

### Requirement 9: Pipeline Orchestration

**User Story:** As a developer, I want a single `processImage` function that runs all stages in the correct order and color spaces, so that the pipeline is easy to invoke.

#### Acceptance Criteria

1. THE Index_Module SHALL export a `processImage(imageData, preset, options)` function.
2. WHEN `processImage` is called, THE Index_Module SHALL execute stages in this order: color transform → vignette → tone curve → grain → sharpen.
3. THE Index_Module SHALL ensure color transform and vignette operate on linear light values (sRGB-to-linear conversion applied before, linear-to-sRGB applied after these two stages).
4. THE Index_Module SHALL ensure tone curve, grain, and sharpen operate on sRGB values.
5. WHEN `options.mode` is `'preview'` or `'export'`, THE Index_Module SHALL execute the same processing logic; only the input ImageData resolution differs.
6. THE Index_Module SHALL return a processed ImageData object.
7. THE Index_Module SHALL contain zero imports from any UI framework or React.

### Requirement 10: Web Worker Entry Point

**User Story:** As a developer, I want the pipeline to run in a Web Worker, so that image processing does not block the main browser thread.

#### Acceptance Criteria

1. THE Worker SHALL receive `{ imageData, preset, mode }` via a `message` event and pass them to `processImage`.
2. WHEN processing completes, THE Worker SHALL return the result via `postMessage` using Transferable objects for zero-copy transfer of the ImageData buffer.
3. IF an error occurs during processing, THEN THE Worker SHALL return `{ error: errorMessage }` via `postMessage` without crashing.
4. THE Worker SHALL contain zero imports from any UI framework or React.

### Requirement 11: Main-Thread Worker Bridge

**User Story:** As a developer, I want a Promise-based wrapper around the Worker, so that pipeline calls integrate cleanly with async application code.

#### Acceptance Criteria

1. THE Bridge SHALL export a `createPipelineWorker()` factory function that returns an object with `process(imageData, preset, mode)` and `terminate()` methods.
2. WHEN `process()` is called, THE Bridge SHALL return a Promise that resolves with the processed ImageData on success.
3. IF the Worker returns an error message, THEN THE Bridge SHALL reject the Promise with an Error object containing the Worker's error message.
4. THE Bridge SHALL support calling `terminate()` to shut down the Worker and release resources.
5. THE Bridge SHALL contain zero imports from any UI framework or React.

### Requirement 12: Classic Chrome Preset

**User Story:** As a photographer, I want a Classic Chrome preset, so that I can apply a desaturated, lifted-blacks film look to my images.

#### Acceptance Criteria

1. THE Classic_Chrome preset SHALL define tone curve control points that produce lifted blacks (shadow output values above 0) and compressed highlights (highlight output values below 255).
2. THE Classic_Chrome preset SHALL define a saturation factor that slightly desaturates greens relative to other channels.
3. THE Classic_Chrome preset SHALL define grain parameters that produce visible but subtle grain (intensity within the 0.01–0.04 range).
4. THE Classic_Chrome preset SHALL define per-channel multipliers (`rMult`, `gMult`, `bMult`) that produce a slightly cool/neutral color cast consistent with the Classic Chrome film look.
5. WHEN `processImage` is called with the Classic_Chrome preset, THE Index_Module SHALL produce output with lifted blacks, compressed highlights, slightly desaturated greens, and visible but subtle grain.
