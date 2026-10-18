import { Link } from "react-router-dom";
import { marketingSiteUrl } from "@/lib/site-urls";
import { APP_STORE_URLS } from "@/constants/app-store-urls";
import type { LandingVals } from "./useLandingPage";

export default function LandingFooter({ v }: { v: LandingVals }) {
  return (
    <>
      <footer style={{ background: "#0f2040", color: "#c3cbdc", padding: "64px 24px 32px" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto", display: "grid", gap: "48px" }}>
          <div className="kv-foot-cols" style={{ display: "grid", gap: "32px", fontSize: "14px" }}>
            <div style={{ display: "grid", gap: "10px", alignContent: "start" }}>
              <h3 style={{ margin: "0", color: "#fff", fontWeight: "600", fontSize: "inherit", lineHeight: "inherit" }}>Features</h3>
              <a href={marketingSiteUrl("/settlements.html")} style={{ color: "#c3cbdc" }}>Class action settlements</a>
              <a href={"#cookies"} style={{ color: "#c3cbdc" }}>Cookie banner blocking</a>
              <a href={marketingSiteUrl("/kill-switch.html")} style={{ color: "#c3cbdc" }}>Kill switch</a>
              <a href={marketingSiteUrl("/leak-protection.html")} style={{ color: "#c3cbdc" }}>Leak & DNS protection</a>
              <a href={marketingSiteUrl("/split-tunneling.html")} style={{ color: "#c3cbdc" }}>Split tunneling</a>
              <a href={marketingSiteUrl("/dedicated-ip.html")} style={{ color: "#c3cbdc" }}>Dedicated IP</a>
              <a href={marketingSiteUrl("/high-speed-vpn.html")} style={{ color: "#c3cbdc" }}>High-speed VPN</a>
            </div>
            <div style={{ display: "grid", gap: "10px", alignContent: "start" }}>
              <h3 style={{ margin: "0", color: "#fff", fontWeight: "600", fontSize: "inherit", lineHeight: "inherit" }}>KeenVPN</h3>
              <Link to={"/switch"} style={{ color: "#c3cbdc" }}>Transfer</Link>
              <a href={marketingSiteUrl("/settlements.html")} style={{ color: "#c3cbdc" }}>Settlements</a>
              <Link to={"/servers"} style={{ color: "#c3cbdc" }}>Server locations</Link>
              <Link to={"/pricing"} style={{ color: "#c3cbdc" }}>Pricing</Link>
            </div>
            <div style={{ display: "grid", gap: "10px", alignContent: "start" }}>
              <h3 style={{ margin: "0", color: "#fff", fontWeight: "600", fontSize: "inherit", lineHeight: "inherit" }}>Resources</h3>
              <a href={marketingSiteUrl("/blog/")} style={{ color: "#c3cbdc" }}>Blog</a>
              <a href={APP_STORE_URLS.macos} style={{ color: "#c3cbdc" }}>Download for macOS</a>
              <a href={APP_STORE_URLS.ios} style={{ color: "#c3cbdc" }}>Download for iOS</a>
            </div>
            <div style={{ display: "grid", gap: "10px", alignContent: "start" }}>
              <h3 style={{ margin: "0", color: "#fff", fontWeight: "600", fontSize: "inherit", lineHeight: "inherit" }}>Legal</h3>
              <Link to={"/terms"} style={{ color: "#c3cbdc" }}>Terms</Link>
              <Link to={"/privacy"} style={{ color: "#c3cbdc" }}>Privacy</Link>
              <Link to={"/delete-account"} style={{ color: "#c3cbdc" }}>Delete account</Link>
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,.12)", paddingTop: "24px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <span style={{ fontSize: "13px", color: "#8692ad" }}>© 2026 KeenVPN. All rights reserved.</span>
            <div style={{ display: "flex", gap: "10px" }}>
              <a href={"https://www.linkedin.com/company/keen-vpn/"} target="_blank" rel="noopener noreferrer" aria-label="KeenVPN on LinkedIn" data-track="footer_linkedin" className="kvh9" style={{ width: "36px", height: "36px", borderRadius: "50%", border: "1px solid rgba(255,255,255,.2)", display: "grid", placeItems: "center", color: "#c3cbdc" }} onClick={v.track}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" style={{ display: "block" }}>
                  <rect x="3" y="9" width="3.8" height="12" />
                  <circle cx="4.9" cy="4.9" r="2.1" />
                  <path d="M10 9h3.6v1.7c.6-1.1 1.9-2 3.7-2 3.3 0 4.7 2 4.7 5.4V21h-3.8v-6c0-1.5-.5-2.6-1.9-2.6-1.5 0-2.4 1-2.4 2.7V21H10z" />
                </svg>
              </a>
              <a href={"https://x.com/KeenVPN"} target="_blank" rel="noopener noreferrer" aria-label="KeenVPN on X" data-track="footer_x" className="kvh9" style={{ width: "36px", height: "36px", borderRadius: "50%", border: "1px solid rgba(255,255,255,.2)", display: "grid", placeItems: "center", color: "#c3cbdc" }} onClick={v.track}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" style={{ display: "block" }}>
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a href={"https://www.instagram.com/keenvpn/"} target="_blank" rel="noopener noreferrer" aria-label="KeenVPN on Instagram" data-track="footer_instagram" className="kvh9" style={{ width: "36px", height: "36px", borderRadius: "50%", border: "1px solid rgba(255,255,255,.2)", display: "grid", placeItems: "center", color: "#c3cbdc" }} onClick={v.track}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ display: "block" }}>
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4.2" />
                  <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
                </svg>
              </a>
              <a href={"https://www.facebook.com/profile.php?id=61593300446630"} target="_blank" rel="noopener noreferrer" aria-label="KeenVPN on Facebook" data-track="footer_facebook" className="kvh9" style={{ width: "36px", height: "36px", borderRadius: "50%", border: "1px solid rgba(255,255,255,.2)", display: "grid", placeItems: "center", color: "#c3cbdc" }} onClick={v.track}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" style={{ display: "block" }}>
                  <path d="M14 8.5V6.9c0-.8.2-1.2 1.3-1.2H17V2.5h-2.6C11.4 2.5 10 4.2 10 6.6v1.9H7.5v3.2H10v9.8h4v-9.8h2.6l.4-3.2z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
