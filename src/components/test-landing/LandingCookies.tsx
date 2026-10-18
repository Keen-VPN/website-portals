import { Fragment } from "react";
import photo1 from "@/assets/test-landing/photo1.jpg";
import photo2 from "@/assets/test-landing/photo2.jpg";
import photo3 from "@/assets/test-landing/photo3.jpg";
import photo4 from "@/assets/test-landing/photo4.jpg";
import type { LandingVals } from "./useLandingPage";

export default function LandingCookies({ v }: { v: LandingVals }) {
  return (
    <>
      <section id="cookies" data-screen-label="Cookies" data-track-section="cookies" style={{ padding: "clamp(72px,9vw,128px) 24px" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,460px),1fr))", gap: "clamp(40px,6vw,88px)", alignItems: "center" }}>
          <div data-reveal="" aria-hidden="true" style={{ position: "relative", border: "1px solid #e0d8c7", borderRadius: "14px", background: "#fff", overflow: "hidden", height: "420px", boxShadow: "0 30px 60px -36px rgba(15,32,64,.35)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderBottom: "1px solid #eee7d9", background: "#f6f1e7" }}>
              <div style={{ display: "flex", gap: "6px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#d9cfbd" }} />
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#d9cfbd" }} />
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#d9cfbd" }} />
              </div>
              <div style={{ flex: "1", background: "#fff", border: "1px solid #e7e1d4", borderRadius: "6px", padding: "5px 12px", fontSize: "13px", color: "#5b6273", fontFamily: "ui-monospace,Menlo,monospace" }}>{v.cookieSite}</div>
            </div>
            <div style={{ position: "relative", height: "calc(100% - 49px)" }}>
              <div className="kv-mini-page" style={{ position: "absolute", inset: "0", padding: "16px 24px", display: "flex", flexDirection: "column", gap: "10px", background: "#fff", zIndex: v.siteZ0, opacity: v.siteOp0, transition: v.siteTr0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px", height: "28px" }}>
                  <span className="kv-mini-logo" style={{ display: "flex", alignItems: "center", gap: "7px", fontWeight: "800", fontSize: "14px", color: "#141a2b", letterSpacing: "-.02em" }}>
                    <span style={{ width: "20px", height: "20px", borderRadius: "6px", background: "#d8432f" }} />
                    News Daily
                  </span>
                  <span className="kv-mini-links" style={{ marginLeft: "auto", display: "flex", gap: "12px" }}>
                    <span style={{ fontSize: "11px", color: "#8a8372" }}>World</span>
                    <span style={{ fontSize: "11px", color: "#8a8372" }}>Politics</span>
                    <span style={{ fontSize: "11px", color: "#8a8372" }}>Climate</span>
                  </span>
                  <span style={{ fontSize: "11px", fontWeight: "600", color: "#fff", background: "#d8432f", padding: "5px 10px", borderRadius: "999px" }}>Subscribe</span>
                </div>
                <div style={{ height: "120px", borderRadius: "10px", overflow: "hidden", flex: "none" }}>
                  <img src={photo1} alt="City street with taxis and tall buildings" data-photo-source="https://images.unsplash.com/photo-1449824913935-59a10b8d2000" decoding="async" width="1000" height="667" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 65%" }} />
                </div>
                <span style={{ fontSize: "10px", fontWeight: "700", letterSpacing: ".08em", color: "#d8432f" }}>WORLD</span>
                <span style={{ fontSize: "19px", lineHeight: "1.2", fontWeight: "800", letterSpacing: "-.025em", color: "#141a2b" }}>Leaders agree landmark climate deal after record talks</span>
                <span style={{ fontSize: "11.5px", color: "#8a8372" }}>By Mara Ellis · 6 min read</span>
                <div className="kv-mini-rel" style={{ display: "flex", gap: "16px", marginTop: "2px" }}>
                  <div style={{ flex: "1", display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ flex: "none", width: "42px", height: "42px", borderRadius: "8px", background: "#2f5fb3", opacity: ".85" }} />
                    <span style={{ display: "grid", gap: "6px", flex: "1" }}>
                      <span style={{ fontSize: "11.5px", fontWeight: "600", color: "#2b3142", lineHeight: "1.25" }}>Markets steady as rates hold</span>
                      <span style={{ height: "6px", width: "56%", background: "#efe9db", borderRadius: "3px" }} />
                    </span>
                  </div>
                  <div style={{ flex: "1", display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ flex: "none", width: "42px", height: "42px", borderRadius: "8px", background: "#d8432f", opacity: ".85" }} />
                    <span style={{ display: "grid", gap: "6px", flex: "1" }}>
                      <span style={{ fontSize: "11.5px", fontWeight: "600", color: "#2b3142", lineHeight: "1.25" }}>Ten cities rethinking transit</span>
                      <span style={{ height: "6px", width: "56%", background: "#efe9db", borderRadius: "3px" }} />
                    </span>
                  </div>
                </div>
              </div>
              <div className="kv-mini-page" style={{ position: "absolute", inset: "0", padding: "16px 24px", display: "flex", flexDirection: "column", gap: "10px", background: "#fff", zIndex: v.siteZ1, opacity: v.siteOp1, transition: v.siteTr1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px", height: "28px" }}>
                  <span className="kv-mini-logo" style={{ display: "flex", alignItems: "center", gap: "7px", fontWeight: "800", fontSize: "14px", color: "#141a2b", letterSpacing: "-.02em" }}>
                    <span style={{ width: "20px", height: "20px", borderRadius: "6px", background: "#d9822b" }} />
                    Pantry & Co.
                  </span>
                  <span className="kv-mini-links" style={{ marginLeft: "auto", display: "flex", gap: "12px" }}>
                    <span style={{ fontSize: "11px", color: "#8a8372" }}>Recipes</span>
                    <span style={{ fontSize: "11px", color: "#8a8372" }}>Meal plans</span>
                    <span style={{ fontSize: "11px", color: "#8a8372" }}>Pantry</span>
                  </span>
                  <span style={{ fontSize: "11px", fontWeight: "600", color: "#fff", background: "#d9822b", padding: "5px 10px", borderRadius: "999px" }}>Save</span>
                </div>
                <div style={{ height: "120px", borderRadius: "10px", overflow: "hidden", flex: "none" }}>
                  <img src={photo2} alt="Pesto pasta with cherry tomatoes" data-photo-source="https://images.unsplash.com/photo-1473093295043-cdd812d0e601" decoding="async" width="1000" height="667" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 50%" }} />
                </div>
                <span style={{ fontSize: "10px", fontWeight: "700", letterSpacing: ".08em", color: "#d9822b" }}>DINNER</span>
                <span style={{ fontSize: "19px", lineHeight: "1.2", fontWeight: "800", letterSpacing: "-.025em", color: "#141a2b" }}>Weeknight pasta in fifteen minutes flat</span>
                <span style={{ fontSize: "11.5px", color: "#8a8372" }}>By Jonah Park · 15 min cook time</span>
                <div className="kv-mini-rel" style={{ display: "flex", gap: "16px", marginTop: "2px" }}>
                  <div style={{ flex: "1", display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ flex: "none", width: "42px", height: "42px", borderRadius: "8px", background: "#3f9a4a", opacity: ".85" }} />
                    <span style={{ display: "grid", gap: "6px", flex: "1" }}>
                      <span style={{ fontSize: "11.5px", fontWeight: "600", color: "#2b3142", lineHeight: "1.25" }}>The only tomato sauce you need</span>
                      <span style={{ height: "6px", width: "56%", background: "#efe9db", borderRadius: "3px" }} />
                    </span>
                  </div>
                  <div style={{ flex: "1", display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ flex: "none", width: "42px", height: "42px", borderRadius: "8px", background: "#f0b84a", opacity: ".85" }} />
                    <span style={{ display: "grid", gap: "6px", flex: "1" }}>
                      <span style={{ fontSize: "11.5px", fontWeight: "600", color: "#2b3142", lineHeight: "1.25" }}>Five-ingredient lemon spaghetti</span>
                      <span style={{ height: "6px", width: "56%", background: "#efe9db", borderRadius: "3px" }} />
                    </span>
                  </div>
                </div>
              </div>
              <div className="kv-mini-page" style={{ position: "absolute", inset: "0", padding: "16px 24px", display: "flex", flexDirection: "column", gap: "10px", background: "#fff", zIndex: v.siteZ2, opacity: v.siteOp2, transition: v.siteTr2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px", height: "28px" }}>
                  <span className="kv-mini-logo" style={{ display: "flex", alignItems: "center", gap: "7px", fontWeight: "800", fontSize: "14px", color: "#141a2b", letterSpacing: "-.02em" }}>
                    <span style={{ width: "20px", height: "20px", borderRadius: "6px", background: "#2a6fdb" }} />
                    STRIDE
                  </span>
                  <span className="kv-mini-links" style={{ marginLeft: "auto", display: "flex", gap: "12px" }}>
                    <span style={{ fontSize: "11px", color: "#8a8372" }}>New</span>
                    <span style={{ fontSize: "11px", color: "#8a8372" }}>Men</span>
                    <span style={{ fontSize: "11px", color: "#8a8372" }}>Women</span>
                  </span>
                  <span style={{ fontSize: "11px", fontWeight: "600", color: "#fff", background: "#2a6fdb", padding: "5px 10px", borderRadius: "999px" }}>Cart (2)</span>
                </div>
                <div style={{ height: "120px", borderRadius: "10px", overflow: "hidden", flex: "none" }}>
                  <img src={photo3} alt="Red running shoe on a red background" data-photo-source="https://images.unsplash.com/photo-1542291026-7eec264c27ff" decoding="async" width="1000" height="667" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 55%" }} />
                </div>
                <span style={{ fontSize: "10px", fontWeight: "700", letterSpacing: ".08em", color: "#2a6fdb" }}>NEW SEASON</span>
                <span style={{ fontSize: "19px", lineHeight: "1.2", fontWeight: "800", letterSpacing: "-.025em", color: "#141a2b" }}>Cloudlight runners are back in six colours</span>
                <span style={{ fontSize: "11.5px", color: "#8a8372" }}>From $89 · Free returns</span>
                <div className="kv-mini-rel" style={{ display: "flex", gap: "16px", marginTop: "2px" }}>
                  <div style={{ flex: "1", display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ flex: "none", width: "42px", height: "42px", borderRadius: "8px", background: "#2a6fdb", opacity: ".85" }} />
                    <span style={{ display: "grid", gap: "6px", flex: "1" }}>
                      <span style={{ fontSize: "11.5px", fontWeight: "600", color: "#2b3142", lineHeight: "1.25" }}>Trail pack 2.0</span>
                      <span style={{ height: "6px", width: "56%", background: "#efe9db", borderRadius: "3px" }} />
                    </span>
                  </div>
                  <div style={{ flex: "1", display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ flex: "none", width: "42px", height: "42px", borderRadius: "8px", background: "#141a2b", opacity: ".85" }} />
                    <span style={{ display: "grid", gap: "6px", flex: "1" }}>
                      <span style={{ fontSize: "11.5px", fontWeight: "600", color: "#2b3142", lineHeight: "1.25" }}>Everyday court classics</span>
                      <span style={{ height: "6px", width: "56%", background: "#efe9db", borderRadius: "3px" }} />
                    </span>
                  </div>
                </div>
              </div>
              <div className="kv-mini-page" style={{ position: "absolute", inset: "0", padding: "16px 24px", display: "flex", flexDirection: "column", gap: "10px", background: "#fff", zIndex: v.siteZ3, opacity: v.siteOp3, transition: v.siteTr3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "14px", height: "28px" }}>
                  <span className="kv-mini-logo" style={{ display: "flex", alignItems: "center", gap: "7px", fontWeight: "800", fontSize: "14px", color: "#141a2b", letterSpacing: "-.02em" }}>
                    <span style={{ width: "20px", height: "20px", borderRadius: "6px", background: "#1f9d8a" }} />
                    Wayfarer
                  </span>
                  <span className="kv-mini-links" style={{ marginLeft: "auto", display: "flex", gap: "12px" }}>
                    <span style={{ fontSize: "11px", color: "#8a8372" }}>Guides</span>
                    <span style={{ fontSize: "11px", color: "#8a8372" }}>Stays</span>
                    <span style={{ fontSize: "11px", color: "#8a8372" }}>Deals</span>
                  </span>
                  <span style={{ fontSize: "11px", fontWeight: "600", color: "#fff", background: "#1f9d8a", padding: "5px 10px", borderRadius: "999px" }}>Plan a trip</span>
                </div>
                <div style={{ height: "120px", borderRadius: "10px", overflow: "hidden", flex: "none" }}>
                  <img src={photo4} alt="Yellow tram on a Lisbon street" data-photo-source="https://images.unsplash.com/photo-1585208798174-6cedd86e019a" decoding="async" width="1000" height="667" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 65%" }} />
                </div>
                <span style={{ fontSize: "10px", fontWeight: "700", letterSpacing: ".08em", color: "#1f9d8a" }}>CITY GUIDE</span>
                <span style={{ fontSize: "19px", lineHeight: "1.2", fontWeight: "800", letterSpacing: "-.025em", color: "#141a2b" }}>48 hours in Lisbon: tiles, trams and custard tarts</span>
                <span style={{ fontSize: "11.5px", color: "#8a8372" }}>By Ines Duarte · 8 min read</span>
                <div className="kv-mini-rel" style={{ display: "flex", gap: "16px", marginTop: "2px" }}>
                  <div style={{ flex: "1", display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ flex: "none", width: "42px", height: "42px", borderRadius: "8px", background: "#ff9a62", opacity: ".85" }} />
                    <span style={{ display: "grid", gap: "6px", flex: "1" }}>
                      <span style={{ fontSize: "11.5px", fontWeight: "600", color: "#2b3142", lineHeight: "1.25" }}>Where to eat in Alfama</span>
                      <span style={{ height: "6px", width: "56%", background: "#efe9db", borderRadius: "3px" }} />
                    </span>
                  </div>
                  <div style={{ flex: "1", display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ flex: "none", width: "42px", height: "42px", borderRadius: "8px", background: "#1f9d8a", opacity: ".85" }} />
                    <span style={{ display: "grid", gap: "6px", flex: "1" }}>
                      <span style={{ fontSize: "11.5px", fontWeight: "600", color: "#2b3142", lineHeight: "1.25" }}>A slow day trip to Sintra</span>
                      <span style={{ height: "6px", width: "56%", background: "#efe9db", borderRadius: "3px" }} />
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ position: "absolute", zIndex: "5", left: "16px", right: "16px", bottom: "16px", background: "#141a2b", color: "#fff", borderRadius: "10px", padding: "16px 18px", display: "grid", gap: "12px", transform: v.bannerTransform, opacity: v.bannerOpacity, transition: "transform .55s cubic-bezier(.2,.8,.2,1),opacity .4s" }}>
              <span style={{ fontSize: "14px", lineHeight: "1.45" }}>We value your privacy. We and our 842 partners use cookies to personalise ads and content.</span>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ background: "#fff", color: "#141a2b", fontSize: "13px", fontWeight: "600", padding: "7px 12px", borderRadius: "6px" }}>Accept all</span>
                <span style={{ border: "1px solid #4b5368", fontSize: "13px", padding: "7px 12px", borderRadius: "6px" }}>Manage options</span>
              </div>
            </div>
            <div style={{ position: "absolute", zIndex: "6", top: "66px", right: "16px", background: "#0f2040", color: "#fff", borderRadius: "999px", padding: "8px 14px", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px", transform: v.toastTransform, opacity: v.toastOpacity, transition: "transform .45s cubic-bezier(.2,.8,.2,1),opacity .35s" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#f5660f" }} />
              {v.toastText}
            </div>
          </div>
          <div data-reveal="" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <span style={{ alignSelf: "flex-start", background: "#efe6d2", color: "#5c4a24", fontSize: "12px", fontWeight: "600", letterSpacing: ".06em", textTransform: "uppercase", padding: "5px 10px", borderRadius: "4px" }}>Cookie banner blocking</span>
            <h2 style={{ margin: "0", fontSize: "clamp(36px,4.6vw,60px)", lineHeight: "1.04", letterSpacing: "-.03em", fontWeight: "700", textWrap: "balance" }}>Fewer pop-ups. More browsing.</h2>
            <p style={{ margin: "0", fontSize: "19px", lineHeight: "1.55", color: "#4d5568", maxWidth: "520px", textWrap: "pretty" }}>KeenVPN answers supported cookie banners for you, the way you've told it to, so pages open without a wall of consent buttons.</p>
            <div style={{ display: "grid", gap: "10px" }}>
              <span style={{ fontSize: "14px", fontWeight: "600", color: "#5b6273" }}>Choose how banners are handled</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {v.cookieModes.map((m, i) => (
                  <Fragment key={i}>
                    <button type="button" aria-pressed={m.on} style={{ font: "inherit", fontSize: "15px", fontWeight: "600", padding: "10px 16px", borderRadius: "8px", cursor: "pointer", border: `1px solid ${m.border}`, background: m.bg, color: m.color }} onClick={m.select}>{m.label}</button>
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
