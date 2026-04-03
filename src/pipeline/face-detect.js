/**
 * face-detect.js — Face Detection Module
 *
 * Detects faces in the source image to build skin protection masks.
 *
 * Strategy:
 *   1. Try native FaceDetector API (Chrome 94+, Edge 94+)
 *   2. Try MediaPipe Tasks Vision (loaded from CDN on demand)
 *   3. Fall back gracefully to Level 2 HSL-only protection
 *
 * Face detection runs ONCE per image load. Results are cached.
 */

let detectorInstance = null;
let detectorType = 'none';
let initPromise = null;

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Initialize the best available face detection backend.
 * Call once at app startup. Safe to call multiple times (returns cached promise).
 *
 * @returns {Promise<string>} - 'native' | 'mediapipe' | 'none'
 */
export async function initFaceDetection() {
  if (initPromise) return initPromise;

  initPromise = _initDetector();
  return initPromise;
}

async function _initDetector() {
  // ── Try 1: Native FaceDetector (Shape Detection API) ──
  if (typeof window !== 'undefined' && 'FaceDetector' in window) {
    try {
      detectorInstance = new window.FaceDetector({
        fastMode: false,
        maxDetectedFaces: 15
      });
      // Verify it works with a tiny test
      const testCanvas = document.createElement('canvas');
      testCanvas.width = 2; testCanvas.height = 2;
      await detectorInstance.detect(testCanvas);
      testCanvas.remove();

      detectorType = 'native';
      console.log('[FaceDetect] ✓ Using native FaceDetector API');
      return 'native';
    } catch (e) {
      console.warn('[FaceDetect] Native API available but failed:', e.message);
      detectorInstance = null;
    }
  }

  // ── Try 2: MediaPipe Tasks Vision ──
  try {
    const vision = await import(
      /* webpackIgnore: true */
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm'
    );

    const resolver = await vision.FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );

    const mpDetector = await vision.FaceDetector.createFromOptions(resolver, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
      },
      runningMode: 'IMAGE',
    });

    // Wrap in common interface
    detectorInstance = {
      detect: async (source) => {
        const result = mpDetector.detect(source);
        return result.detections.map(d => ({
          boundingBox: new DOMRect(
            d.boundingBox.originX,
            d.boundingBox.originY,
            d.boundingBox.width,
            d.boundingBox.height
          )
        }));
      }
    };

    detectorType = 'mediapipe';
    console.log('[FaceDetect] ✓ Using MediaPipe FaceDetector');
    return 'mediapipe';

  } catch (e) {
    console.warn('[FaceDetect] MediaPipe not available:', e.message);
  }

  // ── Fallback: no face detection ──
  detectorType = 'none';
  console.log('[FaceDetect] ⚠ No face detection available — using HSL-only skin protection');
  return 'none';
}


// ─── Detection ───────────────────────────────────────────────────────────────

/**
 * Detect faces in an image.
 *
 * @param {HTMLCanvasElement|HTMLImageElement|ImageBitmap} imageSource
 *   Must be a renderable image source, NOT raw ImageData.
 * @returns {Promise<Array<{x, y, width, height}>>}
 *   Bounding boxes in pixel coordinates. Empty array if no faces or no detector.
 */
export async function detectFaces(imageSource) {
  if (!detectorInstance) {
    // Try to initialize if not done yet
    await initFaceDetection();
  }

  if (!detectorInstance) return [];

  try {
    const rawFaces = await detectorInstance.detect(imageSource);

    // Normalize to simple { x, y, width, height } objects
    const faces = rawFaces
      .filter(f => f.boundingBox)
      .map(f => ({
        x: f.boundingBox.x,
        y: f.boundingBox.y,
        width: f.boundingBox.width,
        height: f.boundingBox.height,
      }))
      // Filter out only single-pixel noise
      .filter(f => f.width > 3 && f.height > 3);

    console.log(`[FaceDetect] Found ${faces.length} face(s)`);
    return faces;

  } catch (e) {
    console.warn('[FaceDetect] Detection failed:', e.message);
    return [];
  }
}

/**
 * Get the current detector type.
 * @returns {'native'|'mediapipe'|'none'}
 */
export function getDetectorType() {
  return detectorType;
}

/**
 * Convenience: detect faces from ImageData by creating a temp canvas.
 * Use this when you only have ImageData, not a canvas/image element.
 */
export async function detectFacesFromImageData(imageData) {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext('2d').putImageData(imageData, 0, 0);
  const faces = await detectFaces(canvas);
  canvas.remove();
  return faces;
}
