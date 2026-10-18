import { Fragment } from "react";
import { marketingSiteUrl } from "@/lib/site-urls";
import type { LandingVals } from "./useLandingPage";

export default function LandingLibraries({ v }: { v: LandingVals }) {
  return (
    <>
      <section id="libraries" data-screen-label="Libraries" data-track-section="libraries" style={{ background: "#f5660f", color: "#141a2b", padding: "clamp(72px,9vw,128px) 24px" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,460px),1fr))", gap: "clamp(40px,6vw,88px)", alignItems: "center" }}>
          <div data-reveal="" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <span style={{ alignSelf: "flex-start", background: "#141a2b", color: "#fff", fontSize: "12px", fontWeight: "600", letterSpacing: ".06em", textTransform: "uppercase", padding: "5px 10px", borderRadius: "4px" }}>80+ server locations</span>
            <h2 style={{ margin: "0", fontSize: "clamp(36px,4.6vw,60px)", lineHeight: "1.04", letterSpacing: "-.03em", fontWeight: "700", textWrap: "balance", color: "#fff" }}>Access online libraries across countries.</h2>
            <p style={{ margin: "0", fontSize: "19px", lineHeight: "1.55", color: "#141a2b", maxWidth: "520px", textWrap: "pretty" }}>Connect to a KeenVPN server in another country and explore the content and libraries offered there. Travelling? Stay connected to the services you use at home.</p>
            <p style={{ margin: "0", fontSize: "14px", lineHeight: "1.5", color: "#141a2b", maxWidth: "520px" }}>What's available depends on each service's catalog, terms and licensing in that region.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
              <a href={marketingSiteUrl("/server-locations/")} data-track="libraries_locations" className="kvh2" style={{ background: "#141a2b", color: "#fff", fontWeight: "600", fontSize: "16px", padding: "14px 22px", borderRadius: "8px" }} onClick={v.track}>See server locations ›</a>
            </div>
          </div>
          <div data-reveal="" style={{ background: "#141a2b", color: "#fff", borderRadius: "16px", padding: "8px", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px 12px" }}>
              <span style={{ fontSize: "13px", color: "#9ba6bf" }}>Connecting to</span>
              <span style={{ fontSize: "13px", color: "#3ddc84", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#3ddc84" }} />
                Protected
              </span>
            </div>
            <div style={{ position: "relative", height: "320px", overflow: "hidden", borderRadius: "10px", background: "#0f1424" }}>
              <div style={{ position: "absolute", left: "0", right: "0", top: "128px", height: "64px", background: "rgba(245,102,15,.16)", borderTop: "1px solid rgba(245,102,15,.6)", borderBottom: "1px solid rgba(245,102,15,.6)" }} />
              <div aria-hidden="true" style={{ position: "absolute", left: "0", right: "0", top: v.boardTop, transform: v.boardTransform, transition: v.boardTransition }}>
                {v.boardRows.map((r, i) => (
                  <Fragment key={i}>
                    <div style={{ height: "64px", display: "grid", gridTemplateColumns: "34px 1fr auto", alignItems: "center", gap: "14px", padding: "0 20px" }}>
                      <span style={{ display: "grid", placeItems: "center", width: "30px", height: "22px", borderRadius: "4px", boxShadow: "0 0 0 1px rgba(255,255,255,.18)", background: "#26365b", color: "#c3cbdc", fontSize: "11px", fontWeight: "700", letterSpacing: ".04em" }}>{r.code}</span>
                      <span style={{ fontSize: "clamp(20px,2.2vw,26px)", fontWeight: "600", letterSpacing: "-.02em" }}>{r.country}</span>
                      <span style={{ fontSize: "13px", color: "#8692ad", textAlign: "right" }}>{r.city}</span>
                    </div>
                  </Fragment>
                ))}
              </div>
              <div style={{ position: "absolute", inset: "0", background: "linear-gradient(180deg,#0f1424 0%,rgba(15,20,36,0) 30%,rgba(15,20,36,0) 70%,#0f1424 100%)", pointerEvents: "none" }} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
