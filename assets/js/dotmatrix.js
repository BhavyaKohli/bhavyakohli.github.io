/*! dotmatrix.js
 *  Standalone particle-field (dot matrix) toy. Works as a fullscreen background
 *  or a small widget. Exposes window.DotMatrix:
 *
 *    DotMatrix.background(target, options)   // fullscreen behind content
 *    DotMatrix.widget(target, options)       // small styled box
 *    DotMatrix.create(canvas, options)       // low-level, returns { destroy(), sim }
 *
 *  Every tunable is an option; defaults mirror the /testing/ page values.
 */
(function (global) {
  "use strict";

  const DEFAULTS = {
    pointSpacing: 12,          // grid spacing of the dot lattice
    influenceRadius: 250,      // how close the mouse must be to disturb a dot
    mouseInfluence: 0.0006,    // strength of the mouse push per frame
    clickRadius: 260,          // radius of the click ripple
    spring: 0.015,             // how strongly a dot returns to its lattice slot
    drag: 0.92,                // velocity damping per frame
    pointRadius: 0.5,          // drawn dot radius
    baseBrightness: 0.8,       // resting dot alpha
    brightnessLerp: 0.1,       // how quickly brightness reacts to the mouse
    clickFrames: 30,           // frames a click ripple persists
    trailColor: 'rgba(0, 0, 0, 0.05)',  // translucent fill that trails motion
    interactive: true,         // track the pointer and react to clicks
    listenOnWindow: true       // attach pointer handlers to window vs. the canvas
  };

  /* --------------------------- core factory --------------------------- */
  function create(canvas, options) {
    const opts = Object.assign({}, DEFAULTS, options);
    const context = canvas.getContext("2d");
    const reducedMotion =
      !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const listenOnWindow = opts.listenOnWindow !== false;

    const POINT_SPACING = opts.pointSpacing;
    const INFLUENCE_RADIUS = opts.influenceRadius;
    const MOUSE_INFLUENCE = opts.mouseInfluence;
    const CLICK_RADIUS = opts.clickRadius;
    const SPRING = opts.spring;
    const DRAG = opts.drag;
    const POINT_RADIUS = opts.pointRadius;
    const BASE_BRIGHTNESS = opts.baseBrightness;
    const BRIGHTNESS_LERP = opts.brightnessLerp;
    const CLICK_FRAMES = opts.clickFrames;

    const S = {
      points: [],
      mouseX: -1000,
      mouseY: -1000,
      previousMouseX: -1000,
      previousMouseY: -1000,
      mouseSpeed: 0,
      clickFrames: 0
    };

    let destroyed = false;
    let rafId = 0;
    let listenTarget = null;

    class Point {
      constructor(x, y) {
        this.baseX = x;
        this.baseY = y;
        this.x = x;
        this.y = y;
        this.velocityX = 0;
        this.velocityY = 0;
        this.brightness = BASE_BRIGHTNESS;
      }

      update() {
        const deltaX = S.mouseX - this.x;
        const deltaY = S.mouseY - this.y;
        const distance = Math.hypot(deltaX, deltaY);

        if (distance < INFLUENCE_RADIUS) {
          const influence = (1 - distance / INFLUENCE_RADIUS) * S.mouseSpeed * MOUSE_INFLUENCE;
          this.velocityX -= deltaX * influence;
          this.velocityY -= deltaY * influence;
          this.brightness += (1 - this.brightness) * BRIGHTNESS_LERP;
        } else {
          this.brightness += (BASE_BRIGHTNESS - this.brightness) * BRIGHTNESS_LERP;
        }

        if (S.clickFrames > 0 && distance < CLICK_RADIUS) {
          const force = Math.sin(distance * 0.05 - S.clickFrames * 0.3) * (S.clickFrames / CLICK_FRAMES);
          this.velocityX += (this.x - S.mouseX) / Math.max(distance, 1) * force;
          this.velocityY += (this.y - S.mouseY) / Math.max(distance, 1) * force;
        }

        this.velocityX += (this.baseX - this.x) * SPRING;
        this.velocityY += (this.baseY - this.y) * SPRING;
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.velocityX *= DRAG;
        this.velocityY *= DRAG;
      }

      draw() {
        context.fillStyle = `rgba(255, 255, 255, ${this.brightness})`;
        context.beginPath();
        context.arc(this.x, this.y, POINT_RADIUS, 0, Math.PI * 2);
        context.fill();
      }
    }

    function sizeCanvas() {
      const scale = global.devicePixelRatio || 1;
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      canvas.width = width * scale;
      canvas.height = height * scale;
      context.setTransform(scale, 0, 0, scale, 0, 0);
      S.points = [];
      for (let x = 0; x <= width; x += POINT_SPACING) {
        for (let y = 0; y <= height; y += POINT_SPACING) {
          S.points.push(new Point(x, y));
        }
      }
    }

    function step() {
      if (destroyed) return;
      context.fillStyle = opts.trailColor;
      context.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      const currentSpeed = Math.hypot(S.mouseX - S.previousMouseX, S.mouseY - S.previousMouseY);
      S.mouseSpeed = S.mouseSpeed * 0.7 + currentSpeed * 0.3;
      S.points.forEach((point) => {
        point.update();
        point.draw();
      });
      S.previousMouseX = S.mouseX;
      S.previousMouseY = S.mouseY;
      S.clickFrames = Math.max(0, S.clickFrames - 1);
      scheduleFrame();
    }

    /* --------------------------- lifecycle --------------------------- */

    function onResize() {
      sizeCanvas();
    }

    function onPointerMove(event) {
      const rect = canvas.getBoundingClientRect();
      S.mouseX = event.clientX - rect.left;
      S.mouseY = event.clientY - rect.top;
    }

    function onPointerLeave() {
      S.mouseX = -1000;
      S.mouseY = -1000;
      S.mouseSpeed = 0;
    }

    function onPointerDown() {
      S.clickFrames = CLICK_FRAMES;
    }

    function scheduleFrame() {
      if (destroyed) return;
      rafId = global.requestAnimationFrame(step);
    }

    function start() {
      if (reducedMotion) return;
      sizeCanvas();
      global.addEventListener("resize", onResize);
      if (opts.interactive) {
        listenTarget = listenOnWindow ? global : canvas;
        listenTarget.addEventListener("pointermove", onPointerMove);
        listenTarget.addEventListener("pointerleave", onPointerLeave);
        listenTarget.addEventListener("pointerdown", onPointerDown);
      }
      scheduleFrame();
    }

    function destroy() {
      destroyed = true;
      if (rafId && global.cancelAnimationFrame) global.cancelAnimationFrame(rafId);
      rafId = 0;
      global.removeEventListener("resize", onResize);
      if (listenTarget) {
        listenTarget.removeEventListener("pointermove", onPointerMove);
        listenTarget.removeEventListener("pointerleave", onPointerLeave);
        listenTarget.removeEventListener("pointerdown", onPointerDown);
      }
    }

    start();

    return {
      canvas: canvas,
      destroy: destroy,
      sim: {
        state: S,
        reset() {
          S.points = [];
          S.mouseX = -1000; S.mouseY = -1000;
          S.previousMouseX = -1000; S.previousMouseY = -1000;
          S.mouseSpeed = 0;
          S.clickFrames = 0;
        },
        step,
        Point,
        sizeCanvas,
        POINT_SPACING,
        INFLUENCE_RADIUS,
        MOUSE_INFLUENCE,
        CLICK_RADIUS,
        SPRING,
        DRAG,
        POINT_RADIUS,
        BASE_BRIGHTNESS,
        CLICK_FRAMES
      }
    };
  }

  /* --------------------------- helpers --------------------------- */

  function toElement(target) {
    if (target == null) return null;
    return typeof target === "string" ? document.querySelector(target) : target;
  }

  function makeCanvas(container, className) {
    const canvas = document.createElement("canvas");
    canvas.className = "dm-canvas " + className;
    canvas.setAttribute("aria-hidden", "true");
    container.appendChild(canvas);
    return canvas;
  }

  function px(value) {
    return typeof value === "number" ? value + "px" : value;
  }

  /* Fullscreen background behind page content. target: selector, element, or null.
     null => appends a fixed viewport-sized canvas to <body>. Decorative (no mouse
     tracking) unless opts.interactive is explicitly true. */
  function background(target, options) {
    const opts = Object.assign({}, options);
    const interactive = opts.interactive === true;
    const container = toElement(target) || document.body;
    const canvas = makeCanvas(container, "dm-background");
    const s = canvas.style;
    s.position = "fixed";
    s.top = "0";
    s.left = "0";
    s.width = "100vw";
    s.height = "100vh";
    s.zIndex = "-1";
    s.pointerEvents = interactive ? "auto" : "none";
    s.opacity = opts.opacity != null ? opts.opacity : 0.5;
    return create(canvas, Object.assign({ interactive }, opts));
  }

  /* Small styled window inside a container. target: selector or element. */
  function widget(target, options) {
    const opts = Object.assign({}, options);
    const container = toElement(target) || document.body;
    const box = document.createElement("div");
    box.className = "dm-widget";
    const b = box.style;
    b.position = "relative";
    b.display = "inline-block";
    b.borderRadius = "12px";
    b.overflow = "hidden";
    b.border = "1px solid rgba(255, 255, 255, 0.15)";
    b.background = "rgba(10, 10, 10, 0.75)";
    b.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.4)";
    b.width = opts.width != null ? px(opts.width) : (container.offsetWidth > 0 ? "100%" : "320px");
    b.height = opts.height != null ? px(opts.height) : (container.offsetHeight > 0 ? "100%" : "240px");
    container.appendChild(box);
    const canvas = makeCanvas(box, "dm-widget-canvas");
    const s = canvas.style;
    s.display = "block";
    s.width = "100%";
    s.height = "100%";
    s.opacity = opts.opacity != null ? opts.opacity : 1;
    return create(canvas, Object.assign({ listenOnWindow: false }, opts));
  }

  global.DotMatrix = {
    create: create,
    background: background,
    widget: widget
  };
})(typeof window !== 'undefined' ? window : this);
