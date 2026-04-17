'use client'

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/src/lib/supabase"
import type { Database } from "@/src/types/database.types"
import { User, Activity, Terminal, MessageCircle } from "lucide-react"
import gsap from "gsap"

type ComplaintRow = Database["public"]["Tables"]["complaints"]["Row"]

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [tickets, setTickets] = useState<ComplaintRow[]>([])
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [ticketCount, setTicketCount] = useState(0)

  // Edit Profile States
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [editData, setEditData] = useState({ fullName: "", username: "" })
  const [isSaving, setIsSaving] = useState(false)

  // WhatsApp Linking States
  const [waLinkCode, setWaLinkCode] = useState<string | null>(null)
  const [isGeneratingWA, setIsGeneratingWA] = useState(false)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const leftColRef = useRef<HTMLDivElement>(null)
  const emblemRef = useRef<HTMLDivElement>(null)
  const rightBoxesRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const currentUser = data?.user
      setUser(currentUser)

      if (currentUser) {
        // Fetch Tickets on load
        supabase
          .from("complaints")
          .select("*", { count: 'exact' })
          .eq("citizen_id", currentUser.id)
          .order("created_at", { ascending: false })
          .limit(3)
          .then(({ data, count }) => {
            if (data) setTickets(data)
            if (count !== null) setTicketCount(count)
            setLoadingTickets(false)
          })

        // Fetch Profile on load (including wa_link_code and phone)
        supabase
          .from("profiles")
          .select("*")
          .eq("id", currentUser.id)
          .single()
          .then(({ data }) => {
            if (data) {
              setProfile(data)
              if (data.whatsapp_link_code) setWaLinkCode(data.whatsapp_link_code)
            }
          })

        // Real-time subscription to auto-update on new tickets
        const channel = supabase
          .channel(`profile-complaints-${currentUser.id}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "complaints",
              filter: `citizen_id=eq.${currentUser.id}`,
            },
            (payload) => {
              setTickets((prev) => [payload.new as ComplaintRow, ...prev].slice(0, 3));
              setTicketCount((prev) => prev + 1);
            }
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "complaints",
              filter: `citizen_id=eq.${currentUser.id}`,
            },
            (payload) => {
              setTickets((prev) =>
                prev.map((t) => (t.id === payload.new.id ? (payload.new as ComplaintRow) : t))
              );
            }
          )
          .subscribe();

        // Real-time subscription to profile changes (for WhatsApp linking)
        const profileChannel = supabase
          .channel(`profile-data-${currentUser.id}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "profiles",
              filter: `id=eq.${currentUser.id}`,
            },
            (payload) => {
              setProfile(payload.new)
              if (payload.new.whatsapp_link_code) {
                setWaLinkCode(payload.new.whatsapp_link_code)
              } else if (payload.new.phone) {
                setWaLinkCode(null)
              }
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel)
          supabase.removeChannel(profileChannel)
        }
      }
    })
  }, [])

  useEffect(() => {
    if (!user || !containerRef.current) return;
    
    // Cleanup any existing animations when unmounting
    const ctx = gsap.context(() => {
      const tl = gsap.timeline()

      // 1. Initial container flash/glitch
      gsap.set(containerRef.current, { opacity: 0, scale: 0.98 })
      tl.to(containerRef.current, {
        opacity: 1,
        scale: 1,
        duration: 0.8,
        ease: "power2.out"
      })

      // 2. Left column text stagger
      if (leftColRef.current) {
        const leftElements = gsap.utils.toArray(leftColRef.current.children)
        tl.fromTo(leftElements, 
          { x: -50, opacity: 0 },
          { x: 0, opacity: 1, stagger: 0.15, duration: 0.6, ease: "power3.out" },
          "-=0.4"
        )
      }

      // 3. Subtle Emblem Fade-in
      if (emblemRef.current) {
        tl.fromTo(emblemRef.current,
          { opacity: 0, filter: 'blur(8px)' },
          { opacity: 1, filter: 'blur(0px)', duration: 1.5, ease: "power2.inOut" },
          "-=0.4"
        )
      }

      // 4. Right boxes slide in
      if (rightBoxesRef.current) {
        const boxes = gsap.utils.toArray(rightBoxesRef.current.children)
        tl.fromTo(boxes, 
          { x: 50, opacity: 0 },
          { x: 0, opacity: 1, stagger: 0.2, duration: 0.6, ease: "power3.out" },
          "-=0.6"
        )
      }

      // 5. Bottom terminal lines stagger
      if (bottomRef.current && !loadingTickets) {
        const bottomElements = gsap.utils.toArray(bottomRef.current.children)
        tl.fromTo(bottomElements, 
          { y: 30, opacity: 0 },
          { y: 0, opacity: 1, stagger: 0.15, duration: 0.5, ease: "power2.out" },
          "-=0.4"
        )
      }
    }, [user, loadingTickets]) // re-run animation slightly when tickets finally load if delayed

    return () => ctx.revert()
  }, [user, loadingTickets])

  // Interactive click handler for UI elements
  const handleInteraction = (e: React.MouseEvent<HTMLElement>) => {
    // Only fire animation on the exact targeted button, unless it's an input event
    if ((e.target as HTMLElement).tagName.toLowerCase() === 'input') return;
    
    const el = e.currentTarget
    
    // Quick flash/glitch effect on interaction
    gsap.timeline()
      .to(el, { scale: 0.95, duration: 0.05 })
      .to(el, { opacity: 0.5, duration: 0.05 })
      .to(el, { opacity: 1, scale: 1, duration: 0.1, ease: "back.out(2)" })
      .to(el, { x: 2, duration: 0.05, yoyo: true, repeat: 3 })
  }

  // Handle clicking a specific ticket link
  const handleTicketClick = (e: React.MouseEvent<HTMLElement>, ticketId: string) => {
    e.stopPropagation()
    handleInteraction(e)
    
    // Wait for the glitch animation to visually complete, then safely route user
    setTimeout(() => {
      router.push(`/citizen/tickets?highlight=${ticketId}`)
    }, 350)
  }

  // Handlers for Profile Editing
  const nameDisplay = user?.user_metadata?.full_name ?? user?.email?.split('@')[0] ?? 'Citizen'
  const emailDisplay = user?.email || ""
  const usernameDisplay = user?.user_metadata?.username ?? `${nameDisplay.split(' ')[0]}_user`

  const handleEditProfile = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    handleInteraction(e)
    setEditData({ fullName: nameDisplay, username: usernameDisplay })
    setIsEditingProfile(true)
  }

  const handleCancelEdit = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    handleInteraction(e)
    setIsEditingProfile(false)
  }

  const handleSaveProfile = async (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    handleInteraction(e)
    if (!editData.fullName.trim() || !editData.username.trim() || isSaving) return;

    setIsSaving(true)
    const { data, error } = await supabase.auth.updateUser({
      data: { 
        full_name: editData.fullName,
        username: editData.username.replace(/[^a-zA-Z0-9_]/g, '_') // sanitize username
      }
    })
    
    if (!error && data?.user) {
      setUser(data.user)
    }
    
    // Delay hiding the form to let the animation play out
    setTimeout(() => {
      setIsEditingProfile(false)
      setIsSaving(false)
    }, 300)
  }

  const handleGenerateWACode = async (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    handleInteraction(e)
    if (!user || isGeneratingWA) return;

    setIsGeneratingWA(true)
    const code = `LINK-${Math.floor(1000 + Math.random() * 9000)}`
    
    // Save to profiles table
    const { error } = await supabase.from('profiles').update({ whatsapp_link_code: code }).eq('id', user.id)
    
    if (!error) {
      setWaLinkCode(code)
    } else {
      console.error("Failed to generate WA link code", error)
    }
    setIsGeneratingWA(false)
  }

  const handleUnlinkWA = async (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    handleInteraction(e)
    if (!user || isGeneratingWA) return;

    const confirmed = confirm("Are you sure you want to unlink your WhatsApp account? You will need to generate a new code and link again to continue reporting via message.")
    if (!confirmed) return;

    setIsGeneratingWA(true)
    
    // Clear phone and any old code from profiles table
    const { error } = await supabase
      .from('profiles')
      .update({ 
        phone: null, 
        whatsapp_link_code: null 
      })
      .eq('id', user.id)
    
    if (!error) {
      setWaLinkCode(null)
      setProfile((prev: any) => ({ ...prev, phone: null, whatsapp_link_code: null }))
    } else {
      console.error("Failed to unlink WhatsApp", error)
    }
    setIsGeneratingWA(false)
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full bg-[#fcfbf9] dark:bg-[#0c0c0c] font-mono">
        <div className="text-gray-800 dark:text-[#f59e0b] animate-pulse text-xl shadow-none dark:shadow-[0_0_10px_#f59e0b]">
          INITIALIZING SECURE LINK...
        </div>
      </div>
    )
  }

  // Inline terminal CSS styling
  const styles = `
    .terminal-container {
      background-color: #fcfbf9;
      transition: background-color 0.3s ease;
    }
    .dark .terminal-container {
      background-color: #0c0c0c;
      background-image: radial-gradient(circle, #1a1200 0%, #000000 100%);
    }
    .scanlines {
      display: none;
    }
    .dark .scanlines {
      display: block;
      background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.1));
      background-size: 100% 4px;
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 10;
    }
    .flicker {
      animation: flicker 0.15s infinite;
    }
    @keyframes flicker {
      0% { opacity: 0.98; }
      50% { opacity: 1; }
      100% { opacity: 0.98; }
    }
    .glow-amber {
      color: #1f2937;
    }
    .dark .glow-amber {
      color: #f59e0b;
      text-shadow: 0 0 5px rgba(245, 158, 11, 0.4), 0 0 10px rgba(245, 158, 11, 0.2);
    }
    .glow-border {
      border: 1px solid #e5e7eb;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
    }
    .dark .glow-border {
      border: 2px solid rgba(245, 158, 11, 0.6);
      box-shadow: inset 0 0 10px rgba(245, 158, 11, 0.1), 0 0 10px rgba(245, 158, 11, 0.2);
    }
    .amber-highlight {
      background-color: #e6ddc5;
      color: #1f2937;
    }
    .dark .amber-highlight {
      background-color: #f59e0b;
      color: #0c0c0c;
      box-shadow: 0 0 15px rgba(245, 158, 11, 0.5);
    }
    .interactive-item {
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .dark .interactive-item {
      cursor: crosshair;
    }
    .interactive-item:hover {
      background-color: #f3f4f6;
    }
    .dark .interactive-item:hover {
      background-color: rgba(245, 158, 11, 0.1);
      box-shadow: inset 0 0 10px rgba(245, 158, 11, 0.2);
    }
    button {
      outline: none;
    }
    .emblem-mask {
      background-color: #374151;
      filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));
    }
    .dark .emblem-mask {
      background-color: #f59e0b;
      filter: drop-shadow(0 0 15px rgba(245, 158, 11, 0.8));
    }
  `

  // Derived stats
  const pendingTickets = tickets.filter(t => t.status !== 'resolved' && t.status !== 'rejected').length

  return (
    <div className="h-full w-full relative overflow-y-auto overflow-x-hidden terminal-container p-4 sm:p-8 font-mono text-xs sm:text-sm md:text-base flex flex-col font-bold" ref={containerRef}>
      <style>{styles}</style>
      <div className="scanlines flicker"></div>
      
      {/* Content wrapper with z-index above scanlines */}
      <div className="relative z-20 flex flex-col min-h-full glow-amber max-w-7xl mx-auto w-full">
        
        {/* Top Section */}
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 mb-8 cursor-default">
          
          {/* Left Column: Intro */}
          <div className="flex-1 flex flex-col justify-center gap-4" ref={leftColRef}>
            <button className="text-xl sm:text-3xl tracking-widest interactive-item w-fit px-2 py-1 rounded text-left" onClick={handleInteraction}>
              Hi there,
            </button>
            
            <button 
              className="amber-highlight px-4 sm:px-6 py-2 text-3xl sm:text-4xl md:text-5xl font-extrabold text-left w-full md:w-fit uppercase tracking-widest hover:scale-[1.02] transition-transform active:scale-95 break-words"
              onClick={handleInteraction}
            >
              I'm <br className="md:hidden" />{nameDisplay}
            </button>
            
            <div className="space-y-3 text-lg sm:text-xl md:text-2xl pl-5 border-l-4 border-[#f59e0b]/60 py-2">
              <button className="flex items-center gap-3 interactive-item w-full text-left px-2 py-1 rounded" onClick={handleInteraction}>
                <span className="text-gray-800 dark:text-[#f59e0b] w-2 h-2 bg-[#C9A84C] dark:bg-[#f59e0b] shadow-none dark:shadow-[0_0_8px_#f59e0b]"></span> 
                Citizen
              </button>
              <button className="flex items-center gap-3 interactive-item w-full text-left px-2 py-1 rounded" onClick={handleInteraction}>
                <span className="text-gray-800 dark:text-[#f59e0b] w-2 h-2 bg-[#C9A84C] dark:bg-[#f59e0b] shadow-none dark:shadow-[0_0_8px_#f59e0b]"></span> 
                Jan Samadhan User
              </button>
            </div>
            
            <button className="mt-4 pt-4 interactive-item px-2 py-2 rounded max-w-md text-left cursor-crosshair" onClick={handleInteraction}>
              <div className="mb-2 text-lg">Welcome to Jan Samadhan</div>
              <div className="text-gray-700 dark:text-[#f59e0b]/80">{`>>`} Scroll or click items to interact</div>
            </button>
          </div>
          
          {/* Center Column: Emblem */}
          <div className="hidden lg:flex flex-col items-center justify-center relative w-64 lg:w-80 flex-shrink-0" ref={emblemRef}>
            <div className="absolute inset-0 bg-[#C9A84C]/10 dark:bg-[#f59e0b]/10 blur-3xl rounded-full pointer-events-none"></div>
            <button 
              className="w-full aspect-[3/4] max-h-[400px] emblem-mask hover:scale-105 transition-transform duration-500 cursor-pointer dark:cursor-crosshair"
              onClick={handleInteraction}
              style={{
                WebkitMaskImage: 'url(/Emblem.svg)',
                WebkitMaskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
                maskImage: 'url(/Emblem.svg)',
                maskSize: 'contain',
                maskRepeat: 'no-repeat',
                maskPosition: 'center'
              }}
            />

          </div>
          
          {/* Right Column: Stats & Details */}
          <div className="flex-1 flex flex-col gap-6 justify-center" ref={rightBoxesRef}>
            
            {/* Profile Details Box */}
            <div className="glow-border p-5 rounded-lg bg-white dark:bg-black/40 backdrop-blur-md text-left w-full relative overflow-hidden group cursor-default">
              <div className="absolute inset-0 bg-[#C9A84C]/5 dark:bg-[#f59e0b]/5 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300 pointer-events-none"></div>
              
              <div className="relative z-10 flex justify-between items-center mb-5 border-b-2 border-gray-200 dark:border-[#f59e0b]/40 pb-3">
                <div className="flex items-center gap-3 font-bold text-lg sm:text-xl uppercase tracking-wider">
                  <User size={24} /> PROFILE DETAILS
                </div>
              </div>
              
              <div className="relative z-10 space-y-4">
                {/* Full Name Row */}
                <div className="flex flex-col sm:flex-row sm:justify-between border-b border-[#C9A84C] dark:border-[#f59e0b]/20 pb-2">
                  <span className="text-gray-600 dark:text-[#f59e0b]/70 tracking-wider pt-1">FULL NAME:</span>
                  {!isEditingProfile ? (
                    <span className="font-bold uppercase truncate">{nameDisplay}</span>
                  ) : (
                    <input 
                      type="text" 
                      value={editData.fullName}
                      onChange={(e) => setEditData({...editData, fullName: e.target.value})}
                      className="bg-[#C9A84C]/10 dark:bg-[#f59e0b]/10 border-b border-[#C9A84C] dark:border-[#f59e0b] text-gray-800 dark:text-[#f59e0b] focus:outline-none focus:bg-[#C9A84C]/20 dark:focus:bg-[#f59e0b]/20 px-2 py-1 font-bold uppercase w-full sm:w-1/2 text-left sm:text-right rounded-t transition-colors"
                      placeholder="ENTER FULL NAME"
                    />
                  )}
                </div>
                
                {/* Username Row */}
                <div className="flex flex-col sm:flex-row sm:justify-between border-b border-[#C9A84C] dark:border-[#f59e0b]/20 pb-2">
                  <span className="text-gray-600 dark:text-[#f59e0b]/70 tracking-wider pt-1">USERNAME:</span>
                  {!isEditingProfile ? (
                    <span className="font-bold truncate">[{usernameDisplay}]</span>
                  ) : (
                    <div className="flex w-full sm:w-1/2 justify-start sm:justify-end items-center">
                      <span className="mr-1 pt-1 opacity-70">[</span>
                      <input 
                        type="text" 
                        value={editData.username}
                        onChange={(e) => setEditData({...editData, username: e.target.value.replace(/\s+/g, '_').toLowerCase()})}
                        className="bg-[#C9A84C]/10 dark:bg-[#f59e0b]/10 border-b border-[#C9A84C] dark:border-[#f59e0b] text-gray-800 dark:text-[#f59e0b] focus:outline-none focus:bg-[#C9A84C]/20 dark:focus:bg-[#f59e0b]/20 px-2 py-1 font-bold w-[85%] text-left sm:text-right rounded-t transition-colors"
                        placeholder="ENTER USERNAME"
                      />
                      <span className="ml-1 pt-1 opacity-70">]</span>
                    </div>
                  )}
                </div>

                {/* Email Row (Readonly) */}
                <div className="flex flex-col sm:flex-row sm:justify-between">
                  <span className="text-gray-600 dark:text-[#f59e0b]/70 tracking-wider pt-1">REGISTERED EMAIL:</span>
                  <span className="font-bold break-all opacity-80 pt-1 text-left sm:text-right">[{emailDisplay}]</span>
                </div>
              </div>

              {/* Edit Action Buttons */}
              <div className="relative z-10 mt-6 pt-4 flex justify-end gap-3">
                {!isEditingProfile ? (
                  <button 
                    onClick={handleEditProfile}
                    className="amber-highlight px-5 py-2 font-bold tracking-widest text-sm sm:text-base uppercase hover:scale-[1.02] transition-transform active:scale-95 rounded shadow-sm dark:shadow-[0_0_15px_rgba(245,158,11,0.5)]"
                  >
                    [ EDIT DETAILS ]
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={handleCancelEdit}
                      className="border border-[#C9A84C] dark:border-[#f59e0b] text-gray-800 dark:text-[#f59e0b] hover:bg-[#C9A84C]/10 dark:hover:bg-[#f59e0b]/10 px-5 py-2 font-bold tracking-widest text-sm sm:text-base uppercase transition-colors rounded"
                    >
                      [ CANCEL ]
                    </button>
                    <button 
                      onClick={handleSaveProfile}
                      disabled={isSaving}
                      className="bg-green-600 text-[#0c0c0c] px-5 py-2 font-extrabold tracking-widest text-sm sm:text-base uppercase hover:scale-[1.02] transition-transform active:scale-95 disabled:opacity-50 rounded shadow-[0_0_15px_rgba(34,197,94,0.4)]"
                    >
                      {isSaving ? "[ SAVING... ]" : "[ SAVE CHANGES ]"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Jan Samadhan Stats Box */}
            <button 
              className="glow-border p-5 rounded-lg bg-white dark:bg-black/40 backdrop-blur-md interactive-item text-left w-full relative overflow-hidden group"
              onClick={handleInteraction}
            >
              <div className="absolute inset-0 bg-[#C9A84C]/5 dark:bg-[#f59e0b]/5 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300 pointer-events-none"></div>
              <div className="relative z-10 flex justify-between items-center mb-5 border-b-2 border-gray-200 dark:border-[#f59e0b]/40 pb-3">
                <div className="flex items-center gap-3 font-bold text-lg sm:text-xl uppercase tracking-wider">
                  <Activity size={24} /> JAN SAMADHAN STATS
                </div>
              </div>
              <div className="relative z-10 space-y-4">
                <div className="flex justify-between border-b border-[#C9A84C] dark:border-[#f59e0b]/20 pb-2">
                  <span className="text-gray-600 dark:text-[#f59e0b]/70">ISSUES REPORTED:</span>
                  <span className="font-bold">{loadingTickets ? "..." : ticketCount}</span>
                </div>
                <div className="flex justify-between border-b border-[#C9A84C] dark:border-[#f59e0b]/20 pb-2">
                  <span className="text-gray-600 dark:text-[#f59e0b]/70">RESOLUTIONS PENDING:</span>
                  <span className="font-bold">{loadingTickets ? "..." : pendingTickets}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-[#f59e0b]/70">SATISFACTION RATING:</span>
                  <span className="font-bold">4.8/5.0</span>
                </div>
              </div>
            </button>

            {/* WhatsApp Linking Box */}
            <div className="glow-border p-5 rounded-lg bg-white dark:bg-black/40 backdrop-blur-md text-left w-full relative overflow-hidden group cursor-default mt-2">
              <div className="absolute inset-0 bg-green-500/5 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300 pointer-events-none"></div>
              
              <div className="relative z-10 flex justify-between items-center mb-4 border-b-2 border-gray-200 dark:border-green-500/40 pb-3">
                <div className="flex items-center gap-3 font-bold text-lg sm:text-xl uppercase tracking-wider text-green-700 dark:text-green-500">
                  <MessageCircle size={24} /> LINK WHATSAPP
                </div>
              </div>

              <div className="relative z-10 space-y-4">
                <p className="text-gray-600 dark:text-gray-300 text-sm md:text-base leading-relaxed">
                  {profile?.phone 
                    ? "Your WhatsApp is securely linked. You can report issues directly via message." 
                    : "Connect your WhatsApp to sync reports directly to this dashboard."}
                </p>
                
                {profile?.phone ? (
                  <div className="space-y-4 pt-2">
                    <div className="p-4 border border-green-500/30 bg-green-600/10 dark:bg-green-500/10 rounded flex flex-col items-center justify-center text-center shadow-inner relative overflow-hidden group">
                      <div className="absolute inset-0 bg-green-500/5 scanlines pointer-events-none opacity-20"></div>
                      <span className="text-gray-600 dark:text-gray-400 text-xs mb-1 uppercase tracking-widest opacity-80">SECURE LINK ACTIVE</span>
                      <span className="text-xl sm:text-2xl font-black tracking-widest text-green-700 dark:text-green-400 drop-shadow-md">
                        {profile.phone.startsWith('+') ? profile.phone.slice(0, 3) : ''} **** {profile.phone.slice(-4)}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-500 text-xs font-bold uppercase tracking-tighter">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,1)]"></div>
                      ENCRYPTED CHANNEL VERIFIED
                    </div>

                    <button 
                      onClick={handleUnlinkWA}
                      disabled={isGeneratingWA}
                      className="w-full border border-red-500/50 text-red-500/80 hover:bg-red-500/10 px-4 py-2 font-bold tracking-widest text-[10px] uppercase transition-colors rounded mt-2"
                    >
                      {isGeneratingWA ? "[ PROCESSING... ]" : "[ UNLINK ACCOUNT ]"}
                    </button>
                  </div>
                ) : !waLinkCode ? (
                  <button 
                    onClick={handleGenerateWACode}
                    disabled={isGeneratingWA}
                    className="w-full bg-green-600 text-white dark:text-[#0c0c0c] px-4 py-3 font-extrabold tracking-widest text-sm uppercase hover:scale-[1.02] transition-transform active:scale-95 disabled:opacity-50 rounded shadow-[0_0_15px_rgba(34,197,94,0.4)]"
                  >
                    {isGeneratingWA ? "[ GENERATING CODE... ]" : "[ GENERATE LINK CODE ]"}
                  </button>
                ) : (
                  <div className="space-y-4 pt-2">
                    <div className="p-4 border border-green-500/30 bg-green-600/10 dark:bg-green-500/10 rounded flex flex-col items-center justify-center text-center shadow-inner">
                      <span className="text-gray-600 dark:text-gray-400 text-xs mb-1 uppercase tracking-widest opacity-80">YOUR SECRET CODE:</span>
                      <span className="text-2xl sm:text-3xl font-black tracking-widest text-green-700 dark:text-green-400 drop-shadow-md">{waLinkCode}</span>
                    </div>
                    
                    <a 
                      href={`https://wa.me/918178465273?text=${waLinkCode}`} 
                      target="_blank" rel="noreferrer"
                      className="block w-full text-center bg-green-600 text-white dark:text-[#0c0c0c] px-4 py-3 font-extrabold tracking-widest text-sm uppercase hover:scale-[1.02] transition-transform active:scale-95 rounded shadow-[0_0_15px_rgba(34,197,94,0.4)]"
                    >
                      [ OPEN WHATSAPP ]
                    </a>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
        
        {/* Bottom Section: Recent Activity & Terminal Prompt */}
        <div className="w-full flex-grow flex flex-col gap-4">
          <div 
            className="glow-border p-5 rounded-lg bg-white dark:bg-black/40 backdrop-blur-md flex flex-col mb-4 interactive-item text-left relative overflow-hidden group flex-shrink-0"
            onClick={handleInteraction}
          >
             <div className="absolute inset-0 bg-[#C9A84C]/5 dark:bg-[#f59e0b]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
             <div className="relative z-10 flex justify-between items-center mb-4 border-b-2 border-gray-200 dark:border-[#f59e0b]/40 pb-3 w-full">
                <div className="flex items-center gap-3 font-bold text-lg sm:text-xl uppercase tracking-wider w-full">
                  RECENT TICKET ACTIVITY
                </div>
                <div className="text-gray-500 dark:text-[#f59e0b]/60"><Terminal size={20} /></div>
              </div>
              <div className="relative z-10 space-y-3 font-mono text-sm sm:text-base leading-relaxed" ref={bottomRef}>
                {loadingTickets ? (
                  <div className="text-gray-400 dark:text-[#f59e0b]/50 animate-pulse tracking-widest">{">"} SEARCHING DATABASE...</div>
                ) : tickets.length === 0 ? (
                  <div className="text-gray-400 dark:text-[#f59e0b]/50 tracking-widest">{">"} NO TICKETS FOUND IN QUERY.</div>
                ) : (
                  tickets.map((ticket, i) => (
                    <button key={ticket.id} onClick={(e) => handleTicketClick(e, ticket.id)} className={`flex flex-wrap gap-x-2 gap-y-1 hover:bg-[#C9A84C]/10 dark:hover:bg-[#f59e0b]/10 p-1 -m-1 rounded transition-colors w-full text-left interactive-item ${i > 0 && ticket.status !== 'submitted' && ticket.status !== 'in_progress' ? 'opacity-80' : ''}`}>
                      <span className="text-gray-800 dark:text-[#f59e0b] mr-2 flex-shrink-0">{'>'} TICKET #{ticket.ticket_id || ticket.id.slice(0,6)}:</span>
                      <span className="text-gray-700 dark:text-[#f59e0b]/80 uppercase">Status - {ticket.status?.replace('_', ' ') || "unknown"}</span>
                      <span className="hidden sm:inline"> | </span>
                      <span className="w-full sm:w-auto">{ticket.title}</span>
                    </button>
                  ))
                )}
              </div>
          </div>

          <button 
            className="mt-auto text-xl sm:text-3xl font-bold py-2 tracking-widest flex items-center w-fit interactive-item px-4 rounded"
            onClick={handleInteraction}
          >
            USER: ~$ <span className="animate-pulse w-4 h-6 sm:h-8 bg-[#C9A84C] dark:bg-[#f59e0b] shadow-none dark:shadow-[0_0_10px_#f59e0b] ml-2 block"></span>
          </button>
        </div>

      </div>
    </div>
  )
}
