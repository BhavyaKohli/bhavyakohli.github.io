/*! molecular-graphs.js
 *  Standalone molecular-graph toy. Works as a fullscreen background or a
 *  small widget. Exposes window.MolecularGraphs:
 *
 *    MolecularGraphs.background(target, options)   // fullscreen behind content
 *    MolecularGraphs.widget(target, options)       // small styled box
 *    MolecularGraphs.create(canvas, options)       // low-level, returns { destroy(), sim }
 *
 *  Every tunable is an option; defaults mirror the /graphs/ page values.
 */
(function (global) {
  "use strict";

  const DEFAULTS = {
    // graph lifecycle
    maxGraphs: 30,            // max graphs alive at once
    offScreenMargin: 50,      // how far a lone graph drifts past the edge before it despawns
    spawnMargin: 20,          // how far outside the viewport edge-spawns start
    spawnInitialDelay: 30,    // frames before the first auto-spawn
    spawnIntervalMin: 20,     // min frames between auto-spawns
    spawnIntervalMax: 160,    // max frames between auto-spawns
    spawnSpeedMin: 0.4,       // min entry speed of a newly spawned graph
    spawnSpeedMax: 1.0,       // max entry speed of a newly spawned graph

    // atom structure
    minRing: 2,               // fewest ring atoms a graph can have
    maxRing: 6,               // most ring atoms a graph can have
    maxHAtoms: 2,             // max extra hydrogen atoms hanging off a graph
    bondLength: 48,           // rest length every bond pulls toward
    nodeRadius: 8,            // drawn atom radius (also sets collision clearance)

    // merging
    maxMerges: 5,             // merges before the molecule glows, dissolves, and respawns
    nodeMergeDistance: null,  // distance at which two atoms fuse (default 1.8 * nodeRadius)

    // attraction
    graphGravityRange: 360,   // range of root-to-root attraction
    graphGravityK: 0.015,     // strength of root-to-root attraction
    nodeGravityRange: 135,    // range over which close atoms pull their graphs together
    nodeGravityK: 0.01,       // strength of the atom-level attraction

    // relaxation (springs inside a molecule)
    springK: 0.04,            // bond spring stiffness (higher = bonds snap back faster)
    repulsionK: 0.8,          // how strongly atoms push each other apart
    repulseRange: 60,         // range of the atom repulsion
    damp: 0.86,               // per-frame damping of atom velocity (lower = bouncier)
    maxNodeSpeed: 1.5,        // clamp on atom speed inside a molecule

    // motion of whole graphs
    driftJitter: 0.006,       // random drift added to a lone graph velocity per frame
    maxGraphSpeed: 1,         // clamp on a lone graph speed
    kickSpeedMin: 1.2,        // min speed imparted when you click a graph to nudge it
    kickSpeedMax: 1.5,        // max speed imparted when you click a graph to nudge it

    // collision
    collisionMargin: 2,       // clearance kept between atoms/edges during collisions
    crossingBoost: 5,         // extra push so genuinely crossing edges unwind instead of stalling

    // maxed-molecule dissolution
    glowFrames: 5,            // frames the maxed molecule glows before fading
    fadeFrames: 60,           // frames over which it fades out and vanishes
    maxedTint: "#9e8a7f",     // warm tint the maxed molecule shifts to as it dissolves

    // rendering / behavior
    backgroundColor: "#0a0a0a", // clear color painted each frame
    atomColors: { C: "#d6d6d6", H: "#d6d6d6" },
    interactive: true,        // allow click-to-spawn / click-to-nudge
    autoSpawn: true,          // continuously spawn graphs from the edges
    seedCount: 4,             // graphs seeded at start
    opacity: 1,               // CSS opacity applied to the canvas (helpers)
    listenOnWindow: true      // attach the pointer handler to window vs. the canvas
  };

  /*---------------------- core factory ----------------------*/
  function create(canvas, options) {
    const opts = Object.assign({}, DEFAULTS, options);
    const ctx = canvas.getContext("2d");
    const reducedMotion =
      !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const listenOnWindow = opts.listenOnWindow !== false;

    // graph lifecycle
    const MAX_GRAPHS = opts.maxGraphs;
    const OFF_SCREEN_MARGIN = opts.offScreenMargin;
    const SPAWN_MARGIN = opts.spawnMargin;
    const SPAWN_INITIAL_DELAY = opts.spawnInitialDelay;
    const SPAWN_INTERVAL_MIN = opts.spawnIntervalMin;
    const SPAWN_INTERVAL_MAX = opts.spawnIntervalMax;
    const SPAWN_SPEED_MIN = opts.spawnSpeedMin;
    const SPAWN_SPEED_MAX = opts.spawnSpeedMax;
    // atom structure
    const MIN_RING = opts.minRing;
    const MAX_RING = opts.maxRing;
    const MAX_H_ATOMS = opts.maxHAtoms;
    const BOND_LENGTH = opts.bondLength;
    const NODE_RADIUS = opts.nodeRadius;
    // merging
    const MAX_MERGES = opts.maxMerges;
    const NODE_MERGE_DISTANCE = opts.nodeMergeDistance || 1.8 * NODE_RADIUS;
    // attraction
    const GRAPH_GRAVITY_RANGE = opts.graphGravityRange;
    const GRAPH_GRAVITY_K = opts.graphGravityK;
    const NODE_GRAVITY_RANGE = opts.nodeGravityRange;
    const NODE_GRAVITY_K = opts.nodeGravityK;
    // relaxation
    const SPRING_K = opts.springK;
    const REPULSION_K = opts.repulsionK;
    const REPULSE_RANGE = opts.repulseRange;
    const DAMP = opts.damp;
    const MAX_NODE_SPEED = opts.maxNodeSpeed;
    // motion
    const DRIFT_JITTER = opts.driftJitter;
    const MAX_GRAPH_SPEED = opts.maxGraphSpeed;
    const KICK_SPEED_MIN = opts.kickSpeedMin;
    const KICK_SPEED_MAX = opts.kickSpeedMax;
    // collision
    const COLLISION_MARGIN = opts.collisionMargin;
    const CROSSING_BOOST = opts.crossingBoost;
    // dissolution
    const GLOW_FRAMES = opts.glowFrames;
    const FADE_FRAMES = opts.fadeFrames;
    const MAXED_TINT = opts.maxedTint;
    const ATOM_COLORS = opts.atomColors;

    const S = {
      graphs: [],
      flashes: [],
      spawnTimer: opts.spawnInitialDelay
    };

    let destroyed = false;
    let rafId = 0;
    let listenTarget = null;

    // graph lifecycle


    function rand(a, b) {
      return a + Math.random() * (b - a);
    }

    function pickAtomType() {
      return "C";
    }

    function rotX(angle, x, y) {
      return x * Math.cos(angle) - y * Math.sin(angle);
    }

    function rotY(angle, x, y) {
      return x * Math.sin(angle) + y * Math.cos(angle);
    }

    function worldOf(g, n) {
      return {
        x: g.x + rotX(g.angle, n.dx, n.dy),
        y: g.y + rotY(g.angle, n.dx, n.dy)
      };
    }

    class Graph {
      constructor(cx, cy) {
        this.x = cx;
        this.y = cy;
        const angle = rand(0, Math.PI * 2);
        const speed = rand(SPAWN_SPEED_MIN, SPAWN_SPEED_MAX);
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.nodes = [];
        this.edges = [];
        this.alive = true;
        this.mergeCount = 0;
        this.angle = rand(0, Math.PI * 2);
        this.parent = null;
        this.pivotParent = -1;
        this.pivotThis = -1;
        this.depth = 0;
        this.dying = false;
        this.fadeAge = 0;

        const ring = Math.floor(rand(MIN_RING, MAX_RING + 1));
        const ringRadius = BOND_LENGTH / (2 * Math.sin(Math.PI / ring));
        const phase = rand(0, Math.PI * 2);
        const ringIndices = [];
        for (let i = 0; i < ring; i++) {
          const a = phase + (i / ring) * Math.PI * 2;
          const type = pickAtomType();
          ringIndices.push(this.nodes.length);
          this.nodes.push({
            dx: Math.cos(a) * ringRadius,
            dy: Math.sin(a) * ringRadius,
            nvx: 0,
            nvy: 0,
            type,
            r: NODE_RADIUS,
            color: ATOM_COLORS[type]
          });
        }
        if (ring === 2) {
          this.edges.push([ringIndices[0], ringIndices[1]]);
        } else {
          for (let i = 0; i < ring; i++) {
            this.edges.push([ringIndices[i], ringIndices[(i + 1) % ring]]);
          }
        }

        const hCount = Math.floor(rand(0, MAX_H_ATOMS + 0.6));
        for (let k = 0; k < hCount; k++) {
          const i = ringIndices[Math.floor(Math.random() * ring)];
          const center = this.nodes[i];
          const a = Math.atan2(center.dy, center.dx);
          const hidx = this.nodes.length;
          this.nodes.push({
            dx: center.dx + Math.cos(a) * BOND_LENGTH,
            dy: center.dy + Math.sin(a) * BOND_LENGTH,
            nvx: 0,
            nvy: 0,
            type: "H",
            r: NODE_RADIUS,
            color: ATOM_COLORS.H
          });
          this.edges.push([hidx, i]);
        }
      }

      update() {
        this.vx += rand(-DRIFT_JITTER, DRIFT_JITTER);
        this.vy += rand(-DRIFT_JITTER, DRIFT_JITTER);
        const speed = Math.hypot(this.vx, this.vy);
        const maxSpeed = MAX_GRAPH_SPEED;
        if (speed > maxSpeed) {
          this.vx = (this.vx / speed) * maxSpeed;
          this.vy = (this.vy / speed) * maxSpeed;
        }
        this.x += this.vx;
        this.y += this.vy;
      }

      offScreen() {
        const w = canvas.offsetWidth;
        const h = canvas.offsetHeight;
        return (
          this.x < -OFF_SCREEN_MARGIN ||
          this.x > w + OFF_SCREEN_MARGIN ||
          this.y < -OFF_SCREEN_MARGIN ||
          this.y > h + OFF_SCREEN_MARGIN
        );
      }

      draw() {
        const root = rootOf(this);
        const age = root.fadeAge;
        const alpha = root.dying ? Math.min(1, Math.max(0, 1 - (age - GLOW_FRAMES) / FADE_FRAMES)) : 1;
        const glowing = root.dying && age < GLOW_FRAMES;

        ctx.save();
        ctx.globalAlpha = alpha;
        if (glowing) {
          ctx.shadowColor = MAXED_TINT;
          ctx.shadowBlur = 24;
        }
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        ctx.strokeStyle = root.dying ? MAXED_TINT : "rgba(255, 255, 255, 0.55)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (const [i, j] of this.edges) {
          const a = this.nodes[i];
          const b = this.nodes[j];
          ctx.moveTo(a.dx, a.dy);
          ctx.lineTo(b.dx, b.dy);
        }
        ctx.stroke();

        for (const n of this.nodes) {
          ctx.fillStyle = root.dying ? MAXED_TINT : n.color;
          ctx.beginPath();
          ctx.arc(n.dx, n.dy, n.r, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    }

    class Flash {
      constructor(x, y) {
        this.x = x;
        this.y = y;
        this.age = 0;
        this.maxAge = 20;
        this.radius = 6;
      }

      update() {
        this.age++;
        this.radius += 1.1;
      }

      draw() {
        const t = 1 - this.age / this.maxAge;
        if (t <= 0) return;
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.16 * t).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function rootOf(g) {
      let r = g;
      while (r.parent) r = r.parent;
      return r;
    }

    function isAncestorOf(a, b) {
      let r = b;
      while (r) {
        if (r === a) return true;
        r = r.parent;
      }
      return false;
    }

    function setAssemblyMergeCount(root, count) {
      for (const g of S.graphs) {
        if (rootOf(g) === root) g.mergeCount = count;
      }
    }

    function markDying(root) {
      if (root.dying) return;
      root.dying = true;
      root.fadeAge = 0;
      root.vx = 0;
      root.vy = 0;
    }

    function closestAssemblyPair(ra, rb) {
      let best = Infinity;
      let ga = null;
      let ia = -1;
      let gb = null;
      let ib = -1;
      for (const g of S.graphs) {
        if (rootOf(g) !== ra) continue;
        for (let i = 0; i < g.nodes.length; i++) {
          const wp = worldOf(g, g.nodes[i]);
          for (const h of S.graphs) {
            if (rootOf(h) !== rb) continue;
            for (let j = 0; j < h.nodes.length; j++) {
              const wq = worldOf(h, h.nodes[j]);
              const d = Math.hypot(wp.x - wq.x, wp.y - wq.y);
              if (d < best) {
                best = d;
                ga = g;
                ia = i;
                gb = h;
                ib = j;
              }
            }
          }
        }
      }
      return {
        ga,
        ia,
        gb,
        ib,
        d: best,
        wa: worldOf(ga, ga.nodes[ia]),
        wb: worldOf(gb, gb.nodes[ib])
      };
    }

    function closestNodePair(a, b, jointed) {
      let best = Infinity;
      let na = null;
      let nb = null;
      const pA = a.parent === b ? a.pivotThis : b.parent === a ? a.pivotParent : -1;
      const pB = b.parent === a ? b.pivotThis : a.parent === b ? b.pivotParent : -1;
      for (let i = 0; i < a.nodes.length; i++) {
        for (let j = 0; j < b.nodes.length; j++) {
          if (jointed && i === pA && j === pB) continue;
          const wp = worldOf(a, a.nodes[i]);
          const wq = worldOf(b, b.nodes[j]);
          const d = Math.hypot(wp.x - wq.x, wp.y - wq.y);
          if (d < best) {
            best = d;
            na = a.nodes[i];
            nb = b.nodes[j];
          }
        }
      }
      return { na, nb, d: best };
    }

    function alignChildToPivot(g) {
      const p = g.parent;
      const pw = worldOf(p, p.nodes[g.pivotParent]);
      const cn = g.nodes[g.pivotThis];
      g.x = pw.x - rotX(g.angle, cn.dx, cn.dy);
      g.y = pw.y - rotY(g.angle, cn.dx, cn.dy);
    }

    function applyRootGravity(a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d === 0 || d > GRAPH_GRAVITY_RANGE) return;
      const f = (1 - d / GRAPH_GRAVITY_RANGE) * GRAPH_GRAVITY_K;
      a.vx += (dx / d) * f;
      a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f;
      b.vy -= (dy / d) * f;
    }

    function applyNodePull(a, b, wa, wb) {
      const dx = wb.x - wa.x;
      const dy = wb.y - wa.y;
      const d = Math.hypot(dx, dy);
      if (d === 0) return;
      const pull = (1 - d / NODE_GRAVITY_RANGE) * NODE_GRAVITY_K;
      const ra = rootOf(a);
      const rb = rootOf(b);
      if (ra === rb) return;
      ra.vx += (dx / d) * pull;
      ra.vy += (dy / d) * pull;
      rb.vx -= (dx / d) * pull;
      rb.vy -= (dy / d) * pull;
    }

    function mergeNodes(a, b, na, nb) {
      const parent = a.nodes.length >= b.nodes.length ? a : b;
      const child = parent === a ? b : a;
      const parentNode = parent === a ? na : nb;
      const childNode = parent === a ? nb : na;

      const childRootCount = rootOf(child).mergeCount;
      child.parent = parent;
      child.pivotParent = parent.nodes.indexOf(parentNode);
      child.pivotThis = child.nodes.indexOf(childNode);
      child.depth = parent.depth + 1;
      alignChildToPivot(child);
      const root = rootOf(parent);
      setAssemblyMergeCount(root, Math.max(root.mergeCount, childRootCount) + 1);
      if (root.mergeCount >= MAX_MERGES) markDying(root);
      const pw = worldOf(parent, parentNode);
      S.flashes.push(new Flash(pw.x, pw.y));
    }

    function lockBodies(parent, child) {
      const pPivot = child.pivotParent;
      const cPivot = child.pivotThis;

      const remap = new Array(child.nodes.length).fill(-1);
      remap[cPivot] = pPivot;
      const start = parent.nodes.length;
      let counter = 0;
      for (let i = 0; i < child.nodes.length; i++) {
        if (i === cPivot) continue;
        remap[i] = start + counter++;
        const n = child.nodes[i];
        const w = worldOf(child, n);
        const lx = w.x - parent.x;
        const ly = w.y - parent.y;
        parent.nodes.push({
          ...n,
          dx: rotX(-parent.angle, lx, ly),
          dy: rotY(-parent.angle, lx, ly)
        });
      }

      for (const [i, j] of child.edges) {
        parent.edges.push([remap[i], remap[j]]);
      }

      for (const d of S.graphs) {
        if (d.parent === child) {
          d.parent = parent;
          d.pivotParent = remap[d.pivotParent];
          d.depth = parent.depth + 1;
        }
      }

      const massA = parent.nodes.length;
      const massB = child.nodes.length;
      parent.vx = (massA * parent.vx + massB * child.vx) / (massA + massB);
      parent.vy = (massA * parent.vy + massB * child.vy) / (massA + massB);
      const lockRoot = rootOf(parent);
      setAssemblyMergeCount(lockRoot, lockRoot.mergeCount + 1);
      if (lockRoot.mergeCount >= MAX_MERGES) markDying(lockRoot);
      child.alive = false;
      const pw = worldOf(parent, parent.nodes[pPivot]);
      S.flashes.push(new Flash(pw.x, pw.y));
    }

    function rotateToMergeAndLock(parent, child, pNode, cNode) {
      const pw = worldOf(parent, parent.nodes[child.pivotParent]);
      const ca = worldOf(parent, pNode);
      const cb = worldOf(child, cNode);
      child.angle += Math.atan2(ca.y - pw.y, ca.x - pw.x) - Math.atan2(cb.y - pw.y, cb.x - pw.x);
      alignChildToPivot(child);
      lockBodies(parent, child);
    }

    function distPointSeg(px, py, ax, ay, bx, by) {
      const abx = bx - ax;
      const aby = by - ay;
      const l2 = abx * abx + aby * aby;
      let t = l2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + abx * t;
      const cy = ay + aby * t;
      const dx = px - cx;
      const dy = py - cy;
      return { d: Math.hypot(dx, dy), nx: dx, ny: dy };
    }

    function distSegSeg(a1, a2, b1, b2) {
      const rx = a2.x - a1.x;
      const ry = a2.y - a1.y;
      const sx = b2.x - b1.x;
      const sy = b2.y - b1.y;
      const rxs = rx * sy - ry * sx;
      const qpx = b1.x - a1.x;
      const qpy = b1.y - a1.y;

      let best = null;
      if (Math.abs(rxs) < 1e-9) {
        best = distPointSeg(a1.x, a1.y, b1.x, b1.y, b2.x, b2.y);
        let c = distPointSeg(a2.x, a2.y, b1.x, b1.y, b2.x, b2.y);
        if (c.d < best.d) best = c;
        c = distPointSeg(b1.x, b1.y, a1.x, a1.y, a2.x, a2.y);
        if (c.d < best.d) best = c;
        c = distPointSeg(b2.x, b2.y, a1.x, a1.y, a2.x, a2.y);
        if (c.d < best.d) best = c;
        return best;
      }

      const t = (qpx * sy - qpy * sx) / rxs;
      const u = (qpx * ry - qpy * rx) / rxs;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return { d: 0, nx: a1.x - b1.x, ny: a1.y - b1.y };
      }

      best = distPointSeg(a1.x, a1.y, b1.x, b1.y, b2.x, b2.y);
      let c = distPointSeg(a2.x, a2.y, b1.x, b1.y, b2.x, b2.y);
      if (c.d < best.d) best = c;
      c = distPointSeg(b1.x, b1.y, a1.x, a1.y, a2.x, a2.y);
      if (c.d < best.d) best = c;
      c = distPointSeg(b2.x, b2.y, a1.x, a1.y, a2.x, a2.y);
      if (c.d < best.d) best = c;
      return best;
    }

    function subtreeNodes(root) {
      let count = 0;
      for (const g of S.graphs) {
        if (rootOf(g) === root) count += g.nodes.length;
      }
      return count;
    }

    function assemblyNodes(root) {
      const out = [];
      for (const g of S.graphs) {
        if (rootOf(g) !== root) continue;
        for (const n of g.nodes) out.push(worldOf(g, n));
      }
      return out;
    }

    function assemblyEdges(root) {
      const out = [];
      for (const g of S.graphs) {
        if (rootOf(g) !== root) continue;
        for (const [i, j] of g.edges) {
          out.push([worldOf(g, g.nodes[i]), worldOf(g, g.nodes[j])]);
        }
      }
      return out;
    }

    function collideAssemblies(ra, rb) {
      const nodesA = assemblyNodes(ra);
      const nodesB = assemblyNodes(rb);
      const edgesA = assemblyEdges(ra);
      const edgesB = assemblyEdges(rb);

      const nodeT = NODE_RADIUS + COLLISION_MARGIN;
      const edgeT = NODE_RADIUS + COLLISION_MARGIN;

      let bestSep = 0;
      let bx = 0;
      let by = 0;

      function consider(nx, ny, sep) {
        if (sep <= bestSep) return;
        const d = Math.hypot(nx, ny);
        if (d < 1e-6) return;
        bestSep = sep;
        bx = nx / d;
        by = ny / d;
      }

      for (const a of nodesA) {
        for (const b of nodesB) {
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          consider(dx, dy, nodeT - Math.hypot(dx, dy));
        }
      }
      for (const a of nodesA) {
        for (const e of edgesB) {
          const r = distPointSeg(a.x, a.y, e[0].x, e[0].y, e[1].x, e[1].y);
          if (r.d < 1e-4) {
            const ex = e[1].x - e[0].x;
            const ey = e[1].y - e[0].y;
            const el = Math.hypot(ex, ey) || 1;
            consider(-ey / el, ex / el, edgeT - r.d);
          } else {
            consider(r.nx, r.ny, edgeT - r.d);
          }
        }
      }
      for (const b of nodesB) {
        for (const e of edgesA) {
          const r = distPointSeg(b.x, b.y, e[0].x, e[0].y, e[1].x, e[1].y);
          if (r.d < 1e-4) {
            const ex = e[1].x - e[0].x;
            const ey = e[1].y - e[0].y;
            const el = Math.hypot(ex, ey) || 1;
            consider(ey / el, -ex / el, edgeT - r.d);
          } else {
            consider(-r.nx, -r.ny, edgeT - r.d);
          }
        }
      }
      for (const e1 of edgesA) {
        for (const e2 of edgesB) {
          const r = distSegSeg(e1[0], e1[1], e2[0], e2[1]);
          const mx = e1[0].x + e1[1].x - e2[0].x - e2[1].x;
          const my = e1[0].y + e1[1].y - e2[0].y - e2[1].y;
          const dx1 = e1[1].x - e1[0].x;
          const dy1 = e1[1].y - e1[0].y;
          const dx2 = e2[1].x - e2[0].x;
          const dy2 = e2[1].y - e2[0].y;
          if (r.d < 1e-4 && Math.abs(dx1 * dy2 - dy1 * dx2) > 1e-6) {
            if (Math.hypot(mx, my) < 1e-6) {
              const el = Math.hypot(dx1, dy1) || 1;
              consider(-dy1 / el, dx1 / el, COLLISION_MARGIN + CROSSING_BOOST);
            } else {
              consider(mx, my, COLLISION_MARGIN + CROSSING_BOOST);
            }
          } else if (r.d < COLLISION_MARGIN) {
            consider(mx, my, COLLISION_MARGIN - r.d);
          }
        }
      }

      if (bestSep <= 0) return;
      const ux = bx;
      const uy = by;
      const m1 = subtreeNodes(ra);
      const m2 = subtreeNodes(rb);
      const tm = m1 + m2;
      const shift = bestSep + 0.5;
      ra.x += ux * shift * (m2 / tm);
      ra.y += uy * shift * (m2 / tm);
      rb.x -= ux * shift * (m1 / tm);
      rb.y -= uy * shift * (m1 / tm);

      const rel = (ra.vx - rb.vx) * ux + (ra.vy - rb.vy) * uy;
      if (rel < 0) {
        const impulse = (2 * rel) / tm;
        ra.vx -= impulse * m2 * ux;
        ra.vy -= impulse * m2 * uy;
        rb.vx += impulse * m1 * ux;
        rb.vy += impulse * m1 * uy;
      }
    }

    function relaxAssembly(root) {
      const members = S.graphs.filter((g) => g.alive && rootOf(g) === root);

      for (const g of members) {
        for (let i = 0; i < g.nodes.length; i++) {
          if (i === g.pivotThis) continue;
          g.nodes[i].nvx *= DAMP;
          g.nodes[i].nvy *= DAMP;
        }
      }

      for (const g of members) {
        for (const [i, j] of g.edges) {
          if (i === g.pivotThis || j === g.pivotThis) continue;
          const a = g.nodes[i];
          const b = g.nodes[j];
          const dx = b.dx - a.dx;
          const dy = b.dy - a.dy;
          const d = Math.hypot(dx, dy) || 1;
          const f = SPRING_K * (d - BOND_LENGTH);
          const ux = dx / d;
          const uy = dy / d;
          a.nvx += ux * f;
          a.nvy += uy * f;
          b.nvx -= ux * f;
          b.nvy -= uy * f;
        }
      }

      for (let gi = 0; gi < members.length; gi++) {
        const g = members[gi];
        for (let gj = gi; gj < members.length; gj++) {
          const h = members[gj];
          for (let i = 0; i < g.nodes.length; i++) {
            if (i === g.pivotThis) continue;
            const a = g.nodes[i];
            for (let j = 0; j < h.nodes.length; j++) {
              if (j === h.pivotThis) continue;
              if (g === h && j <= i) continue;
              const b = h.nodes[j];
              let dx;
              let dy;
              if (g === h) {
                dx = a.dx - b.dx;
                dy = a.dy - b.dy;
              } else {
                const wa = worldOf(g, a);
                const wb = worldOf(h, b);
                dx = wa.x - wb.x;
                dy = wa.y - wb.y;
              }
              const d = Math.hypot(dx, dy) || 1;
              if (d >= REPULSE_RANGE) continue;
              const f = REPULSION_K * (1 - d / REPULSE_RANGE);
              let ux = dx / d;
              let uy = dy / d;
              if (d < 1e-6) {
                const da = rand(0, Math.PI * 2);
                ux = Math.cos(da);
                uy = Math.sin(da);
              }
              if (g === h) {
                a.nvx += ux * f;
                a.nvy += uy * f;
                b.nvx -= ux * f;
                b.nvy -= uy * f;
              } else {
                const lax = rotX(-g.angle, ux, uy);
                const lay = rotY(-g.angle, ux, uy);
                const lbx = rotX(-h.angle, -ux, -uy);
                const lby = rotY(-h.angle, -ux, -uy);
                a.nvx += lax * f;
                a.nvy += lay * f;
                b.nvx += lbx * f;
                b.nvy += lby * f;
              }
            }
          }
        }
      }

      for (const g of members) {
        for (let i = 0; i < g.nodes.length; i++) {
          if (i === g.pivotThis) continue;
          const n = g.nodes[i];
          const sp = Math.hypot(n.nvx, n.nvy);
          if (sp > MAX_NODE_SPEED) {
            n.nvx = (n.nvx / sp) * MAX_NODE_SPEED;
            n.nvy = (n.nvy / sp) * MAX_NODE_SPEED;
          }
          n.dx += n.nvx;
          n.dy += n.nvy;
        }
      }
    }

    function assemblyBounds(root) {
      const pts = [];
      for (const g of S.graphs) {
        if (rootOf(g) !== root) continue;
        for (const n of g.nodes) pts.push(worldOf(g, n));
      }
      let cx = 0;
      let cy = 0;
      for (const p of pts) {
        cx += p.x;
        cy += p.y;
      }
      cx /= pts.length;
      cy /= pts.length;
      let r = 0;
      for (const p of pts) r = Math.max(r, Math.hypot(p.x - cx, p.y - cy));
      return { x: cx, y: cy, r: r + 8 };
    }

    function dissolveAssembly(root) {
      const b = assemblyBounds(root);
      for (const d of S.graphs) {
        if (isAncestorOf(root, d)) d.alive = false;
      }
      return { x: b.x, y: b.y };
    }

    function spawnGraph(cx, cy) {
      if (S.graphs.length >= MAX_GRAPHS) return;
      S.graphs.push(new Graph(cx, cy));
    }

    function spawnFromEdge() {
      if (S.graphs.length >= MAX_GRAPHS) return;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      const margin = SPAWN_MARGIN;
      const side = Math.floor(rand(0, 4));
      let x, y, angle;
      if (side === 0) {
        x = rand(-margin, w + margin);
        y = -margin;
        angle = rand(Math.PI * 0.15, Math.PI * 0.85);
      } else if (side === 1) {
        x = rand(-margin, w + margin);
        y = h + margin;
        angle = rand(Math.PI * 1.15, Math.PI * 1.85);
      } else if (side === 2) {
        x = -margin;
        y = rand(-margin, h + margin);
        angle = rand(-Math.PI * 0.35, Math.PI * 0.35);
      } else {
        x = w + margin;
        y = rand(-margin, h + margin);
        angle = rand(Math.PI * 0.65, Math.PI * 1.35);
      }
      const g = new Graph(x, y);
      const speed = rand(SPAWN_SPEED_MIN, SPAWN_SPEED_MAX);
      g.vx = Math.cos(angle) * speed;
      g.vy = Math.sin(angle) * speed;
      S.graphs.push(g);
    }

    function kickToNearest(g) {
      const r = rootOf(g);
      let nearest = null;
      let best = Infinity;
      for (const other of S.graphs) {
        if (other === g) continue;
        const ro = rootOf(other);
        if (ro === r) continue;
        const d = Math.hypot(ro.x - r.x, ro.y - r.y);
        if (d < best) {
          best = d;
          nearest = ro;
        }
      }
      if (nearest) {
        const angle = Math.atan2(nearest.y - r.y, nearest.x - r.x);
        const speed = rand(KICK_SPEED_MIN, KICK_SPEED_MAX);
        r.vx += Math.cos(angle) * speed;
        r.vy += Math.sin(angle) * speed;
      }
    }

    function sizeCanvas() {
      const scale = global.devicePixelRatio || 1;
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      canvas.width = width * scale;
      canvas.height = height * scale;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }

    function step() {
      if (destroyed) return;
      ctx.fillStyle = opts.backgroundColor;
      ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

      if (opts.autoSpawn) {
        S.spawnTimer--;
        if (S.spawnTimer <= 0) {
          spawnFromEdge();
          S.spawnTimer = Math.floor(rand(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_MAX));
        }
      }

      for (const g of S.graphs) {
        if (g.alive && !g.parent && !g.dying) relaxAssembly(g);
      }

      const order = [...S.graphs].sort((p, q) => p.depth - q.depth);
      for (const g of order) {
        if (!g.alive) continue;
        if (g.parent) {
          if (!g.parent.alive) {
            g.alive = false;
            continue;
          }
          g.vx = g.parent.vx;
          g.vy = g.parent.vy;
          alignChildToPivot(g);
        } else if (g.dying) {
          g.vx = 0;
          g.vy = 0;
        } else {
          g.update();
        }
      }

      for (let i = 0; i < S.graphs.length; i++) {
        for (let j = i + 1; j < S.graphs.length; j++) {
          const a = S.graphs[i];
          const b = S.graphs[j];
          if (!a.alive || !b.alive) continue;

          if (isAncestorOf(a, b) || isAncestorOf(b, a)) {
            if (a.parent === b || b.parent === a) {
              if (rootOf(a).mergeCount >= MAX_MERGES || rootOf(b).mergeCount >= MAX_MERGES) continue;
              const parent = a.parent === b ? b : a;
              const child = a.parent === b ? a : b;
              const { na, nb, d } = closestNodePair(a, b, true);
              if (d < NODE_MERGE_DISTANCE) {
                rotateToMergeAndLock(parent, child, parent === a ? na : nb, parent === a ? nb : na);
              }
            }
            continue;
          }

          const ra = rootOf(a);
          const rb = rootOf(b);
          if (ra === rb) continue;

          if (a !== ra || b !== rb) continue;

          if (ra.dying || rb.dying) continue;

          applyRootGravity(ra, rb);

          const { ga, ia, gb, ib, d, wa, wb } = closestAssemblyPair(ra, rb);
          if (d < NODE_MERGE_DISTANCE) {
            mergeNodes(ga, gb, ga.nodes[ia], gb.nodes[ib]);
          } else {
            if (d < NODE_GRAVITY_RANGE) {
              applyNodePull(ga, gb, wa, wb);
            }
            collideAssemblies(ra, rb);
          }
        }
      }

      const respawnQueue = [];
      for (const g of S.graphs) {
        if (!g.alive) continue;
        if (g.parent) {
          if (!g.parent.alive) g.alive = false;
        } else if (g.dying) {
          g.fadeAge++;
          if (g.fadeAge >= GLOW_FRAMES + FADE_FRAMES) {
            const pos = dissolveAssembly(g);
            if (pos) respawnQueue.push(pos);
          }
        } else if (g.offScreen()) {
          for (const d of S.graphs) {
            if (isAncestorOf(g, d)) d.alive = false;
          }
        }
      }

      S.graphs = S.graphs.filter((g) => g.alive);

      for (const pos of respawnQueue) spawnGraph(pos.x, pos.y);

      for (const g of S.graphs) {
        if (g.parent) alignChildToPivot(g);
      }

      for (const g of S.graphs) g.draw();

      for (const f of S.flashes) f.update();
      for (const f of S.flashes) f.draw();
      S.flashes = S.flashes.filter((f) => f.age < f.maxAge);

      scheduleFrame();
    }

    /*---------------------- lifecycle---------------------- */

    function onResize() {
      sizeCanvas();
    }

    function onPointerDown(event) {
      if (!opts.interactive) return;
      const rect = canvas.getBoundingClientRect();
      const cx = event.clientX - rect.left;
      const cy = event.clientY - rect.top;
      let hit = null;
      let best = Infinity;
      for (const g of S.graphs) {
        if (g.parent) continue;
        const b = assemblyBounds(g);
        const d = Math.hypot(b.x - cx, b.y - cy);
        if (d < b.r && d < best) {
          best = d;
          hit = g;
        }
      }
      if (hit) {
        kickToNearest(hit);
      } else {
        spawnGraph(cx, cy);
      }
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
        listenTarget.addEventListener("pointerdown", onPointerDown);
      }
      if (opts.autoSpawn) {
        for (let i = 0; i < opts.seedCount; i++) spawnFromEdge();
      }
      scheduleFrame();
    }

    function destroy() {
      destroyed = true;
      if (rafId && global.cancelAnimationFrame) global.cancelAnimationFrame(rafId);
      rafId = 0;
      global.removeEventListener("resize", onResize);
      if (listenTarget) listenTarget.removeEventListener("pointerdown", onPointerDown);
    }

    start();

    return {
      canvas: canvas,
      destroy: destroy,
      sim: {
        state: S,
        reset() { S.graphs = []; S.flashes = []; S.spawnTimer = opts.spawnInitialDelay; },
        step,
        rand,
        Graph,
        Flash,
        worldOf,
        rootOf,
        isAncestorOf,
        setAssemblyMergeCount,
        markDying,
        closestAssemblyPair,
        closestNodePair,
        alignChildToPivot,
        applyRootGravity,
        applyNodePull,
        mergeNodes,
        lockBodies,
        rotateToMergeAndLock,
        distPointSeg,
        distSegSeg,
        subtreeNodes,
        assemblyNodes,
        assemblyEdges,
        collideAssemblies,
        relaxAssembly,
        assemblyBounds,
        dissolveAssembly,
        spawnGraph,
        spawnFromEdge,
        kickToNearest,
        BOND_LENGTH,
        NODE_RADIUS,
        NODE_MERGE_DISTANCE,
        MAX_MERGES,
        GLOW_FRAMES,
        FADE_FRAMES,
        COLLISION_MARGIN,
        CROSSING_BOOST
      }
    };
  }

  /*---------------------- helpers---------------------- */

  function toElement(target) {
    if (target == null) return null;
    return typeof target === "string" ? document.querySelector(target) : target;
  }

  function makeCanvas(container, className) {
    const canvas = document.createElement("canvas");
    canvas.className = "mg-canvas " + className;
    canvas.setAttribute("aria-hidden", "true");
    container.appendChild(canvas);
    return canvas;
  }

  function px(value) {
    return typeof value === "number" ? value + "px" : value;
  }

  /* Fullscreen background behind page content. target: selector, element, or null.
     null => appends a fixed viewport-sized canvas to <body>. Decorative (no click
     handling) unless opts.interactive is explicitly true. */
  function background(target, options) {
    const opts = Object.assign({}, options);
    const interactive = opts.interactive === true;
    const container = toElement(target) || document.body;
    const canvas = makeCanvas(container, "mg-background");
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
    box.className = "mg-widget";
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
    const canvas = makeCanvas(box, "mg-widget-canvas");
    const s = canvas.style;
    s.display = "block";
    s.width = "100%";
    s.height = "100%";
    s.opacity = opts.opacity != null ? opts.opacity : 1;
    return create(canvas, Object.assign({ listenOnWindow: false }, opts));
  }

  global.MolecularGraphs = {
    create: create,
    background: background,
    widget: widget
  };
})(typeof window !== "undefined" ? window : this);
