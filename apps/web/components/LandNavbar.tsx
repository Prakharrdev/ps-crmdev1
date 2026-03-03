'use client';

import { useState } from 'react';
import { useTheme } from './ThemeProvider';

const navigation = [
  { name: 'About Us', href: '#' },
  { name: 'Features', href: '#' },
  { name: 'Marketplace', href: '#' },
  { name: 'Contact', href: '#' },
];

// Sun icon
function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
    </svg>
  );
}

// Moon icon
function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
    </svg>
  );
}

export default function LandNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const isDark = theme === 'dark';

  const headerClass = isDark
    ? 'absolute inset-x-0 top-0 z-50 border-b border-white/10 bg-gray-950/80 backdrop-blur-md'
    : 'absolute inset-x-0 top-0 z-50 border-b border-black/10 bg-white/80 backdrop-blur-md';

  const linkClass = isDark
    ? 'text-sm font-semibold leading-6 text-white'
    : 'text-sm font-semibold leading-6 text-gray-800 hover:text-emerald-600 transition-colors';

  const mobileDrawerClass = isDark
    ? 'fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-gray-900 p-6 sm:max-w-sm sm:ring-1 sm:ring-white/10'
    : 'fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-white p-6 sm:max-w-sm sm:ring-1 sm:ring-black/10';

  const mobileLinkClass = isDark
    ? '-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-white hover:bg-white/5'
    : '-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-gray-800 hover:bg-gray-100';

  const hamburgerClass = isDark
    ? '-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-200'
    : '-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-700';

  const closeButtonClass = isDark
    ? '-m-2.5 rounded-md p-2.5 text-gray-200'
    : '-m-2.5 rounded-md p-2.5 text-gray-700';

  const logoTextClass = isDark ? 'text-white' : 'text-gray-900';

  return (
    <header className={headerClass}>
      <nav aria-label="Global" className="flex items-center justify-between p-6 lg:px-8">
        {/* Logo */}
        <div className="flex lg:flex-1">
          <a href="#" className="-m-1.5 p-1.5">
            <span className={`text-xl font-bold tracking-tight ${logoTextClass}`}>
              Leaf<span className="text-emerald-400">line</span>
            </span>
          </a>
        </div>

        {/* Mobile: theme toggle + hamburger */}
        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className={`rounded-full p-2 transition-colors ${isDark ? 'text-yellow-300 hover:bg-white/10' : 'text-gray-600 hover:bg-black/5'}`}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className={hamburgerClass}
          >
            <span className="sr-only">Open main menu</span>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
        </div>

        {/* Desktop nav links */}
        <div className="hidden lg:flex lg:gap-x-12">
          {navigation.map((item) => (
            <a key={item.name} href={item.href} className={linkClass}>
              {item.name}
            </a>
          ))}
        </div>

        {/* Desktop auth + theme toggle */}
        <div className="hidden lg:flex lg:flex-1 lg:justify-end lg:items-center lg:gap-x-4">
          {/* Theme toggle pill */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border transition-all duration-300 ${isDark
                ? 'border-white/20 text-yellow-300 bg-white/5 hover:bg-white/10'
                : 'border-black/10 text-gray-600 bg-black/5 hover:bg-black/10'
              }`}
          >
            {isDark ? (
              <>
                <SunIcon />
                <span>Light</span>
              </>
            ) : (
              <>
                <MoonIcon />
                <span>Dark</span>
              </>
            )}
          </button>

          <a
            href="#"
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-400 transition-colors"
          >
            Sign in
          </a>
          <a href="#" className={linkClass}>
            Log in <span aria-hidden="true">&rarr;</span>
          </a>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black/20" onClick={() => setMobileMenuOpen(false)} />
          <div className={mobileDrawerClass}>
            <div className="flex items-center justify-between">
              <a href="#" className="-m-1.5 p-1.5">
                <span className={`text-xl font-bold tracking-tight ${logoTextClass}`}>
                  Leaf<span className="text-emerald-400">line</span>
                </span>
              </a>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className={closeButtonClass}
              >
                <span className="sr-only">Close menu</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mt-6 flow-root">
              <div className={`-my-6 divide-y ${isDark ? 'divide-white/10' : 'divide-black/10'}`}>
                <div className="space-y-2 py-6">
                  {navigation.map((item) => (
                    <a
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={mobileLinkClass}
                    >
                      {item.name}
                    </a>
                  ))}
                </div>
                <div className="py-6 space-y-2">
                  <a
                    href="#"
                    className="block rounded-md bg-emerald-500 px-3 py-2.5 text-center text-base font-semibold text-white hover:bg-emerald-400 transition-colors"
                  >
                    Sign in
                  </a>
                  <a href="#" className={mobileLinkClass}>
                    Log in
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
