/**
 * Unit tests for useWorker hook
 * Validates: Requirements 8.1, 8.2, 8.3
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock React hooks so we can test the hook logic without a DOM
// ---------------------------------------------------------------------------

let effectCleanup = null;
let stateValues = {};
let stateSetters = {};

function makeUseState(key, initial) {
  stateValues[key] = initial;
  stateSetters[key] = vi.fn((val) => { stateValues[key] = val; });
  return [stateValues[key], stateSetters[key]];
}

vi.mock('react', () => {
  const stateMap = new Map();
  const setterMap = new Map();
  let stateCallCount = 0;

  return {
    useState: vi.fn((initial) => {
      const key = stateCallCount++;
      if (!stateMap.has(key)) stateMap.set(key, initial);
      const setter = vi.fn((val) => stateMap.set(key, val));
      setterMap.set(key, setter);
      return [stateMap.get(key), setter];
    }),
    useEffect: vi.fn((fn) => {
      effectCleanup = fn();
    }),
  };
});

import { useState, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetReactMocks() {
  effectCleanup = null;
  // Reset useState call count by clearing the closure state
  const stateMap = new Map();
  let callCount = 0;
  useState.mockImplementation((initial) => {
    const key = callCount++;
    if (!stateMap.has(key)) stateMap.set(key, initial);
    const setter = vi.fn((val) => stateMap.set(key, val));
    return [stateMap.get(key), setter];
  });
  useEffect.mockImplementation((fn) => {
    effectCleanup = fn();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useWorker', () => {
  beforeEach(() => {
    resetReactMocks();
  });

  it('Test 1: factory throws → returns null worker and sets error', async () => {
    /**
     * Validates: Requirements 8.2, 8.3
     * When the factory function throws, worker should be null and error should be set.
     */
    const thrownError = new Error('Worker not supported');
    const factory = vi.fn(() => { throw thrownError; });

    // Capture state setters
    const workerSetter = vi.fn();
    const errorSetter = vi.fn();
    let callCount = 0;
    useState.mockImplementation((initial) => {
      callCount++;
      if (callCount === 1) return [null, workerSetter];   // worker state
      if (callCount === 2) return [null, errorSetter];    // error state
      return [initial, vi.fn()];
    });

    useEffect.mockImplementation((fn) => {
      effectCleanup = fn();
    });

    const { useWorker } = await import('../useWorker.js');
    const result = useWorker(factory);

    // factory was called
    expect(factory).toHaveBeenCalledOnce();
    // error was set to the thrown error
    expect(errorSetter).toHaveBeenCalledWith(thrownError);
    // worker setter was NOT called (stays null)
    expect(workerSetter).not.toHaveBeenCalled();
  });

  it('Test 2: factory succeeds → worker is set and terminate called on cleanup', async () => {
    /**
     * Validates: Requirements 8.1, 8.2
     * When factory succeeds, worker is set. On cleanup (unmount), terminate() is called.
     */
    const mockTerminate = vi.fn();
    const mockWorker = { terminate: mockTerminate };
    const factory = vi.fn(() => mockWorker);

    const workerSetter = vi.fn();
    const errorSetter = vi.fn();
    let callCount = 0;
    useState.mockImplementation((initial) => {
      callCount++;
      if (callCount === 1) return [null, workerSetter];
      if (callCount === 2) return [null, errorSetter];
      return [initial, vi.fn()];
    });

    let capturedCleanup = null;
    useEffect.mockImplementation((fn) => {
      capturedCleanup = fn();
    });

    const { useWorker } = await import('../useWorker.js');
    useWorker(factory);

    // worker was set
    expect(workerSetter).toHaveBeenCalledWith(mockWorker);
    // error was NOT set
    expect(errorSetter).not.toHaveBeenCalled();

    // Simulate unmount — cleanup should call terminate
    expect(capturedCleanup).toBeTypeOf('function');
    capturedCleanup();
    expect(mockTerminate).toHaveBeenCalledOnce();
  });
});
