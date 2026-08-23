import { useSyncExternalStore } from "react";

const mobileQuery = "(max-width: 767px)";
const tabletQuery = "(min-width: 768px) and (max-width: 1023px)";

function subscribe(callback: () => void): () => void {
  const mobileMql = window.matchMedia(mobileQuery);
  const tabletMql = window.matchMedia(tabletQuery);
  mobileMql.addEventListener("change", callback);
  tabletMql.addEventListener("change", callback);
  return () => {
    mobileMql.removeEventListener("change", callback);
    tabletMql.removeEventListener("change", callback);
  };
}

type MobileSnapshot = { isMobile: boolean; isTablet: boolean };

let cachedSnapshot: MobileSnapshot | null = null;

function getSnapshot(): MobileSnapshot {
  const isMobile = window.matchMedia(mobileQuery).matches;
  const isTablet = window.matchMedia(tabletQuery).matches;
  if (cachedSnapshot && cachedSnapshot.isMobile === isMobile && cachedSnapshot.isTablet === isTablet) {
    return cachedSnapshot;
  }
  cachedSnapshot = { isMobile, isTablet };
  return cachedSnapshot;
}

function getServerSnapshot(): { isMobile: boolean; isTablet: boolean } {
  return { isMobile: false, isTablet: false };
}

export function useIsMobile(): { isMobile: boolean; isTablet: boolean } {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
