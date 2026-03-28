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

export default function ExportButton({ fullImageData, processExport, preset, onError, onSuccess }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'processing' | 'saved'

  const isDisabled = !fullImageData || status === 'processing';

  async function handleExport() {
    if (!fullImageData || status === 'processing') return;

    setStatus('processing');
    try {
      const processedData = await processExport(fullImageData, preset);

      // Always use a regular canvas for maximum compatibility
      const canvas = document.createElement('canvas');
      canvas.width = processedData.width;
      canvas.height = processedData.height;
      canvas.getContext('2d').putImageData(processedData, 0, 0);

      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          b => b ? resolve(b) : reject(new Error('toBlob returned null')),
          'image/jpeg',
          0.92
        )
      );

      const filename = makeFilename(preset.id);
      await exportImage(blob, filename);
      onSuccess?.();
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
      // AbortError = user cancelled share sheet — not an error
      if (err?.name !== 'AbortError') {
        onError(ErrorTypes.EXPORT_FAILED);
      }
      setStatus('idle');
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
