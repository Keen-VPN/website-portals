import { Fragment } from "react";
import { Link } from "react-router-dom";
import { useMarketingLink } from "./marketingLink";
import type { LandingVals } from "./useLandingPage";

export default function LandingSettlements({ v }: { v: LandingVals }) {
  const mkt = useMarketingLink();
  return (
    <>
      <section id="settlements" data-screen-label="Class actions" data-track-section="settlements" style={{ padding: "clamp(72px,9vw,128px) 24px" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,460px),1fr))", gap: "clamp(40px,6vw,88px)", alignItems: "center" }}>
          <div data-reveal="" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <span style={{ alignSelf: "flex-start", background: "#efe6d2", color: "#5c4a24", fontSize: "12px", fontWeight: "600", letterSpacing: ".06em", textTransform: "uppercase", padding: "5px 10px", borderRadius: "4px" }}>Class action settlements</span>
            <h2 style={{ margin: "0", fontSize: "clamp(36px,4.6vw,60px)", lineHeight: "1.04", letterSpacing: "-.03em", fontWeight: "700", textWrap: "balance" }}>Hold companies accountable for misusing your data.</h2>
            <p style={{ margin: "0", fontSize: "19px", lineHeight: "1.55", color: "#4d5568", maxWidth: "520px", textWrap: "pretty" }}>When a company leaks or misuses personal information, a settlement often follows. KeenVPN tracks them so you can see which ones you may qualify for, and file before the deadline.</p>
            <ol style={{ listStyle: "none", margin: "0", padding: "0", display: "grid", gap: "0", borderTop: "1px solid #e7e1d4" }}>
              <li style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: "4px", padding: "16px 0", borderBottom: "1px solid #e7e1d4" }}>
                <span style={{ fontWeight: "700", color: "#f5660f" }}>1</span>
                <span>
                  <b style={{ fontWeight: "600" }}>Discover settlements.</b>
                  {" "}
                  <span style={{ color: "#4d5568" }}>Active class action and data-breach cases in one place.</span>
                </span>
              </li>
              <li style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: "4px", padding: "16px 0", borderBottom: "1px solid #e7e1d4" }}>
                <span style={{ fontWeight: "700", color: "#f5660f" }}>2</span>
                <span>
                  <b style={{ fontWeight: "600" }}>Check if you may qualify.</b>
                  {" "}
                  <span style={{ color: "#4d5568" }}>Eligibility and estimated payouts in plain language.</span>
                </span>
              </li>
              <li style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: "4px", padding: "16px 0", borderBottom: "1px solid #e7e1d4" }}>
                <span style={{ fontWeight: "700", color: "#f5660f" }}>3</span>
                <span>
                  <b style={{ fontWeight: "600" }}>Meet every deadline.</b>
                  {" "}
                  <span style={{ color: "#4d5568" }}>See the filing date before you decide to submit a claim.</span>
                </span>
              </li>
            </ol>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
              <a href={mkt("/settlements.html")} data-track="settlements_see" className="kvh4" style={{ background: "#f5660f", color: "#fff", fontWeight: "600", fontSize: "16px", padding: "14px 22px", borderRadius: "8px" }} onClick={v.track}>See settlements ›</a>
              <Link to={"/signin"} data-track="settlements_trial" className="kvh7" style={{ color: "#0f2040", fontWeight: "600", fontSize: "16px", padding: "14px 22px", borderRadius: "8px", border: "1px solid #cfc6b3" }} onClick={v.track}>Start free trial</Link>
            </div>
          </div>
          <div data-reveal="" style={{ background: "#0f2040", borderRadius: "16px", padding: "clamp(20px,3vw,32px)", color: "#fff", boxShadow: "0 30px 60px -30px rgba(15,32,64,.5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px", gap: "12px", flexWrap: "wrap" }}>
              <span style={{ fontWeight: "600", fontSize: "17px" }}>Settlements</span>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#9ba6bf" }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#3ddc84" }} />
                {v.scanLabel}
              </span>
            </div>
            <div style={{ display: "grid", gap: "10px" }}>
              {v.settlements.map((s, i) => (
                <Fragment key={i}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 16px", alignItems: "center", padding: "16px 18px", borderRadius: "10px", border: `1px solid ${s.border}`, background: s.bg, transition: "background .5s,border-color .5s" }}>
                    <span style={{ fontWeight: "600", fontSize: "16px" }}>{s.name}</span>
                    <span style={{ fontSize: "12px", fontWeight: "600", padding: "4px 9px", borderRadius: "999px", justifySelf: "end", background: s.pillBg, color: s.pillColor, transition: "all .4s", whiteSpace: "nowrap" }}>{s.status}</span>
                    <span style={{ fontSize: "13px", color: "#9ba6bf" }}>{s.meta}</span>
                    <span style={{ fontSize: "13px", color: "#c3cbdc", whiteSpace: "nowrap" }}>Deadline {s.deadline}</span>
                  </div>
                </Fragment>
              ))}
            </div>
            <p style={{ margin: "16px 0 0", fontSize: "12px", color: "#8692ad" }}>Illustrative examples. Eligibility is set by each settlement; KeenVPN doesn't guarantee payment.</p>
          </div>
        </div>
      </section>
    </>
  );
}
