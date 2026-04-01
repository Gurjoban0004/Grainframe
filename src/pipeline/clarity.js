/**
 * Apply clarity (local contrast enhancement/reduction) to imageData.
 *
 * @param {ImageData} imageData - the pixel buffer (will be modified)
 * @param {number} amount - range: -1.0 (maximum softening) to +1.0 (maximum punch)
 * @param {number} radius - blur radius in pixels (default: 50)
 * @returns {ImageData}
 */
export function applyClarity(imageData, amount, radius = 50) {
  if (Math.abs(amount) < 0.005) return imageData;
  
  const { data, width, height } = imageData;
  
  // ── Step 1: Create blurred version using downscale method ──
  const scale = 0.25;  // 1/4 size for speed
  const blurW = Math.max(1, Math.round(width * scale));
  const blurH = Math.max(1, Math.round(height * scale));
  const blurRadius = Math.max(1, Math.round(radius * scale));
  
  // Create downscaled canvas
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = blurW;
  blurCanvas.height = blurH;
  const blurCtx = blurCanvas.getContext('2d');
  
  // Draw downscaled image
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  tempCanvas.getContext('2d').putImageData(imageData, 0, 0);
  
  blurCtx.drawImage(tempCanvas, 0, 0, blurW, blurH);
  
  // Apply CSS blur (fast, hardware-accelerated)
  blurCtx.filter = `blur(${blurRadius}px)`;
  blurCtx.drawImage(blurCanvas, 0, 0);
  blurCtx.filter = 'none';
  
  // Get blurred data at full resolution
  const fullBlurCanvas = document.createElement('canvas');
  fullBlurCanvas.width = width;
  fullBlurCanvas.height = height;
  const fullBlurCtx = fullBlurCanvas.getContext('2d');
  fullBlurCtx.drawImage(blurCanvas, 0, 0, width, height);
  const blurredData = fullBlurCtx.getImageData(0, 0, width, height).data;
  
  // ── Step 2: Apply clarity formula per pixel ──
  // output = blurred + (1 + amount) × (original - blurred)
  
  for (let i = 0; i < data.length; i += 4) {
    const origR = data[i];
    const origG = data[i + 1];
    const origB = data[i + 2];
    
    const blurR = blurredData[i];
    const blurG = blurredData[i + 1];
    const blurB = blurredData[i + 2];
    
    const detailR = origR - blurR;
    const detailG = origG - blurG;
    const detailB = origB - blurB;
    
    // Apply clarity amount
    const scale = 1.0 + amount;
    
    let newR = blurR + detailR * scale;
    let newG = blurG + detailG * scale;
    let newB = blurB + detailB * scale;
    
    // Clamp
    data[i]     = Math.max(0, Math.min(255, Math.round(newR)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(newG)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(newB)));
    // Alpha unchanged
  }
  
  // Cleanup
  blurCanvas.width = 0; blurCanvas.height = 0;
  tempCanvas.width = 0; tempCanvas.height = 0;
  fullBlurCanvas.width = 0; fullBlurCanvas.height = 0;
  
  return imageData;
}
