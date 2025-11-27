// src/pages/StockPicker.jsx
import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiPost } from "../api.js";
import { useBasket } from "../context/BasketContext";
import { Search } from "lucide-react";
import "../styles/StockPicker.css";

// ✅ Map categories -> API screener IDs
const categoryMap = {
  "Most Active": "most_actives",
  "Day Gainers": "day_gainers",
  "Day Losers": "day_losers",
  "Large Caps": "undervalued_large_caps",
  "Small Caps": "aggressive_small_caps",
  "Growth Tech": "growth_technology_stocks",
  "Mutual Funds": "top_mutual_funds",
  ETFs: "etf",
  "Crypto - Most Active": "most_actives_cryptocurrencies",
};

// ✅ Map categories -> background images
const categoryImages = {
  "Most Active": "/icons/most-active.jpg",
  "Day Gainers": "/icons/day-gainers.jpg",
  "Day Losers": "/icons/day-losers.jpg",
  "Large Caps": "/icons/large-caps.jpg",
  "Small Caps": "/icons/small-caps.jpg",
  "Growth Tech": "/icons/growth-tech.jpg",
  "Mutual Funds": "/icons/mutual-funds.jpg",
  ETFs: "/icons/etfs.jpg",
  "Crypto - Most Active": "/icons/crypto.jpg",
};

export default function StockPicker() {
  const navigate = useNavigate();
  const location = useLocation();
  const { addToBasket } = useBasket();

  const memberId = localStorage.getItem("memberId");
  const { amount: initialAmount = 0, pointsUsed: initialPoints = 0 } =
    location.state || {};

  // --- Wallet / points state ---
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState("");
  const [conversionRate, setConversionRate] = useState(0.01);
  const [selectedPoints, setSelectedPoints] = useState(initialPoints);
  const [cashValue, setCashValue] = useState(initialAmount);
  const [cashInput, setCashInput] = useState(initialAmount.toFixed(2));
  const [isEditingCash, setIsEditingCash] = useState(false);

  // --- Stock categories state ---
  const [category, setCategory] = useState("");
  const [results, setResults] = useState([]);
  const [stockError, setStockError] = useState("");
  const [selectedStocks, setSelectedStocks] = useState([]);

  // --- Symbol search state ---
  const [symbolInput, setSymbolInput] = useState("");
  const [searching, setSearching] = useState(false);

  // --- Refs ---
  const sliderRef = useRef(null);
  const tableRef = useRef(null);

  // --- Helper: robust scroll to stock list (desktop + iOS) ---
  const scrollToStockList = () => {
    // Try multiple methods to find the element
    const el = tableRef.current || document.getElementById("stock-list");
    if (!el) {
      console.log("Stock list element not found");
      return;
    }

    console.log("Scrolling to stock list");
    
    // Method 1: Try scrollIntoView first
    try {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      console.log("scrollIntoView failed, trying window.scrollTo");
      // Method 2: Fallback to window.scrollTo
      const rect = el.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const targetY = rect.top + scrollTop - 20;
      
      window.scrollTo({
        top: targetY,
        behavior: "smooth"
      });
    }
  };

  // --- Slider drag logic ---
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const handleMouseDown = (e) => {
    isDragging.current = true;
    startX.current = e.pageX - sliderRef.current.offsetLeft;
    scrollLeft.current = sliderRef.current.scrollLeft;
  };
  const handleMouseLeave = () => (isDragging.current = false);
  const handleMouseUp = () => (isDragging.current = false);
  const handleMouseMove = (e) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const x = e.pageX - sliderRef.current.offsetLeft;
    sliderRef.current.scrollLeft = scrollLeft.current - (x - startX.current);
  };
  const handleTouchStart = (e) => {
    isDragging.current = true;
    startX.current = e.touches[0].pageX - sliderRef.current.offsetLeft;
    scrollLeft.current = sliderRef.current.scrollLeft;
  };
  const handleTouchMove = (e) => {
    if (!isDragging.current) return;
    const x = e.touches[0].pageX - sliderRef.current.offsetLeft;
    sliderRef.current.scrollLeft = scrollLeft.current - (x - startX.current);
  };
  const handleTouchEnd = () => (isDragging.current = false);

  // --- Load wallet ---
  useEffect(() => {
    (async () => {
      try {
        if (!memberId) {
          setError("Please log in again.");
          return;
        }
        const data = await apiPost("get-wallet.php", { member_id: memberId });
        if (!data.success) {
          setError(data.error || "Failed to load wallet.");
          return;
        }
        setWallet(data.wallet);
        if (data.wallet?.sweep_percentage && data.wallet?.points) {
          const sweepVal = Math.round(
            (parseInt(data.wallet.points, 10) || 0) *
              (parseFloat(data.wallet.sweep_percentage) / 100)
          );
          setSelectedPoints(sweepVal);
        }
      } catch (e) {
        console.error("[StockPicker] fetch wallet error:", e);
        setError("Network error while fetching wallet.");
      }
    })();
  }, [memberId]);

  useEffect(() => {
    let r = parseFloat(localStorage.getItem("conversion_rate") || "0");
    if (r >= 1) r = r / 100;
    setConversionRate(r > 0 ? r : 0.01);
  }, []);

  // --- Sync cash value to points ---
  useEffect(() => {
    if (!isEditingCash) {
      const cents = Math.round(selectedPoints * conversionRate * 100);
      const val = cents / 100;
      setCashValue(val);
      setCashInput(val.toFixed(2));
    }
  }, [selectedPoints, conversionRate, isEditingCash]);

  // --- When results load, scroll to stock list ---
  useEffect(() => {
    if (!category || results.length === 0) return;

    console.log("Results loaded, scheduling scroll. Results count:", results.length);
    
    // Wait for React to paint the stock-list div with results
    // Using longer timeout to ensure DOM is fully rendered
    const timer = setTimeout(() => {
      console.log("Timer fired, calling scrollToStockList");
      scrollToStockList();
    }, 300);
    
    return () => clearTimeout(timer);
  }, [results]);

  // --- Points handler ---
  const handlePointsChange = (val) => {
    let v = parseInt(val ?? "0", 10);
    if (Number.isNaN(v)) v = 0;
    const max = parseInt(wallet?.points ?? "0", 10) || 0;
    v = Math.max(0, Math.min(v, max));
    setSelectedPoints(v);
  };

  // --- Screener via proxy.php ---
  const handleCategoryClick = async (cat, scrId) => {
    try {
      // Set category first; effect above will scroll after render
      setCategory(cat);
      setStockError("");
      setResults([]);

      const data = await apiPost("proxy.php", { scrId });
      if (!data || data.error) throw new Error(data.error || "Failed to load");

      const quotes =
        data.finance?.result?.[0]?.quotes ??
        data.data ??
        data.results ??
        [];

      const fetched = quotes.map((q) => ({
        symbol: q.symbol,
        name: q.shortName || q.longName || q.symbol,
        price:
          q.regularMarketPrice ??
          q.postMarketPrice ??
          q.preMarketPrice ??
          null,
        change:
          q.regularMarketChangePercent ??
          q.postMarketChangePercent ??
          q.preMarketChangePercent ??
          0,
      }));

      setResults(fetched);
    } catch (err) {
      console.error("[StockPicker] proxy error:", err);
      setStockError("Failed to fetch stocks.");
    }
  };

  // --- Symbol lookup ---
  const handleSymbolSearch = async () => {
    if (!symbolInput.trim()) return;
    setSearching(true);
    setStockError("");
    setResults([]);

    try {
      const data = await apiPost("symbol-lookup.php", {
        symbol: symbolInput.trim().toUpperCase(),
      });

      if (!data.success) {
        setStockError(data.error || "Symbol not found.");
        return;
      }

      setCategory(`Symbol: ${data.symbol}`);
      setResults([
        {
          symbol: data.symbol,
          name: data.name,
          price: data.price,
          change: data.change,
        },
      ]);
      // Scroll handled by useEffect on [category]
    } catch (err) {
      console.error("[StockPicker] symbol search error:", err);
      setStockError("Symbol lookup failed.");
    } finally {
      setSearching(false);
    }
  };

  // --- Stock selection + continue ---
  const toggleSelect = (symbol) =>
    setSelectedStocks((prev) =>
      prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol]
    );

  const handleContinueStocks = () => {
    if (selectedStocks.length === 0) {
      alert("Please select at least one stock to continue.");
      return;
    }
    results
      .filter((stock) => selectedStocks.includes(stock.symbol))
      .forEach((stock) => addToBasket(stock));
    navigate("/basket", {
      state: { category, amount: cashValue, pointsUsed: selectedPoints, memberId },
    });
  };

  // --- Render ---
  if (error)
    return (
      <div className="page-container">
        <h2 className="page-title">Convert Points to Shares</h2>
        <p className="form-error">{error}</p>
      </div>
    );

  if (!wallet)
    return (
      <div className="page-container">
        <h2 className="page-title">Convert Points</h2>
        <p>Loading…</p>
      </div>
    );

  const availablePoints = parseInt(wallet.points, 10) || 0;
  const availableCash = Number(wallet.cash_balance) || 0;

  return (
    <div className="app-container categories-page">
      <h2 className="page-title" style={{ marginBottom: "1rem", textAlign: "center" }}>
        Convert Points to Invest
      </h2>

      {/* Wallet Info */}
      <div
        className="card"
        style={{
          marginBottom: "1.5rem",
          textAlign: "center",
          padding: "1.25rem",
          borderRadius: "12px",
          background: "linear-gradient(135deg, #2563eb15, #1e40af10)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        }}
      >
        <p style={{ fontSize: "1rem", fontWeight: "600", color: "#1e40af" }}>
          Available Points
        </p>
        <p
          style={{
            fontSize: "1.25rem",
            fontWeight: "700",
            marginBottom: "1rem",
            color: "#111827",
          }}
        >
          {availablePoints.toLocaleString()}
        </p>

        <p style={{ fontSize: "1rem", fontWeight: "600", color: "#1e40af" }}>
          Available Cash Balance
        </p>
        <p
          style={{
            fontSize: "1.25rem",
            fontWeight: "700",
            margin: 0,
            color: "#16a34a",
          }}
        >
          ${availableCash.toFixed(2)}
        </p>
      </div>

      {/* Points slider */}
      <div className="card" style={{ marginBottom: "1.25rem", textAlign: "center" }}>
        <p style={{ fontWeight: "600" }}>Points to Convert</p>
        <p style={{ fontWeight: "100" }}>
          Use slider to select points or enter a custom amount in the box below:
        </p>
        <input
          id="pointsToConvert"
          type="number"
          min="0"
          max={availablePoints}
          step="1"
          className="points-to-convert"
          value={selectedPoints}
          onChange={(e) => handlePointsChange(e.target.value)}
          style={{ marginBottom: "0.75rem", textAlign: "center" }}
        />

        <div className="range-wrapper" style={{ marginBottom: "1rem" }}>
          <button type="button" className="range-btn" onClick={() => handlePointsChange(0)}>
            ➖
          </button>
          <input
            type="range"
            min="0"
            max={availablePoints}
            step="1"
            value={selectedPoints}
            onChange={(e) => handlePointsChange(e.target.value)}
            className="range-slider"
          />
          <button
            type="button"
            className="range-btn"
            onClick={() => handlePointsChange(availablePoints)}
          >
            ➕
          </button>
        </div>

        <p className="wallet-intro" style={{ marginBottom: "0.25rem", fontWeight: "600" }}>
          Cash-Value used for this Order
        </p>

        {/* 💰 Editable Cash Input */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
          <span style={{ fontSize: "1.25rem", marginRight: "6px" }}>$</span>
          <input
            id="cashToConvert"
            type="text"
            inputMode="decimal"
            className="wallet-cash"
            value={cashInput}
            onFocus={() => setIsEditingCash(true)}
            onChange={(e) => {
              const val = e.target.value;
              setCashInput(val);
              const num = parseFloat(val);
              if (!isNaN(num)) {
                const maxCash =
                  (parseInt(wallet?.points ?? "0", 10) || 0) * conversionRate;
                const clamped = Math.min(Math.max(num, 0), maxCash);
                setCashValue(clamped);
                setSelectedPoints(Math.floor(clamped / conversionRate));
              }
            }}
            onBlur={() => {
              setIsEditingCash(false);
              setCashInput(cashValue.toFixed(2));
            }}
            style={{
              fontSize: "1.25rem",
              color: "#16a34a",
              textAlign: "center",
              border: "1px solid #ccc",
              borderRadius: "8px",
              padding: "6px 10px",
              width: "120px",
              appearance: "textfield",
            }}
          />
        </div>
      </div>

      {/* Symbol search */}
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ position: "relative", width: "80%", minWidth: 180 }}>
            <input
              type="text"
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value)}
              placeholder="Enter symbol (e.g., AAPL)"
              className="member-form-input"
              style={{ width: "60%", paddingRight: "1rem" }}
              onKeyDown={(e) => e.key === "Enter" && handleSymbolSearch()}
              aria-label="Symbol input"
            />
            <Search
              size={20}
              style={{
                position: "absolute",
                right: "0.1rem",
                top: "50%",
                transform: "translateY(-50%)",
                cursor: "pointer",
                color: "#6b7280",
              }}
              onClick={handleSymbolSearch}
              aria-label="Search symbol"
            />
          </div>
        </div>
        {searching && <p className="caption" style={{ marginTop: 8 }}>Searching…</p>}
        {stockError && <p className="points-error" style={{ marginTop: 8 }}>{stockError}</p>}
      </div>

      {/* Categories */}
      <h2 className="categories-title" style={{ textAlign: "center" }}>
        Select a Category
      </h2>
      <div
        ref={sliderRef}
        className="categories-slider"
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ cursor: "grab" }}
      >
        {Object.entries(categoryMap).map(([cat, scrId]) => (
          <button
            key={cat}
            type="button"
            onClick={() => handleCategoryClick(cat, scrId)}
            className="category-btn"
            style={{
              minWidth: "160px",
              height: "100px",
              marginRight: "10px",
              borderRadius: "8px",
              backgroundImage: `url(${categoryImages[cat] || "/icons/default.jpg"})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              position: "relative",
              overflow: "hidden",
              color: "white",
              fontWeight: "600",
            }}
          >
            <span
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                padding: "6px",
                background: "rgba(0,0,0,0.5)",
                textAlign: "center",
                fontSize: "0.9rem",
              }}
            >
              {cat}
            </span>
          </button>
        ))}
      </div>

      {/* Stock list */}
      {category && (
        <div
          id="stock-list"
          ref={tableRef}
          className={`stocklist-container ${results.length > 0 ? "show" : ""}`}
          style={{ marginTop: 16, marginBottom: 120 }}
        >
          <h2 className="stocklist-heading" style={{ textAlign: "center" }}>
            {category} Stocks
          </h2>
          {stockError && <p className="stocklist-error">{stockError}</p>}
          {!stockError && results.length === 0 && (
            <p className="stocklist-empty">No stocks found.</p>
          )}
          {results.length > 0 && (
            <div className="stocklist-table-wrapper">
              <table className="stocklist-table">
                <thead>
                  <tr>
                    <th>Select</th>
                    <th>Symbol</th>
                    <th>Name</th>
                    <th>
                      Price
                      <br />
                      Change %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((stock) => (
                    <tr key={stock.symbol} className="stock-row">
                      <td className="text-center">
                        <input
                          type="checkbox"
                          checked={selectedStocks.includes(stock.symbol)}
                          onChange={() => toggleSelect(stock.symbol)}
                        />
                      </td>
                      <td className="symbol">{stock.symbol}</td>
                      <td className="text-left">{stock.name || "-"}</td>
                      <td className="price-change">
                        <div className="price">
                          {stock.price ? `$${stock.price.toFixed(2)}` : "N/A"}
                        </div>
                        <div
                          className={
                            stock.change > 0
                              ? "change-positive"
                              : stock.change < 0
                              ? "change-negative"
                              : "change-neutral"
                          }
                        >
                          {typeof stock.change === "number"
                            ? stock.change.toFixed(2)
                            : Number(stock.change || 0).toFixed(2)}
                          %
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Floating actions */}
      {(category || selectedStocks.length > 0) && (
        <div className="floating-actions">
          <button
            type="button"
            onClick={handleContinueStocks}
            className="btn-primary"
            style={{ width: "90%", maxWidth: 320, marginBottom: 8 }}
          >
            Continue with Selected
          </button>
          <button
            type="button"
            onClick={() => navigate("/wallet")}
            className="btn-secondary"
            style={{ width: "90%", maxWidth: 320 }}
          >
            Back to Wallet
          </button>
        </div>
      )}
    </div>
  );
}
