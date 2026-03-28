# Browser Compatibility

> Fill in this table after manual testing. Mark each cell as **✓ Pass**, **✗ Fail**, or **TBD**.
> "Expected ✓" means the feature is expected to work based on the implementation but has not yet been manually verified.

## Target Browsers

| Feature / Capability | Safari iOS 15+ | Safari iOS 16+ | Chrome Android | Chrome Desktop | Firefox Desktop | Safari Desktop |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Camera capture (`getUserMedia`) | Expected ✓ | Expected ✓ | Expected ✓ | Expected ✓ | Expected ✓ | Expected ✓ |
| File import | Expected ✓ | Expected ✓ | Expected ✓ | Expected ✓ | Expected ✓ | Expected ✓ |
| OffscreenCanvas (worker pipeline) | ✗ Not available | Expected ✓ | Expected ✓ | Expected ✓ | Expected ✓ | Expected ✓ |
| Main-thread fallback (no OffscreenCanvas) | Expected ✓ | N/A | N/A | N/A | N/A | N/A |
| PWA install | Expected ✓ | Expected ✓ | Expected ✓ | TBD | TBD | TBD |
| Service worker / offline | Expected ✓ | Expected ✓ | Expected ✓ | Expected ✓ | Expected ✓ | Expected ✓ |
| Export (`canvas.toBlob`) | Expected ✓ | Expected ✓ | Expected ✓ | Expected ✓ | Expected ✓ | Expected ✓ |
| Safe area insets (`env(safe-area-inset-*)`) | Expected ✓ | Expected ✓ | Expected ✓ | TBD | TBD | TBD |

## Notes

### OffscreenCanvas / Main-Thread Fallback

- **Safari iOS 15** does not support `OffscreenCanvas`. The app automatically falls back to running the image pipeline synchronously on the main thread (the existing Spec 2 fallback path in `useWorker.js`). This fallback does **not** add `setTimeout` yields — it calls `processImage` directly.
- **Safari iOS 16+** introduced `OffscreenCanvas` support. The worker pipeline runs fully off-thread, keeping the main thread unblocked during processing.
- All other listed browsers support `OffscreenCanvas` and use the worker pipeline by default.

### PWA Install

- Safari iOS and Chrome Android support "Add to Home Screen" / PWA install natively.
- Chrome Desktop and Firefox Desktop support PWA install via the browser address bar (install prompt).
- Safari Desktop does not support PWA install in the traditional sense; the app can be bookmarked but not installed as a standalone app.

### Safe Area Insets

- Safe area insets (`env(safe-area-inset-bottom)`, etc.) are primarily relevant on iPhone (notch / Dynamic Island / home indicator). Desktop browsers and Android may return `0` for these values, which is handled gracefully by the CSS.

### Camera Capture

- `getUserMedia` with `{ video: { facingMode: 'environment' } }` is supported on all listed browsers when served over HTTPS or localhost.
- On desktop browsers, the rear camera constraint is ignored and the default webcam is used.

## Requirements Coverage

| Requirement | Description |
|---|---|
| 6.1 | Safari iOS 15+ — primary target |
| 6.2 | Safari iOS 16+ — OffscreenCanvas worker pipeline |
| 6.3 | Main-thread fallback (no OffscreenCanvas, no setTimeout yields) |
| 6.4 | Chrome for Android (latest stable) |
| 6.5 | Chrome desktop (latest stable) |
| 6.6 | Firefox desktop (latest stable) |
| 6.7 | Safari desktop (latest stable) |
| 6.8 | This document |
