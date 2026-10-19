import { Link } from "react-router-dom";
import type { LandingVals } from "./useLandingPage";

export default function LandingPricingCta({ v }: { v: LandingVals }) {
  return (
    <>
      <section data-screen-label="Pricing CTA" data-track-section="pricing" style={{ padding: "clamp(72px,9vw,120px) 24px", borderBottom: "1px solid #e7e1d4" }}>
        <div data-reveal="" style={{ maxWidth: "1100px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: "48px", alignItems: "center" }}>
          <div style={{ display: "grid", gap: "18px" }}>
            <h2 style={{ margin: "0", fontSize: "clamp(34px,4vw,52px)", lineHeight: "1.05", letterSpacing: "-.03em", fontWeight: "700", textWrap: "balance" }}>All four, one app. Try it free.</h2>
            <p style={{ margin: "0", fontSize: "18px", lineHeight: "1.55", color: "#4d5568" }}>VPN protection, settlement tracking, cookie banner blocking and global locations on up to 3 devices.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
              <Link to={"/signin"} data-track="cta_start_trial" className="kvh4" style={{ background: "#f5660f", color: "#fff", fontWeight: "600", fontSize: "17px", padding: "15px 26px", borderRadius: "8px" }} onClick={v.track}>Start free trial</Link>
              <Link to={"/pricing"} data-track="cta_pricing" className="kvh7" style={{ color: "#0f2040", fontWeight: "600", fontSize: "17px", padding: "15px 26px", borderRadius: "8px", border: "1px solid #cfc6b3" }} onClick={v.track}>See pricing</Link>
            </div>
          </div>
          <div style={{ background: "#fff", border: "1px solid #e7e1d4", borderRadius: "14px", padding: "28px", display: "grid", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontWeight: "600" }}>Free trial</span>
              <span style={{ fontSize: "12px", fontWeight: "600", background: "#efe6d2", color: "#5c4a24", padding: "3px 8px", borderRadius: "4px" }}>1 month</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px 12px" }}>
              <span style={{ fontSize: "52px", fontWeight: "700", letterSpacing: "-.03em", color: "#0f2040" }}>Free</span>
              <span style={{ color: "#5b6273" }}>for 1 month, then your chosen plan. See current prices on the pricing page.</span>
            </div>
            <div style={{ display: "grid", gap: "8px", fontSize: "15px", color: "#3a4152", borderTop: "1px solid #eee7d9", paddingTop: "14px" }}>
              <span>Cancel any time before the trial ends</span>
              <span>Switching from another VPN? Transfer your remaining time</span>
              <span>Up to 3 devices at once on the Individual plan</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
