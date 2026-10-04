import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import UtmCapture from "@/components/UtmCapture";
import PostHogTracker from "@/components/PostHogTracker";
import RedditPixelTracker from "@/components/RedditPixelTracker";
import ProtectedRoute from "@/components/ProtectedRoute";
import MarketingSiteRedirect from "@/components/MarketingSiteRedirect";
import { resolvePricingRouteDestination } from "@/auth/pricing-route";
import AdminProtectedRoute from "@/components/admin/AdminProtectedRoute";
import AdminSidebarLayout from "@/components/admin/AdminSidebarLayout";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
// Lazy load pages for code splitting
const DeleteAccount = lazy(() => import("./pages/DeleteAccount"));
const Pricing = lazy(() => import("./pages/Pricing"));
const SignIn = lazy(() => import("./pages/SignIn"));
const MagicLinkRequest = lazy(() => import("./pages/MagicLinkRequest"));
const MagicLinkVerify = lazy(() => import("./pages/MagicLinkVerify"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const ChangeAuthEmail = lazy(() => import("./pages/ChangeAuthEmail"));
const Reactivate = lazy(() => import("./pages/Reactivate"));
const EmailPreferences = lazy(() => import("./pages/EmailPreferences"));
const ContextualEmailUnsubscribe = lazy(
  () => import("./pages/ContextualEmailUnsubscribe"),
);
const ReferralLanding = lazy(() => import("./pages/ReferralLanding"));
const PromotionalTrialLanding = lazy(
  () => import("./pages/PromotionalTrialLanding"),
);
const Friends = lazy(() => import("./pages/Friends"));
const FriendsAccept = lazy(() => import("./pages/FriendsAccept"));
const FriendsJoin = lazy(() => import("./pages/FriendsJoin"));
const Perks = lazy(() => import("./pages/Perks"));
const Subscribe = lazy(() => import("./pages/Subscribe"));
const Account = lazy(() => import("./pages/Account"));
const MembershipSharingAccept = lazy(
  () => import("./pages/MembershipSharingAccept"),
);
const UpgradeAnnual = lazy(() => import("./pages/UpgradeAnnual"));
const SubscriptionHistory = lazy(() => import("./pages/SubscriptionHistory"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const PaymentCancel = lazy(() => import("./pages/PaymentCancel"));
const OpenApp = lazy(() => import("./pages/OpenApp"));
const DownloadApp = lazy(() => import("./pages/DownloadApp"));
const AuthDebug = lazy(() => import("./pages/AuthDebug"));
const AppleDebug = lazy(() => import("./pages/AppleDebug"));
const NotFound = lazy(() => import("./pages/NotFound"));
const MembershipTransferAdmin = lazy(
  () => import("./pages/admin/MembershipTransferAdmin"),
);
const AdminMembershipSharing = lazy(
  () => import("./pages/admin/AdminMembershipSharing"),
);
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview"));
const AdminDomainInsights = lazy(
  () => import("./pages/admin/AdminDomainInsights"),
);
const AdminPerks = lazy(() => import("./pages/admin/AdminPerks"));
const AdminHotLinks = lazy(() => import("./pages/admin/AdminHotLinks"));
const AdminAffiliateLinks = lazy(
  () => import("./pages/admin/AdminAffiliateLinks"),
);
const AdminPromotionalTrialQr = lazy(
  () => import("./pages/admin/AdminPromotionalTrialQr"),
);
const AdminPerkRequests = lazy(() => import("./pages/admin/AdminPerkRequests"));
const AdminProductEvents = lazy(
  () => import("./pages/admin/AdminProductEvents"),
);
const AdminConnectionEngagement = lazy(
  () => import("./pages/admin/AdminConnectionEngagement"),
);
const AdminSubscriptions = lazy(
  () => import("./pages/admin/AdminSubscriptions"),
);
const AdminPricing = lazy(() => import("./pages/admin/AdminPricing"));
const AdminChurn = lazy(() => import("./pages/admin/AdminChurn"));
const AdminJiraDelivery = lazy(
  () => import("./pages/admin/AdminJiraDelivery"),
);
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminUserProfile = lazy(
  () => import("./pages/admin/AdminUserProfile"),
);
const AdminUserSessions = lazy(
  () => import("./pages/admin/AdminUserSessions"),
);
const AdminUtmAttribution = lazy(
  () => import("./pages/admin/AdminUtmAttribution"),
);
const AdminLandingAttribution = lazy(
  () => import("./pages/admin/AdminLandingAttribution"),
);
const AdminDownloadFunnel = lazy(
  () => import("./pages/admin/AdminDownloadFunnel"),
);
const AdminSignupTrialFunnel = lazy(
  () => import("./pages/admin/AdminSignupTrialFunnel"),
);
const AdminStickerCampaigns = lazy(
  () => import("./pages/admin/AdminStickerCampaigns"),
);
const AdminBroadcastEmail = lazy(
  () => import("./pages/admin/AdminBroadcastEmail"),
);
const AdminEmailUnsubscribes = lazy(
  () => import("./pages/admin/AdminEmailUnsubscribes"),
);
const AdminClassActionEmailCta = lazy(
  () => import("./pages/admin/AdminClassActionEmailCta"),
);
const AdminUserProfiles = lazy(
  () => import("./pages/admin/AdminUserProfiles"),
);
const AdminSignupSources = lazy(
  () => import("./pages/admin/AdminSignupSources"),
);
const AdminWorkflows = lazy(() => import("./pages/admin/AdminWorkflows"));
const DashboardHome = lazy(() => import("./pages/DashboardHome"));
const DashboardVpn = lazy(() => import("./pages/DashboardVpn"));
const DashboardDownloads = lazy(() => import("./pages/DashboardDownloads"));
const DashboardReferrals = lazy(() => import("./pages/DashboardReferrals"));
const DashboardClassAction = lazy(() => import("./pages/DashboardClassAction"));
const DashboardClassActionDetail = lazy(
  () => import("./pages/DashboardClassActionDetail"),
);
const DashboardSubscription = lazy(
  () => import("./pages/DashboardSubscription"),
);
const DashboardProfile = lazy(() => import("./pages/DashboardProfile"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const DashboardAiAssistant = lazy(
  () => import("./pages/DashboardAiAssistant"),
);
const DashboardSupport = lazy(() => import("./pages/DashboardSupport"));
const DashboardLayout = lazy(
  () => import("./components/dashboard/DashboardLayout"),
);

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb]">
    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
  </div>
);

const PricingRoute = () => {
  const { search } = useLocation();
  const { user, loading, hasSessionToken } = useAuth();
  const destination = resolvePricingRouteDestination({
    hasUser: Boolean(user),
    hasSessionToken,
    authLoading: loading,
    search,
  });

  if (destination === "loading") {
    return <PageLoader />;
  }

  return destination === "portal" ? (
    <Pricing />
  ) : (
    <MarketingSiteRedirect path="/pricing.html" />
  );
};

/** Web users land on the new dashboard; keep legacy /account for ASWeb + checkout returns. */
const AccountRoute = () => {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const keepLegacyAccount =
    params.get("asweb") === "1" ||
    params.has("session_id") ||
    params.has("tab") ||
    params.has("email_prefs") ||
    params.has("billing") ||
    params.has("business") ||
    (typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem("asweb_session") === "1");

  if (!keepLegacyAccount) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Account />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <UtmCapture />
          <PostHogTracker />
          <RedditPixelTracker />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<MarketingSiteRedirect />} />
              <Route
                path="/switch"
                element={<MarketingSiteRedirect path="/transfer.html" />}
              />
              <Route
                path="/servers"
                element={<MarketingSiteRedirect path="/server-locations/" />}
              />
              <Route
                path="/pricing"
                element={<PricingRoute />}
              />
              <Route
                path="/privacy"
                element={<MarketingSiteRedirect path="/privacy.html" />}
              />
              <Route
                path="/terms"
                element={<MarketingSiteRedirect path="/terms.html" />}
              />
              <Route path="/support" element={<DashboardSupport />} />
              {/* Public, no auth guard: Play requires this URL to work for users
                  who can no longer sign in or no longer have the app installed. */}
              <Route path="/delete-account" element={<DeleteAccount />} />
              <Route
                path="/my-ip-address"
                element={<MarketingSiteRedirect path="/my-ip-address" />}
              />
              <Route path="/signin" element={<SignIn />} />
              <Route path="/signin/magic" element={<MagicLinkRequest />} />
              <Route path="/auth/magic" element={<MagicLinkVerify />} />
              <Route path="/auth/verify-email" element={<VerifyEmail />} />
              <Route path="/auth/change-email" element={<ChangeAuthEmail />} />
              <Route path="/reactivate" element={<Reactivate />} />
              <Route
                path="/email/unsubscribe"
                element={<ContextualEmailUnsubscribe />}
              />
              <Route path="/email/preferences" element={<EmailPreferences />} />
              <Route path="/r/:token" element={<ReferralLanding />} />
              <Route
                path="/promo/:code"
                element={<PromotionalTrialLanding />}
              />
              <Route
                path="/friends"
                element={
                  <ProtectedRoute>
                    <Friends />
                  </ProtectedRoute>
                }
              />
              <Route path="/friends/accept" element={<FriendsAccept />} />
              <Route path="/friends/join/:token" element={<FriendsJoin />} />
              <Route
                path="/perks"
                element={
                  <ProtectedRoute>
                    <Perks />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/subscribe"
                element={
                  <ProtectedRoute>
                    <Subscribe />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/account"
                element={
                  <ProtectedRoute>
                    <AccountRoute />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/upgrade-annual"
                element={
                  <ProtectedRoute>
                    <UpgradeAnnual />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/account/subscription-history"
                element={
                  <ProtectedRoute>
                    <SubscriptionHistory />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/account/membership-sharing/accept"
                element={<MembershipSharingAccept />}
              />
              {/* Dashboard shell — requires auth */}
              <Route
                element={
                  <ProtectedRoute>
                    <DashboardLayout />
                  </ProtectedRoute>
                }
              >
                <Route
                  path="/home"
                  element={<Navigate to="/dashboard" replace />}
                />
                <Route path="/dashboard" element={<DashboardHome />} />
                <Route path="/vpn" element={<DashboardVpn />} />
                <Route path="/downloads" element={<DashboardDownloads />} />
                <Route path="/referrals" element={<DashboardReferrals />} />
                <Route path="/class-action" element={<DashboardClassAction />} />
                <Route
                  path="/class-actions/:slug"
                  element={<DashboardClassActionDetail />}
                />
                <Route
                  path="/class-action/:id"
                  element={<DashboardClassActionDetail />}
                />
                <Route path="/ai-assistant" element={<DashboardAiAssistant />} />
                <Route
                  path="/subscription"
                  element={<DashboardSubscription />}
                />
                <Route path="/profile" element={<DashboardProfile />} />
              </Route>
              {/* MCP OAuth consent (KVPN-506). Not inside the dashboard shell:
                  it is a full-page decision, and it is reached mid-redirect from
                  an assistant rather than from the app's own navigation. */}
              <Route path="/oauth/consent" element={<OAuthConsent />} />
              <Route path="/success" element={<PaymentSuccess />} />
              <Route path="/cancel" element={<PaymentCancel />} />
              <Route path="/open-app" element={<OpenApp />} />
              <Route path="/download-app" element={<DownloadApp />} />
              <Route path="/auth/debug" element={<AuthDebug />} />
              <Route path="/apple/debug" element={<AppleDebug />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route
                path="/admin"
                element={
                  <AdminAuthProvider>
                    <AdminProtectedRoute>
                      <AdminSidebarLayout />
                    </AdminProtectedRoute>
                  </AdminAuthProvider>
                }
              >
                <Route
                  index
                  element={<Navigate to="/admin/overview" replace />}
                />
                <Route path="overview" element={<AdminOverview />} />
                <Route path="users/:userId" element={<AdminUserProfile />} />
                <Route
                  path="user-sessions/:userId"
                  element={<AdminUserSessions />}
                />
                <Route path="product-events" element={<AdminProductEvents />} />
                <Route
                  path="domain-insights"
                  element={<AdminDomainInsights />}
                />
                <Route path="perks" element={<AdminPerks />} />
                <Route path="hot-links" element={<AdminHotLinks />} />
                <Route
                  path="affiliate-links"
                  element={<AdminAffiliateLinks />}
                />
                <Route path="perk-requests" element={<AdminPerkRequests />} />
                <Route path="user-profiles" element={<AdminUserProfiles />} />
                <Route path="workflows" element={<AdminWorkflows />} />
                <Route path="signup-sources" element={<AdminSignupSources />} />
                <Route
                  path="connection-engagement"
                  element={<AdminConnectionEngagement />}
                />
                <Route
                  path="membership-transfer"
                  element={<MembershipTransferAdmin />}
                />
                <Route
                  path="membership-sharing"
                  element={<AdminMembershipSharing />}
                />
                <Route path="subscriptions" element={<AdminSubscriptions />} />
                <Route path="pricing" element={<AdminPricing />} />
                <Route path="churn" element={<AdminChurn />} />
                <Route path="jira-delivery" element={<AdminJiraDelivery />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="utm-attribution" element={<AdminUtmAttribution />} />
                <Route
                  path="landing-attribution"
                  element={<AdminLandingAttribution />}
                />
                <Route
                  path="download-funnel"
                  element={<AdminDownloadFunnel />}
                />
                <Route
                  path="signup-trial-funnel"
                  element={<AdminSignupTrialFunnel />}
                />
                <Route
                  path="sticker-campaigns"
                  element={<AdminStickerCampaigns />}
                />
                <Route
                  path="promotional-trial-qr"
                  element={<AdminPromotionalTrialQr />}
                />
                <Route path="broadcast-email" element={<AdminBroadcastEmail />} />
                <Route
                  path="email-unsubscribes"
                  element={<AdminEmailUnsubscribes />}
                />
                <Route
                  path="class-action-email-cta"
                  element={<AdminClassActionEmailCta />}
                />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
