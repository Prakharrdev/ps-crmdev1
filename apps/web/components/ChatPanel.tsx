"use client";

import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { Mic, MicOff, Send, Plus, MapPin, CheckCircle2, ChevronDown, ChevronUp, Image as ImageIcon, Loader2, RefreshCw, X, Globe } from "lucide-react";
import gsap from "gsap";
import { sendToGemini } from "@/lib/gemini";
import type { ChatMessage, ExtractedComplaint, GeminiResponse } from "@/lib/gemini";
import { supabase } from "@/src/lib/supabase";
import type { PostgrestError } from "@supabase/supabase-js";
import { saveSharedState, getSharedState, clearSharedState } from "../lib/db";
import dynamic from "next/dynamic";

const LocationPinPicker = dynamic(() => import("@/components/LocationPinPicker"), {
  ssr: false,
  loading: () => (
    <div className="h-40 w-full rounded-lg border border-gray-200 dark:border-[#2a2a2a] bg-gray-100 dark:bg-[#1e1e1e] flex items-center justify-center text-xs text-gray-400">
      Loading map…
    </div>
  ),
});

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.jansamadhan.perkkk.dev";

function toUserFacingError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  if (/failed to fetch|networkerror|network request failed/i.test(message)) {
    return `Could not reach complaint API at ${API_URL}. If you are running locally, start FastAPI on port 8000 or set NEXT_PUBLIC_API_URL.`;
  }
  return message;
}

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
  /** Reverse-geocoded details for text-based complaints */
  geoDetails?: GeoDetails | null;
}

interface GeoDetails {
  pincode: string;
  locality: string;
  city: string;
  district: string;
  state: string;
  formatted_address: string;
  digipin: string;
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
  confidence: number;
  user_text: string;
  confirm_prompt: string;
}

interface DuplicateMatch {
  id: string;
  ticket_id: string;
  title: string;
  status: string;
  created_at: string;
  distance_m: number;
}

interface DuplicateContext {
  mode: "image" | "text";
  duplicate: DuplicateMatch;
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
/*  Language Configuration                                             */
/* ------------------------------------------------------------------ */

const SUPPORTED_LANGUAGES = [
  { code: "hi-IN", name: "हिन्दी (Hindi)", label: "Hindi" },
  { code: "en-IN", name: "English", label: "English" },
  { code: "ta-IN", name: "தமிழ் (Tamil)", label: "Tamil" },
  { code: "te-IN", name: "తెలుగు (Telugu)", label: "Telugu" },
  { code: "kn-IN", name: "ಕನ್ನಡ (Kannada)", label: "Kannada" },
  { code: "ml-IN", name: "മലയാളം (Malayalam)", label: "Malayalam" },
  { code: "bn-IN", name: "বাংলা (Bengali)", label: "Bengali" },
  { code: "mr-IN", name: "मराठी (Marathi)", label: "Marathi" },
  { code: "gu-IN", name: "ગુજરાતી (Gujarati)", label: "Gujarati" },
  { code: "pa-IN", name: "ਪੰਜਾਬੀ (Punjabi)", label: "Punjabi" },
] as const;

const CONFIRMATION_PATTERNS: Record<string, RegExp> = {
  "hi-IN": /^(हां|हा|जी|yes|confirm|submit|haan|ha)$/i,
  "ta-IN": /^(ஆம்|ஆ|yes|confirm|submit)$/i,
  "te-IN": /^(అవు|అ|yes|confirm|submit)$/i,
  "kn-IN": /^(ಹೌದು|ಹೆ|yes|confirm|submit)$/i,
  "ml-IN": /^(അതെ|അ|yes|confirm|submit)$/i,
  "bn-IN": /^(হ্যাঁ|হ|yes|confirm|submit)$/i,
  "mr-IN": /^(हो|होय|yes|confirm|submit)$/i,
  "gu-IN": /^(હો|હા|yes|confirm|submit)$/i,
  "pa-IN": /^(ਹਾਂ|ਹੀ|yes|confirm|submit)$/i,
  "default": /^(yes|confirm|submit|haan|ha|हां)$/i,
};

const REJECTION_PATTERNS: Record<string, RegExp> = {
  "hi-IN": /^(नहीं|नही|ना|no|cancel|radd|nhi|nahi|nahin)$/i,
  "ta-IN": /^(இல்லை|இ|no|cancel|rattu)$/i,
  "te-IN": /^(లేదు|కాదు|no|cancel|raddu)$/i,
  "kn-IN": /^(ಇಲ್ಲ|ಇ|no|cancel|raddu)$/i,
  "ml-IN": /^(ഇല്ല|വേണ്ട|അല്ല|no|cancel|radd)$/i,
  "bn-IN": /^(না|ন|no|cancel|batil)$/i,
  "mr-IN": /^(नाही|न|no|cancel|radd)$/i,
  "gu-IN": /^(ના|ન|no|cancel|rad)$/i,
  "pa-IN": /^(ਨਹੀਂ|ਨਹੀ|ਨਈਂ|no|cancel|radd)$/i,
  "default": /^(no|cancel|reject|stop|nahi|nahin|na|noo+)$/i,
};

const TRANSLATIONS: Record<string, Record<string, string>> = {
  "en-IN": {
    greeting: "Namaste! 🙏 I'm **JanSamadhan AI**.\nTell me about a civic issue you'd like to report — or tap the **+** button to upload a photo of the problem!",
    describe_issue: "Describe your issue...",
    login_required: "⚠️ You must be logged in to submit a complaint. Please log in and try again.",
    low_confidence: "⚠️ I am not confident enough in the issue extraction (confidence below 0.6). Please describe the issue manually with key details (what, where, urgency).",
    confirm_location_first: "📍 Please confirm your location first. You can move the pin and then tap **Confirm location**.",
    confirm_location_prompt: "Confirm location, then type YES to submit...",
    type_upvote: "Type UPVOTE or YES AGAIN...",
    recording_short: "⚠️ Recording was too short. Please hold the mic button and speak clearly.",
    could_not_recognize: "⚠️ Could not recognize any speech. Please try again.",
    mic_denied: "⚠️ Microphone access denied. Please allow microphone permission in your browser and try again.",
    detected_location: "Detected location",
    confirm_location_btn: "Confirm location",
    move_pin_gps: "Move pin to GPS",
    location_confirmed: "Location confirmed",
    move_pin_if_needed: "Move pin if needed, then confirm",
    show_map: "Show Map",
    hide_map: "Hide Map",
    transcribing: "Transcribing your voice…",
    submitting: "Submitting your complaint…",
    confirm_complaint: "📋 Confirm Your Complaint",
    type_yes: "Type YES/NO to confirm/deny submission",
    uploaded_photo: "📷 Uploaded a photo for analysis",
    show_full_details: "Show full details",
    show_less: "Show less",
    success_msg: "✅ **Complaint submitted successfully!**",
    fail_msg: "❌ Submission failed. Please try again or contact support.",
    tbl_title: "Title",
    tbl_issue: "Issue Type",
    tbl_severity: "Severity",
    tbl_location: "Location",
    tbl_desc: "Description",
    tbl_digipin: "DIGIPIN",
    detecting: "Detecting…",
    cancelled: "Okay, I've cancelled that. What else can I help you with?"
  },
  "hi-IN": {
    greeting: "नमस्ते! 🙏 मैं **जनसमाधान AI** हूँ।\nआप जिस नागरिक समस्या की रिपोर्ट करना चाहते हैं, उसके बारे में मुझे बताएं — या समस्या की फ़ोटो अपलोड करने के लिए **+** बटन पर टैप करें!",
    describe_issue: "अपनी समस्या का वर्णन करें...",
    login_required: "⚠️ शिकायत दर्ज करने के लिए आपको लॉग इन करना होगा। कृपया लॉग इन करें और पुनः प्रयास करें।",
    low_confidence: "⚠️ मुझे समस्या निष्कर्षण पर पर्याप्त विश्वास नहीं है। कृपया प्रमुख विवरणों के साथ समस्या का मैन्युअल रूप से वर्णन करें।",
    confirm_location_first: "📍 कृपया पहले अपने स्थान की पुष्टि करें। आप पिन को स्थानांतरित कर सकते हैं और फिर **Confirm location** पर टैप कर सकते हैं।",
    confirm_location_prompt: "स्थान की पुष्टि करें, फिर सबमिट करने के लिए YES टाइप करें...",
    type_upvote: "UPVOTE या YES AGAIN टाइप करें...",
    recording_short: "⚠️ रिकॉर्डिंग बहुत छोटी थी। कृपया माइक बटन दबाए रखें और स्पष्ट रूप से बोलें।",
    could_not_recognize: "⚠️ कोई आवाज़ नहीं पहचानी जा सकी। कृपया पुनः प्रयास करें।",
    mic_denied: "⚠️ माइक्रोफ़ोन का उपयोग अस्वीकृत। कृपया अनुमति दें।",
    detected_location: "पता चला स्थान",
    confirm_location_btn: "स्थान की पुष्टि करें",
    move_pin_gps: "पिन को GPS पर ले जाएं",
    location_confirmed: "स्थान की पुष्टि की गई",
    move_pin_if_needed: "यदि आवश्यक हो तो पिन ले जाएं, फिर पुष्टि करें",
    show_map: "नक्शा दिखाएं",
    hide_map: "नक्शा छिपाएं",
    transcribing: "आपकी आवाज़ को टेक्स्ट में बदल रहे हैं…",
    submitting: "आपकी शिकायत दर्ज की जा रही है…",
    confirm_complaint: "📋 अपनी शिकायत की पुष्टि करें",
    type_yes: "सबमिट/अस्वीकार करने के लिए YES/NO टाइप करें",
    uploaded_photo: "📷 विश्लेषण के लिए एक तस्वीर अपलोड की गई",
    show_full_details: "पूरा विवरण दिखाएं",
    show_less: "कम दिखाएं",
    success_msg: "✅ **शिकायत सफलतापूर्वक दर्ज की गई!**",
    fail_msg: "❌ सबमिशन विफल रहा। कृपया पुनः प्रयास करें या सहायता से संपर्क करें।",
    tbl_title: "शीर्षक",
    tbl_issue: "समस्या का प्रकार",
    tbl_severity: "गंभीरता",
    tbl_location: "स्थान",
    tbl_desc: "विवरण",
    tbl_digipin: "डिजिपिन",
    detecting: "पता लगाया जा रहा है...",
    cancelled: "ठीक है, मैंने इसे रद्द कर दिया है। मैं आपकी और क्या मदद कर सकता हूँ?"
  },
  "ta-IN": {
    greeting: "வணக்கம்! 🙏 நான் **JanSamadhan AI**.\nநீங்கள் புகாரளிக்க விரும்பும் குடிமைப் பிரச்சினையைப் பற்றி என்னிடம் கூறுங்கள் — அல்லது সমস্যার புகைப்படத்தைப் பதிவேற்ற **+** பொத்தானைத் தட்டவும்!",
    describe_issue: "உங்கள் பிரச்சனையை விவரிக்கவும்...",
    login_required: "⚠️ புகாரளிக்க நீங்கள் உள்நுழைந்திருக்க வேண்டும். தயவுசெய்து உள்நுழைந்து மீண்டும் முயற்சிக்கவும்.",
    low_confidence: "⚠️ இந்த சிக்கலை என்னால் சரியாக புரிந்து கொள்ள முடியவில்லை. தயவுசெய்து விவரங்களுடன் பகிர்ந்துகொள்ளவும்.",
    confirm_location_first: "📍 தயவுசெய்து முதலில் உங்கள் இருப்பிடத்தை உறுதிப்படுத்தவும்.",
    confirm_location_prompt: "இருப்பிடத்தை உறுதிசெய்து, YES என தட்டச்சு செய்யவும்...",
    type_upvote: "UPVOTE அல்லது YES AGAIN என தட்டச்சு செய்யவும்...",
    recording_short: "⚠️ பதிவு மிகவும் சிறியது. மைக் பொத்தானை அழுத்திப் பிடித்து தெளிவாகப் பேசவும்.",
    could_not_recognize: "⚠️ பேச்சை அடையாளம் காண முடியவில்லை. மீண்டும் முயற்சிக்கவும்.",
    mic_denied: "⚠️ மைக்ரோஃபோன் அணுகல் மறுக்கப்பட்டது. உங்கள் உலாவி அமைப்புகளில் அனுமதிக்கவும்.",
    detected_location: "கண்டறியப்பட்ட இருப்பிடம்",
    confirm_location_btn: "இருப்பிடத்தை உறுதிப்படுத்தவும்",
    move_pin_gps: "பினை GPSக்கு நகர்த்தவும்",
    location_confirmed: "இருப்பிடம் உறுதி செய்யப்பட்டது",
    move_pin_if_needed: "தேவைப்பட்டால் பினை நகர்த்தவும், பிறகு உறுதிப்படுத்தவும்",
    show_map: "வரைபடத்தைக் காட்டு",
    hide_map: "வரைபடத்தை மறை",
    transcribing: "உங்கள் குரலை எழுத்துக்களாக மாற்றுகிறோம்…",
    submitting: "உங்கள் புகார் சமர்ப்பிக்கப்படுகிறது…",
    confirm_complaint: "📋 உங்கள் புகாரை உறுதிப்படுத்தவும்",
    type_yes: "சமர்ப்பிக்க/மறுக்க YES/NO என தட்டச்சு செய்யவும்",
    uploaded_photo: "📷 பகுப்பாய்விற்காக ஒரு புகைப்படம் பதிவேற்றப்பட்டது",
    show_full_details: "முழு விவரங்களையும் காண்க",
    show_less: "குறைவாகக் காட்டு",
    success_msg: "✅ **புகார் வெற்றிகரமாக சமர்ப்பிக்கப்பட்டது!**",
    fail_msg: "❌ சமர்ப்பிப்பு தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும் அல்லது ஆதரவைத் தொடர்பு கொள்ளவும்.",
    tbl_title: "தலைப்பு",
    tbl_issue: "பிரச்சினை வகை",
    tbl_severity: "தீவிரம்",
    tbl_location: "இடம்",
    tbl_desc: "விளக்கம்",
    tbl_digipin: "DIGIPIN",
    detecting: "கண்டறியப்படுகிறது…",
    cancelled: "சரி, நான் அதை ரத்து செய்துவிட்டேன். நான் வேறு என்ன உதவி செய்ய முடியும்?"
  },
  "te-IN": {
    greeting: "నమస్తే! 🙏 నేను **JanSamadhan AI** ని.\nమీరు రిపోర్ట్ చేయాలనుకుంటున్న పౌర సమస్య గురించి నాకు చెప్పండి — లేదా సమస్య ఫోటోను అప్‌లోడ్ చేయడానికి **+** బటన్‌ను నొక్కండి!",
    describe_issue: "మీ సమస్యను వివరించండి...",
    login_required: "⚠️ ఫిర్యాదు చేయడానికి మీరు లాగిన్ అయి ఉండాలి. దయచేసి లాగిన్ చేసి మళ్లీ ప్రయత్నించండి.",
    low_confidence: "⚠️ నేను ఈ సమస్యను సరిగ్గా అర్థం చేసుకోలేకపోయాను. దయచేసి వివరాలతో మ్యాన్యువల్‌గా వివరించండి.",
    confirm_location_first: "📍 దయచేసి ముందుగా మీ స్థానాన్ని నిర్ధారించండి.",
    confirm_location_prompt: "స్థానాన్ని నిర్ధారించి, సబ్మిట్ చేయడానికి YES అని టైప్ చేయండి...",
    type_upvote: "UPVOTE లేదా YES AGAIN అని టైప్ చేయండి...",
    recording_short: "⚠️ రికార్డింగ్ చాలా తక్కువగా ఉంది. మైక్ బటన్‌ను నొక్కి ఉంచి స్పష్టంగా మాట్లాడండి.",
    could_not_recognize: "⚠️ మీ మాటలు అర్థం కాలేదు. దయచేసి మళ్లీ ప్రయత్నించండి.",
    mic_denied: "⚠️ మైక్రోఫోన్ యాక్సెస్ తిరస్కరించబడింది. దయచేసి అనుమతించండి.",
    detected_location: "గుర్తించిన స్థానం",
    confirm_location_btn: "స్థానాన్ని నిర్ధారించండి",
    move_pin_gps: "పిన్‌ని GPS కి తరలించండి",
    location_confirmed: "స్థానం నిర్ధారించబడింది",
    move_pin_if_needed: "అవసరమైతే పిన్‌ని మార్చి, నిర్ధారించండి",
    show_map: "మ్యాప్ చూపించు",
    hide_map: "మ్యాప్ దాచు",
    transcribing: "మీ వాయిస్‌ని టెక్స్ట్‌కి మారుస్తోంది…",
    submitting: "మీ ఫిర్యాదు సమర్పించబడుతోంది…",
    confirm_complaint: "📋 మీ ఫిర్యాదును నిర్ధారించండి",
    type_yes: "సబ్మిట్/తిరస్కరించడానికి YES/NO అని టైప్ చేయండి",
    uploaded_photo: "📷 విశ్లేషణ కోసం ఫోటో అప్‌లోడ్ చేయబడింది",
    show_full_details: "పూర్తి వివరాలు చూపించు",
    show_less: "తక్కువ చూపించు",
    success_msg: "✅ **ఫిర్యాదు విజయవంతంగా సమర్పించబడింది!**",
    fail_msg: "❌ సమర్పణ విఫలమైంది. దయచేసి మళ్లీ ప్రయత్నించండి.",
    tbl_title: "శీర్షిక",
    tbl_issue: "సమస్య రకం",
    tbl_severity: "తీవ్రత",
    tbl_location: "స్థానం",
    tbl_desc: "వివరణ",
    tbl_digipin: "DIGIPIN",
    detecting: "కనుగొంటోంది…",
    cancelled: "సరే, నేను దానిని రద్దు చేసాను. నేను మీకు ఇంకా ఏ విధంగా సహాయపడగలను?"
  },
  "kn-IN": {
    greeting: "ನಮಸ್ಕಾರ! 🙏 ನಾನು **JanSamadhan AI**.\nನೀವು ವರದಿ ಮಾಡಲು ಬಯಸುವ ನಾಗರಿಕ ಸಮಸ್ಯೆಯ ಬಗ್ಗೆ ನನಗೆ ತಿಳಿಸಿ — ಅಥವಾ ಸಮಸ್ಯೆಯ ಫೋಟೋವನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಲು **+** ಬಟನ್ ಟ್ಯಾಪ್ ಮಾಡಿ!",
    describe_issue: "ನಿಮ್ಮ ಸಮಸ್ಯೆಯನ್ನು ವಿವರಿಸಿ...",
    login_required: "⚠️ ದೂರು ನೀಡಲು ನೀವು ಲಾಗಿನ್ ಆಗಿರಬೇಕು. ದಯವಿಟ್ಟು ಲಾಗಿನ್ ಮಾಡಿ ಮತ್ತು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    low_confidence: "⚠️ ಈ ಸಮಸ್ಯೆಯನ್ನು ನನಗೆ ಸರಿಯಾಗಿ ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು ಆಗುತ್ತಿಲ್ಲ. ದಯವಿಟ್ಟು ವಿವರಗಳೊಂದಿಗೆ ವಿವರಿಸಿ.",
    confirm_location_first: "📍 ದಯವಿಟ್ಟು ಮೊದಲು ನಿಮ್ಮ ಸ್ಥಳವನ್ನು ದೃಢೀಕರಿಸಿ.",
    confirm_location_prompt: "ಸ್ಥಳವನ್ನು ದೃಢೀಕರಿಸಿ, ನಂತರ ಸಲ್ಲಿಸಲು YES ಎಂದು ಟೈಪ್ ಮಾಡಿ...",
    type_upvote: "UPVOTE ಅಥವಾ YES AGAIN ಎಂದು ಟೈಪ್ ಮಾಡಿ...",
    recording_short: "⚠️ ರೆಕಾರ್ಡಿಂಗ್ ತುಂಬಾ ಚಿಕ್ಕದಾಗಿದೆ. ಮೈಕ್ ಬಟನ್ ಹಿಡಿದು ಸ್ಪಷ್ಟವಾಗಿ ಮಾತನಾಡಿ.",
    could_not_recognize: "⚠️ ಧ್ವನಿಯನ್ನು ಗುರುತಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    mic_denied: "⚠️ ಮೈಕ್ರೊಫೋನ್ ಪ್ರವೇಶ ನಿರಾಕರಿಸಲಾಗಿದೆ. ದಯವಿಟ್ಟು ಅನುಮತಿಸಿ.",
    detected_location: "ಪತ್ತೆಯಾದ ಸ್ಥಳ",
    confirm_location_btn: "ಸ್ಥಳವನ್ನು ದೃಢೀಕರಿಸಿ",
    move_pin_gps: "ಪಿನ್ ಅನ್ನು GPS ಗೆ ಸರಿಸಿ",
    location_confirmed: "ಸ್ಥಳವನ್ನು ದೃಢೀಕರಿಸಲಾಗಿದೆ",
    move_pin_if_needed: "ಅಗತ್ಯವಿದ್ದರೆ ಪಿನ್ ಸರಿಸಿ, ನಂತರ ದೃಢೀಕರಿಸಿ",
    show_map: "ನಕ್ಷೆ ತೋರಿಸು",
    hide_map: "ನಕ್ಷೆ ಮರೆಮಾಡು",
    transcribing: "ನಿಮ್ಮ ಧ್ವನಿಯನ್ನು ಪಠ್ಯಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗುತ್ತಿದೆ…",
    submitting: "ನಿಮ್ಮ ದೂರನ್ನು ಸಲ್ಲಿಸಲಾಗುತ್ತಿದೆ…",
    confirm_complaint: "📋 ನಿಮ್ಮ ದೂರನ್ನು ದೃಢೀಕರಿಸಿ",
    type_yes: "ಸಲ್ಲಿಸಲು/ನಿರಾಕರಿಸಲು YES/NO ಎಂದು ಟೈಪ್ ಮಾಡಿ",
    uploaded_photo: "📷 ವಿಶ್ಲೇಷಣೆಗಾಗಿ ಫೋಟೋವನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಲಾಗಿದೆ",
    show_full_details: "ಪೂರ್ಣ ವಿವರಗಳನ್ನು ತೋರಿಸಿ",
    show_less: "ಕಡಿಮೆ ತೋರಿಸಿ",
    success_msg: "✅ **ದೂರನ್ನು ಯಶಸ್ವಿಯಾಗಿ ಸಲ್ಲಿಸಲಾಗಿದೆ!**",
    fail_msg: "❌ ಸಲ್ಲಿಕೆ ವಿಫಲವಾಗಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    tbl_title: "ಶೀರ್ಷಿಕೆ",
    tbl_issue: "ಸಮಸ್ಯೆಯ ಪ್ರಕಾರ",
    tbl_severity: "ತೀವ್ರತೆ",
    tbl_location: "ಸ್ಥಳ",
    tbl_desc: "ವಿವರಣೆ",
    tbl_digipin: "DIGIPIN",
    detecting: "ಪತ್ತೆಹಚ್ಚಲಾಗುತ್ತಿದೆ…",
    cancelled: "ಸರಿ, ನಾನು ಅದನ್ನು ರದ್ದುಗೊಳಿಸಿದ್ದೇನೆ. ನಾನು ನಿಮಗೆ ಬೇರೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?"
  },
  "ml-IN": {
    greeting: "നമസ്കാരം! 🙏 ഞാൻ **JanSamadhan AI** ആണ്.\nനിങ്ങൾ റിപ്പോർട്ട് ചെയ്യാൻ ആഗ്രഹിക്കുന്ന സിവിക് പ്രശ്നത്തെക്കുറിച്ച് എന്നോട് പറയുക — അല്ലെങ്കിൽ പ്രശ്നത്തിന്റെ ഫോട്ടോ അപ്‌ലോഡ് ചെയ്യാൻ **+** ബട്ടൺ ടാപ്പ് ചെയ്യുക!",
    describe_issue: "നിങ്ങളുടെ പ്രശ്നം വിശദീകരിക്കുക...",
    login_required: "⚠️ പരാതി നൽകാൻ നിങ്ങൾ ലോഗിൻ ചെയ്തിരിക്കണം. ദയവായി ലോഗിൻ ചെയ്ത് വീണ്ടും ശ്രമിക്കുക.",
    low_confidence: "⚠️ ഈ പ്രശ്നം എനിക്ക് കൃത്യമായി മനസ്സിലാക്കാൻ കഴിഞ്ഞില്ല. കൂടുതൽ വിവരങ്ങൾ നൽകുക.",
    confirm_location_first: "📍 ആദ്യം നിങ്ങളുടെ ലൊക്കേഷൻ സ്ഥിരീകരിക്കുക.",
    confirm_location_prompt: "ലൊക്കേഷൻ സ്ഥിരീകരിച്ച് സബ്മിറ്റ് ചെയ്യാൻ YES എന്ന് ടൈപ്പ് ചെയ്യുക...",
    type_upvote: "UPVOTE അല്ലെങ്കിൽ YES AGAIN എന്ന് ടൈപ്പ് ചെയ്യുക...",
    recording_short: "⚠️ റെക്കോർഡിംഗ് വളരെ ചെറുതായിരുന്നു. മൈക്ക് ബട്ടൺ അമർത്തിപ്പിടിച്ച് വ്യക്തമായി സംസാരിക്കുക.",
    could_not_recognize: "⚠️ സംസാരം തിരിച്ചറിയാൻ കഴിഞ്ഞില്ല. വീണ്ടും ശ്രമിക്കുക.",
    mic_denied: "⚠️ മൈക്രോഫോൺ ആക്സസ് നിഷേധിച്ചു. ദയവായി അനുവദിക്കുക.",
    detected_location: "കണ്ടെത്തിയ ലൊക്കേഷൻ",
    confirm_location_btn: "ലൊക്കേഷൻ സ്ഥിരീകരിക്കുക",
    move_pin_gps: "പിൻ GPS ലേക്ക് മാറ്റുക",
    location_confirmed: "ലൊക്കേഷൻ സ്ഥിരീകരിച്ചു",
    move_pin_if_needed: "ആവശ്യമെങ്കിൽ പിൻ മാറ്റുക, തുടർന്ന് സ്ഥിരീകരിക്കുക",
    show_map: "മാപ്പ് കാണിക്കുക",
    hide_map: "മാപ്പ് മറയ്ക്കുക",
    transcribing: "നിങ്ങളുടെ ശബ്ദം ടൈപ്പ് ചെയ്യുന്നു…",
    submitting: "നിങ്ങളുടെ പരാതി സമർപ്പിക്കുന്നു…",
    confirm_complaint: "📋 നിങ്ങളുടെ പരാതി സ്ഥിരീകരിക്കുക",
    type_yes: "സമർപ്പിക്കാൻ/നിരസിക്കാൻ YES/NO എന്ന് ടൈപ്പ് ചെയ്യുക",
    uploaded_photo: "📷 വിശകലനത്തിനായി ഒരു ഫോട്ടോ അപ്‌ലോഡ് ചെയ്തു",
    show_full_details: "പൂർണ്ണ വിവരങ്ങൾ കാണിക്കുക",
    show_less: "കുറച്ച് കാണിക്കുക",
    success_msg: "✅ **പരാതി വിജയകരമായി സമർപ്പിച്ചു!**",
    fail_msg: "❌ സമർപ്പിക്കൽ പരാജയപ്പെട്ടു. ദയവായി വീണ്ടും ശ്രമിക്കുക.",
    tbl_title: "തലക്കെട്ട്",
    tbl_issue: "പ്രശ്നത്തിന്റെ തരം",
    tbl_severity: "തീവ്രത",
    tbl_location: "സ്ഥലം",
    tbl_desc: "വിവരണം",
    tbl_digipin: "DIGIPIN",
    detecting: "കണ്ടെത്തുന്നു…",
    cancelled: "ശരി, ഞാൻ അത് റദ്ദാക്കി. എനിക്ക് നിങ്ങളെ വേറെ എങ്ങനെ സഹായിക്കാനാകും?"
  },
  "bn-IN": {
    greeting: "নমস্কার! 🙏 আমি **JanSamadhan AI**।\nআপনি যে নাগরিক সমস্যার কথা জানাতে চান সে সম্পর্কে আমাকে বলুন — অথবা সমস্যার একটি ছবি আপলোড করতে **+** বোতামে আলতো চাপুন!",
    describe_issue: "আপনার সমস্যা বর্ণনা করুন...",
    login_required: "⚠️ অভিযোগ জানাতে আপনাকে লগ ইন করতে হবে। অনুগ্রহ করে লগ ইন করুন এবং আবার চেষ্টা করুন।",
    low_confidence: "⚠️ এই সমস্যাটি আমি সঠিকভাবে বুঝতে পারিনি। অনুগ্রহ করে আরও বিশদে লিখুন।",
    confirm_location_first: "📍 প্রথমে আপনার অবস্থান নিশ্চিত করুন।",
    confirm_location_prompt: "অবস্থান নিশ্চিত করুন, তারপর জমা দিতে YES টাইপ করুন...",
    type_upvote: "UPVOTE বা YES AGAIN টাইপ করুন...",
    recording_short: "⚠️ রেকর্ডিং খুব ছোট ছিল। মাইক বোতাম চেপে ধরে স্পষ্টভাবে কথা বলুন।",
    could_not_recognize: "⚠️ কোনো কথা চেনা যায়নি। আবার চেষ্টা করুন।",
    mic_denied: "⚠️ মাইক্রোফোন অ্যাক্সেস অস্বীকার করা হয়েছে। অনুগ্রহ করে অনুমতি দিন।",
    detected_location: "সনাক্ত করা অবস্থান",
    confirm_location_btn: "অবস্থান নিশ্চিত করুন",
    move_pin_gps: "পিন GPS-এ নিয়ে যান",
    location_confirmed: "অবস্থান নিশ্চিত করা হয়েছে",
    move_pin_if_needed: "প্রয়োজন হলে পিন সরান, তারপর নিশ্চিত করুন",
    show_map: "মানচিত্র দেখান",
    hide_map: "মানচিত্র লুকান",
    transcribing: "আপনার কথা টেক্সটে রূপান্তর করা হচ্ছে…",
    submitting: "আপনার অভিযোগ জমা দেওয়া হচ্ছে…",
    confirm_complaint: "📋 আপনার অভিযোগ নিশ্চিত করুন",
    type_yes: "জমা দিতে/প্রত্যাখ্যান করতে YES/NO টাইপ করুন",
    uploaded_photo: "📷 বিশ্লেষণের জন্য একটি ছবি আপলোড করা হয়েছে",
    show_full_details: "সম্পূর্ণ বিবরণ দেখান",
    show_less: "কম দেখান",
    success_msg: "✅ **অভিযোগ সফলভাবে জমা দেওয়া হয়েছে!**",
    fail_msg: "❌ জমা দেওয়া ব্যর্থ হয়েছে। আবার চেষ্টা করুন।",
    tbl_title: "শিরোনাম",
    tbl_issue: "সমস্যার ধরন",
    tbl_severity: "তীব্রতা",
    tbl_location: "অবস্থান",
    tbl_desc: "বিবরণ",
    tbl_digipin: "DIGIPIN",
    detecting: "সন্ধান করা হচ্ছে…",
    cancelled: "ঠিক আছে, আমি এটি বাতিল করেছি। আমি আর কীভাবে আপনাকে সাহায্য করতে পারি?"
  },
  "mr-IN": {
    greeting: "नमस्कार! 🙏 मी **JanSamadhan AI** आहे.\nतुम्हाला नोंदवायच्या असलेल्या नागरी समस्येबद्दल मला सांगा — किंवा समस्येचा फोटो अपलोड करण्यासाठी **+** बटणावर टॅप करा!",
    describe_issue: "तुमच्या समस्येचे वर्णन करा...",
    login_required: "⚠️ तक्रार नोंदवण्यासाठी तुम्हाला लॉग इन करणे आवश्यक आहे. कृपया लॉग इन करा आणि पुन्हा प्रयत्न करा.",
    low_confidence: "⚠️ मी ही समस्या नीट समजू शकलो नाही. कृपया अधिक तपशीलांसह मॅन्युअली वर्णन करा.",
    confirm_location_first: "📍 कृपया प्रथम तुमच्या स्थानाची पुष्टी करा.",
    confirm_location_prompt: "स्थानाची पुष्टी करा, त्यानंतर सबमिट करण्यासाठी YES टाइप करा...",
    type_upvote: "UPVOTE किंवा YES AGAIN टाइप करा...",
    recording_short: "⚠️ रेकॉर्डिंग खूपच लहान होते. कृपया माइक बटण धरून ठेवा आणि स्पष्ट बोला.",
    could_not_recognize: "⚠️ आवाज ओळखता आला नाही. कृपया पुन्हा प्रयत्न करा.",
    mic_denied: "⚠️ मायक्रोफोन प्रवेश नाकारला. कृपया परवानगी द्या.",
    detected_location: "शोधलेले स्थान",
    confirm_location_btn: "स्थानाची पुष्टी करा",
    move_pin_gps: "पिन GPS वर हलवा",
    location_confirmed: "स्थानाची पुष्टी झाली",
    move_pin_if_needed: "आवश्यक असल्यास पिन हलवा, नंतर पुष्टी करा",
    show_map: "नकाशा दाखवा",
    hide_map: "नकाशा लपवा",
    transcribing: "तुमचा आवाज मजकुरात रूपांतरित करत आहे…",
    submitting: "तुमची तक्रार सबमिट करत आहे…",
    confirm_complaint: "📋 तुमच्या तक्रारीची पुष्टी करा",
    type_yes: "सबमिट/नाकारण्यासाठी YES/NO टाइप करा",
    uploaded_photo: "📷 विश्लेषणासाठी फोटो अपलोड केला",
    show_full_details: "संपूर्ण तपशील पहा",
    show_less: "कमी दाखवा",
    success_msg: "✅ **तक्रार यशस्वीरित्या सबमिट केली!**",
    fail_msg: "❌ सबमिशन अयशस्वी. कृपया पुन्हा प्रयत्न करा.",
    tbl_title: "शीर्षक",
    tbl_issue: "समस्येचा प्रकार",
    tbl_severity: "तीव्रता",
    tbl_location: "स्थान",
    tbl_desc: "वर्णन",
    tbl_digipin: "DIGIPIN",
    detecting: "शोधत आहे…",
    cancelled: "ठीक आहे, मी ते रद्द केले आहे. मी तुम्हाला आणखी कशी मदत करू शकतो?"
  },
  "gu-IN": {
    greeting: "નમસ્તે! 🙏 હું **JanSamadhan AI** છું.\nતમે જે નાગરિક સમસ્યા નોંધાવવા માંગતા હો તે વિશે મને જણાવો — અથવા સમસ્યાનો ફોટો અપલોડ કરવા માટે **+** બટન પર ટેપ કરો!",
    describe_issue: "તમારી સમસ્યાનું વર્ણન કરો...",
    login_required: "⚠️ ફરિયાદ નોંધાવવા માટે તમારે લૉગ ઇન કરવું આવશ્યક છે. કૃપા કરીને લૉગ ઇન કરો અને ફરી પ્રયાસ કરો.",
    low_confidence: "⚠️ હું આ સમસ્યા સમજવામાં અસમર્થ છું. કૃપા કરીને વધુ વિગતો સાથે મેન્યુઅલી વર્ણન કરો.",
    confirm_location_first: "📍 કૃપા કરીને પહેલા તમારા સ્થાનની પુષ્ટિ કરો.",
    confirm_location_prompt: "સ્થાનની પુષ્ટિ કરો, પછી સબમિટ કરવા માટે YES ટાઇપ કરો...",
    type_upvote: "UPVOTE અથવા YES AGAIN ટાઇપ કરો...",
    recording_short: "⚠️ રેકોર્ડિંગ ખૂબ જ ટૂંકું હતું. કૃપા કરીને માઇક બટન પકડી રાખો અને સ્પષ્ટ બોલો.",
    could_not_recognize: "⚠️ કોઈ અવાજ ઓળખી શકાયો નથી. કૃપા કરીને ફરી પ્રયાસ કરો.",
    mic_denied: "⚠️ માઇક્રોફોન ઍક્સેસ નકારવામાં આવી છે. કૃપા કરીને મંજૂરી આપો.",
    detected_location: "શોધાયેલ સ્થાન",
    confirm_location_btn: "સ્થાનની પુષ્ટિ કરો",
    move_pin_gps: "પિનને GPS પર ખસેડો",
    location_confirmed: "સ્થાનની પુષ્ટિ થઈ ગઈ",
    move_pin_if_needed: "જો જરૂરી હોય તો પિન ખસેડો, પછી પુષ્ટિ કરો",
    show_map: "નકશો બતાવો",
    hide_map: "નકશો છુપાવો",
    transcribing: "તમારા અવાજને ટેક્સ્ટમાં કન્વર્ટ કરી રહ્યાં છીએ…",
    submitting: "તમારી ફરિયાદ સબમિટ કરી રહ્યાં છીએ…",
    confirm_complaint: "📋 તમારી ફરિયાદની પુષ્ટિ કરો",
    type_yes: "સબમિટ/નકારવા માટે YES/NO ટાઇપ કરો",
    uploaded_photo: "📷 વિશ્લેષણ માટે એક ફોટો અપલોડ કર્યો",
    show_full_details: "સંપૂર્ણ વિગતો બતાવો",
    show_less: "ઓછું બતાવો",
    success_msg: "✅ **ફરિયાદ સફળતાપૂર્વક સબમિટ થઈ ગઈ!**",
    fail_msg: "❌ સબમિશન નિષ્ફળ. કૃપા કરીને ફરી પ્રયાસ કરો.",
    tbl_title: "શીર્ષક",
    tbl_issue: "સમસ્યાનો પ્રકાર",
    tbl_severity: "ગંભીરતા",
    tbl_location: "સ્થાન",
    tbl_desc: "વર્ણન",
    tbl_digipin: "DIGIPIN",
    detecting: "શોધી રહ્યાં છીએ…",
    cancelled: "ઠીક છે, મેં તે રદ કર્યું છે. હું તમને બીજી કઈ રીતે મદદ કરી શકું?"
  },
  "pa-IN": {
    greeting: "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ! 🙏 ਮੈਂ **JanSamadhan AI** ਹਾਂ।\nਮੈਨੂੰ ਉਸ ਨਾਗਰਿਕ ਸਮੱਸਿਆ ਬਾਰੇ ਦੱਸੋ ਜਿਸਦੀ ਤੁਸੀਂ ਰਿਪੋਰਟ ਕਰਨਾ ਚਾਹੁੰਦੇ ਹੋ — ਜਾਂ ਸਮੱਸਿਆ ਦੀ ਫੋਟੋ ਅੱਪਲੋਡ ਕਰਨ ਲਈ **+** ਬਟਨ 'ਤੇ ਟੈਪ ਕਰੋ!",
    describe_issue: "ਆਪਣੀ ਸਮੱਸਿਆ ਦਾ ਵਰਣਨ ਕਰੋ...",
    login_required: "⚠️ ਸ਼ਿਕਾਇਤ ਦਰਜ ਕਰਨ ਲਈ ਤੁਹਾਨੂੰ ਲੌਗਇਨ ਕਰਨਾ ਪਵੇਗਾ। ਕਿਰਪਾ ਕਰਕੇ ਲੌਗਇਨ ਕਰੋ ਅਤੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
    low_confidence: "⚠️ ਮੈਂ ਇਸ ਸਮੱਸਿਆ ਨੂੰ ਠੀਕ ਤਰ੍ਹਾਂ ਸਮਝ ਨਹੀਂ ਸਕਿਆ। ਕਿਰਪਾ ਕਰਕੇ ਹੋਰ ਵੇਰਵਿਆਂ ਨਾਲ ਵਰਣਨ ਕਰੋ।",
    confirm_location_first: "📍 ਕਿਰਪਾ ਕਰਕੇ ਪਹਿਲਾਂ ਆਪਣੀ ਜਗ੍ਹਾ ਦੀ ਪੁਸ਼ਟੀ ਕਰੋ।",
    confirm_location_prompt: "ਜਗ੍ਹਾ ਦੀ ਪੁਸ਼ਟੀ ਕਰੋ, ਫਿਰ ਜਮ੍ਹਾਂ ਕਰਨ ਲਈ YES ਟਾਈਪ ਕਰੋ...",
    type_upvote: "UPVOTE ਜਾਂ YES AGAIN ਟਾਈਪ ਕਰੋ...",
    recording_short: "⚠️ ਰਿਕਾਰਡਿੰਗ ਬਹੁਤ ਛੋਟੀ ਸੀ। ਕਿਰਪਾ ਕਰਕੇ ਮਾਈਕ ਬਟਨ ਨੂੰ ਫੜੋ ਅਤੇ ਸਪਸ਼ਟ ਬੋਲੋ।",
    could_not_recognize: "⚠️ ਅਵਾਜ਼ ਦੀ ਪਛਾਣ ਨਹੀਂ ਹੋ ਸਕੀ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
    mic_denied: "⚠️ ਮਾਈਕ੍ਰੋਫੋਨ ਪਹੁੰਚ ਤੋਂ ਇਨਕਾਰ ਕੀਤਾ ਗਿਆ। ਕਿਰਪਾ ਕਰਕੇ ਇਜਾਜ਼ਤ ਦਿਓ।",
    detected_location: "ਲੋਕੇਸ਼ਨ ਲੱਭੀ ਗਈ",
    confirm_location_btn: "ਲੋਕੇਸ਼ਨ ਦੀ ਪੁਸ਼ਟੀ ਕਰੋ",
    move_pin_gps: "ਪਿੰਨ ਨੂੰ GPS 'ਤੇ ਲੈ ਜਾਓ",
    location_confirmed: "ਲੋਕੇਸ਼ਨ ਦੀ ਪੁਸ਼ਟੀ ਹੋ ਗਈ",
    move_pin_if_needed: "ਜੇ ਲੋੜ ਹੋਵੇ ਤਾਂ ਪਿੰਨ ਹਿਲਾਓ, ਫਿਰ ਪੁਸ਼ਟੀ ਕਰੋ",
    show_map: "ਨਕਸ਼ਾ ਦਿਖਾਓ",
    hide_map: "ਨਕਸ਼ਾ ਛੁਪਾਓ",
    transcribing: "ਤੁਹਾਡੀ ਆਵਾਜ਼ ਨੂੰ ਟੈਕਸਟ ਵਿੱਚ ਬਦਲਿਆ ਜਾ ਰਿਹਾ ਹੈ…",
    submitting: "ਤੁਹਾਡੀ ਸ਼ਿਕਾਇਤ ਜਮ੍ਹਾਂ ਕੀਤੀ ਜਾ ਰਹੀ ਹੈ…",
    confirm_complaint: "📋 ਆਪਣੀ ਸ਼ਿਕਾਇਤ ਦੀ ਪੁਸ਼ਟੀ ਕਰੋ",
    type_yes: "ਜਮ੍ਹਾਂ ਕਰਨ/ਰੱਦ ਕਰਨ ਲਈ YES/NO ਟਾਈਪ ਕਰੋ",
    uploaded_photo: "📷 ਵਿਸ਼ਲੇਸ਼ਣ ਲਈ ਇੱਕ ਫੋਟੋ ਅੱਪਲੋਡ ਕੀਤੀ ਗਈ",
    show_full_details: "ਪੂਰੇ ਵੇਰਵੇ ਦਿਖਾਓ",
    show_less: "ਘੱਟ ਦਿਖਾਓ",
    success_msg: "✅ **ਸ਼ਿਕਾਇਤ ਸਫਲਤਾਪੂਰਵਕ ਜਮ੍ਹਾਂ ਹੋ ਗਈ!**",
    fail_msg: "❌ ਜਮ੍ਹਾਂ ਕਰਨ ਵਿੱਚ ਅਸਫਲ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
    tbl_title: "ਸਿਰਲੇਖ",
    tbl_issue: "ਸਮੱਸਿਆ ਦੀ ਕਿਸਮ",
    tbl_severity: "ਗੰਭੀਰਤਾ",
    tbl_location: "ਸਥਾਨ",
    tbl_desc: "ਵਰਣਨ",
    tbl_digipin: "DIGIPIN",
    detecting: "ਲੱਭਿਆ ਜਾ ਰਿਹਾ ਹੈ…",
    cancelled: "ਠੀਕ ਹੈ, ਮੈਂ ਇਸਨੂੰ ਰੱਦ ਕਰ ਦਿੱਤਾ ਹੈ। ਮੈਂ ਤੁਹਾਡੀ ਹੋਰ ਕੀ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?"
  }
};

function t(langCode: string | null, key: string): string {
  const lang = langCode || "en-IN";
  return TRANSLATIONS[lang]?.[key] || TRANSLATIONS["en-IN"][key] || key;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ChatPanel({ onClose: _onClose }: { onClose?: () => void }) {
  /* ----- state ----- */
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingComplaint, setPendingComplaint] = useState<ExtractedComplaint | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<ImageTicketPreview | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImageDataUrl, setPendingImageDataUrl] = useState<string | null>(null);
  const [pendingLocation, setPendingLocation] = useState<DeviceLocation | null>(null);
  const [duplicateContext, setDuplicateContext] = useState<DuplicateContext | null>(null);
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [expandedImagePreview, setExpandedImagePreview] = useState<Record<string, boolean>>({});
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);
  const [isInitialView, setIsInitialView] = useState(true);
  const [skipAnimation, setSkipAnimation] = useState(false);
  const hasAnimatedRef = useRef(false);

  // Instantly snap to bottom before browser paints if skipping animation
  useLayoutEffect(() => {
    if (!isInitialView && skipAnimation && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" });
    }
  }, [isInitialView, skipAnimation]);

  // Initialize from localStorage on mount
  useEffect(() => {
    const savedLang = localStorage.getItem("jansamadhan_lang");
    if (savedLang) {
      setSelectedLanguage(savedLang);
    }
  }, []);

  // Save to localStorage whenever selectedLanguage changes
  useEffect(() => {
    if (selectedLanguage) {
      localStorage.setItem("jansamadhan_lang", selectedLanguage);
    }
  }, [selectedLanguage]);

  // Prevent accidental navigation during rendering/processing
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isLoading || submitting || isTranscribing) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isLoading, submitting, isTranscribing]);

  /* ----- refs ----- */
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const micBtnRef = useRef<HTMLButtonElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micPulseRef = useRef<gsap.core.Tween | null>(null);
  const greetingRef = useRef<HTMLDivElement>(null);
  const inputBarRef = useRef<HTMLDivElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);

  /* ----- conversation history for Gemini (role: user | model) ----- */
  const historyRef = useRef<ChatMessage[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const [isHistoryInitialized, setIsHistoryInitialized] = useState(false);

  // Save pending UI flow state to IndexedDB 
  useEffect(() => {
    if (!userIdRef.current || !isHistoryInitialized) return;
    const stateObj = {
      pendingComplaint,
      pendingImagePreview,
      pendingImageFile,
      pendingImageDataUrl,
      pendingLocation,
      duplicateContext,
      locationConfirmed,
      submitted
    };
    saveSharedState(`jansamadhan_pending_state_${userIdRef.current}`, stateObj).catch(console.error);
  }, [pendingComplaint, pendingImagePreview, pendingImageFile, pendingImageDataUrl, pendingLocation, duplicateContext, locationConfirmed, submitted, isHistoryInitialized]);

  // Initialize session and history — tied to logged-in user via localStorage
  useEffect(() => {
    const initializeChat = async () => {

      // 1. Get current user to tie session to their account
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        setIsHistoryInitialized(true);
        return;
      }
      userIdRef.current = userId;

      // 2. Use user-specific key in localStorage (persists across tabs & reloads)
      const storageKey = `jansamadhan_session_id_${userId}`;
      let sid = localStorage.getItem(storageKey);
      if (!sid) {
        sid = crypto.randomUUID();
        localStorage.setItem(storageKey, sid);
      }
      sessionIdRef.current = sid;

      // 3. Fetch history from Redis via backend if we don't have messages yet
      if (messages.length === 0) {
        try {
          const res = await fetch(`${API_URL}/api/chat/history/${sid}`);
          if (res.ok) {
            const data = await res.json();
            if (data.messages && data.messages.length > 0) {
              setMessages(data.messages);
              // Reconstruct historyRef for Gemini
              historyRef.current = data.messages
                .filter((m: DisplayMessage) => m.role === "user" || m.role === "bot")
                .map((m: DisplayMessage) => ({
                  role: m.role === "bot" ? "model" : "user",
                  text: m.text,
                }));

              hasAnimatedRef.current = true; // Skip opening transition for loaded history
              setSkipAnimation(true);
              setIsInitialView(false);
            }
          }
        } catch (err) {
          console.warn("[Backend] Could not fetch chat history, proceeding empty. Error:", err);
        }
      }
      
      // 4. Restore pending UI flow state if any (handles reloads cleanly)
      try {
        const savedState = await getSharedState(`jansamadhan_pending_state_${userId}`);
        if (savedState) {
          if (savedState.pendingComplaint !== undefined) setPendingComplaint(savedState.pendingComplaint);
          if (savedState.pendingImagePreview !== undefined) setPendingImagePreview(savedState.pendingImagePreview);
          if (savedState.pendingLocation !== undefined) setPendingLocation(savedState.pendingLocation);
          if (savedState.duplicateContext !== undefined) setDuplicateContext(savedState.duplicateContext);
          if (savedState.locationConfirmed !== undefined) setLocationConfirmed(savedState.locationConfirmed);
          if (savedState.submitted !== undefined) setSubmitted(savedState.submitted);

          // Only restore the image file if there's actually a confirmed preview waiting!
          // This prevents stuck image thumbnails from interrupted network connections.
          if (savedState.pendingImagePreview) {
             if (savedState.pendingImageFile !== undefined) setPendingImageFile(savedState.pendingImageFile);
             if (savedState.pendingImageDataUrl !== undefined) setPendingImageDataUrl(savedState.pendingImageDataUrl);
          } else {
             setPendingImageFile(null);
             setPendingImageDataUrl(null);
             clearSharedState(`jansamadhan_pending_state_${userId}`).catch(console.error);
          }
        }
      } catch (e) {
        console.error("Failed to restore UI state", e);
      }
      
      setIsHistoryInitialized(true);
    };

    initializeChat();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear chat history from Redis & localStorage on logout
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: any, session: any) => {
      if (event === "SIGNED_OUT") {
        // Clear Redis-cached history
        if (sessionIdRef.current) {
          try {
            await fetch(`${API_URL}/api/chat/history/${sessionIdRef.current}`, {
              method: "DELETE",
            });
          } catch { /* best-effort cleanup */ }
        }
        
        // Clear the specific user's session from localStorage
        if (userIdRef.current) {
          localStorage.removeItem(`jansamadhan_session_id_${userIdRef.current}`);
          clearSharedState(`jansamadhan_pending_state_${userIdRef.current}`).catch(console.error);
          userIdRef.current = null;
        }
        
        sessionIdRef.current = null;

        setMessages([]);
        setIsInitialView(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync messages to Redis whenever they change
  useEffect(() => {
    const syncHistory = async () => {
      if (!sessionIdRef.current || !isHistoryInitialized || messages.length === 0) return;
      
      try {
        await fetch(`${API_URL}/api/chat/history/${sessionIdRef.current}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages }),
        });
      } catch (err) {
        if (err instanceof TypeError && err.message === "Failed to fetch") {
          console.warn("Backend API unreachable. Chat history sync suspended.");
        } else {
          console.error("Failed to sync chat history:", err);
        }
      }
    };

    // Debounce sync slightly to avoid excessive writes
    const timer = setTimeout(syncHistory, 1000);
    return () => clearTimeout(timer);
  }, [messages]);

  /* ----- helpers ----- */
  const uid = () => Math.random().toString(36).slice(2, 10);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  /* ----- Detect transition from initial → active chat ----- */
  useEffect(() => {
    const hasUserMsg = messages.some((m) => m.role === "user");
    if (hasUserMsg && isInitialView) {
      if (!hasAnimatedRef.current) {
        hasAnimatedRef.current = true;
        // Use a short timeout to let the state update tick
        setTimeout(() => {
          setIsInitialView(false);
        }, 10);
        setTimeout(scrollToBottom, 600); // Wait for the transition to finish
      } else {
        setIsInitialView(false);
      }
    }
  }, [messages, isInitialView, scrollToBottom]);

  const toggleImagePreviewDetails = useCallback((messageId: string) => {
    setExpandedImagePreview((prev) => ({ ...prev, [messageId]: !prev[messageId] }));
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

  /** Get Supabase auth token — works for both email/password and Google OAuth */
  const getAuthToken = async (): Promise<string | null> => {
    // Try getSession first (works immediately for email/password)
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;

    // Force a session refresh — required for Google OAuth PKCE flow
    // where the session may not be hydrated yet after redirect
    const { data: refreshData } = await supabase.auth.refreshSession();
    if (refreshData.session?.access_token) return refreshData.session.access_token;

    // Confirm user actually exists before giving up
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Session exists but is still hydrating (common after Google OAuth redirect)
    // Wait briefly and retry once
    await new Promise((res) => setTimeout(res, 500));
    const { data: { session: retrySession } } = await supabase.auth.getSession();
    return retrySession?.access_token ?? null;
  };

  /* ----- initialize with greeting after language selection ----- */
  useEffect(() => {
    if (!selectedLanguage) return;
    
    // Reset state on language change
    historyRef.current = [];
    setPendingComplaint(null);
    setPendingImagePreview(null);
    setPendingImageDataUrl(null);
    setPendingImageFile(null);
    setPendingLocation(null);
    setLocationConfirmed(false);
    setDuplicateContext(null);
    setInitialized(true);
    
    // Add greeting in new language directly to avoid state batching issues
    const initialMsg = { 
      id: Math.random().toString(36).slice(2, 10), 
      role: "bot" as const, 
      text: t(selectedLanguage, "greeting") 
    };
    setMessages([initialMsg]);
    
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [selectedLanguage]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- get confirmation pattern for current language ----- */
  const getConfirmationPattern = useCallback(() => {
    return CONFIRMATION_PATTERNS[selectedLanguage || "default"] || CONFIRMATION_PATTERNS.default;
  }, [selectedLanguage]);

  const getRejectionPattern = useCallback(() => {
    return REJECTION_PATTERNS[selectedLanguage || "default"] || REJECTION_PATTERNS.default;
  }, [selectedLanguage]);

  /* ----- message helpers ----- */
  const addBotMessage = useCallback(
    (text: string, extra?: { extracted?: ExtractedComplaint | null; imagePreview?: ImageTicketPreview | null; geoDetails?: GeoDetails | null }) => {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "bot", text, extracted: extra?.extracted, imagePreview: extra?.imagePreview, geoDetails: extra?.geoDetails },
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
        setPendingImageDataUrl(dataUrl);

        // Show user message with image thumbnail
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "user", text: t(selectedLanguage, "uploaded_photo"), imageUrl: dataUrl },
        ]);
        scrollToBottom();

        setIsLoading(true);
        try {
          const token = await getAuthToken();
          if (!token) {
            addBotMessage(t(selectedLanguage, "login_required"));
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

          if (preview.confidence < 0.6) {
            setPendingImagePreview(null);
            setPendingImageFile(null);
            setPendingLocation(null);
            setLocationConfirmed(false);
            setDuplicateContext(null);
            addBotMessage(t(selectedLanguage, "low_confidence"));
            return;
          }

          // Store for confirmation
          setPendingImagePreview(preview);
          setPendingImageFile(file);
          setPendingComplaint(null); // clear any text-based pending
          setDuplicateContext(null);
          setPendingLocation({
            lat: preview.latitude,
            lng: preview.longitude,
            accuracy: preview.accuracy,
            timestamp: preview.timestamp,
          });
          setLocationConfirmed(false);

          addBotMessage(preview.confirm_prompt, { imagePreview: preview });
        } catch (err) {
          const msg = toUserFacingError(err);
          addBotMessage(`⚠️ ${msg}`);
          setPendingImageDataUrl(null); // Clear the image if the network request fails or drops!
          setPendingImageFile(null);
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

    if (duplicateContext && /^(upvote|support|same)$/i.test(trimmed)) {
      setMessages((prev) => [...prev, { id: uid(), role: "user", text: trimmed }]);
      scrollToBottom();
      await upvoteDuplicate();
      return;
    }

    if (duplicateContext && /^(yes again|upload anyway|force|submit anyway)$/i.test(trimmed)) {
      setMessages((prev) => [...prev, { id: uid(), role: "user", text: trimmed }]);
      scrollToBottom();
      if (duplicateContext.mode === "image") {
        await confirmImageTicket(true);
      } else {
        await submitComplaint(true);
      }
      return;
    }

    // Handle rejection if we have a pending ticket or duplicate context
    if ((pendingComplaint || pendingImagePreview || duplicateContext) && getRejectionPattern().test(trimmed)) {
      setMessages((prev) => [...prev, { id: uid(), role: "user", text: trimmed }]);
      scrollToBottom();
      setPendingComplaint(null);
      setPendingImagePreview(null);
      setPendingImageDataUrl(null);
      setPendingImageFile(null);
      setPendingLocation(null);
      setLocationConfirmed(false);
      setDuplicateContext(null);
      addBotMessage(t(selectedLanguage, "cancelled"));
      return;
    }

    // If the user typed YES and we have a pending image preview → confirm via FastAPI
    if (pendingImagePreview && getConfirmationPattern().test(trimmed)) {
      if (!locationConfirmed || !pendingLocation) {
        addBotMessage("📍 Please confirm your location first. You can move the pin and then tap **Confirm location**.");
        return;
      }
      setMessages((prev) => [...prev, { id: uid(), role: "user", text: trimmed }]);
      scrollToBottom();
      await confirmImageTicket(false);
      return;
    }

    // If the user typed YES and we have a pending text-based complaint
    if (pendingComplaint && getConfirmationPattern().test(trimmed)) {
      if (!locationConfirmed || !pendingLocation) {
        addBotMessage(t(selectedLanguage, "confirm_location_first"));
        return;
      }
      setMessages((prev) => [...prev, { id: uid(), role: "user", text: trimmed }]);
      scrollToBottom();
      await submitComplaint(false);
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
          if (res.extracted.confidence < 0.6) {
          setPendingComplaint(null);
          setPendingImagePreview(null);
          setPendingImageDataUrl(null);
          setPendingLocation(null);
          setLocationConfirmed(false);
          setDuplicateContext(null);
          addBotMessage(t(selectedLanguage, "low_confidence"));
          return;
        }

        setPendingComplaint(res.extracted);
        setPendingImagePreview(null);
        setPendingImageDataUrl(null);
        setDuplicateContext(null);
        const currentLocation = await getLocation();
        setPendingLocation(currentLocation);
        setLocationConfirmed(false);

        let geoDetails: GeoDetails | null = null;
        try {
          const geoRes = await fetch(`${API_URL}/geocode?lat=${currentLocation.lat}&lng=${currentLocation.lng}`);
          if (geoRes.ok) geoDetails = await geoRes.json();
        } catch { /* non-fatal */ }

        addBotMessage(res.reply, { extracted: res.extracted, geoDetails });
      } else {
        addBotMessage(res.reply);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      addBotMessage(`⚠️ ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, pendingComplaint, pendingImagePreview, duplicateContext, scrollToBottom, addBotMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- confirm image ticket via FastAPI /confirm ----- */
  const confirmImageTicket = useCallback(async (forceSubmit = false) => {
    if (!pendingImagePreview || !pendingImageFile) return;
    setSubmitting(true);

    try {
      const token = await getAuthToken();
      if (!token) {
        addBotMessage(t(selectedLanguage, "login_required"));
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
      formData.append("force_submit", String(forceSubmit));

      const res = await fetch(`${API_URL}/confirm`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Submission failed" }));
        const detail = err?.detail;
        if (res.status === 409 && detail?.code === "DUPLICATE_DETECTED" && detail?.duplicate) {
          setDuplicateContext({ mode: "image", duplicate: detail.duplicate as DuplicateMatch });
          addBotMessage(
            `⚠️ Similar complaint already exists (Ticket **${detail.duplicate.ticket_id}**, ${detail.duplicate.distance_m}m away, status: **${detail.duplicate.status}**). Type **UPVOTE** to support it, or type **YES AGAIN** to upload anyway.`,
          );
          return;
        }
        throw new Error(detail?.message || detail || "Failed to submit complaint");
      }

      const created = await res.json();

      // Trigger point awarding for AI-confirmed ticket
      try {
        if (userIdRef.current) {
          fetch("/api/gamification/award", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              ticket_id: created.ticket_id || created.id, 
              userId: userIdRef.current 
            }),
          }).catch(err => console.error("[Gamification] Failed to award points:", err));
        }
      } catch (err) {
        console.error("[Gamification] Error in award trigger:", err);
      }

      setSubmitted(true);
      if (userIdRef.current) clearSharedState(`jansamadhan_pending_state_${userIdRef.current}`).catch(console.error);
      setPendingImagePreview(null);
      setPendingImageFile(null);
      setPendingImageDataUrl(null);
      setPendingLocation(null);
      setDuplicateContext(null);
      setLocationConfirmed(false);
      addBotMessage(
        `${t(selectedLanguage, "success_msg")}\n\n🎫 Ticket ID: **${created.ticket_id}**\n📋 Issue: **${created.issue_name}**\n🏢 Department: **${created.authority}**\nStatus: **Submitted**\n\nYou can track your complaint from the "Your Tickets" section. Is there anything else I can help you with?`,
      );
    } catch (err) {
      const msg = toUserFacingError(err);
      addBotMessage(t(selectedLanguage, "fail_msg"));
    } finally {
      setSubmitting(false);
    }
  }, [pendingImagePreview, pendingImageFile, pendingLocation, addBotMessage]);

  /* ----- submit text-based complaint to Supabase ----- */
  const submitComplaint = useCallback(async (forceSubmit = false) => {
    if (!pendingComplaint) return;
    setSubmitting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      const accessToken = session?.access_token ?? "";

      if (!user) {
        addBotMessage(t(selectedLanguage, "login_required"));
        setSubmitting(false);
        return;
      }

      const submitLocation = pendingLocation ?? (await getLocation());
      const categoryId = categoryFromIssueType(pendingComplaint.issue_type);
      const severityLevel = severityToLevel(pendingComplaint.severity);

      const res = await fetch("/api/complaints", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
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
          force_submit: forceSubmit,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data?.code === "DUPLICATE_DETECTED" && data?.duplicate) {
          setDuplicateContext({ mode: "text", duplicate: data.duplicate as DuplicateMatch });
          addBotMessage(
            `⚠️ Similar complaint already exists (Ticket **${data.duplicate.ticket_id}**, ${data.duplicate.distance_m}m away, status: **${data.duplicate.status}**). Type **UPVOTE** to support it, or type **YES AGAIN** to upload anyway.`,
          );
          setSubmitting(false);
          return;
        }
        throw new Error(data.error || "Failed to submit complaint");
      }

      // Trigger point awarding for text-based ticket
      try {
        if (userIdRef.current) {
          fetch("/api/gamification/award", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              ticket_id: data.complaint?.ticket_id || data.complaint?.id, 
              userId: userIdRef.current 
            }),
          }).catch(err => console.error("[Gamification] Failed to award points:", err));
        }
      } catch (err) {
        console.error("[Gamification] Error in award trigger:", err);
      }

      setSubmitted(true);
      if (userIdRef.current) clearSharedState(`jansamadhan_pending_state_${userIdRef.current}`).catch(console.error);
      setPendingComplaint(null);
      setPendingLocation(null);
      setDuplicateContext(null);
      setLocationConfirmed(false);
      addBotMessage(
        `${t(selectedLanguage, "success_msg")}\n\n🎫 Ticket ID: **${data.complaint?.ticket_id ?? data.complaint?.id}**\nStatus: **Submitted**\n\nYou can track your complaint from the "Your Tickets" section. Is there anything else I can help you with?`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Submission failed";
      addBotMessage(t(selectedLanguage, "fail_msg"));
    } finally {
      setSubmitting(false);
    }
  }, [pendingComplaint, pendingLocation, addBotMessage]);

  const upvoteDuplicate = useCallback(async () => {
    if (!duplicateContext?.duplicate?.id) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/complaints", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complaint_id: duplicateContext.duplicate.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to upvote complaint");

      if (userIdRef.current) clearSharedState(`jansamadhan_pending_state_${userIdRef.current}`).catch(console.error);
      setDuplicateContext(null);
      setPendingComplaint(null);
      setPendingImagePreview(null);
      setPendingImageFile(null);
      setPendingImageDataUrl(null);
      setPendingLocation(null);
      setLocationConfirmed(false);
      addBotMessage(
        `✅ Upvoted ticket **${data.complaint?.ticket_id ?? duplicateContext.duplicate.ticket_id}**. Current status: **${data.complaint?.status ?? duplicateContext.duplicate.status}**. Thank you for supporting status transparency.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upvote failed";
      addBotMessage(`❌ ${msg}.`);
    } finally {
      setSubmitting(false);
    }
  }, [duplicateContext, addBotMessage]);

  /* ----- auto-scroll on new messages ----- */
  useEffect(() => scrollToBottom(), [messages, scrollToBottom]);

  /* ----- cleanup MediaRecorder on unmount ----- */
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
      if (micPulseRef.current) micPulseRef.current.kill();
      mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  /* ----- voice recording helpers ----- */
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType || "audio/webm" });
        audioChunksRef.current = [];

        // Stop GSAP pulse
        if (micPulseRef.current) { micPulseRef.current.kill(); micPulseRef.current = null; }
        if (micBtnRef.current) gsap.to(micBtnRef.current, { scale: 1, boxShadow: "none", duration: 0.25, ease: "power2.out" });

        if (blob.size < 500) {
          addBotMessage(t(selectedLanguage, "recording_short"));
          setIsRecording(false);
          return;
        }

        setIsRecording(false);
        setIsTranscribing(true);

        // Animate mic button to "transcribing" state
        if (micBtnRef.current) gsap.to(micBtnRef.current, { scale: 0.9, opacity: 0.6, duration: 0.2, ease: "power2.out" });

        try {
          const formData = new FormData();
          formData.append("file", blob, "recording.webm");

          const res = await fetch("/api/stt", { method: "POST", body: formData, headers: { "X-Language": selectedLanguage! } });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "STT failed" }));
            throw new Error(err.error || "Speech-to-text failed");
          }

          const { transcript } = await res.json();
          if (!transcript || !transcript.trim()) {
            addBotMessage(t(selectedLanguage, "could_not_recognize"));
            return;
          }

          // Auto-fill and send
          setInput(transcript.trim());
          // We need a small delay so React processes the setInput before handleSend reads it
          setTimeout(() => {
            // Manually push the message through since handleSend reads from state
            const text = transcript.trim();
            setMessages((prev) => [...prev, { id: Math.random().toString(36).slice(2, 10), role: "user", text: `${text}` }]);
            scrollToBottom();
            historyRef.current.push({ role: "user", text });
            setInput("");
            setIsLoading(true);

            sendToGemini(historyRef.current)
              .then((geminiRes) => {
                historyRef.current.push({ role: "model", text: geminiRes.reply });
                if (geminiRes.extracted) {
                  if (geminiRes.extracted.confidence < 0.6) {
                    setPendingComplaint(null);
                    setPendingImagePreview(null);
                    setPendingImageDataUrl(null);
                    setPendingLocation(null);
                    setLocationConfirmed(false);
                    setDuplicateContext(null);
                    addBotMessage(t(selectedLanguage, "low_confidence"));
                    return;
                  }
                  setPendingComplaint(geminiRes.extracted);
                  setPendingImagePreview(null);
                  setPendingImageDataUrl(null);
                  setDuplicateContext(null);
                  getLocation().then((currentLocation) => {
                    setPendingLocation(currentLocation);
                    setLocationConfirmed(false);
                    fetch(`${API_URL}/geocode?lat=${currentLocation.lat}&lng=${currentLocation.lng}`)
                      .then((r) => r.ok ? r.json() : null)
                      .catch(() => null)
                      .then((geoDetails) => addBotMessage(geminiRes.reply, { extracted: geminiRes.extracted, geoDetails }));
                  });
                } else {
                  addBotMessage(geminiRes.reply);
                }
              })
              .catch((err) => {
                const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
                addBotMessage(`⚠️ ${msg}`);
              })
              .finally(() => setIsLoading(false));
          }, 50);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Speech recognition failed";
          addBotMessage(`⚠️ ${msg}`);
        } finally {
          setIsTranscribing(false);
          if (micBtnRef.current) gsap.to(micBtnRef.current, { scale: 1, opacity: 1, duration: 0.25, ease: "power2.out" });
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);

      // GSAP pulse animation on the mic button
      if (micBtnRef.current) {
        gsap.fromTo(micBtnRef.current, { scale: 1 }, { scale: 1.1, duration: 0.15, ease: "power2.out" });
        micPulseRef.current = gsap.to(micBtnRef.current, {
          boxShadow: "0 0 0 8px rgba(239,68,68,0.25)",
          duration: 0.8,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: 0.15,
        });
      }

      // 30-second safety timeout
      recordingTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, 30000);
      addBotMessage(t(selectedLanguage, "mic_denied"));
    } catch (err) {
      console.error("Microphone access error:", err);
      addBotMessage(t(selectedLanguage, "mic_denied"));
    }
  }, [addBotMessage, scrollToBottom, selectedLanguage]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const handleMicClick = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

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

  /* ---------- Shared input bar content ---------- */
  const inputBarContent = (
    <>
      {hasPending && pendingLocation && (
        <div className="mb-2 rounded-xl border border-gray-200 bg-gray-50 p-2 dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
          <div className="mb-2">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{t(selectedLanguage, "detected_location")}</p>
          </div>
          <div
            className="overflow-hidden transition-all duration-300 ease-in-out"
            style={{ maxHeight: isMapExpanded ? '400px' : '0px', opacity: isMapExpanded ? 1 : 0 }}
          >
            {isMapExpanded && (
              <LocationPinPicker
                key={pendingLocation.timestamp}
                lat={pendingLocation.lat}
                lng={pendingLocation.lng}
                onPinMove={(lat, lng) => {
                  setPendingLocation((prev) => ({ lat, lng, accuracy: prev?.accuracy ?? 9999, timestamp: new Date().toISOString() }));
                  setLocationConfirmed(false);
                }}
              />
            )}
          </div>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setLocationConfirmed(true)} className="rounded-md bg-[#4f392e] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#b4725a] transition-all duration-200 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#b4725a] focus:ring-offset-2 dark:bg-[#C9A84C] dark:text-black dark:hover:bg-[#d4b45c] dark:focus:ring-[#C9A84C] dark:focus:ring-offset-[#161616]">
                {t(selectedLanguage, "confirm_location_btn")}
              </button>
              <button type="button" onClick={async () => { const loc = await getLocation(); setPendingLocation(loc); setLocationConfirmed(false); }} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 dark:border-[#2a2a2a] dark:text-gray-200 dark:hover:bg-[#2a2a2a] dark:focus:ring-[#2a2a2a] dark:focus:ring-offset-[#161616]">
                {t(selectedLanguage, "move_pin_gps")}
              </button>
              <span className={`text-[11px] transition-colors duration-200 ${locationConfirmed ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
                {locationConfirmed ? t(selectedLanguage, "location_confirmed") : t(selectedLanguage, "move_pin_if_needed")}
              </span>
            </div>
            <button type="button" onClick={() => setIsMapExpanded(!isMapExpanded)} className="flex shrink-0 items-center gap-1 px-2 py-1 rounded text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-[#2a2a2a]">
              {isMapExpanded ? (<><ChevronDown size={14} />{t(selectedLanguage, "hide_map")}</>) : (<><ChevronUp size={14} />{t(selectedLanguage, "show_map")}</>)}
            </button>
          </div>
        </div>
      )}
      {isTranscribing && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs text-purple-700 dark:border-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
          <Loader2 size={14} className="animate-spin" />
          {t(selectedLanguage, "transcribing")}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button onClick={() => fileInputRef.current?.click()} disabled={isLoading || submitting || isRecording || isTranscribing} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-500 transition-all duration-200 hover:bg-[#b4725a] hover:text-white hover:border-[#b4725a] hover:shadow-md disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[#b4725a] focus:ring-offset-2 dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-400 dark:hover:bg-[#C9A84C] dark:hover:text-black dark:hover:border-[#C9A84C] dark:focus:ring-[#C9A84C] dark:focus:ring-offset-[#161616]" aria-label="Upload photo" title="Upload a photo of the issue">
          <Plus size={18} />
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
        <button ref={micBtnRef} onClick={handleMicClick} disabled={isLoading || submitting || isTranscribing} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-40 ${isRecording ? "border-red-400 bg-red-500 text-white hover:bg-red-600 dark:border-red-500 dark:bg-red-600 dark:hover:bg-red-700 focus:ring-red-400 dark:focus:ring-red-500 dark:focus:ring-offset-[#161616]" : "border-gray-200 bg-gray-50 text-gray-500 hover:bg-[#b4725a] hover:text-white hover:border-[#b4725a] hover:shadow-md dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-400 dark:hover:bg-[#C9A84C] dark:hover:text-black dark:hover:border-[#C9A84C] focus:ring-[#b4725a] dark:focus:ring-[#C9A84C] dark:focus:ring-offset-[#161616]"}`} aria-label={isRecording ? "Stop recording" : "Start voice input"} title={isRecording ? "Tap to stop recording" : "Tap to speak your complaint"}>
          {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder={duplicateContext ? t(selectedLanguage, "type_upvote") : hasPending ? t(selectedLanguage, "confirm_location_prompt") : t(selectedLanguage, "describe_issue")} disabled={submitting} className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-800 outline-none transition-all duration-200 placeholder:text-gray-400 focus:border-[#b4725a] focus:ring-2 focus:ring-[#b4725a]/20 focus:bg-white dark:border-[#2a2a2a] dark:bg-[#1e1e1e] dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-[#C9A84C] dark:focus:ring-[#C9A84C]/20 dark:focus:bg-[#252525]" />
        <button onClick={handleSend} disabled={isLoading || submitting || !input.trim()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4f392e] text-white transition-all duration-200 hover:bg-[#b4725a] hover:shadow-md disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[#b4725a] focus:ring-offset-2 dark:bg-[#C9A84C] dark:text-black dark:hover:bg-[#d4b45c] dark:focus:ring-[#C9A84C] dark:focus:ring-offset-[#161616]" aria-label="Send message">
          <Send size={16} />
        </button>
      </div>
    </>
  );

  /* ---------- Messages content (shared between initial & active) ---------- */
  const messagesContent = (
    <>
      {messages.map((msg) => (
        <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
          <div
            className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === "user"
                ? "rounded-br-sm bg-[#b4725a] text-white dark:bg-[#C9A84C] dark:text-black"
                : "rounded-bl-sm bg-gray-100 text-gray-800 dark:bg-[#252525] dark:text-gray-100"
            }`}
          >
            {msg.imageUrl && (
              <img src={msg.imageUrl} alt="Uploaded issue" className="mb-2 rounded-lg max-h-40 w-full object-cover" />
            )}
            {!msg.imagePreview && renderMarkdown(msg.text)}
            {msg.extracted && (
              <div className="mt-3 rounded-lg border border-gray-300 bg-white p-3 text-xs dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
                <p className="mb-2 font-semibold text-gray-700 dark:text-gray-200">{t(selectedLanguage, "confirm_complaint")}</p>
                <table className="w-full text-left">
                  <tbody>
                    {([
                      [t(selectedLanguage, "tbl_title"), msg.extracted.title],
                      [t(selectedLanguage, "tbl_issue"), msg.extracted.issue_type],
                      [t(selectedLanguage, "tbl_severity"), msg.extracted.severity],
                      [t(selectedLanguage, "tbl_location"), msg.geoDetails?.formatted_address || t(selectedLanguage, "detecting")],
                      [t(selectedLanguage, "tbl_desc"), msg.extracted.description],
                      [t(selectedLanguage, "tbl_digipin"), msg.geoDetails?.digipin || t(selectedLanguage, "detecting")],
                    ] as [string, string][]).map(([label, value]) => (
                      <tr key={label} className="border-b border-gray-100 last:border-0 dark:border-[#2a2a2a]">
                        <td className="py-1 pr-2 font-medium text-gray-500 dark:text-gray-400">{label}</td>
                        <td className="py-1 text-gray-800 dark:text-gray-200">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-center font-semibold text-amber-600 dark:text-amber-400">{t(selectedLanguage, "type_yes")}</p>
              </div>
            )}
            {msg.imagePreview && (
              <div className="mt-3 w-full max-w-[34rem] rounded-lg border border-gray-300 bg-white p-3 text-xs dark:border-[#2a2a2a] dark:bg-[#1e1e1e]">
                <p className="mb-2 font-semibold text-gray-700 dark:text-gray-200">{t(selectedLanguage, "confirm_complaint")}</p>
                <div className={`grid gap-3 ${pendingImageDataUrl ? "grid-cols-[96px_minmax(0,1fr)]" : "grid-cols-1"}`}>
                  {pendingImageDataUrl && (
                    <div className="h-24 w-24 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-[#2a2a2a] dark:bg-[#252525]">
                      <img src={pendingImageDataUrl} alt="Issue photo" className="h-full w-full object-contain" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-left">
                      {[
                        [t(selectedLanguage, "tbl_title"), msg.imagePreview.title],
                        [t(selectedLanguage, "tbl_issue"), msg.imagePreview.issue_name],
                        [t(selectedLanguage, "tbl_severity"), `${msg.imagePreview.severity} (${msg.imagePreview.severity_db})`],
                        [t(selectedLanguage, "tbl_location"), msg.imagePreview.formatted_address],
                        [t(selectedLanguage, "tbl_desc"), msg.imagePreview.description],
                        [t(selectedLanguage, "tbl_digipin"), msg.imagePreview.digipin],
                      ].map(([label, value]) => {
                        const shouldTrimLongText = !expandedImagePreview[msg.id] && (label === t(selectedLanguage, "tbl_location") || label === t(selectedLanguage, "tbl_desc")) && value.length > 110;
                        const displayValue = shouldTrimLongText ? `${value.slice(0, 110)}...` : value;
                        return (
                          <React.Fragment key={label}>
                            <p className="py-0.5 font-medium text-gray-500 dark:text-gray-400">{label}</p>
                            <p className="py-0.5 break-words text-gray-800 dark:text-gray-200">{displayValue}</p>
                          </React.Fragment>
                        );
                      })}
                    </div>
                    <button type="button" onClick={() => toggleImagePreviewDetails(msg.id)} className="mt-2 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors dark:text-gray-400 dark:hover:bg-[#2a2a2a] dark:hover:text-gray-100">
                      {expandedImagePreview[msg.id] ? (<><ChevronUp size={13} /> {t(selectedLanguage, "show_less")}</>) : (<><ChevronDown size={13} /> {t(selectedLanguage, "show_full_details")}</>)}
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-center font-semibold text-amber-600 dark:text-amber-400">{t(selectedLanguage, "type_yes")}</p>
              </div>
            )}
          </div>
        </div>
      ))}
      {isLoading && (
        <div className="flex justify-start">
          <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2 dark:bg-[#252525]">
            <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
            <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
            <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
          </div>
        </div>
      )}
      {submitting && (
        <div className="flex justify-start">
          <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2 text-sm text-gray-600 dark:bg-[#252525] dark:text-gray-300">
            <Loader2 size={16} className="animate-spin" /> {t(selectedLanguage, "submitting")}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div
      ref={panelRef}
      className="flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-[#161616]"
    >
      {/* -- Language Picker (centered full-page) -- */}
      {!selectedLanguage && (
        <div className="flex flex-col items-center justify-center h-full gap-6 p-6">
          <div className="flex flex-col items-center gap-2">
            <div
              className="w-20 h-20 bg-[#C9A84C]"
              style={{
                WebkitMaskImage: 'url(/Emblem.svg)',
                WebkitMaskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskImage: 'url(/Emblem.svg)',
                maskSize: 'contain',
                maskRepeat: 'no-repeat',
                maskPosition: 'center',
              }}
            />
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Choose your language</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Select a language to get started</p>
          </div>
          <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setSelectedLanguage(lang.code)}
                className="px-4 py-3 rounded-xl border border-gray-200 dark:border-[#2a2a2a] hover:border-[#b4725a] dark:hover:border-[#C9A84C] hover:bg-[#b4725a]/10 dark:hover:bg-[#C9A84C]/10 transition-all text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-[#b4725a] dark:hover:text-[#C9A84C] bg-white dark:bg-[#1e1e1e] shadow-sm"
              >
                {lang.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* -- Unified View: Smoothly transitions from Claude-like welcome to active chat -- */}
      {selectedLanguage && !isHistoryInitialized && (
        <div className="flex flex-col items-center justify-center h-full relative">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400/50" />
        </div>
      )}

      {selectedLanguage && isHistoryInitialized && (
        <div className="flex flex-col h-full relative">
          {/* Top spacer for initial vertical centering */}
          <div 
            className={`transition-[flex-grow] duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] ${isInitialView ? 'flex-grow-[1.5]' : 'flex-grow-0'}`}
          />

          {/* Language change button - absolutely positioned to not affect centering */}
          <div className="absolute top-0 right-0 p-4 z-10 transition-opacity duration-300">
            <button
              onClick={() => setSelectedLanguage(null)}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors bg-white/80 backdrop-blur-sm dark:bg-[#1e1e1e]/80 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-[#333] shadow-sm"
              title="Change Language"
            >
              <Globe size={14} className="text-[#b4725a] dark:text-[#C9A84C]" />
              <span>Change Language</span>
            </button>
          </div>

          {/* Centered greeting container */}
          <div 
            ref={greetingRef} 
            className={`w-full max-w-3xl mx-auto flex flex-col items-center px-4 shrink-0 transition-all duration-500 ease-in-out overflow-hidden transform origin-bottom ${isInitialView ? 'gap-6 opacity-100 max-h-[400px] mb-8 scale-100 translate-y-0 visible' : 'gap-0 opacity-0 max-h-0 mb-0 scale-95 -translate-y-8 invisible'}`}
          >
            <div
              className="w-32 h-32 bg-[#C9A84C] shrink-0 transition-all duration-500"
              style={{
                WebkitMaskImage: 'url(/Emblem.svg)',
                WebkitMaskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskImage: 'url(/Emblem.svg)',
                maskSize: 'contain',
                maskRepeat: 'no-repeat',
                maskPosition: 'center',
              }}
            />
            {messages.length > 0 && (
              <div className="rounded-2xl bg-white dark:bg-[#1e1e1e] px-6 py-4 text-sm leading-relaxed text-gray-800 dark:text-gray-100 shadow-sm border border-gray-100 dark:border-[#2a2a2a] max-w-lg text-center whitespace-pre-wrap shrink-0">
                {renderMarkdown(messages[0].text)}
              </div>
            )}
          </div>

          {/* Messages area (Expands when active) */}
          <div 
            ref={scrollRef} 
            className={`w-full min-h-0 overflow-y-auto px-4 ${skipAnimation ? "" : "transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)]"} ${isInitialView ? "flex-[0_1_0%] opacity-0 h-0 py-0" : "flex-[1_1_0%] opacity-100 py-3"}`}
            style={{ display: "flex", flexDirection: "column" }}
          >
            <div ref={messagesAreaRef} className={`max-w-3xl mx-auto flex flex-col space-y-3 min-h-full w-full ${skipAnimation ? "" : "transition-opacity duration-300 delay-300"} ${isInitialView ? "opacity-0" : "opacity-100"}`}>
              <div className="flex-1 min-h-0"></div>
              {messagesContent}
            </div>
          </div>

          {/* Bottom input bar */}
          <div ref={inputBarRef} className="flex-shrink-0 px-4 pb-4 pt-2 relative z-20">
            <div className="max-w-3xl mx-auto rounded-2xl border border-gray-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1e1e1e] px-3 py-3 shadow-lg">
              {inputBarContent}
            </div>
          </div>

          {/* Bottom spacer for initial vertical centering */}
          <div 
            className={`transition-[flex-grow] duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] ${isInitialView ? 'flex-grow-[1]' : 'flex-grow-0'}`}
          />
        </div>
      )}
    </div>
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
