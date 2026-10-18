// Canvas animations for the landing page: the hero globe and the tracking "tunnel".
import landTopoUrl from "@/assets/test-landing/land-110m.json?url";

type Vec3 = [number, number, number];

interface City {
  n: string;
  v: Vec3;
}
interface Arc {
  A: Vec3;
  B: Vec3;
  ang: number;
  t0: number;
  dur: number;
  landed?: boolean;
}
interface Pulse {
  i: number;
  t0: number;
}
interface GlobeState {
  pts: Float32Array | null;
  arcs: Arc[];
  pulses: Pulse[];
  rot: number;
  last: number;
  nextArc: number;
  dpr: number;
  w: number;
  h: number;
  cities: City[];
}
interface Topology {
  transform: { scale: [number, number]; translate: [number, number] };
  arcs: [number, number][][];
  objects: {
    land: { geometries: { type: string; arcs: number[][] | number[][][] }[] };
  };
}
interface Packet {
  t0: number;
  lane: number;
  d: number;
}
interface Watcher {
  u: number;
  top: boolean;
  ph: number;
  sp: number;
}
interface TunnelState {
  packets: Packet[];
  watchers: Watcher[];
  next: number;
}

export interface CanvasOptions {
  globe: HTMLCanvasElement | null;
  tunnel: HTMLCanvasElement | null;
  reduce: boolean;
  globeSpeed?: number;
  arcCount?: number;
  cityLabels?: boolean;
}

const CITIES: [string, number, number][] = [
  ["São Paulo", -23.55, -46.63], ["Montreal", 45.5, -73.57], ["Toronto", 43.65, -79.38], ["Santiago", -33.45, -70.67],
  ["Querétaro", 20.59, -100.39], ["San Juan", 18.47, -66.11], ["Ashburn", 39.04, -77.49], ["Secaucus", 40.79, -74.06],
  ["Boardman", 45.84, -119.7], ["Brussels", 50.85, 4.35], ["Prague", 50.08, 14.44], ["Lappeenranta", 61.06, 28.19],
  ["Paris", 48.86, 2.35], ["Frankfurt", 50.11, 8.68], ["Budapest", 47.5, 19.04], ["Dublin", 53.35, -6.26],
  ["Milan", 45.46, 9.19], ["Warsaw", 52.23, 21.01], ["Moscow", 55.75, 37.62], ["Madrid", 40.42, -3.7],
  ["Stockholm", 59.33, 18.07], ["Zurich", 47.37, 8.54], ["Groningen", 53.22, 6.57], ["London", 51.51, -0.13],
  ["Accra", 5.6, -0.19], ["Nairobi", -1.29, 36.82], ["Lagos", 6.52, 3.38], ["Cape Town", -33.92, 18.42],
  ["Johannesburg", -26.2, 28.05], ["Sydney", -33.87, 151.21], ["Melbourne", -37.81, 144.96], ["Hong Kong", 22.32, 114.17],
  ["Mumbai", 19.08, 72.88], ["Jakarta", -6.2, 106.85], ["Tel Aviv", 32.09, 34.78], ["Tokyo", 35.68, 139.69],
  ["Osaka", 34.69, 135.5], ["Kuala Lumpur", 3.14, 101.69], ["Auckland", -36.85, 174.76], ["Doha", 25.29, 51.53],
  ["Singapore", 1.35, 103.82], ["Seoul", 37.57, 126.98], ["Taipei", 25.03, 121.57], ["Bangkok", 13.75, 100.5],
];

function ll(lat: number, lon: number): Vec3 {
  const a = (lat * Math.PI) / 180;
  const b = (lon * Math.PI) / 180;
  return [Math.cos(a) * Math.cos(b), Math.sin(a), -Math.cos(a) * Math.sin(b)];
}

function proj(v: Vec3, cosA: number, sinA: number, cosT: number, sinT: number): Vec3 {
  const x1 = v[0] * cosA + v[2] * sinA;
  const z1 = -v[0] * sinA + v[2] * cosA;
  const y2 = v[1] * cosT - z1 * sinT;
  const z2 = v[1] * sinT + z1 * cosT;
  return [x1, y2, z2];
}

function buildDots(topo: Topology | null, count: number): Float32Array {
  const W = 2048;
  const H = 1024;
  let mask: Uint8ClampedArray | null = null;
  if (topo) {
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const x = cv.getContext("2d");
    if (x) {
      const [sx, sy] = topo.transform.scale;
      const [tx, ty] = topo.transform.translate;
      const arcs = topo.arcs.map((a) => {
        let px = 0;
        let py = 0;
        return a.map(([dx, dy]) => {
          px += dx;
          py += dy;
          return [px * sx + tx, py * sy + ty] as [number, number];
        });
      });
      const ap = (i: number) => (i >= 0 ? arcs[i] : arcs[~i].slice().reverse());
      const ring = (ids: number[]) => {
        const p: [number, number][] = [];
        ids.forEach((i, k) => {
          const a = ap(i);
          p.push(...(k ? a.slice(1) : a));
        });
        return p;
      };
      const polys: number[][][] = [];
      topo.objects.land.geometries.forEach((g) => {
        if (g.type === "Polygon") polys.push(g.arcs as number[][]);
        else if (g.type === "MultiPolygon") polys.push(...(g.arcs as number[][][]));
      });
      x.fillStyle = "#fff";
      polys.forEach((poly) => {
        x.beginPath();
        poly.forEach((r) =>
          ring(r).forEach(([lo, la], k) => {
            const X = ((lo + 180) / 360) * W;
            const Y = ((90 - la) / 180) * H;
            if (k) x.lineTo(X, Y);
            else x.moveTo(X, Y);
          }),
        );
        x.fill("evenodd");
      });
      mask = x.getImageData(0, 0, W, H).data;
    }
  }
  const N = count;
  const out: number[] = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - ((i + 0.5) * 2) / N;
    const r = Math.sqrt(1 - y * y);
    const ph = i * ga;
    const x = Math.cos(ph) * r;
    const z = Math.sin(ph) * r;
    const lat = (Math.asin(y) * 180) / Math.PI;
    const lon = (Math.atan2(-z, x) * 180) / Math.PI;
    if (lat < -60) continue;
    if (mask) {
      const X = Math.min(W - 1, Math.floor(((lon + 180) / 360) * W));
      const Y = Math.min(H - 1, Math.floor(((90 - lat) / 180) * H));
      if (!mask[(Y * W + X) * 4]) continue;
    } else if (i % 3) continue;
    out.push(x, y, z);
  }
  return new Float32Array(out);
}

/** Fewer dots on phones and low-power devices keeps the per-frame canvas work light. */
function dotCount(): number {
  const small = window.innerWidth < 700;
  const lowPower = (navigator.hardwareConcurrency ?? 8) <= 4;
  return small || lowPower ? 28000 : 80000;
}

function drawGlobe(
  g: GlobeState,
  c: HTMLCanvasElement,
  t: number,
  opts: CanvasOptions,
) {
  if (!g.w) return;
  const rect = c.getBoundingClientRect();
  if (rect.bottom < 0 || rect.top > window.innerHeight) return; // off-screen
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const { dpr, w, h } = g;
  const dt = g.last ? Math.min(50, t - g.last) : 16;
  g.last = t;
  const speed = (opts.globeSpeed ?? 1) * (opts.reduce ? 0 : 1);
  g.rot += dt * 0.00005 * speed;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const R = Math.max(230, Math.min(w * 0.36, h * 0.5, 560));
  const cx = w / 2;
  const cy = h * (w > 900 ? 1.06 : 1.0);
  const tilt = 0.62;
  const cosA = Math.cos(g.rot);
  const sinA = Math.sin(g.rot);
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);
  const halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.18);
  halo.addColorStop(0, "rgba(245,102,15,0)");
  halo.addColorStop(0.45, "rgba(245,102,15,0.10)");
  halo.addColorStop(1, "rgba(245,102,15,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2);
  ctx.fill();
  const body = ctx.createRadialGradient(cx, cy - R * 0.6, R * 0.1, cx, cy, R);
  body.addColorStop(0, "#1c3566");
  body.addColorStop(1, "#13284f");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,170,120,0.25)";
  ctx.lineWidth = 1;
  ctx.stroke();
  const P = g.pts;
  if (P) {
    const s = Math.max(1.3, R / 330);
    ctx.fillStyle = "#a9bbe3";
    for (let i = 0; i < P.length; i += 3) {
      const x1 = P[i] * cosA + P[i + 2] * sinA;
      const z1 = -P[i] * sinA + P[i + 2] * cosA;
      const z2 = P[i + 1] * sinT + z1 * cosT;
      if (z2 <= 0.02) continue;
      const y2 = P[i + 1] * cosT - z1 * sinT;
      const sy = cy - y2 * R;
      if (sy < -4 || sy > h + 4) continue;
      ctx.globalAlpha = 0.3 + 0.65 * z2;
      ctx.fillRect(cx + x1 * R - s / 2, sy - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
  const scr = (p: Vec3): [number, number] => [cx + p[0] * R, cy - p[1] * R];
  const vis = (p: Vec3) => p[2] > 0 || p[0] * p[0] + p[1] * p[1] > 1;
  const cities = g.cities;
  const front = cities
    .map((ci, i) => ({ i, p: proj(ci.v, cosA, sinA, cosT, sinT) }))
    .filter((o) => o.p[2] > 0.25 && cy - o.p[1] * R > 120);
  const maxArcs = opts.arcCount ?? 4;
  if (t > g.nextArc && front.length > 1 && g.arcs.length < maxArcs && !opts.reduce) {
    const a = front[Math.floor(Math.random() * front.length)];
    let b = front[Math.floor(Math.random() * front.length)];
    if (b.i === a.i) b = front[(front.indexOf(b) + 1) % front.length];
    const A = cities[a.i].v;
    const B = cities[b.i].v;
    const ang = Math.acos(Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])));
    if (ang > 0.12) {
      g.arcs.push({ A, B, ang, t0: t, dur: 1800 + ang * 900 });
      g.pulses.push({ i: a.i, t0: t });
    }
    g.nextArc = t + 500 + Math.random() * 900;
  }
  g.arcs = g.arcs.filter((arc) => {
    const e = (t - arc.t0) / arc.dur;
    if (e > 1.6) return false;
    if (e >= 1 && !arc.landed) {
      arc.landed = true;
      g.pulses.push({ i: cities.findIndex((ci) => ci.v === arc.B), t0: t });
    }
    const head = Math.min(1, e);
    const tail = Math.max(0, Math.min(1, (e - 0.55) / 1.05));
    const hgt = 0.06 + (0.32 * arc.ang) / Math.PI;
    const so = Math.sin(arc.ang);
    const N = 48;
    let prev: { sp: [number, number]; ok: boolean } | null = null;
    for (let k = 0; k <= N; k++) {
      const u = tail + ((head - tail) * k) / N;
      const f1 = Math.sin((1 - u) * arc.ang) / so;
      const f2 = Math.sin(u * arc.ang) / so;
      const lift = 1 + hgt * Math.sin(Math.PI * u);
      const v: Vec3 = [
        (arc.A[0] * f1 + arc.B[0] * f2) * lift,
        (arc.A[1] * f1 + arc.B[1] * f2) * lift,
        (arc.A[2] * f1 + arc.B[2] * f2) * lift,
      ];
      const p = proj(v, cosA, sinA, cosT, sinT);
      const sp = scr(p);
      const ok = vis(p);
      if (prev && ok && prev.ok) {
        const al = (k / N) * (e > 1 ? Math.max(0, 1 - (e - 1) / 0.6) : 1);
        ctx.strokeStyle = "rgba(255,140,70," + (0.15 + 0.85 * al).toFixed(3) + ")";
        ctx.lineWidth = 1 + 1.2 * al;
        ctx.beginPath();
        ctx.moveTo(prev.sp[0], prev.sp[1]);
        ctx.lineTo(sp[0], sp[1]);
        ctx.stroke();
      }
      if (k === N && e < 1 && ok) {
        ctx.fillStyle = "#ffd2b3";
        ctx.beginPath();
        ctx.arc(sp[0], sp[1], 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      prev = { sp, ok };
    }
    return true;
  });
  if (!opts.reduce && Math.random() < 0.012 && front.length) {
    g.pulses.push({ i: front[Math.floor(Math.random() * front.length)].i, t0: t });
  }
  const lit: Record<number, number> = {};
  g.pulses = g.pulses.filter((pl) => {
    const e = (t - pl.t0) / 2600;
    if (e > 1) return false;
    lit[pl.i] = Math.max(lit[pl.i] || 0, e < 1 ? 1 - e : 0);
    return true;
  });
  ctx.font = '600 12px "Plus Jakarta Sans", system-ui, sans-serif';
  cities.forEach((ci, i) => {
    const p = proj(ci.v, cosA, sinA, cosT, sinT);
    if (p[2] <= 0.05) return;
    const [x, y] = scr(p);
    if (y > h) return;
    const l = lit[i] || 0;
    ctx.globalAlpha = 0.35 + 0.65 * p[2];
    ctx.fillStyle = l ? "#ffb489" : "#f5660f";
    ctx.beginPath();
    ctx.arc(x, y, 2.2 + l * 1.6, 0, Math.PI * 2);
    ctx.fill();
    g.pulses.forEach((pl) => {
      if (pl.i !== i) return;
      const e = (t - pl.t0) / 2600;
      ctx.strokeStyle = "rgba(245,102,15," + (0.9 * (1 - e)).toFixed(3) + ")";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 3 + e * 22, 0, Math.PI * 2);
      ctx.stroke();
    });
    if (l > 0.15 && (opts.cityLabels ?? true) && p[2] > 0.3) {
      ctx.globalAlpha = Math.min(1, l * 1.6) * (0.4 + 0.6 * p[2]);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(ci.n, x + 10, y - 8);
    }
    ctx.globalAlpha = 1;
  });
}

function drawTunnel(tn: TunnelState, c: HTMLCanvasElement, t: number, reduce: boolean) {
  const r = c.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
  }
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const w = r.width;
  const h = r.height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const cy = h / 2 + 6;
  const x0 = 70;
  const x1 = w - 70;
  const th = 34;
  ctx.fillStyle = "rgba(245,102,15,0.07)";
  ctx.fillRect(x0, cy - th, x1 - x0, th * 2);
  ctx.strokeStyle = "rgba(245,102,15,0.75)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x0, cy - th);
  ctx.lineTo(x1, cy - th);
  ctx.moveTo(x0, cy + th);
  ctx.lineTo(x1, cy + th);
  ctx.stroke();
  (
    [
      [x0, "#ffffff"],
      [x1, "#f5660f"],
    ] as [number, string][]
  ).forEach(([x, col]) => {
    ctx.fillStyle = "#0c1a36";
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, cy, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, cy, 6, 0, Math.PI * 2);
    ctx.fill();
  });
  if (t > tn.next && !reduce) {
    tn.packets.push({ t0: t, lane: (Math.random() - 0.5) * th * 1.1, d: 2200 + Math.random() * 900 });
    tn.next = t + 260 + Math.random() * 260;
  }
  tn.packets = tn.packets.filter((p) => {
    const e = (t - p.t0) / p.d;
    if (e > 1) return false;
    const x = x0 + 26 + (x1 - x0 - 52) * e;
    ctx.fillStyle = "rgba(255,190,150," + (Math.sin(Math.PI * e) * 0.9 + 0.1).toFixed(3) + ")";
    ctx.fillRect(x - 9, cy + p.lane - 2.5, 18, 5);
    return true;
  });
  tn.watchers.forEach((wt) => {
    const x = x0 + (x1 - x0) * wt.u;
    const yW = wt.top ? cy - th - 92 : cy + th + 92;
    const k = reduce ? 0.8 : (Math.sin(t * 0.0016 * wt.sp + wt.ph) + 1) / 2;
    const edge = wt.top ? cy - th : cy + th;
    const yEnd = yW + (edge - yW) * k;
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = "rgba(155,166,191,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yW);
    ctx.lineTo(x, yEnd);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#26365b";
    ctx.strokeStyle = "rgba(155,166,191,0.7)";
    ctx.beginPath();
    ctx.arc(x, yW, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (k > 0.94) {
      ctx.strokeStyle = "rgba(245,102,15," + ((k - 0.94) / 0.06).toFixed(3) + ")";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 6, edge);
      ctx.lineTo(x + 6, edge);
      ctx.stroke();
    }
  });
}

/** Starts the globe + tunnel animation loop. Returns a cleanup function. */
export function startLandingCanvases(opts: CanvasOptions): () => void {
  let stopped = false;
  let raf = 0;
  let ro: ResizeObserver | null = null;

  let globe: GlobeState | null = null;
  const gc = opts.globe;
  if (gc) {
    const g: GlobeState = {
      pts: null,
      arcs: [],
      pulses: [],
      rot: -0.35,
      last: 0,
      nextArc: 0,
      dpr: 1,
      w: 0,
      h: 0,
      cities: CITIES.map(([n, la, lo]) => ({ n, v: ll(la, lo) })),
    };
    globe = g;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = gc.getBoundingClientRect();
      gc.width = r.width * dpr;
      gc.height = r.height * dpr;
      g.dpr = dpr;
      g.w = r.width;
      g.h = r.height;
    };
    resize();
    ro = new ResizeObserver(resize);
    ro.observe(gc);
    fetch(landTopoUrl)
      .then((r) => r.json() as Promise<Topology>)
      .then((topo) => {
        if (!stopped) g.pts = buildDots(topo, dotCount());
      })
      .catch(() => {
        if (!stopped) g.pts = buildDots(null, dotCount());
      });
  }

  let tunnel: TunnelState | null = null;
  if (opts.tunnel) {
    tunnel = { packets: [], watchers: [], next: 0 };
    for (let i = 0; i < 7; i++) {
      tunnel.watchers.push({
        u: 0.18 + i * 0.11 + (Math.random() - 0.5) * 0.04,
        top: i % 2 === 0,
        ph: Math.random() * 6.28,
        sp: 0.6 + Math.random() * 0.6,
      });
    }
  }

  const loop = (t: number) => {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    if (globe && opts.globe) drawGlobe(globe, opts.globe, t, opts);
    if (tunnel && opts.tunnel) drawTunnel(tunnel, opts.tunnel, t, opts.reduce);
  };
  raf = requestAnimationFrame(loop);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    ro?.disconnect();
  };
}
