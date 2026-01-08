import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import stockloyalIcon from "/icons/StockLoyal_icon.png";

const isProbablyIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

const computeStandalone = () => {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true ||
      document.referrer.includes("android-app://")
    );
  } catch {
    return false;
  }
};

const InstallButton = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    setIsIOS(isProbablyIOS());
    setIsStandalone(computeStandalone());

    // pick up cached prompt if it fired before this mounted
    if (window.__pwaDeferredPrompt) {
      setDeferredPrompt(window.__pwaDeferredPrompt);
    }

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      window.__pwaDeferredPrompt = e;
      setDeferredPrompt(e);
      window.dispatchEvent(new Event("pwa:installable"));
    };

    const handleInstallable = () => {
      setDeferredPrompt(window.__pwaDeferredPrompt || null);
    };

    const handleAppInstalled = () => {
      window.__pwaDeferredPrompt = null;
      setDeferredPrompt(null);
      setIsStandalone(true);
      window.dispatchEvent(new Event("pwa:installed"));
    };

    // IMPORTANT: display-mode can change without a reload in some cases
    const mq = window.matchMedia("(display-mode: standalone)");
    const handleDisplayModeChange = () => {
      setIsStandalone(computeStandalone());
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("pwa:installable", handleInstallable);
    window.addEventListener("appinstalled", handleAppInstalled);

    // matchMedia listener (modern + fallback)
    if (mq?.addEventListener) mq.addEventListener("change", handleDisplayModeChange);
    else if (mq?.addListener) mq.addListener(handleDisplayModeChange);

    // ALSO: refresh standalone state on visibility change (helps after uninstall/shortcut delete)
    const onVis = () => {
      if (!document.hidden) setIsStandalone(computeStandalone());
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("pwa:installable", handleInstallable);
      window.removeEventListener("appinstalled", handleAppInstalled);

      if (mq?.removeEventListener) mq.removeEventListener("change", handleDisplayModeChange);
      else if (mq?.removeListener) mq.removeListener(handleDisplayModeChange);

      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const handleInstallClick = async () => {
    // iOS never gets beforeinstallprompt; always show instructions
    if (isIOS) {
      setShowModal(true);
      return;
    }

    // If we have a real install prompt, use it
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;

      // prompt is single-use
      setDeferredPrompt(null);
      window.__pwaDeferredPrompt = null;
      window.dispatchEvent(new Event("pwa:installable"));
      return;
    }

    // Fallback: some browsers won’t offer prompt again right away.
    // Show the same instructions modal as a backup.
    setShowModal(true);
  };

  // Only hide if we are *currently running* in standalone mode
  // (so user doesn’t see "Install" inside the installed app)
  if (isStandalone) return null;

  // Show button if:
  // - iOS (always show)
  // - OR browser has an install prompt
  // - OR we want a fallback button (so user can see instructions even when prompt isn't available yet)
  const shouldShow = isIOS || !!deferredPrompt || true;
  if (!shouldShow) return null;

  return (
    <>
      <button
        onClick={handleInstallClick}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-black rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-sm"
        title="Install StockLoyal"
      >
        <Download className="w-4 h-4" strokeWidth={2.5} />
        <span>Install App</span>
      </button>

      {showModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]"
          onClick={() => setShowModal(false)}
          style={{ zIndex: 9999 }}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Install StockLoyal</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <img src={stockloyalIcon} alt="StockLoyal"
                  className="flex-shrink-0 w-10 h-10 mx-auto mb-3 rounded-xl shadow-md"
                />
                <p className="text-sm text-gray-700 text-center">
                  {isIOS
                    ? "Add StockLoyal to your home screen for easy access"
                    : "If Install isn't available yet, try again after a refresh, or use your browser’s install option."}
                </p>
              </div>

              {isIOS ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-black rounded-full flex items-center justify-center font-bold text-sm">
                      1
                    </div>
                    <div>
                      <p className="text-sm text-gray-700">
                        Tap the <strong>Share</strong> button <span className="inline-block ml-1 text-xl">📤</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-1">(Safari bottom toolbar)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-black rounded-full flex items-center justify-center font-bold text-sm">
                      2
                    </div>
                    <p className="text-sm text-gray-700">
                      Tap <strong>"Add to Home Screen"</strong>
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-black rounded-full flex items-center justify-center font-bold text-sm">
                      3
                    </div>
                    <p className="text-sm text-gray-700">
                      Tap <strong>"Add"</strong> in the top right
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-700 space-y-2">
                  <p><strong>Chrome/Edge:</strong> look for the install icon in the address bar, or use the browser menu → <em>Install app</em>.</p>
                  <p><strong>Tip:</strong> after deleting a shortcut, refresh the page or restart the browser — the prompt may not reappear immediately.</p>
                </div>
              )}

              <button
                onClick={() => setShowModal(false)}
                className="w-full bg-blue-600 text-black font-semibold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default InstallButton;
