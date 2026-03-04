'use client';

import React, { useState, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { User, Lock, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabase';

// Register the hook to ensure proper cleanup in React strict mode
gsap.registerPlugin(useGSAP);

export interface AnimatedAuthProps {
  themeColor?: string;
  glowColor?: string;
  backgroundColor?: string;
  backdropClassName?: string;
  transitionTintColor?: string;
  leftPanelTitle?: string;
  leftPanelSubtitle?: string;
  rightPanelTitle?: string;
  rightPanelSubtitle?: string;
  loginTitle?: string;
  signupTitle?: string;
  leftPanelImage?: string;
  rightPanelImage?: string;
}

const roles = ['admin', 'authority', 'citizen', 'worker'] as const;
type Role = (typeof roles)[number];

export const ANIMATED_AUTH_TRANSITION_TINT_COLOR = '#d2b48c';

export default function AnimatedAuth({
  themeColor = '#8b5cf6', // Default purple (Tailwind violet-500)
  glowColor = 'rgba(139, 92, 246, 0.5)',
  backgroundColor = '#0a0a0a',
  backdropClassName = 'bg-gradient-to-br from-slate-100 via-stone-100 to-amber-50',
  transitionTintColor = ANIMATED_AUTH_TRANSITION_TINT_COLOR,
  leftPanelTitle = 'WELCOME BACK!',
  leftPanelSubtitle = 'Lorem ipsum dolor sit amet consectetur adipisicing.',
  rightPanelTitle = 'HELLO FRIEND!',
  rightPanelSubtitle = 'Enter your personal details and start your journey with us.',
  loginTitle = 'Login',
  signupTitle = 'Sign Up',
  leftPanelImage = '/Authsideimage.jpeg',
  rightPanelImage = '/Authsideimage.jpeg',
}: AnimatedAuthProps) {
  const [isLogin, setIsLogin] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [signupPhone, setSignupPhone] = useState('');
  const [signupCity, setSignupCity] = useState('');
  const [signupDepartment, setSignupDepartment] = useState('');
  const [signupRole, setSignupRole] = useState<Role>('citizen');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const overlayTintRef = useRef<HTMLDivElement>(null);
  const leftBgRef = useRef<HTMLDivElement>(null);
  const rightBgRef = useRef<HTMLDivElement>(null);
  const overlayLeftTextRef = useRef<HTMLDivElement>(null);
  const overlayRightTextRef = useRef<HTMLDivElement>(null);
  const loginFormRef = useRef<HTMLDivElement>(null);
  const signupFormRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.fromTo(
      containerRef.current,
      { autoAlpha: 0, y: 40, scale: 0.98 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.8,
        ease: 'power3.out',
      }
    );
  }, { scope: containerRef });

  useGSAP(() => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.inOut', duration: 0.8 } });

    if (isLogin) {
      // Transition to Login State (Overlay moves right)
      tl.to(overlayTintRef.current, { autoAlpha: 1, duration: 0.25, ease: 'power1.out' }, 0)
      tl.to(overlayRef.current, {
        left: '45%',
        clipPath: 'polygon(20% 0%, 100% 0%, 100% 100%, 0% 100%)',
      }, 0)
      .to(overlayTintRef.current, { autoAlpha: 0, duration: 0.35, ease: 'power1.in' }, 0.55)
      .to(overlayLeftTextRef.current, { autoAlpha: 0, x: -50 }, 0)
      .to(overlayRightTextRef.current, { autoAlpha: 1, x: 0 }, 0.2)
      .to(leftBgRef.current, { autoAlpha: 0 }, 0)
      .to(rightBgRef.current, { autoAlpha: 1 }, 0)
      .to(signupFormRef.current, { autoAlpha: 0, x: 50 }, 0)
      .to(loginFormRef.current, { autoAlpha: 1, x: 0 }, 0.2);
    } else {
      // Transition to Sign Up State (Overlay moves left)
      tl.to(overlayTintRef.current, { autoAlpha: 1, duration: 0.25, ease: 'power1.out' }, 0)
      tl.to(overlayRef.current, {
        left: '0%',
        clipPath: 'polygon(0% 0%, 100% 0%, 80% 100%, 0% 100%)',
      }, 0)
      .to(overlayTintRef.current, { autoAlpha: 0, duration: 0.35, ease: 'power1.in' }, 0.55)
      .to(overlayRightTextRef.current, { autoAlpha: 0, x: 50 }, 0)
      .to(overlayLeftTextRef.current, { autoAlpha: 1, x: 0 }, 0.2)
      .to(rightBgRef.current, { autoAlpha: 0 }, 0)
      .to(leftBgRef.current, { autoAlpha: 1 }, 0)
      .to(loginFormRef.current, { autoAlpha: 0, x: -50 }, 0)
      .to(signupFormRef.current, { autoAlpha: 1, x: 0 }, 0.2);
    }
  }, { dependencies: [isLogin], scope: containerRef });

  const handleLogin = async () => {
    setError('');
    setMessage('');
    setLoading(true);

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });

    if (loginError) {
      setError(loginError.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push('/map');
  };

  const handleSignup = async () => {
    if (!signupEmail || !signupPassword || !signupCity) {
      setError('Email, password and city are required.');
      return;
    }

    setError('');
    setMessage('');
    setLoading(true);

    const { data, error: signupError } = await supabase.auth.signUp({
      email: signupEmail.trim(),
      password: signupPassword,
    });

    if (signupError) {
      setError(signupError.message);
      setLoading(false);
      return;
    }

    const userId = data.user?.id;
    const userEmail = data.user?.email;

    if (userId && userEmail) {
      const { error: profileError } = await supabase.from('profiles').upsert(
        {
          id: userId,
          email: userEmail,
          full_name: signupName || null,
          phone: signupPhone || null,
          department: signupDepartment || null,
          role: signupRole,
          city: signupCity,
        },
        { onConflict: 'id' }
      );

      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    setMessage('Account created. Please login.');
    setIsLogin(true);
  };

  return (
    <div className={`flex items-center justify-center min-h-screen ${backdropClassName} p-4`}>
      {/* Main Container */}
      <div
        ref={containerRef}
        className="relative w-full max-w-4xl h-[600px] md:h-[500px] rounded-xl overflow-hidden flex"
        style={{
          backgroundColor,
          boxShadow: `0 0 20px ${glowColor}, inset 0 0 0 1px ${themeColor}40`,
        }}
      >
        {(error || message) && (
          <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2 px-4 py-2 text-sm rounded-lg border border-white/20 bg-black/70 text-white">
            {error || message}
          </div>
        )}
        
        {/* === LOGIN FORM (Left Side) === */}
        <div 
          ref={loginFormRef}
          className="absolute left-0 top-0 w-full md:w-1/2 h-full flex flex-col justify-center px-8 md:px-12 opacity-0 -translate-x-12 pointer-events-auto z-10"
        >
          <h2 className="text-3xl font-bold text-white mb-8">{loginTitle}</h2>
          <div className="space-y-4">
            <div className="relative border-b border-gray-600 pb-2">
              <input 
                type="email" 
                placeholder="Email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full bg-transparent outline-none text-white text-sm placeholder-gray-400"
              />
              <span className="absolute right-0 text-gray-400">
                <Mail size={16} />
              </span>
            </div>
            <div className="relative border-b border-gray-600 pb-2">
              <input 
                type={showLoginPassword ? 'text' : 'password'}
                placeholder="Password" 
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-transparent outline-none text-white text-sm placeholder-gray-400"
              />
              <button
                type="button"
                onClick={() => setShowLoginPassword((prev) => !prev)}
                className="absolute right-0 text-xs text-gray-300 hover:text-white"
              >
                {showLoginPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <button 
            onClick={handleLogin}
            disabled={loading}
            className="w-full mt-8 py-3 rounded-full text-white font-semibold transition-transform hover:scale-105"
            style={{ backgroundColor: themeColor }}
          >
            {loading ? 'Please wait...' : loginTitle}
          </button>
          <p className="text-xs text-gray-400 mt-6 text-center">
            Don't have an account?{' '}
            <button onClick={() => setIsLogin(false)} style={{ color: themeColor }} className="hover:underline">
              Sign Up
            </button>
          </p>
        </div>

        {/* === SIGN UP FORM (Right Side) === */}
        <div 
          ref={signupFormRef}
          className="absolute right-0 top-0 w-full md:w-1/2 h-full flex flex-col justify-start px-8 md:px-12 pointer-events-auto z-10 overflow-y-auto md:overflow-hidden pt-6"
        >
          <h2 className="text-2xl font-bold text-white mb-4">{signupTitle}</h2>
          <div className="space-y-2.5">
            <div className="relative border-b border-gray-600 pb-2">
              <input 
                type="text" 
                placeholder="Full name"
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                className="w-full bg-transparent outline-none text-white text-xs placeholder-gray-400"
              />
              <span className="absolute right-0 text-gray-400">
                <User size={16} />
              </span>
            </div>
            <div className="relative border-b border-gray-600 pb-2">
              <input 
                type="email" 
                placeholder="Email" 
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                className="w-full bg-transparent outline-none text-white text-xs placeholder-gray-400"
              />
              <span className="absolute right-0 text-gray-400">
                <Mail size={16} />
              </span>
            </div>
            <div className="relative border-b border-gray-600 pb-2">
              <input 
                type="text" 
                placeholder="Phone"
                value={signupPhone}
                onChange={(e) => setSignupPhone(e.target.value)}
                className="w-full bg-transparent outline-none text-white text-xs placeholder-gray-400"
              />
              <span className="absolute right-0 text-gray-400">
                <User size={16} />
              </span>
            </div>
            <div className="relative border-b border-gray-600 pb-2">
              <input 
                type="text" 
                placeholder="City (required)"
                value={signupCity}
                onChange={(e) => setSignupCity(e.target.value)}
                className="w-full bg-transparent outline-none text-white text-xs placeholder-gray-400"
              />
              <span className="absolute right-0 text-gray-400">
                <User size={16} />
              </span>
            </div>
            <div className="relative border-b border-gray-600 pb-2">
              <input 
                type="text" 
                placeholder="Department"
                value={signupDepartment}
                onChange={(e) => setSignupDepartment(e.target.value)}
                className="w-full bg-transparent outline-none text-white text-xs placeholder-gray-400"
              />
              <span className="absolute right-0 text-gray-400">
                <User size={16} />
              </span>
            </div>
            <div className="relative border-b border-gray-600 pb-2">
              <input 
                type={showSignupPassword ? 'text' : 'password'}
                placeholder="Password" 
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                className="w-full bg-transparent outline-none text-white text-xs placeholder-gray-400"
              />
              <button
                type="button"
                onClick={() => setShowSignupPassword((prev) => !prev)}
                className="absolute right-0 text-xs text-gray-300 hover:text-white"
              >
                {showSignupPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 mb-1.5">Role</p>
              <div className="flex flex-wrap gap-3">
                {roles.map((role) => (
                  <label key={role} className="text-[11px] text-gray-200 capitalize flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="signup-role"
                      value={role}
                      checked={signupRole === role}
                      onChange={() => setSignupRole(role)}
                    />
                    {role}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <button 
            onClick={handleSignup}
            disabled={loading}
            className="w-full mt-4 py-2.5 rounded-full text-white text-sm font-semibold transition-transform hover:scale-105"
            style={{ backgroundColor: themeColor }}
          >
            {loading ? 'Please wait...' : signupTitle}
          </button>
          <p className="text-[11px] text-gray-400 mt-3 text-center">
            Already have an account?{' '}
            <button onClick={() => setIsLogin(true)} style={{ color: themeColor }} className="hover:underline">
              Login
            </button>
          </p>
        </div>

        {/* === ANIMATED OVERLAY === */}
        <div
          ref={overlayRef}
          className="absolute top-0 h-full w-[55%] z-20 hidden md:flex overflow-hidden shadow-2xl"
          style={{
            // Initial state: Covering left side (Sign Up mode)
            left: '0%',
            clipPath: 'polygon(0% 0%, 100% 0%, 80% 100%, 0% 100%)',
          }}
        >
          <div
            ref={leftBgRef}
            className="absolute inset-0 bg-cover bg-center z-0"
            style={{ backgroundImage: `url('${leftPanelImage}')` }}
          />
          <div
            ref={rightBgRef}
            className="absolute inset-0 bg-cover bg-center z-0 opacity-0 invisible"
            style={{ backgroundImage: `url('${rightPanelImage}')` }}
          />
          <div
            ref={overlayTintRef}
            className="absolute inset-0 opacity-0 z-10"
            style={{ backgroundColor: transitionTintColor }}
          />

          {/* Overlay Content Left (Visible when overlay is on the left) */}
          <div 
            ref={overlayLeftTextRef}
            className="absolute inset-0 z-20 flex flex-col justify-center items-start px-12 w-[calc(100%/0.55*0.5)]"
          >
            <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
              {leftPanelTitle.split(' ').map((word, i) => (
                <React.Fragment key={i}>{word}<br/></React.Fragment>
              ))}
            </h1>
            <p className="text-sm text-gray-300 max-w-[200px] leading-relaxed">
              {leftPanelSubtitle}
            </p>
          </div>

          {/* Overlay Content Right (Visible when overlay is on the right) */}
          <div 
            ref={overlayRightTextRef}
            className="absolute right-0 inset-y-0 z-20 flex flex-col justify-center items-end px-12 w-[calc(100%/0.55*0.5)] text-right opacity-0"
          >
            <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
              {rightPanelTitle.split(' ').map((word, i) => (
                <React.Fragment key={i}>{word}<br/></React.Fragment>
              ))}
            </h1>
            <p className="text-sm text-gray-300 max-w-[200px] leading-relaxed">
              {rightPanelSubtitle}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}