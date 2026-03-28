import { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import EmptyState from './EmptyState';
import '../styles/CameraView.css';

const CameraView = forwardRef(function CameraView({
  captureRef,
  importRef,
  handleFileChange,
  preview,
  previewImageData,
  isProcessing,
  showOriginal,
  children,
}, ref) {
  const canvasBackRef = useRef(null);
  const canvasFrontRef = useRef(null);
  const [showShutter, setShowShutter] = useState(false);
  // Track the last preview we cross-faded to, so cache hits that are already
  // drawn don't re-trigger the fade animation
  const lastFadedPreviewRef = useRef(null);

  useImperativeHandle(ref, () => ({
    triggerShutter() { setShowShutter(true); },
    dismissShutter() { setShowShutter(false); },
  }));

  // What to draw right now: processed > unprocessed > nothing
  const currentImage = showOriginal
    ? previewImageData
    : (preview || previewImageData);

  // Draw current image to front canvas immediately
  useEffect(() => {
    if (!currentImage) return;
    const canvas = canvasFrontRef.current;
    if (!canvas) return;
    if (canvas.width !== currentImage.width || canvas.height !== currentImage.height) {
      canvas.width = currentImage.width;
      canvas.height = currentImage.height;
    }
    canvas.getContext('2d').putImageData(currentImage, 0, 0);
  }, [currentImage]);

  // Dismiss shutter once the image is drawn
  useEffect(() => {
    if (currentImage && showShutter) {
      requestAnimationFrame(() => setShowShutter(false));
    }
  }, [currentImage, showShutter]);

  // Cross-fade only when a NEW processed preview arrives (not on cache hits already drawn)
  useEffect(() => {
    if (!preview || showOriginal) return;
    // Skip if this exact preview object was already faded to
    if (lastFadedPreviewRef.current === preview) return;
    lastFadedPreviewRef.current = preview;

    const back = canvasBackRef.current;
    const front = canvasFrontRef.current;
    if (!back || !front) return;

    back.width = preview.width;
    back.height = preview.height;
    back.getContext('2d').putImageData(preview, 0, 0);

    front.width = preview.width;
    front.height = preview.height;

    front.classList.add('fading');
    const onEnd = () => {
      front.getContext('2d').putImageData(preview, 0, 0);
      front.classList.remove('fading');
      back.getContext('2d').clearRect(0, 0, back.width, back.height);
    };
    front.addEventListener('transitionend', onEnd, { once: true });
  }, [preview, showOriginal]);

  return (
    <>
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

      <canvas ref={canvasBackRef} className="preview-canvas preview-canvas--back" />
      <canvas ref={canvasFrontRef} className="preview-canvas preview-canvas--front" />

      {!previewImageData && <EmptyState />}

      {showShutter && <div className="shutter-overlay" />}

      {isProcessing && <div className="processing-bar" />}

      {children}
    </>
  );
});

export default CameraView;
