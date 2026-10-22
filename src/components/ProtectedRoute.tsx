import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from "@/contexts/AuthContext";
import { buildSignInUrl } from "@/auth";
import { Loader2 } from 'lucide-react';
import ClassActionPublicRedirect from "@/components/ClassActionPublicRedirect";
import { getClassActionPublicLookupKey } from "@/lib/class-action-public";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireSubscription?: boolean;
}

const ProtectedRoute = ({ children, requireSubscription = false }: ProtectedRouteProps) => {
  const { user, subscription, loading, hasSessionToken } = useAuth();
  const location = useLocation();

  const isASWeb = (() => {
    const urlParams = new URLSearchParams(location.search);
    const detected = urlParams.get('asweb') === '1' || sessionStorage.getItem('asweb_session') === '1';
    if (detected) {
      sessionStorage.setItem('asweb_session', '1');
    }
    return detected;
  })();

  // During hard refresh, auth can briefly be unresolved while a session token
  // is still being validated. Keep the user on the current protected page,
  // but only while initialization is in progress to avoid infinite spinners.
  // For ASWeb flows, we also keep the user on the page while loading even if the
  // backend session token hasn't been persisted yet.
  if (loading && (user ? true : (hasSessionToken || isASWeb))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // Logged-out Class Action links belong on the public, indexable page.
    // Authenticated visitors never reach this branch.
    const publicLookupKey = isASWeb
      ? null
      : getClassActionPublicLookupKey(location.pathname);
    if (publicLookupKey) {
      return <ClassActionPublicRedirect lookupKey={publicLookupKey} />;
    }

    const redirectTarget = `${location.pathname}${location.search}${location.hash}`;
    return (
      <Navigate
        to={buildSignInUrl({ redirect: redirectTarget, asweb: isASWeb })}
        replace
      />
    );
  }

  if (requireSubscription && (!subscription || subscription.status !== 'active')) {
    return <Navigate to={isASWeb ? "/subscribe?asweb=1" : "/subscribe"} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
