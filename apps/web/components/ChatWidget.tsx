"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Loader2, Plus } from "lucide-react";
import gsap from "gsap";
import { sendToGemini } from "@/lib/gemini";
import type { ChatMessage, ExtractedComplaint, GeminiResponse } from "@/lib/gemini";
import { supabase } from "@/src/lib/supabase";
import LocationPinPicker from "@/components/LocationPinPicker";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DisplayMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  /** Optional image data-url shown in the bubble */
  imageUrl?: string;
  /** If the bot message carries a complaint extraction */
  extracted?: ExtractedComplaint | null;
  /** Image-based ticket preview from FastAPI /analyze */
  imagePreview?: ImageTicketPreview | null;
}

/** Shape of the /analyze response from FastAPI */
interface ImageTicketPreview {
  child_id: number;
  issue_name: string;
  parent_id: number;
  authority: string;
  title: string;
  description: string;
  severity: string;
  severity_db: string;
  status: string;
  ward_name: string;
  pincode: string;
  digipin: string;
  locality: string;
  city: string;
  district: string;
  state: string;
  formatted_address: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: string;
  user_text: string;
  confirm_prompt: string;
}

interface DeviceLocation {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: string;
}

const ISSUE_TYPE_CATEGORY_MAP: Array<{ keywords: string[]; categoryId: number }> = [
  { keywords: ["metro", "station", "escalator", "lift"], categoryId: 1 },
  { keywords: ["highway", "expressway", "toll", "bridge", "road", "pothole", "flyover"], categoryId: 11 },
  { keywords: ["garbage", "waste", "trash", "sweeping", "toilet"], categoryId: 16 },
  { keywords: ["drain", "sewage", "sewer", "water", "leak", "pipeline"], categoryId: 27 },
  { keywords: ["street light", "light", "electricity", "power", "wire", "transformer"], categoryId: 25 },
  { keywords: ["traffic", "signal", "parking", "accident"], categoryId: 36 },
  { keywords: ["crime", "safety", "theft", "harassment"], categoryId: 35 },
  { keywords: ["air", "noise", "pollution", "burning"], categoryId: 40 },
];

function categoryFromIssueType(issueType: string): number {
  const normalized = issueType.toLowerCase();
  const match = ISSUE_TYPE_CATEGORY_MAP.find(({ keywords }) =>
    keywords.some((keyword) => normalized.includes(keyword)),
  );
  return match?.categoryId ?? 15;
}

function severityToLevel(severity: string): "L1" | "L2" | "L3" | "L4" {
  const normalized = severity.trim().toLowerCase();
  if (normalized === "critical" || normalized === "l4") return "L4";
  if (normalized === "high" || normalized === "l3") return "L3";
  if (normalized === "medium" || normalized === "l2") return "L2";
  return "L1";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ChatWidget() {
  /* ----- state ----- */
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingComplaint, setPendingComplaint] = useState<ExtractedComplaint | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<ImageTicketPreview | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingLocation, setPendingLocation] = useState<DeviceLocation | null>(null);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  /* ----- refs ----- */
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ----- conversation history for Gemini (role: user | model) ----- */
  const historyRef = useRef<ChatMessage[]>([]);

  /* ----- helpers ----- */
  const uid = () => Math.random().toString(36).slice(2, 10);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  /** Get browser geolocation and keep strict location metadata with fallback. */
  const getLocation = (): Promise<DeviceLocation> =>
    new Promise((resolve) => {
      const now = new Date().toISOString();
      if (!navigator.geolocation) {
        resolve({ lat: 28.6139, lng: 77.209, accuracy: 10000, timestamp: now });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : 9999,
            timestamp: new Date(pos.timestamp).toISOString(),
          }),
        () => resolve({ lat: 28.6139, lng: 77.209, accuracy: 10000, timestamp: now }),
        { timeout: 8000 },
      );
    });

  /** Get Supabase auth token */
  const getAuthToken = async (): Promise<string | null> => {
    // First check if user is actually authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    
    // Then get the session for the access token
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
    
    // Fallback: try refreshing the session
    const { data: refreshData } = await supabase.auth.refreshSession();
    return refreshData.session?.access_token ?? null;
  };

  /* ----- open / close with GSAP ----- */
  const openChat = useCallback(() => {
    setIsOpen(true);
    requestAnimationFrame(() => {
      if (panelRef.current) {
        gsap.fromTo(
          panelRef.current,
          { scale: 0.85, opacity: 0, y: 30 },
          { scale: 1, opacity: 1, y: 0, duration: 0.3, ease: "back.out(1.4)" },
        );
      }

      // Initial greeting if first open
      if (messages.length === 0) {
        addBotMessage(
          "Namaste! 🙏 I'm **JanSamadhan AI**.\nTell me about a civic issue you'd like to report — or tap the **+** button to upload a photo of the problem!",
        );
      }

      inputRef.current?.focus();
    });
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeChat = useCallback(() => {
    if (panelRef.current) {
      gsap.to(panelRef.current, {
        scale: 0.85,
        opacity: 0,
        y: 30,
        duration: 0.2,
        ease: "power2.in",
        onComplete: () => setIsOpen(false),
      });
    } else {
      setIsOpen(false);
    }
  }, []);

  /* ----- message helpers ----- */
  const addBotMessage = useCallback(
    (text: string, extra?: { extracted?: ExtractedComplaint | null; imagePreview?: ImageTicketPreview | null }) => {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "bot", text, extracted: extra?.extracted, imagePreview: extra?.imagePreview },
      ]);
      setTimeout(scrollToBottom, 80);
    },
    [scrollToBottom],
  );

  /* ----- IMAGE UPLOAD: + button handler ----- */
  const handleImageSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || isLoading) return;
      // Reset file input so same file can be re-selected
      e.target.value = "";

      // Create a data URL preview
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;

        // Show user message with image thumbnail
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "user", text: "📷 Uploaded a photo for analysis", imageUrl: dataUrl },
        ]);
        scrollToBottom();

        setIsLoading(true);
        try {
          const token = await getAuthToken();
          if (!token) {
            addBotMessage("⚠️ You must be logged in to upload photos. Please log in and try again.");
            setIsLoading(false);
            return;
          }

          const { lat, lng, accuracy, timestamp } = await getLocation();

          // Build FormData for FastAPI /analyze
          const formData = new FormData();
          formData.append("image", file);
          formData.append("user_text", input.trim() || "Please analyze this civic issue");
          formData.append("latitude", lat.toString());
          formData.append("longitude", lng.toString());
          formData.append("accuracy", accuracy.toString());
          formData.append("timestamp", timestamp);

          const res = await fetch(`${API_URL}/analyze`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: "Analysis failed" }));
            throw new Error(err.detail || "Failed to analyze image");
          }

          const preview: ImageTicketPreview = await res.json();

          // Store for confirmation
          setPendingImagePreview(preview);
          setPendingImageFile(file);
          setPendingComplaint(null); // clear any text-based pending
          setPendingLocation({
            lat: preview.latitude,
            lng: preview.longitude,
            accuracy: preview.accuracy,
            timestamp: preview.timestamp,
          });
          setLocationConfirmed(false);

          addBotMessage(preview.confirm_prompt, { imagePreview: preview });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Image analysis failed";
          addBotMessage(`⚠️ ${msg}`);
        } finally {
          setIsLoading(false);
          setInput("");
        }
      };
      reader.readAsDataURL(file);
    },
    [isLoading, input, scrollToBottom, addBotMessage], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /* ----- send a user message ----- */
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setInput("");

    // If the user typed YES and we have a pending image preview → confirm via FastAPI
    if (pendingImagePreview && /^(yes|confirm|submit|haan|ha|हां)$/i.test(trimmed)) {
      if (!locationConfirmed || !pendingLocation) {
        addBotMessage("📍 Please confirm your location first. You can move the pin and then tap **Confirm location**.");
        return;
      }
      setMessages((prev) => [...prev, { id: uid(), role: "user", text: trimmed }]);
      scrollToBottom();
      await confirmImageTicket();
      return;
    }

    // If the user typed YES and we have a pending text-based complaint
    if (pendingComplaint && /^(yes|confirm|submit|haan|ha|हां)$/i.test(trimmed)) {
      if (!locationConfirmed || !pendingLocation) {
        addBotMessage("📍 Please confirm your location first. You can move the pin and then tap **Confirm location**.");
        return;
      }
      setMessages((prev) => [...prev, { id: uid(), role: "user", text: trimmed }]);
      scrollToBottom();
      await submitComplaint();
      return;
    }

    // Regular message
    setMessages((prev) => [...prev, { id: uid(), role: "user", text: trimmed }]);
    scrollToBottom();
    historyRef.current.push({ role: "user", text: trimmed });

    setIsLoading(true);
    try {
      const res: GeminiResponse = await sendToGemini(historyRef.current);
      historyRef.current.push({ role: "model", text: res.reply });

      if (res.extracted) {
        setPendingComplaint(res.extracted);
        setPendingImagePreview(null);
        const currentLocation = await getLocation();
        setPendingLocation(currentLocation);
        setLocationConfirmed(false);
      }

      addBotMessage(res.reply, { extracted: res.extracted });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      addBotMessage(`⚠️ ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, pendingComplaint, pendingImagePreview, scrollToBottom, addBotMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- confirm image ticket via FastAPI /confirm ----- */
  const confirmImageTicket = useCallback(async () => {
    if (!pendingImagePreview || !pendingImageFile) return;
    setSubmitting(true);

    try {
      const token = await getAuthToken();
      if (!token) {
        addBotMessage("⚠️ You must be logged in to submit a complaint. Please log in and try again.");
        setSubmitting(false);
        return;
      }

      const formData = new FormData();
      const submitLocation = pendingLocation ?? {
        lat: pendingImagePreview.latitude,
        lng: pendingImagePreview.longitude,
        accuracy: pendingImagePreview.accuracy,
        timestamp: pendingImagePreview.timestamp,
      };
      formData.append("image", pendingImageFile);
      formData.append("user_text", "Confirmed by user");
      formData.append("latitude", submitLocation.lat.toString());
      formData.append("longitude", submitLocation.lng.toString());
      formData.append("accuracy", submitLocation.accuracy.toString());
      formData.append("timestamp", submitLocation.timestamp);
      formData.append("child_id", pendingImagePreview.child_id.toString());
      formData.append("title", pendingImagePreview.title);
      formData.append("description", pendingImagePreview.description);
      formData.append("severity_db", pendingImagePreview.severity_db);

      const res = await fetch(`${API_URL}/confirm`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Submission failed" }));
        throw new Error(err.detail || "Failed to submit complaint");
      }

      const created = await res.json();

      setSubmitted(true);
      setPendingImagePreview(null);
      setPendingImageFile(null);
      setPendingLocation(null);
      setLocationConfirmed(false);
      addBotMessage(
        `✅ **Complaint submitted successfully!**\n\n🎫 Ticket ID: **${created.ticket_id}**\n📋 Issue: **${created.issue_name}**\n🏢 Department: **${created.authority}**\nStatus: **Submitted**\n\nYou can track your complaint from the "Your Tickets" section. Is there anything else I can help you with?`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submission failed";
      addBotMessage(`❌ ${msg}. Please try again or contact support.`);
    } finally {
      setSubmitting(false);
    }
  }, [pendingImagePreview, pendingImageFile, addBotMessage]);

  /* ----- submit text-based complaint to Supabase ----- */
  const submitComplaint = useCallback(async () => {
    if (!pendingComplaint) return;
    setSubmitting(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        addBotMessage("⚠️ You must be logged in to submit a complaint. Please log in and try again.");
        setSubmitting(false);
        return;
      }

      const submitLocation = pendingLocation ?? (await getLocation());
      const categoryId = categoryFromIssueType(pendingComplaint.issue_type);
      const severityLevel = severityToLevel(pendingComplaint.severity);

      const res = await fetch("/api/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          citizen_id: user.id,
          category_id: categoryId,
          issue_type: pendingComplaint.issue_type,
          title: pendingComplaint.title,
          description: pendingComplaint.description,
          severity: severityLevel,
          latitude: submitLocation.lat,
          longitude: submitLocation.lng,
          accuracy: submitLocation.accuracy,
          timestamp: submitLocation.timestamp,
          city: "Delhi",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit complaint");
      }

      setSubmitted(true);
      setPendingComplaint(null);
      setPendingLocation(null);
      setLocationConfirmed(false);
      addBotMessage(
        `✅ **Complaint submitted successfully!**\n\n🎫 Ticket ID: **${data.complaint?.ticket_id ?? data.complaint?.id}**\nStatus: **Submitted**\n\nYou can track your complaint from the "Your Tickets" section. Is there anything else I can help you with?`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submission failed";
      addBotMessage(`❌ ${msg}. Please try again or contact support.`);
    } finally {
      setSubmitting(false);
    }
  }, [pendingComplaint, addBotMessage]);

  /* ----- auto-scroll on new messages ----- */
  useEffect(scrollToBottom, [messages, scrollToBottom]);

  /* ----- keyboard enter ----- */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  const hasPending = !!(pendingComplaint || pendingImagePreview);

  return (
    <>
      {/* Hidden file input for image capture/upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleImageSelect}
        className="hidden"
      />

      {/* ---- Floating Action Button ---- */}
      {!isOpen && (
        <button
          ref={fabRef}
          onClick={openChat}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#4f392e] text-white shadow-lg transition-transform hover:scale-110 active:scale-95 dark:bg-purple-600"
          aria-label="Open chat assistant"
        >
          <MessageCircle size={26} />
        </button>
      )}

      {/* ---- Chat Panel ---- */}
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed bottom-6 right-6 z-50 flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
          style={{ width: 380, height: 520, maxHeight: "85vh", maxWidth: "calc(100vw - 2rem)" }}
        >
          {/* -- Header -- */}
          <div className="flex items-center justify-between bg-[#4f392e] px-4 py-3 text-white dark:bg-purple-800">
            <div className="flex items-center gap-2">
              <MessageCircle size={20} />
              <span className="font-semibold text-sm">JanSamadhan AI Assistant</span>
            </div>
            <button
              onClick={closeChat}
              className="rounded-full p-1 transition-colors hover:bg-white/20"
              aria-label="Close chat"
            >
              <X size={18} />
            </button>
          </div>

          {/* -- Messages -- */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "rounded-br-sm bg-[#b4725a] text-white dark:bg-purple-600"
                      : "rounded-bl-sm bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100"
                  }`}
                >
                  {/* User-uploaded image thumbnail */}
                  {msg.imageUrl && (
                    <img
                      src={msg.imageUrl}
                      alt="Uploaded issue"
                      className="mb-2 rounded-lg max-h-40 w-full object-cover"
                    />
                  )}

                  {renderMarkdown(msg.text)}

                  {/* Text-based extracted complaint summary table */}
                  {msg.extracted && (
                    <div className="mt-3 rounded-lg border border-gray-300 bg-white p-3 text-xs dark:border-gray-600 dark:bg-gray-900">
                      <p className="mb-2 font-semibold text-gray-700 dark:text-gray-200">📋 Complaint Summary</p>
                      <table className="w-full text-left">
                        <tbody>
                          {[
                            ["Title", msg.extracted.title],
                            ["Issue Type", msg.extracted.issue_type],
                            ["Severity", msg.extracted.severity],
                            ["Description", msg.extracted.description],
                            ["Confidence", `${Math.round(msg.extracted.confidence * 100)}%`],
                          ].map(([label, value]) => (
                            <tr key={label} className="border-b border-gray-100 last:border-0 dark:border-gray-700">
                              <td className="py-1 pr-2 font-medium text-gray-500 dark:text-gray-400">{label}</td>
                              <td className="py-1 text-gray-800 dark:text-gray-200">{value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-2 text-center text-[11px] text-gray-500 dark:text-gray-400">
                        Type <strong>YES</strong> to submit, or tell me what to change.
                      </p>
                    </div>
                  )}

                  {/* Image-based ticket preview from FastAPI /analyze */}
                  {msg.imagePreview && (
                    <div className="mt-3 rounded-lg border border-gray-300 bg-white p-3 text-xs dark:border-gray-600 dark:bg-gray-900">
                      <p className="mb-2 font-semibold text-gray-700 dark:text-gray-200">📷 Image Analysis Result</p>
                      <table className="w-full text-left">
                        <tbody>
                          {[
                            ["Title", msg.imagePreview.title],
                            ["Issue", msg.imagePreview.issue_name],
                            ["Severity", `${msg.imagePreview.severity} (${msg.imagePreview.severity_db})`],
                            ["Ward", msg.imagePreview.ward_name],
                            ["Pincode", msg.imagePreview.pincode],
                            ["DIGIPIN", msg.imagePreview.digipin],
                            ["Authority", msg.imagePreview.authority],
                          ].map(([label, value]) => (
                            <tr key={label} className="border-b border-gray-100 last:border-0 dark:border-gray-700">
                              <td className="py-1 pr-2 font-medium text-gray-500 dark:text-gray-400">{label}</td>
                              <td className="py-1 text-gray-800 dark:text-gray-200">{value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-1 text-gray-600 dark:text-gray-300">{msg.imagePreview.description}</p>
                      <p className="mt-2 text-center text-[11px] text-gray-500 dark:text-gray-400">
                        Type <strong>YES</strong> to submit this ticket, or describe the issue differently.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2 dark:bg-gray-800">
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
                  <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
                </div>
              </div>
            )}

            {/* Submitting state */}
            {submitting && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  <Loader2 size={16} className="animate-spin" /> Submitting your complaint…
                </div>
              </div>
            )}
          </div>

          {/* -- Input bar -- */}
          <div className="border-t border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
            {hasPending && pendingLocation && (
              <div className="mb-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Detected location</p>
                <p className="mb-2 text-[11px] text-gray-600 dark:text-gray-300">
                  Lat {pendingLocation.lat.toFixed(6)}, Lng {pendingLocation.lng.toFixed(6)} | Accuracy {Math.round(pendingLocation.accuracy)}m
                </p>
                <LocationPinPicker
                  lat={pendingLocation.lat}
                  lng={pendingLocation.lng}
                  onPinMove={(lat, lng) => {
                    setPendingLocation((prev) => ({
                      lat,
                      lng,
                      accuracy: prev?.accuracy ?? 9999,
                      timestamp: new Date().toISOString(),
                    }));
                    setLocationConfirmed(false);
                  }}
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLocationConfirmed(true)}
                    className="rounded-md bg-[#4f392e] px-2 py-1 text-xs font-medium text-white hover:bg-[#b4725a]"
                  >
                    Confirm location
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const loc = await getLocation();
                      setPendingLocation(loc);
                      setLocationConfirmed(false);
                    }}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Move pin to GPS
                  </button>
                  <span className={`text-[11px] ${locationConfirmed ? "text-green-600" : "text-amber-600"}`}>
                    {locationConfirmed ? "Location confirmed" : "Move pin if needed, then confirm"}
                  </span>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              {/* + button for image upload */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || submitting}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:bg-[#b4725a] hover:text-white hover:border-[#b4725a] disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-purple-600 dark:hover:text-white dark:hover:border-purple-600"
                aria-label="Upload photo"
                title="Upload a photo of the issue"
              >
                <Plus size={18} />
              </button>

              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={hasPending ? "Confirm location, then type YES to submit…" : "Describe your issue…"}
                disabled={submitting}
                className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-[#b4725a] dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-purple-500"
              />
              <button
                onClick={handleSend}
                disabled={isLoading || submitting || !input.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4f392e] text-white transition-colors hover:bg-[#b4725a] disabled:opacity-40 dark:bg-purple-600 dark:hover:bg-purple-500"
                aria-label="Send message"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Very lightweight Markdown renderer (bold only)                     */
/* ------------------------------------------------------------------ */

function renderMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}
