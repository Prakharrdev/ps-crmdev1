"use client";

import { useEffect, useState } from "react";
import { X, Package, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/src/lib/supabase";

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  available_quantity: number;
}

interface RequestItem {
  materialId: string;
  quantity: number;
}

interface MaterialRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticketId: string;        // Database UUID
  ticketDisplayId: string; // Human readable DL-xxxx
  ticketTitle: string;
}

export default function MaterialRequestModal({
  isOpen,
  onClose,
  ticketId,
  ticketDisplayId,
  ticketTitle,
}: MaterialRequestModalProps) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [items, setItems] = useState<RequestItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchInventory();
    }
  }, [isOpen]);

  async function fetchInventory() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/api/warehouse/inventory`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      
      if (!response.ok) throw new Error("Failed to fetch inventory");
      
      const data = await response.json();
      setInventory(data.items || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load inventory. Please try again.");
    }
  }

  if (!isOpen) return null;

  const addItem = () => {
    if (inventory.length === 0) return;
    setItems([...items, { materialId: inventory[0].id, quantity: 1 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof RequestItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      
      // The API currently takes one material per request based on MaterialRequestCreate model
      // If we have multiple items, we need to send them sequentially or update the API
      // Since the API model is for single request, I'll send them one by one for now
      // OR I'll just send the first one if the user only expected one.
      // But typically a worker might need multiple. I'll loop.
      
      for (const item of items) {
        const response = await fetch(`${apiUrl}/api/worker/material-request`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}` 
          },
          body: JSON.stringify({
            complaint_id: ticketId,
            material_id: item.materialId,
            quantity: item.quantity,
            notes: `Requested for ticket ${ticketDisplayId}`
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || "Failed to submit request");
        }
      }
      
      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
        setItems([]);
      }, 2000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to submit request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl border border-gray-200 dark:border-[#2a2a2a] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-[#2a2a2a]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#b48470]/10 dark:bg-[#C9A84C]/10 rounded-lg">
              <Package className="w-5 h-5 text-[#b48470] dark:text-[#C9A84C]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Request Materials</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{ticketDisplayId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-[#1e1e1e] rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Issue</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1 bg-gray-50 dark:bg-[#1e1e1e] p-2 rounded-lg border border-gray-100 dark:border-[#2a2a2a]">
              {ticketTitle}
            </p>
          </div>

          <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2 mb-6">
            {items.map((item, index) => (
              <div key={index} className="flex gap-3 items-end p-3 rounded-xl border border-gray-100 dark:border-[#2a2a2a] bg-gray-50/50 dark:bg-[#1a1a1a]">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Material</label>
                  <select
                    value={item.materialId}
                    onChange={(e) => updateItem(index, "materialId", e.target.value)}
                    className="w-full bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#2a2a2a] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#b48470] dark:focus:ring-[#C9A84C] outline-none transition-all dark:text-white"
                  >
                    {inventory.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.available_quantity} {m.unit} available)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Qty</label>
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value))}
                    className="w-full bg-white dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#2a2a2a] rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#b48470] dark:focus:ring-[#C9A84C] outline-none transition-all dark:text-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="p-2.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {items.length === 0 && (
              <div className="text-center py-8 border-2 border-dashed border-gray-100 dark:border-[#2a2a2a] rounded-xl flex flex-col items-center">
                <p className="text-sm text-gray-400">No materials added yet</p>
                <button
                  type="button"
                  onClick={addItem}
                  disabled={inventory.length === 0}
                  className="mt-2 text-sm font-medium text-[#b48470] hover:text-[#8c6757] dark:text-[#C9A84C] dark:hover:text-[#d8b65c] transition-colors disabled:opacity-50"
                >
                  {inventory.length === 0 ? "Loading inventory..." : "+ Add Material"}
                </button>
              </div>
            )}
          </div>

          {items.length > 0 && (
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-2 text-sm font-medium text-[#b48470] hover:text-[#8c6757] dark:text-[#C9A84C] dark:hover:text-[#d8b65c] mb-6 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add another item
            </button>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl border border-red-100 dark:border-red-900/10">
              {error}
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-[#2a2a2a] text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-[#1e1e1e] transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={items.length === 0 || isSubmitting || isSuccess}
              className={`flex-1 px-4 py-2.5 font-medium rounded-xl transition-all flex items-center justify-center gap-2 ${
                isSuccess
                  ? "bg-green-500 text-white"
                  : "bg-[#b48470] text-white hover:bg-[#8c6757] dark:bg-[#C9A84C] dark:text-[#1a1a1a] dark:hover:bg-[#d8b65c] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#b48470]/20 dark:shadow-[#C9A84C]/20"
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Submitting...
                </>
              ) : isSuccess ? (
                "Request Sent!"
              ) : (
                "Submit Request"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
