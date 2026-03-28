import { useState } from 'react';
import { ErrorTypes } from '../utils/errors.js';
import { makeFilename, exportImage } from '../utils/export.js';
import '../styles/ExportButton.css';

function Spinner() {
  return (
    <svg
      className="export-spinner"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="7"
        cy="7"
        r="5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="22"
        strokeDashoffset="8"
      />
    </svg>
  );
}

export default function ExportButton({ fullImageData, processExport, preset, onError }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'processing' | 'saved'

  const isDisabled = !fullImageData || status === 'processing';

  async function handleExport() {
    if (!fullImageData || status === 'processing') return;

    let processedData = null;
    setStatus('processing');
    try {
      processedData = await processExport(fullImageData, preset);
      const canvas = new OffscreenCanvas(processedData.width, processedData.height);
      const ctx = canvas.getContext('2d');
      ctx.putImageData(processedData, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
      const filename = makeFilename(preset.id);
      await exportImage(blob, filename);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1500);
    } catch {
      onError(ErrorTypes.EXPORT_FAILED);
      setStatus('idle');
    } finally {
      processedData = null;
    }
  }

  let className = 'export-btn';
  if (status === 'processing') className += ' export-btn--processing';
  if (status === 'saved') className += ' export-btn--success';

  let label;
  if (status === 'processing') {
    label = <><Spinner />Saving…</>;
  } else if (status === 'saved') {
    label = '✓ Saved';
  } else {
    label = 'Export';
  }

  return (
    <button
      className={className}
      onClick={handleExport}
      disabled={isDisabled}
      aria-label="Export image"
    >
      {label}
    </button>
  );
}
