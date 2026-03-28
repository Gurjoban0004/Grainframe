import { useState } from 'react';
import { ErrorTypes } from '../utils/errors.js';
import { makeFilename, exportImage } from '../utils/export.js';

const styles = {
  button: {
    position: 'fixed',
    top: 'calc(var(--safe-top) + 12px)',
    right: 'calc(var(--safe-right) + 12px)',
    minWidth: '44px',
    minHeight: '44px',
    padding: '8px 16px',
    background: 'rgba(14, 14, 14, 0.75)',
    color: 'var(--color-text)',
    border: '1px solid rgba(240, 237, 232, 0.25)',
    borderRadius: '22px',
    fontFamily: 'var(--font-stack)',
    fontSize: '14px',
    fontWeight: '500',
    letterSpacing: '0.02em',
    cursor: 'pointer',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    zIndex: 50,
    transition: 'opacity 150ms',
  },
  disabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
};

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      style={{
        animation: 'export-spin 0.8s linear infinite',
      }}
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
      <style>{`
        @keyframes export-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
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

  const buttonStyle = {
    ...styles.button,
    ...(isDisabled ? styles.disabled : {}),
  };

  let label;
  if (status === 'processing') {
    label = (
      <>
        <Spinner />
        Processing…
      </>
    );
  } else if (status === 'saved') {
    label = 'Saved';
  } else {
    label = 'Export';
  }

  return (
    <button
      style={buttonStyle}
      onClick={handleExport}
      disabled={isDisabled}
      aria-label="Export image"
    >
      {label}
    </button>
  );
}
