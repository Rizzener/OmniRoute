"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components";
import AccountList from "./AccountList";
import AccountDetailsDrawer from "./AccountDetailsDrawer";
import type { AccountOverview } from "@/lib/accountManager/types";

type DrawerTab =
  "overview" | "proxy" | "diagnostics" | "quotas" | "protection" | "routing" | "history";

interface AccountManagerPageProps {
  providerId: string;
  providerName: string;
}

export function AccountManagerPage({ providerId, providerName }: AccountManagerPageProps) {
  const t = useTranslations("accountManager");
  const [accounts, setAccounts] = useState<AccountOverview[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerAccountId, setDrawerAccountId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DrawerTab>("overview");

  const drawerAccount = accounts.find((a) => a.connectionId === drawerAccountId) || null;

  const fetchAllAccounts = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/account-manager/accounts?provider=${providerId}&pageSize=500`
      );
      if (response.ok) {
        const { data } = await response.json();
        setAccounts(data);
      }
    } catch (err) {
      console.error("Failed to fetch all accounts:", err);
    }
  }, [providerId]);

  useEffect(() => {
    fetchAllAccounts();
  }, []);

  const handleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (accounts.every((a) => selectedIds.has(a.connectionId))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(accounts.map((a) => a.connectionId)));
    }
  };

  const openDetails = (id: string) => {
    setDrawerAccountId(id);
  };

  const closeDrawer = () => {
    setDrawerAccountId(null);
  };

  const handleAccountChange = (id: string) => {
    setDrawerAccountId(id);
  };

  const handleToggleActive = (id: string, enabled: boolean) => {
    // Would call API
    console.log("Toggle active:", id, enabled);
  };

  const handleQuickTest = (id: string) => {
    // Would call test API
    console.log("Quick test:", id);
  };

  const handleQuickProxyTest = (id: string) => {
    // Would call proxy test API
    console.log("Quick proxy test:", id);
  };

  type DrawerTab =
    "overview" | "proxy" | "diagnostics" | "quotas" | "protection" | "routing" | "history";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-muted/30 rounded-lg border border-border">
        <div>
          <h1 className="text-xl font-semibold">{t("pageTitle", { provider: providerName })}</h1>
          <p className="text-sm text-text-muted">{t("pageDescription")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon="add" onClick={() => {}}>
            {t("addAccount")}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0">
        <AccountList
          providerId={providerId}
          onSelect={handleSelect}
          onOpenDetails={openDetails}
          onToggleActive={handleToggleActive}
          onQuickTest={handleQuickTest}
          onQuickProxyTest={handleQuickProxyTest}
          selectedIds={selectedIds}
          onToggleSelect={handleSelect}
          onToggleSelectAll={handleToggleSelectAll}
        />

        <AccountDetailsDrawer
          account={drawerAccount}
          isOpen={!!drawerAccount}
          onClose={closeDrawer}
          onAccountChange={handleAccountChange}
          accounts={accounts}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>
    </div>
  );
}
