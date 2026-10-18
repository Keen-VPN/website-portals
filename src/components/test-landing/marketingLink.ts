import { useLocation } from "react-router-dom";
import { marketingSiteUrl } from "@/lib/site-urls";

/**
 * Builds marketing-site URLs that keep the visitor's current query string, so UTM
 * parameters and click ids survive the hop from this page to vpnkeen.com (the in-app
 * redirect routes did this implicitly).
 */
export function useMarketingLink() {
  const { search } = useLocation();
  return (path = "/") => marketingSiteUrl(path) + search;
}
