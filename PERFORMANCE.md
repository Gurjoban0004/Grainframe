# Performance

## Targets

| Mode    | Target  |
|---------|---------|
| Preview | < 800ms |
| Export  | < 3s    |

These are measured from the time image data is sent to the Web Worker until the processed result is returned (the worker round-trip), on an iPhone 12 or newer running Safari.

---

## How to Measure

Open the app in Safari on an iPhone (or Chrome DevTools with mobile emulation), then open the browser console. Every time a preview or export is processed, the pipeline logs:

```
Pipeline preview: Xms
Pipeline export: Xms
```

These logs are only emitted in development mode (`import.meta.env.DEV`). They bracket the full worker round-trip and are the numbers to compare against the targets above.

To get per-stage timings, add `performance.now()` calls around each stage in `src/pipeline/index.js` and log them from the worker. See the stage breakdown table below for the stages to instrument.

---

## Per-Stage Timing Breakdown

Fill in this table by instrumenting `src/pipeline/index.js` with `performance.now()` calls around each stage, then running a representative image through preview and export mode and reading the console output.

| Stage                    | Preview (ms) | Export (ms) | Notes |
|--------------------------|:------------:|:-----------:|-------|
| colorspace linearize     |              |             | sRGB → linear light before color transform |
| color transform          |              |             | `applyColor` — matrix multiply in linear light |
| vignette                 |              |             | `applyVignette` — radial darkening in linear light |
| colorspace delinearize   |              |             | linear light → sRGB before tone curve |
| tone curve               |              |             | `applyToneCurve` — per-channel LUT in sRGB |
| grain                    |              |             | `applyGrain` — film grain in sRGB; scaled at export |
| sharpen                  |              |             | `applySharpen` — unsharp mask in sRGB |
| **Total (pipeline)**     |              |             | Should match `Pipeline preview/export: Xms` console log |

---

## Overall Pipeline Time

Record the end-to-end times from the DEV console logs here after profiling on the target device.

| Mode    | Measured (ms) | Target (ms) | Pass? |
|---------|:-------------:|:-----------:|:-----:|
| Preview |               | 800         |       |
| Export  |               | 3000        |       |

---

## Notes

- If the 800ms preview target is not met, reduce `PREVIEW_MAX_DIM` in `src/hooks/useImagePipeline.js` from `1024` to `768`.
- If the 3s export target is not met, use the per-stage table above to identify the bottleneck stage and optimise it first.
- Grain is typically the most expensive stage at export resolution due to the blur pass; check `applyGrain` in `src/pipeline/grain.js` first.
