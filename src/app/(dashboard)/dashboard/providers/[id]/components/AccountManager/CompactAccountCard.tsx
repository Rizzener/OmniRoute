"use client";

import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components";
import { formatDistanceToNow } from "date-fns";
import { ru, enUS } from "date-fns/locale";
import { useLocale } from "next-intl";
import type { AccountOverview, HealthStatus } from "@/lib/accountManager/types";

interface CompactAccountCardProps {
  account: AccountOverview;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onOpenDetails: (id: string) => void;
  onToggleActive: (id: string, enabled: boolean) => void;
  onQuickTest: (id: string) => void;
  onQuickProxyTest: (id: string) => void;
}

const STATUS_CONFIG: Record<
  HealthStatus,
  { variant: "success" | "warning" | "error" | "default" | "info"; labelKey: string; icon: string }
> = {
  working: { variant: "success", labelKey: "statusWorking", icon: "check_circle" },
  unchecked: { variant: "default", labelKey: "statusUnchecked", icon: "help_outline" },
  checking: { variant: "info", labelKey: "statusChecking", icon: "sync" },
  rate_limited: { variant: "warning", labelKey: "statusRateLimited", icon: "speed" },
  quota_exhausted: { variant: "warning", labelKey: "statusQuotaExhausted", icon: "battery_0_bar" },
  auth_error: { variant: "error", labelKey: "statusAuthError", icon: "lock_open" },
  proxy_error: { variant: "error", labelKey: "statusProxyError", icon: "vpn_lock" },
  provider_error: { variant: "error", labelKey: "statusProviderError", icon: "cloud_off" },
  disabled: { variant: "default", labelKey: "statusDisabled", icon: "toggle_off" },
};

const QUOTA_COLORS = [
  {
    threshold: 70,
    bg: "bg-emerald-500/15",
    text: "text-emerald-500",
    border: "border-emerald-500/30",
  },
  { threshold: 30, bg: "bg-amber-500/15", text: "text-amber-500", border: "border-amber-500/30" },
  { threshold: 0, bg: "bg-red-500/15", text: "text-red-500", border: "border-red-500/30" },
];

function getQuotaColor(pct: number | null) {
  if (pct === null) return QUOTA_COLORS[1];
  for (const c of QUOTA_COLORS) {
    if (pct >= c.threshold) return c;
  }
  return QUOTA_COLORS[2];
}

function formatRelativeTime(dateStr: string | null, locale: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const loc = locale.startsWith("ru") ? ru : enUS;
    return formatDistanceToNow(date, { addSuffix: true, locale: loc });
  } catch {
    return "";
  }
}

export default function CompactAccountCard({
  account,
  isSelected,
  onSelect,
  onOpenDetails,
  onToggleActive,
  onQuickTest,
  onQuickProxyTest,
}: CompactAccountCardProps) {
  const t = useTranslations("accountManager");
  const locale = useLocale();
  const statusConfig = STATUS_CONFIG[account.healthStatus];

  // Main quota windows to show in card (5h, 7d, monthly)
  const mainQuotas = account.quotas
    .filter((q) =>
      ["5h", "7d", "monthly", "session", "week", "month"].some((k) =>
        q.name.toLowerCase().includes(k)
      )
    )
    .slice(0, 3);

  const hasProxy = !!account.effectiveProxy;
  const proxySourceLabel = account.effectiveProxy
    ? t(`proxySource.${account.effectiveProxy.source}`)
    : t("proxySource.none");

  const rateLimitLabel = account.rateLimit.effectiveState
    ? t("rateLimit.protected")
    : t("rateLimit.unprotected");
  const rateLimitVariant = account.rateLimit.effectiveState ? "success" : "default";

  const routingLabel =
    t(`routing.strategy.${account.routing.effectiveStrategy.toLowerCase().replace(/-/g, "_")}`) ||
    account.routing.effectiveStrategy;

  return (
    <div
      className={`group flex ${account.enabled ? "" : "opacity-50"} p-3 rounded-lg hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors border border-border/50`}
      data-connection-id={account.connectionId}
    >
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 basis-64">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(account.connectionId)}
          className="w-4 h-4 shrink-0 rounded border-border text-primary focus:ring-primary/30 cursor-pointer"
        />

        {/* Drag handle */}
        <span
          className="material-symbols-outlined text-text-muted cursor-grab hover:text-text-main"
          title={t("dragToReorder")}
        >
          drag_indicator
        </span>

        {/* Auth icon */}
        <span className="material-symbols-outlined hidden text-base text-text-muted sm:inline-block">
          {account.authType === "oauth"
            ? "lock"
            : account.authType === "web_cookie"
              ? "cookie"
              : "key"}
        </span>

        {/* Name + Provider badge */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium break-words sm:truncate">{account.displayName}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* Status badge */}
            <Badge variant={statusConfig.variant as any} size="sm" dot className="gap-1">
              <span className="material-symbols-outlined text-[11px]">{statusConfig.icon}</span>
              {t(statusConfig.labelKey)}
            </Badge>

            {/* Auth expiry */}
            {account.healthDetails.auth.minutesUntilExpiry !== null && (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${
                  account.healthDetails.auth.status === "expired"
                    ? "bg-red-500/15 text-red-500"
                    : account.healthDetails.auth.status === "expiring_soon"
                      ? "bg-amber-500/15 text-amber-500"
                      : "bg-emerald-500/15 text-emerald-500"
                }`}
              >
                <span className="material-symbols-outlined text-[11px]">
                  {account.healthDetails.auth.status === "expired" ? "error" : "schedule"}
                </span>
                {account.healthDetails.auth.minutesUntilExpiry < 0
                  ? t("tokenExpired")
                  : `${Math.floor(Math.abs(account.healthDetails.auth.minutesUntilExpiry) / 60)}h ${Math.abs(account.healthDetails.auth.minutesUntilExpiry) % 60}m`}
              </span>
            )}

            {/* Rate limit cooldown */}
            {account.healthDetails.rateLimit.status === "cooldown" &&
              account.rateLimit.current.cooldownUntil && (
                <span className="text-xs text-orange-500 font-mono">
                  ⏱ {formatRelativeTime(account.rateLimit.current.cooldownUntil, locale)}
                </span>
              )}

            {/* Quota chips */}
            {mainQuotas.map((q) => {
              const color = getQuotaColor(q.remainingPercentage);
              return (
                <span
                  key={q.name}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${color.bg} ${color.text} ${color.border}`}
                  title={`${q.displayName}: ${q.remainingPercentage !== null ? `${q.remainingPercentage}%` : q.unlimited ? t("quotaUnlimited") : "—"}`}
                >
                  {q.displayName}{" "}
                  {q.remainingPercentage !== null
                    ? `${Math.round(100 - q.remainingPercentage)}%`
                    : q.unlimited
                      ? "∞"
                      : "—"}
                </span>
              );
            })}

            {/* Proxy chip */}
            {hasProxy && (
              <button
                onClick={() => onQuickProxyTest(account.connectionId)}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-500/15 text-blue-500 hover:bg-blue-500/25 transition-colors cursor-pointer"
                title={t("proxyConfiguredBySource", {
                  source: proxySourceLabel,
                  host: account.effectiveProxy?.maskedAddress || "",
                })}
              >
                <span className="material-symbols-outlined text-[13px]">vpn_lock</span>
                {account.effectiveProxy?.name ||
                  account.effectiveProxy?.maskedAddress ||
                  t("proxy")}
                <span className="material-symbols-outlined text-[10px]">info</span>
              </button>
            )}

            {/* Rate Limit Protection */}
            <button
              onClick={() => onOpenDetails(account.connectionId)}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium transition-all cursor-pointer ${
                rateLimitVariant === "success"
                  ? "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25"
                  : "bg-black/[0.03] dark:bg-white/[0.03] text-text-muted/50 hover:text-text-muted hover:bg-black/[0.06] dark:hover:bg-white/[0.06]"
              }`}
              title={t("rateLimit.tooltip", {
                source: account.rateLimit.source,
                autoReason: account.rateLimit.autoReason || "",
              })}
            >
              <span className="material-symbols-outlined text-[13px]">shield</span>
              {rateLimitLabel}
            </button>

            {/* Routing */}
            {account.routing.participatesInCombo && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-violet-500/15 text-violet-500"
                title={t("routing.tooltip", {
                  strategy: routingLabel,
                  sticky: account.routing.stickyLimit,
                })}
              >
                <span className="material-symbols-outlined text-[13px]">swap_horiz</span>
                {routingLabel}
                {account.routing.stickyLimit ? ` (sticky ${account.routing.stickyLimit})` : ""}
              </span>
            )}

            {/* Last success */}
            {account.lastSuccessAt && (
              <span
                className="text-xs text-text-muted"
                title={new Date(account.lastSuccessAt).toLocaleString(locale)}
              >
                {t("lastSuccess", { time: formatRelativeTime(account.lastSuccessAt, locale) })}
              </span>
            )}

            {/* Priority */}
            <span className="text-xs text-text-muted">#{account.routing.priority}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="basis-full min-w-0 xl:basis-auto">
        <div className="flex w-full flex-wrap items-center justify-between gap-0.5 sm:gap-1 xl:justify-end">
          <Button
            size="sm"
            variant="ghost"
            icon="play_arrow"
            onClick={() => onQuickTest(account.connectionId)}
            disabled={!account.enabled}
            className="!size-7 !p-0 sm:!w-auto sm:!px-2 text-xs"
            aria-label={t("testConnection")}
            title={t("testConnection")}
          >
            <span className="hidden sm:inline">{t("test")}</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                icon="more_vert"
                className="!size-7 !p-0"
                aria-label={t("moreActions")}
              />
            </DropdownMenuTrigger>
            <div className="dropdown-menu-content">
              <DropdownMenuItem onClick={() => onOpenDetails(account.connectionId)}>
                <span className="material-symbols-outlined text-[18px] mr-2">settings</span>
                {t("openDetails")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onQuickTest(account.connectionId)}
                disabled={!account.enabled}
              >
                <span className="material-symbols-outlined text-[18px] mr-2">play_arrow</span>
                {t("testConnection")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onQuickProxyTest(account.connectionId)}
                disabled={!hasProxy}
              >
                <span className="material-symbols-outlined text-[18px] mr-2">vpn_lock</span>
                {t("testProxy")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onToggleActive(account.connectionId, !account.enabled)}
                className={account.enabled ? "text-red-500" : "text-emerald-500"}
              >
                <span className="material-symbols-outlined text-[18px] mr-2">
                  {account.enabled ? "toggle_off" : "toggle_on"}
                </span>
                {account.enabled ? t("disableAccount") : t("enableAccount")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-500"
                onClick={() => onOpenDetails(account.connectionId)}
              >
                <span className="material-symbols-outlined text-[18px] mr-2">delete</span>
                {t("deleteAccount")}
              </DropdownMenuItem>
            </div>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
