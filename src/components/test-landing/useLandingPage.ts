import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type RefObject,
} from "react";
import { startLandingCanvases } from "./landingCanvas";

const SETTLEMENTS = [
  { name: "Retail chain data breach", meta: "Customer card and contact data", deadline: "Dec 12" },
  { name: "Health app pixel tracking", meta: "Health info shared with advertisers", deadline: "Jan 08" },
  { name: "Telecom customer exposure", meta: "Account records exposed", deadline: "Jan 30" },
  { name: "Streaming video privacy", meta: "Viewing history disclosed", deadline: "Feb 14" },
];
const SITES = [
  "news-daily.example/world",
  "recipes.example/pasta",
  "shop.example/shoes",
  "travel.example/guides",
];
const MODES = ["Reject non-essential", "Accept necessary only"];
const BOARD: [string, string, string][] = [
  ["BR", "Brazil", "São Paulo"], ["CZ", "Czech Republic", "Prague"], ["PL", "Poland", "Warsaw"],
  ["GH", "Ghana", "Accra"], ["ID", "Indonesia", "Jakarta"], ["KR", "South Korea", "Seoul"],
  ["PR", "Puerto Rico", "San Juan"], ["HU", "Hungary", "Budapest"], ["CH", "Switzerland", "Zurich"],
  ["AU", "Australia", "Sydney · Melbourne"], ["NZ", "New Zealand", "Auckland"], ["CA", "Canada", "Montreal · Toronto"],
  ["FI", "Finland", "Lappeenranta"], ["RU", "Russia", "Moscow"], ["KE", "Kenya", "Nairobi"],
  ["IL", "Israel", "Tel Aviv"], ["TW", "Taiwan", "Taipei"], ["US", "United States", "Ashburn · Secaucus · Boardman"],
  ["IE", "Ireland", "Dublin"], ["NL", "The Netherlands", "Groningen"], ["HK", "Hong Kong", "Hong Kong"],
  ["QA", "Qatar", "Doha"], ["CL", "Chile", "Santiago"], ["FR", "France", "Paris"],
  ["ES", "Spain", "Madrid"], ["NG", "Nigeria", "Lagos"], ["JP", "Japan", "Tokyo · Osaka"],
  ["TH", "Thailand", "Bangkok"], ["BE", "Belgium", "Brussels"], ["IT", "Italy", "Milan"],
  ["GB", "United Kingdom", "London"], ["IN", "India", "Mumbai"], ["SG", "Singapore", "Singapore"],
  ["MX", "Mexico", "Querétaro City"], ["DE", "Germany", "Frankfurt"], ["SE", "Sweden", "Stockholm"],
  ["ZA", "South Africa", "Cape Town · Johannesburg"], ["MY", "Malaysia", "Kuala Lumpur"],
];

interface SettlementRow {
  name: string;
  meta: string;
  deadline: string;
  status: string;
  bg: string;
  border: string;
  pillBg: string;
  pillColor: string;
}
interface CookieMode {
  label: string;
  select: () => void;
  on: boolean;
  bg: string;
  color: string;
  border: string;
}
interface BoardRow {
  code: string;
  country: string;
  city: string;
  flag: string;
  flag2: string;
}

export interface LandingVals {
  rootRef: RefObject<HTMLDivElement>;
  globeRef: RefObject<HTMLCanvasElement>;
  tunnelRef: RefObject<HTMLCanvasElement>;
  track: (e: MouseEvent<HTMLElement>) => void;
  toggleMenu: () => void;
  closeMenu: () => void;
  trackAndClose: (e: MouseEvent<HTMLElement>) => void;
  navTransform: string;
  navDisplay: string;
  burgerDisplay: string;
  loginDisplay: string;
  menuDisplay: string;
  menuExpanded: "true" | "false";
  burgerPath: string;
  settlements: SettlementRow[];
  scanLabel: string;
  cookieModes: CookieMode[];
  cookieSite: string;
  siteOp0: number; siteOp1: number; siteOp2: number; siteOp3: number;
  siteZ0: number; siteZ1: number; siteZ2: number; siteZ3: number;
  siteTr0: string; siteTr1: string; siteTr2: string; siteTr3: string;
  bannerTransform: string;
  bannerOpacity: number;
  toastTransform: string;
  toastOpacity: number;
  toastText: string;
  boardRows: BoardRow[];
  boardTop: string;
  boardTransform: string;
  boardTransition: string;
}

type DataLayerWindow = Window & { dataLayer?: Record<string, unknown>[] };

function pushDataLayer(event: Record<string, unknown>) {
  const w = window as DataLayerWindow;
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push(event);
}

const BREAKPOINT = 1100;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia?.(REDUCED_MOTION_QUERY);
  mq?.addEventListener("change", onChange);
  return () => mq?.removeEventListener("change", onChange);
}
function getReducedMotion() {
  return Boolean(window.matchMedia?.(REDUCED_MOTION_QUERY).matches);
}

/** Live value of the user's reduced-motion preference. */
function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
}

export function useLandingPage(): LandingVals {
  const rootRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<HTMLCanvasElement>(null);
  const tunnelRef = useRef<HTMLCanvasElement>(null);

  const [navHidden, setNavHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sIdx, setSIdx] = useState(0);
  const [sPhase, setSPhase] = useState(0);
  const [cPhase, setCPhase] = useState(0);
  const [cMode, setCMode] = useState(0);
  const [siteIdx, setSiteIdx] = useState(0);
  const [bIdx, setBIdx] = useState(0);
  const [bNoTrans, setBNoTrans] = useState(false);
  const [vw, setVw] = useState(() => (typeof window === "undefined" ? 1400 : window.innerWidth));

  const reduce = usePrefersReducedMotion();

  const navHiddenRef = useRef(false);
  navHiddenRef.current = navHidden;

  const toggleMenu = useCallback(() => setMenuOpen((o) => !o), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const track = useCallback((e: MouseEvent<HTMLElement>) => {
    pushDataLayer({ event: "cta_click", cta: e.currentTarget.getAttribute("data-track") });
  }, []);

  const trackAndClose = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      track(e);
      setMenuOpen(false);
    },
    [track],
  );

  // Settlement checker: cycles Checking -> Qualify -> next.
  useEffect(() => {
    if (reduce) {
      setSPhase(1); // hold the "you may qualify" state instead of cycling
      return;
    }
    let phase = 0;
    const id = setInterval(() => {
      phase = (phase + 1) % 3;
      setSPhase(phase);
      if (phase === 0) setSIdx((i) => (i + 1) % SETTLEMENTS.length);
    }, 1300);
    return () => clearInterval(id);
  }, [reduce]);

  // Cookie-banner demo loop.
  useEffect(() => {
    if (reduce) {
      setCPhase(1); // keep the banner on screen instead of cycling
      return;
    }
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      timers.forEach(clearTimeout);
      timers = [];
      setCPhase(1);
      timers.push(setTimeout(() => { setCPhase(2); }, 1500));
      timers.push(
        setTimeout(() => { setCPhase(0); setSiteIdx((i) => (i + 1) % SITES.length); }, 3400),
      );
    };
    run();
    const id = setInterval(run, 4200);
    return () => {
      clearInterval(id);
      timers.forEach(clearTimeout);
    };
  }, [reduce]);

  // Server-location board scroller.
  useEffect(() => {
    if (reduce) return; // keep the board static
    let idx = 0;
    let reset: ReturnType<typeof setTimeout> | undefined;
    const id = setInterval(() => {
      idx += 1;
      setBIdx(idx);
      setBNoTrans(false);
      if (idx >= BOARD.length) {
        reset = setTimeout(() => {
          idx = 0;
          setBIdx(0);
          setBNoTrans(true);
        }, 800);
      }
    }, 2200);
    return () => {
      clearInterval(id);
      if (reset) clearTimeout(reset);
    };
  }, [reduce]);

  // Viewport width (drives nav layout).
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Desktop dropdown menus (hover on pointer devices, click/keyboard otherwise).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const canHover = window.matchMedia?.("(hover:hover)").matches;
    const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
    const setOpen = (dd: Element, open: boolean) => {
      dd.classList.toggle("open", open);
      dd.querySelector("button")?.setAttribute("aria-expanded", String(open));
    };
    const closeAll = (except: Element | null) =>
      root.querySelectorAll(".kvdd.open").forEach((o) => {
        if (o !== except) setOpen(o, false);
      });
    const ddOf = (t: EventTarget | null) =>
      t instanceof Element ? t.closest(".kvdd") : null;
    const onOver = (e: Event) => {
      if (!canHover) return;
      const dd = ddOf(e.target);
      if (!dd) return;
      clearTimeout(timers.get(dd));
      closeAll(dd);
      setOpen(dd, true);
    };
    const onOut = (e: MouseEvent | Event) => {
      if (!canHover) return;
      const dd = ddOf(e.target);
      const related = (e as globalThis.MouseEvent).relatedTarget;
      if (dd && !(related instanceof Node && dd.contains(related))) {
        timers.set(dd, setTimeout(() => setOpen(dd, false), 220));
      }
    };
    const onClick = (e: Event) => {
      const b = e.target instanceof Element ? e.target.closest(".kvdd > button") : null;
      if (b && b.parentElement) {
        const dd = b.parentElement;
        const open = !dd.classList.contains("open");
        closeAll(open ? dd : null);
        setOpen(dd, open);
        e.stopPropagation();
      } else {
        closeAll(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll(null);
    };
    root.addEventListener("mouseover", onOver);
    root.addEventListener("mouseout", onOut);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("mouseover", onOver);
      root.removeEventListener("mouseout", onOut);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Hide the floating nav while scrolling down.
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const d = y - lastY;
      if (y <= 80) {
        lastY = y;
        if (navHiddenRef.current) setNavHidden(false);
        return;
      }
      if (Math.abs(d) < 6) return;
      lastY = y;
      const hide = d > 0 && y > 140;
      if (hide !== navHiddenRef.current) {
        setNavHidden(hide);
        if (hide) setMenuOpen(false);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll-reveal (skipped under reduced motion; content is never left hidden).
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !("IntersectionObserver" in window)) return;
    const els = root.querySelectorAll<HTMLElement>("[data-reveal]");
    if (reduce) return;
    const vh = window.innerHeight;
    els.forEach((el) => {
      if (el.getBoundingClientRect().top < vh) return;
      el.style.opacity = "0";
      el.style.transform = "translateY(28px)";
      el.style.transition = "opacity .9s ease, transform .9s cubic-bezier(.2,.8,.2,1)";
    });
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const t = en.target as HTMLElement;
          t.style.opacity = "1";
          t.style.transform = "none";
        }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      els.forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "none";
        el.style.transition = "none";
      });
    };
  }, [reduce]);

  // section_view analytics: independent of the motion preference, fires once per section.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !("IntersectionObserver" in window)) return;
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const sec = (en.target as HTMLElement).getAttribute("data-track-section");
          if (sec && !seen.has(sec)) {
            seen.add(sec);
            pushDataLayer({ event: "section_view", section: sec });
          }
        }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    root.querySelectorAll("[data-track-section]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Globe + tunnel canvases.
  useEffect(() => {
    return startLandingCanvases({
      globe: globeRef.current,
      tunnel: tunnelRef.current,
      reduce,
    });
  }, [reduce]);

  const narrow = vw < BREAKPOINT;
  const settlements: SettlementRow[] = SETTLEMENTS.map((it, i) => {
    const on = i === sIdx;
    const status = on
      ? sPhase === 0 ? "Checking…" : "You may qualify"
      : i < sIdx ? "Reviewed" : "Open";
    const q = on && sPhase > 0;
    const rv = status === "Reviewed";
    return {
      ...it,
      status,
      bg: on ? "rgba(245,102,15,0.12)" : "rgba(255,255,255,0.03)",
      border: on ? "rgba(245,102,15,0.55)" : "rgba(255,255,255,0.08)",
      pillBg: q ? "#f5660f" : rv ? "rgba(61,220,132,0.16)" : "rgba(255,255,255,0.08)",
      pillColor: q ? "#fff" : rv ? "#3ddc84" : "#c3cbdc",
    };
  });
  const cookieModes: CookieMode[] = MODES.map((label, i) => {
    const on = i === cMode;
    return {
      label,
      select: () => setCMode(i),
      on,
      bg: on ? "#0f2040" : "transparent",
      color: on ? "#fff" : "#0f2040",
      border: on ? "#0f2040" : "#cfc6b3",
    };
  });
  const boardRows: BoardRow[] = [...BOARD, ...BOARD, ...BOARD].map(([code, country, city]) => ({
    code,
    country,
    city,
    flag: "https://flagcdn.com/w40/" + code.toLowerCase() + ".png",
    flag2: "https://flagcdn.com/w80/" + code.toLowerCase() + ".png",
  }));
  const siteTr = (i: number) => (siteIdx === i ? "opacity .45s ease" : "opacity 0s linear .45s");

  return {
    rootRef, globeRef, tunnelRef, track, toggleMenu, closeMenu, trackAndClose,
    navTransform: navHidden ? "translateY(-100px)" : "translateY(0)",
    navDisplay: narrow ? "none" : "flex",
    burgerDisplay: narrow ? "flex" : "none",
    loginDisplay: vw < 520 ? "none" : "flex",
    menuDisplay: menuOpen && narrow ? "flex" : "none",
    menuExpanded: menuOpen ? "true" : "false",
    burgerPath: menuOpen ? "M6 6l12 12M18 6 6 18" : "M4 7h16M4 12h16M4 17h16",
    settlements,
    scanLabel: "Illustrative example",
    cookieModes,
    cookieSite: SITES[siteIdx],
    siteOp0: siteIdx === 0 ? 1 : 0, siteOp1: siteIdx === 1 ? 1 : 0,
    siteOp2: siteIdx === 2 ? 1 : 0, siteOp3: siteIdx === 3 ? 1 : 0,
    siteZ0: siteIdx === 0 ? 2 : 1, siteZ1: siteIdx === 1 ? 2 : 1,
    siteZ2: siteIdx === 2 ? 2 : 1, siteZ3: siteIdx === 3 ? 2 : 1,
    siteTr0: siteTr(0), siteTr1: siteTr(1), siteTr2: siteTr(2), siteTr3: siteTr(3),
    bannerTransform: cPhase === 1 ? "translateY(0)" : "translateY(130%)",
    bannerOpacity: cPhase === 1 ? 1 : 0,
    toastTransform: cPhase === 2 ? "translateY(0)" : "translateY(-12px)",
    toastOpacity: cPhase === 2 ? 1 : 0,
    toastText: cMode === 0 ? "Rejected non-essential cookies" : "Accepted necessary only",
    boardRows,
    boardTop: 128 - BOARD.length * 64 + "px",
    boardTransform: "translateY(" + -bIdx * 64 + "px)",
    boardTransition: bNoTrans || reduce ? "none" : "transform .7s cubic-bezier(.6,0,.2,1)",
  };
}
