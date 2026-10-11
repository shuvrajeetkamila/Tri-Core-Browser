(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const frameLabel = document.getElementById('frame-count');
  const rendererStatus = document.getElementById('renderer-status');
  const errorPanel = document.getElementById('scene-error');
  let gl = null;
  let frameNumber = 0;
  let animationHandle = 0;
  let startTime = 0;
  let lastHudUpdate = 0;

  const vertexSource = `#version 300 es
    precision highp float;
    in vec2 a_position;
    out vec2 v_uv;
    void main() {
      v_uv = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentSource = `#version 300 es
    precision highp float;
    in vec2 v_uv;
    uniform float u_time;
    uniform vec2 u_resolution;
    out vec4 outColor;

    float lineGrid(vec2 p, float scale, float width) {
      vec2 cell = abs(fract(p * scale) - 0.5);
      vec2 edge = fwidth(p * scale) * width;
      return 1.0 - min(min(smoothstep(0.0, edge.x, cell.x), smoothstep(0.0, edge.y, cell.y)), 1.0);
    }

    void main() {
      vec2 uv = v_uv;
      vec2 p = (uv - 0.5) * vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
      float horizon = 1.0 - smoothstep(-0.12, 0.42, p.y + 0.08 * sin(p.x * 2.5 + u_time * 0.35));
      vec3 sky = mix(vec3(0.035, 0.075, 0.19), vec3(0.30, 0.085, 0.28), uv.y);
      vec3 ground = vec3(0.025, 0.17, 0.24);
      vec3 color = mix(sky, ground, horizon * 0.43);

      float grid = lineGrid(vec2(p.x + u_time * 0.07, p.y + u_time * 0.18), 22.0, 0.045);
      color += vec3(0.045, 0.20, 0.27) * grid * (1.0 - smoothstep(-0.40, 0.04, p.y));

      float stars = step(0.987, fract(sin(dot(floor(uv * vec2(87.0, 58.0)), vec2(12.9898, 78.233))) * 43758.5453));
      float twinkle = 0.35 + 0.65 * abs(sin(u_time * 1.7 + uv.x * 41.0));
      color += vec3(0.46, 0.73, 1.0) * stars * twinkle * smoothstep(0.06, 0.32, uv.y);

      vec2 shipCenter = vec2(0.18 * sin(u_time * 0.73), -0.05 + 0.07 * cos(u_time * 0.51));
      vec2 ship = p - shipCenter;
      float angle = 0.10 * sin(u_time * 0.87);
      ship = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * ship;
      float triangleEdge = max(abs(ship.x) * 0.9 + ship.y * 0.58, -ship.y) - 0.035;
      float shipMask = 1.0 - smoothstep(0.0, 0.006, triangleEdge);
      float cockpit = 1.0 - smoothstep(0.012, 0.022, length(ship - vec2(0.0, 0.006)));
      color = mix(color, vec3(0.18, 0.84, 0.97), shipMask);
      color = mix(color, vec3(0.93, 0.99, 1.0), cockpit * shipMask);

      vec2 pulseCenter = vec2(-0.31, 0.15);
      float pulseRadius = 0.055 + 0.017 * sin(u_time * 2.2);
      float pulseRing = 1.0 - smoothstep(0.008, 0.016, abs(length(p - pulseCenter) - pulseRadius));
      color += vec3(0.94, 0.34, 0.18) * pulseRing;

      float vignette = 1.0 - 0.34 * dot(uv - 0.5, uv - 0.5);
      color *= vignette;
      outColor = vec4(color, 1.0);
    }
  `;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || 'Unknown WebGL shader compilation error.';
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function showFailure(message) {
    rendererStatus.textContent = 'WebGL2 unavailable';
    errorPanel.hidden = false;
    errorPanel.textContent = `The controlled test scene could not initialize WebGL2: ${message}`;
    document.documentElement.dataset.fsrScene = 'failed';
  }

  function resize() {
    if (!gl) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  function draw(timestamp) {
    if (!gl || document.hidden) {
      animationHandle = requestAnimationFrame(draw);
      return;
    }
    if (!startTime) startTime = timestamp;
    frameNumber += 1;
    const elapsedSeconds = (timestamp - startTime) / 1000;
    resize();
    gl.useProgram(draw.program);
    gl.uniform1f(draw.timeLocation, elapsedSeconds);
    gl.uniform2f(draw.resolutionLocation, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (timestamp - lastHudUpdate > 120) {
      frameLabel.textContent = String(frameNumber).padStart(6, '0');
      lastHudUpdate = timestamp;
    }
    animationHandle = requestAnimationFrame(draw);
  }

  try {
    gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('This Chromium runtime did not provide a WebGL2 context.');
    const program = gl.createProgram();
    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'WebGL program link failed.');
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.useProgram(program);
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    draw.program = program;
    draw.timeLocation = gl.getUniformLocation(program, 'u_time');
    draw.resolutionLocation = gl.getUniformLocation(program, 'u_resolution');

    rendererStatus.textContent = 'WebGL2 · animated';
    document.documentElement.dataset.fsrScene = 'ready';
    document.documentElement.dataset.webglRenderer = gl.getParameter(gl.RENDERER) || 'unknown';
    window.addEventListener('resize', resize, { passive: true });
    animationHandle = requestAnimationFrame(draw);
    window.triCoreFsrTest = Object.freeze({
      getSnapshot() {
        return {
          ok: Boolean(gl && !gl.isContextLost()),
          renderer: 'webgl2',
          backend: gl && gl.getParameter(gl.RENDERER) || 'unknown',
          version: gl && gl.getParameter(gl.VERSION) || 'unknown',
          frameNumber,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          devicePixelRatio: window.devicePixelRatio || 1,
          scene: 'orbital-runner-webgl2-v1',
        };
      },
    });
  } catch (error) {
    if (animationHandle) cancelAnimationFrame(animationHandle);
    showFailure(String(error && error.message || error));
  }
})();
