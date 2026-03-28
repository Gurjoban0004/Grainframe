import { useState, useEffect, useRef, useCallback } from 'react';
import { calculateCropRect } from '../utils/crop.js';
import '../styles/CropOverlay.css';

const ASPECT_RATIOS = [
  { label: 'Free', value: null },
  { label: '1:1', value: [1, 1] },
  { label: '4:5', value: [4, 5] },
  { label: '9:16', value: [9, 16] },
  { label: '3:2', value: [3, 2] },
  { label: '16:9', value: [16, 9] },
];

export default function CropOverlay({ imageData, initialCrop, hasPreviousCrop, onConfirm, onCancel, onResetCrop }) {
  const [aspectRatio, setAspectRatio] = useState(null);
  const [cropRect, setCropRect] = useState(
    initialCrop || { x: 0, y: 0, width: 1, height: 1 }
  );

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const dragRef = useRef(null);

  // Draw the source image to canvas
  useEffect(() => {
    if (!imageData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.getContext('2d').putImageData(imageData, 0, 0);
  }, [imageData]);

  // Recalculate crop when aspect ratio or imageData changes
  useEffect(() => {
    if (!imageData) return;
    if (aspectRatio) {
      setCropRect(calculateCropRect(imageData.width, imageData.height, aspectRatio[0], aspectRatio[1]));
    } else {
      setCropRect({ x: 0, y: 0, width: 1, height: 1 });
    }
  }, [aspectRatio, imageData]);

  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragRef.current = {
      startX: clientX,
      startY: clientY,
      startCropX: cropRect.x,
      startCropY: cropRect.y,
      // Use the canvas rendered size for coordinate mapping
      containerWidth: rect.width,
      containerHeight: rect.height,
    };
  }, [cropRect.x, cropRect.y]);

  const handlePointerMove = useCallback((e) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = (clientX - dragRef.current.startX) / dragRef.current.containerWidth;
    const dy = (clientY - dragRef.current.startY) / dragRef.current.containerHeight;

    setCropRect(prev => ({
      ...prev,
      x: Math.max(0, Math.min(1 - prev.width, dragRef.current.startCropX + dx)),
      y: Math.max(0, Math.min(1 - prev.height, dragRef.current.startCropY + dy)),
    }));
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Mask clip-path: dark outside the crop rect
  const { x, y, width, height } = cropRect;
  const clipPath = `polygon(
    0% 0%, 0% 100%,
    ${x * 100}% 100%,
    ${x * 100}% ${y * 100}%,
    ${(x + width) * 100}% ${y * 100}%,
    ${(x + width) * 100}% ${(y + height) * 100}%,
    ${x * 100}% ${(y + height) * 100}%,
    ${x * 100}% 100%,
    100% 100%, 100% 0%
  )`;

  // Frame position as percentages for absolute positioning
  const frameStyle = {
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    width: `${width * 100}%`,
    height: `${height * 100}%`,
  };

  return (
    <div className="crop-overlay">
      <div className="crop-top-bar">
        <button className="crop-cancel-btn" onClick={onCancel} aria-label="Cancel crop">
          Cancel
        </button>
        {hasPreviousCrop && (
          <button className="crop-reset-btn" onClick={onResetCrop} aria-label="Reset crop">
            Reset
          </button>
        )}
        <button className="crop-confirm-btn" onClick={() => onConfirm(cropRect)} aria-label="Confirm crop">
          Done
        </button>
      </div>

      <div className="crop-image-area" ref={containerRef}>
        <div className="crop-canvas-wrapper">
          <canvas ref={canvasRef} className="crop-canvas" />

          {/* Dark mask outside crop */}
          <div className="crop-mask" style={{ clipPath }} />

          {/* Crop frame + grid + drag handle */}
          <div
            className="crop-frame"
            style={frameStyle}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          >
            {/* Rule of thirds grid */}
            <div className="crop-grid-line crop-grid-line--h" style={{ top: '33.33%' }} />
            <div className="crop-grid-line crop-grid-line--h" style={{ top: '66.66%' }} />
            <div className="crop-grid-line crop-grid-line--v" style={{ left: '33.33%' }} />
            <div className="crop-grid-line crop-grid-line--v" style={{ left: '66.66%' }} />
          </div>
        </div>
      </div>

      <div className="crop-ratios">
        {ASPECT_RATIOS.map(({ label, value }) => {
          const isActive = value === null
            ? aspectRatio === null
            : aspectRatio?.[0] === value[0] && aspectRatio?.[1] === value[1];
          return (
            <button
              key={label}
              className={`crop-ratio-btn${isActive ? ' crop-ratio-btn--active' : ''}`}
              onClick={() => setAspectRatio(value)}
              aria-pressed={isActive}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
