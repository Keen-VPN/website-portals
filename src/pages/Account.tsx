import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AiConnectionsPanel } from "@/components/AiConnectionsPanel";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  LogOut,
  Shield,
  CreditCard,
  Calendar,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Trash2,
  History,
  ArrowUpCircle,
  Smartphone,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  deleteAccount,
  getSessionToken,
} from "@/auth";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { AccountWorkspace } from "@/components/AccountWorkspace";
import { MembershipPlanUpgradeCard } from "@/components/MembershipPlanUpgradeCard";
import { ReceivedMembershipInviteBanner } from "@/components/ReceivedMembershipInviteBanner";
import AppAuthReturn from "@/components/auth/AppAuthReturn";
import { ScheduledAnnualBillingNotice } from "@/components/ScheduledAnnualBillingNotice";
import { SubscriptionCancellationControls } from "@/components/SubscriptionCancellationControls";
import {
  MembershipSharingProvider,
  useMembershipSharingContext,
} from "@/contexts/MembershipSharingContext";
import {
  isAppDeepLinkSupported,
  getUnsupportedDeviceName,
} from "@/lib/device-detection";
import { useAppStoreUrl } from "@/hooks/use-app-store-url";
import {
  getAppStoreInstallButtonLabel,
  resolveAppStoreUrl,
} from "@/lib/open-app-or-store";
import { openKeenVpnAppStore } from "@/lib/keenvpn-deep-links";
import { useSubscriptionBillingActions } from "@/hooks/use-subscription-billing-actions";
import { useAnnualUpgrade } from "@/hooks/use-annual-upgrade";
import {
  ANNUAL_UPGRADE_BANNER_DISMISS_KEY,
  AnnualUpgradeBanner,
} from "@/components/AnnualUpgradeBanner";
import { AppleIapSubscriptionsCta } from "@/components/AppleIapSubscriptionsCta";
import {
  canUpgradeAppleIapToAnnual,
  canUpgradeStripeToAnnual,
  getSubscriptionCtaLabel,
  hasManageableSubscription,
  hasScheduledAnnualBilling,
  isTwoYearSubscription,
  shouldShowAnnualUpgradeOffer,
} from "@/lib/subscription-cta";
import {
  RETURN_TO_APP_LABEL,
  clearStripeCheckoutReturn,
  dismissAsWebAuthReturn,
  dismissStripePostCheckoutUi,
  isAsWebAuthReturnDismissed,
  markStripeAutoOpenDone,
  isStripeCheckoutReturn,
  markStripeCheckoutReturn,
  maybeAutoReturnToKeenVpnAppAfterAuth,
  returnToKeenVpnAppAfterPayment,
  shouldAutoOpenAppAfterStripeCheckout,
  shouldShowStripePostCheckoutUi,
} from "@/lib/keenvpn-deep-links";

const AccountInner = () => {
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  // true on normal /account (no session_id) — render subscription card immediately;
  // AuthContext usually has subscription already. Stripe return starts false (skeleton until sync).
  const [initialSubscriptionChecked, setInitialSubscriptionChecked] = useState(
    () => !new URLSearchParams(window.location.search).get("session_id"),
  );
  const [deleting, setDeleting] = useState(false);
  const [annualUpgradeBannerDismissed, setAnnualUpgradeBannerDismissed] =
    useState(
      () =>
        typeof window !== "undefined" &&
        localStorage.getItem(ANNUAL_UPGRADE_BANNER_DISMISS_KEY) === "1",
    );
  const {
    cancelling,
    portalLoading,
    cancelSubscriptionAtPeriodEnd,
    openBillingPortal,
    businessUpgradeLoading,
    upgradeToBusinessPlan,
  } = useSubscriptionBillingActions();
  const { upgrading, upgradeToAnnual } = useAnnualUpgrade();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const {
    user,
    loading,
    logout,
    subscription,
    trial,
    entitlements,
    entitlementsStatus,
    refreshSubscription,
    linkedProviders,
    refreshLinkedProviders,
    hasSessionToken,
    authProvider,
  } = useAuth();
  const appStoreUrl = useAppStoreUrl();
  const subscriptionCtaLabel = getSubscriptionCtaLabel(
    user,
    subscription,
    trial,
  );
  const workspaceEnabled =
    entitlementsStatus === "ready" &&
    entitlements?.workspace.enabled === true;
  const mayHaveWorkspaceAccess = Boolean(
    subscription || trial?.active || entitlements?.workspace.enabled,
  );
  const workspaceEntitlementLoading =
    hasSessionToken &&
    mayHaveWorkspaceAccess &&
    (entitlementsStatus === "idle" || entitlementsStatus === "loading");
  const workspaceEntitlementError =
    hasSessionToken &&
    mayHaveWorkspaceAccess &&
    entitlementsStatus === "error";
  const canManageBilling = subscription?.canManageBilling === true;
  const isTwoYear = isTwoYearSubscription(subscription);
  const { dashboard: membershipDashboard } = useMembershipSharingContext();
  const pendingBusinessTransfer =
    membershipDashboard?.role === "transfer_pending"
      ? membershipDashboard.pendingTransfer
      : null;
  const isSharedBusinessMember = membershipDashboard?.role === "member";
  const showOwnerRefundHelp =
    canManageBilling && !pendingBusinessTransfer && !isSharedBusinessMember;

  const isDeepLinkSupported = useMemo(() => isAppDeepLinkSupported(), []);
  const unsupportedDeviceName = useMemo(() => getUnsupportedDeviceName(), []);

  // ASWebAuthenticationSession detection
  const isASWeb = useMemo(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const detected =
      urlParams.get("asweb") === "1" ||
      sessionStorage.getItem("asweb_session") === "1";
    if (detected && urlParams.get("asweb") === "1") {
      sessionStorage.setItem("asweb_session", "1");
    }
    return detected;
  }, []);
  const hasStripeSessionId = useMemo(() => {
    const urlParams = new URLSearchParams(location.search);
    return Boolean(urlParams.get("session_id"));
  }, [location.search]);
  // Same query modes AccountRoute keeps on legacy /account. Remember the first
  // visit too: the email_prefs effect below strips its param after the toast.
  const hasLegacyAccountModeInUrl = useMemo(() => {
    const urlParams = new URLSearchParams(location.search);
    return ["tab", "billing", "business", "email_prefs"].some((key) =>
      urlParams.has(key),
    );
  }, [location.search]);
  const [openedInLegacyAccountMode] = useState(hasLegacyAccountModeInUrl);
  const isLegacyAccountMode =
    hasLegacyAccountModeInUrl || openedInLegacyAccountMode;
  const stripeSessionId = useMemo(() => {
    const urlParams = new URLSearchParams(location.search);
    return urlParams.get("session_id");
  }, [location.search]);
  const accountPathAfterStripeReturn = useMemo(() => {
    const params = new URLSearchParams(location.search);
    params.delete("session_id");
    if (isASWeb) {
      params.set("asweb", "1");
    }
    // Keep Business checkout on the Team tab after Stripe returns.
    if (
      params.get("business") === "upgraded" ||
      params.get("tab") === "team"
    ) {
      params.set("tab", "team");
    }
    const nextSearch = params.toString();
    return nextSearch ? `/account?${nextSearch}` : "/account";
  }, [isASWeb, location.search]);
  const processedStripeSessionRef = useRef<string | null>(null);
  const handledEmailUnsubscribeRef = useRef(false);
  const [showPostCheckoutUi, setShowPostCheckoutUi] = useState(() =>
    shouldShowStripePostCheckoutUi(),
  );

  // Mark Stripe return as soon as session_id is present (before auth loading finishes).
  // Otherwise already-signed-in ASWeb users briefly see the auth "Return to App" card instead.
  useEffect(() => {
    if (!hasStripeSessionId) {
      return;
    }
    markStripeCheckoutReturn(stripeSessionId);
    setShowPostCheckoutUi(shouldShowStripePostCheckoutUi());
  }, [hasStripeSessionId, stripeSessionId]);

  // Clear post-checkout markers only when signed out (not while auth is loading).
  useEffect(() => {
    if (loading) return;
    if (!user && !hasSessionToken) {
      clearStripeCheckoutReturn();
      setShowPostCheckoutUi(false);
    }
  }, [user, loading, hasSessionToken]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("email_prefs") !== "unsubscribed") return;
    if (handledEmailUnsubscribeRef.current) return;
    handledEmailUnsubscribeRef.current = true;
    toast({
      title: "Email preferences updated",
      description: "You are unsubscribed from personalized tips and offers.",
    });
    params.delete("email_prefs");
    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: true },
    );
  }, [location.search, location.pathname, navigate, toast]);

  const showPaymentCompleteBanner =
    Boolean(user) && hasSessionToken && showPostCheckoutUi;

  const showReturnToAppCta = showPaymentCompleteBanner && isASWeb;

  // Intentionally not calling clearStripeCheckoutReturn here — dismiss hides UI via
  // STRIPE_POST_CHECKOUT_UI_DISMISSED_KEY while preserving return/auto-open markers.
  const dismissPostCheckoutUi = () => {
    dismissStripePostCheckoutUi();
    setShowPostCheckoutUi(false);
  };

  useEffect(() => {
    if (!showPostCheckoutUi || !isASWeb) {
      return;
    }
    if (
      !initialSubscriptionChecked ||
      !shouldAutoOpenAppAfterStripeCheckout()
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      markStripeAutoOpenDone();
      returnToKeenVpnAppAfterPayment(getSessionToken(), appStoreUrl);
    }, 700);

    return () => window.clearTimeout(timer);
  }, [showPostCheckoutUi, isASWeb, initialSubscriptionChecked, appStoreUrl]);

  // The session token may not be in localStorage yet when Account first mounts
  // (AuthContext is still verifying with the backend). Poll until it arrives.
  const [sessionToken, setSessionToken] = useState<string | null>(() =>
    getSessionToken(),
  );
  useEffect(() => {
    if (!hasSessionToken) {
      setSessionToken(null);
      return;
    }
    if (sessionToken) return;

    const id = setInterval(() => {
      const token = getSessionToken();
      if (token) {
        setSessionToken(token);
        clearInterval(id);
      }
    }, 200);
    return () => clearInterval(id);
  }, [hasSessionToken, sessionToken]);

  // "Continue on web" leaves the app handoff for the dashboard. Clear the
  // tab flag too, or AccountRoute keeps /account on the legacy page.
  const [dismissedAuthReturnToken, setDismissedAuthReturnToken] = useState<
    string | null
  >(null);
  const authReturnDismissed =
    Boolean(sessionToken) &&
    (dismissedAuthReturnToken === sessionToken ||
      isAsWebAuthReturnDismissed(sessionToken));
  const dismissAuthReturn = () => {
    if (!sessionToken) return;
    dismissAsWebAuthReturn(sessionToken);
    setDismissedAuthReturnToken(sessionToken);
    try {
      sessionStorage.removeItem("asweb_session");
    } catch {
      /* private mode / blocked storage */
    }
    navigate("/dashboard", { replace: true });
  };

  // Auto-return to the macOS app after ASWeb Google login (fallback if AuthContext handoff missed).
  // "Continue on web" cancels a pending handoff for this token.
  useEffect(() => {
    if (
      !isASWeb ||
      !sessionToken ||
      !isDeepLinkSupported ||
      showPostCheckoutUi ||
      hasStripeSessionId ||
      isStripeCheckoutReturn() ||
      authReturnDismissed
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      maybeAutoReturnToKeenVpnAppAfterAuth(sessionToken);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    isASWeb,
    sessionToken,
    isDeepLinkSupported,
    showPostCheckoutUi,
    hasStripeSessionId,
    authReturnDismissed,
  ]);

  // On first account view, ensure subscription is hydrated before rendering
  // "No active subscription". This avoids a false empty state that required reload.
  useEffect(() => {
    let cancelled = false;

    const ensureInitialSubscription = async () => {
      if (loading) return;

      // Prevent re-entering the Stripe return refresh path on re-renders.
      // If this session_id was already processed, finalize state and strip it.
      if (
        stripeSessionId &&
        processedStripeSessionRef.current === stripeSessionId
      ) {
        if (!cancelled) {
          setSubscriptionLoading(false);
          setInitialSubscriptionChecked(true);
          navigate(accountPathAfterStripeReturn, {
            replace: true,
          });
        }
        return;
      }

      if (!user || !hasSessionToken) {
        if (!cancelled) {
          setSubscriptionLoading(false);
          setInitialSubscriptionChecked(true);
        }
        return;
      }

      // Normal visit: show account immediately; refresh subscription in background.
      if (!hasStripeSessionId) {
        if (!cancelled) {
          setSubscriptionLoading(false);
          setInitialSubscriptionChecked(true);
          if (!subscription) {
            void refreshSubscription();
          }
        }
        return;
      }

      if (!cancelled) {
        setSubscriptionLoading(true);
      }

      if (stripeSessionId) {
        processedStripeSessionRef.current = stripeSessionId;
      }

      const attempts = 3;
      const timeoutMs = 4000;

      const runRefreshWithTimeout = async () => {
        await Promise.race([
          refreshSubscription(),
          new Promise<void>((resolve) => {
            window.setTimeout(resolve, timeoutMs);
          }),
        ]);
      };

      for (let attempt = 0; attempt < attempts && !cancelled; attempt += 1) {
        await runRefreshWithTimeout();
        if (attempt < attempts - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 600));
        }
      }

      if (!cancelled) {
        setSubscriptionLoading(false);
        setInitialSubscriptionChecked(true);
        navigate(accountPathAfterStripeReturn, { replace: true });
      }
    };

    void ensureInitialSubscription();
    return () => {
      cancelled = true;
    };
  }, [
    loading,
    user,
    hasSessionToken,
    subscription,
    refreshSubscription,
    hasStripeSessionId,
    stripeSessionId,
    navigate,
    accountPathAfterStripeReturn,
  ]);

  const handleRefreshSubscription = async () => {
    setSubscriptionLoading(true);
    await refreshSubscription();
    setSubscriptionLoading(false);
  };

  const showStripeUpgradeToAnnual =
    canManageBilling && canUpgradeStripeToAnnual(subscription);
  const showAppleIapUpgradeToAnnual =
    canManageBilling && canUpgradeAppleIapToAnnual(subscription);
  // Banner owns the timed promo; inline card is fallback after dismiss or when no banner.
  const showAnnualUpgradeBanner =
    shouldShowAnnualUpgradeOffer(subscription) && !annualUpgradeBannerDismissed;
  const showStripeUpgradeInCard =
    showStripeUpgradeToAnnual && !showAnnualUpgradeBanner;
  const showAppleIapUpgradeInCard =
    showAppleIapUpgradeToAnnual && !showAnnualUpgradeBanner;
  const handleDeleteAccount = async () => {
    if (!user) return;
    const token = getSessionToken();
    if (!token) {
      toast({
        title: "Deletion Failed",
        description: "No session token found. Please sign in again.",
        variant: "destructive",
      });
      return;
    }

    try {
      setDeleting(true);

      const result = await deleteAccount(token);

      if (result.success) {
        toast({
          title: "Account Deleted",
          description:
            "Your account and all associated data have been permanently deleted.",
        });

        // Sign out and redirect to home
        await logout();
        navigate("/");
      } else {
        throw new Error(result.error || "Failed to delete account");
      }
    } catch (error) {
      toast({
        title: "Deletion Failed",
        description:
          error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500";
      case "inactive":
        return "bg-gray-500";
      case "past_due":
        return "bg-yellow-500";
      case "cancelled":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "active":
        return "Active";
      case "inactive":
        return "Inactive";
      case "past_due":
        return "Past Due";
      case "cancelled":
        return "Cancelled";
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 py-20 bg-gradient-hero">
          <div className="container mx-auto px-4 max-w-4xl">
            <div className="mb-8">
              <h1 className="text-4xl font-bold text-foreground mb-4">
                My <span className="text-primary">Account</span>
              </h1>
              <Skeleton className="h-6 w-80" />
            </div>
            <div className="grid md:grid-cols-2 gap-8 items-start">
              {/* Account Info Skeleton */}
              <Card className="border-accent/50 shadow-glow">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Shield className="h-5 w-5 mr-2" />
                    Account Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Skeleton className="h-3 w-10 mb-2" />
                    <Skeleton className="h-5 w-48" />
                  </div>
                  <div>
                    <Skeleton className="h-3 w-14 mb-2" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                  <Skeleton className="h-10 w-full rounded-md" />
                </CardContent>
              </Card>

              {/* Subscription Status Skeleton */}
              <Card className="border-accent/50 shadow-glow">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <CreditCard className="h-5 w-5 mr-2" />
                    Subscription Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                  <div>
                    <Skeleton className="h-3 w-10 mb-2" />
                    <Skeleton className="h-5 w-40" />
                  </div>
                  <Skeleton className="h-16 w-full rounded-lg" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </CardContent>
              </Card>
            </div>

            <Card className="mt-10 border-accent/40 shadow-card">
              <CardHeader>
                <Skeleton className="h-7 w-36" />
                <Skeleton className="mt-2 h-4 w-full max-w-md" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Skeleton className="h-20 rounded-lg" />
                  <Skeleton className="h-20 rounded-lg" />
                  <Skeleton className="h-20 rounded-lg" />
                  <Skeleton className="h-20 rounded-lg" />
                </div>
                <Skeleton className="h-64 w-full rounded-xl" />
              </CardContent>
            </Card>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 py-20 bg-gradient-hero flex items-center justify-center">
          <Card className="max-w-md w-full text-center border-accent/50 shadow-glow">
            <CardHeader>
              <CardTitle>Sign In Required</CardTitle>
              <CardDescription>
                You need to sign in to view your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/subscribe")} className="w-full">
                {subscriptionCtaLabel}
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  // ASWeb auth return — not during Stripe checkout return (payment banner uses
  // vpnkeen://success) or the tab/billing/business/email_prefs account modes.
  if (
    isASWeb &&
    !showPostCheckoutUi &&
    !hasStripeSessionId &&
    !isStripeCheckoutReturn() &&
    !isLegacyAccountMode &&
    !authReturnDismissed
  ) {
    return (
      <AppAuthReturn
        sessionToken={sessionToken}
        appStoreUrl={appStoreUrl}
        isDeepLinkSupported={isDeepLinkSupported}
        unsupportedDeviceName={unsupportedDeviceName}
        onContinueOnWeb={dismissAuthReturn}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 py-20 bg-gradient-hero">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-foreground mb-4">
              My <span className="text-primary">Account</span>
            </h1>
            <p className="text-lg text-muted-foreground">
              Subscription, perks, and account settings — organized in one place.
            </p>
          </div>

          {sessionToken ? (
            <ReceivedMembershipInviteBanner sessionToken={sessionToken} />
          ) : null}

          {/* Post-Stripe checkout — auto-opens app on iOS/macOS; primary CTA below */}
          {showPaymentCompleteBanner ? (
            <Card className="mb-8 border-primary/50 shadow-glow bg-primary/5">
              <CardContent className="flex flex-col items-center gap-4 py-6">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-foreground">
                    Payment complete
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Thanks for trying KeenVPN. Your subscription is active.{" "}
                    {isASWeb
                      ? "Return to the app and connect to KeenVPN."
                      : isDeepLinkSupported
                        ? "Download KeenVPN to connect on this device."
                        : `Install KeenVPN on your ${unsupportedDeviceName} to connect.`}
                  </p>
                </div>
                {isASWeb ? (
                  <>
                    <Button
                      type="button"
                      className="w-full max-w-sm bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
                      size="lg"
                      onClick={() => {
                        markStripeAutoOpenDone();
                        returnToKeenVpnAppAfterPayment(
                          getSessionToken(),
                          appStoreUrl,
                        );
                      }}
                    >
                      <Smartphone className="mr-2 h-5 w-5" />
                      {RETURN_TO_APP_LABEL}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      Tap the button above to return to KeenVPN. This page stays
                      open until you continue on web.
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={dismissPostCheckoutUi}
                    >
                      Continue on web
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    className="w-full max-w-sm bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
                    size="lg"
                    onClick={() =>
                      openKeenVpnAppStore(resolveAppStoreUrl(appStoreUrl))
                    }
                  >
                    {getAppStoreInstallButtonLabel()}
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : null}

          <div className="grid md:grid-cols-2 gap-8 items-start">
            {/* Account Info */}
            <Card className="border-accent/50 shadow-glow">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="h-5 w-5 mr-2" />
                  Account Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{user.email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Provider</p>
                  <p className="font-medium capitalize">
                    {authProvider || "Unknown"}
                  </p>
                </div>
                <Button onClick={logout} variant="outline" className="w-full">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </CardContent>
            </Card>

            {/* Subscription Status */}
            <Card className="border-accent/50 shadow-glow">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CreditCard className="h-5 w-5 mr-2" />
                  Subscription Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {subscriptionLoading || !initialSubscriptionChecked ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                    <div>
                      <Skeleton className="h-3 w-10 mb-2" />
                      <Skeleton className="h-5 w-40" />
                    </div>
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-10 w-full rounded-md" />
                  </div>
                ) : subscription ? (
                  <>
                    <AnnualUpgradeBanner
                      source="account_page"
                      onDismiss={() => setAnnualUpgradeBannerDismissed(true)}
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Status
                      </span>
                      <Badge
                        className={`${getStatusColor(
                          subscription.status,
                        )} text-white`}
                      >
                        {getStatusText(subscription.status)}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Plan</p>
                      <p className="font-medium">
                        {subscription.plan || "KeenVPN Premium"}
                      </p>
                      {isTwoYear && !subscription.scheduledPlanChange && (
                        <p className="text-xs text-muted-foreground">
                          Renews every 2 years
                        </p>
                      )}
                      {subscription.scheduledPlanChange && (
                        <p className="text-xs text-muted-foreground">
                          Switches to {subscription.scheduledPlanChange.planName}{" "}
                          on {formatDate(subscription.scheduledPlanChange.effectiveAt)}
                        </p>
                      )}
                    </div>

                    {pendingBusinessTransfer ? (
                      <div className="space-y-1 rounded-lg border border-primary/25 bg-primary/5 p-3">
                        <p className="text-sm font-medium text-foreground">
                          You're joining a team
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {pendingBusinessTransfer.billingDeferredUntil
                            ? `Your current plan stays active through ${new Intl.DateTimeFormat(
                                undefined,
                                {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                },
                              ).format(
                                new Date(
                                  pendingBusinessTransfer.billingDeferredUntil,
                                ),
                              )}. After that, ${
                                pendingBusinessTransfer.ownerEmail
                              } covers your KeenVPN access.`
                            : `Your current plan stays active until its paid time ends. After that, ${pendingBusinessTransfer.ownerEmail} covers your KeenVPN access.`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Auto-renewal may show as off because your personal
                          plan will not renew once the team takes over.
                        </p>
                      </div>
                    ) : null}

                    {isSharedBusinessMember &&
                    membershipDashboard?.membership ? (
                      <div className="space-y-1 rounded-lg border border-primary/25 bg-primary/5 p-3">
                        <p className="text-sm font-medium text-foreground">
                          Team access
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Premium access through{" "}
                          {membershipDashboard.membership.ownerEmail}. Manage
                          this from the Team tab.
                        </p>
                      </div>
                    ) : null}

                    <MembershipPlanUpgradeCard
                      subscription={subscription}
                      sessionToken={getSessionToken()}
                      upgrading={businessUpgradeLoading}
                      onUpgradePlan={upgradeToBusinessPlan}
                    />

                    {/* Upgrade to Annual */}
                    {showStripeUpgradeInCard && (
                      <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                        <p className="text-sm text-foreground">
                          Switch to annual billing and save — charged at your
                          next billing date, not today.
                        </p>
                        <Button
                          onClick={() =>
                            void upgradeToAnnual("account_upgrade_button")
                          }
                          disabled={upgrading}
                          variant="outline"
                          className="w-full border-primary text-primary hover:bg-primary/10"
                        >
                          {upgrading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Upgrading...
                            </>
                          ) : (
                            <>
                              <ArrowUpCircle className="h-4 w-4 mr-2" />
                              Upgrade to annual subscription
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                    {hasScheduledAnnualBilling(subscription) && (
                      <ScheduledAnnualBillingNotice
                        subscription={subscription}
                        className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3"
                      />
                    )}
                    {showAppleIapUpgradeInCard && (
                      <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                        <p className="text-sm text-foreground">
                          You subscribed through the App Store. Switch to annual
                          billing there — Apple manages your subscription.
                        </p>
                        <AppleIapSubscriptionsCta
                          label="Upgrade to annual in App Store"
                          variant="outline"
                          buttonClassName="border-primary text-primary hover:bg-primary/10"
                        />
                      </div>
                    )}

                    {/* Auto-Renewal Status */}
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <p className="text-sm font-medium">Auto-Renewal</p>
                        <p className="text-xs text-muted-foreground">
                          {subscription.cancelAtPeriodEnd
                            ? "Cancelled - subscription ends on billing date"
                            : "Active - automatically renews each period"}
                        </p>
                      </div>
                      {subscription.cancelAtPeriodEnd ? (
                        <Badge variant="destructive">
                          <XCircle className="w-3 h-3 mr-1" />
                          Off
                        </Badge>
                      ) : (
                        <Badge variant="default" className="bg-green-500">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          On
                        </Badge>
                      )}
                    </div>

                    {subscription.endDate && (
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">
                            {subscription.cancelAtPeriodEnd
                              ? "Subscription Ends"
                              : "Next Billing"}
                          </p>
                          <p className="font-medium">
                            {formatDate(subscription.endDate)}
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="space-y-3">
                      {showReturnToAppCta ? (
                        <Button
                          type="button"
                          className="w-full bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90"
                          size="lg"
                          onClick={() => {
                            markStripeAutoOpenDone();
                            returnToKeenVpnAppAfterPayment(
                              getSessionToken(),
                              appStoreUrl,
                            );
                          }}
                        >
                          <Smartphone className="mr-2 h-5 w-5" />
                          {RETURN_TO_APP_LABEL}
                        </Button>
                      ) : null}

                      {canManageBilling ? (
                        <Button
                          onClick={() =>
                            navigate("/account/subscription-history")
                          }
                          variant="outline"
                          className="w-full"
                        >
                          <History className="h-4 w-4 mr-2" />
                          View Billing History
                        </Button>
                      ) : null}

                      {!pendingBusinessTransfer && !isSharedBusinessMember ? (
                        <Button
                          onClick={handleRefreshSubscription}
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          disabled={subscriptionLoading}
                        >
                          {subscriptionLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Refreshing...
                            </>
                          ) : (
                            "Refresh Status"
                          )}
                        </Button>
                      ) : null}

                      {canManageBilling ? (
                        <SubscriptionCancellationControls
                          subscription={subscription}
                          cancelling={cancelling}
                          onCancel={() => cancelSubscriptionAtPeriodEnd()}
                          onManageBilling={() => void openBillingPortal()}
                          portalLoading={portalLoading}
                          showManageBilling={!showStripeUpgradeToAnnual}
                        />
                      ) : null}

                      {!hasManageableSubscription(subscription) &&
                      canManageBilling ? (
                        <Button
                          onClick={() => navigate("/subscribe")}
                          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg"
                        >
                          {subscriptionCtaLabel}
                        </Button>
                      ) : null}
                    </div>
                    {showOwnerRefundHelp ? (
                      <div className="pt-4 mt-4 border-t border-border">
                        <p className="text-sm text-muted-foreground">
                          For refund request, please send an email to our
                          support team via{" "}
                          <a
                            href="mailto:support@vpnkeen.com"
                            className="text-primary hover:underline"
                          >
                            support@vpnkeen.com
                          </a>
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground text-center py-4">
                      No active subscription found
                    </p>
                    <Button
                      onClick={() => navigate("/account/subscription-history")}
                      variant="outline"
                      className="w-full"
                    >
                      <History className="h-4 w-4 mr-2" />
                      Manage Subscriptions
                    </Button>
                    <Button
                      onClick={() => navigate("/subscribe")}
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg"
                    >
                      {subscriptionCtaLabel}
                    </Button>
                    <div className="pt-4 mt-4 border-t border-border">
                      <p className="text-sm text-muted-foreground">
                        For refund request, please send an email to our support
                        team via{" "}
                        <a
                          href="mailto:support@vpnkeen.com"
                          className="text-primary hover:underline"
                        >
                          support@vpnkeen.com
                        </a>
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {hasSessionToken && workspaceEnabled && (
            <AccountWorkspace
              sessionToken={getSessionToken() ?? ""}
              authProvider={authProvider ?? undefined}
              linkedProviders={linkedProviders}
              onLinkedAccountsUpdate={() => {
                refreshLinkedProviders();
                refreshSubscription();
              }}
            />
          )}

          {workspaceEntitlementLoading && (
            <Card className="mt-10 border-accent/40 shadow-card">
              <CardHeader>
                <Skeleton className="h-7 w-36" />
                <Skeleton className="h-4 w-full max-w-md" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-24 w-full rounded-xl" />
              </CardContent>
            </Card>
          )}

          {workspaceEntitlementError && (
            <Card className="mt-10 border-accent/40 shadow-card">
              <CardHeader>
                <CardTitle className="text-xl">Workspace unavailable</CardTitle>
                <CardDescription>
                  We couldn&apos;t confirm your Workspace access. Refresh your
                  membership status to try again.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleRefreshSubscription()}
                  disabled={subscriptionLoading}
                >
                  {subscriptionLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Refresh status
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <Card className="border-accent/40 shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Need help?</CardTitle>
                <CardDescription>
                  Our support team can help with billing, perks, and account
                  issues.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <a
                  href="mailto:support@vpnkeen.com?subject=Support Request&body=Hello KeenVPN Support Team,%0D%0A%0D%0AI need assistance with:%0D%0A%0D%0A[Please describe your issue here]%0D%0A%0D%0AThank you!"
                  className="inline-flex h-10 w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Contact Support
                </a>
              </CardContent>
            </Card>

            {sessionToken && (
              <Card className="shadow-card">
                <CardContent className="pt-6">
                  <AiConnectionsPanel sessionToken={sessionToken} />
                </CardContent>
              </Card>
            )}

            <Card className="border-destructive/40 shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center text-lg text-destructive">
                  <AlertTriangle className="mr-2 h-5 w-5" />
                  Danger zone
                </CardTitle>
                <CardDescription>
                  Permanently delete your account and associated data.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      className="w-full"
                      disabled={deleting}
                    >
                      {deleting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Deleting Account...
                        </>
                      ) : (
                        <>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Account
                        </>
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center text-destructive">
                        <AlertTriangle className="mr-2 h-5 w-5" />
                        Are you absolutely sure?
                      </AlertDialogTitle>
                      <AlertDialogDescription className="space-y-3">
                        <p>
                          This action <strong>cannot be undone</strong>. Your
                          account and all associated usage data will be
                          permanently deleted from our servers. Please note that
                          no refunds will be issued.
                        </p>
                        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
                          <p className="text-sm font-medium text-destructive">
                            This will delete:
                          </p>
                          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
                            <li>Your account and profile information</li>
                            <li>All subscription data</li>
                            <li>All associated preferences and settings</li>
                          </ul>
                        </div>
                        {subscription && subscription.status === "active" && (
                          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                            <p className="text-sm font-medium text-yellow-800">
                              You have an active subscription
                            </p>
                            <p className="mt-1 text-xs text-yellow-700">
                              Please cancel your subscription before deleting your
                              account to avoid future charges.
                            </p>
                          </div>
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteAccount}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete Account Permanently
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

const Account = () => {
  const { hasSessionToken } = useAuth();
  const sessionToken = hasSessionToken ? getSessionToken() : null;
  return (
    <MembershipSharingProvider sessionToken={sessionToken}>
      <AccountInner />
    </MembershipSharingProvider>
  );
};

export default Account;
