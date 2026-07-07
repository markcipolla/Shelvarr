'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const STORAGE_PREFIX = 'scroll-pos:';
const SCROLL_CONTAINER_ID = 'main-scroll';
// How long to keep trying to restore while the page's content streams in.
const RESTORE_TIMEOUT_MS = 3000;
const RESTORE_POLL_MS = 50;

/**
 * Restores scroll position for the custom `<main>` scroll container on
 * navigation.
 *
 * Next.js's built-in scroll restoration only works on the window scroller.
 * Because the layout scrolls inside `<main className="overflow-auto">`, the
 * browser can't restore its position, so every navigation (including "back")
 * leaves the container pinned at the top.
 *
 * We persist the container's scroll position per URL (pathname + query) and
 * re-apply it whenever that URL is shown. Because the position is kept current
 * for the *exact* URL, this does the right thing in every case: a first visit
 * or a fresh filter/page has no stored value and opens at the top, while
 * returning to a list you'd scrolled restores where you were.
 *
 * Dynamic (`force-dynamic`) pages aren't kept in Next's client router cache,
 * so on "back" the content re-streams and the container is briefly empty. We
 * therefore keep re-applying the saved position until the container is tall
 * enough to hold it (or a timeout elapses), and suppress position saves while
 * restoring so the transient clamped scrollTop can't overwrite the real value.
 * Polling uses setTimeout rather than requestAnimationFrame so it still fires
 * when the tab isn't actively painting.
 */
export function ScrollRestorer() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const key = `${STORAGE_PREFIX}${pathname}?${searchParams.toString()}`;

  // Opt out of the browser's own (window-based) restoration so it can't fight
  // ours.
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    const container = document.getElementById(SCROLL_CONTAINER_ID);
    if (!container) return;

    // While true, scroll events don't persist — the container may be clamping
    // an about-to-be-restored position against not-yet-loaded content.
    let restoring = false;
    let saveHandle = 0;
    let restoreHandle = 0;
    let saveQueued = false;

    const save = () => {
      saveQueued = false;
      if (restoring) return;
      sessionStorage.setItem(key, String(container.scrollTop));
    };
    const onScroll = () => {
      if (saveQueued) return;
      saveQueued = true;
      saveHandle = requestAnimationFrame(save);
    };

    const saved = sessionStorage.getItem(key);
    const target = saved ? parseFloat(saved) : 0;

    if (target > 0) {
      restoring = true;
      const startedAt = performance.now();
      const attempt = () => {
        container.scrollTop = target;
        const reached = Math.abs(container.scrollTop - target) <= 1;
        const canFit =
          container.scrollHeight - container.clientHeight >= target - 1;
        if ((reached && canFit) || performance.now() - startedAt > RESTORE_TIMEOUT_MS) {
          restoring = false;
          return;
        }
        restoreHandle = window.setTimeout(attempt, RESTORE_POLL_MS);
      };
      attempt();
    } else {
      container.scrollTop = 0;
    }

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(saveHandle);
      clearTimeout(restoreHandle);
    };
  }, [key]);

  return null;
}
