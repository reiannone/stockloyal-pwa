// src/pages/StockPicker.jsx
import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiPost } from "../api";
import { API_BASE } from "../config/api";
import { useBasket } from "../context/BasketContext";
import {
  Flame,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  Sprout,
  Cpu,
  BarChart3,
  Briefcase,
  Bitcoin,
  Search,
} from "lucide-react";

const categoryMap = {
  "Most Active": "most_actives",
  Trending: "trending_tickers",
  "Day Gainers": "day_gainers",
  "Day Losers": "day_losers",
  "Large Caps": "undervalued_large_caps",
  "Small Caps": "aggressive_small_caps",
  "Growth Tech": "growth_technology_stocks",
  "Mutual Funds": "top_mutual_funds",
  ETFs: "etf",
  "Crypto - Most Active": "most_actives_cryptocurrencies",
};

const categoryIcons = {
  "Most Active": <Flame size={32} />,
  Trending: <TrendingUp size={32} />,
  "Day Gainers": <ArrowUpRight size={32} />,
  "Day Losers": <ArrowDownRight size={32} />,
  "Large Caps": <Building2 size={32} />,
  "Small Caps": <Sprout size={32} />,
  "Growth Tech": <Cpu size={32} />,
  "Mutual Funds": <BarChart3 size={32} />,
  ETFs: <Briefcase size={32} />,
  "Crypto - Most Active": <Bitcoin size={32} />,
};

export default function StockPicker() {
  const navigate = useNavigate();
  const location = useLocation();
  const { addToBasket } = useBasket();

  const memberId = localStorage.getItem("memberId");
  const { amount: initialAmount = 0, pointsUsed: initialPoints = 0 } =
    location.state || {};

  // --- PointsSelect state ---
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState("");
  const [conversionRate, setConversionRate] = useState(0.01);
  const [selectedPoints, setSelectedPoints] = useState(initialPoints);
  const [cashValue, setCashValue] = useState(initialAmount);

  // --- StockCategories state ---
  const [category, setCategory] = useState("");
  const [results, setResults] = useState([]);
  const [stockError, setStockError] = useState("");
  const [selectedStocks, setSelectedStocks] = useState([]);

  // --- Symbol search state ---
  const [symbolInput, setSymbolInput] = useState("");
  const [searching, setSearching] = useState(false);

  // --- Slider drag setup ---
  const sliderRef = useRef(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const handleMouseDown = (e) => {
    isDragging.current = true;
    startX.current = e.pageX - sliderRef.current.offsetLeft;
    scrollLeft.current = sliderRef.current.scrollLeft;
  };
  const handleMouseLeave = () => {
    isDragging.current = false;
  };
  const handleMouseUp = () => {
    isDragging.current = false;
  };
  const handleMouseMove = (e) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const x = e.pageX - sliderRef.current.offsetLeft;
    const walk = x - startX.current;
    sliderRef.current.scrollLeft = scrollLeft.current - walk;
  };
  const handleTouchStart = (e) => {
    isDragging.current = true;
    startX.current = e.touches[0].pageX - sliderRef.current.offsetLeft;
    scrollLeft.current = sliderRef.current.scrollLeft;
  };
  const handleTouchMove = (e) => {
    if (!isDragging.current) return;
    const x = e.touches[0].pageX - sliderRef.current.offsetLeft;
    const walk = x - startX.current;
    sliderRef.current.scrollLeft = scrollLeft.current - walk;
  };
  const handleTouchEnd = () => {
    isDragging.current = false;
  };

  // load conversion rate
  useEffect(() => {
    let r = parseFloat(localStorage.getItem("conversion_rate") || "0");
    if (r >= 1) r = r / 100;
    setConversionRate(r > 0 ? r : 0.01);
  }, []);

  // fetch wallet
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

        // Initialize selectedPoints from sweep_percentage (but don’t update wallet)
        if (data.wallet?.sweep_percentage != null && data.wallet?.points != null) {
          const sweepVal = Math.round(
            (parseInt(data.wallet.points, 10) || 0) *
              (parseFloat(data.wallet.sweep_percentage) / 100)
          );
          setSelectedPoints(sweepVal);
        }

        if (data.wallet?.points != null) {
          localStorage.setItem(
            "points",
            String(parseInt(data.wallet.points, 10) || 0)
          );
        }
        if (data.wallet?.cash_balance != null) {
          localStorage.setItem(
            "cashBalance",
            Number(data.wallet.cash_balance).toFixed(2)
          );
        }
      } catch (e) {
        console.error("[StockPicker] fetch wallet error:", e);
        setError("Network error while fetching wallet.");
      }
    })();
  }, [memberId]);

  // recompute cash value
  useEffect(() => {
    const cents = Math.round(selectedPoints * conversionRate * 100);
    setCashValue(cents / 100);
  }, [selectedPoints, conversionRate]);

  // PointsSelect helpers
  const handlePointsChange = (val) => {
    let v = parseInt(val ?? "0", 10);
    if (Number.isNaN(v)) v = 0;
    const max = parseInt(wallet?.points ?? "0", 10) || 0;
    if (v < 0) v = 0;
    if (v > max) v = max;
    setSelectedPoints(v);
  };

  // StockCategories helpers
  const handleCategoryClick = async (cat, scrId) => {
    try {
      setCategory(cat);
      setStockError("");
      setResults([]);
      const resp = await fetch(`${API_BASE}/proxy.php?scrId=${scrId}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const fetched =
        data.finance?.result?.[0]?.quotes?.map((q) => ({
          symbol: q.symbol,
          name: q.shortName,
          price: q.regularMarketPrice,
          change: q.regularMarketChangePercent,
        })) ||
        data.quoteResponse?.result?.map((q) => ({
          symbol: q.symbol,
          name: q.shortName || q.longName,
          price: q.regularMarketPrice,
          change: q.regularMarketChangePercent,
        })) ||
        [];
      setResults(fetched);
    } catch (err) {
      console.error("Proxy/Yahoo API error:", err);
      setStockError("Failed to fetch stocks");
    }
  };

  // ---- NEW: symbol search using proxy.php POST { symbol } ----
  const handleSymbolSearch = async () => {
    if (!symbolInput.trim()) return;
    setSearching(true);
    setStockError("");
    setResults([]);
    try {
      const resp = await fetch(`${API_BASE}/proxy.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: symbolInput.trim().toUpperCase() }),
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const data = await resp.json();

      // proxy may return different shapes; handle common ones:
      // 1) { success: true, symbol, name, price, change, raw? }
      // 2) Yahoo quoteResponse: { quoteResponse: { result: [ { ... } ] } }
      // 3) finance.result... (rare)
      if (data && data.success && data.symbol) {
        setCategory(`Symbol: ${data.symbol}`);
        setResults([
          {
            symbol: data.symbol,
            name: data.name || data.symbol,
            price: typeof data.price !== "undefined" ? data.price : null,
            change: typeof data.change !== "undefined" ? data.change : 0,
          },
        ]);
      } else if (data?.quoteResponse?.result?.length > 0) {
        const q = data.quoteResponse.result[0];
        setCategory(`Symbol: ${q.symbol}`);
        setResults([
          {
            symbol: q.symbol,
            name: q.shortName || q.longName || q.symbol,
            price: q.regularMarketPrice ?? null,
            change: q.regularMarketChangePercent ?? 0,
          },
        ]);
      } else if (data.finance?.result?.[0]?.quotes?.[0]) {
        const q = data.finance.result[0].quotes[0];
        setCategory(`Symbol: ${q.symbol}`);
        setResults([
          {
            symbol: q.symbol,
            name: q.shortName || q.longName || q.symbol,
            price: q.regularMarketPrice ?? null,
            change: q.regularMarketChangePercent ?? 0,
          },
        ]);
      } else {
        setStockError(data.error || "Symbol not found.");
      }
    } catch (err) {
      console.error("Symbol search error:", err);
      setStockError("Symbol lookup failed.");
    } finally {
      setSearching(false);
    }
  };

  const toggleSelect = (symbol) => {
    setSelectedStocks((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]
    );
  };

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

  // --- Rendering ---
  if (error) {
    return (
      <div className="page-container">
        <h2 className="heading">Convert Points to Shares</h2>
        <p className="form-error">{error}</p>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="page-container">
        <h2 className="heading">Convert Points</h2>
        <p>Loading…</p>
      </div>
    );
  }

  const availablePoints = parseInt(wallet.points, 10) || 0;
  const availableCash = Number(wallet.cash_balance) || 0;

  return (
    // Use the app container + categories-page classes so the layout matches your CSS and is centered
    <div className="app-container categories-page">
      {/* --- PointsSelect Section --- */}
      <h2 className="heading" style={{ marginBottom: "1rem", textAlign: "center" }}>
        Convert Points to Invest
      </h2>

      <div className="card" style={{ marginBottom: "1.25rem", textAlign: "center" }}>
        <p>
          <strong>Available Points:</strong> {availablePoints.toLocaleString()}
        </p>
        <p>
          <strong>Available Cash Balance:</strong> ${availableCash.toFixed(2)}
        </p>
      </div>

      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <p style={{ textAlign: "center" }}>
          <strong>Points to Convert</strong>
        </p>
        <input
          id="pointsToConvert"
          type="number"
          min="0"
          max={availablePoints}
          step="1"
          className="member-form-input"
          value={selectedPoints}
          onChange={(e) => handlePointsChange(e.target.value)}
          style={{ marginBottom: "0.75rem" }}
        />

        <div className="range-wrapper">
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
      </div>

      <div className="card" style={{ marginBottom: "1.25rem", textAlign: "center" }}>
        <p className="wallet-intro" style={{ marginBottom: "0.5rem" }}>
          Cash-Value used for this Order
        </p>
        <p className="wallet-cash" style={{ fontSize: "1.25rem" }}>
          ${cashValue.toFixed(2)}
        </p>
      </div>

      {/* --- Symbol Search Section --- */}
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <p style={{ textAlign: "center" }}>
          <strong>Lookup Symbol</strong>
        </p>

        {/* center the search box */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div style={{ position: "relative", width: "80%", minWidth: 180 }}>
            <input
              type="text"
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value)}
              placeholder="Enter symbol (e.g., AAPL)"
              className="member-form-input"
              style={{
                width: "100%",
                paddingRight: "1rem", // space for the icon
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSymbolSearch()}
              aria-label="Symbol input"
            />
            {/* Magnifying glass icon (clickable) */}
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
        {stockError && (
          <p className="points-error" style={{ marginTop: 8 }}>
            {stockError}
          </p>
        )}
      </div>

      {/* Categories as photo tiles */}
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
              backgroundImage: `url(${categoryImages[cat] || "/images/categories/default.jpg"})`,
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

      {/* --- Stock List Section --- */}
      {category && (
        <div className="stocklist-container" style={{ marginTop: 16 }}>
          <h2 className="stocklist-heading" style={{ textAlign: "center" }}>
            {category} Stocks
          </h2>

          {stockError && <p className="stocklist-error">{stockError}</p>}

          {!stockError && results.length === 0 && <p className="stocklist-empty">No stocks found.</p>}

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
                        <div className="price">${stock.price?.toFixed(2) ?? "N/A"}</div>
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

          <div className="stocklist-actions" style={{ marginTop: 12 }}>
            <button type="button" onClick={handleContinueStocks} className="btn-primary">
              Continue with Selected
            </button>
            <button
              type="button"
              onClick={() => setResults([])}
              className="btn-secondary"
              style={{ marginTop: 8 }}
            >
              Back to Categories
            </button>
          </div>
        </div>
      )}

      <div className="categories-footer" style={{ marginTop: 18 }}>
        <button type="button" onClick={() => navigate("/wallet")} className="btn-secondary">
          Back to Wallet
        </button>
      </div>
    </div>
  );
}
