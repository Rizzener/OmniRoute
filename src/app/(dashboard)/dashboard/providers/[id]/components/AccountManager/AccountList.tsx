"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  Input,
  Button,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/shared/components";
import { useVirtualizer } from "@tanstack/react-virtual";
import CompactAccountCard from "./CompactAccountCard";
import type { AccountOverview } from "@/lib/accountManager/types";

interface AccountListProps {
  providerId: string;
  onSelect: (id: string) => void;
  onOpenDetails: (id: string) => void;
  onToggleActive: (id: string, enabled: boolean) => void;
  onQuickTest: (id: string) => void;
  onQuickProxyTest: (id: string) => void;
  selectedIds: Set<string>;
  onToggleSelectAll: () => void;
}

const PAGE_SIZE = 50;

export function AccountList({
  providerId,
  onSelect,
  onOpenDetails,
  onToggleActive,
  onQuickTest,
  onQuickProxyTest,
  selectedIds,
  onToggleSelectAll,
}: AccountListProps) {
  const t = useTranslations("accountManager");
  const [accounts, setAccounts] = useState<AccountOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const parentRef = useRef<HTMLDivElement>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        provider: providerId,
        page: page.toString(),
        pageSize: PAGE_SIZE.toString(),
      });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const response = await fetch(`/api/account-manager/accounts?${params}`);
      if (response.ok) {
        const { data, meta } = await response.json();
        setAccounts(data);
        setTotalPages(meta.totalPages);
      }
    } catch (err) {
      console.error("Failed to fetch accounts:", err);
    } finally {
      setLoading(false);
    }
  }, [providerId, page, search, statusFilter]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const virtualizer = useVirtualizer({
    count: accounts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
  });

  const allSelected = accounts.length > 0 && accounts.every((a) => selectedIds.has(a.connectionId));
  const someSelected = accounts.some((a) => selectedIds.has(a.connectionId));

  const handleToggleSelectAll = () => {
    if (allSelected) {
      accounts.forEach((a) => selectedIds.delete(a.connectionId));
    } else {
      accounts.forEach((a) => selectedIds.add(a.connectionId));
    }
    onToggleSelectAll();
  };

  if (loading && accounts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin material-symbols-outlined text-4xl text-primary">sync</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-3 py-2 bg-muted/50 rounded-t-lg border border-b-0 border-border">
        <div className="flex w-full items-center gap-2 flex-wrap sm:w-auto">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={handleToggleSelectAll}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary/30 cursor-pointer"
            />
            <span className="text-sm font-medium text-text-muted">
              {selectedIds.size > 0
                ? t("selectedCount", { count: selectedIds.size })
                : t("accountsCount", { count: accounts.length })}
            </span>
          </label>
          <div className="relative w-full sm:w-auto sm:min-w-[160px] sm:max-w-[220px]">
            <span className="material-symbols-outlined pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[15px] text-text-muted">
              search
            </span>
            <Input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder={t("accountSearchPlaceholder")}
              className="w-full rounded-lg border border-border bg-sidebar/50 py-1.5 pl-7 pr-3 text-xs text-text-main placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder={t("filterAll")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filterAll")}</SelectItem>
              <SelectItem value="working">{t("statusWorking")}</SelectItem>
              <SelectItem value="unchecked">{t("statusUnchecked")}</SelectItem>
              <SelectItem value="rate_limited">{t("statusRateLimited")}</SelectItem>
              <SelectItem value="quota_exhausted">{t("statusQuotaExhausted")}</SelectItem>
              <SelectItem value="auth_error">{t("statusAuthError")}</SelectItem>
              <SelectItem value="proxy_error">{t("statusProxyError")}</SelectItem>
              <SelectItem value="provider_error">{t("statusProviderError")}</SelectItem>
              <SelectItem value="disabled">{t("statusDisabled")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" size="sm" icon="toggle_on" onClick={() => {}}>
              {t("batchActivateSelected")}
            </Button>
            <Button variant="secondary" size="sm" icon="toggle_off" onClick={() => {}}>
              {t("batchDeactivateSelected")}
            </Button>
            <Button variant="secondary" size="sm" icon="play_arrow" onClick={() => {}}>
              {t("batchTestSelected")}
            </Button>
            <Button variant="danger" size="sm" icon="delete" onClick={() => {}}>
              {t("batchDeleteSelected", { count: selectedIds.size })}
            </Button>
          </div>
        )}
      </div>

      {/* Virtualized List */}
      <div className="flex-1 overflow-auto" ref={parentRef}>
        <div
          className="relative"
          style={{ height: `${virtualizer.getTotalSize()}px`, width: "100%" }}
        >
          {accounts.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-text-muted">
              {t("noFilteredConnections")}
            </div>
          ) : (
            virtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={accounts[virtualRow.index].connectionId}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <CompactAccountCard
                  account={accounts[virtualRow.index]}
                  isSelected={selectedIds.has(accounts[virtualRow.index].connectionId)}
                  onSelect={onSelect}
                  onOpenDetails={onOpenDetails}
                  onToggleActive={onToggleActive}
                  onQuickTest={onQuickTest}
                  onQuickProxyTest={onQuickProxyTest}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-border">
          <span className="text-xs text-text-muted">
            {page + 1} / {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              icon="chevron_left"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            />
            <Button
              variant="ghost"
              size="sm"
              icon="chevron_right"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            />
          </div>
        </div>
      )}
    </div>
  );
}
