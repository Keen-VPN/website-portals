import { Link } from "react-router-dom";
import { marketingSiteUrl } from "@/lib/site-urls";
import { APP_STORE_URLS } from "@/constants/app-store-urls";
import type { LandingVals } from "./useLandingPage";

export default function LandingNav({ v }: { v: LandingVals }) {
  return (
    <>
      <header style={{ position: "sticky", top: "12px", zIndex: "20", height: "60px", margin: "12px 0 -72px", padding: "0 16px", pointerEvents: "none", transform: v.navTransform, transition: "transform .35s cubic-bezier(.4,0,.2,1)" }}>
        <div style={{ position: "relative", maxWidth: "1180px", height: "60px", margin: "0 auto", pointerEvents: "auto" }}>
          <div style={{ height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "0 8px 0 18px", borderRadius: "999px", background: "rgba(250,246,238,.82)", backdropFilter: "blur(16px) saturate(1.4)", WebkitBackdropFilter: "blur(16px) saturate(1.4)", border: "1px solid rgba(15,32,64,.08)", boxShadow: "0 10px 30px -12px rgba(15,32,64,.35),inset 0 1px 0 rgba(255,255,255,.6)" }}>
            <a href={marketingSiteUrl()} style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: "800", fontSize: "18px", color: "#0f2040", letterSpacing: "-.02em", whiteSpace: "nowrap" }}>
              <svg width="30" height="29" aria-hidden="true" viewBox="0 0 40 39" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", flex: "none" }}>
                <path d="M36.6269 20.9931C23.1034 14.9574 13.1307 21.4135 18.457 36.3165C18.7608 37.1652 19.1127 38.0376 19.5125 38.9339C19.5125 38.9339 19.4965 38.9339 19.4726 38.9339C4.78146 36.7528 0.0710122 19.9937 0.382909 11.2613C0.89474 10.5554 1.87042 9.50053 2.91007 8.63601C2.91007 8.63601 2.91274 8.63601 2.91807 8.63601C3.42989 8.23151 3.94973 7.88253 4.46956 7.5732C7.59652 5.70933 10.6595 5.46345 11.0834 5.43966C6.02903 5.01929 2.29428 6.209 0.0630148 7.27181C-0.0169587 5.47138 -0.024956 3.59958 0.0630148 1.64846C0.0630148 1.64846 5.31727 -0.469224 19.4565 1.80709C33.5959 4.09132 31.2446 9.15948 31.2446 9.15948C31.2446 9.15948 41.0175 13.379 36.6349 20.9852L36.6269 20.9931Z" fill="#0F2040" />
                <path d="M39.258 7.27177C37.5545 6.46276 34.9635 5.57445 31.5805 5.3841C30.165 3.64712 26.4783 1.1408 18.8807 0.403182C30.2689 -0.984812 39.2659 1.65635 39.2659 1.65635C39.3459 3.60746 39.338 5.47927 39.2659 7.27177H39.258Z" fill="#3A7CA5" />
                <path d="M31.5806 5.38406C33.8119 5.31267 38.5383 6.2565 39.2581 7.27173C39.2581 7.27173 38.8981 13.4027 38.8182 14.4417C37.6266 11.2612 34.5716 9.20698 32.9322 8.3028C32.6043 6.70859 32.1004 6.04236 31.5725 5.39198L31.5806 5.38406Z" fill="#3A7CA5" />
                <path d="M5.41322 22.5398C5.35725 22.8254 5.26927 23.1743 5.16531 23.5709C5.23729 23.2139 5.32526 22.8729 5.41322 22.5398Z" fill="#0F2040" />
                <path d="M21.9596 25.387C27.7576 26.426 31.4364 27.6157 33.9555 29.9237C32.788 31.7083 31.3964 33.2787 29.757 34.6033C28.5014 32.7077 25.8622 29.6462 21.2718 28.2343C24.7586 30.6376 27.1819 33.6357 28.4933 35.5392C26.4061 36.9747 23.9589 38.0455 21.1038 38.7197L20.9199 38.3073C18.1448 32.1049 17.7769 26.9099 19.8962 23.6738C21.3518 21.461 23.8949 20.295 27.2618 20.295C29.8689 20.295 32.8839 21.0247 35.979 22.4048L37.1545 22.9283C36.5387 24.9032 35.779 26.7353 34.8513 28.4089C32.636 27.0288 27.6456 24.5145 21.9435 25.387H21.9596Z" fill="#0F2040" />
                <path d="M29.8691 17.186C18.8327 15.7901 13.7384 22.4365 14.5701 30.5742C12.5868 29.4954 10.8673 27.8695 9.45181 25.6488C11.4271 20.7471 16.6734 13.2837 29.8691 17.186Z" fill="#E85C04" />
                <path d="M15.9218 35.9597C10.3236 33.1519 6.54887 26.4579 6.54887 26.4579C6.54887 26.4579 9.25998 24.475 11.3713 22.048C10.2836 25.284 12.5789 29.5035 14.5623 30.5822C14.7462 32.3271 15.194 34.1434 15.9137 35.9597H15.9218Z" fill="#ED7D36" />
                <path d="M35.4591 17.5112C35.3712 17.4556 35.2912 17.4002 35.1952 17.3525C34.0916 14.8938 32.6041 12.9824 30.6607 11.7451C30.8366 11.5468 30.9886 11.3327 31.1165 11.1106C33.5078 12.7207 35.2433 14.6876 35.4591 17.5112Z" fill="#ED7D36" />
                <path d="M35.4593 17.5113C33.4999 16.3137 29.9092 14.6956 25.5026 14.6877C27.9098 13.9104 29.6533 12.9428 30.6609 11.7451C32.6043 12.9824 34.3476 15.0526 35.4512 17.5113H35.4593Z" fill="#E85C04" />
                <path d="M2.29419 11.4279C2.16623 13.5376 2.77403 19.0182 4.90932 24.8319C5.22122 16.623 4.88532 11.0472 11.4032 6.6532C6.46881 7.4622 4.34951 9.56402 2.29419 11.4279Z" fill="#3F4D66" />
                <path d="M1.36644 2.3305C1.23048 3.48849 1.25447 4.42438 1.19849 5.82031C2.60602 3.89298 4.96524 2.40189 8.1162 1.65633C6.2928 1.55322 3.2618 1.79117 1.36644 2.3305Z" fill="#3F4D66" />
                <path fillRule="evenodd" clipRule="evenodd" d="M25.9984 8.74702C24.6387 9.19118 22.0716 12.7127 18.8647 10.143C17.897 9.36568 14.714 6.05829 14.5381 5.5824C16.7054 5.61412 18.7527 5.72517 19.9763 6.44692C21.0239 7.07351 20.0723 7.93009 18.8727 7.96182C19.2566 9.11981 19.8724 9.8257 20.88 10.0081C21.8397 10.1826 22.6874 9.73845 23.1113 8.88979C23.3433 8.42977 23.5111 7.81113 23.3433 7.27972C24.1829 7.46215 25.5265 7.95389 25.9903 8.74702H25.9984Z" fill="#F5F6FA" />
              </svg>
              KeenVPN
            </a>
            <nav aria-label="Main" style={{ display: v.navDisplay, alignItems: "center", gap: "2px", fontSize: "14.5px" }}>
              <Link to={"/pricing"} className="kvh1" style={{ padding: "9px 14px", borderRadius: "999px", whiteSpace: "nowrap", color: "#0f2040", fontWeight: "500" }}>Pricing</Link>
              <div className="kvdd">
                <button type="button" aria-expanded="false">
                  Features
                  {" "}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <div className="kvdd-menu">
                  <a href={marketingSiteUrl("/kill-switch.html")}>
                    <span className="kvico">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
                        <rect x="5" y="11" width="14" height="10" rx="2" />
                        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                      </svg>
                    </span>
                    <span>
                      <b>Kill Switch</b>
                      <small>Blocks traffic if the tunnel drops</small>
                    </span>
                  </a>
                  <a href={marketingSiteUrl("/dedicated-ip.html")}>
                    <span className="kvico">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
                        <circle cx="8" cy="15" r="4" />
                        <path d="m11 12 9-9M16 7l3 3" />
                      </svg>
                    </span>
                    <span>
                      <b>Dedicated IP</b>
                      <small>An address that's yours alone</small>
                    </span>
                  </a>
                  <a href={marketingSiteUrl("/leak-protection.html")}>
                    <span className="kvico">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
                        <path d="M12 3 4.5 6v5.5c0 4.5 3.1 8 7.5 9.5 4.4-1.5 7.5-5 7.5-9.5V6z" />
                        <path d="m9 12 2.2 2.2L15.5 10" />
                      </svg>
                    </span>
                    <span>
                      <b>Leak & DNS Protection</b>
                      <small>DNS, IPv6, WebRTC and proxy leaks</small>
                    </span>
                  </a>
                  <a href={marketingSiteUrl("/split-tunneling.html")}>
                    <span className="kvico">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
                        <path d="M12 3v6M12 9l-6 6v6M12 9l6 6v6" />
                      </svg>
                    </span>
                    <span>
                      <b>Split Tunneling</b>
                      <small>Choose what uses the VPN</small>
                    </span>
                  </a>
                  <a href={marketingSiteUrl("/high-speed-vpn.html")}>
                    <span className="kvico">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
                        <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
                      </svg>
                    </span>
                    <span>
                      <b>High-speed VPN</b>
                      <small>Lightweight, unlimited bandwidth</small>
                    </span>
                  </a>
                </div>
              </div>
              <a href={marketingSiteUrl("/server-locations/")} className="kvh1" style={{ padding: "9px 14px", borderRadius: "999px", whiteSpace: "nowrap", color: "#0f2040", fontWeight: "500" }}>Server Locations</a>
              <a href={marketingSiteUrl("/transfer.html")} className="kvh1" style={{ padding: "9px 14px", borderRadius: "999px", whiteSpace: "nowrap", color: "#0f2040", fontWeight: "500" }}>Transfer</a>
              <a href={marketingSiteUrl("/settlements.html")} className="kvh1" style={{ padding: "9px 14px", borderRadius: "999px", whiteSpace: "nowrap", color: "#0f2040", fontWeight: "500" }}>Settlements</a>
              <a href={marketingSiteUrl("/blog/")} className="kvh1" style={{ padding: "9px 14px", borderRadius: "999px", whiteSpace: "nowrap", color: "#0f2040", fontWeight: "500" }}>Blog</a>
              <div className="kvdd">
                <button type="button" aria-expanded="false">
                  Download
                  {" "}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <div className="kvdd-menu">
                  <a href={APP_STORE_URLS.windows} rel="noopener" data-track="nav_download_windows" onClick={v.track}>
                    <span className="kvico">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
                        <path d="M3 4.6 10.4 3.6v7.6H3zM11.4 3.5 21 2v9.2h-9.6zM3 12.8h7.4v7.6L3 19.4zM11.4 12.8H21V22l-9.6-1.5z" />
                      </svg>
                    </span>
                    <span>
                      <b>Windows</b>
                      <small>Microsoft Store</small>
                    </span>
                  </a>
                  <a href={APP_STORE_URLS.macos} rel="noopener" data-track="nav_download_macos" onClick={v.track}>
                    <span className="kvico">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
                        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
                      </svg>
                    </span>
                    <span>
                      <b>macOS</b>
                      <small>Mac App Store</small>
                    </span>
                  </a>
                  <a href={APP_STORE_URLS.ios} rel="noopener" data-track="nav_download_ios" onClick={v.track}>
                    <span className="kvico">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
                        <rect x="6.5" y="2" width="11" height="20" rx="2.6" />
                        <path d="M10.5 18.8h3" />
                      </svg>
                    </span>
                    <span>
                      <b>iOS</b>
                      <small>App Store</small>
                    </span>
                  </a>
                  <a href={APP_STORE_URLS.android} rel="noopener" data-track="nav_download_android" onClick={v.track}>
                    <span className="kvico">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
                        <path d="M5.5 9.5h13v8a1.5 1.5 0 0 1-1.5 1.5h-1v2.5a1.25 1.25 0 0 1-2.5 0V19h-3v2.5a1.25 1.25 0 0 1-2.5 0V19h-1A1.5 1.5 0 0 1 5.5 17.5z" />
                        <rect x="2" y="9.5" width="2.5" height="7" rx="1.25" />
                        <rect x="19.5" y="9.5" width="2.5" height="7" rx="1.25" />
                        <path fillRule="evenodd" d="M5.7 8.3a6.3 6.3 0 0 1 12.6 0zM9.6 5.6a.7.7 0 1 0 0 .01zM14.4 5.6a.7.7 0 1 0 0 .01z" />
                        <path d="m8 2.8 1.2 1.7M16 2.8l-1.2 1.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="currentColor" />
                      </svg>
                    </span>
                    <span>
                      <b>Android</b>
                      <small>Google Play</small>
                    </span>
                  </a>
                  <a href={APP_STORE_URLS.chrome} rel="noopener" data-track="nav_download_chrome" onClick={v.track}>
                    <span className="kvico">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
                        <circle cx="12" cy="12" r="9.5" />
                        <circle cx="12" cy="12" r="3.8" />
                        <path d="M15.3 10.1 20.7 6.9M8.7 10.1 4.2 6.9M12 15.8V21.5" />
                      </svg>
                    </span>
                    <span>
                      <b>Chrome</b>
                      <small>Chrome Web Store</small>
                    </span>
                  </a>
                </div>
              </div>
            </nav>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Link to={"/signin"} data-track="nav_login" className="kvh1" style={{ display: v.loginDisplay, alignItems: "center", padding: "9px 14px", borderRadius: "999px", fontSize: "14.5px", fontWeight: "500", color: "#0f2040", whiteSpace: "nowrap" }} onClick={v.track}>Log in</Link>
              <Link to={"/signin"} data-track="nav_get_started" className="kvh2" style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "44px", padding: "0 20px", borderRadius: "999px", background: "#f5660f", color: "#fff", fontSize: "14.5px", fontWeight: "600", whiteSpace: "nowrap", boxShadow: "0 6px 16px -6px rgba(245,102,15,.7)" }} onClick={v.track}>
                Get started
                <span aria-hidden="true">›</span>
              </Link>
              <button type="button" aria-label="Menu" aria-expanded={v.menuExpanded} style={{ display: v.burgerDisplay, alignItems: "center", justifyContent: "center", width: "44px", height: "44px", padding: "0", border: "0", borderRadius: "50%", background: "rgba(15,32,64,.07)", color: "#0f2040", cursor: "pointer" }} onClick={v.toggleMenu}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d={v.burgerPath} />
                </svg>
              </button>
            </div>
          </div>
          <nav aria-label="Mobile" style={{ maxHeight: "calc(100dvh - 96px)", overflowY: "auto", display: v.menuDisplay, position: "absolute", left: "0", right: "0", top: "68px", flexDirection: "column", gap: "2px", padding: "10px", borderRadius: "24px", background: "rgba(250,246,238,.96)", backdropFilter: "blur(16px)", border: "1px solid rgba(15,32,64,.08)", boxShadow: "0 24px 48px -16px rgba(15,32,64,.45)", fontSize: "16px" }}>
            <Link to={"/pricing"} className="kvh3" style={{ padding: "13px 14px", borderRadius: "12px", color: "#0f2040", fontWeight: "500" }} onClick={v.closeMenu}>Pricing</Link>
            <details className="kvmd">
              <summary>
                Features
                {" "}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <a href={marketingSiteUrl("/kill-switch.html")} onClick={v.closeMenu}>Kill Switch</a>
              <a href={marketingSiteUrl("/dedicated-ip.html")} onClick={v.closeMenu}>Dedicated IP</a>
              <a href={marketingSiteUrl("/leak-protection.html")} onClick={v.closeMenu}>Leak & DNS Protection</a>
              <a href={marketingSiteUrl("/split-tunneling.html")} onClick={v.closeMenu}>Split Tunneling</a>
              <a href={marketingSiteUrl("/high-speed-vpn.html")} onClick={v.closeMenu}>High-speed VPN</a>
            </details>
            <a href={marketingSiteUrl("/server-locations/")} className="kvh3" style={{ padding: "13px 14px", borderRadius: "12px", color: "#0f2040", fontWeight: "500" }} onClick={v.closeMenu}>Server Locations</a>
            <a href={marketingSiteUrl("/transfer.html")} className="kvh3" style={{ padding: "13px 14px", borderRadius: "12px", color: "#0f2040", fontWeight: "500" }} onClick={v.closeMenu}>Transfer</a>
            <a href={marketingSiteUrl("/settlements.html")} className="kvh3" style={{ padding: "13px 14px", borderRadius: "12px", color: "#0f2040", fontWeight: "500" }} onClick={v.closeMenu}>Settlements</a>
            <a href={marketingSiteUrl("/blog/")} className="kvh3" style={{ padding: "13px 14px", borderRadius: "12px", color: "#0f2040", fontWeight: "500" }} onClick={v.closeMenu}>Blog</a>
            <details className="kvmd">
              <summary>
                Download
                {" "}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <a href={APP_STORE_URLS.windows} rel="noopener" data-track="nav_mobile_download_windows" onClick={v.trackAndClose}>Download for Windows</a>
              <a href={APP_STORE_URLS.macos} rel="noopener" data-track="nav_mobile_download_macos" onClick={v.trackAndClose}>Download for macOS</a>
              <a href={APP_STORE_URLS.ios} rel="noopener" data-track="nav_mobile_download_ios" onClick={v.trackAndClose}>Download for iOS</a>
              <a href={APP_STORE_URLS.android} rel="noopener" data-track="nav_mobile_download_android" onClick={v.trackAndClose}>Download for Android</a>
              <a href={APP_STORE_URLS.chrome} rel="noopener" data-track="nav_mobile_download_chrome" onClick={v.trackAndClose}>Download for Chrome</a>
            </details>
            <Link to={"/signin"} className="kvh3" data-track="nav_mobile_login" style={{ padding: "13px 14px", borderRadius: "12px", color: "#0f2040", fontWeight: "500", borderTop: "1px solid rgba(15,32,64,.08)", marginTop: "6px" }} onClick={v.trackAndClose}>Log in</Link>
          </nav>
        </div>
      </header>
    </>
  );
}
