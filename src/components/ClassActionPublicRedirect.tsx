import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import {
  CLASS_ACTION_PUBLIC_ORIGIN,
  resolvePublicClassActionUrl,
  type PublicClassActionLookup,
} from "@/lib/class-action-public";

interface ClassActionPublicRedirectProps {
  /** Slug or perk id from the portal URL. */
  lookupKey: string;
}

/**
 * Logged-out visitors on a portal Class Action detail URL are sent to the
 * public, indexable page for the same record. Unpublished or unknown records
 * show a neutral "not available" state instead of a sign-in loop.
 */
const ClassActionPublicRedirect = ({ lookupKey }: ClassActionPublicRedirectProps) => {
  const { search } = useLocation();
  const [state, setState] = useState<PublicClassActionLookup>({ kind: "found", url: "" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "found", url: "" });
    void resolvePublicClassActionUrl(lookupKey, search).then((result) => {
      if (cancelled) return;
      if (result.kind === "found") {
        window.location.replace(result.url);
        return;
      }
      setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, [lookupKey, search, attempt]);

  if (state.kind === "found") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Opening settlement" />
      </div>
    );
  }

  const notFound = state.kind === "not_found";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-4">
      <div className="w-full max-w-[520px] rounded-[16px] border border-[#e7edf5] bg-white p-8 text-center shadow-sm">
        <p className="text-[18px] font-semibold text-[#0f2040]">
          {notFound ? "This settlement isn’t available" : "We couldn’t load this settlement"}
        </p>
        <p className="mt-1 text-[14px] text-[#627086]">
          {notFound
            ? "It may have ended, been removed, or isn’t published yet."
            : "Please try again in a moment."}
        </p>
        <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {notFound ? (
            <a
              href={`${CLASS_ACTION_PUBLIC_ORIGIN}/settlements.html`}
              className="rounded-[10px] bg-[#0f2040] px-5 py-2.5 text-[14px] font-semibold text-white hover:opacity-90"
            >
              View current settlements
            </a>
          ) : (
            <button
              type="button"
              onClick={() => setAttempt((count) => count + 1)}
              className="rounded-[10px] bg-[#0f2040] px-5 py-2.5 text-[14px] font-semibold text-white hover:opacity-90"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClassActionPublicRedirect;
