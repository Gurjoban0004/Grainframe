/**
 * test-auto-match.js — Production Auto-Match Engine v2
 *
 * Handles ANY reference style: film grain, halation, dreamy/soft,
 * matte/faded blacks, split-toning, cross-processing, desaturation,
 * warm/cool casts, crushed highlights, lifted shadows, vignettes, etc.
 *
 * TEST FILE — do not replace auto-match.js with this until validated.
 */

// ─── Core Histogram Utilities ──────────────────────────────────────────────────

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
  const cdf = new Float64Array(256);
  cdf[0] = histogram[0];
  for (let i = 1; i < 256; i++) cdf[i] = cdf[i - 1] + histogram[i];
  return cdf;
}

export function histogramMatch(srcCDF, refCDF) {
  const lut = new Uint8Array(256);
  const totalSrc = srcCDF[255] || 1;
  const totalRef = refCDF[255] || 1;
  for (let i = 0; i < 256; i++) {
    const srcPercent = srcCDF[i] / totalSrc;
    let j = 0;
    while (j < 255 && refCDF[j] / totalRef < srcPercent) j++;
    if (j > 0 && j < 255) {
      const prev = refCDF[j - 1] / totalRef;
      const curr = refCDF[j] / totalRef;
      if (curr !== prev) {
        const t = (srcPercent - prev) / (curr - prev);
        lut[i] = Math.round(j - 1 + t);
      } else {
        lut[i] = j;
      }
    } else {
      lut[i] = j;
    }
  }
  return lut;
}

// ─── Legacy compat exports ─────────────────────────────────────────────────────

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
  const rR = (refColor.meanR + 0.01) / (srcColor.meanR + 0.01);
  const gR = (refColor.meanG + 0.01) / (srcColor.meanG + 0.01);
  const bR = (refColor.meanB + 0.01) / (srcColor.meanB + 0.01);
  const avg = (rR + gR + bR) / 3;
  return {
    rMult: rR / avg, gMult: gR / avg, bMult: bR / avg,
    saturation: Math.sqrt(refColor.meanR ** 2 + refColor.meanG ** 2 + refColor.meanB ** 2) /
      Math.sqrt(srcColor.meanR ** 2 + srcColor.meanG ** 2 + srcColor.meanB ** 2),
    warmth: (refColor.meanR - refColor.meanB) - (srcColor.meanR - srcColor.meanB),
    greenShift: 0
  };
}

export function extractToneCurves(imageData) {
  const curve = new Uint8Array(256);
  const counts = new Uint32Array(256);
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round((data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114));
    counts[lum]++;
  }
  let acc = 0;
  const total = data.length / 4;
  for (let i = 0; i < 256; i++) { acc += counts[i]; curve[i] = Math.floor((acc / total) * 255); }
  const pts = i => [i, curve[i]];
  const p = [0, 32, 64, 96, 128, 160, 192, 224, 255].map(pts);
  return { r: p, g: [...p.map(a => [...a])], b: [...p.map(a => [...a])] };
}

export function estimateGrain(imageData) {
  return analyzeGrain(imageData);
}

export function detectVignette(imageData) {
  return analyzeVignette(imageData);
}

export function drawHistogram(ctx, histogram, color, w, h) {
  const max = Math.max(...histogram) || 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 256; i++) {
    const x = (i / 255) * w, y = (histogram[i] / max) * h;
    if (i === 0) ctx.moveTo(x, h - y); else ctx.lineTo(x, h - y);
  }
  ctx.stroke();
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  ctx.fillStyle = color.replace(/[\d.]+\)$/, '0.12)');
  ctx.fill();
}

export function drawBlended(ctx, processedImageData, referenceImageData, blend) {
  ctx.putImageData(processedImageData, 0, 0);
  if (blend > 0.01) {
    const tmp = document.createElement('canvas');
    tmp.width = referenceImageData.width; tmp.height = referenceImageData.height;
    tmp.getContext('2d').putImageData(referenceImageData, 0, 0);
    ctx.globalAlpha = blend;
    ctx.drawImage(tmp, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.globalAlpha = 1.0;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// ADVANCED ANALYSIS ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function analyzeZones(imageData) {
  const { data, width, height } = imageData;
  const totalPixels = width * height;
  const sampleStep = Math.max(1, Math.floor(totalPixels / 50000));
  const zoneThresholds = [0.0, 0.15, 0.30, 0.55, 0.80, 1.01];
  const zones = Array.from({ length: 5 }, () => ({
    sumR: 0, sumG: 0, sumB: 0,
    sumH: 0, sumS: 0, sumL: 0,
    sqR: 0, sqG: 0, sqB: 0,
    count: 0, minL: 1, maxL: 0,
    hueX: 0, hueY: 0
  }));
  const overall = {
    sumR: 0, sumG: 0, sumB: 0,
    sumH: 0, sumS: 0, sumL: 0,
    sqR: 0, sqG: 0, sqB: 0,
    count: 0, hueX: 0, hueY: 0,
    lumValues: []
  };

  for (let i = 0; i < data.length; i += 4 * sampleStep) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const [h, s, l] = rgbToHsl(r, g, b);
    let zoneIdx = 0;
    for (let z = 0; z < 5; z++) {
      if (l >= zoneThresholds[z] && l < zoneThresholds[z + 1]) { zoneIdx = z; break; }
    }
    const zone = zones[zoneIdx];
    zone.sumR += r; zone.sumG += g; zone.sumB += b;
    zone.sumH += h; zone.sumS += s; zone.sumL += l;
    zone.sqR += r * r; zone.sqG += g * g; zone.sqB += b * b;
    zone.count++;
    zone.minL = Math.min(zone.minL, l);
    zone.maxL = Math.max(zone.maxL, l);
    zone.hueX += Math.cos(h * Math.PI * 2) * s;
    zone.hueY += Math.sin(h * Math.PI * 2) * s;
    overall.sumR += r; overall.sumG += g; overall.sumB += b;
    overall.sumS += s; overall.sumL += l;
    overall.sqR += r * r; overall.sqG += g * g; overall.sqB += b * b;
    overall.count++;
    overall.hueX += Math.cos(h * Math.PI * 2) * s;
    overall.hueY += Math.sin(h * Math.PI * 2) * s;
    overall.lumValues.push(l);
  }

  const computeStats = (z) => {
    if (z.count === 0) return {
      meanR: 0, meanG: 0, meanB: 0, meanS: 0, meanL: 0,
      stdR: 0, stdG: 0, stdB: 0, dominantHue: 0, hueSaturation: 0, count: 0
    };
    const n = z.count;
    const meanR = z.sumR / n, meanG = z.sumG / n, meanB = z.sumB / n;
    const meanS = z.sumS / n, meanL = z.sumL / n;
    return {
      meanR, meanG, meanB, meanS, meanL,
      stdR: Math.sqrt(Math.max(0, z.sqR / n - meanR * meanR)),
      stdG: Math.sqrt(Math.max(0, z.sqG / n - meanG * meanG)),
      stdB: Math.sqrt(Math.max(0, z.sqB / n - meanB * meanB)),
      dominantHue: Math.atan2(z.hueY, z.hueX) / (Math.PI * 2),
      hueSaturation: Math.sqrt(z.hueX * z.hueX + z.hueY * z.hueY) / n,
      count: n
    };
  };

  overall.lumValues.sort((a, b) => a - b);
  const pct = (p) => overall.lumValues[Math.floor(p * overall.lumValues.length)] || 0;

  return {
    zones: zones.map(computeStats),
    overall: computeStats(overall),
    percentiles: {
      p1: pct(0.01), p5: pct(0.05), p10: pct(0.10),
      p25: pct(0.25), p50: pct(0.50), p75: pct(0.75),
      p90: pct(0.90), p95: pct(0.95), p99: pct(0.99)
    }
  };
}

function analyzeGrain(imageData) {
  const { data, width, height } = imageData;
  const lum = new Float32Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    lum[i / 4] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
  }
  const step = Math.max(1, Math.floor(Math.sqrt(width * height / 20000)));
  let laplacianSum = 0, laplacianSq = 0, smoothCount = 0;
  let autoCorr1 = 0, autoCorr2 = 0, autoCorrCount = 0;

  for (let y = 2; y < height - 2; y += step) {
    for (let x = 2; x < width - 2; x += step) {
      const idx = y * width + x;
      const gx = (
        -lum[idx - width - 1] + lum[idx - width + 1]
        - 2 * lum[idx - 1] + 2 * lum[idx + 1]
        - lum[idx + width - 1] + lum[idx + width + 1]
      );
      const gy = (
        -lum[idx - width - 1] - 2 * lum[idx - width] - lum[idx - width + 1]
        + lum[idx + width - 1] + 2 * lum[idx + width] + lum[idx + width + 1]
      );
      const gradMag = Math.sqrt(gx * gx + gy * gy);
      if (gradMag < 0.04) {
        const lap = 4 * lum[idx]
          - lum[idx - 1] - lum[idx + 1]
          - lum[idx - width] - lum[idx + width];
        laplacianSum += Math.abs(lap);
        laplacianSq += lap * lap;
        smoothCount++;
        if (x + 2 < width - 2) {
          const v0 = lum[idx] - (lum[idx - 1] + lum[idx + 1] + lum[idx - width] + lum[idx + width]) / 4;
          const v1 = lum[idx + 1] - (lum[idx] + lum[idx + 2] + lum[idx + 1 - width] + lum[idx + 1 + width]) / 4;
          const v2 = lum[idx + 2] - (lum[idx + 1] + lum[idx + 3] + lum[idx + 2 - width] + lum[idx + 2 + width]) / 4;
          autoCorr1 += v0 * v1;
          autoCorr2 += v0 * v2;
          autoCorrCount++;
        }
      }
    }
  }

  if (smoothCount < 10) return { intensity: 0, size: 1.0, roughness: 0 };

  const meanLap = laplacianSum / smoothCount;
  const varLap = laplacianSq / smoothCount - (laplacianSum / smoothCount) ** 2;
  const rmsNoise = Math.sqrt(Math.max(0, varLap));
  const intensity = Math.min(1.0, rmsNoise / 0.035);

  let grainSize = 1.0;
  if (autoCorrCount > 0 && autoCorr1 !== 0) {
    const corr1 = autoCorr1 / autoCorrCount;
    const corr2 = autoCorr2 / autoCorrCount;
    const decayRate = corr1 !== 0 ? Math.abs(corr2 / corr1) : 0;
    grainSize = Math.max(0.5, Math.min(3.0, 0.5 + decayRate * 3.0));
  }

  return { intensity, size: grainSize, roughness: meanLap };
}

function analyzeVignette(imageData) {
  const { data, width, height } = imageData;
  const cx = width / 2, cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const numRings = 8;
  const ringData = Array.from({ length: numRings }, () => []);
  const step = Math.max(1, Math.floor(Math.sqrt(width * height / 15000)));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const lum = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDist;
      const ring = Math.min(numRings - 1, Math.floor(dist * numRings));
      ringData[ring].push(lum);
    }
  }

  const median = (arr) => {
    if (arr.length === 0) return 0;
    arr.sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  };

  const ringMedians = ringData.map(median);
  if (ringMedians[0] === 0) return { intensity: 0 };

  const innerAvg = (ringMedians[0] + ringMedians[1]) / 2;
  const outerAvg = (ringMedians[numRings - 1] + ringMedians[numRings - 2]) / 2;
  const falloff = (innerAvg - outerAvg) / (innerAvg + 0.001);
  const intensity = Math.max(0, Math.min(1.0, falloff * 1.8));

  return { intensity, ringMedians, falloff };
}

function analyzeFade(imageData) {
  const { data } = imageData;
  const n = data.length / 4;
  const sampleStep = Math.max(1, Math.floor(n / 30000));
  const lumHist = new Uint32Array(256);

  for (let i = 0; i < data.length; i += 4 * sampleStep) {
    const lum = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    lumHist[lum]++;
  }

  const total = lumHist.reduce((a, b) => a + b, 0);
  let acc = 0, p1 = 0, p99 = 255;
  for (let i = 0; i < 256; i++) {
    acc += lumHist[i];
    if (acc >= total * 0.01 && p1 === 0) p1 = i;
    if (acc >= total * 0.99) { p99 = i; break; }
  }

  return {
    blackLift: Math.min(1, (p1 / 255) * 4),
    whiteCrush: Math.min(1, ((255 - p99) / 255) * 4),
    actualBlackPoint: p1,
    actualWhitePoint: p99,
    isFaded: p1 > 15,
    isCrushed: p99 < 240
  };
}

function analyzeSplitTone(zoneAnalysis) {
  const shadows = zoneAnalysis.zones[0];
  const highlights = zoneAnalysis.zones[4];
  if (shadows.count < 10 || highlights.count < 10) {
    return { hasSplitTone: false, shadowHue: 0, highlightHue: 0, strength: 0 };
  }
  const shadowCast = {
    r: shadows.meanR - shadows.meanL,
    g: shadows.meanG - shadows.meanL,
    b: shadows.meanB - shadows.meanL
  };
  const highlightCast = {
    r: highlights.meanR - highlights.meanL,
    g: highlights.meanG - highlights.meanL,
    b: highlights.meanB - highlights.meanL
  };
  const shadowStrength = Math.sqrt(shadowCast.r ** 2 + shadowCast.g ** 2 + shadowCast.b ** 2);
  const highlightStrength = Math.sqrt(highlightCast.r ** 2 + highlightCast.g ** 2 + highlightCast.b ** 2);
  const dotProduct = shadowCast.r * highlightCast.r + shadowCast.g * highlightCast.g + shadowCast.b * highlightCast.b;
  const similarity = (shadowStrength > 0.001 && highlightStrength > 0.001)
    ? dotProduct / (shadowStrength * highlightStrength) : 1;
  return {
    hasSplitTone: similarity < 0.5 && (shadowStrength > 0.02 || highlightStrength > 0.02),
    shadowCast, highlightCast, shadowStrength, highlightStrength,
    divergence: 1 - similarity
  };
}

function analyzeContrast(zoneAnalysis) {
  const p = zoneAnalysis.percentiles;
  const dynamicRange = p.p99 - p.p1;
  const shadowContrast = p.p25 - p.p5;
  const midContrast = p.p75 - p.p25;
  const highlightContrast = p.p95 - p.p75;
  const sCurveStrength = midContrast / (shadowContrast + highlightContrast + 0.001);
  return {
    dynamicRange, shadowContrast, midContrast, highlightContrast, sCurveStrength,
    isLowContrast: dynamicRange < 0.5,
    isHighContrast: dynamicRange > 0.85
  };
}

function analyzeHalation(imageData) {
  const { data, width, height } = imageData;
  const step = Math.max(1, Math.floor(Math.sqrt(width * height / 10000)));
  let halationScore = 0, halationSamples = 0, warmBleed = 0;

  for (let y = 4; y < height - 4; y += step * 3) {
    for (let x = 4; x < width - 4; x += step * 3) {
      const idx = (y * width + x) * 4;
      const lum = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;
      if (lum > 0.75) {
        const offsets = [[-3,0],[3,0],[0,-3],[0,3],[-2,-2],[2,2],[-2,2],[2,-2]];
        for (const [dx, dy] of offsets) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = (ny * width + nx) * 4;
            const nLum = (data[nIdx] * 0.299 + data[nIdx + 1] * 0.587 + data[nIdx + 2] * 0.114) / 255;
            if (nLum < lum * 0.85 && nLum > 0.2) {
              const warmShift = (data[nIdx] / 255 - data[nIdx + 2] / 255) - (data[idx] / 255 - data[idx + 2] / 255);
              if (warmShift > 0.02) { warmBleed += warmShift; halationScore++; }
              halationSamples++;
            }
          }
        }
      }
    }
  }

  const intensity = halationSamples > 0 ? Math.min(1.0, (halationScore / halationSamples) * 8) : 0;
  const warmth = halationSamples > 0 ? warmBleed / Math.max(1, halationScore) : 0;
  return { intensity, warmth, isPresent: intensity > 0.15 };
}

function analyzeMood(zoneAnalysis, fadeAnalysis, contrastAnalysis) {
  const overall = zoneAnalysis.overall;
  const temperature = overall.meanR - overall.meanB;
  const avgSaturation = overall.meanS;
  return {
    temperature,
    avgSaturation,
    isDreamy: avgSaturation < 0.25 && contrastAnalysis.isLowContrast,
    isMoody: contrastAnalysis.dynamicRange > 0.6 && avgSaturation < 0.3,
    isVibrant: avgSaturation > 0.45 && contrastAnalysis.dynamicRange > 0.5,
    isFilm: fadeAnalysis.isFaded && avgSaturation < 0.4,
    isCinematic: contrastAnalysis.sCurveStrength > 1.5 && !(avgSaturation > 0.45 && contrastAnalysis.dynamicRange > 0.5)
  };
}


// ═══════════════════════════════════════════════════════════════════════════════
// TONE CURVE GENERATION FROM ACTUAL HISTOGRAM MATCHING
// ═══════════════════════════════════════════════════════════════════════════════

function generateMatchedCurves(srcImageData, refImageData) {
  const srcHist = computeHistograms(srcImageData);
  const refHist = computeHistograms(refImageData);

  const lutR = histogramMatch(computeCDF(srcHist.r), computeCDF(refHist.r));
  const lutG = histogramMatch(computeCDF(srcHist.g), computeCDF(refHist.g));
  const lutB = histogramMatch(computeCDF(srcHist.b), computeCDF(refHist.b));

  const smooth = (lut, radius = 3) => {
    const out = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      let sum = 0, count = 0;
      for (let j = Math.max(0, i - radius); j <= Math.min(255, i + radius); j++) {
        const w = 1 - Math.abs(j - i) / (radius + 1);
        sum += lut[j] * w; count += w;
      }
      out[i] = Math.round(sum / count);
    }
    return out;
  };

  const blendStrength = 0.65;
  const blend = (lut, strength) => {
    const out = new Uint8Array(256);
    for (let i = 0; i < 256; i++) out[i] = Math.round(i * (1 - strength) + lut[i] * strength);
    return out;
  };

  const finalR = blend(smooth(lutR), blendStrength);
  const finalG = blend(smooth(lutG), blendStrength);
  const finalB = blend(smooth(lutB), blendStrength);

  const samplePoints = [0, 32, 64, 96, 128, 160, 192, 224, 255];
  const sampleLUT = (lut) => samplePoints.map(x => [x, lut[x]]);

  return {
    r: sampleLUT(finalR), g: sampleLUT(finalG), b: sampleLUT(finalB),
    _lutR: finalR, _lutG: finalG, _lutB: finalB
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COLOR TRANSFER (Reinhard-style, zone-weighted)
// ═══════════════════════════════════════════════════════════════════════════════

function computeColorTransfer(srcZones, refZones) {
  const zoneWeights = [0.12, 0.18, 0.40, 0.18, 0.12];
  let wR = 0, wG = 0, wB = 0, wTotal = 0;

  for (let z = 0; z < 5; z++) {
    const src = srcZones.zones[z], ref = refZones.zones[z];
    if (src.count < 5 || ref.count < 5) continue;
    const weight = zoneWeights[z] * Math.min(src.count, ref.count);
    const stdRatioR = (ref.stdR + 0.001) / (src.stdR + 0.001);
    const stdRatioG = (ref.stdG + 0.001) / (src.stdG + 0.001);
    const stdRatioB = (ref.stdB + 0.001) / (src.stdB + 0.001);
    const meanRatioR = (ref.meanR + 0.001) / (src.meanR + 0.001);
    const meanRatioG = (ref.meanG + 0.001) / (src.meanG + 0.001);
    const meanRatioB = (ref.meanB + 0.001) / (src.meanB + 0.001);
    const alpha = 0.6;
    wR += (alpha * meanRatioR + (1 - alpha) * stdRatioR) * weight;
    wG += (alpha * meanRatioG + (1 - alpha) * stdRatioG) * weight;
    wB += (alpha * meanRatioB + (1 - alpha) * stdRatioB) * weight;
    wTotal += weight;
  }

  if (wTotal === 0) return { rMult: 1, gMult: 1, bMult: 1 };
  let rMult = wR / wTotal, gMult = wG / wTotal, bMult = wB / wTotal;
  const avg = (rMult + gMult + bMult) / 3;
  rMult /= avg; gMult /= avg; bMult /= avg;
  const clamp = (v) => Math.max(0.6, Math.min(1.5, v));
  return { rMult: clamp(rMult), gMult: clamp(gMult), bMult: clamp(bMult) };
}

function computeSaturationMatch(srcZones, refZones) {
  const srcSat = srcZones.overall.meanS, refSat = refZones.overall.meanS;
  if (srcSat < 0.001) return 1.0;
  let ratio = refSat / srcSat;
  ratio = ratio > 1 ? 1 + (ratio - 1) * 0.7 : 1 - (1 - ratio) * 0.8;
  return Math.max(0.3, Math.min(1.8, ratio));
}

function computeWarmthMatch(srcZones, refZones) {
  const srcOverall = srcZones.overall, refOverall = refZones.overall;
  let warmth = ((refOverall.meanR - refOverall.meanB) - (srcOverall.meanR - srcOverall.meanB)) * 0.8;
  warmth = Math.max(-0.08, Math.min(0.08, warmth));
  const srcGreen = srcOverall.meanG - (srcOverall.meanR + srcOverall.meanB) / 2;
  const refGreen = refOverall.meanG - (refOverall.meanR + refOverall.meanB) / 2;
  let greenShift = (refGreen - srcGreen) * 0.4;
  greenShift = Math.max(-0.03, Math.min(0.03, greenShift));
  return { warmth, greenShift };
}


// ═══════════════════════════════════════════════════════════════════════════════
// MAIN AUTO-MATCH FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

export function autoMatch(sourceImageData, referenceImageData, options = {}) {
  const {
    matchCurves = true,
    matchColor = true,
    matchGrain = true,
    matchVignette = true
  } = options;

  console.log('[AutoMatch v2] Starting comprehensive analysis...');
  const t0 = performance.now();

  const srcZones = analyzeZones(sourceImageData);
  const refZones = analyzeZones(referenceImageData);
  console.log('[AutoMatch v2] Zone analysis complete');

  const refFade = analyzeFade(referenceImageData);
  const srcFade = analyzeFade(sourceImageData);
  const refContrast = analyzeContrast(refZones);
  const srcContrast = analyzeContrast(srcZones);
  const refSplitTone = analyzeSplitTone(refZones);
  const refHalation = analyzeHalation(referenceImageData);
  const refMood = analyzeMood(refZones, refFade, refContrast);
  console.log('[AutoMatch v2] Style detection complete');
  console.log(`  Mood: dreamy=${refMood.isDreamy}, moody=${refMood.isMoody}, vibrant=${refMood.isVibrant}, film=${refMood.isFilm}, cinematic=${refMood.isCinematic}`);
  console.log(`  Fade: blackLift=${refFade.blackLift.toFixed(3)}, whiteCrush=${refFade.whiteCrush.toFixed(3)}`);
  console.log(`  Split tone: ${refSplitTone.hasSplitTone}, divergence=${refSplitTone.divergence.toFixed(3)}`);
  console.log(`  Halation: ${refHalation.isPresent}, intensity=${refHalation.intensity.toFixed(3)}`);

  // Tone curves
  let toneCurve;
  if (matchCurves) {
    toneCurve = generateMatchedCurves(sourceImageData, referenceImageData);

    if (refFade.isFaded) {
      const blackLift = refFade.actualBlackPoint;
      for (const ch of ['r', 'g', 'b']) {
        const pts = toneCurve[ch];
        if (pts[0][1] < blackLift * 0.7) {
          pts[0][1] = Math.round(blackLift * 0.6);
          if (pts[1][1] < pts[0][1] + 10)
            pts[1][1] = Math.round(pts[0][1] + (pts[2][1] - pts[0][1]) * 0.35);
        }
      }
    }

    if (refFade.isCrushed) {
      const whiteCrush = refFade.actualWhitePoint;
      for (const ch of ['r', 'g', 'b']) {
        const pts = toneCurve[ch];
        const last = pts.length - 1;
        if (pts[last][1] > whiteCrush * 1.05) {
          pts[last][1] = Math.min(255, Math.round(whiteCrush * 1.02));
          if (pts[last - 1][1] > pts[last][1] - 5)
            pts[last - 1][1] = Math.round(pts[last][1] - (pts[last][1] - pts[last - 2][1]) * 0.3);
        }
      }
    }
    console.log('[AutoMatch v2] Tone curves generated from histogram matching');
  } else {
    const identity = [[0,0],[32,32],[64,64],[96,96],[128,128],[160,160],[192,192],[224,224],[255,255]];
    toneCurve = { r: identity, g: identity.map(a => [...a]), b: identity.map(a => [...a]) };
  }

  // Color transfer
  let colorMults = { rMult: 1, gMult: 1, bMult: 1 };
  let saturation = 1.0, warmth = 0, greenShift = 0;

  if (matchColor) {
    colorMults = computeColorTransfer(srcZones, refZones);
    saturation = computeSaturationMatch(srcZones, refZones);
    const warmthResult = computeWarmthMatch(srcZones, refZones);
    warmth = warmthResult.warmth;
    greenShift = warmthResult.greenShift;
    if (refSplitTone.hasSplitTone) {
      warmth += (refSplitTone.shadowCast.r - refSplitTone.shadowCast.b) * 0.15;
      warmth = Math.max(-0.1, Math.min(0.1, warmth));
    }
    console.log('[AutoMatch v2] Color transfer computed');
    console.log(`  Mults: R=${colorMults.rMult.toFixed(3)} G=${colorMults.gMult.toFixed(3)} B=${colorMults.bMult.toFixed(3)}`);
    console.log(`  Saturation: ${saturation.toFixed(3)}, Warmth: ${warmth.toFixed(4)}, Green: ${greenShift.toFixed(4)}`);
  }

  // Grain
  const refGrain = matchGrain ? analyzeGrain(referenceImageData) : { intensity: 0, size: 1.0 };
  const srcGrain = matchGrain ? analyzeGrain(sourceImageData) : { intensity: 0, size: 1.0 };
  let grainResult = { intensity: 0, size: 1.0 };
  if (matchGrain) {
    grainResult = {
      intensity: Math.min(1.0, Math.max(0, refGrain.intensity - srcGrain.intensity * 0.5)),
      size: refGrain.size
    };
    console.log(`[AutoMatch v2] Grain: ref=${refGrain.intensity.toFixed(3)} src=${srcGrain.intensity.toFixed(3)} → add=${grainResult.intensity.toFixed(3)}`);
  }

  // Vignette
  const refVignette = matchVignette ? analyzeVignette(referenceImageData) : { intensity: 0 };
  const srcVignette = matchVignette ? analyzeVignette(sourceImageData) : { intensity: 0 };
  let vignetteResult = { intensity: 0 };
  if (matchVignette) {
    vignetteResult = { intensity: Math.min(0.8, Math.max(0, refVignette.intensity - srcVignette.intensity * 0.3)) };
    console.log(`[AutoMatch v2] Vignette: ref=${refVignette.intensity.toFixed(3)} → apply=${vignetteResult.intensity.toFixed(3)}`);
  }

  // Sharpening
  let sharpen = 0.15;
  if (refMood.isDreamy) sharpen = 0.02;
  else if (refMood.isFilm) sharpen = 0.08;

  console.log(`[AutoMatch v2] Complete in ${(performance.now() - t0).toFixed(0)}ms`);

  return {
    id: 'auto-matched-v2',
    name: 'Auto Matched v2',
    description: `Matched: ${[
      refMood.isDreamy && 'dreamy',
      refMood.isMoody && 'moody',
      refMood.isVibrant && 'vibrant',
      refMood.isFilm && 'film',
      refMood.isCinematic && 'cinematic',
      refFade.isFaded && 'faded',
      refSplitTone.hasSplitTone && 'split-toned',
      refHalation.isPresent && 'halation'
    ].filter(Boolean).join(', ') || 'neutral'}`,
    toneCurve,
    saturation: matchColor ? saturation : 1,
    rMult: matchColor ? colorMults.rMult : 1,
    gMult: matchColor ? colorMults.gMult : 1,
    bMult: matchColor ? colorMults.bMult : 1,
    warmth: matchColor ? warmth : 0,
    greenShift: matchColor ? greenShift : 0,
    grainIntensity: grainResult.intensity,
    grainSize: grainResult.size,
    grainSeed: 42,
    vignetteIntensity: vignetteResult.intensity,
    sharpenAmount: sharpen,
    colorAdjust: { rMult: colorMults.rMult, gMult: colorMults.gMult, bMult: colorMults.bMult, saturation, warmth, greenShift },
    grain: grainResult,
    vignette: vignetteResult,
    _diagnostics: {
      mood: refMood, fade: refFade, contrast: refContrast,
      splitTone: refSplitTone, halation: refHalation,
      srcZones: srcZones.overall, refZones: refZones.overall
    }
  };
}
