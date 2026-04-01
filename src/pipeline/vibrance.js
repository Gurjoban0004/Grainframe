/**
 * Apply vibrance to imageData in-place.
 * 
 * @param {ImageData} imageData - the pixel buffer to modify
 * @param {number} vibrance - range: -1.0 (fully desaturate muted colors) to +1.0 (boost muted colors)
 */
export function applyVibrance(imageData, vibrance) {
  if (Math.abs(vibrance) < 0.001) return imageData;
  
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    
    // Perceptual luminance (Rec.709)
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    
    // Fast saturation proxy: how far is the max channel from luminance
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const chroma = maxC - minC;
    const sat = maxC > 0.001 ? chroma / maxC : 0;
    
    // === Core vibrance weight ===
    // Low saturation → high weight → more effect
    let weight = 1.0 - sat;
    
    // Square it for a smoother response curve
    weight = weight * weight;
    
    // === Skin tone protection ===
    if (chroma > 0.01) {
      let hue;
      if (maxC === r) {
        hue = ((g - b) / chroma) % 6;
      } else if (maxC === g) {
        hue = (b - r) / chroma + 2;
      } else {
        hue = (r - g) / chroma + 4;
      }
      hue *= 60;
      if (hue < 0) hue += 360;
      
      // Skin tone range: ~10° to ~55°
      // Only protect when saturation is in the skin-like range
      if (hue > 10 && hue < 55 && sat > 0.1 && sat < 0.65) {
        // Smooth bell curve centered at ~28° (peak skin tone)
        const skinCenter = 28;
        const skinWidth = 18;
        const dist = Math.abs(hue - skinCenter) / skinWidth;
        const skinFactor = Math.max(0, 1.0 - dist * dist); // quadratic falloff
        
        // Reduce vibrance effect by up to 50% for skin tones
        weight *= (1.0 - skinFactor * 0.5);
      }
    }
    
    // === Apply ===
    // Scale each channel's deviation from luminance
    const amount = vibrance * weight;
    const scale = 1.0 + amount;
    
    const newR = lum + (r - lum) * scale;
    const newG = lum + (g - lum) * scale;
    const newB = lum + (b - lum) * scale;
    
    // Clamp and write back
    data[i]     = Math.max(0, Math.min(255, Math.round(newR * 255)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(newG * 255)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(newB * 255)));
  }
  
  return imageData;
}
