import { APP_STORE_URLS } from "@/constants/app-store-urls";
import type { LandingVals } from "./useLandingPage";

export default function LandingDownload({ v }: { v: LandingVals }) {
  return (
    <>
      <section data-screen-label="Download" data-track-section="download" style={{ padding: "clamp(64px,8vw,104px) 24px", textAlign: "center" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto", display: "grid", gap: "32px", justifyItems: "center" }}>
          <h2 style={{ margin: "0", fontSize: "clamp(30px,3.6vw,46px)", letterSpacing: "-.03em", fontWeight: "700" }}>Download KeenVPN wherever you browse.</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "center" }}>
            <a href={APP_STORE_URLS.windows} data-track="download_windows" className="kvh8" style={{ display: "inline-flex", alignItems: "center", gap: "10px", padding: "14px 24px 14px 20px", border: "1px solid #d9d0bd", borderRadius: "999px", fontWeight: "600" }} onClick={v.track}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" style={{ flex: "none", display: "block" }}>
                <path d="M3 4.6 10.4 3.6v7.6H3zM11.4 3.5 21 2v9.2h-9.6zM3 12.8h7.4v7.6L3 19.4zM11.4 12.8H21V22l-9.6-1.5z" />
              </svg>
              Windows
            </a>
            <a href={APP_STORE_URLS.macos} data-track="download_macos" className="kvh8" style={{ display: "inline-flex", alignItems: "center", gap: "10px", padding: "14px 24px 14px 20px", border: "1px solid #d9d0bd", borderRadius: "999px", fontWeight: "600" }} onClick={v.track}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" style={{ flex: "none", display: "block" }}>
                <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
              </svg>
              macOS
            </a>
            <a href={APP_STORE_URLS.ios} data-track="download_ios" className="kvh8" style={{ display: "inline-flex", alignItems: "center", gap: "10px", padding: "14px 24px 14px 20px", border: "1px solid #d9d0bd", borderRadius: "999px", fontWeight: "600" }} onClick={v.track}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", display: "block" }}>
                <rect x="6.5" y="2" width="11" height="20" rx="2.6" />
                <path d="M10.5 18.8h3" />
              </svg>
              iOS
            </a>
            <a href={APP_STORE_URLS.android} data-track="download_android" className="kvh8" style={{ display: "inline-flex", alignItems: "center", gap: "10px", padding: "14px 24px 14px 20px", border: "1px solid #d9d0bd", borderRadius: "999px", fontWeight: "600" }} onClick={v.track}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" fillRule="evenodd" style={{ flex: "none", display: "block" }}>
                <path d="M5.5 9.5h13v8a1.5 1.5 0 0 1-1.5 1.5h-1v2.5a1.25 1.25 0 0 1-2.5 0V19h-3v2.5a1.25 1.25 0 0 1-2.5 0V19h-1A1.5 1.5 0 0 1 5.5 17.5z" />
                <rect x="2" y="9.5" width="2.5" height="7" rx="1.25" />
                <rect x="19.5" y="9.5" width="2.5" height="7" rx="1.25" />
                <path d="M5.7 8.3a6.3 6.3 0 0 1 12.6 0zM9.6 5.6a.7.7 0 1 0 0 .01zM14.4 5.6a.7.7 0 1 0 0 .01z" />
                <path d="m8 2.8 1.2 1.7M16 2.8l-1.2 1.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Android
            </a>
            <a href={APP_STORE_URLS.chrome} data-track="download_chrome" className="kvh8" style={{ display: "inline-flex", alignItems: "center", gap: "10px", padding: "14px 24px 14px 20px", border: "1px solid #d9d0bd", borderRadius: "999px", fontWeight: "600" }} onClick={v.track}>
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", display: "block" }}>
                <circle cx="12" cy="12" r="9.5" />
                <circle cx="12" cy="12" r="3.8" />
                <path d="M15.3 10.1 20.7 6.9M8.7 10.1 4.2 6.9M12 15.8V21.5" />
              </svg>
              Chrome
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
