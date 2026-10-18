
export default function LandingFaq() {
  return (
    <>
      <section id="faq" data-screen-label="FAQ" data-track-section="faq" style={{ padding: "clamp(64px,8vw,104px) 24px", borderTop: "1px solid #e7e1d4" }}>
        <div className="kv-faq" style={{ maxWidth: "1180px", margin: "0 auto", display: "flex", flexWrap: "wrap", gap: "40px clamp(40px,6vw,88px)", alignItems: "flex-start" }}>
          <div data-reveal="" style={{ flex: "1 1 300px", maxWidth: "420px", display: "flex", flexDirection: "column", gap: "20px" }}>
            <span style={{ alignSelf: "flex-start", background: "#efe6d2", color: "#5c4a24", fontSize: "12px", fontWeight: "600", letterSpacing: ".06em", textTransform: "uppercase", padding: "5px 10px", borderRadius: "4px" }}>FAQ</span>
            <h2 style={{ margin: "0", fontSize: "clamp(32px,4vw,52px)", lineHeight: "1.05", letterSpacing: "-.03em", fontWeight: "700", textWrap: "balance" }}>Questions, answered.</h2>
            <p style={{ margin: "0", fontSize: "18px", lineHeight: "1.55", color: "#4d5568", textWrap: "pretty" }}>Straight answers on privacy, plans, settlements and who is behind KeenVPN.</p>
          </div>
          <div data-reveal="" style={{ flex: "2 1 460px", display: "grid", gap: "12px", minWidth: "0" }}>
            <details open style={{ background: "#fffdf8", border: "1px solid #e7e1d4", borderRadius: "16px", transition: "border-color .2s,box-shadow .2s" }}>
              <summary style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "20px 22px", fontSize: "17px", fontWeight: "600", letterSpacing: "-.01em", color: "#141a2b", borderRadius: "16px" }}>
                <span>What is KeenVPN and how does it work?</span>
                <span className="kv-pl" style={{ flex: "none", width: "32px", height: "32px", borderRadius: "50%", background: "#f3ede1", color: "#0f2040", display: "grid", placeItems: "center", transition: "transform .25s ease,background .2s,color .2s" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </summary>
              <p className="kv-a" style={{ margin: "0", padding: "0 70px 22px 22px", fontSize: "16px", lineHeight: "1.6", color: "#4d5568", textWrap: "pretty" }}>KeenVPN encrypts your internet connection and hides your IP address, so your browsing stays private on any network. It also tracks active class-action and data-breach settlements you may qualify for, at no extra cost.</p>
            </details>
            <details style={{ background: "#fffdf8", border: "1px solid #e7e1d4", borderRadius: "16px", transition: "border-color .2s,box-shadow .2s" }}>
              <summary style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "20px 22px", fontSize: "17px", fontWeight: "600", letterSpacing: "-.01em", color: "#141a2b", borderRadius: "16px" }}>
                <span>Does KeenVPN keep logs of what I do?</span>
                <span className="kv-pl" style={{ flex: "none", width: "32px", height: "32px", borderRadius: "50%", background: "#f3ede1", color: "#0f2040", display: "grid", placeItems: "center", transition: "transform .25s ease,background .2s,color .2s" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </summary>
              <p className="kv-a" style={{ margin: "0", padding: "0 70px 22px 22px", fontSize: "16px", lineHeight: "1.6", color: "#4d5568", textWrap: "pretty" }}>No. KeenVPN runs on a strict no-logs policy, so your browsing history, traffic and connections are never recorded or sold.</p>
            </details>
            <details style={{ background: "#fffdf8", border: "1px solid #e7e1d4", borderRadius: "16px", transition: "border-color .2s,box-shadow .2s" }}>
              <summary style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "20px 22px", fontSize: "17px", fontWeight: "600", letterSpacing: "-.01em", color: "#141a2b", borderRadius: "16px" }}>
                <span>How many devices can I use at once?</span>
                <span className="kv-pl" style={{ flex: "none", width: "32px", height: "32px", borderRadius: "50%", background: "#f3ede1", color: "#0f2040", display: "grid", placeItems: "center", transition: "transform .25s ease,background .2s,color .2s" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </summary>
              <p className="kv-a" style={{ margin: "0", padding: "0 70px 22px 22px", fontSize: "16px", lineHeight: "1.6", color: "#4d5568", textWrap: "pretty" }}>Every plan lets you connect up to 10 devices at the same time, across macOS, Windows, iOS and Android.</p>
            </details>
            <details style={{ background: "#fffdf8", border: "1px solid #e7e1d4", borderRadius: "16px", transition: "border-color .2s,box-shadow .2s" }}>
              <summary style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "20px 22px", fontSize: "17px", fontWeight: "600", letterSpacing: "-.01em", color: "#141a2b", borderRadius: "16px" }}>
                <span>Is there a free trial?</span>
                <span className="kv-pl" style={{ flex: "none", width: "32px", height: "32px", borderRadius: "50%", background: "#f3ede1", color: "#0f2040", display: "grid", placeItems: "center", transition: "transform .25s ease,background .2s,color .2s" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </summary>
              <p className="kv-a" style={{ margin: "0", padding: "0 70px 22px 22px", fontSize: "16px", lineHeight: "1.6", color: "#4d5568", textWrap: "pretty" }}>Yes. You can try KeenVPN free for 30 days, and every plan is backed by a 30-day money-back guarantee.</p>
            </details>
            <details style={{ background: "#fffdf8", border: "1px solid #e7e1d4", borderRadius: "16px", transition: "border-color .2s,box-shadow .2s" }}>
              <summary style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "20px 22px", fontSize: "17px", fontWeight: "600", letterSpacing: "-.01em", color: "#141a2b", borderRadius: "16px" }}>
                <span>Does KeenVPN really find settlement money?</span>
                <span className="kv-pl" style={{ flex: "none", width: "32px", height: "32px", borderRadius: "50%", background: "#f3ede1", color: "#0f2040", display: "grid", placeItems: "center", transition: "transform .25s ease,background .2s,color .2s" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </summary>
              <p className="kv-a" style={{ margin: "0", padding: "0 70px 22px 22px", fontSize: "16px", lineHeight: "1.6", color: "#4d5568", textWrap: "pretty" }}>KeenVPN tracks active class-action and data-breach settlements and shows you the ones you may qualify for. It's informational — KeenVPN doesn't determine your eligibility or guarantee any payout.</p>
            </details>
            <details style={{ background: "#fffdf8", border: "1px solid #e7e1d4", borderRadius: "16px", transition: "border-color .2s,box-shadow .2s" }}>
              <summary style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "20px 22px", fontSize: "17px", fontWeight: "600", letterSpacing: "-.01em", color: "#141a2b", borderRadius: "16px" }}>
                <span>Do I get all the security features on every plan?</span>
                <span className="kv-pl" style={{ flex: "none", width: "32px", height: "32px", borderRadius: "50%", background: "#f3ede1", color: "#0f2040", display: "grid", placeItems: "center", transition: "transform .25s ease,background .2s,color .2s" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </summary>
              <p className="kv-a" style={{ margin: "0", padding: "0 70px 22px 22px", fontSize: "16px", lineHeight: "1.6", color: "#4d5568", textWrap: "pretty" }}>Yes. AES-256 encryption, the automatic kill switch and full leak protection are standard on every plan, with no premium tiers.</p>
            </details>
            <details style={{ background: "#fffdf8", border: "1px solid #e7e1d4", borderRadius: "16px", transition: "border-color .2s,box-shadow .2s" }}>
              <summary style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "20px 22px", fontSize: "17px", fontWeight: "600", letterSpacing: "-.01em", color: "#141a2b", borderRadius: "16px" }}>
                <span>Is KeenVPN a legitimate company?</span>
                <span className="kv-pl" style={{ flex: "none", width: "32px", height: "32px", borderRadius: "50%", background: "#f3ede1", color: "#0f2040", display: "grid", placeItems: "center", transition: "transform .25s ease,background .2s,color .2s" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </summary>
              <p className="kv-a" style={{ margin: "0", padding: "0 70px 22px 22px", fontSize: "16px", lineHeight: "1.6", color: "#4d5568", textWrap: "pretty" }}>Yes. KeenVPN is a product of Negative Nine Inc., a company registered in the United States with a published business address, Terms of Service and Privacy Policy. See our Manifesto for the full picture of who operates KeenVPN and why.</p>
            </details>
            <details style={{ background: "#fffdf8", border: "1px solid #e7e1d4", borderRadius: "16px", transition: "border-color .2s,box-shadow .2s" }}>
              <summary style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", padding: "20px 22px", fontSize: "17px", fontWeight: "600", letterSpacing: "-.01em", color: "#141a2b", borderRadius: "16px" }}>
                <span>Who owns KeenVPN?</span>
                <span className="kv-pl" style={{ flex: "none", width: "32px", height: "32px", borderRadius: "50%", background: "#f3ede1", color: "#0f2040", display: "grid", placeItems: "center", transition: "transform .25s ease,background .2s,color .2s" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </summary>
              <p className="kv-a" style={{ margin: "0", padding: "0 70px 22px 22px", fontSize: "16px", lineHeight: "1.6", color: "#4d5568", textWrap: "pretty" }}>KeenVPN is owned and operated by Negative Nine Inc., registered in the United States. Read the KeenVPN Manifesto for the company's full position on ownership, privacy and open internet access.</p>
            </details>
          </div>
        </div>
      </section>
    </>
  );
}
