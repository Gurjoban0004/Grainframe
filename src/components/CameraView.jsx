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
    const data = showOriginal ? previewImageData : preview;
    if (!data) return;
    // Always sync canvas dimensions to the data being drawn
    if (canvas.width !== data.width || canvas.height !== data.height) {
      canvas.width = data.width;
      canvas.height = data.height;
    }
    canvas.getContext('2d').putImageData(data, 0, 0);
  }, [showOriginal, previewImageData, preview]);

  // Effect 2 — new preview arriving: dual-canvas cross-fade sequence
  useEffect(() => {
    if (!preview || showOriginal) return;
    const back = canvasBackRef.current;
    const front = canvasFrontRef.current;
    if (!back || !front) return;

    // Sync back canvas dimensions
    back.width = preview.width;
    back.height = preview.height;
    back.getContext('2d').putImageData(preview, 0, 0);

    // Sync front canvas dimensions before fading
    front.width = preview.width;
    front.height = preview.height;

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
    <>
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
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Dual canvas stack */}
      <canvas ref={canvasBackRef} className="preview-canvas preview-canvas--back" />
      <canvas ref={canvasFrontRef} className="preview-canvas preview-canvas--front" />

      {/* Empty state */}
      {!previewImageData && <EmptyState />}

      {/* Processing bar */}
      {isProcessing && <div className="processing-bar" />}

      {/* Top overlay slot (CompareButton + ExportButton) */}
      {children}
    </>
  );
}
