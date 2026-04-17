'use client';

import React, { useState, useRef, useEffect } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { User, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/src/lib/supabase';
import { useTheme } from './ThemeProvider';
import ReCAPTCHA from 'react-google-recaptcha';

// Register the hook to ensure proper cleanup in React strict mode
gsap.registerPlugin(useGSAP);

export interface AnimatedAuthProps {
  themeColor?: string;
  themeColorDark?: string;
  glowColor?: string;
  glowColorDark?: string;
  backgroundColor?: string;
  backgroundColorDark?: string;
  backdrop?: string;
  backdropDark?: string;
  placeholderColor?: string;
  placeholderColorDark?: string;
  textColor?: string;
  textColorDark?: string;
  secondaryTextColor?: string;
  secondaryTextColorDark?: string;
  borderColor?: string;
  borderColorDark?: string;
  transitionTintColor?: string;
  transitionTintColorDark?: string;
  leftPanelTitle?: string;
  leftPanelSubtitle?: string;
  rightPanelTitle?: string;
  rightPanelSubtitle?: string;
  // new props for panel text colors
  leftPanelTitleColor?: string;
  leftPanelSubtitleColor?: string;
  rightPanelTitleColor?: string;
  rightPanelSubtitleColor?: string;
  loginTitle?: string;
  signupTitle?: string;
  leftPanelImage?: string;
  rightPanelImage?: string;
  redirectTo?: string;
}

const roles = ['admin', 'authority', 'citizen', 'worker'] as const;
type Role = (typeof roles)[number];

export const ANIMATED_AUTH_TRANSITION_TINT_COLOR = '#d2b48c';

export const AUTH_COLORS_LIGHT = {
  themeColor: '#cbae86',
  glowColor: 'rgba(32, 10, 8, 0.46)',
  backgroundColor: '#e4e3e1',
  backdrop: '#f4f0d9',
  placeholderColor: 'rgb(0, 0, 0)',
  textColor: '#000000',
  secondaryTextColor: '#6b7280',
  borderColor: '#d1d5db',
  transitionTintColor: '#d2b48c',
  /* dark-mode fallbacks included for convenience */
  themeColorDark: '#8c6a5d',
  glowColorDark: 'rgba(16, 5, 4, 0.6)',
  backgroundColorDark: '#2c241b',
  backdropDark: '#1f1515',
  placeholderColorDark: 'rgba(255, 255, 255, 1)',
  textColorDark: '#ffffff',
  secondaryTextColorDark: '#9ca3af',
  borderColorDark: '#4b5563',
  transitionTintColorDark: '#2c241b',
};

export const AUTH_COLORS_DARK = {
  themeColor: '#8c6a5d',
  glowColor: 'rgba(16, 5, 4, 0.6)',
  backgroundColor: '#2c241b',
  backdrop: '#1f1515',
  placeholderColor: 'rgba(255, 255, 255, 1)',
  textColor: '#ffffff',
  secondaryTextColor: '#9ca3af',
  borderColor: '#4b5563',
  transitionTintColor: '#2c241b',
  /* include original light fallbacks where sensible */
  themeColorDark: '#8c6a5d',
  glowColorDark: 'rgba(16, 5, 4, 0.6)',
  backgroundColorDark: '#2c241b',
  backdropDark: '#1f1515',
  placeholderColorDark: 'rgba(255, 255, 255, 1)',
  textColorDark: '#ffffff',
  secondaryTextColorDark: '#9ca3af',
  borderColorDark: '#4b5563',
  transitionTintColorDark: '#2c241b',
};

export default function AnimatedAuth({
  themeColor = AUTH_COLORS_LIGHT.themeColor,
  themeColorDark = AUTH_COLORS_DARK.themeColor,
  glowColor = AUTH_COLORS_LIGHT.glowColor,
  glowColorDark = AUTH_COLORS_DARK.glowColor,
  backgroundColor = AUTH_COLORS_LIGHT.backgroundColor,
  backgroundColorDark = AUTH_COLORS_DARK.backgroundColor,
  backdrop = AUTH_COLORS_LIGHT.backdrop,
  backdropDark = AUTH_COLORS_DARK.backdrop,
  placeholderColor = AUTH_COLORS_LIGHT.placeholderColor,
  placeholderColorDark = AUTH_COLORS_DARK.placeholderColor,
  textColor = AUTH_COLORS_LIGHT.textColor,
  textColorDark = AUTH_COLORS_DARK.textColor,
  secondaryTextColor = AUTH_COLORS_LIGHT.secondaryTextColor,
  secondaryTextColorDark = AUTH_COLORS_DARK.secondaryTextColor,
  borderColor = AUTH_COLORS_LIGHT.borderColor,
  borderColorDark = AUTH_COLORS_DARK.borderColor,
  transitionTintColor = AUTH_COLORS_LIGHT.transitionTintColor,
  transitionTintColorDark = AUTH_COLORS_DARK.transitionTintColor,
  leftPanelTitle = 'WELCOME BACK!',
  leftPanelSubtitle = 'Lorem ipsum dolor sit amet consectetur adipisicing.',
  rightPanelTitle = 'HELLO FRIEND!',
  rightPanelSubtitle = 'Enter your personal details and start your journey with us.',
  // default text colors
  leftPanelTitleColor = '#ffffff',
  leftPanelSubtitleColor = 'rgb(209 213 219)',
  rightPanelTitleColor = '#ffffff',
  rightPanelSubtitleColor = 'rgb(209 213 219)',
  loginTitle = 'Login',
  signupTitle = 'Sign Up',
  leftPanelImage = '/Authsideimage.jpeg',
  rightPanelImage = '/Authsideimage.jpeg',
  redirectTo,
}: AnimatedAuthProps) {
  const { theme } = useTheme();

  useEffect(() => {
    if (window.location.hash.includes('access_token')) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const preload = (src?: string) => {
      if (!src) return;
      const img = new Image();
      img.src = src;
    };
    preload(leftPanelImage);
    preload(rightPanelImage);
  }, [leftPanelImage, rightPanelImage]);

  const [isLogin, setIsLogin] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [signupPhone, setSignupPhone] = useState('');
  const [signupRole, setSignupRole] = useState<Role>('citizen');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim() ?? '';
  const isRecaptchaConfigured = recaptchaSiteKey.length > 0;

  const isDark = theme === 'dark';
  const activeThemeColor = isDark ? themeColorDark : themeColor;
  const activeGlowColor = isDark ? glowColorDark : glowColor;
  const activeBackgroundColor = isDark ? backgroundColorDark : backgroundColor;
  const activeBackdrop = isDark ? backdropDark : backdrop;
  const activePlaceholderColor = isDark ? placeholderColorDark : placeholderColor;
  const activeTextColor = isDark ? textColorDark : textColor;
  const activeSecondaryTextColor = isDark ? secondaryTextColorDark : secondaryTextColor;
  const activeBorderColor = isDark ? borderColorDark : borderColor;
  const activeTransitionTintColor = isDark ? transitionTintColorDark : transitionTintColor;

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

    if (!isRecaptchaConfigured) {
      setError('reCAPTCHA is not configured. Add NEXT_PUBLIC_RECAPTCHA_SITE_KEY in apps/web/.env.local and restart the dev server.');
      return;
    }

    let token = recaptchaRef.current?.getValue();
    if (!token) {
      if (process.env.NODE_ENV === 'development') {
        token = 'dev_mock_token';
      } else {
        setError('Please complete the reCAPTCHA.');
        return;
      }
    }

    const verifyRes = await fetch('/api/verify-recaptcha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.success) {
      const message =
        typeof verifyData.message === 'string' && verifyData.message.trim().length > 0
          ? verifyData.message
          : 'reCAPTCHA verification failed. Please try again.';
      setError(message);
      recaptchaRef.current?.reset();
      return;
    }

    setLoading(true);

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });

    if (loginError) {
      setError(loginError.message);
      setLoading(false);
      recaptchaRef.current?.reset();
      return;
    }

    const userId = data.user?.id;
    if (!userId) {
      setError('Login failed. Please try again.');
      setLoading(false);
      recaptchaRef.current?.reset();
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      setError('Could not verify role. Please try again.');
      await supabase.auth.signOut();
      setLoading(false);
      recaptchaRef.current?.reset();
      return;
    }

    if (!roles.includes(profile.role as Role)) {
      setError('Invalid user role. Please contact support.');
      await supabase.auth.signOut();
      setLoading(false);
      recaptchaRef.current?.reset();
      return;
    }

    setLoading(false);
    router.push(redirectTo || `/${profile.role}`);
  };

  const handleSignup = async () => {
    if (!signupEmail || !signupPassword) {
      setError('Email and password are required.');
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
          role: signupRole,
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

  const handleGoogleAuth = async () => {
    setError(null);
    setMessage('');
    setLoading(true);

    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (googleError) {
      setError(googleError.message);
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!loginEmail.trim()) {
      setError('Please enter your email address first.');
      return;
    }
    setError('');
    setMessage('');
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      loginEmail.trim(),
      { redirectTo: `${window.location.origin}/auth/callback` }
    );

    setLoading(false);
    if (resetError) {
      setError(resetError.message);
    } else {
      setMessage('Password reset link sent! Check your email.');
    }
  };

  return (
    <div
      className="flex items-center justify-center min-h-screen p-4 bg-cover bg-center"
      style={{ background: activeBackdrop }}
    >
      {/* Main Container */}
      <div
        ref={containerRef}
        className="relative w-full max-w-4xl h-[600px] md:h-[500px] rounded-xl overflow-hidden flex"
        style={{
          backgroundColor: activeBackgroundColor,
          boxShadow: `0 0 20px ${activeGlowColor}, inset 0 0 0 1px ${activeThemeColor}40`,
          '--auth-placeholder': activePlaceholderColor,
          '--auth-text': activeTextColor,
          '--auth-text-secondary': activeSecondaryTextColor,
          '--auth-border': activeBorderColor,
        } as React.CSSProperties}
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
          <h2 className="text-3xl font-bold text-[var(--auth-text)] mb-8">{loginTitle}</h2>
          <div className="space-y-4">
            <div className="relative border-b border-[var(--auth-border)] pb-2">
              <input
                type="email"
                placeholder="Email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full bg-transparent outline-none text-[var(--auth-text)] text-sm placeholder-[var(--auth-placeholder)]"
              />
              <span className="absolute right-0 text-[var(--auth-text-secondary)]">
                <Mail size={16} />
              </span>
            </div>
            <div className="relative border-b border-[var(--auth-border)] pb-2">
              <input
                type={showLoginPassword ? 'text' : 'password'}
                placeholder="Password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-transparent outline-none text-[var(--auth-text)] text-sm placeholder-[var(--auth-placeholder)]"
              />
              <button
                type="button"
                onClick={() => setShowLoginPassword((prev) => !prev)}
                className="absolute right-0 text-xs text-[var(--auth-text-secondary)] hover:text-[var(--auth-text)]"
              >
                {showLoginPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="flex justify-end mt-1">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="relative text-xs transition-colors"
                style={{ color: activeThemeColor }}
                onMouseEnter={(e) => {
                  const underline = e.currentTarget.querySelector('.forgot-underline');
                  if (underline) gsap.to(underline, { scaleX: 1, duration: 0.3, ease: 'power2.out' });
                }}
                onMouseLeave={(e) => {
                  const underline = e.currentTarget.querySelector('.forgot-underline');
                  if (underline) gsap.to(underline, { scaleX: 0, duration: 0.3, ease: 'power2.in' });
                }}
              >
                Forgot Password?
                <span
                  className="forgot-underline absolute left-0 bottom-0 w-full h-[1px] origin-left"
                  style={{ backgroundColor: activeThemeColor, transform: 'scaleX(0)' }}
                />
              </button>
            </div>
          </div>
          {isRecaptchaConfigured ? (
            <ReCAPTCHA
              ref={recaptchaRef}
              sitekey={recaptchaSiteKey}
              theme={isDark ? 'dark' : 'light'}
              size="normal"
              className="mt-4"
              onExpired={() => {
                setError('reCAPTCHA expired. Please complete it again.');
              }}
              onErrored={() => {
                console.warn(
                  'reCAPTCHA widget error. The site key may be restricted by domain (e.g., localhost is not whitelisted) or key type.'
                );
                if (process.env.NODE_ENV !== 'development') {
                  setError('reCAPTCHA failed to load. Please try again later.');
                }
              }}
            />
          ) : (
            <p className="mt-4 text-xs text-red-300">
              reCAPTCHA is unavailable. Add NEXT_PUBLIC_RECAPTCHA_SITE_KEY in apps/web/.env.local and restart.
            </p>
          )}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full mt-5 py-3 rounded-full text-white font-semibold transition-transform hover:scale-105"
            style={{ backgroundColor: activeThemeColor }}
          >
            {loading ? 'Please wait...' : loginTitle}
          </button>
          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={loading}
            className="w-full mt-3 py-3 rounded-full text-[var(--auth-text)] text-sm font-semibold border bg-transparent transition-transform transition-colors hover:scale-105 hover:bg-white/10 flex items-center justify-center space-x-2"
            style={{ borderColor: activeThemeColor }}
          >
            {loading ? (
              'Please wait...'
            ) : (
              <>
                <img
                  src="/Googe_icon.svg"
                  alt="Google logo"
                  className="h-5 w-5"
                />
                <span>Login via Google</span>
              </>
            )}
          </button>
          <p className="text-xs text-[var(--auth-text-secondary)] mt-4 text-center">
            Don&apos;t have an account?{' '}
            <button onClick={() => setIsLogin(false)} style={{ color: activeThemeColor }} className="hover:underline">
              Sign Up
            </button>
          </p>
        </div>

        {/* === SIGN UP FORM (Right Side) === */}
        <div
          ref={signupFormRef}
          className="absolute right-0 top-0 w-full md:w-1/2 h-full flex flex-col justify-start px-8 md:px-12 pointer-events-auto z-10 overflow-y-auto md:overflow-hidden pt-6"
        >
          <h2 className="text-2xl font-bold text-[var(--auth-text)] mb-4">{signupTitle}</h2>
          <div className="space-y-2.5">
            <div className="relative border-b border-[var(--auth-border)] pb-2">
              <input
                type="text"
                placeholder="Full name"
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                className="w-full bg-transparent outline-none text-[var(--auth-text)] text-xs placeholder-[var(--auth-placeholder)]"
              />
              <span className="absolute right-0 text-[var(--auth-text-secondary)]">
                <User size={16} />
              </span>
            </div>
            <div className="relative border-b border-[var(--auth-border)] pb-2">
              <input
                type="email"
                placeholder="Email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                className="w-full bg-transparent outline-none text-[var(--auth-text)] text-xs placeholder-[var(--auth-placeholder)]"
              />
              <span className="absolute right-0 text-[var(--auth-text-secondary)]">
                <Mail size={16} />
              </span>
            </div>
            <div className="relative border-b border-[var(--auth-border)] pb-2">
              <input
                type="text"
                placeholder="Phone"
                value={signupPhone}
                onChange={(e) => setSignupPhone(e.target.value)}
                className="w-full bg-transparent outline-none text-[var(--auth-text)] text-xs placeholder-[var(--auth-placeholder)]"
              />
              <span className="absolute right-0 text-[var(--auth-text-secondary)]">
                <User size={16} />
              </span>
            </div>
            <div className="relative border-b border-[var(--auth-border)] pb-2">
              <input
                type={showSignupPassword ? 'text' : 'password'}
                placeholder="Password"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                className="w-full bg-transparent outline-none text-[var(--auth-text)] text-xs placeholder-[var(--auth-placeholder)]"
              />
              <button
                type="button"
                onClick={() => setShowSignupPassword((prev) => !prev)}
                className="absolute right-0 text-xs text-[var(--auth-text-secondary)] hover:text-[var(--auth-text)]"
              >
                {showSignupPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <div>
              <p className="text-[11px] mb-1.5" style={{ color: activePlaceholderColor }}>Role</p>
              <div className="flex flex-wrap gap-3">
                {roles.map((role) => (
                  <label key={role} className="text-[11px] capitalize flex items-center gap-1.5" style={{ color: activePlaceholderColor }}>
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
            style={{ backgroundColor: activeThemeColor }}
          >
            {loading ? 'Please wait...' : signupTitle}
          </button>
          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={loading}
            className="w-full mt-3 py-2.5 rounded-full text-[var(--auth-text)] text-sm font-semibold border bg-transparent transition-transform transition-colors hover:scale-105 hover:bg-white/10 flex items-center justify-center space-x-2"
            style={{ borderColor: activeThemeColor }}
          >
            {loading ? (
              'Please wait...'
            ) : (
              <>
                <img
                  src="/Googe_icon.svg"
                  alt="Google logo"
                  className="h-4 w-4"
                />
                <span>Signup via Google</span>
              </>
            )}
          </button>
          <p className="text-[11px] text-[var(--auth-text-secondary)] mt-3 text-center">
            Already have an account?{' '}
            <button onClick={() => setIsLogin(true)} style={{ color: activeThemeColor }} className="hover:underline">
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
            style={{ backgroundColor: activeTransitionTintColor }}
          />

          {/* Overlay Content Left (Visible when overlay is on the left) */}
          <div
            ref={overlayLeftTextRef}
            className="absolute inset-0 z-20 flex flex-col justify-between pt-6 pb-6 items-start px-12 w-[calc(100%/0.55*0.5)]"
          >
            <h1
              className="text-4xl font-bold leading-tight"
              style={{ color: leftPanelTitleColor }}
            >
              {leftPanelTitle}
            </h1>
            <p
              className="text-sm max-w-[260px] leading-relaxed mt-3"
              style={{ color: leftPanelSubtitleColor }}
            >
              {leftPanelSubtitle}
            </p>
          </div>

          {/* Overlay Content Right (Visible when overlay is on the right) */}
          <div
            ref={overlayRightTextRef}
            className="absolute right-0 inset-y-0 z-20 flex flex-col justify-between pt-6 pb-6 items-end px-12 w-[calc(100%/0.55*0.5)] text-right opacity-0"
          >
            <h1
              className="text-4xl font-bold leading-tight"
              style={{ color: rightPanelTitleColor }}
            >
              {rightPanelTitle}
            </h1>
            <p
              className="text-sm max-w-[260px] leading-relaxed mt-3"
              style={{ color: rightPanelSubtitleColor }}
            >
              {rightPanelSubtitle}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
