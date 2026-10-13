import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Copy,
  CircleCheck,
  ExternalLink,
  FileText,
  Gift,
  Loader2,
  Lock,
  Search,
  Sparkles,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { UserInformationCard } from "@/components/UserInformationCard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkflowPerkDialog } from "@/components/WorkflowPerkDialog";
import { FriendDiscoveriesSection } from "@/components/FriendDiscoveriesSection";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  approveFriendDiscoveryDraft,
  claimPerk,
  confirmPerkReceived,
  dismissPerk,
  fetchFriendsDashboard,
  fetchPerk,
  fetchPerks,
  getUserProfileInformation,
  getSessionToken,
  recordPerkEvent,
  reportPerkNotReceived,
  restorePerk,
  snoozePerk,
  submitPerkRequest,
  unclaimPerk,
  type PerkCategory,
  type PerkDiscoveryOutcome,
  type PerkItem,
  type PerkRequestCategory,
  type PerkUserStats,
  type PerkUserTab,
} from "@/auth";
import { listWorkflows } from "@/auth/backend";
import { trackPerksEvent } from "@/lib/product-analytics";
import { isSafeHttpUrl } from "@/lib/safe-url";
import { useFeatureFlags } from "@/lib/feature-flags";

const CATEGORY_LABELS: Record<PerkCategory, string> = {
  privacy_security: "Privacy & Security",
  ai_productivity: "AI & Productivity",
  developer_tools: "Developer Tools",
  startup_growth: "Startup & Growth",
  remote_work: "Remote Work",
  finance: "Finance",
  class_action: "Class Action",
};

const ACCESS_BADGE: Record<string, string> = {
  free: "All members",
  paid: "Paid members",
  annual: "Annual members",
};

const PERK_TABS: { value: PerkUserTab; label: string }[] = [
  { value: "new", label: "New" },
  { value: "completed", label: "Completed" },
  { value: "snoozed", label: "Snoozed" },
  { value: "not_interested", label: "Not Interested" },
];

import { selectPrimaryActiveWorkflow } from "@/lib/workflow-ui";

const REQUEST_CATEGORIES: { value: PerkRequestCategory; label: string }[] = [
  { value: "finance", label: "Finance" },
  { value: "software", label: "Software" },
  { value: "travel", label: "Travel" },
  { value: "shopping", label: "Shopping" },
  { value: "food", label: "Food" },
  { value: "entertainment", label: "Entertainment" },
  { value: "other", label: "Other" },
];

function formatExpirationLabel(perk: PerkItem): string | null {
  if (perk.daysRemaining === null && !perk.endsAt) return null;
  if (perk.daysRemaining !== null && perk.daysRemaining <= 0) {
    return "Expired";
  }
  if (perk.daysRemaining !== null && perk.daysRemaining <= 45) {
    return `Expires in ${perk.daysRemaining} day${perk.daysRemaining === 1 ? "" : "s"}`;
  }
  if (perk.endsAt) {
    return `Expires ${new Date(perk.endsAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  }
  return null;
}

function descriptionHasMoreThanPreview(description: string): boolean {
  const normalized = description.trim();
  if (!normalized) return false;
  const lineCount = normalized.split("\n").length;
  // Multi-step or long copy likely exceeds line-clamp-3; skip short one-liners.
  return lineCount > 1 || normalized.length > 200;
}

function normalizeMatchedUrl(raw: string): {
  href: string;
  display: string;
  suffix: string;
} {
  let href = raw;
  let suffix = "";

  while (href.length > 0) {
    const last = href[href.length - 1];
    if (!last) break;

    if (". ,;:!?".includes(last)) {
      suffix = last + suffix;
      href = href.slice(0, -1);
      continue;
    }

    if (last === ")") {
      const openCount = (href.match(/\(/g) ?? []).length;
      const closeCount = (href.match(/\)/g) ?? []).length;
      if (closeCount > openCount) {
        suffix = ")" + suffix;
        href = href.slice(0, -1);
        continue;
      }
    }

    break;
  }

  return { href, display: href, suffix };
}

function linkifyDescription(text: string): ReactNode[] {
  const urlPattern = /https?:\/\/[^\s]+/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const { href, display, suffix } = normalizeMatchedUrl(match[0]);
    if (isSafeHttpUrl(href)) {
      nodes.push(
        <a
          key={`${match.index}-${href}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-primary underline underline-offset-2 hover:text-primary/80"
        >
          {display}
        </a>,
      );
      if (suffix) {
        nodes.push(suffix);
      }
    } else {
      nodes.push(display + suffix);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

const Perks = () => {
  const { workflowsEnabled } = useFeatureFlags();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [perks, setPerks] = useState<PerkItem[]>([]);
  const [userStats, setUserStats] = useState<PerkUserStats | null>(null);
  const [categories, setCategories] = useState<PerkCategory[]>([]);
  const [userAccessTier, setUserAccessTier] = useState<string>("free");
  const [selectedCategory, setSelectedCategory] = useState<
    PerkCategory | "all"
  >("all");
  const [selectedTab, setSelectedTab] = useState<PerkUserTab>("new");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [actionPerkIds, setActionPerkIds] = useState<Set<string>>(new Set());
  const [detailsPerkId, setDetailsPerkId] = useState<string | null>(null);
  const [workflowDialog, setWorkflowDialog] = useState<{
    workflowId: string;
    perkTitle: string;
  } | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileSummaryLoading, setProfileSummaryLoading] = useState(false);
  const [profileIsComplete, setProfileIsComplete] = useState(false);
  const [profileAnsweredCount, setProfileAnsweredCount] = useState(0);
  const [profileQuestionCount, setProfileQuestionCount] = useState(0);
  const [initialLoad, setInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [discoveryFriends, setDiscoveryFriends] = useState<
    {
      userId: string;
      displayName: string | null;
      sharingPreferences?: {
        shareRecommendations: boolean;
        shareReferrals: boolean;
        shareAiInsights: boolean;
      };
    }[]
  >([]);
  const [friendsNetworkEnabled, setFriendsNetworkEnabled] = useState(false);
  const [discoveryRefreshKey, setDiscoveryRefreshKey] = useState(0);
  const [discoveryPrompt, setDiscoveryPrompt] = useState<
    Extract<PerkDiscoveryOutcome, { status: "draft_created" }> | null
  >(null);
  const [discoveryPromptActing, setDiscoveryPromptActing] = useState(false);
  const loadRequestId = useRef(0);
  const pageViewRecorded = useRef(false);
  const initialLoadRef = useRef(true);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadPerks = useCallback(async () => {
    const session = getSessionToken();
    if (!session) {
      setFetchError(
        "No active session found. Sign out and sign in again to view perks.",
      );
      setLoading(false);
      setInitialLoad(false);
      return;
    }

    const requestId = ++loadRequestId.current;
    if (initialLoadRef.current) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setFetchError(null);

    const res = await fetchPerks(session, {
      category: selectedCategory === "all" ? undefined : selectedCategory,
      search: debouncedSearch || undefined,
      tab: selectedTab,
    });

    if (requestId !== loadRequestId.current) return;

    if (res.success && res.data) {
      setPerks(res.data.perks);
      setCategories(res.data.categories);
      setUserAccessTier(res.data.userAccessTier);
      setUserStats(res.data.userStats ?? null);
      setFetchError(null);
    } else {
      setPerks([]);
      setUserStats(null);
      setFetchError(
        res.error?.trim() || "Unable to load perks. Please try again.",
      );
    }
    setLoading(false);
    setRefreshing(false);
    initialLoadRef.current = false;
    setInitialLoad(false);
  }, [selectedCategory, debouncedSearch, selectedTab]);

  const applyProfileSummary = useCallback(
    (
      questions: { key: string }[],
      answers: Record<string, string>,
      isComplete: boolean,
    ) => {
      setProfileQuestionCount(questions.length);
      setProfileAnsweredCount(
        questions.filter((question) => {
          const answer = answers[question.key];
          return typeof answer === "string" && answer.length > 0;
        }).length,
      );
      setProfileIsComplete(isComplete);
    },
    [],
  );

  const loadProfileSummary = useCallback(async () => {
    const session = getSessionToken();
    if (!session) {
      setProfileSummaryLoading(false);
      setProfileIsComplete(false);
      setProfileAnsweredCount(0);
      setProfileQuestionCount(0);
      return;
    }

    setProfileSummaryLoading(true);
    const res = await getUserProfileInformation(session);
    setProfileSummaryLoading(false);
    if (!res.success) {
      setProfileIsComplete(false);
      setProfileAnsweredCount(0);
      setProfileQuestionCount(0);
      return;
    }

    applyProfileSummary(res.questions, res.answers, res.isComplete);
  }, [applyProfileSummary]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/signin");
      return;
    }
    void loadPerks();
  }, [user, authLoading, navigate, loadPerks]);

  useEffect(() => {
    if (authLoading || !user) return;
    void loadProfileSummary();
  }, [user, authLoading, loadProfileSummary]);

  useEffect(() => {
    if (authLoading || !user) {
      setDiscoveryFriends([]);
      setFriendsNetworkEnabled(false);
      return;
    }

    const session = getSessionToken();
    if (!session) return;

    let cancelled = false;
    void (async () => {
      const res = await fetchFriendsDashboard(session);
      if (cancelled) return;
      if (!res.ok) {
        setFriendsNetworkEnabled(false);
        setDiscoveryFriends([]);
        return;
      }
      const payload = res.data as {
        friends?: {
          userId: string;
          displayName: string | null;
          sharingPreferences?: {
            shareRecommendations: boolean;
            shareReferrals: boolean;
            shareAiInsights: boolean;
          };
        }[];
      };
      setFriendsNetworkEnabled(true);
      setDiscoveryFriends(payload.friends ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  useEffect(() => {
    if (
      !user ||
      initialLoad ||
      loading ||
      refreshing ||
      fetchError ||
      pageViewRecorded.current
    ) {
      return;
    }
    const session = getSessionToken();
    if (!session) return;
    pageViewRecorded.current = true;
    trackPerksEvent("perk_viewed", { source: "perks_page" });
    void recordPerkEvent(session, "perk_viewed", { source: "perks_page" });
  }, [user, initialLoad, loading, refreshing, fetchError]);

  const visiblePerks = useMemo(
    () =>
      workflowsEnabled
        ? perks
        : perks.filter((perk) => perk.redemptionType !== "workflow"),
    [perks, workflowsEnabled],
  );

  const visibleCategories = useMemo(() => {
    if (workflowsEnabled) return categories;
    const nonWorkflowCategories = new Set(
      perks
        .filter((perk) => perk.redemptionType !== "workflow")
        .map((perk) => perk.category),
    );
    return categories.filter((category) => nonWorkflowCategories.has(category));
  }, [categories, perks, workflowsEnabled]);

  useEffect(() => {
    if (selectedCategory === "all") return;

    if (!workflowsEnabled) {
      const perksInCategory = perks.filter(
        (perk) => perk.category === selectedCategory,
      );
      if (perksInCategory.length === 0) return;

      const hasVisiblePerk = perksInCategory.some(
        (perk) => perk.redemptionType !== "workflow",
      );
      if (!hasVisiblePerk) {
        setSelectedCategory("all");
      }
      return;
    }

    if (categories.length > 0 && !categories.includes(selectedCategory)) {
      setSelectedCategory("all");
    }
  }, [selectedCategory, workflowsEnabled, perks, categories]);

  const featuredPerks = useMemo(
    () => visiblePerks.filter((perk) => perk.isFeatured),
    [visiblePerks],
  );

  const featuredIds = useMemo(
    () => new Set(featuredPerks.map((p) => p.id)),
    [featuredPerks],
  );

  const showFeaturedSection = useMemo(
    () =>
      selectedTab === "new" &&
      featuredPerks.length > 0 &&
      selectedCategory === "all" &&
      !debouncedSearch,
    [featuredPerks.length, selectedCategory, debouncedSearch, selectedTab],
  );

  const allSectionPerks = useMemo(
    () =>
      showFeaturedSection
        ? visiblePerks.filter((p) => !featuredIds.has(p.id))
        : visiblePerks,
    [visiblePerks, showFeaturedSection, featuredIds],
  );

  const detailsPerk = useMemo(
    () =>
      detailsPerkId
        ? (visiblePerks.find((perk) => perk.id === detailsPerkId) ??
          perks.find((perk) => perk.id === detailsPerkId) ??
          null)
        : null,
    [detailsPerkId, visiblePerks, perks],
  );

  // `?perk=<id>` deep links from the Chrome extension and Perks emails. The
  // list only holds the selected tab, so a perk the member already completed,
  // snoozed or dismissed is looked up to find its tab before opening.
  const deepLinkRef = useRef<{
    perkId: string;
    tabResolved: boolean;
    /** List shown when the tab lookup started; wait for a newer one. */
    staleList?: PerkItem[];
  } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkedPerkId = params.get("perk");
    if (!linkedPerkId) return;
    deepLinkRef.current = { perkId: linkedPerkId, tabResolved: false };
    params.delete("perk");
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  }, []);

  useEffect(() => {
    const pending = deepLinkRef.current;
    if (!pending || loading || refreshing || initialLoad) return;
    if (pending.staleList === perks) return;

    if (perks.some((perk) => perk.id === pending.perkId)) {
      deepLinkRef.current = null;
      setDetailsPerkId(pending.perkId);
      return;
    }
    if (pending.tabResolved) {
      deepLinkRef.current = null;
      return;
    }

    const session = getSessionToken();
    if (!session) {
      deepLinkRef.current = null;
      return;
    }
    pending.tabResolved = true;
    pending.staleList = perks;
    void fetchPerk(session, pending.perkId).then((res) => {
      if (deepLinkRef.current !== pending) return;
      const tab = res.success ? res.data?.userTab : undefined;
      if (!tab || tab === selectedTab) {
        deepLinkRef.current = null;
        return;
      }
      setSelectedCategory("all");
      setSearch("");
      setSelectedTab(tab);
    });
  }, [perks, loading, refreshing, initialLoad, selectedTab]);

  useEffect(() => {
    if (detailsPerkId && !detailsPerk) {
      setDetailsPerkId(null);
    }
  }, [detailsPerkId, detailsPerk]);

  const profileCompletionPercent = useMemo(() => {
    if (profileQuestionCount <= 0) return 0;
    return Math.round((profileAnsweredCount / profileQuestionCount) * 100);
  }, [profileAnsweredCount, profileQuestionCount]);

  const profileActionLabel = profileIsComplete
    ? "Update Answers"
    : profileAnsweredCount > 0
      ? "Continue Profile"
      : "Complete Profile";

  const handleClaim = async (perk: PerkItem) => {
    if (!perk.accessible || perk.redeemed) return;
    if (perk.applicationInProgress) {
      void handleViewApplication(perk);
      return;
    }

    const session = getSessionToken();
    if (!session) {
      toast({
        title: "Session expired",
        description: "Sign in again to claim perks.",
        variant: "destructive",
      });
      return;
    }

    setClaimingId(perk.id);
    trackPerksEvent("perk_clicked", { perk_id: perk.id, source: "perks_page" });
    void recordPerkEvent(session, "perk_clicked", {
      perkId: perk.id,
      source: "perks_page",
    });

    const res = await claimPerk(session, perk.id);
    setClaimingId(null);

    if (!res.success) {
      if (res.error === "access_denied") {
        toast({
          title: "Upgrade required",
          description:
            perk.accessLevel === "annual"
              ? "This perk is available to annual members."
              : "Subscribe to unlock this perk.",
        });
        return;
      }
      toast({
        title: "Could not claim perk",
        description: res.error || "Please try again.",
        variant: "destructive",
      });
      return;
    }

    trackPerksEvent(
      res.redemptionType === "workflow" ? "perk_application_started" : "perk_claimed",
      { perk_id: perk.id, source: "perks_page" },
    );

    if (res.redemptionType === "external_link" && res.redemptionUrl) {
      if (!isSafeHttpUrl(res.redemptionUrl)) {
        toast({
          title: "Invalid offer link",
          description:
            "This perk link could not be opened safely. Contact support.",
          variant: "destructive",
        });
        void loadPerks();
        return;
      }
      window.open(res.redemptionUrl, "_blank", "noopener,noreferrer");
      toast({
        title: "Offer opened",
        description: "Complete redemption on the partner site.",
      });
    } else if (res.redemptionType === "coupon_code") {
      const partner = perk.partnerName?.trim() || perk.title;
      if (res.redemptionUrl && isSafeHttpUrl(res.redemptionUrl)) {
        window.open(res.redemptionUrl, "_blank", "noopener,noreferrer");
        toast({
          title: "Offer claimed",
          description: `Opened ${partner}. Use the copy button for your code.`,
        });
      } else if (res.redemptionUrl) {
        toast({
          title: "Offer claimed",
          description:
            "Partner link could not be opened safely. Contact support.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Offer claimed",
          description: "Use the copy button for your code at checkout.",
        });
      }
    } else if (res.redemptionType === "workflow" && res.workflowId) {
      setWorkflowDialog({ workflowId: res.workflowId, perkTitle: perk.title });
    } else if (res.message) {
      toast({ title: "Request received", description: res.message });
    }

    if (res.discovery?.status === "draft_created") {
      setDiscoveryPrompt(res.discovery);
    } else if (res.discovery?.status === "auto_shared") {
      const count = res.discovery.deliveredCount;
      toast({
        title: "Shared with friends",
        description:
          count > 0
            ? `Shared with ${count} friend${count === 1 ? "" : "s"}.`
            : "No friends received this share (they may already have it).",
      });
      setDiscoveryRefreshKey((key) => key + 1);
    }

    void loadPerks();
  };

  const handleViewApplication = async (perk: PerkItem) => {
    if (!perk.workflowType) {
      toast({
        title: "Application unavailable",
        description: "This perk is missing workflow configuration. Contact support.",
        variant: "destructive",
      });
      return;
    }
    const session = getSessionToken();
    if (!session) {
      toast({
        title: "Session expired",
        description: "Sign in again to view this application.",
        variant: "destructive",
      });
      return;
    }
    if (perk.applicationWorkflowId) {
      setWorkflowDialog({
        workflowId: perk.applicationWorkflowId,
        perkTitle: perk.title,
      });
      return;
    }
    setClaimingId(perk.id);
    const res = await listWorkflows(session);
    setClaimingId(null);
    if (!res.ok || !res.data) {
      toast({
        title: "Could not load application",
        description: res.error || "Please try again.",
        variant: "destructive",
      });
      return;
    }
    const matches = res.data.workflows.filter(
      (w) => w.workflowType === perk.workflowType,
    );
    const chosen =
      selectPrimaryActiveWorkflow(matches) ??
      [...matches].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )[0];
    if (!chosen) {
      toast({
        title: "No application found",
        description: "We couldn't find an application for this perk.",
        variant: "destructive",
      });
      return;
    }
    setWorkflowDialog({ workflowId: chosen.id, perkTitle: perk.title });
  };

  const runPerkAction = async (
    perkId: string,
    action: () => Promise<{ success: boolean; error?: string }>,
    successMessage: string,
  ) => {
    setActionPerkIds((prev) => new Set(prev).add(perkId));
    const res = await action();
    setActionPerkIds((prev) => {
      const next = new Set(prev);
      next.delete(perkId);
      return next;
    });
    if (!res.success) {
      toast({
        title: "Action failed",
        description: res.error || "Please try again.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: successMessage });
    void loadPerks();
  };

  const requireSession = (): string | null => {
    const session = getSessionToken();
    if (!session) {
      toast({
        title: "Sign in required",
        description: "Sign in again to update your perk preferences.",
        variant: "destructive",
      });
      return null;
    }
    return session;
  };

  const handleSnooze = (perk: PerkItem) => {
    const session = requireSession();
    if (!session) return;
    void runPerkAction(perk.id, async () => {
      const res = await snoozePerk(session, perk.id);
      if (res.success) {
        trackPerksEvent("perk_snoozed", { perk_id: perk.id, source: "perks_page" });
      }
      return res;
    }, "Perk snoozed for 7 days");
  };

  const handleDismiss = (perk: PerkItem) => {
    const session = requireSession();
    if (!session) return;
    void runPerkAction(perk.id, async () => {
      const res = await dismissPerk(session, perk.id);
      if (res.success) {
        trackPerksEvent("perk_marked_not_interested", { perk_id: perk.id, source: "perks_page" });
        void recordPerkEvent(session, "perk_marked_not_interested", { perkId: perk.id, source: "perks_page" });
      }
      return res;
    }, "Moved to Not Interested");
  };

  const handleRestore = (perk: PerkItem) => {
    const session = requireSession();
    if (!session) return;
    void runPerkAction(perk.id, async () => {
      const res = await restorePerk(session, perk.id);
      if (res.success) {
        trackPerksEvent("perk_restored_to_new", { perk_id: perk.id, source: "perks_page" });
        void recordPerkEvent(session, "perk_restored_to_new", { perkId: perk.id, source: "perks_page" });
      }
      return res;
    }, "Perk restored to New");
  };

  const handleUnclaim = (perk: PerkItem) => {
    const session = requireSession();
    if (!session) return;
    void runPerkAction(perk.id, async () => {
      const res = await unclaimPerk(session, perk.id);
      if (res.success) {
        trackPerksEvent("perk_unclaimed", { perk_id: perk.id, source: "perks_page" });
      }
      return res;
    }, "Perk moved back to New");
  };

  const handleConfirmReceived = (perk: PerkItem) => {
    const session = requireSession();
    if (!session) return;
    void runPerkAction(perk.id, async () => {
      const res = await confirmPerkReceived(session, perk.id);
      if (res.success) {
        trackPerksEvent("perk_confirmed_received", {
          perk_id: perk.id,
          source: "perks_page",
        });
        if (typeof res.lifetimeSavingsCents === "number") {
          const lifetimeSavingsCents = res.lifetimeSavingsCents;
          setUserStats((prev) =>
            prev
              ? {
                  ...prev,
                  lifetimeSavingsCents,
                  confirmedCount: prev.confirmedCount + 1,
                  awaitingConfirmationCount: Math.max(
                    0,
                    prev.awaitingConfirmationCount - 1,
                  ),
                }
              : {
                  lifetimeSavingsCents,
                  confirmedCount: 1,
                  awaitingConfirmationCount: 0,
                },
          );
        }
      }
      return res;
    }, "Marked as received — thanks for confirming");
  };

  const handleReportNotReceived = (perk: PerkItem) => {
    const session = requireSession();
    if (!session) return;
    void runPerkAction(perk.id, async () => {
      const res = await reportPerkNotReceived(session, perk.id);
      if (res.success) {
        trackPerksEvent("perk_not_received", {
          perk_id: perk.id,
          source: "perks_page",
        });
      }
      return res;
    }, "Thanks — we'll look into this");
  };

  const handleSnoozedToNotInterested = (perk: PerkItem) => {
    const session = requireSession();
    if (!session) return;
    void runPerkAction(perk.id, async () => {
      const res = await dismissPerk(session, perk.id);
      if (res.success) {
        trackPerksEvent("perk_moved_from_snoozed_to_not_interested", { perk_id: perk.id, source: "perks_page" });
        void recordPerkEvent(session, "perk_moved_from_snoozed_to_not_interested", { perkId: perk.id, source: "perks_page" });
      }
      return res;
    }, "Moved to Not Interested");
  };

  const handleNotInterestedToSnoozed = (perk: PerkItem) => {
    const session = requireSession();
    if (!session) return;
    void runPerkAction(perk.id, async () => {
      const res = await snoozePerk(session, perk.id);
      if (res.success) {
        trackPerksEvent("perk_moved_from_not_interested_to_snoozed", { perk_id: perk.id, source: "perks_page" });
        void recordPerkEvent(session, "perk_moved_from_not_interested_to_snoozed", { perkId: perk.id, source: "perks_page" });
      }
      return res;
    }, "Perk snoozed for 7 days");
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({
        title: "Code copied",
        description: code,
      });
    } catch {
      toast({
        title: "Your code",
        description: code,
      });
    }
  };

  if (authLoading || (initialLoad && loading)) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex flex-1 items-center justify-center bg-gradient-hero py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-gradient-hero py-20">
        <div className="container mx-auto max-w-5xl px-4">
          <div className="mb-10 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-sm text-primary">
              <Gift className="h-4 w-4" />
              Member perks
            </div>
            <h1 className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">
              Perks &amp; Benefits
            </h1>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              Exclusive offers from partners we trust, curated for KeenVPN
              members. Your plan:{" "}
              <span className="font-medium text-foreground capitalize">
                {userAccessTier}
              </span>
              .
            </p>
            {userStats ? (
              <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
                {userStats.confirmedCount > 0 ? (
                  <>
                    Confirmed value received:{" "}
                    <span className="font-medium text-foreground">
                      ${(userStats.lifetimeSavingsCents / 100).toFixed(2)}
                    </span>
                    {userStats.awaitingConfirmationCount > 0
                      ? ` · ${userStats.awaitingConfirmationCount} awaiting confirmation`
                      : null}
                  </>
                ) : userStats.awaitingConfirmationCount > 0 ? (
                  <>
                    {userStats.awaitingConfirmationCount} claimed perk
                    {userStats.awaitingConfirmationCount === 1 ? "" : "s"}{" "}
                    awaiting confirmation
                  </>
                ) : null}
              </p>
            ) : null}
          </div>

          {user ? (
            <Card className="mb-8 border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {profileIsComplete ? (
                    <CircleCheck className="h-5 w-5 text-primary" />
                  ) : (
                    <Sparkles className="h-5 w-5 text-primary" />
                  )}
                  {profileIsComplete
                    ? "Profile Complete"
                    : profileAnsweredCount > 0
                      ? `Profile Completion: ${profileCompletionPercent}%`
                      : "Personalize Your Perks"}
                </CardTitle>
                <CardDescription>
                  {profileIsComplete
                    ? "Your answers help us personalize perks and offers."
                    : profileAnsweredCount > 0
                      ? "Pick up where you left off to get more relevant perks."
                      : "Help us show you more relevant perks and offers."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => setProfileDialogOpen(true)}
                  disabled={profileSummaryLoading}
                >
                  {profileSummaryLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading…
                    </>
                  ) : (
                    profileActionLabel
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {user && friendsNetworkEnabled ? (
            <div className="mb-8">
              <FriendDiscoveriesSection
                key={user.uid}
                friends={discoveryFriends}
                hasSession={Boolean(getSessionToken())}
                refreshKey={discoveryRefreshKey}
              />
            </div>
          ) : null}

          {fetchError ? (
            <Alert variant="destructive" className="mb-8">
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{fetchError}</AlertDescription>
            </Alert>
          ) : (
            <>
              <Tabs
                value={selectedTab}
                onValueChange={(value) => setSelectedTab(value as PerkUserTab)}
                className="mb-6"
              >
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-4">
                  {PERK_TABS.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="text-xs sm:text-sm"
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative max-w-sm flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search partners or offers…"
                    className="pl-9"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {refreshing ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : null}
                  <Button
                    size="sm"
                    variant={selectedCategory === "all" ? "default" : "outline"}
                    onClick={() => setSelectedCategory("all")}
                  >
                    All
                  </Button>
                  {visibleCategories.map((cat) => (
                    <Button
                      key={cat}
                      size="sm"
                      variant={selectedCategory === cat ? "default" : "outline"}
                      onClick={() => setSelectedCategory(cat)}
                    >
                      {CATEGORY_LABELS[cat]}
                    </Button>
                  ))}
                </div>
              </div>

              {showFeaturedSection ? (
                <section className="mb-10">
                  <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Featured
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    {featuredPerks.map((perk) => (
                      <PerkCard
                        key={perk.id}
                        perk={perk}
                        tab={selectedTab}
                        claiming={claimingId === perk.id}
                        acting={actionPerkIds.has(perk.id)}
                        onClaim={() => void handleClaim(perk)}
                        onCopyCode={(code) => void handleCopyCode(code)}
                        onViewDetails={() => setDetailsPerkId(perk.id)}
                        onViewApplication={() => void handleViewApplication(perk)}
                        onSnooze={() => handleSnooze(perk)}
                        onDismiss={() => handleDismiss(perk)}
                        onRestore={() => handleRestore(perk)}
                        onUnclaim={() => handleUnclaim(perk)}
                        onConfirmReceived={() => handleConfirmReceived(perk)}
                        onReportNotReceived={() =>
                          handleReportNotReceived(perk)
                        }
                        onSnoozedToNotInterested={() => handleSnoozedToNotInterested(perk)}
                        onNotInterestedToSnoozed={() => handleNotInterestedToSnoozed(perk)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {allSectionPerks.length > 0 || !showFeaturedSection ? (
                <section>
                  <h2 className="mb-4 text-lg font-semibold">
                    {selectedCategory === "all"
                      ? "All perks"
                      : CATEGORY_LABELS[selectedCategory]}
                  </h2>
                  {allSectionPerks.length === 0 ? (
                    <p className="text-muted-foreground">
                      No perks match your filters.
                    </p>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {allSectionPerks.map((perk) => (
                        <PerkCard
                          key={perk.id}
                          perk={perk}
                          tab={selectedTab}
                          claiming={claimingId === perk.id}
                          acting={actionPerkIds.has(perk.id)}
                          onClaim={() => void handleClaim(perk)}
                          onCopyCode={(code) => void handleCopyCode(code)}
                          onViewDetails={() => setDetailsPerkId(perk.id)}
                          onViewApplication={() => void handleViewApplication(perk)}
                          onSnooze={() => handleSnooze(perk)}
                          onDismiss={() => handleDismiss(perk)}
                          onRestore={() => handleRestore(perk)}
                          onUnclaim={() => handleUnclaim(perk)}
                        onConfirmReceived={() => handleConfirmReceived(perk)}
                        onReportNotReceived={() =>
                          handleReportNotReceived(perk)
                        }
                          onSnoozedToNotInterested={() => handleSnoozedToNotInterested(perk)}
                          onNotInterestedToSnoozed={() => handleNotInterestedToSnoozed(perk)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              ) : null}

              {selectedTab === "new" ? (
                <Card className="mt-8 border-dashed border-primary/30 bg-primary/5">
                  <CardHeader>
                    <CardTitle>
                      Is there a service you&apos;d like to get a discount on?
                    </CardTitle>
                    <CardDescription>
                      Let us know and we&apos;ll see if we can secure a KeenVPN
                      discount.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={() => setRequestOpen(true)}>
                      Request Perk
                    </Button>
                  </CardContent>
                </Card>
              ) : null}
            </>
          )}
        </div>
      </main>
      <RequestPerkDialog
        open={requestOpen}
        submitting={requestSubmitting}
        onOpenChange={setRequestOpen}
        onSubmit={async (payload) => {
          const session = getSessionToken();
          if (!session) {
            toast({
              title: "Sign in required",
              description: "Sign in again to submit perk requests.",
              variant: "destructive",
            });
            return;
          }
          setRequestSubmitting(true);
          const res = await submitPerkRequest(session, payload);
          setRequestSubmitting(false);
          if (!res.success) {
            toast({
              title: "Could not submit request",
              description: res.error || "Please try again.",
              variant: "destructive",
            });
            return;
          }
          toast({
            title: "Request submitted",
            description: "Thanks — we'll review partner opportunities.",
          });
          setRequestOpen(false);
        }}
      />
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>User Information</DialogTitle>
          </DialogHeader>
          <UserInformationCard
            sessionToken={getSessionToken() ?? ""}
            entrySource="perks"
            onProfileUpdated={(profile) => {
              applyProfileSummary(
                profile.questions,
                profile.answers,
                profile.isComplete,
              );
              void loadPerks();
            }}
          />
        </DialogContent>
      </Dialog>
      <PerkDetailsDialog
        perk={detailsPerk}
        open={detailsPerk !== null}
        claiming={detailsPerk ? claimingId === detailsPerk.id : false}
        onOpenChange={(open) => {
          if (!open) setDetailsPerkId(null);
        }}
        onClaim={() => {
          if (detailsPerk) void handleClaim(detailsPerk);
        }}
        onViewApplication={() => {
          if (detailsPerk) void handleViewApplication(detailsPerk);
        }}
        onCopyCode={(code) => void handleCopyCode(code)}
      />
      <WorkflowPerkDialog
        open={workflowDialog !== null}
        sessionToken={getSessionToken() ?? ""}
        workflowId={workflowDialog?.workflowId ?? null}
        perkTitle={workflowDialog?.perkTitle ?? ""}
        onOpenChange={(open) => {
          if (!open) setWorkflowDialog(null);
        }}
        onSettled={() => void loadPerks()}
      />
      <Dialog
        open={discoveryPrompt !== null}
        onOpenChange={(open) => {
          if (!open && !discoveryPromptActing) setDiscoveryPrompt(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share with friends?</DialogTitle>
            <DialogDescription>
              Friends see the offer — not how you found it. You can also review
              this later under Private Value Network → Review.
            </DialogDescription>
          </DialogHeader>
          {discoveryPrompt ? (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3">
              <p className="font-semibold">{discoveryPrompt.perkTitle}</p>
              {discoveryPrompt.partnerName ? (
                <p className="text-sm text-muted-foreground">
                  {discoveryPrompt.partnerName}
                </p>
              ) : null}
              {discoveryPrompt.valueLabel ? (
                <p className="text-sm font-medium text-primary">
                  {discoveryPrompt.valueLabel}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Will share with {discoveryPrompt.friendCount} friend
                {discoveryPrompt.friendCount === 1 ? "" : "s"} who have
                recommendation sharing enabled.
              </p>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={discoveryPromptActing}
              onClick={() => setDiscoveryPrompt(null)}
            >
              Not now
            </Button>
            <Button
              disabled={discoveryPromptActing || !discoveryPrompt}
              onClick={() => {
                if (!discoveryPrompt) return;
                const token = getSessionToken();
                if (!token) return;
                setDiscoveryPromptActing(true);
                void (async () => {
                  const res = await approveFriendDiscoveryDraft(
                    token,
                    discoveryPrompt.draftId,
                  );
                  setDiscoveryPromptActing(false);
                  if (!res.ok) {
                    toast({
                      title: "Could not share",
                      description: res.error ?? "Please try again.",
                      variant: "destructive",
                    });
                    return;
                  }
                  toast({
                    title: "Shared with friends",
                    description: "Your friends can claim this opportunity.",
                  });
                  setDiscoveryPrompt(null);
                  setDiscoveryRefreshKey((key) => key + 1);
                })();
              }}
            >
              {discoveryPromptActing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Share now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Footer />
    </div>
  );
};

function PerkLogo({
  title,
  imageUrl,
}: {
  title: string;
  imageUrl: string | null;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials =
    title
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  if (imageUrl && !imageFailed) {
    return (
      <img
        src={imageUrl}
        alt=""
        className="h-14 w-14 shrink-0 rounded-xl border border-border/60 bg-background object-contain p-1.5"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-sm font-semibold text-primary">
      {initials}
    </div>
  );
}

function PerkDetailsDialog({
  perk,
  open,
  claiming,
  onOpenChange,
  onClaim,
  onViewApplication,
  onCopyCode,
}: {
  perk: PerkItem | null;
  open: boolean;
  claiming: boolean;
  onOpenChange: (open: boolean) => void;
  onClaim: () => void;
  onViewApplication: () => void;
  onCopyCode: (code: string) => void;
}) {
  const locked = perk ? !perk.accessible && !perk.redeemed : false;
  const isWorkflowPerk = perk?.redemptionType === "workflow";
  const hasActiveApplication = perk?.applicationInProgress === true;
  const couponCode = perk?.couponCode?.trim() || undefined;
  const isCouponCard =
    perk?.redemptionType === "coupon_code" && couponCode !== undefined;
  const couponOpensPartner =
    isCouponCard &&
    Boolean(perk?.redemptionUrl && isSafeHttpUrl(perk.redemptionUrl));
  const upgradeHref =
    perk?.accessLevel === "annual" ? "/upgrade-annual" : "/subscribe";
  const upgradeLabel =
    perk?.accessLevel === "annual"
      ? "Upgrade to annual"
      : "Subscribe to unlock";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] max-w-lg overflow-y-auto">
        {!perk ? null : (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3 pr-6">
                <div className="min-w-0 flex-1">
                  {perk.partnerName ? (
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {perk.partnerName}
                    </p>
                  ) : null}
                  <DialogTitle className="text-left text-xl">
                    {perk.title}
                  </DialogTitle>
                </div>
                <PerkLogo title={perk.title} imageUrl={perk.imageUrl} />
              </div>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {CATEGORY_LABELS[perk.category]}
                </Badge>
                <Badge variant="outline">
                  {ACCESS_BADGE[perk.accessLevel]}
                </Badge>
                {locked ? (
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 text-amber-700"
                  >
                    Locked
                  </Badge>
                ) : null}
                {perk.redeemed ? (
                  perk.confirmationStatus === "confirmed_received" ? (
                    <Badge className="bg-green-600">Received</Badge>
                  ) : perk.confirmationStatus === "not_received" ? (
                    <Badge variant="destructive">Didn&apos;t receive</Badge>
                  ) : (
                    <Badge className="bg-green-600">Claimed</Badge>
                  )
                ) : null}
              </div>

              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <p className="text-sm font-medium text-primary">
                  {perk.offerText}
                </p>
              </div>

              <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  How it works
                </p>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {linkifyDescription(perk.description)}
                </div>
              </div>

              {locked ? (
                <div className="rounded-lg border border-border/70 bg-background p-3">
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-2">
                      <p>
                        {perk.accessLevel === "annual"
                          ? "This perk is reserved for annual members."
                          : "Subscribe to unlock this partner offer."}
                      </p>
                      <Button size="sm" asChild>
                        <Link to={upgradeHref}>{upgradeLabel}</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {isCouponCard && couponCode ? (
                <div className="flex h-10 gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-0.5 rounded-md border border-input bg-muted/40 px-2">
                    <span
                      className="min-w-0 flex-1 truncate font-mono text-sm font-semibold tracking-wide"
                      title={couponCode}
                    >
                      {couponCode}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      disabled={locked}
                      onClick={() => onCopyCode(couponCode)}
                      aria-label="Copy coupon code"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
              {!locked && isWorkflowPerk && (perk.redeemed || hasActiveApplication) ? (
                <Button disabled={claiming} onClick={onViewApplication}>
                  {claiming ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="mr-2 h-4 w-4" />
                  )}
                  {hasActiveApplication && !perk.redeemed
                    ? perk.ctaLabel
                    : "View application"}
                </Button>
              ) : !locked ? (
                <Button
                  disabled={perk.redeemed || claiming || hasActiveApplication}
                  onClick={onClaim}
                >
                  {claiming ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (perk.redemptionType === "external_link" ||
                      couponOpensPartner) &&
                    !perk.redeemed ? (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  ) : null}
                  {perk.ctaLabel}
                </Button>
              ) : null}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PerkCard({
  perk,
  tab,
  claiming,
  acting,
  onClaim,
  onCopyCode,
  onViewDetails,
  onViewApplication,
  onSnooze,
  onDismiss,
  onRestore,
  onUnclaim,
  onConfirmReceived,
  onReportNotReceived,
  onSnoozedToNotInterested,
  onNotInterestedToSnoozed,
}: {
  perk: PerkItem;
  tab: PerkUserTab;
  claiming: boolean;
  acting: boolean;
  onClaim: () => void;
  onCopyCode: (code: string) => void;
  onViewDetails: () => void;
  onViewApplication: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
  onRestore: () => void;
  onUnclaim: () => void;
  onConfirmReceived: () => void;
  onReportNotReceived: () => void;
  onSnoozedToNotInterested: () => void;
  onNotInterestedToSnoozed: () => void;
}) {
  const locked = !perk.accessible && !perk.redeemed;
  const isWorkflowPerk = perk.redemptionType === "workflow";
  const hasActiveApplication = perk.applicationInProgress === true;
  const expirationLabel = formatExpirationLabel(perk);
  const couponCode = perk.couponCode?.trim() || undefined;
  const isCouponCard =
    perk.redemptionType === "coupon_code" && couponCode !== undefined;
  const couponOpensPartner =
    isCouponCard &&
    Boolean(perk.redemptionUrl && isSafeHttpUrl(perk.redemptionUrl));
  const upgradeHref =
    perk.accessLevel === "annual" ? "/upgrade-annual" : "/subscribe";
  const upgradeLabel =
    perk.accessLevel === "annual" ? "Upgrade to annual" : "Subscribe to unlock";

  return (
    <Card
      className={`relative overflow-hidden border-border/60 bg-card/80 backdrop-blur ${perk.isFeatured ? "ring-1 ring-primary/30" : ""}`}
    >
      {locked ? (
        <div className="pointer-events-none absolute inset-0 z-10 bg-background/55 backdrop-blur-[1px]" />
      ) : null}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {perk.partnerName ? (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {perk.partnerName}
              </p>
            ) : null}
            <CardTitle className="text-lg">{perk.title}</CardTitle>
            <CardDescription className="mt-1 line-clamp-3">
              {perk.description}
            </CardDescription>
            {descriptionHasMoreThanPreview(perk.description) ? (
              <Button
                type="button"
                variant="link"
                className="relative z-20 h-auto p-0 text-sm"
                onClick={onViewDetails}
              >
                View details
              </Button>
            ) : null}
          </div>
          <PerkLogo title={perk.title} imageUrl={perk.imageUrl} />
        </div>
      </CardHeader>
      <CardContent className="relative space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{CATEGORY_LABELS[perk.category]}</Badge>
          <Badge variant="outline">{ACCESS_BADGE[perk.accessLevel]}</Badge>
          {locked ? (
            <Badge
              variant="outline"
              className="border-amber-500/40 text-amber-700"
            >
              Locked
            </Badge>
          ) : null}
          {perk.redeemed ? (
            perk.confirmationStatus === "confirmed_received" ? (
              <Badge className="bg-green-600">Received</Badge>
            ) : perk.confirmationStatus === "not_received" ? (
              <Badge variant="destructive">Didn&apos;t receive</Badge>
            ) : (
              <Badge className="bg-green-600">Claimed</Badge>
            )
          ) : null}
          {hasActiveApplication ? (
            <Badge variant="outline" className="border-primary/40 text-primary">
              Application in progress
            </Badge>
          ) : null}
          {expirationLabel ? (
            <Badge
              variant="outline"
              className="border-amber-500/40 text-amber-800"
            >
              {expirationLabel}
            </Badge>
          ) : null}
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <p className="text-sm font-medium text-primary">{perk.offerText}</p>
        </div>
        {locked ? (
          <div className="relative z-20 rounded-lg border border-border/70 bg-background/95 p-3">
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-2">
                <p>
                  {perk.accessLevel === "annual"
                    ? "This perk is reserved for annual members."
                    : "Subscribe to unlock this partner offer."}
                </p>
                <Button size="sm" asChild>
                  <Link to={upgradeHref}>{upgradeLabel}</Link>
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        {isCouponCard && couponCode ? (
          <div className="relative z-20 flex h-10 gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-0.5 rounded-md border border-input bg-muted/40 px-2">
              <span
                className="min-w-0 flex-1 truncate font-mono text-sm font-semibold tracking-wide"
                title={couponCode}
              >
                {couponCode}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                disabled={locked}
                onClick={() => onCopyCode(couponCode)}
                aria-label="Copy coupon code"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button
              className="h-10 shrink-0 px-4 sm:min-w-[8.5rem]"
              disabled={locked || perk.redeemed || claiming}
              onClick={onClaim}
            >
              {claiming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : couponOpensPartner && !perk.redeemed ? (
                <ExternalLink className="mr-2 h-4 w-4" />
              ) : null}
              {perk.ctaLabel}
            </Button>
          </div>
        ) : isWorkflowPerk && (perk.redeemed || hasActiveApplication) ? (
          <Button
            className="relative z-20 h-10 w-full"
            variant={hasActiveApplication && !perk.redeemed ? "default" : "outline"}
            disabled={locked || claiming}
            onClick={onViewApplication}
          >
            {claiming ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            {hasActiveApplication && !perk.redeemed
              ? perk.ctaLabel
              : "View application"}
          </Button>
        ) : (
          <Button
            className="relative z-20 h-10 w-full"
            disabled={locked || perk.redeemed || claiming}
            onClick={onClaim}
          >
            {claiming ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : perk.redemptionType === "external_link" && !perk.redeemed ? (
              <ExternalLink className="mr-2 h-4 w-4" />
            ) : null}
            {perk.ctaLabel}
          </Button>
        )}
        {tab === "new" && !locked && !perk.redeemed && !hasActiveApplication ? (
          <div className="relative z-20 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={acting}
              onClick={onSnooze}
            >
              Snooze
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={acting}
              onClick={onDismiss}
            >
              Not Interested
            </Button>
          </div>
        ) : null}
        {tab === "completed" ? (
          <div className="relative z-20 space-y-3">
            {perk.confirmationStatus === "claimed" ||
            !perk.confirmationStatus ? (
              <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                <p className="mb-2 text-sm font-medium text-foreground">
                  Did you successfully receive this perk?
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={acting}
                    onClick={onConfirmReceived}
                  >
                    ✅ I Received This Perk
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={acting}
                    onClick={onReportNotReceived}
                  >
                    ❌ Didn&apos;t Receive It
                  </Button>
                </div>
              </div>
            ) : perk.confirmationStatus === "confirmed_received" ? (
              <p className="text-sm text-muted-foreground">
                Confirmed received
                {typeof perk.estimatedValueCents === "number"
                  ? ` · ~$${(perk.estimatedValueCents / 100).toFixed(0)} value`
                  : null}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                You reported this wasn&apos;t received. Our team can help —
                thanks for the heads-up.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={acting}
                onClick={onUnclaim}
              >
                Move back to New
              </Button>
            </div>
          </div>
        ) : null}
        {tab === "snoozed" ? (
          <div className="relative z-20 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={acting}
              onClick={onRestore}
            >
              Restore to New
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={acting}
              onClick={onSnoozedToNotInterested}
            >
              Not Interested
            </Button>
          </div>
        ) : null}
        {tab === "not_interested" ? (
          <div className="relative z-20 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={acting}
              onClick={onRestore}
            >
              Restore to New
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={acting}
              onClick={onNotInterestedToSnoozed}
            >
              Snooze
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RequestPerkDialog({
  open,
  submitting,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: {
    serviceName: string;
    websiteUrl?: string;
    category?: PerkRequestCategory;
    notes?: string;
  }) => Promise<void>;
}) {
  const [serviceName, setServiceName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [category, setCategory] = useState<PerkRequestCategory | "">("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) {
      setServiceName("");
      setWebsiteUrl("");
      setCategory("");
      setNotes("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request a perk</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="request-service">Service name</Label>
            <Input
              id="request-service"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder="e.g. Notion"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="request-website">Website URL (optional)</Label>
            <Input
              id="request-website"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://"
            />
          </div>
          <div className="space-y-2">
            <Label>Category (optional)</Label>
            <Select
              value={category || "__none__"}
              onValueChange={(value) =>
                setCategory(
                  value === "__none__" ? "" : (value as PerkRequestCategory),
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {REQUEST_CATEGORIES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="request-notes">Additional notes (optional)</Label>
            <Textarea
              id="request-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={!serviceName.trim() || submitting}
            onClick={() =>
              void onSubmit({
                serviceName: serviceName.trim(),
                websiteUrl: websiteUrl.trim() || undefined,
                category: category || undefined,
                notes: notes.trim() || undefined,
              })
            }
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default Perks;
