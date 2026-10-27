import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Home,
  Shield,
  Gavel,
  Plane,
  Sparkles,
  CreditCard,
  Download,
  User,
  Gift,
  Headphones,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { marketingSiteUrl } from "@/lib/site-urls";
import { formatReferralRewardLabel } from "@/lib/referral-campaign-copy";
import { useReferralPromoMonths } from "@/hooks/use-referral-promo-months";
import {
  hasManageableSubscription,
  resolveMembershipPlanTier,
} from "@/lib/subscription-cta";
import { cn } from "@/lib/utils";

function navLinkClass(isActive: boolean) {
  return [
    "flex w-full items-center gap-4 rounded-[9px] px-[11px] py-[10px] text-[16px] font-medium transition-colors [&>svg]:transition-colors",
    isActive
      ? "bg-[#0f2040] text-white [&>svg]:text-[#ed7d36]"
      : "text-[#627086] hover:bg-[#f0f3f8] hover:text-[#0f2040]",
  ].join(" ");
}

function footerInitials(displayName: string, email: string) {
  const name = displayName.trim();
  if (name) {
    return name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  const local = email.trim().split("@")[0] ?? "";
  return local.slice(0, 2).toUpperCase() || "?";
}

export interface DashboardSidebarProps {
  className?: string;
  /** Called after a nav link is clicked (used to close the mobile drawer). */
  onNavigate?: () => void;
}

export default function DashboardSidebar({
  className,
  onNavigate,
}: DashboardSidebarProps) {
  const { user, subscription, logout } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const promoMonths = useReferralPromoMonths();

  const email = user?.email ?? "";
  const displayName = user?.displayName?.trim() || "";
  const primaryLabel = displayName || email || "Account";
  const initials = footerInitials(displayName, email);

  const planLabel = hasManageableSubscription(subscription)
    ? resolveMembershipPlanTier(subscription) === "business"
      ? "Business plan"
      : "Premium plan"
    : "Free plan";

  const promoLabel = formatReferralRewardLabel(promoMonths);

  const linkProps = {
    onClick: () => onNavigate?.(),
  };

  return (
    <aside
      className={cn(
        "flex h-full w-[252px] shrink-0 flex-col border-r border-[#e7edf5] bg-white",
        className,
      )}
    >
      {/* Logo */}
      <div className="flex flex-col border-b border-[#e7edf5] px-5 py-[23px]">
        <a
          href={marketingSiteUrl()}
          className="flex w-fit items-center gap-2"
          aria-label="KeenVPN home"
          onClick={() => onNavigate?.()}
        >
          <img
            src="/logo.png"
            alt=""
            className="h-9 w-9 shrink-0 object-contain"
          />
          <span className="text-[22px] font-bold tracking-tight text-[#0f2040]">
            KeenVPN
          </span>
        </a>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-[23px] py-8">
        <NavLink
          to="/dashboard"
          className={({ isActive }) => navLinkClass(isActive)}
          {...linkProps}
        >
          <Home className="h-4 w-4 shrink-0" />
          Home
        </NavLink>

        <div className="mb-1 mt-3 px-[9px]">
          <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#a0aabb]">
            Products
          </p>
        </div>

        <NavLink
          to="/vpn"
          className={({ isActive }) => navLinkClass(isActive)}
          {...linkProps}
        >
          <Shield className="h-4 w-4 shrink-0" />
          KeenVPN
        </NavLink>

        <NavLink
          to="/class-action"
          className={({ isActive }) => navLinkClass(isActive)}
          {...linkProps}
        >
          <Gavel className="h-4 w-4 shrink-0" />
          Class Actions
        </NavLink>

        <NavLink
          to="/flight-compensation"
          className={({ isActive }) => navLinkClass(isActive)}
          {...linkProps}
        >
          <Plane className="h-4 w-4 shrink-0" />
          Flight Compensation
        </NavLink>

        <NavLink
          to="/ai-assistant"
          className={({ isActive }) => navLinkClass(isActive)}
          {...linkProps}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          AI Assistant
        </NavLink>

        <div className="mb-1 mt-3 px-[9px]">
          <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#a0aabb]">
            Account
          </p>
        </div>

        <NavLink
          to="/subscription"
          className={({ isActive }) => navLinkClass(isActive)}
          {...linkProps}
        >
          <CreditCard className="h-4 w-4 shrink-0" />
          Subscription
        </NavLink>

        <NavLink
          to="/downloads"
          className={({ isActive }) => navLinkClass(isActive)}
          {...linkProps}
        >
          <Download className="h-4 w-4 shrink-0" />
          Downloads
        </NavLink>

        <NavLink
          to="/profile"
          className={({ isActive }) => navLinkClass(isActive)}
          {...linkProps}
        >
          <User className="h-4 w-4 shrink-0" />
          Profile
        </NavLink>

        <NavLink
          to="/referrals"
          className={({ isActive }) => navLinkClass(isActive)}
          {...linkProps}
        >
          <Gift className="h-4 w-4 shrink-0" />
          Refer &amp; Earn
        </NavLink>

        <NavLink
          to="/support"
          className={({ isActive }) => navLinkClass(isActive)}
          {...linkProps}
        >
          <Headphones className="h-4 w-4 shrink-0" />
          Support
        </NavLink>
      </nav>

      {/* Refer & Earn promo card */}
      <div className="mx-[14px] mb-3 rounded-[12px] border border-[#e5d8c6] bg-[#fffdf8] p-[19px]">
        <Gift className="h-5 w-5 text-[#ed7d36]" />
        <p className="mt-2 text-[15px] font-bold text-[#172033]">
          Refer &amp; Earn
        </p>
        <p className="mt-1 text-[12px] leading-[19px] text-[#7d899c]">
          Get up to {promoLabel} for every friend.
        </p>
        <button
          type="button"
          onClick={() => {
            navigate("/referrals");
            onNavigate?.();
          }}
          className="mt-3 w-full rounded-[7px] bg-[#0f2040] py-[11px] text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          Invite Friends
        </button>
      </div>

      {/* User footer */}
      <div className="flex items-center gap-3 border-t border-[#e7edf5] px-[14px] py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0f2040] text-[12px] font-semibold text-white">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-[#10213d]">
            {primaryLabel}
          </p>
          <p className="text-[12px] text-[#627086]">{planLabel}</p>
        </div>
        <button
          type="button"
          aria-label="Sign out"
          disabled={signingOut}
          onClick={() => {
            void (async () => {
              setSigningOut(true);
              try {
                const signedOut = await logout();
                if (!signedOut) return;
                onNavigate?.();
                navigate("/signin");
              } finally {
                setSigningOut(false);
              }
            })();
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[#e7edf5] text-[#627086] transition-colors hover:bg-[#f5f7fb] hover:text-[#0f2040] disabled:opacity-50"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  );
}
