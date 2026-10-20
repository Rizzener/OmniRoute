"use client";

import { useTranslations } from "next-intl";
import { Card, Button, Badge, Tooltip, TooltipTrigger, TooltipContent } from "@/shared/components";
import type { AccountOverview } from "@/lib/accountManager/types";

interface AccountProtectionTabProps {
  account: AccountOverview;
}

const RATE_LIMIT_MODES = [
  { value: "inherit", label: "Inherit", description: "Use global/provider default" },
  { value: "enabled", label: "Enabled", description: "Explicitly enable protection" },
  { value: "disabled", label: "Disabled", description: "Disable protection (if allowed)" },
] as const;

export function AccountProtectionTab({ account }: AccountProtectionTabProps) {
  const t = useTranslations("accountManager");
  const rl = account.rateLimit;

  return (
    <div className="space-y-4">
      {/* Mode Selector */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t("protection.mode")}</h3>

        <div className="space-y-2">
          {RATE_LIMIT_MODES.map((m) => (
            <label
              key={m.value}
              className={`flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/50 cursor-pointer transition-colors ${
                rl.configuredMode === m.value ? "border-primary/30 bg-primary/5" : ""
              }`}
            >
              <input
                type="radio"
                name="rateLimitMode"
                value={m.value}
                checked={rl.configuredMode === m.value}
                className="w-4 h-4 text-primary focus:ring-primary/30"
                disabled={m.value === "disabled" && !rl.effectiveState} // Can't disable if auto-enabled
              />
              <div className="flex-1">
                <div className="font-medium">{t(`protection.mode.${m.value}`)}</div>
                <div className="text-xs text-text-muted">
                  {t(`protection.mode.${m.value}Desc`, { defaultValue: m.description })}
                </div>
              </div>
              {rl.configuredMode === m.value && (
                <Badge variant="secondary" className="text-xs">
                  {t("protection.current")}
                </Badge>
              )}
            </label>
          ))}

          {/* Show effective state if different from configured */}
          {rl.configuredMode !== "disabled" && rl.effectiveState && rl.source !== "individual" && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <div className="flex items-center gap-2 text-sm">
                <span className="material-symbols-outlined text-emerald-500">shield</span>
                <span className="font-medium text-emerald-500">{t("protection.active")}</span>
              </div>
              <div className="text-xs text-emerald-500/80 mt-1">
                {t("protection.activeReason", {
                  source: t(`protection.source.${rl.source}`),
                  autoReason: rl.autoReason || "",
                })}
              </div>
            </div>
          )}

          {/* Warning if disabled not supported */}
          {rl.configuredMode === "disabled" && rl.effectiveState && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-center gap-2 text-sm">
                <span className="material-symbols-outlined text-amber-500">warning</span>
                <span className="font-medium text-amber-500">{t("protection.cannotDisable")}</span>
              </div>
              <div className="text-xs text-amber-500/80 mt-1">
                {t("protection.cannotDisableReason", { reason: rl.autoReason || "Global policy" })}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Overrides */}
      {rl.overrides && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">{t("protection.overrides")}</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: "rpm", label: t("protection.rpm"), value: rl.overrides.rpm, unit: "req/min" },
              {
                key: "maxConcurrent",
                label: t("protection.maxConcurrent"),
                value: rl.overrides.maxConcurrent,
                unit: "",
              },
              {
                key: "queueSize",
                label: t("protection.queueSize"),
                value: rl.overrides.queueSize,
                unit: "",
              },
              {
                key: "queueTimeoutMs",
                label: t("protection.queueTimeout"),
                value: rl.overrides.queueTimeoutMs,
                unit: "ms",
              },
              {
                key: "cooldownMs",
                label: t("protection.cooldown"),
                value: rl.overrides.cooldownMs,
                unit: "ms",
              },
              {
                key: "minTimeMs",
                label: t("protection.minTime"),
                value: rl.overrides.minTimeMs,
                unit: "ms",
              },
              {
                key: "executionMaxWaitMs",
                label: t("protection.executionMaxWait"),
                value: rl.overrides.executionMaxWaitMs,
                unit: "ms",
              },
            ].map((o) => (
              <div key={o.key} className="p-3 rounded-lg bg-muted/50">
                <div className="text-xs text-text-muted">{o.label}</div>
                <div className="font-mono text-lg">
                  {o.value !== null && o.value !== undefined
                    ? `${o.value}${o.unit ? ` ${o.unit}` : ""}`
                    : t("protection.inherited")}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-border">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" icon="settings">
                  {t("protection.globalSettings")}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("protection.globalSettingsDesc")}</TooltipContent>
            </Tooltip>
          </div>
        </Card>
      )}

      {/* Current Status */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t("protection.currentStatus")}</h3>

        {rl.current.cooldownUntil && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-500">schedule</span>
              <span className="font-medium text-amber-500">{t("protection.inCooldown")}</span>
            </div>
            <div className="text-sm text-amber-500/80 mt-1">
              {t("protection.cooldownUntil", { time: rl.current.cooldownUntil })}
            </div>
            {rl.current.cooldownReason && (
              <div className="text-xs text-amber-500/70 mt-1">{rl.current.cooldownReason}</div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label={t("protection.queued")}
            value={rl.current.queued}
            icon="queue"
            color={rl.current.queued > 10 ? "text-amber-500" : "text-text-muted"}
          />
          <StatCard
            label={t("protection.running")}
            value={rl.current.running}
            icon="play_circle"
            color="text-blue-500"
          />
          <StatCard
            label={t("protection.avgWait")}
            value={`${rl.current.avgWaitMs}ms`}
            icon="timer"
            color="text-text-muted"
          />
          <StatCard
            label={t("protection.errors429")}
            value={rl.current.errors429}
            icon="error"
            color={rl.current.errors429 > 0 ? "text-red-500" : "text-text-muted"}
          />
        </div>

        {/* Queue visualization */}
        {(rl.current.queued > 0 || rl.current.running > 0) && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-text-muted mb-1">
              <span>{t("protection.queueVisualization")}</span>
              <span>
                {rl.current.queued} queued, {rl.current.running} running
              </span>
            </div>
            <div className="h-4 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{
                  width: `${Math.min(100, (rl.current.running / Math.max(1, rl.current.running + rl.current.queued)) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}
      </Card>

      {/* Cooldown History (placeholder) */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t("protection.cooldownHistory")}</h3>
        <div className="text-center text-text-muted py-8">
          <span className="material-symbols-outlined text-4xl">history</span>
          <p className="mt-2">{t("protection.noHistory")}</p>
        </div>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color = "text-primary",
}: {
  label: string;
  value: string | number;
  icon: string;
  color?: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-muted/50 text-center">
      <span className={`material-symbols-outlined ${color} text-2xl`}>{icon}</span>
      <div className="text-2xl font-bold mt-1">{value}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  );
}
