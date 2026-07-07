import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Lightbulb,
  ListChecks,
  MessageSquareText,
  Share2,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import type { ReactNode } from "react";
import { formatCents } from "../lib/utils";

export const typeLabel: Record<string, string> = {
  hire_agent: "Hire Agent",
  approve_ceo_strategy: "CEO Strategy",
  budget_override_required: "Budget Override",
  request_board_approval: "Board Approval",
};

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

export function approvalSubject(payload?: Record<string, unknown> | null): string | null {
  return firstNonEmptyString(
    payload?.title,
    payload?.name,
    payload?.summary,
    payload?.recommendedAction,
  );
}

/** Build a contextual label for an approval, e.g. "Hire Agent: Designer" */
export function approvalLabel(type: string, payload?: Record<string, unknown> | null): string {
  const base = typeLabel[type] ?? type;
  const subject = approvalSubject(payload);
  if (subject) {
    return `${base}: ${subject}`;
  }
  return base;
}

export const typeIcon: Record<string, typeof UserPlus> = {
  hire_agent: UserPlus,
  approve_ceo_strategy: Lightbulb,
  budget_override_required: ShieldAlert,
  request_board_approval: ShieldCheck,
};

export const defaultTypeIcon = ShieldCheck;

function PayloadField({ label, value }: { label: string; value: unknown }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">{label}</span>
      <span>{String(value)}</span>
    </div>
  );
}

function StringList({
  label,
  values,
  icon,
}: {
  label: string;
  values: unknown;
  icon?: ReactNode;
}) {
  if (!Array.isArray(values)) return null;
  const items = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-background/60 px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {icon}
        {label}
      </p>
      <ul className="mt-2 space-y-1.5 text-sm text-foreground/90">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
            <span className="leading-6">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function stringRecord(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
    .map(([key, text]) => [key.trim(), text.trim()] as const)
    .filter(([key]) => key.length > 0);
  if (entries.length === 0) return null;
  return Object.fromEntries(entries);
}

function PlatformCopies({ values }: { values: unknown }) {
  const copies = stringRecord(values);
  if (!copies) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-background/60 px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        <MessageSquareText className="h-3.5 w-3.5" />
        Post copy
      </p>
      <div className="mt-3 space-y-3">
        {Object.entries(copies).map(([platform, text]) => (
          <div key={platform} className="rounded-md border border-border/60 bg-muted/30 px-3 py-2.5">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {platform.replaceAll("_", " ").replaceAll("-", " ")}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LinkButton({
  href,
  label,
  icon,
}: {
  href: string | null;
  label: string;
  icon: ReactNode;
}) {
  if (!href) return null;
  const keepOpenerForLocalReview =
    href.startsWith("http://127.0.0.1:") ||
    href.startsWith("http://localhost:") ||
    href.startsWith("/");
  return (
    <a
      href={href}
      target="_blank"
      rel={keepOpenerForLocalReview ? undefined : "noreferrer"}
      className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
    >
      {icon}
      {label}
      <ExternalLink className="h-3 w-3 text-muted-foreground" />
    </a>
  );
}

function hccRouteId(value: string | null, route: "doc" | "img" | "review") {
  if (!value) return null;
  try {
    const baseOrigin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
    const parsed = value.startsWith("/") ? new URL(value, baseOrigin) : new URL(value);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] !== route || !parts[1]) return null;
    return decodeURIComponent(parts[1]);
  } catch {
    return null;
  }
}

function hccDocumentUrl(value: string | null) {
  const id = hccRouteId(value, "doc");
  return id ? `/doc/${encodeURIComponent(id)}` : value;
}

function hccImageUrl(value: string | null) {
  const id = hccRouteId(value, "img");
  return id ? `/img/${encodeURIComponent(id)}` : value;
}

function hccSignedReviewUrl(value: string | null) {
  if (!value) return null;
  const id = hccRouteId(value, "review");
  if (!id) return value;
  try {
    const baseOrigin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
    const parsed = value.startsWith("/") ? new URL(value, baseOrigin) : new URL(value);
    return parsed.searchParams.has("token") ? `/review/${encodeURIComponent(id)}?${parsed.searchParams.toString()}` : null;
  } catch {
    return null;
  }
}

function SkillList({ values }: { values: unknown }) {
  if (!Array.isArray(values)) return null;
  const items = values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  if (items.length === 0) return null;

  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs pt-0.5">Skills</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function HireAgentPayload({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">Name</span>
        <span className="font-medium">{String(payload.name ?? "—")}</span>
      </div>
      <PayloadField label="Role" value={payload.role} />
      <PayloadField label="Title" value={payload.title} />
      <PayloadField label="Icon" value={payload.icon} />
      {!!payload.capabilities && (
        <div className="flex items-start gap-2">
          <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs pt-0.5">Capabilities</span>
          <span className="text-muted-foreground">{String(payload.capabilities)}</span>
        </div>
      )}
      {!!payload.adapterType && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-20 sm:w-24 shrink-0 text-xs">Adapter</span>
          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
            {String(payload.adapterType)}
          </span>
        </div>
      )}
      <SkillList values={payload.desiredSkills} />
    </div>
  );
}

export function CeoStrategyPayload({ payload }: { payload: Record<string, unknown> }) {
  const plan = payload.plan ?? payload.description ?? payload.strategy ?? payload.text;
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <PayloadField label="Title" value={payload.title} />
      {!!plan && (
        <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground whitespace-pre-wrap font-mono text-xs max-h-48 overflow-y-auto">
          {String(plan)}
        </div>
      )}
      {!plan && (
        <pre className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground overflow-x-auto max-h-48">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function BudgetOverridePayload({ payload }: { payload: Record<string, unknown> }) {
  const budgetAmount = typeof payload.budgetAmount === "number" ? payload.budgetAmount : null;
  const observedAmount = typeof payload.observedAmount === "number" ? payload.observedAmount : null;
  return (
    <div className="mt-3 space-y-1.5 text-sm">
      <PayloadField label="Scope" value={payload.scopeName ?? payload.scopeType} />
      <PayloadField label="Window" value={payload.windowKind} />
      <PayloadField label="Metric" value={payload.metric} />
      {(budgetAmount !== null || observedAmount !== null) ? (
        <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Limit {budgetAmount !== null ? formatCents(budgetAmount) : "—"} · Observed {observedAmount !== null ? formatCents(observedAmount) : "—"}
        </div>
      ) : null}
      {!!payload.guidance && (
        <p className="text-muted-foreground">{String(payload.guidance)}</p>
      )}
    </div>
  );
}

export function BoardApprovalPayload({
  payload,
  hideTitle = false,
}: {
  payload: Record<string, unknown>;
  hideTitle?: boolean;
}) {
  const nextPayload = hideTitle ? { ...payload, title: undefined } : payload;
  return (
    <BoardApprovalPayloadContent payload={nextPayload} />
  );
}

function BoardApprovalPayloadContent({ payload }: { payload: Record<string, unknown> }) {
  const risks = Array.isArray(payload.risks)
    ? payload.risks
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  const title = firstNonEmptyString(payload.title);
  const summary = firstNonEmptyString(payload.summary);
  const recommendedAction = firstNonEmptyString(payload.recommendedAction);
  const nextActionOnApproval = firstNonEmptyString(payload.nextActionOnApproval);
  const proposedComment = firstNonEmptyString(payload.proposedComment);
  const reviewKind = firstNonEmptyString(payload.reviewKind, payload.contentType);
  const contentFamily = firstNonEmptyString(payload.contentFamily);
  const department = firstNonEmptyString(payload.department);
  const fullDocumentUrl = hccDocumentUrl(firstNonEmptyString(payload.fullDocumentUrl));
  const hccReviewUrl = hccSignedReviewUrl(firstNonEmptyString(payload.hccReviewUrl));
  const imageUrl = hccImageUrl(firstNonEmptyString(payload.imageUrl));
  const liveArticleUrl = firstNonEmptyString(payload.liveArticleUrl);
  const isVideoApproval =
    Boolean(firstNonEmptyString(payload.videoPath, payload.video_path)) ||
    /\bvideo\b/i.test(String(reviewKind ?? ""));
  const videoUrl = isVideoApproval ? fullDocumentUrl : null;
  const socialDistributionRequired = payload.socialDistributionRequired === true;
  const sameImageForSocial = payload.sameImageForSocial === true;
  const assetStatus = firstNonEmptyString(payload.assetStatus);
  const seoGeoAeoValueSummary = firstNonEmptyString(payload.seoGeoAeoValueSummary);

  return (
    <div className="mt-4 space-y-3.5 text-sm">
      {(reviewKind || contentFamily || department) && (
        <div className="flex flex-wrap gap-2">
          {reviewKind && (
            <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-foreground">
              {reviewKind}
            </span>
          )}
          {contentFamily && (
            <span className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
              {contentFamily}
            </span>
          )}
          {department && (
            <span className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
              {department}
            </span>
          )}
          {assetStatus && assetStatus !== "complete" && (
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-300">
              {assetStatus.replaceAll("_", " ")}
            </span>
          )}
        </div>
      )}
      {title && (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Title</p>
          <p className="font-medium leading-6 text-foreground">{title}</p>
        </div>
      )}
      {summary && (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Summary</p>
          <p className="leading-6 text-foreground/90">{summary}</p>
        </div>
      )}
      {(fullDocumentUrl || imageUrl || hccReviewUrl || liveArticleUrl) && (
        <div className="flex flex-wrap gap-2">
          <LinkButton
            href={fullDocumentUrl}
            label="Open full HTML"
            icon={<FileText className="h-3.5 w-3.5" />}
          />
          <LinkButton
            href={imageUrl}
            label="Open image"
            icon={<ImageIcon className="h-3.5 w-3.5" />}
          />
          {hccReviewUrl && hccReviewUrl !== fullDocumentUrl && (
            <LinkButton
              href={hccReviewUrl}
              label="Review page"
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
            />
          )}
          <LinkButton
            href={liveArticleUrl}
            label="Live article"
            icon={<ExternalLink className="h-3.5 w-3.5" />}
          />
        </div>
      )}
      {videoUrl && (
        <video
          src={videoUrl}
          controls
          preload="metadata"
          className="mt-2 w-full max-h-[28rem] rounded-lg border border-border/60 bg-black"
        />
      )}
      {!videoUrl && imageUrl && (
        <img
          src={imageUrl}
          alt="Approval visual"
          className="mt-2 w-full max-h-[28rem] rounded-lg border border-border/60 bg-muted/30 object-contain"
        />
      )}
      {recommendedAction && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3.5 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-amber-700 dark:text-amber-300">
            Recommended action
          </p>
          <p className="mt-1 leading-6 text-foreground">{recommendedAction}</p>
        </div>
      )}
      {nextActionOnApproval && (
        <div className="rounded-lg border border-border/60 bg-background/60 px-3.5 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">On approval</p>
          <p className="mt-1 leading-6 text-foreground">{nextActionOnApproval}</p>
        </div>
      )}
      {socialDistributionRequired && (
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em] text-sky-700 dark:text-sky-300">
            <Share2 className="h-3.5 w-3.5" />
            Social distribution required
          </p>
          <p className="mt-1 leading-6 text-foreground">
            After the article is approved, Social Media must create posts for the channels in the plan.
            {sameImageForSocial ? " Use the same approved image unless a replacement image gets separate approval." : ""}
          </p>
        </div>
      )}
      {seoGeoAeoValueSummary && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300">
            SEO / GEO / AEO impact
          </p>
          <p className="mt-1 leading-6 text-foreground">{seoGeoAeoValueSummary}</p>
        </div>
      )}
      <PlatformCopies values={payload.platform_copies ?? payload.platformCopies} />
      <StringList
        label="Brand visibility targets"
        values={payload.brandVisibilityTargets}
        icon={<ListChecks className="h-3.5 w-3.5" />}
      />
      <StringList
        label="SEO keywords"
        values={payload.seoKeywords}
        icon={<ListChecks className="h-3.5 w-3.5" />}
      />
      <StringList
        label="GEO citation entities"
        values={payload.geoEntities}
        icon={<ListChecks className="h-3.5 w-3.5" />}
      />
      <StringList
        label="AEO questions"
        values={payload.aeoQuestions}
        icon={<ListChecks className="h-3.5 w-3.5" />}
      />
      <StringList
        label="LinkedIn hashtags"
        values={payload.linkedinHashtags}
        icon={<Share2 className="h-3.5 w-3.5" />}
      />
      <StringList
        label="Included platforms"
        values={payload.platforms}
        icon={<Share2 className="h-3.5 w-3.5" />}
      />
      <StringList
        label="Publishing notes"
        values={payload.publishingNotes}
        icon={<ListChecks className="h-3.5 w-3.5" />}
      />
      <StringList
        label="Approval checklist"
        values={payload.approvalChecklist}
        icon={<ListChecks className="h-3.5 w-3.5" />}
      />
      <StringList
        label="Social distribution plan"
        values={payload.socialDistributionPlan}
        icon={<Share2 className="h-3.5 w-3.5" />}
      />
      {risks.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Risks</p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {risks.map((risk) => (
              <li key={risk} className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                <span className="leading-6">{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {proposedComment && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Proposed comment
          </p>
          <pre className="max-h-48 overflow-auto rounded-lg border border-border/60 bg-muted/50 px-3.5 py-3 font-mono text-xs leading-5 text-muted-foreground whitespace-pre-wrap">
            {proposedComment}
          </pre>
        </div>
      )}
    </div>
  );
}

export function ApprovalPayloadRenderer({
  type,
  payload,
  hidePrimaryTitle = false,
}: {
  type: string;
  payload: Record<string, unknown>;
  hidePrimaryTitle?: boolean;
}) {
  if (type === "hire_agent") return <HireAgentPayload payload={payload} />;
  if (type === "budget_override_required") return <BudgetOverridePayload payload={payload} />;
  if (type === "request_board_approval") {
    return <BoardApprovalPayload payload={payload} hideTitle={hidePrimaryTitle} />;
  }
  return <CeoStrategyPayload payload={payload} />;
}
