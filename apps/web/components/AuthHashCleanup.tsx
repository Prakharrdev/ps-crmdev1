'use client';

import { useEffect } from 'react';

export default function AuthHashCleanup() {
  useEffect(() => {
    const clearAuthHash = () => {
      const hash = window.location.hash;
      if (!hash) return;

      const hasAuthTokens =
        hash.includes('access_token=') ||
        hash.includes('refresh_token=') ||
        hash.includes('expires_in=') ||
        hash.includes('token_type=') ||
        hash.includes('type=');

      if (hasAuthTokens) {
        const cleanUrl = `${window.location.pathname}${window.location.search}`;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    };

    clearAuthHash();
    window.addEventListener('hashchange', clearAuthHash);

    return () => {
      window.removeEventListener('hashchange', clearAuthHash);
    };
  }, []);

  return null;
}
