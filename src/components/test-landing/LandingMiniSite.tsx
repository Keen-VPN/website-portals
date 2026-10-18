import type { CSSProperties } from "react";

export interface MiniSiteData {
  name: string;
  links: [string, string, string];
  cta: string;
  accent: string;
  photo: string;
  photoAlt: string;
  photoSource: string;
  photoPosition: string;
  tag: string;
  headline: string;
  byline: string;
  related: [{ title: string; tile: string }, { title: string; tile: string }];
}

interface MiniSiteProps {
  site: MiniSiteData;
  zIndex: number;
  opacity: number;
  transition: string;
}

const muted = "#8a8372";

/** One fake news/recipe/shop/travel page for the cookie-banner demo. */
export default function LandingMiniSite({ site, zIndex, opacity, transition }: MiniSiteProps) {
  const page: CSSProperties = {
    position: "absolute", inset: 0, padding: "16px 24px", display: "flex",
    flexDirection: "column", gap: "10px", background: "#fff", zIndex, opacity, transition,
  };
  return (
    <div className="kv-mini-page" style={page}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", height: "28px" }}>
        <span className="kv-mini-logo" style={{ display: "flex", alignItems: "center", gap: "7px", fontWeight: 800, fontSize: "14px", color: "#141a2b", letterSpacing: "-.02em" }}>
          <span style={{ width: "20px", height: "20px", borderRadius: "6px", background: site.accent }} />
          {site.name}
        </span>
        <span className="kv-mini-links" style={{ marginLeft: "auto", display: "flex", gap: "12px" }}>
          {site.links.map((l) => (
            <span key={l} style={{ fontSize: "11px", color: muted }}>{l}</span>
          ))}
        </span>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "#fff", background: site.accent, padding: "5px 10px", borderRadius: "999px" }}>{site.cta}</span>
      </div>
      <div style={{ height: "120px", borderRadius: "10px", overflow: "hidden", flex: "none" }}>
        <img src={site.photo} alt={site.photoAlt} data-photo-source={site.photoSource} loading="lazy" decoding="async" width="1000" height="667" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: site.photoPosition }} />
      </div>
      <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: ".08em", color: site.accent }}>{site.tag}</span>
      <span style={{ fontSize: "19px", lineHeight: 1.2, fontWeight: 800, letterSpacing: "-.025em", color: "#141a2b" }}>{site.headline}</span>
      <span style={{ fontSize: "11.5px", color: muted }}>{site.byline}</span>
      <div className="kv-mini-rel" style={{ display: "flex", gap: "16px", marginTop: "2px" }}>
        {site.related.map((r) => (
          <div key={r.title} style={{ flex: 1, display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ flex: "none", width: "42px", height: "42px", borderRadius: "8px", background: r.tile, opacity: 0.85 }} />
            <span style={{ display: "grid", gap: "6px", flex: 1 }}>
              <span style={{ fontSize: "11.5px", fontWeight: 600, color: "#2b3142", lineHeight: 1.25 }}>{r.title}</span>
              <span style={{ height: "6px", width: "56%", background: "#efe9db", borderRadius: "3px" }} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
