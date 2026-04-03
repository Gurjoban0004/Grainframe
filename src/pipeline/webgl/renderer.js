import { createShaderPrograms, getUniformLocations } from './programs.js';
import { generateGrainTexture } from './grain-texture.js';
import { buildToneCurveLUTs } from '../tonecurve.js';

export class WebGLRenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.gl = this.canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      antialias: false,
      depth: false,
      stencil: false,
    });

    console.log('[WebGL] Context:', this.gl ? 'created' : 'FAILED');

    if (!this.gl) {
      throw new Error('WebGL2 not available');
    }

    console.log('[WebGL] MAX_TEXTURE_SIZE:', this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE));
    console.log('[WebGL] Renderer:', this.gl.getParameter(this.gl.RENDERER));
    console.log('[WebGL] Vendor:', this.gl.getParameter(this.gl.VENDOR));

    this.contextLost = false;
    this._initialize();

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('WebGL context lost');
      this.contextLost = true;
    });

    this.canvas.addEventListener('webglcontextrestored', () => {
      console.log('WebGL context restored');
      this.contextLost = false;
      this._initialize();
    });
  }

  _initialize() {
    const gl = this.gl;

    this.programs = createShaderPrograms(gl);

    this.uniforms = {
      color: getUniformLocations(gl, this.programs.color, [
        'u_image', 'u_lutR', 'u_lutG', 'u_lutB', 'u_grain', 'u_skinMask', 'u_hasSkinMask',
        'u_exposure', 'u_highlights', 'u_shadows', 'u_brightness', 'u_contrast', 'u_blackPoint', 'u_whitePoint',
        'u_saturation', 'u_vibrance', 'u_rMult', 'u_gMult', 'u_bMult', 'u_warmth', 'u_greenShift',
        'u_vignetteIntensity', 'u_grainIntensity', 'u_grainSize',
        'u_grainOffset', 'u_resolution', 'u_hasSelectiveColor', 'u_selectiveColor'
      ]),

      blur: getUniformLocations(gl, this.programs.blur, [
        'u_image', 'u_resolution', 'u_direction',
      ]),
      sharpen: getUniformLocations(gl, this.programs.sharpen, [
        'u_original', 'u_blurred', 'u_amount', 'u_skinMask', 'u_hasSkinMask'
      ]),
      passthrough: getUniformLocations(gl, this.programs.passthrough, [
        'u_image',
      ]),
    };

    this.quadVAO = this._createQuad();
    this.grainTexture = this._createGrainTexture();
    this.framebuffers = {};
    this.lutTextures = { r: null, g: null, b: null };
    this.currentPresetId = null;
  }

  /**
   * Process an ImageData through the full pipeline.
   * @param {ImageData} imageData
   * @param {object} preset
   * @param {object} options — { mode: 'preview'|'export' }
   * @returns {ImageData}
   */
  process(imageData, preset, options = {}) {
    if (this.contextLost) {
      throw new Error('WebGL context lost');
    }

    console.log('[WebGL] process() called, image:', imageData.width, 'x', imageData.height);

    const gl = this.gl;
    const { width, height } = imageData;

    this.canvas.width = width;
    this.canvas.height = height;
    gl.viewport(0, 0, width, height);

    const sourceTexture = this._uploadImageData(imageData);
    this._updateLUTs(preset);
    const skinMaskTexture = options.skinMask ? this._uploadSkinMask(options.skinMask, width, height) : null;

    const fbA = this._getFramebuffer('A', width, height);

    // Pass 1: Main color pass → fbA
    this._renderColorPass(sourceTexture, skinMaskTexture, fbA, preset, width, height, options);

    const clarifyAmount = preset.clarity ?? 0;
    const sharpenAmount = preset.sharpenAmount ?? 0;
    
    let currentOriginal = fbA;
    
    if (Math.abs(clarifyAmount) > 0.005) {
      const qScale = 0.25;
      const qWidth = Math.max(1, Math.round(width * qScale));
      const qHeight = Math.max(1, Math.round(height * qScale));
      const blurRadius = 50 * qScale; 
      
      const fbQ1 = this._getFramebuffer('Q1', qWidth, qHeight);
      const fbQ2 = this._getFramebuffer('Q2', qWidth, qHeight);
      const fbNew = this._getFramebuffer('Clarity', width, height);
      
      // Step to stretch the 9-tap blur across the radius
      const step = blurRadius / 4.0;
      
      this._renderBlurPass(currentOriginal.texture, fbQ1, qWidth, qHeight, true, step);
      this._renderBlurPass(fbQ1.texture, fbQ2, qWidth, qHeight, false, step);
      
      this._renderSharpenPass(currentOriginal.texture, fbQ2.texture, skinMaskTexture, fbNew, clarifyAmount);
      currentOriginal = fbNew;
    }

    if (sharpenAmount > 0.001) {
      const fbB = this._getFramebuffer('B', width, height);
      const fbC = this._getFramebuffer('C', width, height);

      // Pass 2: H-blur currentOriginal → fbB
      this._renderBlurPass(currentOriginal.texture, fbB, width, height, true, 1.0);
      // Pass 3: V-blur fbB → fbC
      this._renderBlurPass(fbB.texture, fbC, width, height, false, 1.0);
      // Pass 4: Sharpen currentOriginal + fbC → screen
      this._renderSharpenPass(currentOriginal.texture, fbC.texture, skinMaskTexture, null, sharpenAmount);
    } else {
      // No sharpen — blit currentOriginal to screen
      this._renderToScreen(currentOriginal.texture);
    }

    const output = this._readPixels(width, height);

    console.log('[WebGL] process() complete, output:', output.width, 'x', output.height);
    console.log('[WebGL] First pixel RGBA:', Array.from(output.data.subarray(0, 4)));

    gl.deleteTexture(sourceTexture);
    if (skinMaskTexture) {
      gl.deleteTexture(skinMaskTexture);
    }

    return output;
  }

  // ==========================================
  // PRIVATE METHODS
  // ==========================================

  _createQuad() {
    const gl = this.gl;

    // Fullscreen quad. Texcoords map so that:
    // - quad bottom-left (clip -1,-1) → UV (0,0) → top-left of source image
    // - quad top-right   (clip  1, 1) → UV (1,1) → bottom-right of source image
    // The GPU renders the image upside-down (WebGL Y=0 is bottom).
    // _readPixels flips rows back to top-down ImageData orientation.
    const vertices = new Float32Array([
      // x,    y,    u,   v
      -1.0, -1.0,  0.0, 0.0,
       1.0, -1.0,  1.0, 0.0,
      -1.0,  1.0,  0.0, 1.0,
       1.0,  1.0,  1.0, 1.0,
    ]);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);
    return vao;
  }

  _createGrainTexture() {
    const gl = this.gl;
    const size = 256;
    const noiseData = generateGrainTexture(size);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, size, size, 0, gl.RED, gl.UNSIGNED_BYTE, noiseData);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return texture;
  }

  _uploadImageData(imageData) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // WebGL reads pixel data from bottom-to-top by default.
    // Flip Y to ensure ImageData's top row maps to the top of the texture.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA8,
      imageData.width, imageData.height, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, imageData.data
    );
    
    // Revert UNPACK_FLIP_Y_WEBGL so it doesn't affect subsequent uploads (like LUTs)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  _uploadSkinMask(maskArray, width, height) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Convert Float32Array (0.0 - 1.0) to Uint8Array (0 - 255) for R8 texture
    // This avoids needing OES_texture_float on older devices.
    const u8 = new Uint8Array(maskArray.length);
    for (let i = 0; i < maskArray.length; i++) {
      u8[i] = Math.round(Math.min(1.0, Math.max(0.0, maskArray[i])) * 255);
    }

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.R8,
      width, height, 0,
      gl.RED, gl.UNSIGNED_BYTE, u8
    );
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  _updateLUTs(preset) {
    if (this.currentPresetId === preset.id) return;

    const gl = this.gl;
    const luts = buildToneCurveLUTs(preset);

    for (const ch of ['r', 'g', 'b']) {
      const lutData = luts[ch] instanceof Uint8Array
        ? luts[ch]
        : new Uint8Array(luts[ch]);

      if (this.lutTextures[ch]) {
        gl.bindTexture(gl.TEXTURE_2D, this.lutTextures[ch]);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RED, gl.UNSIGNED_BYTE, lutData);
      } else {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, lutData);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        this.lutTextures[ch] = texture;
      }
    }

    this.currentPresetId = preset.id;
  }

  _getFramebuffer(name, width, height) {
    const gl = this.gl;

    if (this.framebuffers[name]) {
      const fb = this.framebuffers[name];
      if (fb.width === width && fb.height === height) return fb;
      gl.deleteTexture(fb.texture);
      gl.deleteFramebuffer(fb.fbo);
    }

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.framebuffers[name] = { fbo, texture, width, height };
    return this.framebuffers[name];
  }

  _renderColorPass(sourceTexture, skinMaskTexture, targetFB, preset, width, height, options) {
    const gl = this.gl;
    const program = this.programs.color;
    const u = this.uniforms.color;

    gl.useProgram(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFB.fbo);
    gl.viewport(0, 0, width, height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.uniform1i(u.u_image, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTextures.r);
    gl.uniform1i(u.u_lutR, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTextures.g);
    gl.uniform1i(u.u_lutG, 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTextures.b);
    gl.uniform1i(u.u_lutB, 3);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.grainTexture);
    gl.uniform1i(u.u_grain, 4);

    if (skinMaskTexture) {
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, skinMaskTexture);
      gl.uniform1i(u.u_skinMask, 5);
      gl.uniform1i(u.u_hasSkinMask, 1);
    } else {
      gl.uniform1i(u.u_hasSkinMask, 0);
    }

    gl.uniform1f(u.u_exposure, preset.tonal?.exposure ?? 0.0);
    gl.uniform1f(u.u_highlights, preset.tonal?.highlights ?? 0.0);
    gl.uniform1f(u.u_shadows, preset.tonal?.shadows ?? 0.0);
    gl.uniform1f(u.u_brightness, preset.tonal?.brightness ?? 0.0);
    gl.uniform1f(u.u_contrast, preset.tonal?.contrast ?? 0.0);
    gl.uniform1f(u.u_blackPoint, preset.tonal?.blackPoint ?? 0.0);
    gl.uniform1f(u.u_whitePoint, preset.tonal?.whitePoint ?? 1.0);

    gl.uniform1f(u.u_saturation, preset.saturation ?? 1.0);
    gl.uniform1f(u.u_vibrance, preset.vibrance ?? 0.0);
    gl.uniform1f(u.u_rMult, preset.rMult ?? 1.0);
    gl.uniform1f(u.u_gMult, preset.gMult ?? 1.0);
    gl.uniform1f(u.u_bMult, preset.bMult ?? 1.0);
    gl.uniform1f(u.u_warmth, preset.warmth ?? 0.0);
    gl.uniform1f(u.u_greenShift, preset.greenShift ?? 0.0);
    gl.uniform1f(u.u_vignetteIntensity, preset.vignetteIntensity ?? 0.0);

    const sc = preset.selectiveColor || {};
    const scData = new Float32Array(24);
    const zones = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta'];
    
    let hasSC = false;
    for (let i = 0; i < 8; i++) {
      const adj = sc[zones[i]];
      if (adj) {
        scData[i * 3 + 0] = adj.hueShift || 0;
        scData[i * 3 + 1] = adj.satShift || 0;
        scData[i * 3 + 2] = adj.lumShift || 0;
        if (Math.abs(scData[i*3]) > 0.1 || Math.abs(scData[i*3+1]) > 0.005 || Math.abs(scData[i*3+2]) > 0.005) {
          hasSC = true;
        }
      }
    }
    gl.uniform3fv(u.u_selectiveColor, scData);
    gl.uniform1i(u.u_hasSelectiveColor, hasSC ? 1 : 0);

    let grainIntensity = preset.grainIntensity ?? 0.0;
    let grainSize = preset.grainSize ?? 1.0;

    if (options.mode === 'export' && options.previewWidth) {
      grainSize *= (width / options.previewWidth);
    }

    gl.uniform1f(u.u_grainIntensity, grainIntensity);
    gl.uniform1f(u.u_grainSize, grainSize);
    gl.uniform2f(u.u_grainOffset, Math.random() * 100, Math.random() * 100);
    gl.uniform2f(u.u_resolution, width, height);

    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  _renderBlurPass(sourceTexture, targetFB, width, height, horizontal, radius = 1.0) {
    const gl = this.gl;
    const program = this.programs.blur;
    const u = this.uniforms.blur;

    gl.useProgram(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFB.fbo);
    gl.viewport(0, 0, width, height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.uniform1i(u.u_image, 0);
    gl.uniform2f(u.u_resolution, width, height);
    gl.uniform2f(u.u_direction, horizontal ? radius : 0.0, horizontal ? 0.0 : radius);

    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  _renderSharpenPass(originalTexture, blurredTexture, skinMaskTexture, targetFB, amount) {
    const gl = this.gl;
    const program = this.programs.sharpen;
    const u = this.uniforms.sharpen;

    gl.useProgram(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFB ? targetFB.fbo : null);

    if (targetFB) {
      gl.viewport(0, 0, targetFB.width, targetFB.height);
    } else {
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, originalTexture);
    gl.uniform1i(u.u_original, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, blurredTexture);
    gl.uniform1i(u.u_blurred, 1);

    if (skinMaskTexture) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, skinMaskTexture);
      gl.uniform1i(u.u_skinMask, 2);
      gl.uniform1i(u.u_hasSkinMask, 1);
    } else {
      gl.uniform1i(u.u_hasSkinMask, 0);
    }

    gl.uniform1f(u.u_amount, amount);

    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  _renderToScreen(texture) {
    const gl = this.gl;
    const program = this.programs.passthrough;
    const u = this.uniforms.passthrough;

    gl.useProgram(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(u.u_image, 0);

    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  _readPixels(width, height) {
    const gl = this.gl;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Flip Y in-place: WebGL pixel (0,0) is bottom-left, ImageData (0,0) is top-left
    const rowSize = width * 4;
    const halfHeight = Math.floor(height / 2);
    const tempRow = new Uint8Array(rowSize);

    for (let y = 0; y < halfHeight; y++) {
      const topOffset    = y * rowSize;
      const bottomOffset = (height - 1 - y) * rowSize;
      tempRow.set(pixels.subarray(topOffset, topOffset + rowSize));
      pixels.set(pixels.subarray(bottomOffset, bottomOffset + rowSize), topOffset);
      pixels.set(tempRow, bottomOffset);
    }

    return new ImageData(new Uint8ClampedArray(pixels.buffer), width, height);
  }

  destroy() {
    const gl = this.gl;
    Object.values(this.framebuffers).forEach(fb => {
      gl.deleteTexture(fb.texture);
      gl.deleteFramebuffer(fb.fbo);
    });
    Object.values(this.lutTextures).forEach(t => {
      if (t) gl.deleteTexture(t);
    });
    if (this.grainTexture) gl.deleteTexture(this.grainTexture);
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}
