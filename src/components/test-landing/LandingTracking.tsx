import type { LandingVals } from "./useLandingPage";

export default function LandingTracking({ v }: { v: LandingVals }) {
  return (
    <>
      <section id="tracking" data-screen-label="Tracking" data-track-section="tracking" style={{ background: "#0f2040", color: "#fff", padding: "clamp(72px,9vw,128px) 24px" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto", display: "grid", gap: "56px" }}>
          <div data-reveal="" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: "24px 64px", alignItems: "end" }}>
            <h2 style={{ margin: "0", fontSize: "clamp(36px,4.6vw,60px)", lineHeight: "1.04", letterSpacing: "-.03em", fontWeight: "700", textWrap: "balance" }}>Protect yourself from surveillance and tracking.</h2>
            <p style={{ margin: "0", fontSize: "19px", lineHeight: "1.55", color: "#c3cbdc", textWrap: "pretty" }}>KeenVPN encrypts the traffic between your device and our servers, so your ISP, public Wi-Fi operators and network snoops can't see what you do online. It also hides your real IP address from the sites you visit.</p>
          </div>
          <div className="kv-tunnel" data-reveal="" style={{ position: "relative", border: "1px solid rgba(255,255,255,.12)", borderRadius: "16px", overflow: "hidden", height: "380px", background: "#0c1a36" }}>
            <canvas style={{ position: "absolute", inset: "0", width: "100%", height: "100%", display: "block" }} ref={v.tunnelRef} />
            <span style={{ position: "absolute", left: "24px", bottom: "20px", fontSize: "13px", color: "#c3cbdc" }}>Your device</span>
            {" "}
            <span style={{ position: "absolute", right: "24px", bottom: "20px", fontSize: "13px", color: "#c3cbdc" }}>KeenVPN server</span>
            {" "}
            <span style={{ position: "absolute", left: "50%", top: "18px", transform: "translateX(-50%)", fontSize: "13px", color: "#8692ad", whiteSpace: "nowrap" }}>Watchers on the network see encrypted data</span>
          </div>
          <div className="kv-pillars" style={{ display: "grid", gap: "0", borderTop: "1px solid rgba(255,255,255,.12)" }}>
            <div style={{ padding: "22px 24px 0 0", display: "grid", gap: "6px" }}>
              <span style={{ fontWeight: "600", fontSize: "17px" }}>AES-256 encryption</span>
              <span style={{ fontSize: "15px", color: "#9ba6bf", lineHeight: "1.5" }}>Military-grade encryption on every connection.</span>
            </div>
            <div style={{ padding: "22px 24px 0 0", display: "grid", gap: "6px" }}>
              <span style={{ fontWeight: "600", fontSize: "17px" }}>No-logs policy</span>
              <span style={{ fontSize: "15px", color: "#9ba6bf", lineHeight: "1.5" }}>Independently audited. We don't keep your activity.</span>
            </div>
            <div style={{ padding: "22px 24px 0 0", display: "grid", gap: "6px" }}>
              <span style={{ fontWeight: "600", fontSize: "17px" }}>Leak protection</span>
              <span style={{ fontSize: "15px", color: "#9ba6bf", lineHeight: "1.5" }}>DNS and IP leak protection keeps lookups in the tunnel.</span>
            </div>
            <div style={{ padding: "22px 24px 0 0", display: "grid", gap: "6px" }}>
              <span style={{ fontWeight: "600", fontSize: "17px" }}>Kill switch</span>
              <span style={{ fontSize: "15px", color: "#9ba6bf", lineHeight: "1.5" }}>Cuts traffic if the VPN drops, so nothing slips out.</span>
            </div>
          </div>
          <p style={{ margin: "0", fontSize: "14px", color: "#8692ad", maxWidth: "760px" }}>A VPN reduces tracking but can't stop all of it. Sites you sign in to, browser fingerprinting and third-party cookies can still identify you.</p>
        </div>
      </section>
    </>
  );
}
