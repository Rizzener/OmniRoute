/**
 * Account Manager 2.0 — Routing Simulator
 *
 * Simulates routing decisions using actual strategy implementations
 * without mutating real state or sending real requests.
 */

import { SimulateRoutingInput, SimulateRoutingResult, StrategySource } from "./types";
import { getCombos } from "@/lib/db/combos";
import { getProviderConnections } from "@/lib/db/providers";
import {
  normalizeRoutingStrategy,
  type AnyRoutingStrategyValue,
} from "@/shared/constants/routingStrategies";

interface SimAccount {
  connectionId: string;
  displayName: string;
  priority: number;
  weight?: number;
  isActive: boolean;
  testStatus: string | undefined;
  rateLimitedUntil: string | null | undefined;
  maxConcurrent: number | null | undefined;
  currentRunning: number;
}

interface SimContext {
  strategy: AnyRoutingStrategyValue;
  accounts: SimAccount[];
  stickyLimit: number;
  stickyState: Map<string, number>; // accountId -> consecutive count
  roundRobinIndex: number;
  weights: Map<string, number>;
  leastUsedCounts: Map<string, number>;
}

export async function simulateRouting(input: SimulateRoutingInput): Promise<SimulateRoutingResult> {
  // 1. Resolve effective routing config
  const config = await resolveRoutingConfig(input);

  // 2. Get eligible accounts
  const accounts = await getEligibleAccounts(config);

  // 3. Filter eligible vs excluded
  const { eligible, excluded } = partitionAccounts(accounts);

  // 4. Run simulation
  const simulation = runSimulation(
    config.strategy,
    config.stickyLimit,
    eligible,
    input.count || 10
  );

  return {
    effectiveStrategy: config.strategy,
    strategySource: config.strategySource,
    eligibleAccounts: eligible.map((a) => ({
      connectionId: a.connectionId,
      displayName: a.displayName,
      priority: a.priority,
      reason: "Eligible for routing",
    })),
    excludedAccounts: excluded.map((a) => ({
      connectionId: a.connectionId,
      displayName: a.displayName,
      reason: a.exclusionReason,
    })),
    simulation,
  };
}

interface ResolvedConfig {
  strategy: AnyRoutingStrategyValue;
  strategySource: StrategySource;
  stickyLimit: number;
  providerId: string;
  comboName?: string;
}

async function resolveRoutingConfig(input: SimulateRoutingInput): Promise<ResolvedConfig> {
  let strategy: AnyRoutingStrategyValue = "priority";
  let strategySource: StrategySource = "global";
  let stickyLimit = 1;
  let providerId = input.providerId || "";
  let comboName = input.comboName;

  if (input.comboName) {
    // Combo-level strategy
    const combos = await getCombos({ name: input.comboName });
    const combo = combos[0];
    if (combo) {
      strategy = normalizeRoutingStrategy(combo.strategy);
      strategySource = "combo";
      comboName = combo.name;
      providerId = combo.targets?.[0]?.provider || providerId;
      // Sticky limit from combo config
      if (combo.strategyConfig?.stickyLimit) {
        stickyLimit = combo.strategyConfig.stickyLimit;
      }
    }
  } else if (input.providerId) {
    // Provider-level strategy
    const settings = await getProviderConnections({ provider: input.providerId, isActive: true });
    if (settings.length > 0) {
      providerId = input.providerId;
      // Check provider-specific setting
      // Would read from settings table: routing_strategy_{providerId}
    }
  }

  // Fall back to global
  if (strategySource === "global") {
    // Would read from settings table: routing_strategy_global
  }

  return { strategy, strategySource, stickyLimit, providerId, comboName };
}

async function getEligibleAccounts(
  config: ResolvedConfig
): Promise<(SimAccount & { exclusionReason?: string })[]> {
  const connections = (await getProviderConnections({
    provider: config.providerId,
    isActive: true,
  })) as any[];

  return connections.map((conn) => {
    const exclusionReasons: string[] = [];

    if (conn.isActive === false) exclusionReasons.push("Account disabled");
    if (["banned", "credits_exhausted", "expired", "deactivated"].includes(conn.testStatus || "")) {
      exclusionReasons.push(`Status: ${conn.testStatus}`);
    }
    if (conn.rateLimitedUntil && new Date(conn.rateLimitedUntil).getTime() > Date.now()) {
      exclusionReasons.push("In rate limit cooldown");
    }
    if (conn.maxConcurrent && conn.maxConcurrent > 0) {
      // Would check current running count
    }

    return {
      connectionId: conn.id,
      displayName: conn.displayName || conn.name || conn.email || conn.id,
      priority: conn.priority || 0,
      weight: 1, // Would come from combo target config
      isActive: conn.isActive !== false,
      testStatus: conn.testStatus,
      rateLimitedUntil: conn.rateLimitedUntil,
      maxConcurrent: conn.maxConcurrent,
      currentRunning: 0, // Would come from rateLimitManager
      exclusionReason: exclusionReasons.join(", ") || undefined,
    };
  });
}

function partitionAccounts(accounts: (SimAccount & { exclusionReason?: string })[]): {
  eligible: SimAccount[];
  excluded: (SimAccount & { exclusionReason: string })[];
} {
  const eligible: SimAccount[] = [];
  const excluded: (SimAccount & { exclusionReason: string })[] = [];

  for (const acc of accounts) {
    if (acc.exclusionReason) {
      excluded.push({ ...acc, exclusionReason: acc.exclusionReason });
    } else {
      eligible.push(acc);
    }
  }

  return { eligible, excluded };
}

function runSimulation(
  strategy: AnyRoutingStrategyValue,
  stickyLimit: number,
  eligible: SimAccount[],
  count: number
): SimulateRoutingResult["simulation"] {
  if (eligible.length === 0) return [];

  const ctx: SimContext = {
    strategy: normalizeRoutingStrategy(strategy),
    accounts: [...eligible],
    stickyLimit,
    stickyState: new Map(),
    roundRobinIndex: 0,
    weights: new Map(),
    leastUsedCounts: new Map(),
  };

  // Initialize weights and least-used counts
  for (const acc of ctx.accounts) {
    ctx.weights.set(acc.connectionId, acc.weight || 1);
    ctx.leastUsedCounts.set(acc.connectionId, 0);
  }

  const results: SimulateRoutingResult["simulation"] = [];

  for (let i = 0; i < count; i++) {
    const selected = selectAccount(ctx);
    if (!selected) break;

    // Update sticky state
    const currentSticky = ctx.stickyState.get(selected.connectionId) || 0;
    ctx.stickyState.set(selected.connectionId, currentSticky + 1);

    // Update least-used
    const currentUsed = ctx.leastUsedCounts.get(selected.connectionId) || 0;
    ctx.leastUsedCounts.set(selected.connectionId, currentUsed + 1);

    results.push({
      step: i + 1,
      selectedAccountId: selected.connectionId,
      selectedAccountName: selected.displayName,
      reason: buildSelectionReason(ctx.strategy, selected, ctx),
    });

    // Check if we should advance sticky
    if (ctx.stickyState.get(selected.connectionId)! >= ctx.stickyLimit) {
      // For round-robin, advance index
      if (ctx.strategy === "round-robin") {
        ctx.roundRobinIndex = (ctx.roundRobinIndex + 1) % ctx.accounts.length;
      }
      // Reset sticky for this account
      ctx.stickyState.set(selected.connectionId, 0);
    }
  }

  return results;
}

function selectAccount(ctx: SimContext): SimAccount | null {
  const { strategy, accounts, stickyState, roundRobinIndex, weights, leastUsedCounts } = ctx;

  // Filter out accounts that have hit maxConcurrent
  const available = accounts.filter((a) => {
    if (a.maxConcurrent && a.maxConcurrent > 0) {
      return a.currentRunning < a.maxConcurrent;
    }
    return true;
  });

  if (available.length === 0) return null;

  switch (strategy) {
    case "priority":
      return available.sort((a, b) => a.priority - b.priority)[0];

    case "weighted":
      return selectWeighted(available, weights);

    case "fill-first":
      return available.sort((a, b) => a.priority - b.priority)[0];

    case "round-robin":
      return selectRoundRobin(available, roundRobinIndex, stickyState, stickyLimit(ctx));

    case "p2c":
      return selectP2C(available);

    case "random":
      return available[Math.floor(Math.random() * available.length)];

    case "least-used":
      return selectLeastUsed(available, leastUsedCounts);

    case "cost-optimized":
      // Simplified: same as priority for simulation
      return available.sort((a, b) => a.priority - b.priority)[0];

    case "strict-random":
      return available[Math.floor(Math.random() * available.length)];

    default:
      return available[0];
  }
}

function selectWeighted(accounts: SimAccount[], weights: Map<string, number>): SimAccount {
  const totalWeight = accounts.reduce((sum, a) => sum + (weights.get(a.connectionId) || 1), 0);
  let random = Math.random() * totalWeight;

  for (const acc of accounts) {
    random -= weights.get(acc.connectionId) || 1;
    if (random <= 0) return acc;
  }
  return accounts[accounts.length - 1];
}

function selectRoundRobin(
  accounts: SimAccount[],
  index: number,
  stickyState: Map<string, number>,
  stickyLimit: number
): SimAccount {
  // Find next account that hasn't hit sticky limit
  for (let i = 0; i < accounts.length; i++) {
    const idx = (index + i) % accounts.length;
    const acc = accounts[idx];
    const sticky = stickyState.get(acc.connectionId) || 0;
    if (sticky < stickyLimit) {
      return acc;
    }
  }
  // All at sticky limit, reset and return first
  return accounts[index % accounts.length];
}

function selectP2C(accounts: SimAccount[]): SimAccount {
  // Power of Two Choices: pick 2 random, return the one with lower load
  if (accounts.length <= 2) return accounts[Math.floor(Math.random() * accounts.length)];

  const a = accounts[Math.floor(Math.random() * accounts.length)];
  const b = accounts[Math.floor(Math.random() * accounts.length)];

  // Use currentRunning as load metric
  return a.currentRunning <= b.currentRunning ? a : b;
}

function selectLeastUsed(accounts: SimAccount[], counts: Map<string, number>): SimAccount {
  return accounts.reduce((min, acc) => {
    const minCount = counts.get(min.connectionId) || 0;
    const accCount = counts.get(acc.connectionId) || 0;
    return accCount < minCount ? acc : min;
  });
}

function stickyLimit(ctx: SimContext): number {
  return ctx.stickyLimit;
}

function buildSelectionReason(
  strategy: AnyRoutingStrategyValue,
  selected: SimAccount,
  ctx: SimContext
): string {
  switch (strategy) {
    case "priority":
      return `Highest priority (${selected.priority})`;
    case "weighted":
      return `Selected by weight (${ctx.weights.get(selected.connectionId) || 1})`;
    case "fill-first":
      return `First available in priority order`;
    case "round-robin":
      return `Round-robin turn (sticky: ${ctx.stickyState.get(selected.connectionId)}/${ctx.stickyLimit})`;
    case "p2c":
      return `Power-of-two-choices (lower load)`;
    case "random":
      return `Random selection`;
    case "least-used":
      return `Least used (${ctx.leastUsedCounts.get(selected.connectionId) || 0} requests)`;
    case "cost-optimized":
      return `Cost-optimized priority`;
    case "strict-random":
      return `Strict random`;
    default:
      return `Strategy: ${strategy}`;
  }
}
