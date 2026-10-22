import { useState, useEffect } from 'react';

/**
 * Checks if StreamAura is currently running as an installed PWA or was previously installed.
 */
export const checkIsAppInstalled = (): boolean => {
  if (typeof window === 'undefined') return false;

  // 1. Check if running in standalone display mode (PWA active)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://');

  if (isStandalone) {
    try {
      localStorage.setItem('aura_app_installed', 'true');
    } catch {}
    return true;
  }

  // 2. Check localStorage flag from previous installation
  try {
    if (localStorage.getItem('aura_app_installed') === 'true') {
      return true;
    }
  } catch {}

  return false;
};

/**
 * React hook to reactively track whether the StreamAura app is installed on this device.
 */
export const useIsAppInstalled = (): boolean => {
  const [isInstalled, setIsInstalled] = useState<boolean>(() => checkIsAppInstalled());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateStatus = () => {
      setIsInstalled(checkIsAppInstalled());
    };

    updateStatus();

    // Check Chrome / Android getInstalledRelatedApps API if available
    if ('getInstalledRelatedApps' in navigator) {
      (navigator as any).getInstalledRelatedApps().then((relatedApps: any[]) => {
        if (relatedApps && relatedApps.length > 0) {
          try {
            localStorage.setItem('aura_app_installed', 'true');
          } catch {}
          setIsInstalled(true);
        }
      }).catch(() => {});
    }

    const handleAppInstalled = () => {
      try {
        localStorage.setItem('aura_app_installed', 'true');
      } catch {}
      setIsInstalled(true);
    };

    const handleStatusChanged = (e: any) => {
      if (typeof e.detail?.isInstalled === 'boolean') {
        setIsInstalled(e.detail.isInstalled);
      } else {
        updateStatus();
      }
    };

    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('aura_pwa_installed', handleAppInstalled);
    window.addEventListener('aura_app_installed_status_changed', handleStatusChanged);

    // Track dynamic changes to display mode (e.g. app launched in standalone)
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        handleAppInstalled();
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange);
    } else {
      (mediaQuery as any).addListener?.(handleMediaChange);
    }

    return () => {
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('aura_pwa_installed', handleAppInstalled);
      window.removeEventListener('aura_app_installed_status_changed', handleStatusChanged);
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleMediaChange);
      } else {
        (mediaQuery as any).removeListener?.(handleMediaChange);
      }
    };
  }, []);

  return isInstalled;
};
