"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  Button,
  Badge,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  ScrollArea,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/shared/components";
import { formatDistanceToNow } from "date-fns";
import { ru, enUS } from "date-fns/locale";
import { useLocale } from "next-intl";
import type { AccountOverview, AccountEvent } from "@/lib/accountManager/types";

interface AccountHistoryTabProps {
  account: AccountOverview;
}

const CATEGORIES = [
  "connected",
  "disconnected",
  "auth_updated",
  "proxy_changed",
  "proxy_test",
  "diagnostics_completed",
  "quota_exhausted",
  "quota_recovered",
  "cooldown_start",
  "cooldown_end",
  "routing_selected",
  "fallback_triggered",
  "settings_changed",
  "bulk_operation",
] as const;

const RESULT_COLORS = {
  success: "text-emerald-500",
  warning: "text-amber-500",
  error: "text-red-500",
  info: "text-blue-500",
};

function formatRelativeTime(dateStr: string, locale: string): string {
  try {
    const date = new Date(dateStr);
    const loc = locale.startsWith("ru") ? ru : enUS;
    return formatDistanceToNow(date, { addSuffix: true, locale: loc });
  } catch {
    return dateStr;
  }
}

export function AccountHistoryTab({ account }: AccountHistoryTabProps) {
  const t = useTranslations("accountManager");
  const locale = useLocale();
  const [events, setEvents] = useState<AccountEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(20);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (page * pageSize).toString(),
      });
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (searchQuery) params.set("search", searchQuery);

      const response = await fetch(
        `/api/account-manager/accounts/${account.connectionId}/events?${params}`
      );
      if (response.ok) {
        const { data, meta } = await response.json();
        setEvents(data);
        setTotal(meta.total);
      }
    } catch (err) {
      console.error("Failed to fetch events:", err);
    } finally {
      setLoading(false);
    }
  }, [account.connectionId, page, pageSize, categoryFilter, searchQuery]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      connected: "link",
      disconnected: "link_off",
      auth_updated: "key",
      proxy_changed: "vpn_lock",
      proxy_test: "wifi",
      diagnostics_completed: "medical_services",
      quota_exhausted: "battery_0_bar",
      quota_recovered: "battery_full",
      cooldown_start: "schedule",
      cooldown_end: "check_circle",
      routing_selected: "swap_horiz",
      fallback_triggered: "swap_vert",
      settings_changed: "settings",
      bulk_operation: "checklist",
    };
    return icons[category] || "info";
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-[18px]">
              search
            </span>
            <Input
              placeholder={t("history.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(0);
              }}
              className="pl-10"
            />
          </div>

          <Select
            value={categoryFilter}
            onValueChange={(v) => {
              setCategoryFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("history.allCategories")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("history.allCategories")}</SelectItem>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {t(`history.category.${cat}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Events List */}
      <Card className="p-0 overflow-hidden">
        {loading && events.length === 0 ? (
          <div className="p-8 text-center">
            <div className="animate-spin material-symbols-outlined text-4xl text-primary">sync</div>
            <p className="mt-2 text-text-muted">{t("history.loading")}</p>
          </div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-text-muted">
            <span className="material-symbols-outlined text-4xl">history</span>
            <p className="mt-2">{t("history.noEvents")}</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[500px]">
            <div className="divide-y divide-border">
              {events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  expanded={expandedId === event.id}
                  onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)}
                  locale={locale}
                  t={t}
                  getCategoryIcon={getCategoryIcon}
                  formatRelativeTime={formatRelativeTime}
                />
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Pagination */}
        {total > pageSize && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-between">
            <span className="text-sm text-text-muted">
              {t("history.showing", {
                start: page * pageSize + 1,
                end: Math.min((page + 1) * pageSize, total),
                total,
              })}
            </span>
            <div className="flex gap-1">
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
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * pageSize >= total}
              />
            </div>
          </div>
        )}
      </Card>

      {/* Category Summary (placeholder - would come from API) */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">{t("history.categorySummary")}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CATEGORIES.map((cat) => (
            <div key={cat} className="p-2 rounded-lg bg-muted/50 text-center">
              <span className={`material-symbols-outlined ${RESULT_COLORS.info}`}>
                {getCategoryIcon(cat)}
              </span>
              <div className="text-xs text-text-muted mt-1">{t(`history.category.${cat}`)}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function EventRow({
  event,
  expanded,
  onToggle,
  locale,
  t,
  getCategoryIcon,
  formatRelativeTime,
}: {
  event: AccountEvent;
  expanded: boolean;
  onToggle: () => void;
  locale: string;
  t: any;
  getCategoryIcon: (cat: string) => string;
  formatRelativeTime: (date: string, locale: string) => string;
}) {
  const resultColor = RESULT_COLORS[event.result] || "text-text-muted";

  return (
    <div className="p-4 hover:bg-muted/50 transition-colors">
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 text-left"
        aria-expanded={expanded}
      >
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${resultColor}/10`}
        >
          <span className={`material-symbols-outlined ${resultColor}`}>
            {getCategoryIcon(event.category)}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{t(`history.category.${event.category}`)}</span>
            <Badge variant="outline" className={`${resultColor} text-xs`}>
              {event.result}
            </Badge>
          </div>
          <div className="text-sm text-text-muted mt-0.5 truncate">{event.summary}</div>
          <div className="text-xs text-text-muted mt-1">
            {formatRelativeTime(event.createdAt, locale)}
          </div>
        </div>

        <span className="material-symbols-outlined text-text-muted flex-shrink-0">
          {expanded ? "expand_less" : "expand_more"}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 ml-13 border-l-2 border-border/50 pl-4 space-y-2 animate-in fade-in-0 duration-150">
          {event.detailsJson && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" icon="code" className="text-xs">
                  {t("history.viewDetails")}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" align="start" className="max-w-xl">
                <pre className="text-xs p-3 rounded bg-muted overflow-x-auto max-h-60">
                  <code>{JSON.stringify(JSON.parse(event.detailsJson), null, 2)}</code>
                </pre>
              </TooltipContent>
            </Tooltip>
          )}
          {event.reasonCode && (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span className="material-symbols-outlined text-[14px]">tag</span>
              <code className="font-mono bg-muted px-1.5 py-0.5 rounded">{event.reasonCode}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
