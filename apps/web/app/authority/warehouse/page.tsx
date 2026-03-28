"use client";

import { useEffect, useState } from "react";
import { 
  Package, 
  Search, 
  Clock, 
  CheckCircle2, 
  XCircle,
  MoreVertical,
  AlertTriangle
} from "lucide-react";
import { supabase } from "@/src/lib/supabase";

interface WarehouseItem {
  id: string;
  name: string;
  description: string;
  available_quantity: number;
  unit: string;
}

interface MaterialRequest {
  id: string;
  worker_id: string;
  complaint_id: string;
  material_id: string;
  requested_quantity: number;
  status: string;
  notes: string;
  created_at: string;
  profiles: { full_name: string };
  complaints: { ticket_id: string };
  warehouse_inventory: { name: string; unit: string };
}

export default function WarehousePage() {
  const [activeTab, setActiveTab] = useState<"inventory" | "requests">("inventory");
  const [searchQuery, setSearchQuery] = useState("");
  const [inventory, setInventory] = useState<WarehouseItem[]>([]);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      
      if (activeTab === "inventory") {
        const res = await fetch(`${apiUrl}/api/warehouse/inventory`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        setInventory(data.items || []);
      } else {
        const res = await fetch(`${apiUrl}/api/authority/material-requests`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load data. Please refresh.");
    } finally {
      setLoading(false);
    }
  }

  const handleAction = async (requestId: string, status: "allotted" | "rejected") => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      
      const response = await fetch(`${apiUrl}/api/authority/material-allot`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}` 
        },
        body: JSON.stringify({
          request_id: requestId,
          status: status,
          notes: `Processed by authority`
        }),
      });

      if (!response.ok) throw new Error("Action failed");

      // Refresh data
      fetchData();
    } catch (err) {
      console.error(err);
      alert("Failed to process request. Check inventory levels.");
    }
  };

  const filteredInventory = inventory.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredRequests = requests.filter(req => 
    req.profiles?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    req.complaints?.ticket_id?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-[#161616] p-6 rounded-2xl border border-gray-200 dark:border-[#2a2a2a] shadow-sm">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-xl">
              <Package className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Skus</p>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{inventory.length}</h3>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-[#161616] p-6 rounded-2xl border border-gray-200 dark:border-[#2a2a2a] shadow-sm">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-amber-100 dark:bg-amber-900/20 rounded-xl">
              <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Pending Requests</p>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                {requests.filter(r => r.status === "pending").length}
              </h3>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-[#161616] p-6 rounded-2xl border border-gray-200 dark:border-[#2a2a2a] shadow-sm">
          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-xl">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Low Stock Items</p>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                {inventory.filter(i => i.available_quantity < 10).length}
              </h3>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#161616] rounded-2xl border border-gray-200 dark:border-[#2a2a2a] shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-[#2a2a2a] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex bg-gray-100 dark:bg-[#1e1e1e] p-1 rounded-xl w-fit">
            <button
              onClick={() => setActiveTab("inventory")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "inventory" ? "bg-white dark:bg-[#2a2a2a] text-blue-600 dark:text-blue-400 shadow-sm" : "text-gray-500 dark:text-gray-400"
              }`}
            >
              Inventory
            </button>
            <button
              onClick={() => setActiveTab("requests")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === "requests" ? "bg-white dark:bg-[#2a2a2a] text-blue-600 dark:text-blue-400 shadow-sm" : "text-gray-500 dark:text-gray-400"
              }`}
            >
              Material Requests
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 bg-gray-50 dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#2a2a2a] rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none w-full sm:w-64 transition-all"
            />
          </div>
        </div>

        <div className="min-h-[400px]">
          {loading ? (
             <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
             </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <p className="text-red-500 mb-2">{error}</p>
              <button onClick={fetchData} className="text-sm font-medium text-blue-600 hover:underline">Retry</button>
            </div>
          ) : activeTab === "inventory" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#1e1e1e] border-b border-gray-100 dark:border-[#2a2a2a]">
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Item Name</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[#2a2a2a]">
                  {filteredInventory.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-[#1e1e1e] transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900 dark:text-white">{item.name}</div>
                        <div className="text-xs text-gray-500 truncate max-w-xs">{item.description}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                        {item.available_quantity} {item.unit}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          item.available_quantity > 20 ? "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400" :
                          item.available_quantity > 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" :
                          "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400"
                        }`}>
                          {item.available_quantity > 20 ? "In Stock" : item.available_quantity > 0 ? "Low Stock" : "Out of Stock"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                          <MoreVertical className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredInventory.length === 0 && (
                <div className="py-12 text-center text-gray-500">No items found matching your search.</div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#1e1e1e] border-b border-gray-100 dark:border-[#2a2a2a]">
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Requested By</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Materials</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ticket</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[#2a2a2a]">
                  {filteredRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-[#1e1e1e] transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900 dark:text-white font-semibold">{req.profiles?.full_name || "Unknown"}</div>
                        <div className="text-xs text-gray-500">{new Date(req.created_at).toLocaleString()}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 dark:text-white font-medium">
                          {req.requested_quantity} {req.warehouse_inventory?.unit} {req.warehouse_inventory?.name}
                        </div>
                        {req.notes && <div className="text-xs text-gray-500 italic mt-1">{req.notes}</div>}
                      </td>
                      <td className="px-6 py-4 text-sm font-mono text-blue-600 dark:text-blue-400">
                        {req.complaints?.ticket_id}
                      </td>
                      <td className="px-6 py-4 text-sm">
                         <span className="capitalize">{req.status}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex gap-2 justify-end">
                          <button 
                            onClick={() => handleAction(req.id, "allotted")}
                            className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-all"
                          >
                            Allot
                          </button>
                          <button 
                            onClick={() => handleAction(req.id, "rejected")}
                            className="px-3 py-1.5 border border-red-200 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-50 transition-all"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRequests.length === 0 && (
                <div className="py-12 text-center text-gray-500">No pending material requests.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
