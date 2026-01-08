import { useEffect, useState } from "react";

const InstallPrompt = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone ||
      document.referrer.includes("android-app://");

    setIsStandalone(standalone);

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(ios);

    const dismissed = localStorage.getItem("pwa-install-dismissed");
    const dismissedTime = dismissed ? parseInt(dismissed, 10) : 0;
    const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);

    // If the install event was already captured earlier in app lifecycle
    if (window.__pwaDeferredPrompt) {
      setDeferredPrompt(window.__pwaDeferredPrompt);
      if (!standalone && daysSinceDismissed > 7) setShowPrompt(true);
    } else if (!standalone && ios && daysSinceDismissed > 7) {
      // iOS: no beforeinstallprompt, show instructions prompt
      setShowPrompt(true);
    }

    const handleBeforeInstall = (e) => {
      e.preventDefault();

      // Cache globally so late-mounted components can still show install
      window.__pwaDeferredPrompt = e;

      // Broadcast installable
      window.dispatchEvent(new Event("pwa:installable"));

      setDeferredPrompt(e);

      if (!standalone && daysSinceDismissed > 7) {
        setShowPrompt(true);
      }
    };

    const handleAppInstalled = () => {
      window.__pwaDeferredPrompt = null;
      window.dispatchEvent(new Event("pwa:installed"));
      setDeferredPrompt(null);
      setShowPrompt(false);
      setIsStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    await deferredPrompt.userChoice;

    // Prompt can only be used once
    setDeferredPrompt(null);
    window.__pwaDeferredPrompt = null;
    window.dispatchEvent(new Event("pwa:installable"));

    setShowPrompt(false);
  };

  const handleDismiss = () => {
    localStorage.setItem("pwa-install-dismissed", Date.now().toString());
    setShowPrompt(false);
  };

  if (isStandalone || !showPrompt) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 shadow-lg z-50 animate-slide-up">
      <div className="max-w-md mx-auto">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-12 h-12 bg-white rounded-lg p-2">
            <img
              src="/icons/StockLoyal-icon.png"
              alt="StockLoyal"
              className="w-full h-full object-contain"
            />
          </div>

          <div className="flex-1">
            <h3 className="font-semibold text-lg mb-1">Install StockLoyal</h3>

            {isIOS ? (
              <div className="text-sm space-y-2">
                <p>Add to your home screen for a better experience:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs opacity-90">
                  <li>
                    Tap the Share button <span className="inline-block">📤</span>
                  </li>
                  <li>Scroll down and tap "Add to Home Screen"</li>
                  <li>Tap "Add" in the top right</li>
                </ol>
              </div>
            ) : (
              <p className="text-sm">Install our app for quick access and a better experience!</p>
            )}
          </div>

          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-white hover:text-gray-200 transition-colors"
            aria-label="Dismiss"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {!isIOS && deferredPrompt && (
          <button
            onClick={handleInstallClick}
            className="mt-3 w-full bg-white text-blue-600 font-semibold py-2 px-4 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Install Now
          </button>
        )}
      </div>
    </div>
  );
};

export default InstallPrompt;
