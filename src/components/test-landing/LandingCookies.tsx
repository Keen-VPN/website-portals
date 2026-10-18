import { Fragment } from "react";
import photo1 from "@/assets/test-landing/photo1.jpg";
import photo2 from "@/assets/test-landing/photo2.jpg";
import photo3 from "@/assets/test-landing/photo3.jpg";
import photo4 from "@/assets/test-landing/photo4.jpg";
import LandingMiniSite, { type MiniSiteData } from "./LandingMiniSite";
import type { LandingVals } from "./useLandingPage";

const U = "https://images.unsplash.com/";
const MINI_SITES: MiniSiteData[] = [
  { name: "News Daily", links: ["World", "Politics", "Climate"], cta: "Subscribe", accent: "#d8432f", photo: photo1, photoAlt: "City street with taxis and tall buildings", photoSource: U + "photo-1449824913935-59a10b8d2000", photoPosition: "50% 65%", tag: "WORLD", headline: "Leaders agree landmark climate deal after record talks", byline: "By Mara Ellis \u00b7 6 min read", related: [{ title: "Markets steady as rates hold", tile: "#2f5fb3" }, { title: "Ten cities rethinking transit", tile: "#d8432f" }] },
  { name: "Pantry & Co.", links: ["Recipes", "Meal plans", "Pantry"], cta: "Save", accent: "#d9822b", photo: photo2, photoAlt: "Pesto pasta with cherry tomatoes", photoSource: U + "photo-1473093295043-cdd812d0e601", photoPosition: "50% 50%", tag: "DINNER", headline: "Weeknight pasta in fifteen minutes flat", byline: "By Jonah Park \u00b7 15 min cook time", related: [{ title: "The only tomato sauce you need", tile: "#3f9a4a" }, { title: "Five-ingredient lemon spaghetti", tile: "#f0b84a" }] },
  { name: "STRIDE", links: ["New", "Men", "Women"], cta: "Cart (2)", accent: "#2a6fdb", photo: photo3, photoAlt: "Red running shoe on a red background", photoSource: U + "photo-1542291026-7eec264c27ff", photoPosition: "50% 55%", tag: "NEW SEASON", headline: "Cloudlight runners are back in six colours", byline: "From $89 \u00b7 Free returns", related: [{ title: "Trail pack 2.0", tile: "#2a6fdb" }, { title: "Everyday court classics", tile: "#141a2b" }] },
  { name: "Wayfarer", links: ["Guides", "Stays", "Deals"], cta: "Plan a trip", accent: "#1f9d8a", photo: photo4, photoAlt: "Yellow tram on a Lisbon street", photoSource: U + "photo-1585208798174-6cedd86e019a", photoPosition: "50% 65%", tag: "CITY GUIDE", headline: "48 hours in Lisbon: tiles, trams and custard tarts", byline: "By Ines Duarte \u00b7 8 min read", related: [{ title: "Where to eat in Alfama", tile: "#ff9a62" }, { title: "A slow day trip to Sintra", tile: "#1f9d8a" }] },
];

export default function LandingCookies({ v }: { v: LandingVals }) {
  const zs = [v.siteZ0, v.siteZ1, v.siteZ2, v.siteZ3];
  const ops = [v.siteOp0, v.siteOp1, v.siteOp2, v.siteOp3];
  const trs = [v.siteTr0, v.siteTr1, v.siteTr2, v.siteTr3];
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
              {MINI_SITES.map((site, i) => (
                <LandingMiniSite key={site.name} site={site} zIndex={zs[i]} opacity={ops[i]} transition={trs[i]} />
              ))}
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
