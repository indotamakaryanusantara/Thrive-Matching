'use client';

import { useEffect, useRef } from 'react';

const BOOT_FLAG = '__thriveMatcherBooted__';

export default function MatcherPage() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as Window & { [BOOT_FLAG]?: boolean })[BOOT_FLAG]) return;
    (window as Window & { [BOOT_FLAG]?: boolean })[BOOT_FLAG] = true;

    let cancelled = false;

    async function boot() {
      const res = await fetch('/matcher/body.html');
      if (!res.ok) throw new Error('Failed to load matcher markup');
      const html = await res.text();
      if (cancelled || !rootRef.current) return;
      rootRef.current.innerHTML = html;

      await new Promise<void>((resolve, reject) => {
        if (document.getElementById('thrive-matcher-app-script')) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.id = 'thrive-matcher-app-script';
        script.src = '/matcher/matcher-app.js';
        script.async = false;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load matcher script'));
        document.body.appendChild(script);
      });
    }

    boot().catch((err) => {
      console.error(err);
      if (rootRef.current) {
        rootRef.current.innerHTML =
          '<p style="padding:2rem;text-align:center;color:#666;">Unable to load the matching tool. Please refresh the page.</p>';
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return <div ref={rootRef} id="matcher-root" />;
}
