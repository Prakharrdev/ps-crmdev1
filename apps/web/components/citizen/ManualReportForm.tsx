"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  MapPin,
  Upload,
  X,
  Loader2,
  CheckCircle2,
  ChevronDown,
  Search,
  Crosshair,
} from "lucide-react";
import { supabase } from "@/src/lib/supabase";
import { useRouter } from "next/navigation";
const NearbyTicketsMap = dynamic(
  () => import("../../app/citizen/nearby/_components/NearbyTicketsMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-48 w-full items-center justify-center rounded-lg border border-gray-200 bg-gray-100 text-xs text-gray-400 dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
        Loading map…
      </div>
    ),
  }
);

import { useNearbyTickets } from "../../app/citizen/nearby/_components/useNearbyTickets";
/* ---------- full 42-category taxonomy ---------- */
interface ChildCategory {
  id: number;
  name: string;
  parentId: number;
  department: string;
}

interface ParentCategory {
  id: number;
  name: string;
}

const PARENT_CATEGORIES: ParentCategory[] = [
  { id: 100, name: "Metro & Rail" },
  { id: 101, name: "Roads & Infrastructure" },
  { id: 102, name: "Water & Sewage" },
  { id: 103, name: "Electricity" },
  { id: 104, name: "Sanitation & Waste" },
  { id: 105, name: "Parks & Public Spaces" },
  { id: 106, name: "Law & Traffic" },
  { id: 107, name: "Environment" },
  { id: 108, name: "Street Lighting" },
  { id: 109, name: "Government Buildings" },
  { id: 110, name: "NDMC Zone" },
];

const CHILD_CATEGORIES: ChildCategory[] = [
  { id: 1,  name: "Metro Station Issue",             parentId: 100, department: "DMRC" },
  { id: 2,  name: "Metro Track / Safety",             parentId: 100, department: "DMRC" },
  { id: 3,  name: "Escalator / Lift",                 parentId: 100, department: "DMRC" },
  { id: 4,  name: "Metro Parking",                    parentId: 100, department: "DMRC" },
  { id: 5,  name: "Metro Station Hygiene",            parentId: 100, department: "DMRC" },
  { id: 6,  name: "Metro Property Damage",            parentId: 100, department: "DMRC" },
  { id: 7,  name: "National Highway Damage",          parentId: 101, department: "NHAI" },
  { id: 8,  name: "Toll Plaza Issue",                 parentId: 101, department: "NHAI" },
  { id: 9,  name: "Expressway Problem",               parentId: 101, department: "NHAI" },
  { id: 10, name: "Highway Bridge Damage",            parentId: 101, department: "NHAI" },
  { id: 11, name: "State Highway / City Road",        parentId: 101, department: "PWD" },
  { id: 12, name: "Flyover / Overbridge",             parentId: 101, department: "PWD" },
  { id: 13, name: "Government Building Issue",        parentId: 109, department: "PWD" },
  { id: 14, name: "Large Drainage System",            parentId: 101, department: "PWD" },
  { id: 15, name: "Colony Road / Lane",               parentId: 101, department: "MCD" },
  { id: 16, name: "Garbage Collection",               parentId: 104, department: "MCD" },
  { id: 17, name: "Street Sweeping",                  parentId: 104, department: "MCD" },
  { id: 18, name: "Park Maintenance",                 parentId: 105, department: "MCD" },
  { id: 19, name: "Public Toilet",                    parentId: 104, department: "MCD" },
  { id: 20, name: "Local Drain / Sewage",             parentId: 102, department: "MCD" },
  { id: 21, name: "Stray Animals",                    parentId: 104, department: "MCD" },
  { id: 22, name: "Street Light (MCD zone)",          parentId: 108, department: "MCD" },
  { id: 23, name: "Connaught Place / Lutyens Issue",  parentId: 110, department: "NDMC" },
  { id: 24, name: "NDMC Road / Infrastructure",       parentId: 110, department: "NDMC" },
  { id: 25, name: "NDMC Street Light",                parentId: 108, department: "NDMC" },
  { id: 26, name: "Central Govt Residential Zone",    parentId: 109, department: "NDMC" },
  { id: 27, name: "Water Supply Failure",             parentId: 102, department: "DJB" },
  { id: 28, name: "Water Pipe Leakage",               parentId: 102, department: "DJB" },
  { id: 29, name: "Sewer Line Blockage",              parentId: 102, department: "DJB" },
  { id: 30, name: "Contaminated Water",               parentId: 102, department: "DJB" },
  { id: 31, name: "Power Outage",                     parentId: 103, department: "DISCOM" },
  { id: 32, name: "Transformer Issue",                parentId: 103, department: "DISCOM" },
  { id: 33, name: "Exposed / Fallen Wire",            parentId: 103, department: "DISCOM" },
  { id: 34, name: "Electricity Pole Damage",          parentId: 103, department: "DISCOM" },
  { id: 35, name: "Crime / Safety Issue",             parentId: 106, department: "DELHI_POLICE" },
  { id: 36, name: "Traffic Signal Problem",           parentId: 106, department: "TRAFFIC_POLICE" },
  { id: 37, name: "Illegal Parking",                  parentId: 106, department: "TRAFFIC_POLICE" },
  { id: 38, name: "Road Accident Black Spot",         parentId: 106, department: "TRAFFIC_POLICE" },
  { id: 39, name: "Illegal Tree Cutting",             parentId: 107, department: "FOREST_DEPT" },
  { id: 40, name: "Air Pollution / Burning",          parentId: 107, department: "DPCC" },
  { id: 41, name: "Noise Pollution",                  parentId: 107, department: "DPCC" },
  { id: 42, name: "Industrial Waste Dumping",         parentId: 107, department: "DPCC" },
];

const AUTHORITY_NAMES: Record<string, string> = {
  DMRC: "Delhi Metro Rail Corporation",
  NHAI: "National Highways Authority of India",
  PWD: "Public Works Department",
  MCD: "Municipal Corporation of Delhi",
  NDMC: "New Delhi Municipal Council",
  DJB: "Delhi Jal Board",
  DISCOM: "Electricity Distribution Company",
  DELHI_POLICE: "Delhi Police",
  TRAFFIC_POLICE: "Traffic Police",
  FOREST_DEPT: "Forest Department",
  DPCC: "Delhi Pollution Control Committee",
};

const parentMap = new Map(PARENT_CATEGORIES.map((p) => [p.id, p]));
const childMap = new Map(CHILD_CATEGORIES.map((c) => [c.id, c]));

function getGroupedResults(query: string) {
  const q = query.toLowerCase().trim();
  const matching = q
    ? CHILD_CATEGORIES.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (parentMap.get(c.parentId)?.name ?? "").toLowerCase().includes(q) ||
          c.department.toLowerCase().includes(q)
      )
    : CHILD_CATEGORIES;

  const groups: { parent: ParentCategory; children: ChildCategory[] }[] = [];
  const seen = new Set<number>();

  for (const child of matching) {
    if (!seen.has(child.parentId)) {
      seen.add(child.parentId);
      groups.push({
        parent: parentMap.get(child.parentId) ?? { id: child.parentId, name: "Other" },
        children: [],
      });
    }
    groups.find((g) => g.parent.id === child.parentId)!.children.push(child);
  }

  return groups;
}

/* ---------- severity mapping ---------- */
const SEVERITIES = [
  { label: "Low", value: "L1" as const },
  { label: "Medium", value: "L2" as const },
  { label: "High", value: "L3" as const },
  { label: "Critical", value: "L4" as const },
] as const;

/* ---------- Validation Badge Component ---------- */
function ValidationBadge({ isValid }: { isValid: boolean }) {
  if (isValid) {
    return (
      <span className="flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-500">
        <CheckCircle2 size={12} />
        done
      </span>
    );
  }
  return (
    <span className="text-[11px] font-medium text-red-500">
      *required
    </span>
  );
}

/* ---------- component ---------- */
export default function ManualReportForm() {
  const router = useRouter();

  const [lat, setLat] = useState(28.6139);
  const [lng, setLng] = useState(77.209);
  const [addressText, setAddressText] = useState("");
  const [geoLocating, setGeoLocating] = useState(false);
  const [mapFlyTarget, setMapFlyTarget] = useState<{ lat: number; lng: number } | null>(null);

  /* — nearby tickets map data — */
  const { visibleComplaints, updateRadius } = useNearbyTickets();
  const [mapRadius, setMapRadius] = useState(1000);

  useEffect(() => {
    updateRadius({ lat, lng }, mapRadius);
  }, [lat, lng, mapRadius, updateRadius]);

  /* — location search — */
  const [locQuery, setLocQuery] = useState("");
  const [locResults, setLocResults] = useState<{ display_name: string; lat: string; lon: string }[]>([]);
  const [locOpen, setLocOpen] = useState(false);
  const [locSearching, setLocSearching] = useState(false);
  const locWrapperRef = useRef<HTMLDivElement>(null);
  const locDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* — image — */
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  /* — form fields — */
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severityIdx, setSeverityIdx] = useState(0);

  /* — category search dropdown — */
  const [catQuery, setCatQuery] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const [catHighlight, setCatHighlight] = useState(-1);
  const catWrapperRef = useRef<HTMLDivElement>(null);
  const catInputRef = useRef<HTMLInputElement>(null);
  const catListRef = useRef<HTMLDivElement>(null);

  /* — submission — */
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{
    ticketId: string;
    complaintId: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* --- validation states --- */
  const isLocationValid = addressText.trim().length > 0 || mapFlyTarget !== null;
  const isImageValid = imageFile !== null;
  const isCategoryValid = selectedCategoryId !== null;
  const isTitleValid = title.trim().length > 0;
  const isDescValid = description.trim().length >= 10;
  const isSeverityValid = true;

  const isFormValid = isLocationValid && isImageValid && isCategoryValid && isTitleValid && isDescValid && isSeverityValid;


  /* --- auto-detect browser location on mount --- */
  useEffect(() => {
    if (!navigator.geolocation) return;
    setGeoLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setMapFlyTarget({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoLocating(false);
      },
      () => setGeoLocating(false),
      { timeout: 8000 }
    );
  }, []);

  /* --- close location search dropdown on outside click --- */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (locWrapperRef.current && !locWrapperRef.current.contains(e.target as Node)) {
        setLocOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* --- close category dropdown on outside click --- */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (catWrapperRef.current && !catWrapperRef.current.contains(e.target as Node)) {
        setCatOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* --- handlers --- */
  const handlePinMove = useCallback((newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
    setMapFlyTarget({ lat: newLat, lng: newLng });
  }, []);


  /* --- Nominatim location search (debounced) --- */
  const searchLocation = useCallback((query: string) => {
    if (locDebounceRef.current) clearTimeout(locDebounceRef.current);

    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 3) {
      setLocResults([]);
      setLocOpen(false);
      return;
    }

    /* "current location" shortcut */
    if (trimmed.toLowerCase() === "current location") {
      handleUseCurrentLocation();
      return;
    }

    locDebounceRef.current = setTimeout(async () => {
      setLocSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&format=json&addressdetails=1&limit=5`,
          { headers: { "User-Agent": "JanSamadhan/1.0" } }
        );
        const data = await res.json();
        setLocResults(data);
        setLocOpen(data.length > 0);
      } catch {
        setLocResults([]);
      } finally {
        setLocSearching(false);
      }
    }, 400);
  }, []);

  const handleSelectLocation = useCallback(
    (result: { display_name: string; lat: string; lon: string }) => {
      const newLat = parseFloat(result.lat);
      const newLng = parseFloat(result.lon);
      setLat(newLat);
      setLng(newLng);
      setMapFlyTarget({ lat: newLat, lng: newLng });
      setAddressText(result.display_name);
      setLocQuery("");
      setLocOpen(false);
      setLocResults([]);
    },
    []
  );

  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setGeoLocating(true);
    setLocQuery("");
    setLocOpen(false);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        setLat(newLat);
        setLng(newLng);
        setMapFlyTarget({ lat: newLat, lng: newLng });
        setGeoLocating(false);

        /* reverse geocode to auto-fill address */
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${newLat}&lon=${newLng}&format=json`,
            { headers: { "User-Agent": "JanSamadhan/1.0" } }
          );
          const data = await res.json();
          if (data?.display_name) {
            setAddressText(data.display_name);
          }
        } catch {
          /* non-fatal — address stays empty */
        }
      },
      () => setGeoLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const selectedCategory = selectedCategoryId != null ? childMap.get(selectedCategoryId) ?? null : null;

  const handleSelectCategory = useCallback((child: ChildCategory) => {
    setSelectedCategoryId(child.id);
    setCatQuery("");
    setCatOpen(false);
    setCatHighlight(-1);
  }, []);

  const catGroups = getGroupedResults(catQuery);
  const flatFiltered = catGroups.flatMap((g) => g.children);

  const handleCatKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!catOpen) {
        if (e.key === "ArrowDown" || e.key === "Enter") {
          setCatOpen(true);
          e.preventDefault();
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCatHighlight((prev) => Math.min(prev + 1, flatFiltered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCatHighlight((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (catHighlight >= 0 && catHighlight < flatFiltered.length) {
          handleSelectCategory(flatFiltered[catHighlight]);
        }
      } else if (e.key === "Escape") {
        setCatOpen(false);
        catInputRef.current?.blur();
      }
    },
    [catOpen, catHighlight, flatFiltered, handleSelectCategory]
  );

  /* scroll highlighted item into view */
  useEffect(() => {
    if (catHighlight < 0 || !catListRef.current) return;
    const el = catListRef.current.querySelector(`[data-idx="${catHighlight}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [catHighlight]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    },
    []
  );

  const removeImage = useCallback(() => {
    setImageFile(null);
    setImagePreview(null);
  }, []);

  /* --- submit --- */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!isFormValid) {
        return;
      }

      setSubmitting(true);


      try {
        /* 1. auth */
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setError("You must be logged in to submit a complaint.");
          setSubmitting(false);
          return;
        }

        /* 2. optional image upload */
        let photoUrls: string[] = [];
        if (imageFile) {
          const ext = imageFile.name.split(".").pop() ?? "jpg";
          const filePath = `complaints/${crypto.randomUUID()}.${ext}`;
          const { error: uploadErr } = await supabase.storage
            .from("complaint-photos")
            .upload(filePath, imageFile, {
              contentType: imageFile.type,
              upsert: false,
            });
          if (uploadErr) {
            setError(`Image upload failed: ${uploadErr.message}`);
            setSubmitting(false);
            return;
          }
          const {
            data: { publicUrl },
          } = supabase.storage
            .from("complaint-photos")
            .getPublicUrl(filePath);
          photoUrls = [publicUrl];
        }

        /* 3. build ticket id fallback */
        const ticketId = `CMP-${Date.now().toString().slice(-8)}-${Math.floor(
          Math.random() * 1000
        )
          .toString()
          .padStart(3, "0")}`;

        const {
          data: { session },
        } = await supabase.auth.getSession();
        const accessToken = session?.access_token ?? "";

        /* 4. insert via API route to trigger email notification */
        const cat = childMap.get(selectedCategoryId)!;
        const sev = SEVERITIES[severityIdx];

        const res = await fetch("/api/complaints", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            citizen_id: user.id,
            category_id: cat.id,
            title: title.trim(),
            description: description.trim(),
            severity: sev.value,
            latitude: lat,
            longitude: lng,
            address_text: addressText.trim() || `Lat ${lat.toFixed(6)}, Lng ${lng.toFixed(6)}`,
            city: "Delhi",
            photo_urls: photoUrls,
            force_submit: true, // Manual form submissions are explicit
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Failed to submit complaint.");
          setSubmitting(false);
          return;
        }

        const complaint = data.complaint;

        setSuccess({
          ticketId: complaint.ticket_id || ticketId,
          complaintId: complaint.id,
        });

      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong."
        );
      } finally {
        setSubmitting(false);
      }
    },
    [title, description, lat, lng, addressText, selectedCategoryId, severityIdx, imageFile, isFormValid]
  );


  /* ===================== SUCCESS STATE ===================== */
  if (success) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center lg:max-w-5xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <CheckCircle2 size={32} className="text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Complaint submitted successfully!
        </h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Your ticket ID:{" "}
          <span className="font-semibold text-[#C9A84C]">
            {success.ticketId}
          </span>
        </p>
        <button
          type="button"
          onClick={() => router.push("/citizen/tickets")}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#C9A84C] px-6 py-3 text-sm font-semibold text-black shadow-md transition-colors hover:bg-[#b8993f]"
        >
          View Your Tickets
        </button>
      </div>
    );
  }

  /* ===================== FORM ===================== */
  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6 sm:px-6 lg:max-w-none xl:max-w-[90%] 2xl:max-w-6xl"
    >
      {/* ---------- SECTION 1 — Location ---------- */}
      <fieldset className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-[#2a2a2a] dark:bg-[#1a1a1a]">
        <legend className="flex w-full items-center justify-between px-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-[#C9A84C]" />
            Location
          </div>
          <ValidationBadge isValid={isLocationValid} />
        </legend>


        {/* search bar + current location button */}
        <div className="mb-3 flex gap-2">
          <div ref={locWrapperRef} className="relative flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search location or type 'current location'"
              value={locQuery}
              onChange={(e) => {
                setLocQuery(e.target.value);
                searchLocation(e.target.value);
              }}
              onFocus={() => { if (locResults.length > 0) setLocOpen(true); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (locResults.length > 0) {
                    handleSelectLocation(locResults[0]);
                  } else if (locQuery.trim().toLowerCase() === "current location") {
                    handleUseCurrentLocation();
                  }
                }
              }}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-800 placeholder-gray-400 outline-none transition-colors focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/40 dark:border-[#2a2a2a] dark:bg-[#252525] dark:text-gray-100 dark:placeholder-gray-500"
            />
            {locSearching && (
              <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[#C9A84C]" />
            )}

            {/* search results dropdown */}
            {locOpen && locResults.length > 0 && (
              <div className="absolute z-[1000] mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
                {locResults.map((r, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectLocation(r)}
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-[#2a2a2a]"
                  >
                    <MapPin size={14} className="mt-0.5 shrink-0 text-[#C9A84C]" />
                    <span className="line-clamp-2">{r.display_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* coordinate bar */}
        <div className="mb-3 flex items-center justify-end gap-2 text-xs text-gray-500 dark:text-gray-400">
          {geoLocating && (
            <span className="flex items-center gap-1 text-[#C9A84C]">
              <Loader2 size={12} className="animate-spin" /> Detecting…
            </span>
          )}
        </div>

        {/* Leaflet map + floating button */}
        <div className="relative z-10 rounded-lg overflow-hidden border border-gray-200 dark:border-[#2a2a2a]">
          <NearbyTicketsMap 
            complaints={visibleComplaints}
            selectedId={null}
            flyTarget={mapFlyTarget || (geoLocating ? { lat, lng } : null)} // Smooth fly on detect or explicit mapFlyTarget
            userLocation={null} // Don't show the blue user dot, we want reportLocation pin
            radiusMeters={mapRadius}
            onRadiusChange={setMapRadius}
            onMarkerClick={() => {}}
            reportLocation={{ lat, lng }}
            onReportLocationMove={handlePinMove}
            customHeight="280px"
            hideCollapse={true}
            onRecenterClick={handleUseCurrentLocation}
          />
        </div>

        {/* address text input */}
        <input
          type="text"
          placeholder="Address / landmark (optional)"
          value={addressText}
          onChange={(e) => setAddressText(e.target.value)}
          className="mt-3 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 outline-none transition-colors focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/40 dark:border-[#2a2a2a] dark:bg-[#252525] dark:text-gray-100 dark:placeholder-gray-500"
        />
      </fieldset>

      {/* ---------- SECTION 2 — Upload Evidence ---------- */}
      <fieldset className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-[#2a2a2a] dark:bg-[#1a1a1a]">
        <legend className="flex w-full items-center justify-between px-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-[#C9A84C]" />
            Upload Evidence
          </div>
          <ValidationBadge isValid={isImageValid} />
        </legend>


        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {imagePreview ? (
          <div className="relative inline-block">
            <img
              src={imagePreview}
              alt="Evidence preview"
              className="h-36 w-auto rounded-lg border border-gray-200 object-cover dark:border-[#2a2a2a]"
            />
            <button
              type="button"
              onClick={removeImage}
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-md transition-colors hover:bg-red-600"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 py-8 text-sm text-gray-500 transition-colors hover:border-[#C9A84C] hover:text-[#C9A84C] dark:border-[#333] dark:bg-[#1e1e1e] dark:text-gray-400 dark:hover:border-[#C9A84C]"
          >
            <Upload size={24} />
            <span>Click to upload a photo of the issue</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              JPEG, PNG — max 5 MB
            </span>
          </button>
        )}
      </fieldset>

      {/* ---------- SECTION 3 — Category (searchable) ---------- */}
      <fieldset className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-[#2a2a2a] dark:bg-[#1a1a1a]">
        <legend className="flex w-full items-center justify-between px-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <span>Issue Category</span>
          <ValidationBadge isValid={isCategoryValid} />
        </legend>


        <div ref={catWrapperRef} className="relative">
          {/* search input */}
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={catInputRef}
              type="text"
              placeholder={selectedCategory ? selectedCategory.name : "Search categories…"}
              value={catQuery}
              onChange={(e) => {
                setCatQuery(e.target.value);
                setCatOpen(true);
                setCatHighlight(-1);
              }}
              onFocus={() => setCatOpen(true)}
              onKeyDown={handleCatKeyDown}
              className={`w-full rounded-lg border bg-gray-50 py-2.5 pl-9 pr-9 text-sm outline-none transition-colors focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/40 dark:bg-[#252525] ${
                selectedCategory && !catQuery
                  ? "border-[#C9A84C]/50 text-gray-800 dark:border-[#C9A84C]/30 dark:text-gray-100"
                  : "border-gray-200 text-gray-800 placeholder-gray-400 dark:border-[#2a2a2a] dark:text-gray-100 dark:placeholder-gray-500"
              }`}
            />
            <ChevronDown
              size={16}
              className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-transform ${catOpen ? "rotate-180" : ""}`}
            />
          </div>

          {/* dropdown panel */}
          {catOpen && (
            <div
              ref={catListRef}
              className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-[#2a2a2a] dark:bg-[#1e1e1e]"
            >
              {catGroups.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-gray-400 dark:text-gray-500">No categories match your search.</p>
              ) : (
                catGroups.map((group) => {
                  /* compute flat index offset for this group */
                  let groupStartIdx = 0;
                  for (const g of catGroups) {
                    if (g.parent.id === group.parent.id) break;
                    groupStartIdx += g.children.length;
                  }
                  return (
                    <div key={group.parent.id}>
                      <p className="sticky top-0 z-10 bg-gray-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-[#252525] dark:text-gray-400">
                        {group.parent.name}
                      </p>
                      {group.children.map((child, localIdx) => {
                        const flatIdx = groupStartIdx + localIdx;
                        const isHighlighted = flatIdx === catHighlight;
                        const isSelected = child.id === selectedCategoryId;
                        return (
                          <button
                            key={child.id}
                            type="button"
                            data-idx={flatIdx}
                            onClick={() => handleSelectCategory(child)}
                            className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                              isHighlighted
                                ? "bg-[#C9A84C]/10 text-gray-900 dark:text-gray-100"
                                : isSelected
                                  ? "bg-[#C9A84C]/5 text-[#C9A84C] dark:text-[#C9A84C]"
                                  : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-[#2a2a2a]"
                            }`}
                          >
                            <span className="pl-2">• {child.name}</span>
                            <span className="ml-2 shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-[#333] dark:text-gray-400">
                              {child.department}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* authority routing preview */}
        {selectedCategory ? (
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            Complaint will be routed to:{" "}
            <span className="font-medium text-[#C9A84C]">
              {AUTHORITY_NAMES[selectedCategory.department] ?? selectedCategory.department}
            </span>
          </p>
        ) : (
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            Type to search from 42 civic issue categories.
          </p>
        )}
      </fieldset>

      {/* ---------- SECTION 4 — Complaint Details ---------- */}
      <fieldset className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-[#2a2a2a] dark:bg-[#1a1a1a]">
        <legend className="px-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          Complaint Details
        </legend>

        <div>
          <div className="flex w-full items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Title</label>
            <ValidationBadge isValid={isTitleValid} />
          </div>
          <input
            type="text"
            placeholder="Issue Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none transition-colors focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/40 dark:border-[#2a2a2a] dark:bg-[#252525] dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>

        <div>
          <div className="flex w-full items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Description</label>
            <ValidationBadge isValid={isDescValid} />
          </div>
          <textarea
            placeholder="Describe the issue in detail (minimum 10 characters)..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            minLength={10}
            className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm leading-relaxed text-gray-800 placeholder-gray-400 outline-none transition-colors focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/40 dark:border-[#2a2a2a] dark:bg-[#252525] dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>
      </fieldset>


      {/* ---------- SECTION 5 — Severity ---------- */}
      <fieldset className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-[#2a2a2a] dark:bg-[#1a1a1a]">
        <legend className="flex w-full items-center justify-between px-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <span>Severity</span>
          <ValidationBadge isValid={isSeverityValid} />
        </legend>


        <div className="relative">
          <select
            value={severityIdx}
            onChange={(e) => setSeverityIdx(Number(e.target.value))}
            className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 pr-9 text-sm text-gray-800 outline-none transition-colors focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C]/40 dark:border-[#2a2a2a] dark:bg-[#252525] dark:text-gray-100"
          >
            {SEVERITIES.map((s, idx) => (
              <option key={s.value} value={idx}>
                {s.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
        </div>
      </fieldset>

      {/* ---------- SECTION 6 — Submit ---------- */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!isFormValid || submitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#C9A84C] px-6 py-3.5 text-sm font-semibold text-black shadow-md transition-colors hover:bg-[#b8993f] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Submitting…
          </>
        ) : (
          "Submit Complaint"
        )}
      </button>
    </form>
  );
}
