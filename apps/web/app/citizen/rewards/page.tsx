"use client";

import React, { useState } from "react";
import { 
  Coins, Ticket, Car, TrainFront, Bus, CreditCard, 
  Lock, CheckCircle2, ShoppingCart, TreePine, Zap, Shield, Plus
} from "lucide-react";

// Mock Data
const INITIAL_JS_POINTS = 3500;
const INITIAL_GOVT_CREDITS = 20000;

interface PassTier {
  level: number;
  title: string;
  pointsRequired: number;
  subtitle: string;
  icon: React.ReactNode;
  status: 'received' | 'current' | 'locked';
  color: string;
}

const progressPass: PassTier[] = [
  { level: 1, title: '100 JS Points', subtitle: 'Currency', pointsRequired: 1000, icon: <Coins size={36} />, status: 'received', color: 'text-yellow-600 dark:text-yellow-500' },
  { level: 2, title: 'E-Cab Points', subtitle: '₹100 Value', pointsRequired: 2000, icon: <Car size={36} />, status: 'received', color: 'text-blue-600 dark:text-blue-400' },
  { level: 3, title: 'Delhi Metro', subtitle: 'Card Refill', pointsRequired: 3000, icon: <TrainFront size={36} />, status: 'received', color: 'text-red-500 dark:text-red-400' },
  { level: 4, title: 'NCMC Card', subtitle: 'Physical Card', pointsRequired: 4000, icon: <CreditCard size={36} />, status: 'current', color: 'text-indigo-600 dark:text-indigo-400' },
  { level: 5, title: 'NCMC Refill', subtitle: '₹500 Ticket', pointsRequired: 5000, icon: <Zap size={36} />, status: 'locked', color: 'text-gray-400 dark:text-gray-500' },
  { level: 6, title: 'EV Charging', subtitle: '50 kWh Credits', pointsRequired: 6000, icon: <Zap size={36} />, status: 'locked', color: 'text-gray-400 dark:text-gray-500' },
  { level: 7, title: 'Bus Pass', subtitle: 'Annual', pointsRequired: 7000, icon: <Bus size={36} />, status: 'locked', color: 'text-gray-400 dark:text-gray-500' },
  { level: 8, title: 'Sapling Kit', subtitle: 'Environment', pointsRequired: 8000, icon: <TreePine size={36} />, status: 'locked', color: 'text-gray-400 dark:text-gray-500' },
  { level: 9, title: 'Park Pass', subtitle: 'Garden Access', pointsRequired: 9000, icon: <TreePine size={36} />, status: 'locked', color: 'text-gray-400 dark:text-gray-500' },
  { level: 10, title: 'MCD Parking', subtitle: 'Waiver Coupon', pointsRequired: 10000, icon: <Car size={36} />, status: 'locked', color: 'text-gray-400 dark:text-gray-500' },
];

interface ShopItem {
  id: string;
  title: string;
  subtitle: string;
  cost: number;
  icon: React.ReactNode;
  category: string;
  color: string;
  iconBg: string;
}

const shopItems: ShopItem[] = [
  { id: '1', title: 'E-Cab Voucher', subtitle: 'Ride Cash', cost: 500, icon: <Car size={28} />, category: 'Transport', color: 'text-blue-600 dark:text-blue-400', iconBg: 'bg-blue-100 dark:bg-blue-500/10' },
  { id: '2', title: 'NCMC Card', subtitle: 'New Issue', cost: 1200, icon: <CreditCard size={28} />, category: 'Cards', color: 'text-indigo-600 dark:text-indigo-400', iconBg: 'bg-indigo-100 dark:bg-indigo-500/10' },
  { id: '3', title: 'Bus Card', subtitle: 'State Transport', cost: 1000, icon: <Bus size={28} />, category: 'Transport', color: 'text-green-600 dark:text-green-400', iconBg: 'bg-green-100 dark:bg-green-500/10' },
  { id: '4', title: 'Heritage Show Tickets', subtitle: 'Light & Sound Show', cost: 3000, icon: <Ticket size={28} />, category: 'Events', color: 'text-purple-600 dark:text-purple-400', iconBg: 'bg-purple-100 dark:bg-purple-500/10' },
  { id: '5', title: 'Delhi Metro Voucher', subtitle: 'Refill Pack', cost: 1000, icon: <TrainFront size={28} />, category: 'Transport', color: 'text-red-600 dark:text-red-400', iconBg: 'bg-red-100 dark:bg-red-500/10' },
  { id: '6', title: '₹500 NCMC Refill', subtitle: 'Direct Top-up', cost: 2000, icon: <Zap size={28} />, category: 'Voucher', color: 'text-amber-600 dark:text-amber-400', iconBg: 'bg-amber-100 dark:bg-amber-500/10' },
  { id: '7', title: '₹300 Bus Card Refill', subtitle: 'Recharge Code', cost: 300, icon: <Ticket size={28} />, category: 'Voucher', color: 'text-emerald-600 dark:text-emerald-400', iconBg: 'bg-emerald-100 dark:bg-emerald-500/10' },
  { id: '8', title: 'Local Handloom', subtitle: 'Discount Coupon', cost: 300, icon: <ShoppingCart size={28} />, category: 'Voucher', color: 'text-pink-600 dark:text-pink-400', iconBg: 'bg-pink-100 dark:bg-pink-500/10' },
];

export default function RewardsPage() {
  const [jsPoints, setJsPoints] = useState(INITIAL_JS_POINTS);
  const [purchasedItems, setPurchasedItems] = useState<Set<string>>(new Set());

  const handlePurchase = (item: ShopItem) => {
    if (jsPoints >= item.cost && !purchasedItems.has(item.id)) {
      const newPoints = jsPoints - item.cost;
      setJsPoints(newPoints);
      window.dispatchEvent(new CustomEvent('update-js-points', { detail: newPoints }));
      setPurchasedItems((prev) => new Set(prev).add(item.id));
      alert(`Successfully redeemed ${item.title}!`);
    } else if (purchasedItems.has(item.id)) {
      alert(`You already own ${item.title}.`);
    } else {
      alert(`Not enough JS Points for ${item.title}.`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-[#161616] text-gray-900 dark:text-gray-100 overflow-hidden font-sans">
      



      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        
        {/* PROGRESS PASS SECTION */}
        <section className="mb-8">
          <div className="flex justify-between items-end mb-4">
            <div>
              <h2 className="text-lg font-bold tracking-wide text-gray-900 dark:text-white">PORTAL PROGRESS</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Complete Jan Samadhan Tasks to Earn Points and Advance Tiers.</p>
            </div>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar">
            {progressPass.map((tier, index) => (
              <div key={tier.level} className="flex flex-col gap-2 min-w-[140px] relative">
                
                {/* Connecting Line connecting tiers */}
                {index < progressPass.length - 1 && (
                  <div className={`absolute top-3 left-1/2 w-full h-1 z-0 ${
                    tier.status === 'received' 
                      ? 'bg-green-500' 
                      : 'bg-gray-200 dark:bg-[#313541]'
                  }`} />
                )}
                
                {/* Level Indicator */}
                <div className="flex justify-center z-10">
                  <div className={`w-8 h-8 rounded flex items-center justify-center font-bold text-sm outline outline-4 outline-gray-50 dark:outline-[#161616]
                    ${tier.status === 'received' 
                        ? 'bg-green-500 text-white dark:text-black' 
                        : tier.status === 'current' 
                            ? 'bg-[#C9A84C] text-white dark:text-black' 
                            : 'bg-gray-200 text-gray-500 dark:bg-[#313541] dark:text-gray-400'
                    }
                  `}>
                    {tier.level}
                  </div>
                </div>

                {/* Reward Card */}
                <div className={`relative flex flex-col items-center justify-between p-3 rounded-lg border h-32 mt-1
                  ${tier.status === 'received' 
                      ? 'bg-green-50 border-green-200 shadow-[0_0_15px_rgba(34,197,94,0.1)] dark:bg-[#1D2B24] dark:border-green-500/50' 
                      : tier.status === 'current' 
                          ? 'bg-amber-50 border-amber-300 shadow-[0_0_15px_rgba(201,168,76,0.15)] dark:bg-[#2A2315] dark:border-[#C9A84C]/50' 
                          : 'bg-white border-gray-200 dark:bg-[#1e1e1e] dark:border-[#2a2a2a]'}
                `}>
                  {tier.status === 'locked' && (
                    <div className="absolute top-2 right-2 text-gray-400 dark:text-gray-500">
                      <Lock size={14} />
                    </div>
                  )}
                  {tier.status === 'received' && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white dark:text-black text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">
                      RECEIVED
                    </div>
                  )}
                  
                  <div className={`mt-2 ${tier.color}`}>
                    {tier.icon}
                  </div>
                  
                  <div className="text-center mt-auto w-full">
                    <div className="text-[12px] font-bold text-gray-900 dark:text-white line-clamp-1 leading-tight">{tier.title}</div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{tier.subtitle}</div>
                  </div>
                </div>

                {/* Info Text */}
                <div className="text-center text-[11px] text-gray-600 dark:text-gray-500 font-medium">
                  {tier.pointsRequired} JS Points
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* STORE SECTION */}
        <section>
          <div className="flex items-center gap-4 mb-4 border-b border-gray-200 dark:border-[#2a2a2a]">
            <h2 className="text-lg font-bold tracking-wide text-gray-900 dark:text-white pb-2 flex-shrink-0">FEATURED REWARDS & VOUCHERS</h2>
            
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {shopItems.map((item) => {
              const isOwned = purchasedItems.has(item.id);
              const canAfford = jsPoints >= item.cost;
              
              return (
                <div 
                  key={item.id} 
                  className={`flex items-center gap-4 p-3 rounded-xl border transition-all
                    ${isOwned 
                      ? 'bg-green-50 border-green-200 opacity-90 dark:bg-[#1D2B24] dark:border-green-500/30 dark:opacity-80' 
                      : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300 dark:bg-[#1e1e1e] dark:border-[#2a2a2a] dark:hover:bg-[#252525] dark:hover:border-gray-600'}
                  `}
                >
                  <div className={`p-4 justify-center items-center flex rounded-lg ${item.iconBg} ${item.color}`}>
                    {item.icon}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{item.category}</div>
                    <div className="text-sm font-bold text-gray-900 dark:text-white line-clamp-1 leading-tight mb-2">
                      {item.title}
                    </div>
                    
                    <button 
                      onClick={() => handlePurchase(item)}
                      disabled={isOwned || (!canAfford && !isOwned)}
                      className={`flex items-center justify-between w-full px-2 py-1.5 rounded text-xs font-bold transition-colors
                        ${isOwned 
                          ? 'bg-transparent text-green-600 dark:text-green-500 cursor-default' 
                          : canAfford 
                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-[#C9A84C]/10 dark:text-[#C9A84C] dark:hover:bg-[#C9A84C]/20 cursor-pointer' 
                            : 'bg-gray-100 text-gray-400 dark:bg-[#2a2a2a] dark:text-gray-500 cursor-not-allowed'}
                      `}
                    >
                      <div className="flex items-center gap-1.5">
                        <Coins size={14} className={isOwned ? "text-green-600 dark:text-green-500" : "text-amber-600 dark:text-[#C9A84C]"} />
                        <span>{item.cost} JS Points</span>
                      </div>
                      {isOwned && <CheckCircle2 size={14} className="text-green-600 dark:text-green-500" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

      </div>
      
      {/* CSS for hiding scrollbar specifically for horizontal lists */}
      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </div>
  );
}
