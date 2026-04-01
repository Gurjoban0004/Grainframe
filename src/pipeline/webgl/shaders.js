// Shared vertex shader — fullscreen quad with texture coordinates
export const vertexShader = `#version 300 es
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texCoord;

out vec2 v_uv;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  // Pass UVs unchanged. _readPixels flips rows when reading back,
  // which is the single conversion from WebGL (Y=0 bottom) to
  // ImageData (Y=0 top). One flip only.
  v_uv = a_texCoord;
}
`;

// ==================================================
// PASS 1: Main color pipeline
// Matches the Canvas pipeline stage order exactly:
//   applyColor (linear light) → applyVignette (linear light)
//   → applyToneCurve (sRGB) → applyGrain (sRGB) → applySharpen (sRGB)
//
// Preset fields are FLAT (e.g. preset.saturation, preset.vignetteIntensity)
// matching the actual JSON structure.
// ==================================================
export const colorFragmentShader = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;
uniform sampler2D u_lutR;
uniform sampler2D u_lutG;
uniform sampler2D u_lutB;
uniform sampler2D u_grain;

// Tonal Decomposition
uniform float u_exposure;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_blackPoint;
uniform float u_whitePoint;

// Color adjust (flat preset fields)
uniform float u_saturation;      // preset.saturation
uniform float u_vibrance;        // preset.vibrance
uniform float u_rMult;           // preset.rMult
uniform float u_gMult;           // preset.gMult
uniform float u_bMult;           // preset.bMult
uniform float u_warmth;          // preset.warmth
uniform float u_greenShift;      // preset.greenShift

uniform int u_hasSelectiveColor;
uniform vec3 u_selectiveColor[8];



// Vignette
uniform float u_vignetteIntensity; // preset.vignetteIntensity

// Grain
uniform float u_grainIntensity;  // preset.grainIntensity
uniform float u_grainSize;       // preset.grainSize
uniform vec2  u_grainOffset;
uniform vec2  u_resolution;

vec3 srgbToLinear(vec3 c) {
  vec3 lo = c / 12.92;
  vec3 hi = pow((c + 0.055) / 1.055, vec3(2.4));
  return mix(lo, hi, step(vec3(0.04045), c));
}

vec2 getZoneParams(int i) {
    if (i == 0) return vec2(0.0, 30.0);
    if (i == 1) return vec2(35.0, 20.0);
    if (i == 2) return vec2(60.0, 22.0);
    if (i == 3) return vec2(120.0, 45.0);
    if (i == 4) return vec2(180.0, 22.0);
    if (i == 5) return vec2(230.0, 35.0);
    if (i == 6) return vec2(280.0, 30.0);
    return vec2(330.0, 22.0);
}

float zoneWeight(float hue, vec2 params) {
    float center = params.x;
    float halfWidth = params.y;
    float dist = abs(hue - center);
    if (dist > 180.0) dist = 360.0 - dist;
    if (dist >= halfWidth) return 0.0;
    return (cos((dist / halfWidth) * 3.14159265359) + 1.0) * 0.5;
}

// linear light → sRGB (matches colorspace.js linearToSrgbLUT)
vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

// RGB → HSL (matches color.js rgbToHsl)
vec3 rgbToHsl(vec3 c) {
  float maxC = max(c.r, max(c.g, c.b));
  float minC = min(c.r, min(c.g, c.b));
  float l = (maxC + minC) * 0.5;
  float d = maxC - minC;
  if (d < 0.00001) return vec3(0.0, 0.0, l);
  float s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
  float h;
  if (maxC == c.r) {
    h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
  } else if (maxC == c.g) {
    h = (c.b - c.r) / d + 2.0;
  } else {
    h = (c.r - c.g) / d + 4.0;
  }
  h /= 6.0;
  return vec3(h * 360.0, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5)     return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}

// HSL → RGB (matches color.js hslToRgb)
vec3 hslToRgb(vec3 hsl) {
  float h = hsl.x / 360.0;
  float s = hsl.y;
  float l = hsl.z;
  if (s < 0.00001) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return vec3(
    hue2rgb(p, q, h + 1.0/3.0),
    hue2rgb(p, q, h),
    hue2rgb(p, q, h - 1.0/3.0)
  );
}

void main() {
  vec4 texel = texture(u_image, v_uv);
  vec3 rgb = texel.rgb;

  // === STAGE 1 (applyColor): linear light color transform ===
  vec3 lin = srgbToLinear(rgb);

  // === Tonal Decomposition ===
  // 1. Exposure
  if (abs(u_exposure) > 0.01) {
    float gain = pow(2.0, u_exposure);
    lin = lin * gain;
    // Soft highlight rolloff - compress overexposed values toward 1.0
    // For values <= 1.0, leave as-is. For values > 1.0, apply shoulder.
    vec3 over = max(vec3(0.0), lin - vec3(1.0));
    vec3 shoulder = 1.0 - 0.3 * exp(-over * 2.0);
    // Only apply shoulder where lin > 1.0
    lin = mix(lin, shoulder, step(vec3(1.0), lin));
  }
  
  // 2. Black point
  if (u_blackPoint > 0.005) {
    lin = u_blackPoint + lin * (1.0 - u_blackPoint);
  }
  
  // 3. White point
  if (u_whitePoint < 0.995) {
    lin = lin * u_whitePoint;
  }
  
  // 4. Highlights
  if (abs(u_highlights) > 0.01) {
    vec3 hw = smoothstep(0.3, 0.7, lin);
    if (u_highlights < 0.0) {
      lin = lin - hw * abs(u_highlights) * (lin - 0.5) * 0.8;
    } else {
      lin = lin + hw * u_highlights * (1.0 - lin) * 0.6;
    }
  }
  
  // 5. Shadows
  if (abs(u_shadows) > 0.01) {
    vec3 sw = 1.0 - smoothstep(0.3, 0.7, lin);
    if (u_shadows > 0.0) {
      lin = lin + sw * u_shadows * (0.5 - lin) * 0.8;
    } else {
      lin = lin + sw * u_shadows * lin * 0.6;
    }
  }
  
  // 6. Brightness
  if (abs(u_brightness) > 0.01) {
    vec3 midW = exp(-pow((lin - 0.5) / 0.3, vec3(2.0)));
    lin = lin + u_brightness * midW * 0.3;
  }
  
  // 7. Contrast
  if (abs(u_contrast) > 0.01) {
    vec3 centered = lin - 0.5;
    if (u_contrast > 0.0) {
      float k = 1.0 + u_contrast * 3.0;
      lin = 0.5 + centered * k / (1.0 + abs(centered) * (k - 1.0) * 2.0);
    } else {
      lin = 0.5 + centered * (1.0 + u_contrast * 0.8);
    }
  }
  
  lin = clamp(lin, 0.0, 1.0);

  // Channel multipliers (same order as color.js)
  lin *= vec3(u_rMult, u_gMult, u_bMult);

  // Saturation via HSL (matches color.js exactly)
  vec3 hsl = rgbToHsl(lin);
  hsl.y = clamp(hsl.y * u_saturation, 0.0, 1.0);
  lin = hslToRgb(hsl);

  // === Vibrance ===
  if (abs(u_vibrance) > 0.001) {
    float lum = dot(lin, vec3(0.2126, 0.7152, 0.0722));
    float maxC = max(lin.r, max(lin.g, lin.b));
    float minC = min(lin.r, min(lin.g, lin.b));
    float chroma = maxC - minC;
    float sat = maxC > 0.001 ? chroma / maxC : 0.0;
    
    float weight = 1.0 - sat;
    weight = weight * weight;
    
    if (chroma > 0.01) {
      float h;
      if (maxC == lin.r) {
        // mod in GLSL is (x - y * floor(x/y)), which behaves well for positive. 
        // to handle negative like JS % 6 correctly we can add 6 then mod 6
        float temp = (lin.g - lin.b) / chroma;
        h = mod(mod(temp, 6.0) + 6.0, 6.0);
      } else if (maxC == lin.g) {
        h = (lin.b - lin.r) / chroma + 2.0;
      } else {
        h = (lin.r - lin.g) / chroma + 4.0;
      }
      h *= 60.0;
      if (h < 0.0) h += 360.0;
      
      if (h > 10.0 && h < 55.0 && sat > 0.1 && sat < 0.65) {
        float skinCenter = 28.0;
        float skinWidth = 18.0;
        float dist = abs(h - skinCenter) / skinWidth;
        float skinFactor = max(0.0, 1.0 - dist * dist);
        weight *= (1.0 - skinFactor * 0.5);
      }
    }
    
    float amount = u_vibrance * weight;
    float scale = 1.0 + amount;
    
    lin = lum + (lin - lum) * scale;
  }

  // === Selective Color ===
  if (u_hasSelectiveColor > 0) {
    vec3 hslSC = rgbToHsl(lin);
    float hSC = hslSC.x;
    float sSC = hslSC.y;
    float lSC = hslSC.z;
    
    // Only apply if chromatic
    if (sSC > 0.001) {
        float totalHueShift = 0.0;
        float totalSatMult = 1.0;
        float totalLumShift = 0.0;
        float totalWeight = 0.0;
        
        for (int i = 0; i < 8; i++) {
            vec2 params = getZoneParams(i);
            float w = zoneWeight(hSC, params);
            if (w > 0.001) {
                totalWeight += w;
                vec3 adj = u_selectiveColor[i];
                totalHueShift += adj.x * w;
                totalSatMult += adj.y * w;
                totalLumShift += adj.z * w;
            }
        }
        
        if (totalWeight > 0.001) {
            float newH = hSC + totalHueShift;
            float newS = sSC * max(0.0, totalSatMult);
            float newL = lSC + totalLumShift;
            
            newH = mod(mod(newH, 360.0) + 360.0, 360.0);
            newS = clamp(newS, 0.0, 1.0);
            newL = clamp(newL, 0.0, 1.0);
            
            lin = hslToRgb(vec3(newH, newS, newL));
        }
    }
  }


  // Warmth (matches color.js: r += warmth, b -= warmth, in linear)
  lin.r += u_warmth;
  lin.b -= u_warmth;
  lin = clamp(lin, 0.0, 1.0);

  // === Green-to-olive hue shift ===
  // Selectively shifts green-dominant pixels toward yellow/olive.
  // Only affects pixels where green is the dominant channel.
  // Skin tones (red-dominant) are not affected.
  if (u_greenShift > 0.001) {
    float maxC = max(max(lin.r, lin.g), lin.b);
    float minC = min(min(lin.r, lin.g), lin.b);
    float chroma = maxC - minC;

    if (chroma > 0.01) {
      float greenness = (lin.g - max(lin.r, lin.b)) / chroma;
      float shift = max(0.0, greenness) * u_greenShift;

      lin.r += shift * chroma * 0.5;
      lin.b -= shift * chroma * 0.3;

      // Slightly desaturate the shifted greens to avoid neon olive
      float lumAfter = dot(lin, vec3(0.2126, 0.7152, 0.0722));
      lin = mix(lin, vec3(lumAfter), shift * 0.15);
    }
  }

  // Back to sRGB after color stage
  vec3 srgb = linearToSrgb(lin);

  // === STAGE 2 (applyVignette): radial vignette in linear light ===
  // Matches vignette.js: innerR = shorter*0.5, outerR = longer*0.75
  // intensity capped so corners are max 25% dark
  if (u_vignetteIntensity > 0.0) {
    float w = u_resolution.x;
    float h = u_resolution.y;
    float shorter = min(w, h);
    float longer  = max(w, h);
    float innerR  = shorter * 0.5;
    float outerR  = longer  * 0.75;
    float range   = outerR - innerR;

    // Corner distance for cap calculation
    float cx = w * 0.5;
    float cy = h * 0.5;
    float cornerDist = length(vec2(cx, cy));
    float rawCorner  = clamp((cornerDist - innerR) / range, 0.0, 1.0);
    float effectiveIntensity = u_vignetteIntensity;

    // Pixel distance from center (in actual pixels, not UV)
    vec2 pixelPos = v_uv * vec2(w, h);
    float dx = pixelPos.x - cx;
    float dy = pixelPos.y - cy;
    float dist = length(vec2(dx, dy));

    float falloff = clamp((dist - innerR) / range, 0.0, 1.0);
    float mul = 1.0 - effectiveIntensity * falloff;

    // Apply in linear light (matches vignette.js)
    vec3 linV = srgbToLinear(srgb);
    linV *= mul;
    srgb = linearToSrgb(linV);
  }

  // === STAGE 3 (applyToneCurve): LUT lookup in sRGB ===
  // Sample at srgb value directly — LINEAR filter + CLAMP_TO_EDGE
  // maps [0,1] to [texel0, texel255] correctly.
  float lutR = texture(u_lutR, vec2(srgb.r, 0.5)).r;
  float lutG = texture(u_lutG, vec2(srgb.g, 0.5)).r;
  float lutB = texture(u_lutB, vec2(srgb.b, 0.5)).r;
  srgb = vec3(lutR, lutG, lutB);

  // === STAGE 4 (applyGrain): film grain in sRGB ===
  if (u_grainIntensity > 0.001) {
    float luminance = dot(srgb, vec3(0.299, 0.587, 0.114));
    float grainFactor = u_grainIntensity * (1.0 - luminance * 0.6);

    vec2 grainUV = v_uv * u_resolution / (u_grainSize * 64.0) + u_grainOffset;
    float noise = texture(u_grain, grainUV).r - 0.5;

    // Monochrome grain when saturation is 0 (matches grain.js)
    float monoMask = step(u_saturation, 0.05);
    vec3 monoGrain  = vec3(noise * grainFactor);
    vec3 colorGrain = vec3(
      noise * grainFactor * 1.1,
      noise * grainFactor * 0.9,
      noise * grainFactor * 1.1
    );
    srgb += mix(colorGrain, monoGrain, monoMask);
  }

  fragColor = vec4(clamp(srgb, 0.0, 1.0), texel.a);
}
`;

// ==================================================
// PASS 2/3: Gaussian blur (separable, 9-tap)
// Direction controlled by u_direction uniform
// ==================================================
export const blurFragmentShader = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform vec2 u_direction;

void main() {
  vec2 texelSize = 1.0 / u_resolution;
  vec2 step = texelSize * u_direction;

  // 9-tap Gaussian kernel (sigma ≈ 1.0)
  vec3 sum = vec3(0.0);
  sum += texture(u_image, v_uv - 4.0 * step).rgb * 0.0162;
  sum += texture(u_image, v_uv - 3.0 * step).rgb * 0.0540;
  sum += texture(u_image, v_uv - 2.0 * step).rgb * 0.1216;
  sum += texture(u_image, v_uv - 1.0 * step).rgb * 0.1933;
  sum += texture(u_image, v_uv              ).rgb * 0.2108;
  sum += texture(u_image, v_uv + 1.0 * step).rgb * 0.1933;
  sum += texture(u_image, v_uv + 2.0 * step).rgb * 0.1216;
  sum += texture(u_image, v_uv + 3.0 * step).rgb * 0.0540;
  sum += texture(u_image, v_uv + 4.0 * step).rgb * 0.0162;

  fragColor = vec4(sum, 1.0);
}
`;

// ==================================================
// PASS 4: Sharpen (unsharp mask)
// output = original + (original - blurred) * amount
// ==================================================
export const sharpenFragmentShader = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_original;
uniform sampler2D u_blurred;
uniform float u_amount;

void main() {
  vec3 orig = texture(u_original, v_uv).rgb;
  vec3 blur = texture(u_blurred, v_uv).rgb;

  vec3 edge = orig - blur;
  vec3 result = orig + edge * u_amount;

  fragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
}
`;

// ==================================================
// Passthrough — copy texture to output
// ==================================================
export const passthroughFragmentShader = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_image;

void main() {
  fragColor = texture(u_image, v_uv);
}
`;
