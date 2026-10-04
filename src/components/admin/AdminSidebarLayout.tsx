import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  ArrowRightLeft,
  BarChart3,
  CreditCard,
  DollarSign,
  Users,
  Activity,
  TrendingDown,
  Mail,
  Gift,
  Megaphone,
  UserCircle,
  Link2,
  Share2,
} from "lucide-react";
import { useFeatureFlags } from "@/lib/feature-flags";

function linkClass(isActive: boolean) {
  return [
    "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
    isActive
      ? "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-sm"
      : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
  ].join(" ");
}

export default function AdminSidebarLayout() {
  const { admin, logout, can } = useAdminAuth();
  const { workflowsEnabled } = useFeatureFlags();
  const navigate = useNavigate();

  const signOut = async () => {
    await logout();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 md:px-6">
        <aside className="sticky top-6 flex h-[calc(100vh-3rem)] w-72 shrink-0 flex-col overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-[#0f172a]/95 via-[#111827]/90 to-[#020617]/95 p-4 text-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.65)] backdrop-blur-xl">
          <div className="shrink-0 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <h1 className="text-base font-semibold tracking-tight text-white">
              KeenVPN Admin
            </h1>
            <p className="mt-1 text-xs text-white/70 break-all">
              {admin?.email}
            </p>
          </div>

          <nav className="mt-4 flex-1 space-y-2 overflow-y-auto">
            <NavLink
              to="/admin/overview"
              className={({ isActive }) => linkClass(isActive)}
            >
              <LayoutDashboard className="h-4 w-4" />
              Overview
            </NavLink>
            <NavLink
              to="/admin/membership-transfer"
              className={({ isActive }) => linkClass(isActive)}
            >
              <ArrowRightLeft className="h-4 w-4" />
              Membership Transfer
            </NavLink>
            <NavLink
              to="/admin/membership-sharing"
              className={({ isActive }) => linkClass(isActive)}
            >
              <Users className="h-4 w-4" />
              Membership Sharing
            </NavLink>
            <NavLink
              to="/admin/product-events"
              className={({ isActive }) => linkClass(isActive)}
            >
              <BarChart3 className="h-4 w-4" />
              Product Events
            </NavLink>
            <NavLink
              to="/admin/domain-insights"
              className={({ isActive }) => linkClass(isActive)}
            >
              <Mail className="h-4 w-4" />
              Domain Insights
            </NavLink>
            {can("emails.broadcast") ? (
              <NavLink
                to="/admin/broadcast-email"
                className={({ isActive }) => linkClass(isActive)}
              >
                <Mail className="h-4 w-4" />
                Broadcast Email
              </NavLink>
            ) : null}
            {can("emails.broadcast") ? (
              <NavLink
                to="/admin/email-unsubscribes"
                className={({ isActive }) => linkClass(isActive)}
              >
                <Mail className="h-4 w-4" />
                Email Unsubscribes
              </NavLink>
            ) : null}
            {can("emails.broadcast") ? (
              <NavLink
                to="/admin/class-action-email-cta"
                className={({ isActive }) => linkClass(isActive)}
              >
                <Mail className="h-4 w-4" />
                Class Action Email CTAs
              </NavLink>
            ) : null}
            <NavLink
              to="/admin/perks"
              className={({ isActive }) => linkClass(isActive)}
            >
              <Gift className="h-4 w-4" />
              Perks
            </NavLink>
            <NavLink
              to="/admin/hot-links"
              className={({ isActive }) => linkClass(isActive)}
            >
              <Link2 className="h-4 w-4" />
              Hot Links
            </NavLink>
            <NavLink
              to="/admin/affiliate-links"
              className={({ isActive }) => linkClass(isActive)}
            >
              <Share2 className="h-4 w-4" />
              Affiliate Links
            </NavLink>
            {workflowsEnabled ? (
              <NavLink
                to="/admin/workflows"
                className={({ isActive }) => linkClass(isActive)}
              >
                <Activity className="h-4 w-4" />
                Workflows
              </NavLink>
            ) : null}
            <NavLink
              to="/admin/perk-requests"
              className={({ isActive }) => linkClass(isActive)}
            >
              <Gift className="h-4 w-4" />
              Perk Requests
            </NavLink>
            <NavLink
              to="/admin/user-profiles"
              className={({ isActive }) => linkClass(isActive)}
            >
              <UserCircle className="h-4 w-4" />
              User Profiles
            </NavLink>
            <NavLink
              to="/admin/signup-sources"
              className={({ isActive }) => linkClass(isActive)}
            >
              <Megaphone className="h-4 w-4" />
              Signup Sources
            </NavLink>
            <NavLink
              to="/admin/connection-engagement"
              className={({ isActive }) => linkClass(isActive)}
            >
              <Activity className="h-4 w-4" />
              Connection Engagement
            </NavLink>
            <NavLink
              to="/admin/subscriptions"
              className={({ isActive }) => linkClass(isActive)}
            >
              <CreditCard className="h-4 w-4" />
              Subscriptions
            </NavLink>
            {can("pricing.read") ? (
              <NavLink
                to="/admin/pricing"
                className={({ isActive }) => linkClass(isActive)}
              >
                <DollarSign className="h-4 w-4" />
                Pricing
              </NavLink>
            ) : null}
            <NavLink
              to="/admin/churn"
              className={({ isActive }) => linkClass(isActive)}
            >
              <TrendingDown className="h-4 w-4" />
              Churn
            </NavLink>
            <NavLink
              to="/admin/jira-delivery"
              className={({ isActive }) => linkClass(isActive)}
            >
              <BarChart3 className="h-4 w-4" />
              Jira Delivery
            </NavLink>
            <NavLink
              to="/admin/sticker-campaigns"
              className={({ isActive }) => linkClass(isActive)}
            >
              <Megaphone className="h-4 w-4" />
              Sticker Campaigns
            </NavLink>
            <NavLink
              to="/admin/promotional-trial-qr"
              className={({ isActive }) => linkClass(isActive)}
            >
              <Gift className="h-4 w-4" />
              Promo Trial QR
            </NavLink>
            <NavLink
              to="/admin/landing-attribution"
              className={({ isActive }) => linkClass(isActive)}
            >
              <Megaphone className="h-4 w-4" />
              Landing Pages
            </NavLink>
            <NavLink
              to="/admin/download-funnel"
              className={({ isActive }) => linkClass(isActive)}
            >
              <Megaphone className="h-4 w-4" />
              Download Funnel
            </NavLink>
            <NavLink
              to="/admin/signup-trial-funnel"
              className={({ isActive }) => linkClass(isActive)}
            >
              <Megaphone className="h-4 w-4" />
              Signup → Trial
            </NavLink>
            <NavLink
              to="/admin/utm-attribution"
              className={({ isActive }) => linkClass(isActive)}
            >
              <Megaphone className="h-4 w-4" />
              UTM Attribution
            </NavLink>
            <NavLink
              to="/admin/users"
              className={({ isActive }) => linkClass(isActive)}
            >
              <Users className="h-4 w-4" />
              Admin Users
            </NavLink>
          </nav>

          <div className="mt-4 shrink-0">
            <Button
              className="w-full border-white/20 bg-white/10 text-white hover:bg-white/15"
              variant="outline"
              onClick={() => void signOut()}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </Button>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <Outlet />
        </section>
      </div>
    </div>
  );
}
