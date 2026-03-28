import { useRef, useEffect } from 'react';
import EmptyState from './EmptyState';
import '../styles/CameraView.css';

export default function CameraView({
  captureRef,
  importRef,
  handleFileChange,
  preview,
  previewImageData,
  isProcessing,
  showOriginal,
  children,
}) {
  const canvasBackRef = useRef(null);
  const canvasFrontRef = useRef(null);

  // Effect 1 — showOriginal toggle: instant putImageData, no CSS transition
  useEffect(() => {
    const canvas = canvasFrontRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const data = showOriginal ? previewImageData : preview;
    if (data) ctx.putImageData(data, 0, 0);
  }, [showOriginal, previewImageData, preview]);

  // Effect 2 — new preview arriving: dual-canvas cross-fade sequence
  useEffect(() => {
    if (!preview || showOriginal) return;
    const back = canvasBackRef.current;
    const front = canvasFrontRef.current;
    if (!back || !front) return;
    back.width = preview.width;
    back.height = preview.height;
    back.getContext('2d').putImageData(preview, 0, 0);
    front.classList.add('fading');
    const onEnd = () => {
      front.getContext('2d').putImageData(preview, 0, 0);
      front.classList.remove('fading');
      back.getContext('2d').clearRect(0, 0, back.width, back.height);
      front.removeEventListener('transitionend', onEnd);
    };
    front.addEventListener('transitionend', onEnd, { once: true });
  }, [preview]);

  return (
    <div className="camera-view">
      {/* Hidden file inputs */}
      <input
        ref={captureRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <input
        ref={importRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Progress bar */}
      <div className={`progress-bar${isProcessing ? ' active' : ''}`} />

      {/* Dual canvas stack */}
      <canvas ref={canvasBackRef} className="canvas-back" />
      <canvas ref={canvasFrontRef} className="canvas-front" />

      {/* Empty state overlay */}
      {!previewImageData && <EmptyState />}

      {/* Slot for overlaid children (e.g. CompareButton) */}
      {children}
    </div>
  );
}
