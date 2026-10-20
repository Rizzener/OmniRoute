"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  Button,
  Badge,
  ScrollArea,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/shared/components";
import type { AccountOverview, DiagnosticMode } from "@/lib/accountManager/types";

interface AccountDiagnosticsTabProps {
  account: AccountOverview;
}

const DIAGNOSTIC_MODES: {
  value: DiagnosticMode["mode"];
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    value: "quick",
    label: "Quick",
    description: "Config, credentials, token, proxy, service",
    icon: "speed",
  },
  {
    value: "full",
    label: "Full",
    description: "Quick + auth, models, quota, rate limit",
    icon: "medical_services",
  },
  {
    value: "ai-test",
    label: "AI Test",
    description: "Full + real model request (consumes quota)",
    icon: "smart_toy",
  },
];

const STEP_STATUSES = {
  pending: { label: "Pending", color: "text-text-muted", bg: "bg-muted" },
  running: { label: "Running", color: "text-blue-500", bg: "bg-blue-500/10" },
  success: { label: "Success", color: "text-emerald-500", bg: "bg-emerald-500/10" },
  warning: { label: "Warning", color: "text-amber-500", bg: "bg-amber-500/10" },
  error: { label: "Error", color: "text-red-500", bg: "bg-red-500/10" },
  skipped: { label: "Skipped", color: "text-text-muted", bg: "bg-muted/50" },
  unsupported: { label: "N/A", color: "text-text-muted", bg: "bg-muted/50" },
} as const;

export function AccountDiagnosticsTab({ account }: AccountDiagnosticsTabProps) {
  const t = useTranslations("accountManager");
  const [activeMode, setActiveMode] = useState<DiagnosticMode["mode"]>("quick");
  const [jobId, setJobId] = useState<string | null>(null);
  const [steps, setSteps] = useState<
    Array<{
      name: string;
      status: "pending" | "running" | "success" | "warning" | "error" | "skipped" | "unsupported";
      durationMs: number | null;
      details: string | null;
      errorCode: string | null;
      recommendedAction: string | null;
    }>
  >([]);
  const [isRunning, setIsRunning] = useState(false);
  const [overallStatus, setOverallStatus] = useState<
    "healthy" | "degraded" | "unhealthy" | "incomplete"
  >("incomplete");

  const handleRunDiagnostics = async () => {
    setIsRunning(true);
    setJobId(null);
    setSteps([]);
    setOverallStatus("incomplete");

    try {
      // Start diagnostics
      const response = await fetch(
        `/api/account-manager/accounts/${account.connectionId}/diagnostics`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: activeMode }),
        }
      );

      if (!response.ok) throw new Error("Failed to start diagnostics");

      const { data } = await response.json();
      setJobId(data.jobId);

      // Poll for results
      const poll = async () => {
        if (!jobId) return;
        const pollResponse = await fetch(`/api/account-manager/diagnostics/${jobId}`);
        if (!pollResponse.ok) return;

        const { data: result } = await pollResponse.json();
        setSteps(result.steps);
        setOverallStatus(result.overallStatus);

        if (result.completedAt) {
          setIsRunning(false);
        } else {
          setTimeout(poll, 1000);
        }
      };

      poll();
    } catch (err) {
      console.error("Diagnostics failed:", err);
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode Selection */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t("diagnostics.mode")}</h3>
        <div className="flex gap-2">
          {DIAGNOSTIC_MODES.map((m) => (
            <Tooltip key={m.value}>
              <TooltipTrigger asChild>
                <Button
                  variant={activeMode === m.value ? "primary" : "outline"}
                  size="sm"
                  className="flex items-center gap-2"
                  onClick={() => setActiveMode(m.value)}
                  disabled={isRunning}
                >
                  <span className="material-symbols-outlined">{m.icon}</span>
                  <span>{t(`diagnostics.mode.${m.value}`)}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" align="start">
                <p className="font-medium">{t(`diagnostics.mode.${m.value}`)}</p>
                <p className="text-sm text-text-muted">
                  {t(`diagnostics.mode.${m.value}Desc`, { defaultValue: m.description })}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
          {isRunning && (
            <Button variant="secondary" size="sm" icon="sync" className="animate-spin ml-auto">
              {t("diagnostics.running")}
            </Button>
          )}
        </div>
      </Card>

      {/* Run Button */}
      {!isRunning && !jobId && (
        <Card className="p-4 bg-muted/50">
          <Button
            size="lg"
            className="w-full"
            icon="play_arrow"
            onClick={handleRunDiagnostics}
            disabled={isRunning}
          >
            {t("diagnostics.run", { mode: t(`diagnostics.mode.${activeMode}`) })}
          </Button>
        </Card>
      )}

      {/* Progress */}
      {(isRunning || jobId) && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">{t("diagnostics.progress")}</h3>
            <Badge variant="secondary" className="capitalize">
              {overallStatus}
            </Badge>
          </div>

          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {steps.length === 0 ? (
                <div className="text-center text-text-muted py-8">
                  <span className="material-symbols-outlined animate-pulse text-4xl">sync</span>
                  <p className="mt-2">{t("diagnostics.starting")}</p>
                </div>
              ) : (
                steps.map((step, index) => {
                  const statusConfig = STEP_STATUSES[step.status];
                  return (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border/50"
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${statusConfig.bg}`}
                      >
                        {step.status === "running" && (
                          <span className="material-symbols-outlined animate-spin text-blue-500">
                            sync
                          </span>
                        )}
                        {step.status === "success" && (
                          <span className="material-symbols-outlined text-emerald-500">
                            check_circle
                          </span>
                        )}
                        {step.status === "error" && (
                          <span className="material-symbols-outlined text-red-500">error</span>
                        )}
                        {step.status === "warning" && (
                          <span className="material-symbols-outlined text-amber-500">warning</span>
                        )}
                        {step.status === "skipped" && (
                          <span className="material-symbols-outlined text-text-muted">
                            skip_next
                          </span>
                        )}
                        {step.status === "unsupported" && (
                          <span className="material-symbols-outlined text-text-muted">block</span>
                        )}
                        {step.status === "pending" && (
                          <span className="material-symbols-outlined text-text-muted">
                            schedule
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {t(`diagnostics.step.${step.name}`, { defaultValue: step.name })}
                          </span>
                          <Badge variant="outline" className={statusConfig.color}>
                            {statusConfig.label}
                          </Badge>
                          {step.durationMs && (
                            <span className="text-xs text-text-muted">({step.durationMs}ms)</span>
                          )}
                        </div>
                        {step.details && (
                          <p className="text-sm text-text-muted mt-1">{step.details}</p>
                        )}
                        {step.errorCode && (
                          <p className="text-xs text-red-500 mt-1 font-mono">{step.errorCode}</p>
                        )}
                        {step.recommendedAction && (
                          <p className="text-sm text-emerald-500 mt-1">
                            <span className="material-symbols-outlined text-[14px] inline align-middle">
                              lightbulb
                            </span>
                            {step.recommendedAction}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </Card>
      )}

      {/* Results Summary */}
      {overallStatus !== "incomplete" && !isRunning && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">{t("diagnostics.results")}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatBox label={t("diagnostics.total")} value={steps.length} icon="list" />
            <StatBox
              label={t("diagnostics.passed")}
              value={steps.filter((s) => s.status === "success").length}
              icon="check_circle"
              color="text-emerald-500"
            />
            <StatBox
              label={t("diagnostics.warnings")}
              value={steps.filter((s) => s.status === "warning").length}
              icon="warning"
              color="text-amber-500"
            />
            <StatBox
              label={t("diagnostics.failed")}
              value={steps.filter((s) => s.status === "error").length}
              icon="error"
              color="text-red-500"
            />
          </div>

          <div className="mt-4 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setJobId(null);
                setSteps([]);
              }}
            >
              {t("diagnostics.runAgain")}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => {}}>
              {t("diagnostics.exportReport")}
            </Button>
          </div>
        </Card>
      )}

      {/* Error Classification Guide */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t("diagnostics.errorGuide")}</h3>
        <div className="space-y-2 text-sm">
          {[
            { code: "AUTH_FAILED", desc: t("diagnostics.errors.authFailed") },
            { code: "TOKEN_EXPIRED", desc: t("diagnostics.errors.tokenExpired") },
            { code: "PROXY_CONNECTION_FAILED", desc: t("diagnostics.errors.proxyFailed") },
            { code: "QUOTA_EXHAUSTED", desc: t("diagnostics.errors.quotaExhausted") },
            { code: "RATE_LIMITED", desc: t("diagnostics.errors.rateLimited") },
            { code: "SERVICE_UNAVAILABLE", desc: t("diagnostics.errors.serviceUnavailable") },
          ].map((e) => (
            <div key={e.code} className="flex gap-2 p-2 rounded bg-muted/50">
              <code className="text-xs font-mono text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded">
                {e.code}
              </code>
              <span className="text-text-muted">{e.desc}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function StatBox({
  label,
  value,
  icon,
  color = "text-primary",
}: {
  label: string;
  value: number;
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
