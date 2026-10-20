"use client";

import { useTranslations } from "next-intl";
import { Card, Button, Badge } from "@/shared/components";
import type { AccountOverview } from "@/lib/accountManager/types";

interface AccountOverviewTabProps {
  account: AccountOverview;
}

export function AccountOverviewTab({ account }: AccountOverviewTabProps) {
  const t = useTranslations("accountManager");

  const statusLabels: Record<string, string> = {
    working: t("statusWorking"),
    unchecked: t("statusUnchecked"),
    checking: t("statusChecking"),
    rate_limited: t("statusRateLimited"),
    quota_exhausted: t("statusQuotaExhausted"),
    auth_error: t("statusAuthError"),
    proxy_error: t("statusProxyError"),
    provider_error: t("statusProviderError"),
    disabled: t("statusDisabled"),
  };

  const authStatusLabels: Record<string, string> = {
    valid: t("auth.valid"),
    expired: t("auth.expired"),
    expiring_soon: t("auth.expiringSoon"),
    missing: t("auth.missing"),
    unknown: t("auth.unknown"),
  };

  return (
    <div className="space-y-4">
      {/* Identity Card */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t("overview.identity")}</h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-text-muted">{t("overview.provider")}</dt>
            <dd className="font-medium">{account.providerId}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("overview.authType")}</dt>
            <dd className="font-medium capitalize">{account.authType.replace("_", " ")}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("overview.email")}</dt>
            <dd className="font-medium truncate">
              {account.displayName.includes("@") ? account.displayName : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("overview.connectionId")}</dt>
            <dd className="font-mono text-xs truncate">{account.connectionId}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("overview.status")}</dt>
            <dd>
              <Badge variant="secondary" className="gap-1">
                <span className="material-symbols-outlined text-[11px]">
                  {account.enabled ? "toggle_on" : "toggle_off"}
                </span>
                {account.enabled ? t("enabled") : t("disabled")}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">{t("overview.priority")}</dt>
            <dd className="font-medium">#{account.routing.priority}</dd>
          </div>
        </dl>
      </Card>

      {/* Health Summary */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t("overview.health")}</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/50">
            <dt className="text-xs text-text-muted mb-1">{t("overview.overallStatus")}</dt>
            <dd className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                {(
                  {
                    working: "check_circle",
                    unchecked: "help_outline",
                    checking: "sync",
                    rate_limited: "speed",
                    quota_exhausted: "battery_0_bar",
                    auth_error: "lock_open",
                    proxy_error: "vpn_lock",
                    provider_error: "cloud_off",
                    disabled: "toggle_off",
                  } as Record<string, string>
                )[account.healthStatus] && (
                  <span className="material-symbols-outlined text-[11px]">
                    {
                      (
                        {
                          working: "check_circle",
                          unchecked: "help_outline",
                          checking: "sync",
                          rate_limited: "speed",
                          quota_exhausted: "battery_0_bar",
                          auth_error: "lock_open",
                          proxy_error: "vpn_lock",
                          provider_error: "cloud_off",
                          disabled: "toggle_off",
                        } as Record<string, string>
                      )[account.healthStatus]
                    }
                  </span>
                )}
                {statusLabels[account.healthStatus] || account.healthStatus}
              </Badge>
            </dd>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <dt className="text-xs text-text-muted mb-1">{t("overview.authStatus")}</dt>
            <dd className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                {(
                  {
                    valid: "verified",
                    expired: "error",
                    expiring_soon: "warning",
                    missing: "lock_open",
                    unknown: "help_outline",
                  } as Record<string, string>
                )[account.healthDetails.auth.status] && (
                  <span className="material-symbols-outlined text-[11px]">
                    {
                      (
                        {
                          valid: "verified",
                          expired: "error",
                          expiring_soon: "warning",
                          missing: "lock_open",
                          unknown: "help_outline",
                        } as Record<string, string>
                      )[account.healthDetails.auth.status]
                    }
                  </span>
                )}
                {authStatusLabels[account.healthDetails.auth.status] ||
                  account.healthDetails.auth.status}
                {account.healthDetails.auth.minutesUntilExpiry !== null && (
                  <span className="text-xs text-text-muted">
                    (
                    {account.healthDetails.auth.minutesUntilExpiry < 0
                      ? t("tokenExpired")
                      : `${Math.floor(Math.abs(account.healthDetails.auth.minutesUntilExpiry) / 60)}h ${Math.abs(account.healthDetails.auth.minutesUntilExpiry) % 60}m`}
                    )
                  </span>
                )}
              </Badge>
            </dd>
          </div>
        </div>

        {/* Detailed health indicators */}
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          {[
            {
              label: t("overview.proxy"),
              value: account.healthDetails.proxy.status,
              icon: "vpn_lock",
            },
            {
              label: t("overview.quota"),
              value: account.healthDetails.quota.status,
              icon: "data_usage",
            },
            {
              label: t("overview.rateLimit"),
              value: account.healthDetails.rateLimit.status,
              icon: "shield",
            },
            {
              label: t("overview.upstream"),
              value: account.healthDetails.upstream.status,
              icon: "cloud",
            },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2 p-2 rounded bg-muted/30">
              <span className="material-symbols-outlined text-text-muted">{item.icon}</span>
              <span className="text-text-muted">{item.label}</span>
              <Badge variant="outline" className="ml-auto capitalize">
                {item.value}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* Quick Stats */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t("overview.quickStats")}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label={t("overview.uptime")} value="99.9%" icon="trending_up" />
          <StatCard
            label={t("overview.requests24h")}
            value={account.routing.requestsLast24h.toLocaleString()}
            icon="analytics"
          />
          <StatCard
            label={t("overview.successRate")}
            value={`${account.routing.successRate}%`}
            icon="check_circle"
          />
          <StatCard label={t("overview.avgLatency")} value="—" icon="timer" />
        </div>
      </Card>

      {/* Quick Actions */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t("overview.quickActions")}</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon="play_arrow" onClick={() => {}}>
            {t("overview.testConnection")}
          </Button>
          <Button variant="secondary" size="sm" icon="refresh" onClick={() => {}}>
            {t("overview.refreshQuotas")}
          </Button>
          <Button variant="secondary" size="sm" icon="medical_services" onClick={() => {}}>
            {t("overview.runDiagnostics")}
          </Button>
          <Button variant="secondary" size="sm" icon="vpn_lock" onClick={() => {}}>
            {t("overview.testProxy")}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/50">
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-text-muted">{icon}</span>
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      <div className="text-lg font-semibold ml-6">{value}</div>
    </div>
  );
}
