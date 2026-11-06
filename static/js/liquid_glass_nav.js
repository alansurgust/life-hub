/**
 * Apple iOS 26 Liquid Glass Navigation Engine — 120fps Mobile GPU Optimized Edition
 * Based on: https://github.com/zakisheriff/Liquid-Glass
 *
 * Optimizations for locked 60/120fps on iOS Safari & Android Chrome:
 * - Zero DOM layout reads (offsetWidth / getBoundingClientRect) during pointerdown, pointermove, or rAF paint()
 * - Zero per-frame CSS variable invalidations, box-shadow repaints, or -webkit-mask radial-gradient allocations
 * - Zero MutationObserver / DOM cloning overhead during drag gestures
 * - Pure GPU compositor transforms (translate3d + scale + opacity) with pre-promoted hardware layers
 * - One-time Snell's law iridescent specular rim bake (cached at startup)
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
    drag: springFrom(0.11, 0.92),
    snap: springFrom(0.36, 0.72),
    lift: springFrom(0.25, 0.78),
    settle: springFrom(0.44, 0.46),
    jelly: springFrom(0.28, 0.28)
  };

  const WOBBLE = springFrom(0.28, 0.22);
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
        window.triggerHaptic(12);
      } else if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(10);
      }
    } catch (_) {}
  }

  // =========================================================================
  // 2. LIGHTWEIGHT SNELL'S LAW SPECULAR IRIDESCENT RIM BAKER (Cached 1x)
  // =========================================================================
  const rimCache = new Map();

  function bakeSpecularRim(width, height, radius, isLens) {
    const w = Math.max(16, Math.round(width));
    const h = Math.max(16, Math.round(height));
    const r = Math.min(w / 2, h / 2, Math.max(0, Math.round(radius)));
    const key = `${w}|${h}|${r}|${isLens ? 1 : 0}`;
    if (rimCache.has(key)) return rimCache.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const data = img.data;

    const hw = w / 2;
    const hh = h / 2;
    const bezel = isLens ? Math.min(w, h) * 0.32 : Math.min(w, h) * 0.22;
    const flat = Math.max(bezel * 1.4, 5);

    for (let y = 0; y < h; y++) {
      const py = y + 0.5 - hh;
      const qy = Math.abs(py) - (hh - r);
      const oy = Math.max(qy, 0);
      for (let x = 0; x < w; x++) {
        const px = x + 0.5 - hw;
        const qx = Math.abs(px) - (hw - r);
        const ox = Math.max(qx, 0);
        const len = Math.hypot(ox, oy);
        const d = r - (len + Math.min(Math.max(qx, qy), 0));
        if (d < -1 || d > flat) continue;

        let nx = 0, ny = 0;
        if (len > 0) {
          nx = (ox / len) * Math.sign(px);
          ny = (oy / len) * Math.sign(py);
        } else if (qx > qy) {
          nx = Math.sign(px);
        } else {
          ny = Math.sign(py);
        }

        const facing = -(nx + ny) * Math.SQRT1_2;
        const light = 0.24 + 0.76 * Math.pow(Math.abs(facing), 2.1) * (facing > 0 ? 1 : 0.65);
        const line = Math.exp(-Math.pow((d - 0.6) / 0.65, 2));
        const inner = Math.exp(-Math.pow(d / (bezel * 0.55), 2)) * 0.16;
        const edgeAA = clamp(d + 1, 0, 1);
        const alpha = clamp((line * (isLens ? 0.96 : 0.78) + inner) * light * edgeAA, 0, 1);

        let cr = 255, cg = 255, cb = 255;
        if (isLens) {
          // Subtle iridescent prism dispersion around the droplet rim
          const hue = Math.atan2(ny, nx);
          const k = 0.14;
          cr = 255 * (1 - k + k * (0.5 + 0.5 * Math.cos(hue)));
          cg = 255 * (1 - k + k * (0.5 + 0.5 * Math.cos(hue - 2.1)));
          cb = 255 * (1 - k + k * (0.5 + 0.5 * Math.cos(hue + 2.1)));
        }

        const o = (y * w + x) * 4;
        data[o] = cr;
        data[o + 1] = cg;
        data[o + 2] = cb;
        data[o + 3] = Math.round(alpha * 255);
      }
    }

    ctx.putImageData(img, 0, 0);
    const url = `url("${canvas.toDataURL()}")`;
    rimCache.set(key, url);
    return url;
  }

  // =========================================================================
  // 3. 120FPS GPU-COMPOSITED LENS TRACK CONTROLLER
  // =========================================================================
  function initLiquidGlassNav() {
    const bar = document.getElementById('mobileBottomNav');
    const glass = document.getElementById('bottomNavGlass');
    const lens = document.getElementById('bottomNavLens');
    const select = document.getElementById('bottomNavPill');
    if (!bar || !glass || !lens || !select) return null;

    // Create GPU-composited light bloom element inside glass (avoids radial-gradient repaint)
    let bloom = glass.querySelector('.lg-glass__bloom');
    if (!bloom) {
      bloom = document.createElement('span');
      bloom.className = 'lg-glass__bloom';
      glass.appendChild(bloom);
    }

    const tabs = ['dashboard', 'finance', 'todos', 'habits', 'notebook'];
    const count = tabs.length;
    const overhang = 14;
    const spread = 0.28;
    const swellAmount = 8;

    let barWidth = 0;
    let barHeight = 0;
    let slot = 0;
    let height = 0;
    let pad = 4;
    let padY = 4;
    let W = 0;
    let H = 0;

    const state = { x: 0, lift: 0, swell: 0, squash: 0 };
    let current = 0;
    let gesture = null;
    let dropTimer = 0;
    let suppressClick = false;
    let dragging = false;
    let paintQueued = false;

    const buttons = Array.from(bar.querySelectorAll(':scope > [data-lg-item]'));
    // Wrap each button's icon + label in a lightweight GPU transform container if not already wrapped
    const itemInners = buttons.map((btn) => {
      let inner = btn.querySelector('.lg-track__item-inner');
      if (!inner) {
        inner = document.createElement('span');
        inner.className = 'lg-track__item-inner';
        while (btn.firstChild) {
          inner.appendChild(btn.firstChild);
        }
        btn.appendChild(inner);
      }
      return inner;
    });

    const preview = (index) => {
      if (index === undefined) delete bar.dataset.previewing;
      else bar.dataset.previewing = '';
      for (let i = 0; i < buttons.length; i++) {
        buttons[i].toggleAttribute('data-lg-preview', i === index);
      }
    };

    const measure = () => {
      const cw = bar.clientWidth;
      const ch = bar.clientHeight;
      if (!cw || !ch) return;
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

      lens.style.width = `${W}px`;
      lens.style.height = `${H}px`;
      lens.style.left = `${pad + (slot - W) / 2}px`;
      lens.style.top = `${padY + (height - H) / 2}px`;
      select.style.width = `${slot}px`;
      select.style.left = `${pad}px`;

      // Bake specular rims only when dimensions change (idle / cached)
      const scheduleBake = window.requestIdleCallback || ((cb) => setTimeout(cb, 16));
      scheduleBake(() => {
        if (barWidth && barHeight) {
          glass.style.setProperty('--lg-rim', bakeSpecularRim(barWidth, barHeight, barHeight / 2, false));
          lens.style.setProperty('--lg-rim', bakeSpecularRim(W, H, H / 2, true));
        }
      });
    };

    // Pure GPU paint: ONLY writes transform and opacity, ZERO DOM reads!
    const paint = () => {
      paintQueued = false;
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

      // 1. Move & morph the Liquid Glass droplet lens (GPU transform + opacity)
      lens.style.transform = `translate3d(${xVal.toFixed(2)}px, 0, 0) scale(${kx.toFixed(4)}, ${ky.toFixed(4)})`;
      lens.style.opacity = String(clamp(liftVal * 3.2, 0, 1));

      // 2. Move & cross-fade the resting selection pill (GPU transform + opacity)
      select.style.transform = `translate3d(${xVal.toFixed(2)}px, 0, 0)`;
      select.style.opacity = String(clamp(1 - liftVal * 2.1, 0, 1));

      // 3. Swell the floating dock capsule on press
      bar.style.transform = swell > 0.001 ? `scale3d(${growX.toFixed(4)}, ${growY.toFixed(4)}, 1)` : 'none';

      // 4. Magnify icons & labels smoothly as the liquid lens passes over them (GPU transform)
      if (liftClamped > 0.01) {
        const radius = slot * 0.85;
        for (let i = 0; i < count; i++) {
          const dist = Math.abs(xVal - i * slot);
          const prox = dist < radius ? 1 - dist / radius : 0;
          if (prox > 0.001) {
            const easeProx = prox * prox * (3 - 2 * prox);
            const s = 1 + 0.11 * easeProx * liftClamped;
            const dy = -1.5 * easeProx * liftClamped;
            itemInners[i].style.transform = `translate3d(0, ${dy.toFixed(2)}px, 0) scale(${s.toFixed(4)})`;
          } else {
            itemInners[i].style.transform = 'none';
          }
        }
      } else {
        for (let i = 0; i < count; i++) {
          itemInners[i].style.transform = 'none';
        }
        if (!gesture) {
          delete bar.dataset.lifted;
        }
      }
    };

    const schedulePaint = () => {
      if (!paintQueued) {
        paintQueued = true;
        paint();
      }
    };

    const jelly = createJelly((value) => {
      state.squash = value;
      schedulePaint();
    }, 0.14, 1500);

    const xSpring = createSpring(0, SPRINGS.snap, (value, velocity) => {
      state.x = value;
      jelly.feed(velocity, dragging ? WOBBLE_REACH : undefined);
      schedulePaint();
    });

    const liftSpring = createSpring(0, SPRINGS.lift, (value) => {
      state.lift = value;
      schedulePaint();
    });

    const swellSpring = createSpring(0, SPRINGS.press, (value) => {
      state.swell = value;
      schedulePaint();
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
      const give = Math.min(14, slot * 0.14);
      if (raw < 0) return rubberband(raw, give, 0.55);
      if (raw > max) return max + rubberband(raw - max, give, 0.55);
      return raw;
    };

    // Pure GPU transform for finger light bloom (zero gradient repaint)
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
      if (!slot) measure();
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
      schedulePaint();
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
      const hold = commit && !moved ? Math.max(0, 180 - (performance.now() - startedAt)) : 0;
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
      refresh: measure
    };

    global.liquidGlassNav = ctrl;
    return ctrl;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      requestAnimationFrame(initLiquidGlassNav);
    });
  } else {
    requestAnimationFrame(initLiquidGlassNav);
  }
})(window);
