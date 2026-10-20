"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, Button, Badge, ScrollArea } from "@/shared/components";
import type { AccountOverview } from "@/lib/accountManager/types";

interface AccountRoutingTabProps {
  account: AccountOverview;
}

export function AccountRoutingTab({ account }: AccountRoutingTabProps) {
  const t = useTranslations("accountManager");
  const r = account.routing;
  const [simulationCount, setSimulationCount] = useState(10);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [simulating, setSimulating] = useState(false);

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      const response = await fetch("/api/account-manager/routing/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comboName: r.comboNames[0],
          providerId: account.providerId,
          count: simulationCount,
        }),
      });
      if (response.ok) {
        const { data } = await response.json();
        setSimulationResult(data);
      }
    } catch (err) {
      console.error("Simulation failed:", err);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Strategy */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t("routing.strategy")}</h3>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="gap-1 text-sm">
            <span className="material-symbols-outlined text-[14px]">swap_horiz</span>
            {t(`routing.strategy.${r.effectiveStrategy.toLowerCase().replace(/-/g, "_")}`, {
              defaultValue: r.effectiveStrategy,
            })}
          </Badge>
          <Badge variant="outline" className="capitalize">
            {t(`routing.source.${r.strategySource}`)}
          </Badge>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="p-2 rounded bg-muted/50">
            <div className="text-text-muted">{t("routing.stickyLimit")}</div>
            <div className="font-mono text-lg">
              {r.stickyLimit ? `${r.stickyLimit}` : t("routing.unlimited")}
            </div>
          </div>
          <div className="p-2 rounded bg-muted/50">
            <div className="text-text-muted">{t("routing.priority")}</div>
            <div className="font-mono text-lg">#{r.priority}</div>
          </div>
          <div className="p-2 rounded bg-muted/50">
            <div className="text-text-muted">{t("routing.globalPriority")}</div>
            <div className="font-mono text-lg">
              {r.globalPriority !== null ? `#${r.globalPriority}` : "—"}
            </div>
          </div>
          <div className="p-2 rounded bg-muted/50">
            <div className="text-text-muted">{t("routing.maxConcurrent")}</div>
            <div className="font-mono text-lg">
              {r.maxConcurrent !== null ? `${r.maxConcurrent}` : t("routing.unlimited")}
            </div>
          </div>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" icon="info" className="mt-2">
              {t("routing.strategyExplanation", {
                strategy: r.effectiveStrategy,
                sticky: r.stickyLimit,
              })}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" align="start" className="max-w-md">
            <p className="font-medium">
              {t(`routing.strategy.${r.effectiveStrategy.toLowerCase().replace(/-/g, "_")}`)}
            </p>
            <p className="text-sm text-text-muted mt-1">
              {t(`routing.strategyDesc.${r.effectiveStrategy.toLowerCase().replace(/-/g, "_")}`, {
                defaultValue: "Routes requests according to the selected strategy.",
              })}
            </p>
            {r.stickyLimit && (
              <p className="text-sm text-primary mt-2">
                <span className="material-symbols-outlined text-[14px] inline">info</span>
                {t("routing.stickyExplanation", { limit: r.stickyLimit })}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </Card>

      {/* Participation */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t("routing.participation")}</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium">{t("routing.availableInPool")}</span>
              <div className="text-xs text-text-muted">{t("routing.availableInPoolDesc")}</div>
            </div>
            <Badge variant={r.availableInPool ? "success" : "error"} className="gap-1">
              <span className="material-symbols-outlined text-[11px]">
                {r.availableInPool ? "check_circle" : "cancel"}
              </span>
              {r.availableInPool ? t("routing.yes") : t("routing.no")}
            </Badge>
          </div>

          {r.comboNames.length > 0 && (
            <div>
              <div className="text-sm text-text-muted mb-2">{t("routing.participatingCombos")}</div>
              <div className="flex flex-wrap gap-2">
                {r.comboNames.map((combo) => (
                  <Badge key={combo} variant="secondary" className="gap-1">
                    <span className="material-symbols-outlined text-[11px]">hub</span>
                    {combo}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {r.routingExclusionReasons.length > 0 && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <div className="flex items-center gap-2 text-sm mb-1">
                <span className="material-symbols-outlined text-red-500">block</span>
                <span className="font-medium text-red-500">{t("routing.excluded")}</span>
              </div>
              <ul className="text-xs text-red-500/80 space-y-1">
                {r.routingExclusionReasons.map((reason, i) => (
                  <li key={i} className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px]">arrow_right</span>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>

      {/* Load Distribution */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t("routing.loadDistribution")}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatCard
            label={t("routing.requests24h")}
            value={r.requestsLast24h.toLocaleString()}
            icon="analytics"
          />
          <StatCard
            label={t("routing.successRate")}
            value={`${r.successRate}%`}
            icon="check_circle"
            color="text-emerald-500"
          />
          <StatCard
            label={t("routing.currentLoad")}
            value={t(`routing.load.${r.currentLoad}`)}
            icon="speed"
          />
          <StatCard label={t("routing.avgLatency")} value="—" icon="timer" />
        </div>

        {/* Pool visualization */}
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center justify-between text-xs text-text-muted mb-2">
            <span>{t("routing.poolVisualization")}</span>
            <span>{t("routing.load." + r.currentLoad)}</span>
          </div>
          <div className="h-6 bg-muted rounded-full overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full transition-all duration-500"
              style={{
                width: `${
                  {
                    idle: 5,
                    low: 25,
                    medium: 50,
                    high: 85,
                  }[r.currentLoad]
                }%`,
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white/80">
              {t("routing.load." + r.currentLoad)}
            </div>
          </div>
        </div>
      </Card>

      {/* Simulator */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t("routing.simulator")}</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-sm text-text-muted">{t("routing.simulationCount")}</label>
            <input
              type="number"
              min={1}
              max={100}
              value={simulationCount}
              onChange={(e) => setSimulationCount(parseInt(e.target.value) || 10)}
              className="w-24 px-2 py-1.5 rounded border border-border bg-background text-sm"
            />
            <Button
              variant="primary"
              size="sm"
              icon="play_arrow"
              onClick={handleSimulate}
              disabled={simulating}
            >
              {simulating ? t("routing.simulating") : t("routing.simulate")}
            </Button>
          </div>

          {simulationResult && (
            <div className="p-3 rounded-lg bg-muted/50">
              <h4 className="font-medium mb-2">{t("routing.simulationResults")}</h4>
              <div className="space-y-1 text-sm">
                {simulationResult.simulation.slice(0, 20).map((step: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-6 text-center text-text-muted">{step.step}</span>
                    <span className="material-symbols-outlined text-text-muted">arrow_right</span>
                    <span className="font-medium">{step.selectedAccountName}</span>
                    <span className="text-text-muted flex-1 truncate">{step.reason}</span>
                  </div>
                ))}
                {simulationResult.simulation.length > 20 && (
                  <div className="text-xs text-text-muted text-center mt-2">
                    {t("routing.andMore", { count: simulationResult.simulation.length - 20 })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Excluded accounts */}
          {simulationResult?.excludedAccounts?.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <h4 className="font-medium text-amber-500 mb-2">{t("routing.excludedAccounts")}</h4>
              <div className="space-y-1 text-sm">
                {simulationResult.excludedAccounts.map((acc: any) => (
                  <div key={acc.connectionId} className="flex items-center gap-2 text-xs">
                    <span className="material-symbols-outlined text-amber-500">block</span>
                    <span className="font-medium">{acc.displayName}</span>
                    <span className="text-amber-500/80">{acc.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
  value: string;
  icon: string;
  color?: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-muted/50 text-center">
      <span className={`material-symbols-outlined ${color} text-2xl`}>{icon}</span>
      <div className="text-lg font-bold mt-1">{value}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  );
}
