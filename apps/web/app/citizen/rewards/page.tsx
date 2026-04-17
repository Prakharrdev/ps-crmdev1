"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bus,
  Car,
  CheckCircle2,
  Coins,
  CreditCard,
  Lock,
  ShoppingCart,
  Sparkles,
  Ticket,
  TrainFront,
  TreePine,
  X,
  Zap,
} from "lucide-react";
import { supabase } from "@/src/lib/supabase";

type RewardKind = "ev_charging" | "metro" | "bus" | "ncmc" | "cab" | "parking" | "other" | string;

type RewardCatalogItem = {
  id: string;
  title: string;
  kind: RewardKind;
  points_cost: number;
  active: boolean;
  stock_remaining: number | null;
  per_user_limit: number;
};

type Wallet = {
  user_id: string;
  points_balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  updated_at: string;
};

type WalletResponse = {
  wallet: Wallet;
  rewards: RewardCatalogItem[];
  redeemedRewardIds: string[];
};

type PassTier = {
  level: number;
  title: string;
  pointsRequired: number;
  subtitle: string;
  icon: React.ReactNode;
  status: "received" | "current" | "locked";
  color: string;
};

type RewardVisual = {
  category: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
  iconBg: string;
};

const progressPassBase: Omit<PassTier, "status">[] = [
  { level: 1, title: "100 JS Points", subtitle: "Currency", pointsRequired: 1000, icon: <Coins size={36} />, color: "text-yellow-600 dark:text-yellow-500" },
  { level: 2, title: "E-Cab Points", subtitle: "Ride Credit", pointsRequired: 2000, icon: <Car size={36} />, color: "text-blue-600 dark:text-blue-400" },
  { level: 3, title: "Delhi Metro", subtitle: "Card Refill", pointsRequired: 3000, icon: <TrainFront size={36} />, color: "text-red-500 dark:text-red-400" },
  { level: 4, title: "NCMC Card", subtitle: "Physical Card", pointsRequired: 4000, icon: <CreditCard size={36} />, color: "text-indigo-600 dark:text-indigo-400" },
  { level: 5, title: "NCMC Refill", subtitle: "500 Credit", pointsRequired: 5000, icon: <Zap size={36} />, color: "text-amber-600 dark:text-amber-400" },
  { level: 6, title: "EV Charging", subtitle: "50 kWh Credits", pointsRequired: 6000, icon: <Zap size={36} />, color: "text-green-600 dark:text-green-400" },
  { level: 7, title: "Bus Pass", subtitle: "Annual", pointsRequired: 7000, icon: <Bus size={36} />, color: "text-emerald-600 dark:text-emerald-400" },
  { level: 8, title: "Sapling Kit", subtitle: "Environment", pointsRequired: 8000, icon: <TreePine size={36} />, color: "text-lime-600 dark:text-lime-400" },
  { level: 9, title: "Park Pass", subtitle: "Garden Access", pointsRequired: 9000, icon: <TreePine size={36} />, color: "text-lime-600 dark:text-lime-400" },
  { level: 10, title: "MCD Parking", subtitle: "Waiver Coupon", pointsRequired: 10000, icon: <Car size={36} />, color: "text-slate-600 dark:text-slate-400" },
];

function rewardVisual(kind: RewardKind, title: string): RewardVisual {
  const normalizedKind = kind.toLowerCase();

  if (normalizedKind === "cab") {
    return {
      category: "Transport",
      subtitle: "Ride Cash",
      icon: <Car size={28} />,
      color: "text-blue-600 dark:text-blue-400",
      iconBg: "bg-blue-100 dark:bg-blue-500/10",
    };
  }

  if (normalizedKind === "ncmc") {
    return {
      category: "Cards",
      subtitle: "Transit Card",
      icon: <CreditCard size={28} />,
      color: "text-indigo-600 dark:text-indigo-400",
      iconBg: "bg-indigo-100 dark:bg-indigo-500/10",
    };
  }

  if (normalizedKind === "metro") {
    return {
      category: "Transport",
      subtitle: "Metro Travel",
      icon: <TrainFront size={28} />,
      color: "text-red-600 dark:text-red-400",
      iconBg: "bg-red-100 dark:bg-red-500/10",
    };
  }

  if (normalizedKind === "bus") {
    return {
      category: "Transport",
      subtitle: "Bus Travel",
      icon: <Bus size={28} />,
      color: "text-green-600 dark:text-green-400",
      iconBg: "bg-green-100 dark:bg-green-500/10",
    };
  }

  if (normalizedKind === "ev_charging") {
    return {
      category: "EV",
      subtitle: "Charge Credits",
      icon: <Zap size={28} />,
      color: "text-amber-600 dark:text-amber-400",
      iconBg: "bg-amber-100 dark:bg-amber-500/10",
    };
  }

  if (normalizedKind === "parking") {
    return {
      category: "Mobility",
      subtitle: "Parking Waiver",
      icon: <Ticket size={28} />,
      color: "text-emerald-600 dark:text-emerald-400",
      iconBg: "bg-emerald-100 dark:bg-emerald-500/10",
    };
  }

  return {
    category: "Voucher",
    subtitle: title,
    icon: <ShoppingCart size={28} />,
    color: "text-pink-600 dark:text-pink-400",
    iconBg: "bg-pink-100 dark:bg-pink-500/10",
  };
}

function toUserFacingError(errorMessage: string): string {
  const normalized = errorMessage.toLowerCase();
  if (normalized.includes("insufficient")) return "Not enough JS Points.";
  if (normalized.includes("stock")) return "This reward is currently out of stock.";
  if (normalized.includes("limit")) return "You have reached the redemption limit for this reward.";
  if (normalized.includes("unauthorized")) return "Please log in again to continue.";
  return errorMessage || "Unable to process reward redemption right now.";
}

async function getAuthToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;

  const { data: refreshed } = await supabase.auth.refreshSession();
  return refreshed.session?.access_token ?? null;
}

export default function RewardsPage() {
  const [jsPoints, setJsPoints] = useState<number | null>(null);
  const [rewards, setRewards] = useState<RewardCatalogItem[]>([]);
  const [redeemedRewardIds, setRedeemedRewardIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redeemingRewardId, setRedeemingRewardId] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastRedeemedItem, setLastRedeemedItem] = useState<RewardCatalogItem | null>(null);

  const progressPass = useMemo<PassTier[]>(() => {
    const balance = jsPoints ?? 0;
    const firstLockedIndex = progressPassBase.findIndex((tier) => balance < tier.pointsRequired);

    return progressPassBase.map((tier, index) => {
      let status: PassTier["status"] = "locked";

      if (balance >= tier.pointsRequired) {
        status = "received";
      } else if (index === firstLockedIndex) {
        status = "current";
      }

      return { ...tier, status };
    });
  }, [jsPoints]);

  const fetchWallet = useCallback(async () => {
    const token = await getAuthToken();
    if (!token) {
      setError("Please log in to view rewards.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/citizen/wallet", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const data = (await response.json().catch(() => null)) as WalletResponse | { error?: string } | null;

    if (!response.ok) {
      throw new Error((data as { error?: string } | null)?.error || "Failed to load rewards");
    }

    const payload = data as WalletResponse;
    setJsPoints(payload.wallet.points_balance ?? 0);
    setRewards(payload.rewards ?? []);
    setRedeemedRewardIds(payload.redeemedRewardIds ?? []);
    window.dispatchEvent(new CustomEvent("update-js-points", { detail: payload.wallet.points_balance ?? 0 }));
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchWallet();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load rewards";
        setError(toUserFacingError(message));
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [fetchWallet]);

  const handlePurchase = useCallback(
    async (item: RewardCatalogItem) => {
      if (redeemingRewardId) return;
      setRedeemingRewardId(item.id);
      setError(null);

      try {
        const token = await getAuthToken();
        if (!token) {
          throw new Error("Unauthorized");
        }

        const response = await fetch("/api/citizen/wallet", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reward_id: item.id }),
        });

        const payload = (await response.json().catch(() => null)) as
          | { error?: string; wallet?: Wallet }
          | null;

        if (!response.ok) {
          throw new Error(payload?.error || "Failed to redeem reward");
        }

        setLastRedeemedItem(item);
        setShowSuccessModal(true);
        await fetchWallet();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to redeem reward";
        setError(toUserFacingError(message));
      } finally {
        setRedeemingRewardId(null);
      }
    },
    [fetchWallet, redeemingRewardId],
  );

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-[#161616] text-gray-900 dark:text-gray-100 overflow-hidden font-sans">
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {/* PROGRESS PASS SECTION */}
        <section className="mb-8">
          <div className="flex justify-between items-end mb-4">
            <div>
              <h2 className="text-lg font-bold tracking-wide text-gray-900 dark:text-white">PORTAL PROGRESS</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Complete Jan Samadhan tasks to earn points and advance tiers.</p>
            </div>
            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Balance: <span className="text-amber-700 dark:text-amber-400">
                {jsPoints === null ? "Loading..." : `${jsPoints.toLocaleString()} JS Points`}
              </span>
            </div>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar">
            {progressPass.map((tier, index) => (
              <div key={tier.level} className="flex flex-col gap-2 min-w-[140px] relative">
                {index < progressPass.length - 1 && (
                  <div
                    className={`absolute top-3 left-1/2 w-full h-1 z-0 ${
                      tier.status === "received" ? "bg-green-500" : "bg-gray-200 dark:bg-[#313541]"
                    }`}
                  />
                )}

                <div className="flex justify-center z-10">
                  <div
                    className={`w-8 h-8 rounded flex items-center justify-center font-bold text-sm outline outline-4 outline-gray-50 dark:outline-[#161616]
                    ${
                      tier.status === "received"
                        ? "bg-green-500 text-white dark:text-black"
                        : tier.status === "current"
                          ? "bg-[#C9A84C] text-white dark:text-black"
                          : "bg-gray-200 text-gray-500 dark:bg-[#313541] dark:text-gray-400"
                    }
                  `}
                  >
                    {tier.level}
                  </div>
                </div>

                <div
                  className={`relative flex flex-col items-center justify-between p-3 rounded-lg border h-32 mt-1
                  ${
                    tier.status === "received"
                      ? "bg-green-50 border-green-200 shadow-[0_0_15px_rgba(34,197,94,0.1)] dark:bg-[#1D2B24] dark:border-green-500/50"
                      : tier.status === "current"
                        ? "bg-amber-50 border-amber-300 shadow-[0_0_15px_rgba(201,168,76,0.15)] dark:bg-[#2A2315] dark:border-[#C9A84C]/50"
                        : "bg-white border-gray-200 dark:bg-[#1e1e1e] dark:border-[#2a2a2a]"
                  }
                `}
                >
                  {tier.status === "locked" && (
                    <div className="absolute top-2 right-2 text-gray-400 dark:text-gray-500">
                      <Lock size={14} />
                    </div>
                  )}
                  {tier.status === "received" && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white dark:text-black text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">
                      RECEIVED
                    </div>
                  )}

                  <div className={`mt-2 ${tier.color}`}>{tier.icon}</div>

                  <div className="text-center mt-auto w-full">
                    <div className="text-[12px] font-bold text-gray-900 dark:text-white line-clamp-1 leading-tight">{tier.title}</div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{tier.subtitle}</div>
                  </div>
                </div>

                <div className="text-center text-[11px] text-gray-600 dark:text-gray-500 font-medium">{tier.pointsRequired} JS Points</div>
              </div>
            ))}
          </div>
        </section>

        {/* STORE SECTION */}
        <section>
          <div className="flex items-center gap-4 mb-4 border-b border-gray-200 dark:border-[#2a2a2a]">
            <h2 className="text-lg font-bold tracking-wide text-gray-900 dark:text-white pb-2 flex-shrink-0">FEATURED REWARDS & VOUCHERS</h2>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Loading rewards...</div>
          ) : null}

          {!loading && rewards.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">No rewards are available right now.</div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {rewards.map((item) => {
              const visual = rewardVisual(item.kind, item.title);
              const redemptionCount = redeemedRewardIds.filter(id => id === item.id).length;
              const isLimitReached = redemptionCount >= item.per_user_limit;
              const hasStock = item.stock_remaining == null || item.stock_remaining > 0;
              const canAfford = jsPoints !== null && jsPoints >= item.points_cost;
              const isRedeeming = redeemingRewardId === item.id;

              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-4 p-3 rounded-xl border transition-all
                    ${
                      isLimitReached
                        ? "bg-green-50 border-green-200 opacity-90 dark:bg-[#1D2B24] dark:border-green-500/30 dark:opacity-80"
                        : "bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300 dark:bg-[#1e1e1e] dark:border-[#2a2a2a] dark:hover:bg-[#252525] dark:hover:border-gray-600"
                    }
                  `}
                >
                  <div className={`p-4 justify-center items-center flex rounded-lg ${visual.iconBg} ${visual.color}`}>{visual.icon}</div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-0.5">
                      <div className="text-xs text-gray-500 dark:text-gray-400">{visual.category}</div>
                      <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isLimitReached ? "bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400" : "bg-gray-100 dark:bg-white/5 text-gray-500"}`}>
                        {redemptionCount}/{item.per_user_limit} CLAIMED
                      </div>
                    </div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white line-clamp-1 leading-tight mb-1">{item.title}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mb-2 line-clamp-1">{visual.subtitle}</div>

                    <button
                      onClick={() => void handlePurchase(item)}
                      disabled={isLimitReached || !canAfford || !hasStock || isRedeeming}
                      className={`flex items-center justify-between w-full px-2 py-1.5 rounded text-xs font-bold transition-colors
                        ${
                          isLimitReached
                            ? "bg-transparent text-green-600 dark:text-green-500 cursor-default"
                            : canAfford && hasStock && !isRedeeming
                              ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-[#C9A84C]/10 dark:text-[#C9A84C] dark:hover:bg-[#C9A84C]/20 cursor-pointer"
                              : "bg-gray-100 text-gray-400 dark:bg-[#2a2a2a] dark:text-gray-500 cursor-not-allowed"
                        }
                      `}
                    >
                      <div className="flex items-center gap-1.5">
                        <Coins size={14} className={isLimitReached ? "text-green-600 dark:text-green-500" : "text-amber-600 dark:text-[#C9A84C]"} />
                        <span>{item.points_cost} JS Points</span>
                      </div>
                      {isLimitReached ? <CheckCircle2 size={14} className="text-green-600 dark:text-green-500" /> : null}
                    </button>
                    {!hasStock ? <p className="mt-1 text-[10px] text-red-500">Out of stock</p> : null}
                    {isRedeeming ? <p className="mt-1 text-[10px] text-gray-500">Processing...</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-modal-in {
          animation: modal-in 0.3s ease-out forwards;
        }
      `,
        }}
      />

      {/* REDEMPTION SUCCESS MODAL */}
      {showSuccessModal && lastRedeemedItem && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="bg-white dark:bg-[#1e1e1e] w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-gray-200 dark:border-white/10 animate-modal-in">
            <div className="relative p-8 flex flex-col items-center text-center">
              <button 
                onClick={() => setShowSuccessModal(false)}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>

              <div className="mb-6 relative">
                <div className="absolute inset-0 bg-green-500/20 blur-2xl rounded-full" />
                <div className="relative bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 p-4 rounded-full">
                  <CheckCircle2 size={48} strokeWidth={2.5} />
                </div>
                <div className="absolute -top-1 -right-1 bg-amber-400 text-amber-900 p-1.5 rounded-full shadow-lg">
                  <Sparkles size={16} />
                </div>
              </div>

              <h3 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white mb-2">REDEEMED!</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Successfully claimed <span className="font-bold text-gray-900 dark:text-gray-100">{lastRedeemedItem.title}</span>
              </p>

              <div className="w-full bg-gray-50 dark:bg-white/5 rounded-2xl p-4 mb-8">
                <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">DEDUCTED</div>
                <div className="flex items-center justify-center gap-1.5 text-amber-600 dark:text-[#C9A84C] font-bold text-lg">
                  <Coins size={20} />
                  <span>{lastRedeemedItem.points_cost.toLocaleString()} JS Points</span>
                </div>
              </div>

              <button
                onClick={() => setShowSuccessModal(false)}
                className="w-full py-4 bg-gray-900 dark:bg-white text-white dark:text-black rounded-2xl font-bold text-sm tracking-wide hover:opacity-90 transition-opacity shadow-lg"
              >
                CONTINUE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
