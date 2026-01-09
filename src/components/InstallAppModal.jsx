// src/components/InstallAppModal.jsx
import React from "react";
import { X, Download, Smartphone, Monitor, Bookmark } from "lucide-react";
import stockloyalIcon from "/icons/StockLoyal_icon.png";

const isProbablyIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

const isStandalone = () => {
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

// Convert PNG to ICO format (simplified for web)
const createWindowsShortcut = async () => {
  const url = window.location.origin;
  
  try {
    // Create a more elaborate shortcut with instructions
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>StockLoyal - Click to Open</title>
    <link rel="icon" type="image/png" href="${url}/icons/StockLoyal_icon.png">
    <style>
        body {
            margin: 0;
            padding: 40px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            text-align: center;
        }
        .container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            padding: 60px 40px;
            border-radius: 20px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            max-width: 500px;
        }
        .icon {
            width: 100px;
            height: 100px;
            margin: 0 auto 30px;
            border-radius: 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        h1 {
            font-size: 32px;
            margin: 0 0 20px;
            font-weight: 700;
        }
        p {
            font-size: 18px;
            margin: 0 0 30px;
            opacity: 0.9;
        }
        .btn {
            display: inline-block;
            padding: 16px 48px;
            background: white;
            color: #667eea;
            text-decoration: none;
            border-radius: 12px;
            font-weight: 600;
            font-size: 18px;
            transition: transform 0.2s;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.2);
        }
        .note {
            margin-top: 30px;
            font-size: 14px;
            opacity: 0.7;
        }
    </style>
    <script>
        // Auto-redirect after 2 seconds
        setTimeout(function() {
            window.location.href = "${url}";
        }, 2000);
    </script>
</head>
<body>
    <div class="container">
        <img src="${url}/icons/StockLoyal_icon.png" alt="StockLoyal" class="icon">
        <h1>StockLoyal</h1>
        <p>Redirecting to StockLoyal...</p>
        <a href="${url}" class="btn">Open StockLoyal Now</a>
        <p class="note">Tip: Pin this file to your taskbar for quick access!</p>
    </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'StockLoyal.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    
    // Show additional instructions
    alert('Downloaded! To show the StockLoyal icon:\n\n1. Open the file in your browser\n2. Pin the browser tab to your taskbar\n3. Or create a browser bookmark and pin to bookmarks bar\n\nThe browser will display the StockLoyal icon in the tab!');
    
  } catch (error) {
    console.error('Error creating shortcut:', error);
  }
};

// Create Mac shortcut with better icon handling
const createMacShortcut = async () => {
  const url = window.location.origin;
  
  try {
    // Create visually appealing HTML file
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>StockLoyal</title>
    <link rel="icon" type="image/png" href="${url}/icons/StockLoyal_icon.png">
    <link rel="apple-touch-icon" href="${url}/icons/StockLoyal_icon.png">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-title" content="StockLoyal">
    <style>
        body {
            margin: 0;
            padding: 40px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            text-align: center;
        }
        .container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            padding: 60px 40px;
            border-radius: 20px;
            max-width: 500px;
        }
        .icon {
            width: 100px;
            height: 100px;
            margin: 0 auto 30px;
            border-radius: 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        h1 {
            font-size: 32px;
            margin: 0 0 20px;
            font-weight: 700;
        }
        p {
            font-size: 18px;
            margin: 0 0 30px;
            opacity: 0.9;
        }
        .btn {
            display: inline-block;
            padding: 16px 48px;
            background: white;
            color: #667eea;
            text-decoration: none;
            border-radius: 12px;
            font-weight: 600;
            font-size: 18px;
        }
    </style>
    <script>
        // Auto-redirect after 2 seconds
        setTimeout(function() {
            window.location.href = "${url}";
        }, 2000);
    </script>
</head>
<body>
    <div class="container">
        <img src="${url}/icons/StockLoyal_icon.png" alt="StockLoyal" class="icon">
        <h1>StockLoyal</h1>
        <p>Redirecting to StockLoyal...</p>
        <a href="${url}" class="btn">Open StockLoyal Now</a>
        <p style="margin-top: 30px; font-size: 14px; opacity: 0.7;">Tip: Add to Dock for quick access!</p>
    </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'StockLoyal.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    
  } catch (error) {
    console.error('Error creating Mac shortcut:', error);
  }
};

export default function InstallAppModal({ isOpen, onClose }) {
  const [deferredPrompt, setDeferredPrompt] = React.useState(null);
  const [deviceType, setDeviceType] = React.useState("unknown");
  const [isMac, setIsMac] = React.useState(false);

  React.useEffect(() => {
    const ios = isProbablyIOS();
    const standalone = isStandalone();
    const mac = /Mac|iPad/.test(navigator.platform);
    
    setIsMac(mac);
    
    if (ios) {
      setDeviceType("ios");
    } else if (/Android/.test(navigator.userAgent)) {
      setDeviceType("android");
    } else {
      setDeviceType("desktop");
    }

    // Check for cached install prompt
    if (window.__pwaDeferredPrompt) {
      setDeferredPrompt(window.__pwaDeferredPrompt);
    }

    const handleInstallable = () => {
      setDeferredPrompt(window.__pwaDeferredPrompt || null);
    };

    window.addEventListener("pwa:installable", handleInstallable);
    
    return () => {
      window.removeEventListener("pwa:installable", handleInstallable);
    };
  }, [isOpen]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      window.__pwaDeferredPrompt = null;
      window.dispatchEvent(new Event("pwa:installable"));
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 9998,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "#fff",
          borderRadius: 16,
          maxWidth: 440,
          width: "90%",
          maxHeight: "85vh",
          overflowY: "auto",
          zIndex: 9999,
          padding: "1.5rem",
          boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Download size={24} color="#2563eb" strokeWidth={2.5} />
            <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#111827" }}>
              Install StockLoyal
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: "#6b7280",
            }}
            aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>

        {/* App Icon Preview */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "1rem",
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 16,
              overflow: "hidden",
              boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
            }}
          >
            <img
              src={stockloyalIcon}
              alt="StockLoyal"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        </div>

        {/* Icon Preview Text */}
        <p
          style={{
            textAlign: "center",
            color: "#6b7280",
            fontSize: "0.85rem",
            marginBottom: "1.5rem",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "#111827" }}>This icon</strong> will appear on your home screen/desktop
        </p>

        {/* Description */}
        <p
          style={{
            textAlign: "center",
            color: "#6b7280",
            fontSize: "0.95rem",
            marginBottom: "1.5rem",
            lineHeight: 1.6,
          }}
        >
          Add StockLoyal for quick access and a native app experience!
        </p>

        {/* iOS Instructions */}
        {deviceType === "ios" && (
          <div
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 12,
              padding: "1rem",
              marginBottom: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Smartphone size={20} color="#2563eb" />
              <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600, color: "#1e40af" }}>
                iOS / Safari Instructions
              </h3>
            </div>
            <ol
              style={{
                paddingLeft: "1.25rem",
                margin: 0,
                fontSize: "0.875rem",
                color: "#1e40af",
                lineHeight: 1.8,
              }}
            >
              <li>
                Tap the <strong>Share</strong> button{" "}
                <span style={{ fontSize: "1.1rem" }}>📤</span> in Safari's bottom toolbar
              </li>
              <li>
                Scroll down and tap <strong>"Add to Home Screen"</strong>
              </li>
              <li>
                The StockLoyal icon (shown above) will be added automatically
              </li>
              <li>
                Tap <strong>"Add"</strong> in the top right corner
              </li>
              <li>The app icon will appear on your home screen!</li>
            </ol>
          </div>
        )}

        {/* Android Instructions */}
        {deviceType === "android" && (
          <div
            style={{
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 12,
              padding: "1rem",
              marginBottom: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Smartphone size={20} color="#16a34a" />
              <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600, color: "#15803d" }}>
                Android / Chrome Instructions
              </h3>
            </div>

            {deferredPrompt ? (
              <div>
                <p style={{ fontSize: "0.875rem", color: "#15803d", marginBottom: 12, lineHeight: 1.6 }}>
                  Great! Your browser supports automatic installation with the StockLoyal icon.
                </p>
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="btn-primary"
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    fontSize: "0.95rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Download size={18} />
                  Install with Icon
                </button>
              </div>
            ) : (
              <ol
                style={{
                  paddingLeft: "1.25rem",
                  margin: 0,
                  fontSize: "0.875rem",
                  color: "#15803d",
                  lineHeight: 1.8,
                }}
              >
                <li>
                  Tap the <strong>menu</strong> (⋮) in Chrome's top right corner
                </li>
                <li>
                  Select <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong>
                </li>
                <li>
                  The StockLoyal icon (shown above) will be added automatically
                </li>
                <li>
                  Tap <strong>"Add"</strong> or <strong>"Install"</strong>
                </li>
                <li>The app icon will appear on your home screen!</li>
              </ol>
            )}
          </div>
        )}

        {/* Desktop Instructions */}
        {deviceType === "desktop" && (
          <div
            style={{
              background: "#faf5ff",
              border: "1px solid #e9d5ff",
              borderRadius: 12,
              padding: "1rem",
              marginBottom: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Monitor size={20} color="#9333ea" />
              <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600, color: "#7e22ce" }}>
                Desktop Instructions
              </h3>
            </div>

            {deferredPrompt ? (
              <div>
                <p style={{ fontSize: "0.875rem", color: "#7e22ce", marginBottom: 12, lineHeight: 1.6 }}>
                  Click below to install StockLoyal as a desktop app with the icon shown above.
                </p>
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="btn-primary"
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    fontSize: "0.95rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <Download size={18} />
                  Install Desktop App
                </button>
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: "0.875rem", color: "#7e22ce", marginBottom: 8, fontWeight: 600 }}>
                  Option 1: Browser Install (Recommended)
                </p>
                <p style={{ fontSize: "0.85rem", color: "#7e22ce", marginBottom: 12, paddingLeft: 12, lineHeight: 1.6 }}>
                  Look for the install icon{" "}
                  <span style={{ fontSize: "1.1rem" }}>⊕</span> in your browser's address bar, or use the menu → <em>"Install StockLoyal"</em>. The icon will be added automatically.
                </p>
              </div>
            )}
            
            {/* Download Shortcut Option */}
            <div
              style={{
                borderTop: "1px solid #e9d5ff",
                paddingTop: 12,
              }}
            >
              <p style={{ fontSize: "0.875rem", color: "#7e22ce", marginBottom: 8, fontWeight: 600 }}>
                {deferredPrompt ? "Option 2: " : "Option 2: "}Download Desktop Shortcut
              </p>
              <p style={{ fontSize: "0.85rem", color: "#7e22ce", marginBottom: 12, lineHeight: 1.6 }}>
                Download a shortcut file and place it anywhere (Desktop, taskbar, etc.):
              </p>
              
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button
                  type="button"
                  onClick={createWindowsShortcut}
                  style={{
                    flex: 1,
                    padding: "0.65rem",
                    fontSize: "0.85rem",
                    background: "#f3f4f6",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    color: "#374151",
                    fontWeight: 500,
                  }}
                >
                  <Bookmark size={16} />
                  Windows/Chrome
                </button>
                
                <button
                  type="button"
                  onClick={createMacShortcut}
                  style={{
                    flex: 1,
                    padding: "0.65rem",
                    fontSize: "0.85rem",
                    background: "#f3f4f6",
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    color: "#374151",
                    fontWeight: 500,
                  }}
                >
                  <Bookmark size={16} />
                  Mac/Safari
                </button>
              </div>
              
              <p style={{ fontSize: "0.75rem", color: "#a855f7", marginBottom: 0, lineHeight: 1.5 }}>
                Downloads a shortcut file. Open it in your browser, then pin the tab to your taskbar/dock to see the StockLoyal icon.
              </p>
            </div>
            
            {/* Manual Bookmark Option */}
            <div
              style={{
                borderTop: "1px solid #e9d5ff",
                paddingTop: 12,
                marginTop: 12,
              }}
            >
              <p style={{ fontSize: "0.875rem", color: "#7e22ce", marginBottom: 8, fontWeight: 600 }}>
                Option 3: Create Browser Bookmark
              </p>
              <p style={{ fontSize: "0.85rem", color: "#7e22ce", marginBottom: 0, lineHeight: 1.6 }}>
                Press <strong>{isMac ? 'Cmd+D' : 'Ctrl+D'}</strong> to bookmark this page, or use your browser menu → <em>"Bookmarks"</em> → <em>"Bookmark this page"</em>
              </p>
            </div>
          </div>
        )}

        {/* Benefits */}
        <div
          style={{
            background: "#f9fafb",
            borderRadius: 12,
            padding: "1rem",
            marginBottom: "1rem",
          }}
        >
          <h3 style={{ margin: "0 0 12px 0", fontSize: "0.9rem", fontWeight: 600, color: "#111827" }}>
            Why install?
          </h3>
          <ul
            style={{
              paddingLeft: "1.25rem",
              margin: 0,
              fontSize: "0.85rem",
              color: "#6b7280",
              lineHeight: 1.8,
            }}
          >
            <li>Quick access from home screen with StockLoyal icon</li>
            <li>Works like a native app</li>
            <li>No app store required</li>
            <li>Takes up minimal space</li>
            <li>Stay updated with your portfolio</li>
          </ul>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="btn-secondary"
          style={{
            width: "100%",
            padding: "0.75rem",
            fontSize: "0.95rem",
          }}
        >
          Close
        </button>
      </div>
    </>
  );
}
