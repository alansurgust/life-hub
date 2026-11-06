/**
 * Apple iOS 26 Liquid Glass Navigation Engine — WebGL Optical Shader Edition (120fps Mobile & Desktop)
 * Matches the real iOS 26 App Store tab bar video frame-for-frame:
 * - Undistorted 1.075x magnified center + Snell's law meniscus bevel rim (outer ~20px) that curves & stretches icons/labels without folding
 * - 5-ray spectral prism dispersion (Red/Magenta, Yellow/Gold, Active Blue #007AFF, Cyan/Mint, Violet) at the curved bevel
 * - Analytical bar-edge refraction: bends the bar's top & bottom edges into curved meniscus arcs with rainbow caustics inside the overhanging droplet
 * - Crisp water-droplet perimeter meniscus (dark outer refraction hairline + bright specular inner rim + subtle bevel shadow) visible on any background
 * - True capsule cutout (--lg-content-hide) + all underlying DOM tabs forced dark (#1C1C1E) while lifted so split icons are black outside and blue/rainbow inside
 */
(function (global) {
  'use strict';

  // =========================================================================
  // 1. CLOSED-FORM DAMPED HARMONIC SPRINGS
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
    release: springFrom(0.42, 0.52),
    drag: springFrom(0.10, 0.90),
    snap: springFrom(0.36, 0.74),
    lift: springFrom(0.22, 0.80),
    settle: springFrom(0.44, 0.52),
    jelly: springFrom(0.28, 0.26)
  };

  const WOBBLE = springFrom(0.28, 0.22);
  const WOBBLE_REACH = 0.21;

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
        window.triggerHaptic(12);
      } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(10);
      }
    } catch (_) {}
  }

  // =========================================================================
  // 2. UNSCALED 0.0PX-EXACT VECTOR SVG + LABEL RASTERIZER
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
        const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(parseFloat);
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

    // Measure unscaled coordinates so even if bar is mid-swell, glyph positions match 0.0px with DOM buttons
    const barRect = bar.getBoundingClientRect();
    const scaleX = barRect.width > 0 ? barRect.width / barWidth : 1;
    const scaleY = barRect.height > 0 ? barRect.height / barHeight : 1;

    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const svgEl = btn.querySelector('svg');
      const labelEl = btn.querySelector('.lg-nav__label');
      const cx = pad + (i + 0.5) * slot;
      const cy = padY + height / 2;

      if (svgEl) {
        const svgRect = svgEl.getBoundingClientRect();
        const iconW = (svgRect.width / scaleX) || 21;
        const iconH = (svgRect.height / scaleY) || 21;
        const iconX = barRect.width > 0 ? (svgRect.left - barRect.left) / scaleX : (cx - iconW / 2);
        const iconY = barRect.height > 0 ? (svgRect.top - barRect.top) / scaleY : (cy - 18);

        ctx.save();
        ctx.translate(iconX, iconY);
        ctx.scale(iconW / 24, iconH / 24);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2.35;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        drawSvgChildren(ctx, svgEl);
        ctx.restore();
      }

      if (labelEl) {
        const lblRect = labelEl.getBoundingClientRect();
        const cs = getComputedStyle(labelEl);
        const lblY = barRect.height > 0
          ? (lblRect.top - barRect.top + lblRect.height * 0.54) / scaleY
          : (cy + 13);
        ctx.save();
        ctx.font = `700 ${cs.fontSize || '10px'} ${cs.fontFamily || '-apple-system, BlinkMacSystemFont, sans-serif'}`;
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
  // 3. WEBGL LIQUID GLASS WATER-DROPLET SHADER (Exact iOS 26 Video Match)
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

      // Signed distance to the underlying tab bar pill (negative inside bar, 0 at bar border, positive outside)
      float barSDF(vec2 barPos) {
        vec2 halfBar = uBarSize * 0.5;
        vec2 p = barPos - halfBar;
        float r = min(halfBar.x, halfBar.y);
        vec2 q = abs(p) - (halfBar - r);
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
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

        // 1. Anisotropic Snell's law meniscus bevel:
        // - Left/right semicircular caps have a wide 25px bevel that curves & stretches icons and labels into liquid arcs
        // - Top/bottom straight overhang edges have an 11.5px bevel that bends the bar's top/bottom borders (at depth=7px)
        //   into crisp meniscus crescents while keeping the text label (at depth=16px) 100% sharp and unclipped!
        float nx2 = normal.x * normal.x;
        float bevel = mix(11.5, min(radius * 0.72, 25.0), nx2);
        float t = clamp(depth / bevel, 0.0, 1.0);
        float edge = 1.0 - t;

        // Smooth inward sample pull (stretches icons/text outward to the curved rim without folding backwards)
        float bend = bevel * 0.64 * pow(edge, 2.1) * uLift;
        float zoom = 1.0 + 0.07 * uLift;

        vec2 baseRay = uLensCenter + local / zoom - normal * bend;

        // 2. Tight Water-Drop RGB Prism Dispersion (bound tightly to bent glyph strokes, zero floating halo)
        float split = (bend * 0.16 + 1.15 * pow(edge, 2.0)) * uLift;
        float aR = sampleAlpha(baseRay - normal * split * 1.15);
        float aY = sampleAlpha(baseRay - normal * split * 0.55);
        float aG = sampleAlpha(baseRay);
        float aC = sampleAlpha(baseRay + normal * split * 0.55);
        float aB = sampleAlpha(baseRay + normal * split * 1.15);

        float rimWeight = clamp(pow(edge, 0.9) * 1.45, 0.0, 1.0);
        float fringeR = max(0.0, aR - aG * 0.72) * rimWeight;
        float fringeY = max(0.0, aY - aG * 0.62) * rimWeight;
        float fringeC = max(0.0, aC - aG * 0.62) * rimWeight;
        float fringeB = max(0.0, aB - aG * 0.72) * rimWeight;

        // True iOS 26 prism dispersion colors tightly hugging the refracted strokes:
        vec3 colMagenta = vec3(0.96, 0.20, 0.48);
        vec3 colYellow  = vec3(1.00, 0.80, 0.08);
        vec3 colCyan    = vec3(0.00, 0.86, 0.76);
        vec3 colViolet  = vec3(0.32, 0.30, 0.98);

        vec3 coreCol = mix(uActiveColor, vec3(0.04, 0.58, 1.0), clamp(edge * 0.5, 0.0, 1.0));

        vec3 glyphPremul =
          coreCol * aG +
          colYellow * fringeY * 0.90 +
          colMagenta * fringeR * 0.88 +
          colCyan * fringeC * 0.90 +
          colViolet * fringeB * 0.88;

        float totalGlyphA = clamp(
          aG + (fringeY + fringeR + fringeC + fringeB) * 0.68,
          0.0,
          1.0
        );
        glyphPremul = min(glyphPremul, vec3(totalGlyphA));

        // 3. Analytical Bar Top/Bottom Border Meniscus Crescent & Subtle Rainbow Caustic
        // Inside the 7px top/bottom overhang, the bar's top and bottom edges bend into a crisp glass meniscus arc
        float bDistR = barSDF(baseRay - normal * (split * 0.9 + 0.6));
        float bDistG = barSDF(baseRay);
        float bDistB = barSDF(baseRay + normal * (split * 0.9 + 0.6));

        float overhangZone = clamp((1.0 - nx2 * 0.65) * edge, 0.0, 1.0);
        float barLineR = exp(-pow(bDistR / 0.95, 2.0)) * overhangZone * uLift;
        float barLineG = exp(-pow(bDistG / 0.95, 2.0)) * overhangZone * uLift;
        float barLineB = exp(-pow(bDistB / 0.95, 2.0)) * overhangZone * uLift;

        // Subtle glass tint difference between inside-bar and outside-bar overhang crescent
        float outsideBar = smoothstep(-0.8, 0.8, bDistG) * uLift;
        float crescentShade = outsideBar * 0.045;

        vec3 barCausticPremul =
          vec3(0.95, 0.52, 0.22) * max(0.0, barLineR - barLineG * 0.55) * 0.36 +
          vec3(0.10, 0.82, 0.68) * max(0.0, barLineB - barLineG * 0.55) * 0.36 +
          vec3(0.18, 0.20, 0.24) * barLineG * 0.22 +
          vec3(0.12, 0.15, 0.20) * crescentShade;
        float barCausticA = clamp(
          barLineG * 0.22 +
          max(0.0, barLineR - barLineG * 0.55) * 0.32 +
          max(0.0, barLineB - barLineG * 0.55) * 0.32 +
          crescentShade,
          0.0,
          0.55
        );

        // 4. Physical Water-Droplet Meniscus Perimeter (crisp on white, cream, and colorful backdrops)
        float lightDir = abs(dot(normal, normalize(vec2(-0.62, -0.78))));
        float light = 0.30 + 0.70 * pow(lightDir, 2.2);

        // Outer dark refraction hairline right at dist ~ -0.45px
        float outerDarkLine = exp(-pow((depth - 0.45) / 0.52, 2.0)) * 0.26 * uLift;
        // Inner bright white specular highlight ring at depth ~ 1.4px
        float innerSpecLine = exp(-pow((depth - 1.40) / 0.82, 2.0)) * (0.55 + 0.45 * light) * uLift;
        // Soft inner meniscus depth band at depth ~ 3.2px
        float meniscusBand = exp(-pow((depth - 3.2) / 1.6, 2.0)) * 0.08 * uLift;

        // Subtle iridescent tint along the specular rim
        float angle = atan(normal.y, normal.x);
        vec3 specTint = vec3(
          0.95 + 0.05 * cos(angle),
          0.96 + 0.04 * cos(angle - 2.09),
          0.98 + 0.02 * cos(angle + 2.09)
        );

        vec3 rimPremul =
          vec3(0.08, 0.10, 0.14) * outerDarkLine +
          specTint * innerSpecLine +
          vec3(0.14, 0.18, 0.24) * meniscusBand +
          barCausticPremul;

        float rimAlpha = clamp(outerDarkLine + innerSpecLine + meniscusBand + barCausticA, 0.0, 1.0);
        rimPremul = min(rimPremul, vec3(rimAlpha));

        // 5. Composite Glyph over Glass Rim & Meniscus (Premultiplied Alpha)
        float maskAA = 1.0 - smoothstep(-0.55, 0.55, dist);
        vec3 outPremul = (glyphPremul + rimPremul * (1.0 - totalGlyphA)) * maskAA;
        float outAlpha = (totalGlyphA + rimAlpha * (1.0 - totalGlyphA)) * maskAA;

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

    // Vibrant iOS 26 Active Blue (#007AFF -> 0.0, 0.478, 1.0) matching the reference video
    gl.uniform3f(uActiveColor, 0.0, 0.478, 1.0);

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
  // 3B. SURFACE RIM REFRACTION FOR THE BAR GLASS BACKDROP (F120 / F253 / F293)
  // =========================================================================
  const SVG_NS = 'http://www.w3.org/2000/svg';
  let svgDefs = null;

  function canRefractBackdrop() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return /Chrom(e|ium)\/|Edg\//.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  }

  function applyBarSurfaceRefraction(glassEl, width, height) {
    if (!canRefractBackdrop() || width < 20 || height < 20) return;
    const cw = Math.round(width);
    const ch = Math.round(height);
    const radius = ch / 2;
    const bezel = 13;
    const thickness = 18;
    const ior = 1.5;

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(cw, ch);
    const dx = new Float32Array(cw * ch);
    const dy = new Float32Array(cw * ch);
    let maxShift = 0.001;

    const hw = cw / 2;
    const hh = ch / 2;

    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const px = x + 0.5 - hw;
        const py = y + 0.5 - hh;
        const qx = Math.abs(px) - (hw - radius);
        const qy = Math.abs(py) - (hh - radius);
        const ox = Math.max(qx, 0);
        const oy = Math.max(qy, 0);
        const len = Math.hypot(ox, oy);
        const d = radius - (len + Math.min(Math.max(qx, qy), 0));

        if (d <= 0 || d >= bezel) continue;
        const t = Math.max(0.005, d / bezel);
        const q = 1 - t;
        const base = 1 - Math.pow(q, 4);
        const hVal = Math.pow(base, 0.25);
        const slope = Math.pow(q, 3) / Math.max(1e-4, Math.pow(base, 0.75));
        const inc = Math.atan(slope);
        const ref = Math.asin(Math.sin(inc) / ior);
        const shift = -Math.tan(inc - ref) * thickness * (0.35 + 0.65 * hVal);

        let nx = 0;
        let ny = 0;
        if (len > 0) {
          nx = (ox / len) * Math.sign(px);
          ny = (oy / len) * Math.sign(py);
        } else if (qx > qy) {
          nx = Math.sign(px);
        } else {
          ny = Math.sign(py);
        }

        const i = y * cw + x;
        dx[i] = nx * shift;
        dy[i] = ny * shift;
        const m = Math.max(Math.abs(dx[i]), Math.abs(dy[i]));
        if (m > maxShift) maxShift = m;
      }
    }

    for (let i = 0; i < cw * ch; i++) {
      const o = i * 4;
      imgData.data[o] = Math.round(127.5 + (dx[i] / maxShift) * 127.5);
      imgData.data[o + 1] = Math.round(127.5 + (dy[i] / maxShift) * 127.5);
      imgData.data[o + 2] = 128;
      imgData.data[o + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    const mapUrl = canvas.toDataURL();

    if (!svgDefs || !svgDefs.isConnected) {
      const rootSvg = document.createElementNS(SVG_NS, 'svg');
      rootSvg.setAttribute('width', '0');
      rootSvg.setAttribute('height', '0');
      rootSvg.setAttribute('aria-hidden', 'true');
      rootSvg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
      svgDefs = document.createElementNS(SVG_NS, 'defs');
      rootSvg.appendChild(svgDefs);
      document.body.appendChild(rootSvg);
    }

    const filterId = 'lg-bar-surface-refract';
    const old = document.getElementById(filterId);
    if (old) old.remove();

    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('id', filterId);
    filter.setAttribute('x', '-0.1');
    filter.setAttribute('y', '-0.1');
    filter.setAttribute('width', '1.2');
    filter.setAttribute('height', '1.2');
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    const feImg = document.createElementNS(SVG_NS, 'feImage');
    feImg.setAttribute('href', mapUrl);
    feImg.setAttribute('x', '0');
    feImg.setAttribute('y', '0');
    feImg.setAttribute('width', String(cw));
    feImg.setAttribute('height', String(ch));
    feImg.setAttribute('preserveAspectRatio', 'none');
    feImg.setAttribute('result', 'field');

    const feDisp = document.createElementNS(SVG_NS, 'feDisplacementMap');
    feDisp.setAttribute('in', 'SourceGraphic');
    feDisp.setAttribute('in2', 'field');
    feDisp.setAttribute('scale', String((maxShift * 2).toFixed(2)));
    feDisp.setAttribute('xChannelSelector', 'R');
    feDisp.setAttribute('yChannelSelector', 'G');

    filter.appendChild(feImg);
    filter.appendChild(feDisp);
    svgDefs.appendChild(filter);
    glassEl.style.setProperty('--lg-bar-refract', `url(#${filterId})`);
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

    let bloom = glass.querySelector('.lg-glass__bloom');
    if (!bloom) {
      bloom = document.createElement('span');
      bloom.className = 'lg-glass__bloom';
      glass.appendChild(bloom);
    }

    lens.innerHTML = '';
    const glCanvas = document.createElement('canvas');
    glCanvas.className = 'lg-lens__canvas';
    glCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;border-radius:inherit;';
    lens.appendChild(glCanvas);
    const glRenderer = createWebGLLensRenderer(glCanvas);

    const tabs = ['dashboard', 'finance', 'todos', 'habits', 'notebook'];
    const count = tabs.length;
    const overhang = 14;
    const spread = 0.42;
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
        applyBarSurfaceRefraction(glass, cw, ch);
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
      const ky = ((height + (H - height) * liftVal) / H) * (1 - squash * 0.55);
      const growX = 1 + (swellAmount / Math.max(barWidth, 1)) * swell;
      const growY = 1 + 0.015 * swell;

      lens.style.transform = `translate3d(${xVal.toFixed(2)}px, 0, 0) scale(${kx.toFixed(4)}, ${ky.toFixed(4)})`;
      lens.style.opacity = String(clamp(liftVal * 4.2, 0, 1));
      select.style.transform = `translate3d(${xVal.toFixed(2)}px, 0, 0)`;
      select.style.opacity = String(clamp(1 - liftVal * 2.6, 0, 1));
      bar.style.transform = swell > 0.001 ? `scale3d(${growX.toFixed(4)}, ${growY.toFixed(4)}, 1)` : 'none';

      if (liftClamped <= 0.02 && !gesture) {
        clearMasks();
        delete bar.dataset.lifted;
        return;
      }

      bar.dataset.lifted = '';
      const lensCenterX = pad + slot / 2 + xVal;
      const lensCenterY = padY + height / 2;
      const scaledW = W * kx;
      const scaledH = H * ky;

      if (glRenderer) {
        if (!textureReady) refreshTexture();
        glRenderer.render(lensCenterX, lensCenterY, scaledW, scaledH, liftClamped);
      }

      // Cut out the exact capsule footprint on overlapped DOM buttons underneath
      const hy = scaledH / 2;
      const hx = scaledH / 2;
      const run = Math.max(0, (scaledW - scaledH) / 2);
      const lensHalfSpan = run + hx + slot * 0.55;
      const fade = clamp(liftVal * 4.0, 0, 1);
      const solid = `rgb(0 0 0 / ${fade.toFixed(3)})`;

      for (let i = 0; i < count; i++) {
        const btnLeft = pad + i * slot;
        const btnCenterX = btnLeft + slot / 2;
        if (Math.abs(lensCenterX - btnCenterX) <= lensHalfSpan) {
          const ccx = lensCenterX - btnLeft;
          const ccy = height / 2;
          buttons[i].style.setProperty('--lg-content-hide', [
            'linear-gradient(#000, #000)',
            `radial-gradient(ellipse ${hx.toFixed(1)}px ${hy.toFixed(1)}px at ${(ccx - run).toFixed(1)}px ${ccy.toFixed(1)}px, ${solid} calc(100% - 0.8px), transparent 100%)`,
            `radial-gradient(ellipse ${hx.toFixed(1)}px ${hy.toFixed(1)}px at ${(ccx + run).toFixed(1)}px ${ccy.toFixed(1)}px, ${solid} calc(100% - 0.8px), transparent 100%)`,
            `linear-gradient(${solid}, ${solid}) ${(ccx - run - 0.5).toFixed(1)}px ${(ccy - hy).toFixed(1)}px / ${(run * 2 + 1).toFixed(1)}px ${(hy * 2).toFixed(1)}px no-repeat`
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
    }, 0.16, 1350);

    const xSpring = createSpring(0, SPRINGS.snap, (value, velocity) => {
      state.x = value;
      jelly.feed(velocity, WOBBLE_REACH);
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
      jelly.tune(WOBBLE);
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
      if (!gesture.moved && Math.abs(event.clientX - gesture.startX) > 2.5) {
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
        haptic();
      }
    };

    const finish = (event, commit) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const { moved, box, startedAt } = gesture;
      const at = moved ? positionFromClientX(event.clientX) : gesture.anchor;
      const index = clamp(Math.round(at / slot), 0, count - 1);
      gesture = null;
      delete glass.dataset.pressed;
      try {
        if (bar.hasPointerCapture && bar.hasPointerCapture(event.pointerId)) {
          bar.releasePointerCapture(event.pointerId);
        }
      } catch (_) {}

      const inside = event.clientY >= box.top - 44 && event.clientY <= box.bottom + 44;
      const drop = () => {
        liftSpring.tune(SPRINGS.settle);
        liftSpring.set(0);
      };
      // Keep the water droplet inflated for 280ms on quick taps so it glides across tabs as a clear refracting droplet (like F160 -> F164 -> F174)
      const hold = commit && !moved ? Math.max(0, 280 - (performance.now() - startedAt)) : 0;
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

    // Re-rasterize automatically if Lucide icons finish replacing <i data-lucide> after initial mount
    const iconObserver = new MutationObserver(() => {
      if (bar.querySelector('svg')) {
        refreshTexture();
      }
    });
    iconObserver.observe(bar, { childList: true, subtree: true });

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        refreshTexture();
      });
    }

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
      setTimeout(initLiquidGlassNav, 40);
    });
  } else {
    setTimeout(initLiquidGlassNav, 40);
  }
})(window);
