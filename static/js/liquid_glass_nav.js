/**
 * Apple iOS 26 Liquid Glass Navigation Engine (Vanilla JS port of zakisheriff/Liquid-Glass)
 * Source: https://github.com/zakisheriff/Liquid-Glass
 *
 * Includes:
 * 1. Closed-form analytical damped harmonic springs & speed-driven jelly stretch (spring.ts)
 * 2. Snell's law ray-traced squircle bevel refraction, chromatic dispersion & specular rim (refraction.ts)
 * 3. Live magnified & rim-bent mirror backdrop for cross-browser iOS Safari + Chromium support (mirror.ts)
 * 4. Interactive draggable & scrubbable liquid lens track with rubber-band overscroll (lensTrack.ts)
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
    snap: springFrom(0.36, 0.72),
    lift: springFrom(0.26, 0.78),
    settle: springFrom(0.45, 0.46),
    fade: springFrom(0.3, 1),
    jelly: springFrom(0.3, 0.3)
  };

  const FOLLOW = springFrom(0.2, 0.82);
  const WOBBLE = springFrom(0.3, 0.24);
  const WOBBLE_REACH = 0.17;

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
        window.triggerHaptic(18);
      } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(15);
      }
    } catch (_) {}
  }

  // =========================================================================
  // 2. SNELL'S LAW REFRACTION & SPECULAR RIM ENGINE (refraction.ts)
  // =========================================================================
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const bakeCache = new Map();
  let svgDefs = null;
  let filterCounter = 0;

  function createSvgEl(name, attrs) {
    const node = document.createElementNS(SVG_NS, name);
    for (const key in attrs) {
      node.setAttribute(key, String(attrs[key]));
    }
    return node;
  }

  function ensureSvgDefs() {
    if (svgDefs && svgDefs.isConnected) return svgDefs;
    const root = createSvgEl('svg', { width: 0, height: 0, 'aria-hidden': 'true', 'data-liquid-glass-defs': '' });
    root.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    svgDefs = createSvgEl('defs', {});
    root.appendChild(svgDefs);
    document.body.appendChild(root);
    return svgDefs;
  }

  function canRefractBackdrop() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent;
    return /Chrom(e|ium)\/|Edg\//.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  }

  function bevelProfile(bezel, thickness, ior) {
    const N = 256;
    const out = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const t = Math.max(0.002, i / (N - 1));
      const q = 1 - t;
      const base = 1 - Math.pow(q, 4);
      const height = Math.pow(base, 0.25);
      const slope = Math.pow(q, 3) / Math.max(1e-4, Math.pow(base, 0.75));
      const incident = Math.atan(slope);
      const refracted = Math.asin(Math.sin(incident) / ior);
      out[i] = Math.tan(incident - refracted) * thickness * (0.35 + 0.65 * height);
    }
    return (distance) => {
      if (distance < 0 || distance >= bezel) return 0;
      const f = (distance / bezel) * (N - 1);
      const i = Math.floor(f);
      const a = out[i];
      const b = out[Math.min(i + 1, N - 1)];
      return a + (b - a) * (f - i);
    };
  }

  function resolveShape(shape, width, height) {
    const kind = shape.kind || 'surface';
    const short = Math.min(width, height);
    const lens = kind === 'lens';
    return {
      kind,
      bezel: shape.bezel ?? (lens ? short * 0.32 : clamp(short * 0.2, 5, 16)),
      thickness: shape.thickness ?? (lens ? short * 0.55 : clamp(short * 0.32, 8, 26)),
      ior: shape.ior ?? 1.5,
      zoom: shape.zoom ?? (lens ? 1.16 : 1),
      zoomX: shape.zoomX ?? shape.zoom ?? (lens ? 1.16 : 1),
      dispersion: shape.dispersion ?? (lens ? 1 : 0),
      strength: shape.strength ?? 1,
      inset: shape.inset ?? 0,
      stretch: shape.stretch ?? 0,
      copy: shape.copy ?? false,
      copyOnly: shape.copyOnly ?? false
    };
  }

  function bakeGlass(width, height, radius, shape, pad = 0, simple = false, fringe = false, box = false) {
    const W = width + pad * 2;
    const H = height + pad * 2;
    let density = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2);
    while (W * H * density * density > 400000 && density > 0.35) density *= 0.75;
    const cw = Math.max(1, Math.ceil(W * density));
    const ch = Math.max(1, Math.ceil(H * density));

    const lens = shape.kind === 'lens';
    const shift = bevelProfile(shape.bezel, shape.thickness, shape.ior);
    const magnify = lens ? 1 - 1 / Math.max(0.5, shape.zoom) : 0;
    const direction = lens ? 1 : -1;

    const dx = new Float32Array(cw * ch);
    const dy = new Float32Array(cw * ch);
    const rimA = new Float32Array(cw * ch);
    const rimHue = new Float32Array(cw * ch);
    const inside = new Float32Array(cw * ch);
    const zone = new Float32Array(cw * ch);
    let max = 0.0001;
    let maxX = 0.0001;
    let maxY = 0.0001;

    const hw = width / 2;
    const hh = height / 2;
    const px1 = 1 / density;
    const edge = hh - shape.inset;
    const band = (py) => {
      if (!shape.inset) return 1;
      const t = clamp((Math.abs(py) - (edge - 2)) / 3, 0, 1);
      return 1 - t * t * (3 - 2 * t);
    };

    const flat = simple && magnify ? Infinity : Math.max(shape.bezel * 1.7, 5);

    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const px = ((x + 0.5) * W) / cw - W / 2;
        const py = ((y + 0.5) * H) / ch - H / 2;

        const qx = Math.abs(px) - (hw - radius);
        const qy = Math.abs(py) - (hh - radius);
        const ox = Math.max(qx, 0);
        const oy = Math.max(qy, 0);
        const len = Math.hypot(ox, oy);
        const d = radius - (len + Math.min(Math.max(qx, qy), 0));
        if (d > flat) {
          inside[y * cw + x] = 1;
          continue;
        }

        let nx, ny;
        if (len > 0) {
          nx = (ox / len) * Math.sign(px);
          ny = (oy / len) * Math.sign(py);
        } else if (qx > qy) {
          nx = Math.sign(px);
          ny = 0;
        } else {
          nx = 0;
          ny = Math.sign(py);
        }

        const i = y * cw + x;
        const u = d / shape.bezel;
        const s = (lens && shape.stretch > 0
          ? d >= 0 && u < 1
            ? -shape.bezel * shape.stretch * 0.5 * Math.pow(1 - u, 2)
            : 0
          : shift(d) * direction) * shape.strength * band(py);

        let vx = nx * s;
        let vy = ny * s;
        if (simple && magnify) {
          vx -= px * magnify * band(py);
          vy -= py * magnify * band(py);
        }
        dx[i] = vx;
        dy[i] = vy;
        const m = Math.max(Math.abs(vx), Math.abs(vy));
        if (m > max) max = m;
        if (Math.abs(vx) > maxX) maxX = Math.abs(vx);
        if (Math.abs(vy) > maxY) maxY = Math.abs(vy);

        inside[i] = clamp(d / px1 + 0.5, 0, 1);
        zone[i] = (d <= 0 ? 1 : Math.pow(clamp(1 - d / Math.max(1, shape.bezel), 0, 1), 1.3)) * band(py);

        if (d >= -px1) {
          const facing = -(nx + ny) * Math.SQRT1_2;
          const light = 0.22 + 0.78 * Math.pow(Math.abs(facing), 2.2) * (facing > 0 ? 1 : 0.62);
          const line = Math.exp(-Math.pow((d - 0.55) / 0.55, 2));
          const inner = Math.exp(-Math.pow(d / (shape.bezel * 0.55), 2)) * 0.14;
          const edgeAA = clamp(d / px1 + 1, 0, 1);
          rimA[i] = clamp((line * (lens ? 0.95 : 0.7) + inner) * light * edgeAA, 0, 1);
          rimHue[i] = Math.atan2(ny, nx);
        }
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');

    const scale = box ? 2 * Math.max(maxX / W, maxY / H) : max * 2;
    const spanX = box ? (scale * W) / 2 : max;
    const spanY = box ? (scale * H) / 2 : max;
    const field = ctx.createImageData(cw, ch);
    for (let i = 0; i < cw * ch; i++) {
      const o = i * 4;
      field.data[o] = Math.round(127.5 + (dx[i] / spanX) * 127.5);
      field.data[o + 1] = Math.round(127.5 + (dy[i] / spanY) * 127.5);
      field.data[o + 2] = 128;
      field.data[o + 3] = 255;
    }
    ctx.putImageData(field, 0, 0);
    const map = canvas.toDataURL();

    const reach = Math.max(W, H) / 2;
    let zoomMap = '';
    if (magnify && !simple) {
      const ramp = ctx.createImageData(cw, ch);
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const o = (y * cw + x) * 4;
          const px = ((x + 0.5) * W) / cw - W / 2;
          const py = ((y + 0.5) * H) / ch - H / 2;
          const k = band(py);
          ramp.data[o] = Math.round(127.5 - (px / (box ? W / 2 : reach)) * 127.5 * k);
          ramp.data[o + 1] = Math.round(127.5 - (py / (box ? H / 2 : reach)) * 127.5 * k);
          ramp.data[o + 2] = 128;
          ramp.data[o + 3] = 255;
        }
      }
      ctx.putImageData(ramp, 0, 0);
      zoomMap = canvas.toDataURL();
    }

    const shine = ctx.createImageData(cw, ch);
    for (let i = 0; i < cw * ch; i++) {
      const o = i * 4;
      let r = 255, g = 255, b = 255;
      if (lens && shape.dispersion > 0) {
        const h = rimHue[i];
        const k = 0.14 * shape.dispersion;
        r = 255 * (1 - k + k * (0.5 + 0.5 * Math.cos(h)));
        g = 255 * (1 - k + k * (0.5 + 0.5 * Math.cos(h - 2.1)));
        b = 255 * (1 - k + k * (0.5 + 0.5 * Math.cos(h + 2.1)));
      }
      shine.data[o] = r;
      shine.data[o + 1] = g;
      shine.data[o + 2] = b;
      shine.data[o + 3] = Math.round(rimA[i] * 255);
    }
    ctx.putImageData(shine, 0, 0);
    const rim = canvas.toDataURL();

    const shapeMask = ctx.createImageData(cw, ch);
    for (let i = 0; i < cw * ch; i++) {
      const o = i * 4;
      shapeMask.data[o] = shapeMask.data[o + 1] = shapeMask.data[o + 2] = 255;
      shapeMask.data[o + 3] = Math.round(inside[i] * 255);
    }
    ctx.putImageData(shapeMask, 0, 0);
    const mask = canvas.toDataURL();

    let smooth = '';
    if (lens && !simple) {
      const soft = ctx.createImageData(cw, ch);
      for (let i = 0; i < cw * ch; i++) {
        const o = i * 4;
        soft.data[o] = soft.data[o + 1] = soft.data[o + 2] = 255;
        soft.data[o + 3] = Math.round(zone[i] * 255);
      }
      ctx.putImageData(soft, 0, 0);
      smooth = canvas.toDataURL();
    }

    const id = `lg-refract-${++filterCounter}`;
    const area = box ? { x: 0, y: 0, width: 1, height: 1 } : { x: 0, y: 0, width: W, height: H };
    const filter = createSvgEl(
      'filter',
      box
        ? { id, filterUnits: 'objectBoundingBox', primitiveUnits: 'objectBoundingBox', x: 0, y: 0, width: 1, height: 1, 'color-interpolation-filters': 'sRGB' }
        : { id, x: -0.25, y: -0.25, width: 1.5, height: 1.5, 'color-interpolation-filters': 'sRGB' }
    );
    filter.appendChild(createSvgEl('feImage', { href: map, ...area, preserveAspectRatio: 'none', result: 'field' }));
    let source = 'SourceGraphic';
    if (zoomMap) {
      filter.appendChild(createSvgEl('feImage', { href: zoomMap, ...area, preserveAspectRatio: 'none', result: 'zoom' }));
      filter.appendChild(createSvgEl('feDisplacementMap', {
        in: 'SourceGraphic',
        in2: 'zoom',
        scale: box ? magnify : 2 * reach * magnify,
        xChannelSelector: 'R',
        yChannelSelector: 'G',
        result: 'magnified'
      }));
      source = 'magnified';
    }

    if (shape.dispersion > 0 && !simple && fringe) {
      const spread = (shape.stretch > 0 ? 0.12 : 0.3) * shape.dispersion;
      for (const [name, factor] of [['r', 1 + spread], ['g', 1], ['b', 1 - spread]]) {
        filter.appendChild(createSvgEl('feDisplacementMap', {
          in: source,
          in2: 'field',
          scale: scale * factor,
          xChannelSelector: 'R',
          yChannelSelector: 'G',
          result: `${name}-ray`
        }));
      }
      filter.appendChild(createSvgEl('feComposite', { in: 'r-ray', in2: 'g-ray', operator: 'out', result: 'r-edge' }));
      filter.appendChild(createSvgEl('feColorMatrix', { in: 'r-edge', type: 'matrix', values: '0.2 0 0 0 0.82  0 0.2 0 0 0.36  0 0 0.2 0 0.05  0 0 0 1 0', result: 'warm' }));
      filter.appendChild(createSvgEl('feComposite', { in: 'b-ray', in2: 'g-ray', operator: 'out', result: 'b-edge' }));
      filter.appendChild(createSvgEl('feColorMatrix', { in: 'b-edge', type: 'matrix', values: '0.2 0 0 0 0.24  0 0.2 0 0 0.48  0 0 0.2 0 0.42  0 0 0 1 0', result: 'cool' }));
      const merge = createSvgEl('feMerge', { result: 'bent' });
      for (const name of ['warm', 'cool', 'g-ray']) {
        merge.appendChild(createSvgEl('feMergeNode', { in: name }));
      }
      filter.appendChild(merge);
    } else if (shape.dispersion > 0 && !simple) {
      const spread = 0.16 * shape.dispersion;
      const channels = [
        ['r', 1 + spread, '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'],
        ['g', 1, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'],
        ['b', 1 - spread, '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0']
      ];
      for (const [name, factor, matrix] of channels) {
        filter.appendChild(createSvgEl('feDisplacementMap', {
          in: source,
          in2: 'field',
          scale: scale * factor,
          xChannelSelector: 'R',
          yChannelSelector: 'G',
          result: `${name}-ray`
        }));
        filter.appendChild(createSvgEl('feColorMatrix', { in: `${name}-ray`, type: 'matrix', values: matrix, result: name }));
      }
      filter.appendChild(createSvgEl('feComposite', { in: 'r', in2: 'g', operator: 'arithmetic', k2: 1, k3: 1, result: 'rg' }));
      filter.appendChild(createSvgEl('feComposite', { in: 'rg', in2: 'b', operator: 'arithmetic', k2: 1, k3: 1, result: 'bent' }));
    } else {
      filter.appendChild(createSvgEl('feDisplacementMap', {
        in: source,
        in2: 'field',
        scale,
        xChannelSelector: 'R',
        yChannelSelector: 'G',
        result: 'bent'
      }));
    }

    let out = 'bent';
    const soften = shape.stretch > 0 ? 1.1 : 0.65;
    if (smooth) {
      filter.appendChild(createSvgEl('feGaussianBlur', { in: 'bent', stdDeviation: box ? `${soften / W} ${soften / H}` : soften, result: 'bent-soft' }));
      filter.appendChild(createSvgEl('feImage', { href: smooth, ...area, preserveAspectRatio: 'none', result: 'rim-zone' }));
      filter.appendChild(createSvgEl('feComposite', { in: 'bent-soft', in2: 'rim-zone', operator: 'in', result: 'rim-soft' }));
      filter.appendChild(createSvgEl('feComposite', { in: 'bent', in2: 'rim-zone', operator: 'out', result: 'core' }));
      filter.appendChild(createSvgEl('feComposite', { in: 'rim-soft', in2: 'core', operator: 'arithmetic', k2: 1, k3: 1, result: 'smoothed' }));
      out = 'smoothed';
    }
    filter.appendChild(createSvgEl('feImage', { href: mask, ...area, preserveAspectRatio: 'none', result: 'shape' }));
    filter.appendChild(createSvgEl('feComposite', { in: out, in2: 'shape', operator: 'in' }));

    ensureSvgDefs().appendChild(filter);
    return { filter: `url(#${id})`, rim: `url("${rim}")`, inner: `url("${mask}")` };
  }

  function glassFor(width, height, radius, shape = {}, pad = 0, simple = false, fringe = false, box = false) {
    const w = Math.round(width);
    const h = Math.round(height);
    const r = Math.min(w / 2, h / 2, Math.max(0, radius));
    const full = resolveShape(shape, w, h);
    const key = [w, h, Math.round(r * 2) / 2, full.kind, full.bezel.toFixed(1), full.thickness.toFixed(1), full.ior, full.zoom, full.dispersion, full.strength, full.inset, full.stretch, pad, simple, fringe, box].join('|');
    let baked = bakeCache.get(key);
    if (!baked) {
      baked = bakeGlass(w, h, r, full, pad, simple, fringe, box);
      bakeCache.set(key, baked);
    }
    return baked;
  }

  function cornerRadius(element, width, height) {
    const value = getComputedStyle(element).borderTopLeftRadius;
    const n = parseFloat(value);
    if (!Number.isFinite(n)) return Math.min(width, height) / 2;
    return value.endsWith('%') ? (Math.min(width, height) * n) / 100 : n;
  }

  // =========================================================================
  // 3. LIVE MAGNIFIED MIRROR BACKDROP FOR LENS (mirror.ts)
  // =========================================================================
  const SELF_ATTR = 'data-lg-mirror-self';
  const PLACEMENT_PROPS = new Set([
    'position', 'left', 'top', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
    'scale', 'translate', 'transform-origin', 'transform'
  ]);

  function cloneSource(source) {
    const root = source.cloneNode(true);
    const originals = [source, ...Array.from(source.querySelectorAll('*'))];
    const copies = [root, ...Array.from(root.querySelectorAll('*'))];
    const pairs = [];
    originals.forEach((original, i) => {
      const copy = copies[i];
      if (!copy) return;
      copy.removeAttribute('id');
      copy.removeAttribute('tabindex');
      copy.removeAttribute('onclick');
      pairs.push({
        original,
        copy,
        css: original.style ? original.style.cssText : '',
        cls: original.className ? original.className.toString() : ''
      });
    });
    root.querySelectorAll(`[${SELF_ATTR}], .lg-mirror, [data-lg-mirror-skip], input, textarea, select`).forEach((n) => n.remove());
    root.removeAttribute('data-mirror');
    root.setAttribute('data-lg-copy', '');
    root.setAttribute('inert', '');
    root.setAttribute('aria-hidden', 'true');
    return { root, pairs };
  }

  const stateOf = (el) =>
    Array.from(el.attributes)
      .map((a) => a.name)
      .filter((name) => name.startsWith('data-') && name !== 'data-mirror' && !name.startsWith('data-lg-mirror'))
      .sort()
      .join(' ');

  function syncElementStyle(original, copy, isRoot) {
    if (!original.style || !copy.style) return;
    for (const name of Array.from(copy.style)) {
      if (isRoot && PLACEMENT_PROPS.has(name)) continue;
      if (!original.style.getPropertyValue(name)) copy.style.removeProperty(name);
    }
    for (const name of Array.from(original.style)) {
      if (isRoot && PLACEMENT_PROPS.has(name)) continue;
      const value = original.style.getPropertyValue(name);
      const priority = original.style.getPropertyPriority(name);
      if (copy.style.getPropertyValue(name) !== value || copy.style.getPropertyPriority(name) !== priority) {
        copy.style.setProperty(name, value, priority);
      }
    }
  }

  function attachMirrorBackdrop(glass, source, paddingFn, zoomFn, activeFn) {
    const layer = document.createElement('div');
    layer.className = 'lg-mirror';
    layer.setAttribute('aria-hidden', 'true');
    glass.setAttribute(SELF_ATTR, '');
    glass.prepend(layer);

    const viewport = document.createElement('div');
    viewport.className = 'lg-mirror__viewport';
    layer.appendChild(viewport);

    const zoomer = document.createElement('div');
    zoomer.className = 'lg-mirror__zoom';
    viewport.appendChild(zoomer);

    let copy = cloneSource(source);
    zoomer.appendChild(copy.root);

    let stopped = false;
    let frame = 0;
    let placed = '';
    let shown = true;
    let pad = 0;
    let copyFlags = '';
    let zoomed = '';

    const place = (from, g, sgx, sgy) => {
      const sw = from.offsetWidth;
      const sh = from.offsetHeight;
      if (!sw || !sh) return null;
      const s = from.getBoundingClientRect();
      const kx = s.width / sw / sgx;
      const ky = s.height / sh / sgy;
      const px = (s.left - g.left) / sgx + pad;
      const py = (s.top - g.top) / sgy + pad;
      return {
        sw,
        sh,
        key: `${sw}|${sh}|${px.toFixed(2)}|${py.toFixed(2)}|${kx.toFixed(4)}|${ky.toFixed(4)}`,
        transform: `translate(${px}px, ${py}px) scale(${kx}, ${ky})`
      };
    };

    const align = () => {
      const nextPad = paddingFn();
      if (nextPad !== pad) {
        pad = nextPad;
        viewport.style.inset = `${-pad}px`;
        placed = '';
      }
      const gw = glass.offsetWidth;
      const gh = glass.offsetHeight;
      if (!gw || !gh) return;
      const g = glass.getBoundingClientRect();
      if (!g.width || !g.height) return;
      const sgx = g.width / gw;
      const sgy = g.height / gh;
      const at = place(source, g, sgx, sgy);
      if (!at) return;
      if (at.key === placed) return;
      placed = at.key;
      const root = copy.root;
      root.style.position = 'absolute';
      root.style.left = '0px';
      root.style.top = '0px';
      root.style.margin = '0px';
      root.style.width = `${at.sw}px`;
      root.style.height = `${at.sh}px`;
      root.style.maxWidth = 'none';
      root.style.maxHeight = 'none';
      root.style.minWidth = '0px';
      root.style.minHeight = '0px';
      root.style.scale = 'none';
      root.style.translate = 'none';
      root.style.transformOrigin = '0 0';
      root.style.transform = at.transform;
    };

    const sync = () => {
      for (const pair of copy.pairs) {
        if (!pair.original.style) continue;
        const css = pair.original.style.cssText;
        const cls = pair.original.className ? pair.original.className.toString() : '';
        if (css !== pair.css) {
          pair.css = css;
          syncElementStyle(pair.original, pair.copy, pair.copy === copy.root);
        }
        if (cls !== pair.cls) {
          pair.cls = cls;
          if (pair.copy instanceof SVGElement) {
            pair.copy.setAttribute('class', cls);
          } else {
            pair.copy.className = cls;
          }
        }
      }
      const flags = stateOf(source);
      if (flags !== copyFlags) {
        const now = new Set(flags.split(' '));
        for (const name of copyFlags.split(' ')) {
          if (name && !now.has(name)) copy.root.removeAttribute(name);
        }
        for (const name of flags.split(' ')) {
          if (name) copy.root.setAttribute(name, source.getAttribute(name) ?? '');
        }
        copyFlags = flags;
      }
    };

    const applyZoom = () => {
      const z = zoomFn();
      const value = Array.isArray(z) ? `scale(${z[0]}, ${z[1]})` : `scale(${z})`;
      if (value !== zoomed) {
        zoomed = value;
        zoomer.style.transform = value;
      }
    };

    const tick = () => {
      frame = 0;
      if (stopped) return;
      const on = !document.hidden && activeFn();
      if (on !== shown) {
        shown = on;
        layer.style.visibility = on ? '' : 'hidden';
      }
      if (!on) return;
      applyZoom();
      sync();
      align();
      frame = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (!frame && !stopped) frame = requestAnimationFrame(tick);
    };
    wake();

    let pending = 0;
    const recopy = () => {
      pending = 0;
      if (stopped) return;
      const next = cloneSource(source);
      copy.root.replaceWith(next.root);
      copy = next;
      copyFlags = '';
      placed = '';
      align();
    };

    const mutations = new MutationObserver((records) => {
      if (records.every((r) => layer.contains(r.target) || r.target === layer || r.target === glass)) return;
      wake();
      const structural = records.some((r) => r.type !== 'attributes' && !layer.contains(r.target));
      if (structural && !pending) {
        pending = requestAnimationFrame(recopy);
      } else if (!structural && !stopped && !document.hidden && activeFn()) {
        applyZoom();
        sync();
        align();
      }
    });
    mutations.observe(source, { childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'data-lifted', 'data-previewing'], subtree: true });

    return {
      wake,
      recopy,
      destroy() {
        stopped = true;
        cancelAnimationFrame(frame);
        cancelAnimationFrame(pending);
        mutations.disconnect();
        layer.remove();
        glass.removeAttribute(SELF_ATTR);
      }
    };
  }

  function bindRefraction(element, shape = {}, mirrorEl = null, mirrorActiveFn = null) {
    const live = canRefractBackdrop() && !(shape.copy && mirrorEl);
    const chromium = canRefractBackdrop();
    const bendCopy = !!mirrorEl && (shape.copy === 'refract' || !chromium);
    let pad = 0;
    let zoom = 1;
    let zoomX = 1;
    let copyFilter = '';

    const mirrorCtrl = !live && mirrorEl
      ? attachMirrorBackdrop(element, mirrorEl, () => pad, () => [zoomX, zoom], mirrorActiveFn || (() => true))
      : null;

    const applyCopyFilter = () => {
      const viewport = element.querySelector(':scope > .lg-mirror > .lg-mirror__viewport');
      if (viewport && copyFilter) viewport.style.filter = copyFilter;
    };

    const fit = () => {
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      if (!width || !height) return;
      const radius = cornerRadius(element, width, height);
      const baked = glassFor(width, height, radius, shape);
      if (!live && mirrorEl) {
        pad = Math.ceil(Math.min(width, height) * 0.45 + 6);
        const resolved = resolveShape(shape, width, height);
        zoom = resolved.zoom;
        zoomX = resolved.zoomX;
        element.style.setProperty('--lg-inner-mask', baked.inner);
        if (bendCopy) {
          copyFilter = glassFor(width, height, radius, { ...shape, zoom: 1, zoomX: 1 }, pad, false, true, !chromium).filter;
          applyCopyFilter();
        }
      }
      if (live || (bendCopy && chromium && !shape.copyOnly)) {
        const backdrop = live ? baked.filter : glassFor(width, height, radius, { ...shape, zoom: 1, zoomX: 1, strength: (shape.strength ?? 1) * 0.45 }).filter;
        element.style.setProperty('--lg-refraction', backdrop);
        element.setAttribute('data-lg-refract', shape.kind ?? 'surface');
      }
      element.style.setProperty('--lg-rim', baked.rim);
    };

    let timer = 0;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(fit, 90);
    });
    ro.observe(element);
    requestAnimationFrame(fit);

    return {
      fit,
      mirrorCtrl
    };
  }

  // =========================================================================
  // 4. INTERACTIVE DRAGGABLE LENS TRACK CONTROLLER (lensTrack.ts)
  // =========================================================================
  function initLiquidGlassNav() {
    const bar = document.getElementById('mobileBottomNav');
    const glass = document.getElementById('bottomNavGlass');
    const lens = document.getElementById('bottomNavLens');
    const select = document.getElementById('bottomNavPill');
    if (!bar || !glass || !lens || !select) return null;

    const tabs = ['dashboard', 'finance', 'todos', 'habits', 'notebook'];
    const count = tabs.length;
    const overhang = 14;
    const spread = 0.30;
    const contentZoom = 1.05;
    const swellAmount = 8;

    // Bind Snell's law refraction & specular rims to both the bar glass and lifted lens
    const glassRefract = bindRefraction(glass, { kind: 'surface', strength: 1.1 });
    const lensRefract = bindRefraction(
      lens,
      { kind: 'lens', strength: 1, stretch: 1, bezel: 24, zoom: contentZoom, dispersion: 1, copy: 'refract', copyOnly: true },
      bar,
      () => bar.hasAttribute('data-lifted')
    );

    let slot = 0;
    let height = 0;
    let pad = 0;
    let padY = 0;
    let W = 0;
    let H = 0;
    const state = { x: 0, lift: 0, swell: 0, squash: 0, pull: 0 };
    let current = 0;
    let gesture = null;
    let dropTimer = 0;
    let suppressClick = false;
    let dragging = false;

    const getButtons = () => Array.from(bar.querySelectorAll(':scope > [data-lg-item]'));
    let glyphs = [];

    const preview = (index) => {
      const buttons = getButtons();
      if (index === undefined) delete bar.dataset.previewing;
      else bar.dataset.previewing = '';
      buttons.forEach((button, i) => button.toggleAttribute('data-lg-preview', i === index));
    };

    const measure = () => {
      if (!bar.clientWidth || !bar.clientHeight) return;
      const style = getComputedStyle(bar);
      pad = parseFloat(style.paddingLeft) || 4;
      padY = parseFloat(style.paddingTop) || 4;
      slot = (bar.clientWidth - pad - (parseFloat(style.paddingRight) || 4)) / count;
      height = bar.clientHeight - padY - (parseFloat(style.paddingBottom) || 4);
      H = Math.round(bar.offsetHeight + overhang);
      W = Math.round(Math.max(slot * (1 + spread), slot + H - height));

      lens.style.width = `${W}px`;
      lens.style.height = `${H}px`;
      lens.style.left = `${pad + (slot - W) / 2}px`;
      lens.style.top = `${padY + (height - H) / 2}px`;
      select.style.width = `${slot}px`;
      select.style.left = `${pad}px`;

      const buttons = getButtons();
      glyphs = buttons.flatMap((button) =>
        Array.from(button.querySelectorAll('.lg-nav__label, .lg-nav__icon')).map((node) => {
          const isLabel = node.classList.contains('lg-nav__label');
          const host = node;
          return {
            node,
            x: button.offsetLeft + node.offsetLeft - pad,
            y: node.offsetTop,
            width: node.offsetWidth,
            height: node.offsetHeight,
            label: isLabel,
            host,
            dx: 0,
            dy: 0
          };
        })
      );
    };

    const paint = () => {
      const { swell, squash } = state;
      const xVal = state.x;
      const liftVal = clamp(state.lift, 0, 1.08);
      if (!W || !H || !slot) return;

      const kx = ((slot + (W - slot) * liftVal) / W) * (1 + squash);
      const ky = ((height + (H - height) * liftVal) / H) * (1 - squash * 0.6);
      const grow = 1 + (swellAmount / Math.max(bar.offsetWidth, 1)) * swell;

      lens.style.transform = `translateX(${xVal}px) scale(${kx}, ${ky})`;
      select.style.transform = `translateX(${xVal}px)`;
      lens.style.opacity = String(clamp(liftVal * 4, 0, 1));
      bar.style.scale = `${grow} 1`;
      lens.style.setProperty('--lg-lift', String(clamp(liftVal, 0, 1)));
      bar.style.setProperty('--lg-lift', String(clamp(liftVal, 0, 1)));

      for (const glyph of glyphs) {
        if (liftVal <= 0.02 && !gesture) {
          glyph.node.style.removeProperty('--lg-content-tint');
          glyph.node.style.removeProperty('transform');
          glyph.host.style.removeProperty('--lg-content-hide');
          continue;
        }
        // Cut the lens's true footprint out of the real glyph underneath so only the magnified refracted copy inside the lens shows
        const hy = (H * ky) / 2;
        const hx = (H * kx) / 2;
        const run = Math.max(0, ((W - H) * kx) / 2);
        const ccx = xVal + slot / 2 - glyph.x + glyph.dx;
        const ccy = height / 2 - glyph.y + glyph.dy;
        const fade = clamp(liftVal * 3, 0, 1);
        const solid = `rgb(0 0 0 / ${fade})`;
        glyph.host.style.setProperty('--lg-content-hide', [
          'linear-gradient(#000, #000)',
          `radial-gradient(ellipse ${hx}px ${hy}px at ${ccx - run}px ${ccy}px, ${solid} calc(100% - 1px), transparent 100%)`,
          `radial-gradient(ellipse ${hx}px ${hy}px at ${ccx + run}px ${ccy}px, ${solid} calc(100% - 1px), transparent 100%)`,
          `linear-gradient(${solid}, ${solid}) ${ccx - run}px ${ccy - hy}px / ${run * 2}px ${hy * 2}px no-repeat`
        ].join(', '));

        const ry = (H * ky) / (2 * contentZoom);
        const rx = (H * kx) / (2 * contentZoom);
        const straight = Math.max(0, ((W - H) * kx) / (2 * contentZoom));
        const dy = clamp(Math.abs(glyph.y + glyph.height / 2 - height / 2) / ry, 0, 1);
        const half = straight + rx * Math.sqrt(1 - dy * dy);
        const from = xVal + slot / 2 - half - glyph.x;
        const to = xVal + slot / 2 + half - glyph.x;
        const coverage = clamp((Math.min(glyph.width, to) - Math.max(0, from)) / Math.max(1, glyph.width), 0, 1);
        const scale = 1 + clamp(liftVal, 0, 1) * coverage * (glyph.label ? 0.035 : 0.08);
        glyph.node.style.transform = `scale(${scale})`;
      }

      if (!gesture && liftVal < 0.02) {
        delete bar.dataset.lifted;
      }
    };

    const jelly = createJelly((value) => {
      state.squash = value;
      paint();
    }, 0.13, 1600);

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
      const buttons = getButtons();
      buttons.forEach((btn, i) => {
        btn.setAttribute('aria-selected', i === index ? 'true' : 'false');
      });
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
      const raw = gesture.anchor + ((clientX - gesture.startX) * bar.offsetWidth) / Math.max(1, gesture.box.width);
      const max = slot * (count - 1);
      const give = Math.min(14, slot * 0.12);
      if (raw < 0) return rubberband(raw, give, 0.55);
      if (raw > max) return max + rubberband(raw - max, give, 0.55);
      return raw;
    };

    const updateLight = (clientX, box) => {
      glass.style.setProperty('--lg-x', `${clamp(((clientX - box.left) / box.width) * 100, 0, 100)}%`);
      lens.style.setProperty('--lg-x', `${clamp(((clientX - box.left - pad - state.x) / Math.max(1, slot)) * 100, 0, 100)}%`);
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
      measure();
      lensRefract.fit();
      glassRefract.fit();
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
      if (lensRefract.mirrorCtrl) lensRefract.mirrorCtrl.wake();
      preview(index);
      lens.dataset.pressed = '';
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
      if (!gesture.moved && Math.abs(event.clientX - gesture.startX) > 4) {
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
      delete lens.dataset.pressed;
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
      const hold = commit && !moved ? Math.max(0, 190 - (performance.now() - startedAt)) : 0;
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
      delete lens.dataset.pressed;
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

    bar.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
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
        measure();
        glassRefract.fit();
        lensRefract.fit();
        if (lensRefract.mirrorCtrl) lensRefract.mirrorCtrl.recopy();
      }
    };

    global.liquidGlassNav = ctrl;
    return ctrl;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initLiquidGlassNav, 30);
    });
  } else {
    setTimeout(initLiquidGlassNav, 30);
  }
})(window);
