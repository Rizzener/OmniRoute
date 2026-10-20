"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  Button,
  Badge,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Separator,
  Input,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/shared/components";
import type { AccountOverview, ProxyMode } from "@/lib/accountManager/types";

interface AccountProxyTabProps {
  account: AccountOverview;
}

const PROXY_MODES: { value: ProxyMode; label: string; description: string }[] = [
  { value: "inherit", label: "Inherit", description: "Use provider/global proxy settings" },
  {
    value: "individual",
    label: "Individual",
    description: "Assign a specific proxy to this account",
  },
  { value: "direct", label: "Direct", description: "No proxy, connect directly" },
  { value: "failover", label: "Failover", description: "Use backup proxies if primary fails" },
];

const PROTOCOLS = ["http", "https", "socks5"] as const;

export function AccountProxyTab({ account }: AccountProxyTabProps) {
  const t = useTranslations("accountManager");
  const [mode, setMode] = useState<ProxyMode>(account.proxyPolicy.mode);
  const [selectedProxyId, setSelectedProxyId] = useState<string | null>(
    account.effectiveProxy?.proxyId ?? null
  );
  const [failClosed, setFailClosed] = useState(account.proxyPolicy.failClosed);
  const [failoverProxies, setFailoverProxies] = useState(account.proxyPolicy.failoverProxyIds);
  const [directFallbackAllowed, setDirectFallbackAllowed] = useState(
    account.proxyPolicy.directFallbackAllowed
  );
  const [newProxy, setNewProxy] = useState({
    name: "",
    type: "http" as const,
    host: "",
    port: 8080,
    username: "",
    password: "",
    region: "",
  });
  const [showCreateProxy, setShowCreateProxy] = useState(false);

  const handleAssignProxy = async () => {
    // Would call PUT /api/account-manager/accounts/:id/proxy
    console.log("Assign proxy:", {
      mode,
      proxyId: selectedProxyId,
      failClosed,
      failoverProxies,
      directFallbackAllowed,
    });
  };

  const handleCreateProxy = async () => {
    // Would call POST /api/v1/management/proxies then assign
    console.log("Create proxy:", newProxy);
    setShowCreateProxy(false);
  };

  const handleTestProxy = async () => {
    // Would call POST /api/account-manager/accounts/:id/proxy/test
    console.log("Test proxy for:", account.connectionId);
  };

  return (
    <div className="space-y-4">
      {/* Connection Mode */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t("proxy.connectionMode")}</h3>
        <div className="space-y-2">
          {PROXY_MODES.map((m) => (
            <label
              key={m.value}
              className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/50 cursor-pointer transition-colors"
            >
              <input
                type="radio"
                name="proxyMode"
                value={m.value}
                checked={mode === m.value}
                onChange={() => setMode(m.value)}
                className="w-4 h-4 text-primary focus:ring-primary/30"
              />
              <div className="flex-1">
                <div className="font-medium">{t(`proxy.mode.${m.value}`)}</div>
                <div className="text-xs text-text-muted">
                  {t(`proxy.mode.${m.value}Desc`, { defaultValue: m.description })}
                </div>
              </div>
            </label>
          ))}
        </div>
      </Card>

      {/* Individual Proxy Selection */}
      {(mode === "individual" || mode === "failover") && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">{t("proxy.assignProxy")}</h3>

          <div className="space-y-3">
            <div className="flex gap-2">
              <Select value={selectedProxyId || ""} onValueChange={setSelectedProxyId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={t("proxy.selectPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {/* In real implementation, this would fetch from proxy registry */}
                  <SelectItem value="">None</SelectItem>
                  {/* Mock proxies - would come from API */}
                  <SelectItem value="proxy-1">
                    US Residential - proxy-us-01.example.com:8080
                  </SelectItem>
                  <SelectItem value="proxy-2">
                    EU Datacenter - proxy-eu-01.example.com:3128
                  </SelectItem>
                  <SelectItem value="proxy-3">SOCKS5 - socks5.example.com:1080</SelectItem>
                </SelectContent>
              </Select>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="add"
                    onClick={() => setShowCreateProxy(true)}
                  >
                    {t("proxy.createNew")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{t("proxy.createNewTooltip")}</TooltipContent>
              </Tooltip>

              <Button variant="secondary" size="sm" icon="refresh" onClick={handleTestProxy}>
                {t("proxy.test")}
              </Button>
            </div>

            {showCreateProxy && (
              <div className="p-3 rounded-lg border border-border bg-muted/50 space-y-3">
                <h4 className="text-sm font-medium">{t("proxy.createNew")}</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label={t("proxy.name")}
                    value={newProxy.name}
                    onChange={(e) => setNewProxy({ ...newProxy, name: e.target.value })}
                    placeholder="My Proxy"
                  />
                  <Select
                    value={newProxy.type}
                    onValueChange={(v) => setNewProxy({ ...newProxy, type: v as any })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("proxy.type")} />
                    </SelectTrigger>
                    <SelectContent>
                      {PROTOCOLS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    label={t("proxy.host")}
                    value={newProxy.host}
                    onChange={(e) => setNewProxy({ ...newProxy, host: e.target.value })}
                    placeholder="proxy.example.com"
                  />
                  <Input
                    label={t("proxy.port")}
                    type="number"
                    value={newProxy.port}
                    onChange={(e) => setNewProxy({ ...newProxy, port: parseInt(e.target.value) })}
                    placeholder="8080"
                  />
                  <Input
                    label={t("proxy.username")}
                    value={newProxy.username}
                    onChange={(e) => setNewProxy({ ...newProxy, username: e.target.value })}
                    placeholder="user"
                  />
                  <Input
                    label={t("proxy.password")}
                    type="password"
                    value={newProxy.password}
                    onChange={(e) => setNewProxy({ ...newProxy, password: e.target.value })}
                    placeholder="••••••••"
                  />
                </div>
                <Input
                  label={t("proxy.region")}
                  value={newProxy.region}
                  onChange={(e) => setNewProxy({ ...newProxy, region: e.target.value })}
                  placeholder="US-East"
                />
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowCreateProxy(false)}>
                    {t("cancel")}
                  </Button>
                  <Button size="sm" onClick={handleCreateProxy}>
                    {t("proxy.create")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Effective Proxy Display */}
      {account.effectiveProxy && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">{t("proxy.effectiveProxy")}</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-text-muted block mb-1">{t("proxy.name")}</span>
                <span className="font-medium">{account.effectiveProxy.name}</span>
              </div>
              <div>
                <span className="text-text-muted block mb-1">{t("proxy.type")}</span>
                <span className="font-medium capitalize">{account.effectiveProxy.protocol}</span>
              </div>
              <div>
                <span className="text-text-muted block mb-1">{t("proxy.host")}</span>
                <span className="font-medium">
                  {account.effectiveProxy.host}:{account.effectiveProxy.port}
                </span>
              </div>
              <div>
                <span className="text-text-muted block mb-1">{t("proxy.region")}</span>
                <span className="font-medium">{account.effectiveProxy.region || "—"}</span>
              </div>
              <div>
                <span className="text-text-muted block mb-1">{t("proxy.source")}</span>
                <Badge variant="secondary" className="capitalize">
                  {account.effectiveProxy.source}
                </Badge>
              </div>
              <div>
                <span className="text-text-muted block mb-1">{t("proxy.maskedAddress")}</span>
                <code className="text-xs font-mono text-text-muted break-all">
                  {account.effectiveProxy.maskedAddress}
                </code>
              </div>
            </div>

            <Separator />

            <div className="flex items-center gap-4">
              <Button variant="secondary" size="sm" icon="wifi" onClick={handleTestProxy}>
                {t("proxy.checkConnection")}
              </Button>
              <Button variant="secondary" size="sm" icon="public" onClick={() => {}}>
                {t("proxy.checkIp")}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Proxy Policy */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t("proxy.policy")}</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium">{t("proxy.failClosed")}</span>
              <div className="text-xs text-text-muted">{t("proxy.failClosedDesc")}</div>
            </div>
            <input
              type="checkbox"
              checked={failClosed}
              onChange={(e) => setFailClosed(e.target.checked)}
              className="w-4 h-4 text-primary focus:ring-primary/30"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium">{t("proxy.directFallback")}</span>
              <div className="text-xs text-text-muted">{t("proxy.directFallbackDesc")}</div>
            </div>
            <input
              type="checkbox"
              checked={directFallbackAllowed}
              onChange={(e) => setDirectFallbackAllowed(e.target.checked)}
              disabled={failClosed}
              className="w-4 h-4 text-primary focus:ring-primary/30 disabled:opacity-50"
            />
          </div>

          {mode === "failover" && (
            <div>
              <label className="text-sm font-medium block mb-2">{t("proxy.failoverProxies")}</label>
              <div className="space-y-2">
                {failoverProxies.map((proxyId, i) => (
                  <div key={i} className="flex gap-2">
                    <Select
                      value={proxyId}
                      onValueChange={(v) => {
                        const next = [...failoverProxies];
                        next[i] = v;
                        setFailoverProxies(next);
                      }}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select proxy" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="proxy-1">US Residential</SelectItem>
                        <SelectItem value="proxy-2">EU Datacenter</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setFailoverProxies(failoverProxies.filter((_, j) => j !== i))}
                    >
                      <span className="material-symbols-outlined">delete</span>
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  icon="add"
                  onClick={() => setFailoverProxies([...failoverProxies, ""])}
                >
                  {t("proxy.addFailover")}
                </Button>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-border">
            <Button
              variant="primary"
              size="sm"
              onClick={handleAssignProxy}
              className="w-full sm:w-auto"
            >
              {t("proxy.save")}
            </Button>
          </div>
        </div>
      </Card>

      {/* Source Chain Explanation */}
      <Card className="p-4 bg-blue-500/5 dark:bg-blue-500/10 border-blue-500/20">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <span className="material-symbols-outlined text-blue-500">info</span>
          {t("proxy.sourceChain")}
        </h3>
        <div className="text-sm text-blue-500/90 dark:text-blue-400 font-mono whitespace-pre-wrap">
          {account.effectiveProxy
            ? `Individual → ${account.effectiveProxy.name}`
            : account.proxyPolicy.mode === "inherit"
              ? "Inherit → Provider → Global → Direct"
              : "Direct connection"}
        </div>
      </Card>
    </div>
  );
}
