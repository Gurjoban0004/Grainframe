/**
 * auto-match.js — Auto-Match Engine
 *
 * Approach: "Soft histogram matching"
 *   - Build per-channel histogram-match LUTs (CDF-based)
 *   - Blend them with the identity curve at a controlled strength
 *     so we capture the mood/color without destroying the image
 *   - Derive rMult/gMult/bMult from zone-weighted mean ratios
 *   - HSL-based saturation matching
 *   - Warmth from R-B midtone delta
 */

import { applyTonalAdjustments } from '../src/pipeline/tonal.js';

// ─── Histogram utilities ──────────────────────────────────────────────────────

export function computeHistograms(imageData) {
  const { data } = imageData;
  const histR = new Uint32Array(256);
  const histG = new Uint32Array(256);
  const histB = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    histR[data[i]]++;
    histG[data[i + 1]]++;
    histB[data[i + 2]]++;
  }
  return { r: histR, g: histG, b: histB };
}

export function computeCDF(histogram) {
  const cdf = new Uint32Array(256);
  cdf[0] = histogram[0];
  for (let i = 1; i < 256; i++) {
    cdf[i] = cdf[i - 1] + histogram[i];
  }
  return cdf;
}

export function histogramMatch(srcCDF, refCDF) {
  const lut = new Uint8Array(256);
  const totalSrc = srcCDF[255];
  const totalRef = refCDF[255];
  for (let i = 0; i < 256; i++) {
    const srcPercent = srcCDF[i] / totalSrc;
    let j = 0;
    while (j < 255 && refCDF[j] / totalRef < srcPercent) j++;
    lut[i] = j;
  }
  return lut;
}



/**
 * Convert a LUT to N evenly-spaced control points for the curve editor.
 */
function lutToControlPoints(lut, numPoints = 9) {
  const pts = [];
  for (let i = 0; i < numPoints; i++) {
    const x = Math.round((i / (numPoints - 1)) * 255);
    pts.push([x, lut[x]]);
  }
  return pts;
}

// ─── Color / HSL analysis ─────────────────────────────────────────────────────

export function analyzeColor(imageData) {
  const { data } = imageData;
  let sumR = 0, sumG = 0, sumB = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sumR += data[i] / 255;
    sumG += data[i + 1] / 255;
    sumB += data[i + 2] / 255;
  }
  return { meanR: sumR / n, meanG: sumG / n, meanB: sumB / n };
}

export function deriveColorAdjust(srcColor, refColor) {
  const rRatio = (refColor.meanR + 0.01) / (srcColor.meanR + 0.01);
  const gRatio = (refColor.meanG + 0.01) / (srcColor.meanG + 0.01);
  const bRatio = (refColor.meanB + 0.01) / (srcColor.meanB + 0.01);
  const avgRatio = (rRatio + gRatio + bRatio) / 3;
  return {
    rMult: rRatio / avgRatio,
    gMult: gRatio / avgRatio,
    bMult: bRatio / avgRatio,
    saturation: 1.0,
    warmth: (refColor.meanR - refColor.meanB) - (srcColor.meanR - srcColor.meanB),
    greenShift: 0,
  };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  return [0, s, l];
}

function analyzeHSL(imageData) {
  const { data } = imageData;
  let totalS = 0, totalL = 0;
  const n = data.length / 4;
  const step = Math.max(1, Math.floor(n / 20000));
  let count = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    const [, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    totalS += s;
    totalL += l;
    count++;
  }
  return { meanS: totalS / count, meanL: totalL / count };
}

export function detectVibrance(srcImageData, refImageData) {
  const { data: srcData } = srcImageData;
  const { data: refData } = refImageData;
  
  const numBins = 5;
  const srcBins = Array.from({ length: numBins }, () => ({ sum: 0, count: 0 }));
  const refBins = Array.from({ length: numBins }, () => ({ sum: 0, count: 0 }));
  
  const sampleStep = Math.max(1, Math.floor(srcData.length / (4 * 20000)));
  
  for (let i = 0; i < srcData.length; i += 4 * sampleStep) {
    const r = srcData[i] / 255;
    const g = srcData[i + 1] / 255;
    const b = srcData[i + 2] / 255;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC > 0.001 ? (maxC - minC) / maxC : 0;
    
    const bin = Math.min(numBins - 1, Math.floor(sat * numBins));
    srcBins[bin].sum += sat;
    srcBins[bin].count++;
  }
  
  const refSampleStep = Math.max(1, Math.floor(refData.length / (4 * 20000)));
  
  for (let i = 0; i < refData.length; i += 4 * refSampleStep) {
    const r = refData[i] / 255;
    const g = refData[i + 1] / 255;
    const b = refData[i + 2] / 255;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC > 0.001 ? (maxC - minC) / maxC : 0;
    
    const bin = Math.min(numBins - 1, Math.floor(sat * numBins));
    refBins[bin].sum += sat;
    refBins[bin].count++;
  }
  
  const srcMeans = srcBins.map(b => b.count > 0 ? b.sum / b.count : 0);
  const refMeans = refBins.map(b => b.count > 0 ? b.sum / b.count : 0);
  
  const ratios = srcMeans.map((s, i) => {
    if (s < 0.01) return 1.0;
    return refMeans[i] / s;
  });
  
  const validLow = srcBins[0].count > 50 && srcBins[1].count > 50;
  const validHigh = srcBins[3].count > 50 && srcBins[4].count > 50;
  
  if (!validLow || !validHigh) {
    const overallSrcSat = srcBins.reduce((a, b) => a + b.sum, 0) / Math.max(1, srcBins.reduce((a, b) => a + b.count, 0));
    const overallRefSat = refBins.reduce((a, b) => a + b.sum, 0) / Math.max(1, refBins.reduce((a, b) => a + b.count, 0));
    const satRatio = overallSrcSat > 0.01 ? overallRefSat / overallSrcSat : 1;
    return {
      saturation: Math.max(0.6, Math.min(1.6, satRatio)),
      vibrance: 0
    };
  }
  
  const lowSatRatio = (ratios[0] + ratios[1]) / 2;
  const highSatRatio = (ratios[3] + ratios[4]) / 2;
  
  const saturation = highSatRatio;
  const vibranceDiff = lowSatRatio - highSatRatio;
  
  const vibrance = Math.max(-1.0, Math.min(1.0, vibranceDiff * 2.0));
  
  return {
    saturation: Math.max(0.6, Math.min(1.6, saturation)),
    vibrance
  };
}


// ─── Selective Color detection ────────────────────────────────────────────────

const HUE_ZONES = [
  { name: 'red',     center: 0,   halfWidth: 30  },
  { name: 'orange',  center: 35,  halfWidth: 20  },
  { name: 'yellow',  center: 60,  halfWidth: 22  },
  { name: 'green',   center: 120, halfWidth: 45  },
  { name: 'cyan',    center: 180, halfWidth: 22  },
  { name: 'blue',    center: 230, halfWidth: 35  },
  { name: 'purple',  center: 280, halfWidth: 30  },
  { name: 'magenta', center: 330, halfWidth: 22  },
];

function zoneWeight(hue, zone) {
  let dist = Math.abs(hue - zone.center);
  if (dist > 180) dist = 360 - dist;
  if (dist >= zone.halfWidth) return 0;
  return (Math.cos((dist / zone.halfWidth) * Math.PI) + 1) * 0.5;
}

function buildHueProfile(imageData) {
  const { data } = imageData;
  const n = data.length / 4;
  const sampleStep = Math.max(1, Math.floor(n / 30000));
  
  const zones = {};
  for (const zone of HUE_ZONES) {
    zones[zone.name] = {
      hueX: 0, hueY: 0, satSum: 0, lumSum: 0, totalWeight: 0, pixelCount: 0
    };
  }
  
  for (let i = 0; i < data.length; i += 4 * sampleStep) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    
    if (chroma < 0.02) continue;
    
    const l = (max + min) / 2;
    const s = l > 0.5 ? chroma / (2 - max - min) : chroma / (max + min);
    
    let h;
    if (max === r) h = ((g - b) / chroma) % 6;
    else if (max === g) h = (b - r) / chroma + 2;
    else h = (r - g) / chroma + 4;
    h *= 60;
    if (h < 0) h += 360;
    
    const hRad = (h / 180) * Math.PI;
    
    for (const zone of HUE_ZONES) {
      const w = zoneWeight(h, zone);
      if (w < 0.01) continue;
      
      const effectiveWeight = w * s;
      
      const z = zones[zone.name];
      z.hueX += Math.cos(hRad) * effectiveWeight;
      z.hueY += Math.sin(hRad) * effectiveWeight;
      z.satSum += s * effectiveWeight;
      z.lumSum += l * effectiveWeight;
      z.totalWeight += effectiveWeight;
      z.pixelCount++;
    }
  }
  
  const profile = {};
  for (const zone of HUE_ZONES) {
    const z = zones[zone.name];
    if (z.totalWeight < 1) {
      profile[zone.name] = { avgHue: zone.center, avgSat: 0, avgLum: 0.5, count: 0, confidence: 0 };
      continue;
    }
    
    const avgHueRad = Math.atan2(z.hueY, z.hueX);
    let avgHue = (avgHueRad / Math.PI) * 180;
    if (avgHue < 0) avgHue += 360;
    
    const avgSat = z.satSum / z.totalWeight;
    const avgLum = z.lumSum / z.totalWeight;
    
    const totalSampled = Math.floor(n / sampleStep);
    const confidence = Math.min(1.0, z.pixelCount / (totalSampled * 0.05));
    
    profile[zone.name] = { avgHue, avgSat, avgLum, count: z.pixelCount, confidence };
  }
  
  return profile;
}

export function detectSelectiveColor(srcImageData, refImageData) {
  const srcProfile = buildHueProfile(srcImageData);
  const refProfile = buildHueProfile(refImageData);
  
  const adjustments = {};
  
  for (const zone of HUE_ZONES) {
    const src = srcProfile[zone.name];
    const ref = refProfile[zone.name];
    
    const minConfidence = 0.15;
    if (src.confidence < minConfidence || ref.confidence < minConfidence) {
      adjustments[zone.name] = { hueShift: 0, satShift: 0, lumShift: 0 };
      console.log(`[SelectiveColor] ${zone.name}: skipped (low confidence)`);
      continue;
    }
    
    let hueDiff = ref.avgHue - src.avgHue;
    if (hueDiff > 180) hueDiff -= 360;
    if (hueDiff < -180) hueDiff += 360;
    
    const confidence = Math.min(src.confidence, ref.confidence);
    let hueShift = hueDiff * confidence * 0.7;
    hueShift = Math.max(-30, Math.min(30, hueShift));
    
    let satRatio = src.avgSat > 0.01 ? ref.avgSat / src.avgSat : 1;
    let satShift = (satRatio - 1) * confidence * 0.65;
    satShift = Math.max(-0.8, Math.min(0.8, satShift));
    
    let lumDiff = (ref.avgLum - src.avgLum) * confidence * 0.5;
    lumDiff = Math.max(-0.3, Math.min(0.3, lumDiff));
    
    adjustments[zone.name] = {
      hueShift: Math.abs(hueShift) < 0.5 ? 0 : hueShift,
      satShift: Math.abs(satShift) < 0.02 ? 0 : satShift,
      lumShift: Math.abs(lumDiff) < 0.01 ? 0 : lumDiff
    };
    
    console.log(`[SelectiveColor] ${zone.name}: hue=${hueShift.toFixed(1)}° sat=${satShift.toFixed(3)} lum=${lumDiff.toFixed(3)} (conf=${confidence.toFixed(2)})`);
  }
  
  return adjustments;
}

// ─── Zone analysis ────────────────────────────────────────────────────────────

function analyzeZones(imageData) {
  const { data } = imageData;
  const n = data.length / 4;
  const step = Math.max(1, Math.floor(n / 20000));

  const zones = {
    shadows:    { r: 0, g: 0, b: 0, count: 0 },
    midtones:   { r: 0, g: 0, b: 0, count: 0 },
    highlights: { r: 0, g: 0, b: 0, count: 0 },
  };

  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const lum = r * 0.299 + g * 0.587 + b * 0.114;
    const zone = lum < 0.25 ? zones.shadows : lum < 0.75 ? zones.midtones : zones.highlights;
    zone.r += r; zone.g += g; zone.b += b; zone.count++;
  }

  const mean = z => z.count > 0
    ? { r: z.r / z.count, g: z.g / z.count, b: z.b / z.count }
    : { r: 0.5, g: 0.5, b: 0.5 };

  return {
    shadows:    mean(zones.shadows),
    midtones:   mean(zones.midtones),
    highlights: mean(zones.highlights),
  };
}

// ─── Grain detection ──────────────────────────────────────────────────────────

export function estimateGrain(imageData) {
  const { data, width, height } = imageData;
  const lum = new Float32Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    lum[i / 4] = (data[i] + data[i + 1] + data[i + 2]) / (3 * 255);
  }
  let grainEnergy = 0, smoothPixels = 0;
  const step = Math.max(1, Math.floor(Math.sqrt(width * height / 10000)));
  for (let y = 2; y < height - 2; y += step) {
    for (let x = 2; x < width - 2; x += step) {
      const idx = y * width + x;
      const gx = Math.abs(lum[idx + 1] - lum[idx - 1]);
      const gy = Math.abs(lum[idx + width] - lum[idx - width]);
      if (gx + gy < 0.05) {
        grainEnergy += Math.abs(4 * lum[idx] - lum[idx - 1] - lum[idx + 1] - lum[idx - width] - lum[idx + width]);
        smoothPixels++;
      }
    }
  }
  const intensity = smoothPixels > 0 ? Math.min(1.0, grainEnergy / smoothPixels * 10) : 0;
  const size = Math.max(0.5, Math.min(3.0, 1.0 + intensity));
  return { intensity, size };
}

// ─── Vignette detection ───────────────────────────────────────────────────────

export function detectVignette(imageData) {
  const { data, width, height } = imageData;
  const cx = width / 2, cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const rings = [0, 0, 0, 0, 0], counts = [0, 0, 0, 0, 0];
  const step = Math.max(1, Math.floor(Math.sqrt(width * height / 5000)));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const lum = (data[idx] + data[idx + 1] + data[idx + 2]) / (3 * 255);
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const ring = Math.min(4, Math.floor(dist / maxDist * 5));
      rings[ring] += lum;
      counts[ring]++;
    }
  }
  const center = rings[0] / counts[0];
  const outer = rings[4] / counts[4];
  return { intensity: Math.max(0, Math.min(0.6, (center - outer) * 2)) };
}

// ─── Clarity detection ────────────────────────────────────────────────────────

export function detectClarity(srcImageData, refImageData) {
  const { data: srcData, width: srcW, height: srcH } = srcImageData;
  const { data: refData, width: refW, height: refH } = refImageData;
  
  // Helper: compute local contrast energy for an image
  const computeLocalContrast = (data, width, height, radius = 50) => {
    const n = width * height;
    
    // Build luminance buffer
    const lum = new Float32Array(n);
    for (let i = 0; i < data.length; i += 4) {
      lum[i / 4] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
    }
    
    // Compute global statistics
    let sum = 0, sumSq = 0;
    for (let i = 0; i < n; i++) {
      sum += lum[i];
      sumSq += lum[i] * lum[i];
    }
    const mean = sum / n;
    const globalStd = Math.sqrt(sumSq / n - mean * mean);
    
    // Compute local contrast energy via downscale blur method
    const scale = 0.25;
    const blurW = Math.max(1, Math.round(width * scale));
    const blurH = Math.max(1, Math.round(height * scale));
    const blurRadius = Math.max(1, Math.round(radius * scale));
    
    const blurCanvas = document.createElement('canvas');
    blurCanvas.width = blurW;
    blurCanvas.height = blurH;
    const blurCtx = blurCanvas.getContext('2d');
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
    
    blurCtx.drawImage(tempCanvas, 0, 0, blurW, blurH);
    blurCtx.filter = `blur(${blurRadius}px)`;
    blurCtx.drawImage(blurCanvas, 0, 0);
    blurCtx.filter = 'none';
    
    const fullBlurCanvas = document.createElement('canvas');
    fullBlurCanvas.width = width;
    fullBlurCanvas.height = height;
    const fullBlurCtx = fullBlurCanvas.getContext('2d');
    fullBlurCtx.drawImage(blurCanvas, 0, 0, width, height);
    const blurredData = fullBlurCtx.getImageData(0, 0, width, height).data;
    
    // Compute RMS of detail layer
    let detailSumSq = 0;
    const sampleStep = Math.max(1, Math.floor(n / 10000));
    let sampleCount = 0;
    
    for (let i = 0; i < data.length; i += 4 * sampleStep) {
      const idx = i / 4;
      const origLum = lum[idx];
      const blurLum = (blurredData[i] * 0.299 + blurredData[i + 1] * 0.587 + blurredData[i + 2] * 0.114) / 255;
      const detail = origLum - blurLum;
      detailSumSq += detail * detail;
      sampleCount++;
    }
    
    const localRMS = Math.sqrt(detailSumSq / sampleCount);
    
    // Cleanup
    blurCanvas.remove();
    tempCanvas.remove();
    fullBlurCanvas.remove();
    
    return { globalStd, localRMS };
  };
  
  const src = computeLocalContrast(srcData, srcW, srcH);
  const ref = computeLocalContrast(refData, refW, refH);
  
  const srcRatio = src.globalStd > 0.001 ? src.localRMS / src.globalStd : 0;
  const refRatio = ref.globalStd > 0.001 ? ref.localRMS / ref.globalStd : 0;
  
  const ratioDiff = refRatio - srcRatio;
  
  let clarity = ratioDiff / 0.4;
  clarity = Math.max(-1.0, Math.min(1.0, clarity));
  
  const confidence = Math.min(1.0, (src.globalStd + ref.globalStd) / 0.3);
  clarity *= confidence;
  
  return clarity;
}

// ─── Legacy export (kept for compatibility) ───────────────────────────────────

export function extractToneCurves(imageData) {
  const hists = computeHistograms(imageData);
  const result = {};
  for (const ch of ['r', 'g', 'b']) {
    const cdf = computeCDF(hists[ch]);
    const lut = new Uint8Array(256);
    const total = cdf[255];
    for (let i = 0; i < 256; i++) lut[i] = Math.round((cdf[i] / total) * 255);
    result[ch] = lutToControlPoints(lut, 9);
  }
  return result;
}

// ─── Histogram drawing ────────────────────────────────────────────────────────

export function drawHistogram(ctx, histogram, color, w, h) {
  const max = Math.max(...histogram);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * w;
    const y = h - (histogram[i] / max) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  ctx.fillStyle = color.replace('0.7', '0.12');
  ctx.fill();
}

export function drawBlended(ctx, processedImageData, referenceImageData, blend) {
  ctx.putImageData(processedImageData, 0, 0);
  if (blend > 0.01) {
    const tmp = document.createElement('canvas');
    tmp.width = referenceImageData.width;
    tmp.height = referenceImageData.height;
    tmp.getContext('2d').putImageData(referenceImageData, 0, 0);
    ctx.globalAlpha = blend;
    ctx.drawImage(tmp, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.globalAlpha = 1.0;
    tmp.width = 0; tmp.height = 0;
  }
}

// ─── Tonal Decomposition ────────────────────────────────────────────────────────

export function detectTonalAdjustments(srcImageData, refImageData) {
  const srcStats = computeTonalStats(srcImageData);
  const refStats = computeTonalStats(refImageData);
  
  // ── Black Point ──
  const refBlackPoint = refStats.p1;
  let blackPoint = 0;
  if (refBlackPoint > 0.05) {
    blackPoint = refBlackPoint * 0.7;
    blackPoint = Math.max(0, Math.min(0.25, blackPoint));
  }
  
  // ── White Point ──
  const refWhitePoint = refStats.p99;
  let whitePoint = 1.0;
  if (refWhitePoint < 0.9) {
    whitePoint = refWhitePoint + 0.05;
    whitePoint = Math.max(0.7, Math.min(1.0, whitePoint));
  }
  
  // ── Exposure ──
  const srcMedian = srcStats.p50;
  const refMedian = refStats.p50;
  const adjustedRefMedian = (refMedian - blackPoint) / (whitePoint - blackPoint);
  const medianRatio = (adjustedRefMedian + 0.001) / (srcMedian + 0.001);
  let exposure = 0;
  if (medianRatio > 0.01) {
    exposure = Math.log2(medianRatio);
    exposure = Math.max(-2.0, Math.min(2.0, exposure));
    if (Math.abs(exposure) < 0.15) exposure = 0;
  }
  
  // ── Highlights ──
  const srcHighlightRange = srcStats.p95 - srcStats.p75;
  const refHighlightRange = refStats.p95 - refStats.p75;
  let highlights = 0;
  if (srcHighlightRange > 0.01) {
    const highlightCompression = refHighlightRange / srcHighlightRange;
    if (highlightCompression < 0.7) {
      highlights = -(1 - highlightCompression) * 1.5;
    } else if (highlightCompression > 1.3) {
      highlights = (highlightCompression - 1) * 0.8;
    }
    highlights = Math.max(-1.0, Math.min(1.0, highlights));
  }
  
  // ── Shadows ──
  const srcShadowRange = srcStats.p25 - srcStats.p5;
  const refShadowRange = refStats.p25 - refStats.p5;
  let shadows = 0;
  if (srcShadowRange > 0.01) {
    const shadowExpansion = refShadowRange / srcShadowRange;
    if (shadowExpansion > 1.3) {
      shadows = (shadowExpansion - 1) * 0.8;
    } else if (shadowExpansion < 0.7) {
      shadows = -(1 - shadowExpansion) * 1.2;
    }
    shadows = Math.max(-1.0, Math.min(1.0, shadows));
  }
  
  const srcShadowMean = srcStats.shadowMean;
  const refShadowMean = refStats.shadowMean;
  if (refShadowMean > srcShadowMean + 0.05 && blackPoint < 0.03) {
    const lift = (refShadowMean - srcShadowMean) * 2;
    shadows = Math.max(shadows, Math.min(1.0, lift));
  }
  
  // ── Contrast ──
  const srcMidSpread = srcStats.p75 - srcStats.p25;
  const refMidSpread = refStats.p75 - refStats.p25;
  let contrast = 0;
  if (srcMidSpread > 0.01) {
    const spreadRatio = refMidSpread / srcMidSpread;
    if (spreadRatio > 1.15) {
      contrast = (spreadRatio - 1) * 1.5;
    } else if (spreadRatio < 0.85) {
      contrast = (spreadRatio - 1) * 2.0;
    }
    contrast = Math.max(-0.8, Math.min(0.8, contrast));
  }
  
  // ── Brightness ──
  const exposureCompensatedMid = srcMedian * Math.pow(2, exposure);
  const residualMidShift = refMedian - exposureCompensatedMid;
  let brightness = 0;
  if (Math.abs(residualMidShift) > 0.03) {
    brightness = residualMidShift * 2;
    brightness = Math.max(-0.6, Math.min(0.6, brightness));
  }
  
  return { exposure, highlights, shadows, brightness, contrast, blackPoint, whitePoint };
}

function computeTonalStats(imageData) {
  const { data } = imageData;
  const n = data.length / 4;
  const sampleStep = Math.max(1, Math.floor(n / 40000));
  
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4 * sampleStep) {
    const lum = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    hist[lum]++;
  }
  
  const total = hist.reduce((a, b) => a + b, 0);
  const percentile = (p) => {
    let acc = 0;
    const target = total * p;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= target) return i / 255;
    }
    return 1.0;
  };
  
  let shadowSum = 0, shadowCount = 0;
  let midSum = 0, midCount = 0;
  let highSum = 0, highCount = 0;
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    if (v < 0.25) { shadowSum += v * hist[i]; shadowCount += hist[i]; }
    else if (v < 0.75) { midSum += v * hist[i]; midCount += hist[i]; }
    else { highSum += v * hist[i]; highCount += hist[i]; }
  }
  
  return {
    p1: percentile(0.01), p5: percentile(0.05), p10: percentile(0.10),
    p25: percentile(0.25), p50: percentile(0.50), p75: percentile(0.75),
    p90: percentile(0.90), p95: percentile(0.95), p99: percentile(0.99),
    shadowMean: shadowCount > 0 ? shadowSum / shadowCount : 0,
    midMean: midCount > 0 ? midSum / midCount : 0.5,
    highMean: highCount > 0 ? highSum / highCount : 1.0,
    total
  };
}

// ─── Residual Cascade Helpers ───────────────────────────────────────────────────

function computeColorTransfer(srcZones, refZones) {
  const rawR = (refZones.midtones.r + 0.01) / (srcZones.midtones.r + 0.01);
  const rawG = (refZones.midtones.g + 0.01) / (srcZones.midtones.g + 0.01);
  const rawB = (refZones.midtones.b + 0.01) / (srcZones.midtones.b + 0.01);
  const avg  = (rawR + rawG + rawB) / 3;

  return {
    rMult: Math.max(0.78, Math.min(1.28, rawR / avg)),
    gMult: Math.max(0.78, Math.min(1.28, rawG / avg)),
    bMult: Math.max(0.78, Math.min(1.28, rawB / avg))
  };
}

function computeWarmthMatch(srcZones, refZones) {
  const srcWarmth = srcZones.midtones.r - srcZones.midtones.b;
  const refWarmth = refZones.midtones.r - refZones.midtones.b;
  const warmth = Math.max(-0.06, Math.min(0.06, (refWarmth - srcWarmth) * 0.4));

  const greenShift = Math.max(-0.015, Math.min(0.015,
    (refZones.midtones.g - srcZones.midtones.g) * 0.25
  ));

  return { warmth, greenShift };
}

function computeTonalStrength(tonal) {
  const contributions = [
    Math.abs(tonal.exposure) * 0.3,
    Math.abs(tonal.highlights) * 0.15,
    Math.abs(tonal.shadows) * 0.15,
    Math.abs(tonal.brightness) * 0.1,
    Math.abs(tonal.contrast) * 0.1,
    tonal.blackPoint * 2.0,
    (1 - tonal.whitePoint) * 2.0
  ];
  return Math.min(1.0, contributions.reduce((a, b) => a + b, 0));
}

function generateMatchedCurvesWithResidual(tonalCorrectedSrc, referenceImageData, tonalStrength) {
  const srcHist = computeHistograms(tonalCorrectedSrc);
  const refHist = computeHistograms(referenceImageData);

  const srcCdfR = computeCDF(srcHist.r);
  const srcCdfG = computeCDF(srcHist.g);
  const srcCdfB = computeCDF(srcHist.b);
  const refCdfR = computeCDF(refHist.r);
  const refCdfG = computeCDF(refHist.g);
  const refCdfB = computeCDF(refHist.b);

  const lutR = histogramMatch(srcCdfR, refCdfR);
  const lutG = histogramMatch(srcCdfG, refCdfG);
  const lutB = histogramMatch(srcCdfB, refCdfB);

  const smooth = (lut, radius = 3) => {
    const out = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - radius); j <= Math.min(255, i + radius); j++) {
        const w = 1 - Math.abs(j - i) / (radius + 1);
        sum += lut[j] * w;
        count += w;
      }
      out[i] = Math.round(sum / count);
    }
    return out;
  };

  const smoothR = smooth(lutR);
  const smoothG = smooth(lutG);
  const smoothB = smooth(lutB);

  const baseBlend = 0.65;
  const adjustedBlend = baseBlend * (1 - tonalStrength * 0.4);

  const blend = (lut, strength) => {
    const out = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      out[i] = Math.round(i * (1 - strength) + lut[i] * strength);
    }
    return out;
  };

  const finalR = blend(smoothR, adjustedBlend);
  const finalG = blend(smoothG, adjustedBlend);
  const finalB = blend(smoothB, adjustedBlend);

  let divergence = 0;
  for (let i = 0; i < 256; i++) {
    const avg = (finalR[i] + finalG[i] + finalB[i]) / 3;
    divergence += Math.abs(finalR[i] - avg) + Math.abs(finalG[i] - avg) + Math.abs(finalB[i] - avg);
  }
  divergence /= (256 * 3);

  if (divergence < 2) {
    const pullback = 0.5;
    for (let i = 0; i < 256; i++) {
      finalR[i] = Math.round(i * pullback + finalR[i] * (1 - pullback));
      finalG[i] = Math.round(i * pullback + finalG[i] * (1 - pullback));
      finalB[i] = Math.round(i * pullback + finalB[i] * (1 - pullback));
    }
  }

  const samplePoints = [0, 32, 64, 96, 128, 160, 192, 224, 255];
  const sampleLUT = (lut) => samplePoints.map(x => [x, lut[x]]);

  return { r: sampleLUT(finalR), g: sampleLUT(finalG), b: sampleLUT(finalB) };
}

function applyToneCurvesToImageData(imageData, toneCurve) {
  const buildLUT = (points) => {
    const lut = new Uint8Array(256);
    const sorted = [...points].sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < 256; i++) {
      let lo = sorted[0], hi = sorted[sorted.length - 1];
      for (let j = 0; j < sorted.length - 1; j++) {
        if (i >= sorted[j][0] && i <= sorted[j + 1][0]) {
          lo = sorted[j]; hi = sorted[j + 1]; break;
        }
      }
      if (hi[0] === lo[0]) {
        lut[i] = Math.round(lo[1]);
      } else {
        const t = (i - lo[0]) / (hi[0] - lo[0]);
        lut[i] = Math.max(0, Math.min(255, Math.round(lo[1] + t * (hi[1] - lo[1]))));
      }
    }
    return lut;
  };

  const lutR = buildLUT(toneCurve.r), lutG = buildLUT(toneCurve.g), lutB = buildLUT(toneCurve.b);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lutR[data[i]];
    data[i + 1] = lutG[data[i + 1]];
    data[i + 2] = lutB[data[i + 2]];
  }
}

function applyColorMultsForAnalysis(imageData, mults) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = Math.min(255, Math.max(0, Math.round(data[i] * mults.rMult)));
    data[i + 1] = Math.min(255, Math.max(0, Math.round(data[i + 1] * mults.gMult)));
    data[i + 2] = Math.min(255, Math.max(0, Math.round(data[i + 2] * mults.bMult)));
  }
}

function computeMeanSaturation(imageData) {
  const data = imageData.data;
  const n = data.length / 4;
  const step = Math.max(1, Math.floor(n / 20000));
  let sum = 0, count = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max > 0.01) { sum += (max - min) / max; count++; }
  }
  return count > 0 ? sum / count : 0;
}

function computeOverallSaturationRatio(srcImageData, refImageData) {
  const srcSat = computeMeanSaturation(srcImageData);
  if (srcSat < 0.01) return 1.0;
  return Math.max(0.3, Math.min(1.8, computeMeanSaturation(refImageData) / srcSat));
}

function applyUniformSaturation(imageData, ratio) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    data[i]     = Math.max(0, Math.min(255, Math.round((lum + (r - lum) * ratio) * 255)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round((lum + (g - lum) * ratio) * 255)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round((lum + (b - lum) * ratio) * 255)));
  }
}

function detectVibranceFromResidual(satCorrectedSrc, refImageData) {
  const srcData = satCorrectedSrc.data, refData = refImageData.data;
  const numBins = 5;
  const srcBins = Array.from({ length: numBins }, () => ({ sum: 0, count: 0 }));
  const refBins = Array.from({ length: numBins }, () => ({ sum: 0, count: 0 }));

  const binData = (data, bins) => {
    const step = Math.max(1, Math.floor(data.length / (4 * 20000)));
    for (let i = 0; i < data.length; i += 4 * step) {
      const max = Math.max(data[i], data[i+1], data[i+2]) / 255;
      const min = Math.min(data[i], data[i+1], data[i+2]) / 255;
      const sat = max > 0.001 ? (max - min) / max : 0;
      const binIdx = Math.min(numBins - 1, Math.floor(sat * numBins));
      bins[binIdx].sum += sat;
      bins[binIdx].count++;
    }
  };

  binData(srcData, srcBins);
  binData(refData, refBins);

  const srcMeans = srcBins.map(b => b.count > 0 ? b.sum / b.count : 0);
  const refMeans = refBins.map(b => b.count > 0 ? b.sum / b.count : 0);
  const ratios = srcMeans.map((s, i) => s < 0.01 ? 1.0 : refMeans[i] / s);

  if (!(srcBins[0].count > 50 && srcBins[1].count > 50 && srcBins[3].count > 50 && srcBins[4].count > 50)) return 0;

  const lowRatio = (ratios[0] + ratios[1]) / 2;
  const highRatio = (ratios[3] + ratios[4]) / 2;
  return Math.max(-1.0, Math.min(1.0, (lowRatio - highRatio) * 2.5));
}

function applyVibrance(imageData, vibrance) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]/255, g = data[i+1]/255, b = data[i+2]/255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = max > 0.001 ? (max - min) / max : 0;
    
    let w = 1.0 - sat; w *= w;
    if ((max - min) > 0.01) {
      let h;
      if (max === r) h = ((g - b) / (max - min)) % 6;
      else if (max === g) h = (b - r) / (max - min) + 2;
      else h = (r - g) / (max - min) + 4;
      h *= 60; if (h < 0) h += 360;
      if (h > 10 && h < 55 && sat > 0.1 && sat < 0.65) {
        const dist = Math.abs(h - 28) / 18;
        w *= (1.0 - Math.max(0, 1 - dist * dist) * 0.5);
      }
    }
    const scale = 1.0 + vibrance * w;
    data[i]     = Math.max(0, Math.min(255, (lum + (r - lum) * scale) * 255));
    data[i + 1] = Math.max(0, Math.min(255, (lum + (g - lum) * scale) * 255));
    data[i + 2] = Math.max(0, Math.min(255, (lum + (b - lum) * scale) * 255));
  }
}

function _analyzeColorForQuality(imageData) {
  let meanR = 0, meanG = 0, meanB = 0, count = 0;
  const step = Math.max(1, Math.floor((imageData.data.length / 4) / 10000));
  for (let i = 0; i < imageData.data.length; i += 4 * step) {
    meanR += imageData.data[i] / 255;
    meanG += imageData.data[i+1] / 255;
    meanB += imageData.data[i+2] / 255;
    count++;
  }
  return { meanR: meanR / count, meanG: meanG / count, meanB: meanB / count };
}

function computeMatchQuality(processedImageData, referenceImageData) {
  const procHist = computeHistograms(processedImageData);
  const refHist = computeHistograms(referenceImageData);

  const histIntersection = (h1, h2) => {
    const total1 = h1.reduce((a, b) => a + b, 0), total2 = h2.reduce((a, b) => a + b, 0);
    if (total1 === 0 || total2 === 0) return 0;
    let intersection = 0;
    for (let i = 0; i < 256; i++) intersection += Math.min(h1[i] / total1, h2[i] / total2);
    return intersection;
  };

  const histScore = (histIntersection(procHist.r, refHist.r) + histIntersection(procHist.g, refHist.g) + histIntersection(procHist.b, refHist.b)) / 3;

  const procColor = _analyzeColorForQuality(processedImageData);
  const refColor = _analyzeColorForQuality(referenceImageData);
  const colorDist = Math.sqrt(Math.pow(procColor.meanR - refColor.meanR, 2) + Math.pow(procColor.meanG - refColor.meanG, 2) + Math.pow(procColor.meanB - refColor.meanB, 2));
  const colorScore = 1 - Math.min(1, colorDist / 0.3);

  const procStats = computeTonalStats(processedImageData);
  const refStats = computeTonalStats(referenceImageData);
  const percentiles = ['p5', 'p25', 'p50', 'p75', 'p95'];
  let lumError = 0;
  for (const p of percentiles) lumError += Math.abs(procStats[p] - refStats[p]);
  const lumScore = 1 - Math.min(1, (lumError / percentiles.length) / 0.15);

  return histScore * 0.4 + colorScore * 0.3 + lumScore * 0.3;
}

function buildDescription(tonal, clarity, vibrance, selectiveColor, grain) {
  const traits = [];
  if (tonal.blackPoint > 0.03) traits.push('faded blacks');
  if (tonal.whitePoint < 0.93) traits.push('muted highlights');
  if (tonal.exposure > 0.3) traits.push('bright');
  if (tonal.exposure < -0.3) traits.push('dark');
  if (tonal.shadows > 0.2) traits.push('lifted shadows');
  if (tonal.shadows < -0.2) traits.push('crushed shadows');
  if (tonal.highlights < -0.2) traits.push('recovered highlights');
  if (tonal.contrast > 0.2) traits.push('punchy');
  if (tonal.contrast < -0.2) traits.push('flat');
  if (clarity < -0.2) traits.push('dreamy');
  if (clarity > 0.3) traits.push('crisp');
  if (vibrance < -0.15) traits.push('muted colors');
  if (vibrance > 0.2) traits.push('rich colors');
  if (selectiveColor) {
    if (selectiveColor.green && selectiveColor.green.hueShift > 8) traits.push('teal greens');
    if (selectiveColor.blue && selectiveColor.blue.lumShift < -0.08) traits.push('deep blues');
    if (selectiveColor.orange && selectiveColor.orange.satShift > 0.1) traits.push('warm skin tones');
  }
  if (grain.intensity > 0.15) traits.push('film grain');
  return traits.length > 0 ? 'Detected: ' + traits.join(', ') : 'Neutral look';
}

// ─── Main Auto-Match ──────────────────────────────────────────────────────────

export function autoMatch(sourceImageData, referenceImageData, options = {}) {
  const { matchCurves = true, matchColor = true, matchGrain = true, matchVignette = true, matchTexture = true } = options;

  const t0 = performance.now();
  console.log('[AutoMatch v3] ═══ Starting Analysis ═══');

  const working = new ImageData(
    new Uint8ClampedArray(sourceImageData.data),
    sourceImageData.width, sourceImageData.height
  );

  // 1. Tonal
  const tonal = detectTonalAdjustments(sourceImageData, referenceImageData);
  applyTonalAdjustments(working, tonal);
  const tonalStrength = computeTonalStrength(tonal);

  // 2. Tone Curves
  let toneCurve;
  if (matchCurves) {
    toneCurve = generateMatchedCurvesWithResidual(working, referenceImageData, tonalStrength);
    applyToneCurvesToImageData(working, toneCurve);
  } else {
    const id = [0, 32, 64, 96, 128, 160, 192, 224, 255].map(x => [x, x]);
    toneCurve = { r: id.map(p => [...p]), g: id.map(p => [...p]), b: id.map(p => [...p]) };
  }

  // 3. Color Multipliers
  let colorMults = { rMult: 1, gMult: 1, bMult: 1 };
  let warmth = 0, greenShift = 0;
  if (matchColor) {
    const srcZ = analyzeZones(working);
    const refZ = analyzeZones(referenceImageData);
    colorMults = computeColorTransfer(srcZ, refZ);
    const wm = computeWarmthMatch(srcZ, refZ);
    warmth = wm.warmth;
    greenShift = wm.greenShift;
    applyColorMultsForAnalysis(working, colorMults);
  }

  // 4. Saturation
  let saturation = 1.0;
  if (matchColor) {
    saturation = computeOverallSaturationRatio(working, referenceImageData);
    applyUniformSaturation(working, saturation);
  }

  // 5. Vibrance
  let vibrance = 0;
  if (matchColor) {
    vibrance = detectVibranceFromResidual(working, referenceImageData);
    if (Math.abs(vibrance) > 0.02) applyVibrance(working, vibrance);
  }

  // 6. Selective Color
  let selectiveColor = null;
  if (matchColor) {
    const sc = detectSelectiveColor(working, referenceImageData);
    const hasAdj = Object.values(sc).some(a => Math.abs(a.hueShift) > 0.5 || Math.abs(a.satShift) > 0.02 || Math.abs(a.lumShift) > 0.01);
    selectiveColor = hasAdj ? sc : null;
  }

  // 7. Clarity (Uses originals)
  let clarity = 0;
  if (matchTexture) {
    clarity = detectClarity(sourceImageData, referenceImageData);
  }

  // 8. Texture (Uses originals)
  let grainResult = { intensity: 0, size: 1.0 };
  let vignetteResult = { intensity: 0 };
  if (matchGrain) {
    const refG = estimateGrain(referenceImageData), srcG = estimateGrain(sourceImageData);
    grainResult = { intensity: Math.max(0, refG.intensity - srcG.intensity * 0.5), size: refG.size };
  }
  if (matchVignette) {
    const refV = detectVignette(referenceImageData), srcV = detectVignette(sourceImageData);
    vignetteResult = { intensity: Math.max(0, refV.intensity - srcV.intensity * 0.3) };
  }

  const matchQuality = computeMatchQuality(working, referenceImageData);
  const sharpen = clarity < -0.2 ? 0.03 : clarity > 0.3 ? 0.25 : 0.12;
  const elapsed = performance.now() - t0;
  const desc = buildDescription(tonal, clarity, vibrance, selectiveColor, grainResult);
  
  console.log(`[AutoMatch v3] Complete: ${elapsed.toFixed(0)}ms, quality=${(matchQuality * 100).toFixed(0)}%`);

  return { // Not sanitized yet, sanitizer runs in index.js
    id: 'auto-matched-v3', name: 'Auto Matched v3', description: desc,
    tonal, toneCurve, saturation, vibrance,
    rMult: colorMults.rMult, gMult: colorMults.gMult, bMult: colorMults.bMult,
    warmth, greenShift, selectiveColor, clarity,
    grainIntensity: grainResult.intensity, grainSize: grainResult.size, grainSeed: 42,
    vignetteIntensity: vignetteResult.intensity, sharpenAmount: sharpen,
    
    // Legacy support for UI
    colorAdjust: { rMult: colorMults.rMult, gMult: colorMults.gMult, bMult: colorMults.bMult, saturation, vibrance, warmth, greenShift },
    grain: grainResult, vignette: vignetteResult, splitTone: { shadowWarmth: 0, highlightWarmth: 0 },
    
    _diagnostics: { tonalStrength, matchQuality, elapsed, description: desc }
  };
}
