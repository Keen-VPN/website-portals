import { Helmet } from "react-helmet-async";
import SEOHead from "@/components/SEOHead";
import LandingNav from "@/components/test-landing/LandingNav";
import LandingHero from "@/components/test-landing/LandingHero";
import LandingSettlements from "@/components/test-landing/LandingSettlements";
import LandingTracking from "@/components/test-landing/LandingTracking";
import LandingCookies from "@/components/test-landing/LandingCookies";
import LandingLibraries from "@/components/test-landing/LandingLibraries";
import LandingPricingCta from "@/components/test-landing/LandingPricingCta";
import LandingFaq from "@/components/test-landing/LandingFaq";
import LandingDownload from "@/components/test-landing/LandingDownload";
import LandingFooter from "@/components/test-landing/LandingFooter";
import { useLandingPage } from "@/components/test-landing/useLandingPage";
import "@/components/test-landing/test-landing.css";

const TestLandingPage = () => {
  const v = useLandingPage();

  return (
    <div
      ref={v.rootRef}
      className="kv-landing"
      style={{
        fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif",
        color: "#141a2b",
        background: "#faf6ee",
        overflowX: "clip",
      }}
    >
      <SEOHead
        title="KeenVPN — Not just a VPN. We give you the edge online."
        description="KeenVPN helps you find class action settlements you may qualify for, protect your traffic from tracking, skip cookie pop-ups, and connect to servers in 80+ locations. Start a free trial."
        canonical="https://vpnkeen.com/test-landing-page"
        ogTitle="KeenVPN: We're not just a VPN, we give you the edge online."
        ogDescription="Class action settlements, tracking protection, automatic cookie banner handling and global VPN locations in one app."
        noIndex
      />
      <Helmet>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        />
      </Helmet>
      <LandingNav v={v} />
      <main>
        <LandingHero v={v} />
        <LandingSettlements v={v} />
        <LandingTracking v={v} />
        <LandingCookies v={v} />
        <LandingLibraries v={v} />
        <LandingPricingCta v={v} />
        <LandingFaq />
        <LandingDownload v={v} />
      </main>
      <LandingFooter v={v} />
    </div>
  );
};

export default TestLandingPage;
