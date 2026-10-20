"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Card, Button, Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/components";
import { useLocale } from "next-intl";
import type { AccountOverview } from "@/lib/accountManager/types";
import { AccountOverviewTab } from "./tabs/AccountOverviewTab";
import { AccountProxyTab } from "./tabs/AccountProxyTab";
import { AccountDiagnosticsTab } from "./tabs/AccountDiagnosticsTab";
import { AccountQuotasTab } from "./tabs/AccountQuotasTab";
import { AccountProtectionTab } from "./tabs/AccountProtectionTab";
import { AccountRoutingTab } from "./tabs/AccountRoutingTab";
import { AccountHistoryTab } from "./tabs/AccountHistoryTab";

type DrawerTab =
  "overview" | "proxy" | "diagnostics" | "quotas" | "protection" | "routing" | "history";

const TABS: { id: DrawerTab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "info" },
  { id: "proxy", label: "Proxy", icon: "vpn_lock" },
  { id: "diagnostics", label: "Diagnostics", icon: "medical_services" },
  { id: "quotas", label: "Quotas", icon: "data_usage" },
  { id: "protection", label: "Protection", icon: "shield" },
  { id: "routing", label: "Routing", icon: "swap_horiz" },
  { id: "history", label: "History", icon: "history" },
];

interface AccountDetailsDrawerProps {
  account: AccountOverview | null;
  isOpen: boolean;
  onClose: () => void;
  onAccountChange: (id: string) => void;
  accounts: AccountOverview[]; // For navigation between accounts
  activeTab: DrawerTab;
  onTabChange: (tab: DrawerTab) => void;
}

export default function AccountDetailsDrawer({
  account,
  isOpen,
  onClose,
  onAccountChange,
  accounts,
  activeTab,
  onTabChange,
}: AccountDetailsDrawerProps) {
  const t = useTranslations("accountManager");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !account) return null;

  const renderTabContent = (tab: DrawerTab) => {
    switch (tab) {
      case "overview":
        return <AccountOverviewTab account={account} />;
      case "proxy":
        return <AccountProxyTab account={account} />;
      case "diagnostics":
        return <AccountDiagnosticsTab account={account} />;
      case "quotas":
        return <AccountQuotasTab account={account} />;
      case "protection":
        return <AccountProtectionTab account={account} />;
      case "routing":
        return <AccountRoutingTab account={account} />;
      case "history":
        return <AccountHistoryTab account={account} />;
    }
  };

  // Mobile: full screen, Desktop: side drawer
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <div
      className={`fixed inset-0 z-50 flex ${isMobile ? "flex-col" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={`flex flex-col bg-background border-l border-border transition-transform duration-200 ${
          isMobile ? "w-full max-h-full" : "w-[520px] max-w-full h-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
              <span className="material-symbols-outlined">close</span>
            </Button>

            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-text-muted">
                {account.authType === "oauth"
                  ? "lock"
                  : account.authType === "web_cookie"
                    ? "cookie"
                    : "key"}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" id="drawer-title">
                  {account.displayName}
                </p>
                <p className="text-xs text-text-muted truncate">{account.providerId}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="border-b border-border sticky top-[48px] bg-background/95 backdrop-blur z-10">
          <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
            <TabsList className="grid grid-cols-7 h-auto p-1 gap-0.5" role="tablist">
              {TABS.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex flex-col items-center gap-1 px-2 py-1.5 text-xs hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-primary"
                >
                  <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                  <span className="hidden sm:inline">{t(`tabs.${tab.id}`)}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full p-4">
            <TabsContent value={activeTab} className="animate-in fade-in-0 duration-150">
              {renderTabContent(activeTab)}
            </TabsContent>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
