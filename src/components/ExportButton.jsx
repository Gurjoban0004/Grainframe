import { useState } from 'react';
import { ErrorTypes } from '../utils/errors.js';
import { loadAndResize } from '../utils/image.js';
import { applyCrop } from '../utils/crop.js';
import { getMaxDimension } from '../utils/memory.js';
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

export default function ExportButton({
  sourceBlob,
  cropState,
  processExport,
  preset,
  onError,
  onSuccess,
}) {
  const [status, setStatus] = useState('idle');

  const isDisabled = !sourceBlob || status === 'processing';

  async function handleExport() {
    if (!sourceBlob || status === 'processing') return;

    setStatus('processing');
    try {
      // Load full resolution on-demand — browser handles EXIF rotation
      let fullImageData = await loadAndResize(sourceBlob, getMaxDimension());

      // Apply crop at full resolution if a crop was set
      if (cropState) {
        fullImageData = applyCrop(fullImageData, cropState);
      }

      const processedData = await processExport(fullImageData, preset);

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

      // Release canvas
      canvas.width = 0;
      canvas.height = 0;

      const filename = makeFilename(preset.id);
      await exportImage(blob, filename);
      onSuccess?.();
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
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
