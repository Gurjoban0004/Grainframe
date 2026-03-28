import { useState, useRef } from 'react';

export function usePresetHistory(initialPresetId) {
  const [history, setHistory] = useState([]);
  const [currentId, setCurrentId] = useState(initialPresetId);

  // Use a ref to always have the latest currentId inside async-safe callbacks
  const currentIdRef = useRef(currentId);
  currentIdRef.current = currentId;

  function pushPreset(presetId) {
    // Capture current value via ref to avoid stale closure
    const snapshot = currentIdRef.current;
    setHistory(prev => [...prev, snapshot].slice(-10));
    setCurrentId(presetId);
  }

  function undo() {
    if (history.length === 0) return null;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setCurrentId(prev);
    return prev;
  }

  function reset(presetId) {
    setHistory([]);
    setCurrentId(presetId);
  }

  return {
    currentId,
    canUndo: history.length > 0,
    pushPreset,
    undo,
    reset,
  };
}
