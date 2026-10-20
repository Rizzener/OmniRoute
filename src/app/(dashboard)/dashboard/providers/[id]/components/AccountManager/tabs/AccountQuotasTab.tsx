"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, Button, Badge, Progress, ScrollArea } from "@/shared/components";
import { formatDistanceToNow } from "date-fns";
import { ru, enUS } from "date-fns/locale";
import { useLocale } from "next-intl";
import type { AccountOverview, QuotaWindow } from "@/lib/accountManager/types";

interface AccountQuotasTabProps {
  account: AccountOverview;
}

const QUOTA_STATUS_COLORS = {
  available: "text-emerald-500",
  low: "text-amber-500",
  exhausted: "text-red-500",
  waiting_recovery: "text-blue-500",
  stale: "text-text-muted",
  unknown: "text-text-muted",
  unlimited: "text-sky-500",
};

function formatRelativeTime(dateStr: string | null, locale: string): string {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    const loc = locale.startsWith("ru") ? ru : enUS;
    return formatDistanceToNow(date, { addSuffix: true, locale: loc });
  } catch {
    return "—";
  }
}

function getProgressColor(pct: number | null) {
  if (pct === null) return "bg-gray-400";
  if (pct >= 70) return "bg-emerald-500";
  if (pct >= 30) return "bg-amber-500";
  return "bg-red-500";
}

export function AccountQuotasTab({ account }: AccountQuotasTabProps) {
  const t = useTranslations("accountManager");
  const locale = useLocale();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch(`/api/account-manager/accounts/${account.connectionId}/quotas?refresh=true`, {
        method: "GET",
      });
      // Would trigger re-fetch via SWR or similar
    } finally {
      setRefreshing(false);
    }
  };

  const statusColor = QUOTA_STATUS_COLORS[account.healthDetails.quota.status] || "text-text-muted";

  return (
    <div className="space-y-4">
      {/* Quota Status Header */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">{t("quotas.status")}</h3>
          <Badge variant="outline" className={statusColor} dot>
            {t(`quotas.status.${account.healthDetails.quota.status}`)}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <div className="text-3xl font-bold {statusColor}">
              {account.healthDetails.quota.lowestRemainingPercentage !== null
                ? `${account.healthDetails.quota.lowestRemainingPercentage}%`
                : account.healthDetails.quota.status === "unlimited"
                  ? "∞"
                  : "—"}
            </div>
            <div className="text-xs text-text-muted">{t("quotas.remaining")}</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <div className="text-3xl font-bold">
              {account.healthDetails.quota.nextResetAt
                ? formatRelativeTime(account.healthDetails.quota.nextResetAt, locale)
                : "—"}
            </div>
            <div className="text-xs text-text-muted">{t("quotas.nextReset")}</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <div className="text-3xl font-bold">{account.quotas.length}</div>
            <div className="text-xs text-text-muted">{t("quotas.windowsTracked")}</div>
          </div>
        </div>

        {account.quotaFetchedAt && (
          <div className="mt-3 flex items-center gap-2 text-xs text-text-muted">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            <span>
              {t("quotas.lastSync", { time: formatRelativeTime(account.quotaFetchedAt, locale) })}
            </span>
            <Badge
              variant="outline"
              className={account.quotaSource === "stale" ? "text-amber-500" : "text-emerald-500"}
            >
              {t(`quotas.source.${account.quotaSource}`)}
            </Badge>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon="refresh"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? t("quotas.refreshing") : t("quotas.refresh")}
          </Button>
        </div>
      </Card>

      {/* Quota Windows */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t("quotas.windows")}</h3>

        {account.quotas.length === 0 ? (
          <div className="text-center text-text-muted py-8">
            <span className="material-symbols-outlined text-4xl">data_usage</span>
            <p className="mt-2">{t("quotas.noData")}</p>
            <Button
              variant="secondary"
              size="sm"
              icon="refresh"
              onClick={handleRefresh}
              className="mt-2"
            >
              {t("quotas.refresh")}
            </Button>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-3">
              {account.quotas.map((q) => (
                <QuotaWindowRow key={q.name} quota={q} locale={locale} t={t} />
              ))}
            </div>
          </ScrollArea>
        )}
      </Card>

      {/* Credits (if any) */}
      {account.quotas.some((q) => q.isCredits) && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">{t("quotas.credits")}</h3>
          <div className="space-y-2">
            {account.quotas
              .filter((q) => q.isCredits)
              .map((q) => (
                <div
                  key={q.name}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sky-500">toll</span>
                    <span className="font-medium">{q.displayName}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-sky-500">
                      {q.creditCount?.toLocaleString()}
                    </div>
                    <div className="text-xs text-text-muted">
                      {q.remainingPercentage !== null ? `${q.remainingPercentage}%` : "—"}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Details Expandable */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t("quotas.details")}</h3>
        <div className="space-y-2 text-sm">
          {account.quotas.map((q) => (
            <div key={q.name} className="p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{q.displayName}</span>
                <Badge
                  variant="outline"
                  className={getProgressColor(q.remainingPercentage).replace("bg-", "text-")}
                >
                  {q.unlimited
                    ? t("quotas.unlimited")
                    : q.remainingPercentage !== null
                      ? `${Math.round(100 - q.remainingPercentage)}% used`
                      : "—"}
                </Badge>
              </div>
              <Progress
                value={q.remainingPercentage !== null ? 100 - q.remainingPercentage : 0}
                className="h-2"
              />
              <div className="flex justify-between mt-1 text-xs text-text-muted">
                <span>
                  {q.used?.toLocaleString() ?? "—"} / {q.total?.toLocaleString() ?? "—"}
                </span>
                <span>
                  {q.resetAt
                    ? t("quotas.resetsIn", { time: formatRelativeTime(q.resetAt, locale) })
                    : "—"}
                </span>
              </div>
              {q.staleAfterReset && (
                <div className="mt-1 text-xs text-amber-500">
                  <span className="material-symbols-outlined text-[12px] inline">warning</span>
                  {t("quotas.staleAfterReset")}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function QuotaWindowRow({ quota, locale, t }: { quota: QuotaWindow; locale: string; t: any }) {
  const pct = quota.remainingPercentage;
  const usedPct = pct !== null ? 100 - pct : null;
  const color = getProgressColor(pct);

  return (
    <div className="p-3 rounded-lg border border-border/50 bg-muted/30">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`material-symbols-outlined ${quota.isCredits ? "text-sky-500" : "text-text-muted"}`}
          >
            {quota.isCredits ? "toll" : "schedule"}
          </span>
          <span className="font-medium">{quota.displayName}</span>
        </div>
        <Badge variant="outline" className={color.replace("bg-", "text-")}>
          {quota.unlimited
            ? t("quotas.unlimited")
            : quota.isCredits
              ? (quota.creditCount?.toLocaleString() ?? "—")
              : pct !== null
                ? `${pct}% {t("quotas.remaining")}`
                : "—"}
        </Badge>
      </div>

      {!quota.unlimited && (
        <Progress value={usedPct ?? 0} className="h-2" style={{ "--progress-color": color }} />
      )}

      <div className="flex justify-between mt-1 text-xs text-text-muted">
        <span>
          {quota.used !== null && quota.total !== null
            ? `${quota.used.toLocaleString()} / ${quota.total.toLocaleString()}`
            : quota.creditCount !== null
              ? `${quota.creditCount.toLocaleString()} credits`
              : "—"}
        </span>
        <span>
          {quota.resetAt
            ? t("quotas.resetsIn", { time: formatRelativeTime(quota.resetAt, locale) })
            : "—"}
        </span>
      </div>

      {quota.staleAfterReset && (
        <div className="mt-1 text-xs text-amber-500 flex items-center gap-1">
          <span className="material-symbols-outlined text-[12px]">warning</span>
          {t("quotas.staleAfterReset")}
        </div>
      )}
    </div>
  );
}
