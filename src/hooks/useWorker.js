import { useState, useEffect } from 'react';

/**
 * Generic Web Worker lifecycle hook.
 * @param {() => Worker} factory  Function that creates the worker
 * @returns {{ worker: Worker|null, error: Error|null }}
 */
export function useWorker(factory) {
  const [worker, setWorker] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let w;
    try {
      w = factory();
      setWorker(w);
    } catch (err) {
      setError(err);
      return;
    }
    return () => w.terminate();
  }, []); // factory is stable (passed once)

  return { worker, error };
}
