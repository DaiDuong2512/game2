const MAX_GROUND_RINGS = 48;
const WEBGL_CONTEXT_OPTIONS = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    failIfMajorPerformanceCaveat: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
};
const VERTEX_SHADER = `#version 300 es
precision highp float;
out vec2 vUv;

void main() {
  vec2 position = vec2(
    gl_VertexID == 1 ? 3.0 : -1.0,
    gl_VertexID == 2 ? 3.0 : -1.0
  );
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;
const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
uniform vec3 uTheme;
uniform vec3 uAccent;
uniform vec2 uViewport;
uniform vec2 uWorldOrigin;
uniform int uRingCount;
uniform vec4 uRingGeometry[${MAX_GROUND_RINGS}];
uniform vec4 uRingColor[${MAX_GROUND_RINGS}];
uniform float uRingSegments[${MAX_GROUND_RINGS}];
in vec2 vUv;
out vec4 outputColor;

void main() {
  vec2 screen = vec2(vUv.x, 1.0 - vUv.y) * uViewport;
  vec2 world = screen + uWorldOrigin;
  vec3 background = mix(vec3(0.063, 0.094, 0.110), uTheme, 0.28);
  float organicVariation = sin(world.x * 0.0031 + sin(world.y * 0.0023)) * 0.5 + 0.5;
  background = mix(background, uAccent, organicVariation * 0.025);

  for (int index = 0; index < ${MAX_GROUND_RINGS}; index += 1) {
    if (index >= uRingCount) break;
    vec4 geometry = uRingGeometry[index];
    vec4 color = uRingColor[index];
    vec2 delta = world - geometry.xy;
    float edge = abs(length(delta) - geometry.z);
    float ringCoverage = 1.0 - smoothstep(geometry.w, geometry.w + 1.25, edge);
    float angle = atan(delta.y, delta.x) / 6.28318530718 + 0.5;
    float segmentDistance = abs(fract(angle * uRingSegments[index]) - 0.5);
    float dashCoverage = 1.0 - smoothstep(0.12, 0.2, segmentDistance);
    background = mix(background, color.rgb, ringCoverage * dashCoverage * color.a);
  }
  outputColor = vec4(background, 1.0);
}`;
/**
 * Draws the world background with WebGL2 and keeps dynamic gameplay on a
 * transparent Canvas2D overlay. Browser compositing combines both layers, so
 * there is no full-frame CPU-to-GPU texture upload in the render loop.
 */
export class GpuCanvasPresenter {
    context;
    backend;
    displayCanvas;
    drawCanvas;
    gpu;
    cssWidth = 1;
    cssHeight = 1;
    displayPixelRatio = 1;
    themeColor = new Float32Array([0.063, 0.094, 0.11]);
    accentColor = new Float32Array([0.18, 0.7, 0.65]);
    worldOriginX = 0;
    worldOriginY = 0;
    ringCount = 0;
    estimatedCanvasCommandsAvoided = 0;
    ringGeometry = new Float32Array(MAX_GROUND_RINGS * 4);
    ringColor = new Float32Array(MAX_GROUND_RINGS * 4);
    ringSegments = new Float32Array(MAX_GROUND_RINGS);
    constructor(canvas) {
        this.displayCanvas = canvas;
        const gl = canvas.getContext('webgl2', WEBGL_CONTEXT_OPTIONS);
        if (gl) {
            this.drawCanvas = document.createElement('canvas');
            this.drawCanvas.className = 'gameplay-canvas-layer';
            this.drawCanvas.setAttribute('aria-hidden', 'true');
            canvas.insertAdjacentElement('afterend', this.drawCanvas);
            const context = this.drawCanvas.getContext('2d', {
                alpha: true,
                willReadFrequently: false,
            });
            if (!context)
                throw new Error('Không thể khởi tạo lớp dựng gameplay hai chiều.');
            this.context = context;
            this.gpu = this.createGpuPipeline(gl);
            this.backend = 'webgl2-compositor';
            canvas.dataset.renderBackend = this.backend;
            canvas.dataset.renderStatus = 'ready';
            canvas.addEventListener('webglcontextlost', (event) => {
                event.preventDefault();
                canvas.dataset.renderStatus = 'context-lost';
            });
            canvas.addEventListener('webglcontextrestored', () => {
                try {
                    this.gpu = this.createGpuPipeline(gl);
                    this.configureGpuTarget();
                    canvas.dataset.renderStatus = 'ready';
                }
                catch (error) {
                    canvas.dataset.renderStatus = 'restore-failed';
                    console.warn('Không thể khôi phục bộ dựng WebGL2.', error);
                }
            });
        }
        else {
            const context = canvas.getContext('2d', {
                alpha: false,
                willReadFrequently: false,
            });
            if (!context)
                throw new Error('Không thể khởi tạo vùng vẽ hai chiều.');
            this.drawCanvas = canvas;
            this.context = context;
            this.gpu = null;
            this.backend = 'canvas2d';
            canvas.dataset.renderBackend = this.backend;
            canvas.dataset.renderStatus = 'ready';
        }
    }
    resize(width, height, displayPixelRatio) {
        this.cssWidth = Math.max(1, Math.round(width));
        this.cssHeight = Math.max(1, Math.round(height));
        this.displayPixelRatio = Math.max(1, displayPixelRatio);
        this.displayCanvas.dataset.displayPixelRatio = String(this.displayPixelRatio);
        this.displayCanvas.width = Math.round(this.cssWidth * this.displayPixelRatio);
        this.displayCanvas.height = Math.round(this.cssHeight * this.displayPixelRatio);
        this.displayCanvas.style.width = `${this.cssWidth}px`;
        this.displayCanvas.style.height = `${this.cssHeight}px`;
        if (this.gpu) {
            // Dynamic Canvas2D work stays at one game pixel per CSS pixel. The GPU
            // canvas remains sharp at physical DPR and the compositor scales overlay.
            this.drawCanvas.width = this.cssWidth;
            this.drawCanvas.height = this.cssHeight;
            this.drawCanvas.style.width = `${this.cssWidth}px`;
            this.drawCanvas.style.height = `${this.cssHeight}px`;
            this.context.setTransform(1, 0, 0, 1, 0, 0);
            this.displayCanvas.dataset.renderScale = '1';
            this.configureGpuTarget();
        }
        else {
            this.context.setTransform(this.displayPixelRatio, 0, 0, this.displayPixelRatio, 0, 0);
            this.displayCanvas.dataset.renderScale = String(this.displayPixelRatio);
        }
        this.context.imageSmoothingEnabled = false;
    }
    /** Clears the transparent actor/VFX layer and configures the GPU background. */
    beginGpuFrame(theme, accent, worldOriginX, worldOriginY) {
        if (!this.gpu || this.gpu.gl.isContextLost())
            return false;
        this.readHexColor(theme, this.themeColor);
        this.readHexColor(accent, this.accentColor);
        this.worldOriginX = worldOriginX;
        this.worldOriginY = worldOriginY;
        this.ringCount = 0;
        this.estimatedCanvasCommandsAvoided = 0;
        this.context.setTransform(1, 0, 0, 1, 0, 0);
        this.context.globalAlpha = 1;
        this.context.globalCompositeOperation = 'source-over';
        this.context.filter = 'none';
        this.context.clearRect(0, 0, this.cssWidth, this.cssHeight);
        this.context.imageSmoothingEnabled = false;
        return true;
    }
    /** Adds one segmented ground ring to the existing fullscreen WebGL draw batch. */
    addGroundRing(worldX, worldY, radius, thickness, segments, color, alpha) {
        if (!this.gpu || this.gpu.gl.isContextLost() || this.ringCount >= MAX_GROUND_RINGS)
            return false;
        const offset = this.ringCount * 4;
        this.ringGeometry[offset] = worldX;
        this.ringGeometry[offset + 1] = worldY;
        this.ringGeometry[offset + 2] = Math.max(0, radius);
        this.ringGeometry[offset + 3] = Math.max(0.5, thickness * 0.5);
        this.readHexColor(color, this.ringColor, offset);
        this.ringColor[offset + 3] = Math.max(0, Math.min(1, alpha));
        this.ringSegments[this.ringCount] = Math.max(4, segments);
        this.estimatedCanvasCommandsAvoided += Math.max(4, Math.round(segments));
        this.ringCount += 1;
        return true;
    }
    stats() {
        return {
            backend: this.backend,
            groundRings: this.ringCount,
            estimatedCanvasCommandsAvoided: this.estimatedCanvasCommandsAvoided,
            displayPixelRatio: this.displayPixelRatio,
            dynamicRenderScale: this.gpu ? 1 : this.displayPixelRatio,
        };
    }
    present() {
        const gpu = this.gpu;
        if (!gpu || gpu.gl.isContextLost())
            return;
        const { gl } = gpu;
        gl.useProgram(gpu.program);
        gl.bindVertexArray(gpu.vertexArray);
        gl.uniform3fv(gpu.themeUniform, this.themeColor);
        gl.uniform3fv(gpu.accentUniform, this.accentColor);
        gl.uniform2f(gpu.viewportUniform, this.cssWidth, this.cssHeight);
        gl.uniform2f(gpu.worldOriginUniform, this.worldOriginX, this.worldOriginY);
        gl.uniform1i(gpu.ringCountUniform, this.ringCount);
        if (this.ringCount > 0) {
            gl.uniform4fv(gpu.ringGeometryUniform, this.ringGeometry);
            gl.uniform4fv(gpu.ringColorUniform, this.ringColor);
            gl.uniform1fv(gpu.ringSegmentsUniform, this.ringSegments);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    createGpuPipeline(gl) {
        const vertexShader = this.compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
        const fragmentShader = this.compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
        const program = gl.createProgram();
        if (!program)
            throw new Error('Không thể tạo chương trình WebGL2.');
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(`Không thể liên kết chương trình WebGL2: ${gl.getProgramInfoLog(program) ?? 'không rõ lỗi'}`);
        }
        const vertexArray = gl.createVertexArray();
        if (!vertexArray)
            throw new Error('Không thể tạo tài nguyên WebGL2.');
        gl.useProgram(program);
        gl.bindVertexArray(vertexArray);
        const themeUniform = this.requireUniform(gl, program, 'uTheme');
        const accentUniform = this.requireUniform(gl, program, 'uAccent');
        const viewportUniform = this.requireUniform(gl, program, 'uViewport');
        const worldOriginUniform = this.requireUniform(gl, program, 'uWorldOrigin');
        const ringCountUniform = this.requireUniform(gl, program, 'uRingCount');
        const ringGeometryUniform = this.requireUniform(gl, program, 'uRingGeometry[0]');
        const ringColorUniform = this.requireUniform(gl, program, 'uRingColor[0]');
        const ringSegmentsUniform = this.requireUniform(gl, program, 'uRingSegments[0]');
        gl.disable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        return {
            gl,
            program,
            vertexArray,
            themeUniform,
            accentUniform,
            viewportUniform,
            worldOriginUniform,
            ringCountUniform,
            ringGeometryUniform,
            ringColorUniform,
            ringSegmentsUniform,
        };
    }
    configureGpuTarget() {
        const gpu = this.gpu;
        if (!gpu || gpu.gl.isContextLost())
            return;
        gpu.gl.viewport(0, 0, this.displayCanvas.width, this.displayCanvas.height);
    }
    requireUniform(gl, program, name) {
        const uniform = gl.getUniformLocation(program, name);
        if (!uniform)
            throw new Error(`Không tìm thấy uniform WebGL2 ${name}.`);
        return uniform;
    }
    readHexColor(hex, target, offset = 0) {
        const clean = hex.replace('#', '');
        const normalized = clean.length === 3 ? clean.split('').map((part) => `${part}${part}`).join('') : clean;
        const value = Number.parseInt(normalized, 16);
        if (!Number.isFinite(value))
            return;
        target[offset] = ((value >> 16) & 255) / 255;
        target[offset + 1] = ((value >> 8) & 255) / 255;
        target[offset + 2] = (value & 255) / 255;
    }
    compileShader(gl, type, source) {
        const shader = gl.createShader(type);
        if (!shader)
            throw new Error('Không thể tạo shader WebGL2.');
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(shader) ?? 'không rõ lỗi';
            gl.deleteShader(shader);
            throw new Error(`Không thể biên dịch shader WebGL2: ${error}`);
        }
        return shader;
    }
}
//# sourceMappingURL=GpuCanvasPresenter.js.map