// src/pages/StockPicker.jsx
import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { apiPost } from "../api";
import { API_BASE } from "../config/api";
import { useBasket } from "../context/BasketContext";
import { Search } from "lucide-react";

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

// ✅ Map categories to background images
const categoryImages = {
  "Most Active": "/images/categories/most-active.jpg",
  Trending: "/images/categories/trending.jpg",
  "Day Gainers": "/images/categories/gainers.jpg",
  "Day Losers": "/images/categories/losers.jpg",
  "Large Caps": "/images/categories/large-caps.jpg",
  "Small Caps": "/images/categories/small-caps.jpg",
  "Growth Tech": "/images/categories/growth-tech.jpg",
  "Mutual Funds": "/images/categories/mutual-funds.jpg",
  ETFs: "/images/categories/etf.jpg",
  "Crypto - Most Active": "/images/categories/crypto.jpg",
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

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      if (data && data.success && data.symbol) {
        setCategory(`Symbol: ${data.symbol}`);
        setResults([
          {
            symbol: data.symbol,
            name: data.name || data.symbol,
            price: data.price ?? null,
            change: data.change ?? 0,
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
    <div className="app-container categories-page">
      <h2 className="heading" style={{ marginBottom: "1rem", textAlign: "center" }}>
        Convert Points to Invest
      </h2>

      {/* Wallet summary */}
      <div className="card" style={{ marginBottom: "1.25rem", textAlign: "center" }}>
        <p>
          <strong>Available Points:</strong> {availablePoints.toLocaleString()}
        </p>
        <p>
          <strong>Available Cash Balance:</strong> ${availableCash.toFixed(2)}
        </p>
      </div>

      {/* Points selection */}
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <p style={{ textAlign: "center" }}>
          <strong>Points to Convert</strong>
        </p>
        <input
          type="number"
          min="0"
          max={availablePoints}
          value={selectedPoints}
          onChange={(e) => handlePointsChange(e.target.value)}
          className="member-form-input"
          style={{ marginBottom: "0.75rem" }}
        />
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

      {/* Stock list + actions */}
      {category && (
        <div style={{ marginTop: 16 }}>
          <h2 className="stocklist-heading" style={{ textAlign: "center" }}>
            {category} Stocks
          </h2>

          {stockError && <p className="stocklist-error">{stockError}</p>}
          {!stockError && results.length === 0 && (
            <p className="stocklist-empty">No stocks found.</p>
          )}

          {results.length > 0 && (
            <table className="stocklist-table">
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th>Price / Change %</th>
                </tr>
              </thead>
              <tbody>
                {results.map((stock) => (
                  <tr key={stock.symbol}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedStocks.includes(stock.symbol)}
                        onChange={() => toggleSelect(stock.symbol)}
                      />
                    </td>
                    <td>{stock.symbol}</td>
                    <td>{stock.name || "-"}</td>
                    <td>
                      ${stock.price?.toFixed(2) ?? "N/A"} (
                      {stock.change?.toFixed(2) ?? "0"}%)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: 12, textAlign: "center" }}>
            <button onClick={handleContinueStocks} className="btn-primary">
              Continue with Selected
            </button>
          </div>
        </div>
      )}

      <div className="categories-footer" style={{ marginTop: 18, textAlign: "center" }}>
        <button onClick={() => navigate("/wallet")} className="btn-secondary">
          Back to Wallet
        </button>
      </div>
    </div>
  );
}
