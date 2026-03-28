import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Worker mock ---
// bridge.js uses `new Worker(...)` which is a browser API not available in Node.
// We install a mock on globalThis before importing bridge.js.

let mockWorkerInstance = null;

class MockWorker {
  constructor() {
    this.onmessage = null;
    this.onerror = null;
    this._terminated = false;
    mockWorkerInstance = this;
  }

  postMessage(data) {
    if (this._terminated) return;
    // Simulate async response: echo back a fake processed ImageData
    const fakeImageData = {
      data: new Uint8ClampedArray(data.imageData?.data?.length ?? 4),
      width: data.imageData?.width ?? 1,
      height: data.imageData?.height ?? 1,
    };
    Promise.resolve().then(() => {
      if (!this._terminated && this.onmessage) {
        this.onmessage({ data: { imageData: fakeImageData } });
      }
    });
  }

  terminate() {
    this._terminated = true;
  }
}

globalThis.Worker = MockWorker;

// bridge.js also uses `new URL('./worker.js', import.meta.url)` — provide a minimal URL polyfill
if (typeof globalThis.URL === 'undefined') {
  globalThis.URL = class URL {
    constructor(path) { this.href = path; }
  };
}

import { createPipelineWorker } from '../bridge.js';

// Helper: minimal ImageData-like object
function makeImageData(width = 2, height = 2) {
  return {
    data: new Uint8ClampedArray(width * height * 4).fill(128),
    width,
    height,
  };
}

const dummyPreset = {};

// ---------------------------------------------------------------------------
// Task 11.1 — Unit tests for bridge.js
// ---------------------------------------------------------------------------

describe('createPipelineWorker', () => {
  it('returns an object with process and terminate methods', () => {
    const worker = createPipelineWorker();
    expect(typeof worker.process).toBe('function');
    expect(typeof worker.terminate).toBe('function');
    worker.terminate();
  });

  it('process() returns a Promise', async () => {
    const worker = createPipelineWorker();
    const result = worker.process(makeImageData(), dummyPreset);
    expect(result).toBeInstanceOf(Promise);
    // Await the promise so the pending rejection is handled before the test ends
    await result;
    worker.terminate();
  });

  it('process() resolves with an ImageData-like object on success', async () => {
    const worker = createPipelineWorker();
    const imageData = makeImageData(4, 4);
    const result = await worker.process(imageData, dummyPreset);
    expect(result).toBeDefined();
    expect(result.data).toBeInstanceOf(Uint8ClampedArray);
    worker.terminate();
  });

  it('terminate() rejects any pending promise', async () => {
    const worker = createPipelineWorker();

    // Prevent the mock from auto-resolving by overriding postMessage
    mockWorkerInstance.postMessage = () => { /* do nothing — keep promise pending */ };

    const pending = worker.process(makeImageData(), dummyPreset);
    worker.terminate();

    await expect(pending).rejects.toThrow('Worker terminated');
  });

  it('process() rejects when the worker returns an error message', async () => {
    const worker = createPipelineWorker();

    // Override postMessage to return an error response
    mockWorkerInstance.postMessage = function () {
      Promise.resolve().then(() => {
        if (this.onmessage) {
          this.onmessage({ data: { error: 'processing failed' } });
        }
      });
    }.bind(mockWorkerInstance);

    await expect(worker.process(makeImageData(), dummyPreset)).rejects.toThrow('processing failed');
    worker.terminate();
  });

  it('process() rejects when the worker fires an onerror event', async () => {
    const worker = createPipelineWorker();

    // Override postMessage to fire onerror
    mockWorkerInstance.postMessage = function () {
      Promise.resolve().then(() => {
        if (this.onerror) {
          this.onerror({ message: 'worker script error' });
        }
      });
    }.bind(mockWorkerInstance);

    await expect(worker.process(makeImageData(), dummyPreset)).rejects.toThrow('worker script error');
    worker.terminate();
  });
});
