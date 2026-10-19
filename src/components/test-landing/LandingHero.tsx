import { Link } from "react-router-dom";
import type { LandingVals } from "./useLandingPage";

export default function LandingHero({ v }: { v: LandingVals }) {
  return (
    <>
      <section data-screen-label="Hero" data-track-section="hero" style={{ position: "relative", background: "#0f2040", color: "#fff", overflow: "hidden", minHeight: "820px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <canvas style={{ position: "absolute", inset: "0", width: "100%", height: "100%", display: "block" }} ref={v.globeRef} />
        <div style={{ position: "absolute", inset: "0", background: "linear-gradient(180deg,#0f2040 0%,rgba(15,32,64,.85) 30%,rgba(15,32,64,0) 55%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: "2", maxWidth: "1040px", padding: "150px 24px 0", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "26px" }}>
          <h1 style={{ margin: "0", fontSize: "clamp(32px,4.8vw,64px)", lineHeight: "1.02", letterSpacing: "-.035em", fontWeight: "500", textWrap: "balance" }}>
            KeenVPN: We're not just a VPN, we give you
            {" "}
            <span style={{ color: "#f5660f" }}>the edge</span>
            {" "}
            online.
          </h1>
          <p style={{ margin: "0", maxWidth: "640px", fontSize: "clamp(17px,1.6vw,20px)", lineHeight: "1.5", color: "#c3cbdc", textWrap: "pretty" }}>Find class action settlements you may qualify for, keep trackers off your traffic, skip cookie pop-ups, and connect to servers in 80+ locations.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", justifyContent: "center" }}>
            <Link to={"/signin"} data-track="hero_start_trial" className="kvh4" style={{ background: "#f5660f", color: "#fff", fontWeight: "600", fontSize: "17px", padding: "15px 26px", borderRadius: "8px" }} onClick={v.track}>Start free trial</Link>
            <Link to={"/download-app"} data-track="hero_download" className="kvh5" style={{ color: "#fff", fontWeight: "600", fontSize: "17px", padding: "15px 26px", borderRadius: "8px", border: "1px solid rgba(255,255,255,.32)", background: "rgba(15,32,64,.62)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", transition: "background .2s,border-color .2s" }} onClick={v.track}>Download KeenVPN</Link>
          </div>
          <span style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "8px 20px", fontSize: "13px", color: "#c3cbdc", padding: "10px 22px", borderRadius: "22px", background: "rgba(15,32,64,.72)", backdropFilter: "blur(10px) saturate(1.2)", WebkitBackdropFilter: "blur(10px) saturate(1.2)", border: "1px solid rgba(255,255,255,.1)", boxShadow: "0 8px 24px -12px rgba(0,0,0,.5)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" style={{ flex: "none", display: "block" }}>
                <path d="M3 4.6 10.4 3.6v7.6H3zM11.4 3.5 21 2v9.2h-9.6zM3 12.8h7.4v7.6L3 19.4zM11.4 12.8H21V22l-9.6-1.5z" />
              </svg>
              Windows
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" style={{ flex: "none", display: "block" }}>
                <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
              </svg>
              macOS
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", display: "block" }}>
                <rect x="6.5" y="2" width="11" height="20" rx="2.6" />
                <path d="M10.5 18.8h3" />
              </svg>
              iOS
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" fillRule="evenodd" style={{ flex: "none", display: "block" }}>
                <path d="M5.5 9.5h13v8a1.5 1.5 0 0 1-1.5 1.5h-1v2.5a1.25 1.25 0 0 1-2.5 0V19h-3v2.5a1.25 1.25 0 0 1-2.5 0V19h-1A1.5 1.5 0 0 1 5.5 17.5z" />
                <rect x="2" y="9.5" width="2.5" height="7" rx="1.25" />
                <rect x="19.5" y="9.5" width="2.5" height="7" rx="1.25" />
                <path d="M5.7 8.3a6.3 6.3 0 0 1 12.6 0zM9.6 5.6a.7.7 0 1 0 0 .01zM14.4 5.6a.7.7 0 1 0 0 .01z" />
                <path d="m8 2.8 1.2 1.7M16 2.8l-1.2 1.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Android
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", display: "block" }}>
                <circle cx="12" cy="12" r="9.5" />
                <circle cx="12" cy="12" r="3.8" />
                <path d="M15.3 10.1 20.7 6.9M8.7 10.1 4.2 6.9M12 15.8V21.5" />
              </svg>
              Chrome
            </span>
          </span>
        </div>
      </section>
      <nav aria-label="What KeenVPN does" style={{ position: "relative", zIndex: "3", marginTop: "-44px", padding: "0 24px" }}>
        <div className="kv-quick" style={{ maxWidth: "1180px", margin: "0 auto", display: "grid", gap: "1px", background: "#e7e1d4", border: "1px solid #e7e1d4", borderRadius: "22px", overflow: "hidden", boxShadow: "0 20px 44px -22px rgba(15,32,64,.45)" }}>
          <a href={"#settlements"} data-track="index_settlements" className="kvh6" style={{ display: "flex", alignItems: "center", gap: "14px", padding: "18px 20px", background: "#fffdf8", color: "#141a2b", transition: "background .2s ease" }} onClick={v.track}>
            <span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "12px", background: "#fdeadb", color: "#f5660f", display: "grid", placeItems: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 3h7l4 4v14H7z" />
                <path d="M14 3v4h4" />
                <path d="m9.5 14 2 2 3.5-4" />
              </svg>
            </span>
            <span style={{ flex: "1", fontSize: "15px", lineHeight: "1.3", fontWeight: "600", letterSpacing: "-.01em" }}>Get paid when companies misuse your data</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", color: "#b9ae96" }}>
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </a>
          <a href={"#tracking"} data-track="index_tracking" className="kvh6" style={{ display: "flex", alignItems: "center", gap: "14px", padding: "18px 20px", background: "#fffdf8", color: "#141a2b", transition: "background .2s ease" }} onClick={v.track}>
            <span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "12px", background: "#fdeadb", color: "#f5660f", display: "grid", placeItems: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3 4.5 6v5.5c0 4.5 3.1 8 7.5 9.5 4.4-1.5 7.5-5 7.5-9.5V6z" />
                <path d="m9 12 2.2 2.2L15.5 10" />
              </svg>
            </span>
            <span style={{ flex: "1", fontSize: "15px", lineHeight: "1.3", fontWeight: "600", letterSpacing: "-.01em" }}>Keep trackers and snoops off your traffic</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", color: "#b9ae96" }}>
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </a>
          <a href={"#cookies"} data-track="index_cookies" className="kvh6" style={{ display: "flex", alignItems: "center", gap: "14px", padding: "18px 20px", background: "#fffdf8", color: "#141a2b", transition: "background .2s ease" }} onClick={v.track}>
            <span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "12px", background: "#fdeadb", color: "#f5660f", display: "grid", placeItems: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3a9 9 0 1 0 9 9 4 4 0 0 1-4-4 4 4 0 0 1-4-4 1 1 0 0 0-1-1z" />
                <circle cx="9" cy="10" r=".9" fill="currentColor" />
                <circle cx="10" cy="15" r=".9" fill="currentColor" />
                <circle cx="15" cy="15" r=".9" fill="currentColor" />
              </svg>
            </span>
            <span style={{ flex: "1", fontSize: "15px", lineHeight: "1.3", fontWeight: "600", letterSpacing: "-.01em" }}>Browse without cookie pop-ups</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", color: "#b9ae96" }}>
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </a>
          <a href={"#libraries"} data-track="index_libraries" className="kvh6" style={{ display: "flex", alignItems: "center", gap: "14px", padding: "18px 20px", background: "#fffdf8", color: "#141a2b", transition: "background .2s ease" }} onClick={v.track}>
            <span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "12px", background: "#fdeadb", color: "#f5660f", display: "grid", placeItems: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
              </svg>
            </span>
            <span style={{ flex: "1", fontSize: "15px", lineHeight: "1.3", fontWeight: "600", letterSpacing: "-.01em" }}>Explore online libraries in other countries</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none", color: "#b9ae96" }}>
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </a>
        </div>
      </nav>
    </>
  );
}
