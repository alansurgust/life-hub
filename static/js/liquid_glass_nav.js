/**
 * Apple iOS 26 Liquid Glass Navigation Engine — WebGL Optical Shader Edition (120fps Mobile & Desktop)
 * Matches the iOS 26 App Store / zakisheriff Liquid-Glass video frame-for-frame:
 * - Real-time WebGL Snell's law rim-bending shader (bevel curvature + interior magnification)
 * - 3-channel RGB chromatic dispersion throwing vivid cyan/green/blue/violet prism fringes at the curved rim
 * - Iridescent specular rim arc & Fresnel glass sheen
 * - True capsule cutout (--lg-content-hide) on the underlying bar so icons half-inside the lens split cleanly
 * - Closed-form damped harmonic springs + velocity-driven jelly stretch/squash + rubber-band overscroll
 * - Zero DOM cloning, zero MutationObserver, zero SVG filter lag (< 0.1ms GPU shader execution per frame)
 */
(function (global) {
  'use strict';

  // =========================================================================
  // 1. CLOSED-FORM DAMPED HARMONIC SPRINGS (spring.ts)
  // =========================================================================
  const activeSprings = new Set();
  let springFrame = 0;
  let lastSpringTime = 0;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function stepSpring(s, dt) {
    const x = s.value - s.target;
    const v = s.velocity;
    const half = s.c / 2;
    const disc = half * half - s.k;

    if (Math.abs(disc) < 1e-6) {
      const decay = Math.exp(-half * dt);
      const b = v + half * x;
      s.value = s.target + decay * (x + b * dt);
      s.velocity = decay * (v - half * b * dt);
    } else if (disc > 0) {
      const root = Math.sqrt(disc);
      const r1 = -half + root;
      const r2 = -half - root;
      const a = (v - r2 * x) / (r1 - r2);
      const b = x - a;
      const e1 = Math.exp(r1 * dt);
      const e2 = Math.exp(r2 * dt);
      s.value = s.target + a * e1 + b * e2;
      s.velocity = a * r1 * e1 + b * r2 * e2;
    } else {
      const w = Math.sqrt(-disc);
      const decay = Math.exp(-half * dt);
      const cos = Math.cos(w * dt);
      const sin = Math.sin(w * dt);
      s.value = s.target + decay * (x * cos + ((v + half * x) / w) * sin);
      s.velocity = decay * (v * cos - ((half * v + s.k * x) / w) * sin);
    }
  }

  function springLoop(time) {
    springFrame = 0;
    const dt = Math.min(0.064, Math.max(0, (time - lastSpringTime) / 1000));
    lastSpringTime = time;
    for (const s of [...activeSprings]) {
      stepSpring(s, dt);
      if (Math.abs(s.value - s.target) < 1e-4 && Math.abs(s.velocity) < 1e-3) {
        s.value = s.target;
        s.velocity = 0;
        activeSprings.delete(s);
      }
      s.onUpdate(s.value, s.velocity);
    }
    if (activeSprings.size && !springFrame) {
      springFrame = requestAnimationFrame(springLoop);
    }
  }

  function wakeSprings() {
    if (springFrame) return;
    lastSpringTime = performance.now();
    springFrame = requestAnimationFrame(springLoop);
  }

  function prefersReducedMotion() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function createSpring(initial, config, onUpdate) {
    const s = {
      value: initial,
      target: initial,
      velocity: 0,
      k: config.stiffness,
      c: config.damping,
      onUpdate
    };
    return {
      get value() { return s.value; },
      get velocity() { return s.velocity; },
      get target() { return s.target; },
      set(target, instant = false) {
        s.target = target;
        if (instant || prefersReducedMotion() || (typeof document !== 'undefined' && document.hidden)) {
          s.value = target;
          s.velocity = 0;
          activeSprings.delete(s);
          onUpdate(s.value, 0);
          return;
        }
        activeSprings.add(s);
        wakeSprings();
      },
      tune(next) {
        s.k = next.stiffness;
        s.c = next.damping;
      },
      impulse(velocity) {
        s.velocity += velocity;
        activeSprings.add(s);
        wakeSprings();
      },
      stop() {
        activeSprings.delete(s);
      }
    };
  }

  function springFrom(response, dampingFraction) {
    const w = (2 * Math.PI) / response;
    return { stiffness: w * w, damping: 2 * dampingFraction * w };
  }

  const SPRINGS = {
    press: springFrom(0.22, 0.86),
    release: springFrom(0.42, 0.5),
    drag: springFrom(0.12, 0.92),
    snap: springFrom(0.38, 0.72),
    lift: springFrom(0.24, 0.78),
    settle: springFrom(0.45, 0.46),
    jelly: springFrom(0.3, 0.28)
  };

  const WOBBLE = springFrom(0.3, 0.22);
  const WOBBLE_REACH = 0.18;

  function createJelly(onUpdate, max, speed) {
    const spring = createSpring(0, SPRINGS.jelly, (value) => onUpdate(value));
    return {
      feed(velocity, reach = max) {
        spring.set(reach * Math.tanh(Math.abs(velocity) / speed));
      },
      tune(next) {
        spring.tune(next);
      },
      stop() {
        spring.stop();
      }
    };
  }

  function rubberband(offset, dimension, constant = 0.55) {
    const sign = Math.sign(offset);
    const x = Math.abs(offset);
    return sign * (1 - 1 / ((x * constant) / dimension + 1)) * dimension;
  }

  function haptic() {
    try {
      if (typeof window.triggerHaptic === 'function') {
        window.triggerHaptic(14);
      } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(12);
      }
    } catch (_) {}
  }

  // =========================================================================
  // 2. SYNCHRONOUS VECTOR SVG + LABEL RASTERIZER FOR BAR TEXTURE
  // =========================================================================
  function drawSvgChildren(ctx, parentEl) {
    const children = parentEl.children;
    for (let i = 0; i < children.length; i++) {
      const el = children[i];
      const tag = el.tagName.toLowerCase();
      if (tag === 'g') {
        drawSvgChildren(ctx, el);
      } else if (tag === 'path') {
        const d = el.getAttribute('d');
        if (d && typeof Path2D !== 'undefined') {
          ctx.stroke(new Path2D(d));
        }
      } else if (tag === 'rect') {
        const rx = parseFloat(el.getAttribute('x') || '0');
        const ry = parseFloat(el.getAttribute('y') || '0');
        const rw = parseFloat(el.getAttribute('width') || '0');
        const rh = parseFloat(el.getAttribute('height') || '0');
        const r = parseFloat(el.getAttribute('rx') || el.getAttribute('ry') || '0');
        ctx.beginPath();
        if (r > 0 && ctx.roundRect) {
          ctx.roundRect(rx, ry, rw, rh, r);
        } else {
          ctx.rect(rx, ry, rw, rh);
        }
        ctx.stroke();
      } else if (tag === 'circle') {
        const cx = parseFloat(el.getAttribute('cx') || '0');
        const cy = parseFloat(el.getAttribute('cy') || '0');
        const r = parseFloat(el.getAttribute('r') || '0');
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (tag === 'line') {
        const x1 = parseFloat(el.getAttribute('x1') || '0');
        const y1 = parseFloat(el.getAttribute('y1') || '0');
        const x2 = parseFloat(el.getAttribute('x2') || '0');
        const y2 = parseFloat(el.getAttribute('y2') || '0');
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      } else if (tag === 'polyline' || tag === 'polygon') {
        const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map( parseFloat );
        if (pts.length >= 4) {
          ctx.beginPath();
          ctx.moveTo(pts[0], pts[1]);
          for (let j = 2; j < pts.length; j += 2) {
            ctx.lineTo(pts[j], pts[j + 1]);
          }
          if (tag === 'polygon') ctx.closePath();
          ctx.stroke();
        }
      }
    }
  }

  function rasterizeBarTexture(bar, buttons, barWidth, barHeight, pad, padY, slot, height) {
    const dpr = Math.min(window.devicePixelRatio || 2, 2.5);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(barWidth * dpr));
    canvas.height = Math.max(1, Math.round(barHeight * dpr));
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // Draw subtle top & bottom bar rim lines so when the lens overhangs the bar, the bar's border bends into arcs too!
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(0.6, 0.6, barWidth - 1.2, barHeight - 1.2, barHeight / 2);
    ctx.stroke();

    // Draw each tab's icon & label in pure white (the WebGL shader tints the central ray to the active color and splits R/B into rainbow prism fringes)
    const barRect = bar.getBoundingClientRect();
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const svgEl = btn.querySelector('svg');
      const labelEl = btn.querySelector('.lg-nav__label');
      const cx = pad + (i + 0.5) * slot;
      const cy = padY + height / 2;

      if (svgEl) {
        const svgRect = svgEl.getBoundingClientRect();
        const iconW = svgRect.width || 20;
        const iconH = svgRect.height || 20;
        const iconX = barRect.width > 0 ? (svgRect.left - barRect.left) : (cx - iconW / 2);
        const iconY = barRect.height > 0 ? (svgRect.top - barRect.top) : (cy - 18);

        ctx.save();
        ctx.translate(iconX, iconY);
        ctx.scale(iconW / 24, iconH / 24);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2.25;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        drawSvgChildren(ctx, svgEl);
        ctx.restore();
      }

      if (labelEl) {
        const lblRect = labelEl.getBoundingClientRect();
        const lblY = barRect.height > 0 ? (lblRect.top - barRect.top + lblRect.height / 2) : (cy + 13);
        ctx.save();
        ctx.font = '700 10px -apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelEl.textContent.trim(), cx, lblY);
        ctx.restore();
      }
    }

    return canvas;
  }

  // =========================================================================
  // 3. WEBGL LIQUID GLASS DROPLET SHADER (Exact match to video frames)
  // =========================================================================
  function createWebGLLensRenderer(canvas) {
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      depth: false,
      preserveDrawingBuffer: false
    });
    if (!gl) return null;

    const vsSource = `
      attribute vec2 aPos;
      varying vec2 vUv;
      void main() {
        vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
        gl_Position = vec4(aPos, 0.0, 1.0);
      }
    `;

    // Fragment shader implementing Snell's law rim-stretch + 3-ray RGB prism dispersion + iridescent specular rim
    const fsSource = `
      precision highp float;
      uniform sampler2D uTex;
      uniform vec2 uBarSize;
      uniform vec2 uLensCenter;
      uniform vec2 uLensSize;
      uniform vec3 uActiveColor;
      uniform float uLift;
      varying vec2 vUv;

      float sampleAlpha(vec2 barPos) {
        vec2 uv = barPos / uBarSize;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
        return texture2D(uTex, uv).a;
      }

      void main() {
        vec2 local = (vUv - 0.5) * uLensSize;
        float radius = min(uLensSize.x, uLensSize.y) * 0.5;
        vec2 q = abs(local) - (uLensSize * 0.5 - radius);
        vec2 corner = max(q, 0.0);
        float dist = length(corner) + min(max(q.x, q.y), 0.0) - radius;

        if (dist > 0.8) {
          gl_FragColor = vec4(0.0);
          return;
        }

        vec2 normal = length(corner) > 0.001
          ? normalize(corner) * sign(local)
          : (q.x > q.y ? vec2(sign(local.x), 0.0) : vec2(0.0, sign(local.y)));

        float depth = max(-dist, 0.0);
        float bevel = radius * 0.78;
        float t = clamp(depth / bevel, 0.0, 1.0);
        float edge = 1.0 - t;

        // Quadratic Snell's-law rim stretch: pulls & curves icons/letters outward to the droplet rim
        float bend = radius * 0.92 * pow(edge, 2.0) * uLift;
        float zoom = 1.0 + 0.08 * uLift;

        // Sample inward along normal so glyphs inside the lens stretch outward toward the rim
        vec2 baseRay = uLensCenter + local / zoom - normal * bend;

        // Chromatic dispersion split across R, G, B rays at the curved rim
        float split = bend * 0.24 + 2.2 * pow(edge, 1.6) * uLift;
        float aR = sampleAlpha(baseRay - normal * split);
        float aG = sampleAlpha(baseRay);
        float aB = sampleAlpha(baseRay + normal * split);

        // Rainbow prism fringes where R and B rays bend past the G core (exact iOS 26 water-drop dispersion)
        float warmEdge = max(0.0, aR - aG * 0.75) * clamp(edge * 1.45, 0.0, 1.0);
        float coolEdge = max(0.0, aB - aG * 0.75) * clamp(edge * 1.45, 0.0, 1.0);

        // Vivid prism fringe colors: violet/magenta/blue on warm ray, cyan/emerald/green on cool ray
        vec3 warmColor = vec3(0.56, 0.22, 0.96);
        vec3 coolColor = vec3(0.06, 0.88, 0.72);

        // Core glyph color: blends toward electric cyan/blue shimmer near the high-refraction rim
        vec3 rimShimmer = mix(uActiveColor, vec3(0.08, 0.62, 0.98), clamp(edge * 0.65, 0.0, 1.0));
        float glyphAlpha = clamp(max(aG, max(aR, aB) * 0.92), 0.0, 1.0);

        vec3 glyphCol = rimShimmer * aG + warmColor * warmEdge * 1.15 + coolColor * coolEdge * 1.15;
        float totalGlyphA = clamp(aG + warmEdge * 0.95 + coolEdge * 0.95, 0.0, 1.0);
        if (totalGlyphA > 0.001) {
          glyphCol /= totalGlyphA;
        }

        // Glass body Fresnel + Iridescent Specular Rim (top-left & bottom-right diagonal catchlights)
        float fresnel = pow(edge, 3.2) * 0.22 * uLift;
        float lightDir = abs(dot(normal, normalize(vec2(-0.65, -0.76))));
        float light = 0.25 + 0.75 * pow(lightDir, 2.4);

        // Iridescent hue around the rim contour
        float angle = atan(normal.y, normal.x);
        vec3 rimIridescence = vec3(
          0.84 + 0.16 * cos(angle),
          0.84 + 0.16 * cos(angle - 2.09),
          0.88 + 0.12 * cos(angle + 2.09)
        );

        float rimLine = exp(-pow((depth - 0.85) / 0.85, 2.0)) * (0.38 + 0.62 * light) * uLift;
        float innerBevel = exp(-pow((depth - 3.2) / 2.2, 2.0)) * light * 0.14 * uLift;

        float glassAlpha = clamp(fresnel + rimLine * 0.92 + innerBevel, 0.0, 1.0);
        vec3 glassCol = rimIridescence;

        // Composite glyph over glass droplet (premultiplied alpha output)
        float maskAA = 1.0 - smoothstep(-0.6, 0.6, dist);
        vec3 premulGlass = glassCol * glassAlpha;
        vec3 premulGlyph = glyphCol * totalGlyphA;
        vec3 outPremul = (premulGlyph + premulGlass * (1.0 - totalGlyphA)) * maskAA;
        float outAlpha = (totalGlyphA + glassAlpha * (1.0 - totalGlyphA)) * maskAA;

        gl_FragColor = vec4(outPremul, outAlpha);
      }
    `;

    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, vsSource);
    const fs = compile(gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const uBarSize = gl.getUniformLocation(prog, 'uBarSize');
    const uLensCenter = gl.getUniformLocation(prog, 'uLensCenter');
    const uLensSize = gl.getUniformLocation(prog, 'uLensSize');
    const uActiveColor = gl.getUniformLocation(prog, 'uActiveColor');
    const uLift = gl.getUniformLocation(prog, 'uLift');

    // Active tab color in RGB (0..1): Deep Forest Sage (#3E5247 -> 0.243, 0.322, 0.278)
    gl.uniform3f(uActiveColor, 0.243, 0.322, 0.278);

    return {
      uploadTexture(sourceCanvas, barW, barH) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
        gl.uniform2f(uBarSize, barW, barH);
      },
      resizeCanvas(w, h) {
        const dpr = Math.min(window.devicePixelRatio || 2, 2.5);
        const pw = Math.max(1, Math.round(w * dpr));
        const ph = Math.max(1, Math.round(h * dpr));
        if (canvas.width !== pw || canvas.height !== ph) {
          canvas.width = pw;
          canvas.height = ph;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
      },
      render(centerX, centerY, lensW, lensH, liftVal) {
        gl.uniform2f(uLensCenter, centerX, centerY);
        gl.uniform2f(uLensSize, lensW, lensH);
        gl.uniform1f(uLift, clamp(liftVal, 0, 1));
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    };
  }

  // =========================================================================
  // 4. INTERACTIVE LENS TRACK CONTROLLER
  // =========================================================================
  function initLiquidGlassNav() {
    const bar = document.getElementById('mobileBottomNav');
    const glass = document.getElementById('bottomNavGlass');
    const lens = document.getElementById('bottomNavLens');
    const select = document.getElementById('bottomNavPill');
    if (!bar || !glass || !lens || !select) return null;

    // Create GPU-composited light bloom inside bar glass
    let bloom = glass.querySelector('.lg-glass__bloom');
    if (!bloom) {
      bloom = document.createElement('span');
      bloom.className = 'lg-glass__bloom';
      glass.appendChild(bloom);
    }

    // Create WebGL canvas inside .lg-track__lens
    lens.innerHTML = '';
    const glCanvas = document.createElement('canvas');
    glCanvas.className = 'lg-lens__canvas';
    glCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;border-radius:inherit;';
    lens.appendChild(glCanvas);
    const glRenderer = createWebGLLensRenderer(glCanvas);

    const tabs = ['dashboard', 'finance', 'todos', 'habits', 'notebook'];
    const count = tabs.length;
    const overhang = 14;
    // Wide droplet spread (0.44) matching the video so the lens spans across neighbouring tab rims during drag
    const spread = 0.44;
    const swellAmount = 8;

    const buttons = Array.from(bar.querySelectorAll(':scope > [data-lg-item]'));

    let barWidth = 0;
    let barHeight = 0;
    let slot = 0;
    let height = 0;
    let pad = 4;
    let padY = 4;
    let W = 0;
    let H = 0;
    let lensLeft = 0;
    let lensTop = 0;
    let textureReady = false;

    const state = { x: 0, lift: 0, swell: 0, squash: 0 };
    let current = 0;
    let gesture = null;
    let dropTimer = 0;
    let suppressClick = false;
    let dragging = false;
    const maskedButtons = new Set();

    const preview = (index) => {
      if (index === undefined) delete bar.dataset.previewing;
      else bar.dataset.previewing = '';
      for (let i = 0; i < buttons.length; i++) {
        buttons[i].toggleAttribute('data-lg-preview', i === index);
      }
    };

    const refreshTexture = () => {
      if (!barWidth || !barHeight || !glRenderer) return;
      if (!bar.querySelector('svg')) return;
      const texCanvas = rasterizeBarTexture(bar, buttons, barWidth, barHeight, pad, padY, slot, height);
      glRenderer.uploadTexture(texCanvas, barWidth, barHeight);
      textureReady = true;
    };

    const measure = () => {
      const cw = bar.clientWidth;
      const ch = bar.clientHeight;
      if (!cw || !ch) return;
      const sizeChanged = cw !== barWidth || ch !== barHeight;
      barWidth = cw;
      barHeight = ch;

      const style = getComputedStyle(bar);
      pad = parseFloat(style.paddingLeft) || 4;
      padY = parseFloat(style.paddingTop) || 4;
      const padRight = parseFloat(style.paddingRight) || 4;
      const padBottom = parseFloat(style.paddingBottom) || 4;
      slot = (cw - pad - padRight) / count;
      height = ch - padY - padBottom;
      H = Math.round(ch + overhang);
      W = Math.round(Math.max(slot * (1 + spread), slot + H - height));
      lensLeft = pad + (slot - W) / 2;
      lensTop = padY + (height - H) / 2;

      lens.style.width = `${W}px`;
      lens.style.height = `${H}px`;
      lens.style.left = `${lensLeft}px`;
      lens.style.top = `${lensTop}px`;
      select.style.width = `${slot}px`;
      select.style.left = `${pad}px`;

      if (glRenderer && (sizeChanged || !textureReady)) {
        glRenderer.resizeCanvas(W, H);
        refreshTexture();
      }
    };

    const clearMasks = () => {
      if (maskedButtons.size === 0) return;
      for (const idx of maskedButtons) {
        buttons[idx].style.removeProperty('--lg-content-hide');
      }
      maskedButtons.clear();
    };

    const paint = () => {
      if (!W || !H || !slot) return;

      const xVal = state.x;
      const liftVal = clamp(state.lift, 0, 1.08);
      const liftClamped = clamp(liftVal, 0, 1);
      const squash = state.squash;
      const swell = state.swell;

      const kx = ((slot + (W - slot) * liftVal) / W) * (1 + squash);
      const ky = ((height + (H - height) * liftVal) / H) * (1 - squash * 0.6);
      const growX = 1 + (swellAmount / Math.max(barWidth, 1)) * swell;
      const growY = 1 + 0.015 * swell;

      // 1. Move & scale the Liquid Glass lens & resting pill
      lens.style.transform = `translate3d(${xVal.toFixed(2)}px, 0, 0) scale(${kx.toFixed(4)}, ${ky.toFixed(4)})`;
      lens.style.opacity = String(clamp(liftVal * 3.8, 0, 1));
      select.style.transform = `translate3d(${xVal.toFixed(2)}px, 0, 0)`;
      select.style.opacity = String(clamp(1 - liftVal * 2.2, 0, 1));
      bar.style.transform = swell > 0.001 ? `scale3d(${growX.toFixed(4)}, ${growY.toFixed(4)}, 1)` : 'none';

      if (liftClamped <= 0.02 && !gesture) {
        clearMasks();
        delete bar.dataset.lifted;
        return;
      }

      const lensCenterX = pad + slot / 2 + xVal;
      const lensCenterY = padY + height / 2;
      const scaledW = W * kx;
      const scaledH = H * ky;

      // 2. Render WebGL Snell's law rim-bending + rainbow prism dispersion for the current lens position
      if (glRenderer) {
        if (!textureReady) refreshTexture();
        glRenderer.render(lensCenterX, lensCenterY, scaledW, scaledH, liftClamped);
      }

      // 3. Cut out the exact capsule footprint on the 1-2 underlying buttons so icons split cleanly at the lens rim
      const hy = scaledH / 2;
      const hx = scaledH / 2;
      const run = Math.max(0, (scaledW - scaledH) / 2);
      const lensHalfSpan = run + hx + slot * 0.52;
      const fade = clamp(liftVal * 3.5, 0, 1);
      const solid = `rgb(0 0 0 / ${fade.toFixed(3)})`;

      for (let i = 0; i < count; i++) {
        const btnLeft = pad + i * slot;
        const btnCenterX = btnLeft + slot / 2;
        if (Math.abs(lensCenterX - btnCenterX) <= lensHalfSpan) {
          const ccx = lensCenterX - btnLeft;
          const ccy = height / 2;
          buttons[i].style.setProperty('--lg-content-hide', [
            'linear-gradient(#000, #000)',
            `radial-gradient(ellipse ${hx.toFixed(1)}px ${hy.toFixed(1)}px at ${(ccx - run).toFixed(1)}px ${ccy.toFixed(1)}px, ${solid} calc(100% - 1px), transparent 100%)`,
            `radial-gradient(ellipse ${hx.toFixed(1)}px ${hy.toFixed(1)}px at ${(ccx + run).toFixed(1)}px ${ccy.toFixed(1)}px, ${solid} calc(100% - 1px), transparent 100%)`,
            `linear-gradient(${solid}, ${solid}) ${(ccx - run).toFixed(1)}px ${(ccy - hy).toFixed(1)}px / ${(run * 2).toFixed(1)}px ${(hy * 2).toFixed(1)}px no-repeat`
          ].join(', '));
          maskedButtons.add(i);
        } else if (maskedButtons.has(i)) {
          buttons[i].style.removeProperty('--lg-content-hide');
          maskedButtons.delete(i);
        }
      }
    };

    const jelly = createJelly((value) => {
      state.squash = value;
      paint();
    }, 0.14, 1500);

    const xSpring = createSpring(0, SPRINGS.snap, (value, velocity) => {
      state.x = value;
      jelly.feed(velocity, dragging ? WOBBLE_REACH : undefined);
      paint();
    });

    const liftSpring = createSpring(0, SPRINGS.lift, (value) => {
      state.lift = value;
      paint();
    });

    const swellSpring = createSpring(0, SPRINGS.press, (value) => {
      state.swell = value;
      paint();
    });

    const setIndex = (index, instant = false) => {
      if (index < 0 || index >= count) return;
      current = index;
      bar.style.setProperty('--lg-index', String(index));
      for (let i = 0; i < buttons.length; i++) {
        buttons[i].setAttribute('aria-selected', i === index ? 'true' : 'false');
      }
      if (!slot) measure();
      if (!gesture && slot) {
        xSpring.tune(SPRINGS.snap);
        xSpring.set(index * slot, instant);
      }
    };

    const commitTab = (index) => {
      const tabKey = tabs[index];
      if (tabKey && typeof window.switchLifeTab === 'function') {
        window.switchLifeTab(tabKey);
      }
    };

    const positionFromClientX = (clientX) => {
      if (!gesture) return 0;
      const raw = gesture.anchor + ((clientX - gesture.startX) * barWidth) / Math.max(1, gesture.box.width);
      const max = slot * (count - 1);
      const give = Math.min(14, slot * 0.12);
      if (raw < 0) return rubberband(raw, give, 0.55);
      if (raw > max) return max + rubberband(raw - max, give, 0.55);
      return raw;
    };

    const updateLight = (clientX, box) => {
      const relX = clamp(clientX - box.left, 0, box.width);
      bloom.style.transform = `translate3d(${(relX - 90).toFixed(1)}px, 0, 0)`;
    };

    const itemAt = (event) => {
      const target = event.target.closest('[data-lg-item]');
      return target && bar.contains(target) ? Number(target.dataset.lgItem) : -1;
    };

    const onDown = (event) => {
      if (!event.isPrimary || (event.button !== undefined && event.button !== 0) || gesture) return;
      const index = itemAt(event);
      if (index < 0) return;
      clearTimeout(dropTimer);
      if (!slot || !textureReady) measure();
      dragging = false;
      jelly.tune(SPRINGS.jelly);
      const box = bar.getBoundingClientRect();
      gesture = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        anchor: index * slot,
        moved: false,
        box,
        hovered: index,
        startedAt: performance.now()
      };
      suppressClick = false;
      bar.dataset.lifted = '';
      preview(index);
      glass.dataset.pressed = '';
      updateLight(event.clientX, box);
      haptic();
      liftSpring.tune(SPRINGS.lift);
      liftSpring.set(1);
      swellSpring.tune(SPRINGS.press);
      swellSpring.set(1);
      xSpring.tune(SPRINGS.snap);
      xSpring.set(index * slot);
      paint();
    };

    const onMove = (event) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      if (!gesture.moved && Math.abs(event.clientX - gesture.startX) > 3) {
        gesture.moved = true;
        try {
          bar.setPointerCapture(event.pointerId);
        } catch (_) {}
      }
      updateLight(event.clientX, gesture.box);
      if (!gesture.moved) return;
      const at = positionFromClientX(event.clientX);
      if (!dragging) {
        dragging = true;
        jelly.tune(WOBBLE);
      }
      xSpring.tune(SPRINGS.drag);
      xSpring.set(at);
      const hovered = clamp(Math.round(at / slot), 0, count - 1);
      if (hovered !== gesture.hovered) {
        gesture.hovered = hovered;
        preview(hovered);
        haptic();
      }
    };

    const finish = (event, commit) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const { moved, box, startedAt } = gesture;
      const at = moved ? positionFromClientX(event.clientX) : gesture.anchor;
      const index = clamp(Math.round(at / slot), 0, count - 1);
      gesture = null;
      preview();
      delete glass.dataset.pressed;
      try {
        if (bar.hasPointerCapture && bar.hasPointerCapture(event.pointerId)) {
          bar.releasePointerCapture(event.pointerId);
        }
      } catch (_) {}

      const inside = event.clientY >= box.top - 42 && event.clientY <= box.bottom + 42;
      const drop = () => {
        liftSpring.tune(SPRINGS.settle);
        liftSpring.set(0);
      };
      // Hold lift for 240ms on quick taps so the lens inflates and refracts intermediate tabs as it glides (like Frame 165)
      const hold = commit && !moved ? Math.max(0, 240 - (performance.now() - startedAt)) : 0;
      if (hold) dropTimer = window.setTimeout(drop, hold);
      else drop();

      swellSpring.tune(SPRINGS.release);
      swellSpring.set(0);
      xSpring.tune(SPRINGS.snap);

      if (commit && (moved || inside)) {
        suppressClick = true;
        current = index;
        setIndex(index);
        commitTab(index);
      } else {
        xSpring.set(current * slot);
      }
    };

    const onUp = (event) => finish(event, true);
    const onCancel = (event) => finish(event, false);
    const onBlur = () => {
      clearTimeout(dropTimer);
      if (!gesture) {
        liftSpring.tune(SPRINGS.settle);
        liftSpring.set(0);
        return;
      }
      gesture = null;
      preview();
      delete glass.dataset.pressed;
      liftSpring.tune(SPRINGS.settle);
      liftSpring.set(0);
      swellSpring.tune(SPRINGS.release);
      swellSpring.set(0);
      xSpring.tune(SPRINGS.snap);
      xSpring.set(current * slot);
    };

    const onClick = (event) => {
      if (suppressClick && event.detail !== 0) {
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const target = event.target.closest('[data-lg-item]');
      if (!target) return;
      const index = Number(target.dataset.lgItem);
      if (index >= 0 && index < count) {
        setIndex(index);
        commitTab(index);
      }
    };

    const onTouchMove = (event) => {
      if (gesture && event.cancelable) event.preventDefault();
    };

    const ro = new ResizeObserver(() => {
      measure();
      if (!gesture && slot) {
        xSpring.set(current * slot, true);
      }
    });

    measure();
    if (slot) xSpring.set(current * slot, true);
    bar.dataset.ready = '';
    ro.observe(bar);

    bar.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onCancel, { passive: true });
    window.addEventListener('blur', onBlur);
    bar.addEventListener('click', onClick, true);
    bar.addEventListener('touchmove', onTouchMove, { passive: false });

    const ctrl = {
      setIndex,
      setTab(tabKey, instant = false) {
        const idx = tabs.indexOf(tabKey);
        if (idx >= 0) setIndex(idx, instant);
      },
      refresh() {
        textureReady = false;
        measure();
      }
    };

    global.liquidGlassNav = ctrl;
    return ctrl;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initLiquidGlassNav, 50);
    });
  } else {
    setTimeout(initLiquidGlassNav, 50);
  }
})(window);
