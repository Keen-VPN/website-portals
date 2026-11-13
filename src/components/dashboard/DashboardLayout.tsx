import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import DashboardSidebar from "./DashboardSidebar";
import DashboardTopBar from "./DashboardTopBar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Home",
  "/vpn": "VPN",
  "/subscription": "Subscription",
  "/referrals": "Refer",
  "/profile": "Profile",
  "/downloads": "Downloads",
  "/class-action": "Class Actions",
  "/ai-assistant": "AI Assistant",
  "/flight-compensation": "Flight Compensation",
};

export default function DashboardLayout() {
  const location = useLocation();
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  const title =
    PAGE_TITLES[pathname] ??
    (pathname.startsWith("/class-action/") ||
    pathname.startsWith("/class-actions/")
      ? "Class Actions"
      : "Dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (media.matches) setMobileNavOpen(false);
    };
    closeOnDesktop();
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const previousHtmlBg = root.style.backgroundColor;
    const previousBodyBg = document.body.style.backgroundColor;
    root.style.backgroundColor = "#f5f7fb";
    document.body.style.backgroundColor = "#f5f7fb";
    root.classList.add("dashboard-light");
    return () => {
      root.style.backgroundColor = previousHtmlBg;
      document.body.style.backgroundColor = previousBodyBg;
      root.classList.remove("dashboard-light");
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-[#f5f7fb] text-[#0f2040]">
      {/* Desktop sidebar */}
      <div className="sticky top-0 hidden h-screen shrink-0 lg:block">
        <DashboardSidebar className="h-screen shadow-[8px_0px_15px_rgba(15,32,64,0.03)]" />
      </div>

      {/* Mobile drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="w-[280px] max-w-[85vw] gap-0 border-[#e7edf5] bg-white p-0 [&>button]:right-3 [&>button]:top-4 [&>button]:text-[#0f2040]"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <DashboardSidebar
            className="h-full w-full border-0"
            onNavigate={() => setMobileNavOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopBar
          title={title}
          onOpenNav={() => setMobileNavOpen(true)}
        />
        <main className="flex-1 overflow-x-hidden overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
