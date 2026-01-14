// src/pages/StockPicker.jsx
import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { apiPost } from "../api.js";
import { useBasket } from "../context/BasketContext";
import { Search } from "lucide-react";
import "../styles/StockPicker.css";

// ✅ Special category label
const POPULAR_MEMBER_PICKS = "Popular Member Picks";

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
  [POPULAR_MEMBER_PICKS]: "/icons/StockLoyal-icon.png", // ✅ StockLoyal icon
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

  // ✅ Get broker name from localStorage
  const brokerName =
    localStorage.getItem("broker") ||
    localStorage.getItem("selectedBroker") ||
    localStorage.getItem("brokerName") ||
    "Broker";

  // --- Wallet / points state ---
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState("");
  const [conversionRate, setConversionRate] = useState(0.01);
  const [selectedPoints, setSelectedPoints] = useState(initialPoints);
  const [cashValue, setCashValue] = useState(initialAmount);
  const [cashInput, setCashInput] = useState(initialAmount.toFixed(2));
  const [isEditingCash, setIsEditingCash] = useState(false);

  // --- Broker limits ---
  const [minOrderAmount, setMinOrderAmount] = useState(null);
  const [maxOrderAmount, setMaxOrderAmount] = useState(null);

  // --- Stock categories state ---
  const [category, setCategory] = useState("");
  const [results, setResults] = useState([]);
  const [stockError, setStockError] = useState("");
  const [selectedStocks, setSelectedStocks] = useState([]);
  const [loadingCategory, setLoadingCategory] = useState(false);

  // ✅ Pagination for infinite scroll (Yahoo screener only)
  const [currentOffset, setCurrentOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentScrId, setCurrentScrId] = useState("");
  const stockListContentRef = useRef(null);

  // --- Symbol search state ---
  const [symbolInput, setSymbolInput] = useState("");
  const [searching, setSearching] = useState(false);

  // --- Refs ---
  const sliderRef = useRef(null);

  // ✅ Bottom-sheet open/close state
  const [isStockListOpen, setIsStockListOpen] = useState(false);

  // 🎡 Audio + haptic feedback for wheel ticks
  const audioCtxRef = useRef(null);
  const lastTickTimeRef = useRef(0);

  const triggerWheelFeedback = () => {
    if (typeof window === "undefined") return;

    try {
      if ("vibrate" in navigator) {
        navigator.vibrate(8);
      }
    } catch {
      // ignore
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "square";
      osc.frequency.value = 1400;

      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.06);
    } catch {
      // ignore audio errors
    }
  };

  // Rate-limited tick while dragging
  const maybeTick = () => {
    const now =
      typeof performance !== "undefined" && performance.now()
        ? performance.now()
        : Date.now();
    if (now - lastTickTimeRef.current > 80) {
      lastTickTimeRef.current = now;
      triggerWheelFeedback();
    }
  };

  // Create portal container on mount
  useEffect(() => {
    let portalRoot = document.getElementById("stocklist-portal-root");
    if (!portalRoot) {
      portalRoot = document.createElement("div");
      portalRoot.id = "stocklist-portal-root";
      portalRoot.style.position = "fixed";
      portalRoot.style.top = "0";
      portalRoot.style.left = "0";
      portalRoot.style.right = "0";
      portalRoot.style.bottom = "0";
      portalRoot.style.zIndex = "999999";
      portalRoot.style.pointerEvents = "none";
      document.body.appendChild(portalRoot);
    }
    return () => {
      // Don't remove on unmount as other instances might use it
    };
  }, []);

  // --- Slider drag logic for categories ---
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const handleMouseDown = (e) => {
    isDragging.current = true;
    startX.current = e.pageX - sliderRef.current.offsetLeft;
    scrollLeft.current = sliderRef.current.scrollLeft;
    lastTickTimeRef.current = 0;
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
    sliderRef.current.scrollLeft = scrollLeft.current - (x - startX.current);
    maybeTick();
  };

  const handleTouchStart = (e) => {
    isDragging.current = true;
    startX.current = e.touches[0].pageX - sliderRef.current.offsetLeft;
    scrollLeft.current = sliderRef.current.scrollLeft;
    lastTickTimeRef.current = 0;
  };

  const handleTouchMove = (e) => {
    if (!isDragging.current) return;
    const x = e.touches[0].pageX - sliderRef.current.offsetLeft;
    sliderRef.current.scrollLeft = scrollLeft.current - (x - startX.current);
    maybeTick();
  };

  const handleTouchEnd = () => {
    isDragging.current = false;
  };

  // --- Load wallet (and broker limits) ---
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

        if (data.wallet?.min_order_amount != null) {
          setMinOrderAmount(Number(data.wallet.min_order_amount));
        }
        if (data.wallet?.max_order_amount != null) {
          setMaxOrderAmount(Number(data.wallet.max_order_amount));
        }

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

  // --- Points handler ---
  const handlePointsChange = (val) => {
    let v = parseInt(val ?? "0", 10);
    if (Number.isNaN(v)) v = 0;
    const max = parseInt(wallet?.points ?? "0", 10) || 0;
    v = Math.max(0, Math.min(v, max));
    setSelectedPoints(v);
  };

  // --- Derived broker-range check for cashValue ---
  const hasLimits =
    minOrderAmount != null && maxOrderAmount != null && maxOrderAmount > 0;
  const isCashOutsideLimits =
    hasLimits && (cashValue < minOrderAmount || cashValue > maxOrderAmount);

  const cashLimitError =
    hasLimits && isCashOutsideLimits
      ? `Cash-Value for this order must be between $${minOrderAmount.toFixed(
          2
        )} and $${maxOrderAmount.toFixed(2)} for your broker.`
      : "";

  // --- Yahoo Screener via proxy.php ---
  const handleCategoryClick = async (cat, scrId) => {
    if (isCashOutsideLimits) return;

    try {
      setCategory(cat);
      setStockError("");
      setResults([]);
      setSelectedStocks([]);
      setIsStockListOpen(true);
      setLoadingCategory(true);

      // ✅ Reset pagination (Yahoo screener)
      setCurrentOffset(0);
      setHasMore(true);
      setCurrentScrId(scrId);

      const data = await apiPost("proxy.php", { scrId, offset: 0 });
      if (!data || data.error) throw new Error(data.error || "Failed to load");

      const quotes =
        data.finance?.result?.[0]?.quotes ?? data.data ?? data.results ?? [];

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

      // Yahoo typically returns 25 results per page
      setHasMore(fetched.length >= 25);
      setCurrentOffset(25);
    } catch (err) {
      console.error("[StockPicker] proxy error:", err);
      setStockError("Failed to fetch stocks.");
    } finally {
      setLoadingCategory(false);
    }
  };

  // ✅ Popular Member Picks (orders aggregation + Yahoo enrichment via proxy.php symbol-mode)
  const handlePopularMemberPicks = async () => {
    if (isCashOutsideLimits) return;

    try {
      setCategory(POPULAR_MEMBER_PICKS);
      setStockError("");
      setResults([]);
      setSelectedStocks([]);
      setIsStockListOpen(true);
      setLoadingCategory(true);

      // ✅ Disable Yahoo pagination for this list
      setCurrentScrId("");
      setCurrentOffset(0);
      setHasMore(false);

      // 1) Pull top purchased symbols from backend
      const data = await apiPost("popular-member-picks.php", { limit: 50 });
      if (!data?.success) {
        throw new Error(data?.error || "Failed to load popular member picks");
      }

      const rows = Array.isArray(data.rows) ? data.rows : [];
      const cleaned = rows
        .map((r) => ({
          symbol: String(r?.symbol || "").trim().toUpperCase(),
          purchases: Number(r?.purchases || 0),
        }))
        .filter((r) => r.symbol);

      if (cleaned.length === 0) {
        setResults([]);
        return;
      }

      // 2) Enrich with Yahoo quote data via proxy.php { symbol: "AAPL,MSFT,..." }
      const symbolCsv = cleaned.map((r) => r.symbol).join(",");
      const quoteResp = await apiPost("proxy.php", { symbol: symbolCsv });

      const quoteArr =
        quoteResp?.data ??
        quoteResp?.results ??
        quoteResp?.finance?.result?.[0]?.quotes ??
        [];

      // Build map by symbol, handling both "already-normalized" and raw Yahoo quote shapes
      const quoteBySymbol = new Map();
      (Array.isArray(quoteArr) ? quoteArr : []).forEach((q) => {
        const sym = String(q?.symbol || "").toUpperCase();
        if (!sym) return;

        const name = q?.name || q?.shortName || q?.longName || sym;

        const price =
          q?.price ??
          q?.regularMarketPrice ??
          q?.postMarketPrice ??
          q?.preMarketPrice ??
          null;

        const change =
          q?.change ??
          q?.regularMarketChangePercent ??
          q?.postMarketChangePercent ??
          q?.preMarketChangePercent ??
          0;

        quoteBySymbol.set(sym, {
          name,
          price: price != null ? Number(price) : null,
          change: change != null ? Number(change) : 0,
        });
      });

      // 3) Merge: keep purchases visible under Name column
      const merged = cleaned.map((r) => {
        const q = quoteBySymbol.get(r.symbol);
        const displayName = q?.name || r.symbol;

        return {
          symbol: r.symbol,
          name: `${displayName} — Purchased ${r.purchases.toLocaleString()} times`,
          price: q?.price ?? null,
          change: q?.change ?? 0,
        };
      });

      setResults(merged);
    } catch (err) {
      console.error("[StockPicker] popular member picks error:", err);
      setStockError("Failed to load Popular Member Picks.");
    } finally {
      setLoadingCategory(false);
    }
  };

  // ✅ Load more stocks when scrolling (infinite scroll) — Yahoo only
  const loadMoreStocks = async () => {
    if (loadingMore || !hasMore || !currentScrId) {
      console.log("🚫 Skipping load more:", { loadingMore, hasMore, currentScrId });
      return;
    }

    try {
      console.log("📥 Loading more stocks - offset:", currentOffset);
      setLoadingMore(true);

      const data = await apiPost("proxy.php", {
        scrId: currentScrId,
        offset: currentOffset,
      });

      console.log("📦 Received data:", data);

      if (!data || data.error) {
        console.error("Failed to load more stocks:", data?.error);
        setHasMore(false);
        return;
      }

      const quotes =
        data.finance?.result?.[0]?.quotes ?? data.data ?? data.results ?? [];

      console.log("📊 Quotes received:", quotes.length);

      if (quotes.length === 0) {
        console.log("✋ No more results - stopping pagination");
        setHasMore(false);
        return;
      }

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

      console.log("✅ Fetched symbols:", fetched.map((f) => f.symbol).join(", "));

      setResults((prev) => {
        const existingSymbols = new Set(prev.map((s) => s.symbol));
        const newStocks = fetched.filter((s) => !existingSymbols.has(s.symbol));

        console.log(
          `Adding ${newStocks.length} new stocks (filtered ${
            fetched.length - newStocks.length
          } duplicates)`
        );

        if (newStocks.length === 0) {
          console.log("⚠️ All stocks were duplicates - stopping pagination");
          setHasMore(false);
          return prev;
        }

        return [...prev, ...newStocks];
      });

      const newOffset = currentOffset + 25;
      console.log("➡️ Next offset will be:", newOffset);
      setCurrentOffset(newOffset);
      setHasMore(fetched.length >= 25);
    } catch (err) {
      console.error("[StockPicker] load more error:", err);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  // ✅ Handle scroll event for infinite scroll
  const handleStockListScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      loadMoreStocks();
    }
  };

  // --- Symbol lookup (also open sheet on symbol search) ---
  const handleSymbolSearch = async () => {
    if (!symbolInput.trim()) return;
    setSearching(true);
    setStockError("");
    setResults([]);
    setSelectedStocks([]);
    setIsStockListOpen(true);

    try {
      const data = await apiPost("symbol-lookup.php", {
        symbol: symbolInput.trim().toUpperCase(),
      });

      if (!data.success) {
        setStockError(data.error || "Symbol not found.");
        return;
      }

      // Symbol lookup does not use Yahoo screener pagination
      setCurrentScrId("");
      setHasMore(false);

      setCategory(`Symbol: ${data.symbol}`);
      setResults([
        {
          symbol: data.symbol,
          name: data.name,
          price: data.price,
          change: data.change,
        },
      ]);
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
    if (isCashOutsideLimits) return;

    if (selectedStocks.length === 0) {
      alert("Please select at least one stock to continue.");
      return;
    }

    results
      .filter((stock) => selectedStocks.includes(stock.symbol))
      .forEach((stock) => addToBasket(stock));

    localStorage.setItem("basket_amount", String(cashValue));
    localStorage.setItem("basket_pointsUsed", String(selectedPoints));

    navigate("/basket", {
      state: { category, amount: cashValue, pointsUsed: selectedPoints, memberId },
    });
  };

  const handleCloseStockList = () => {
    setIsStockListOpen(false);
  };

  // ✅ Symbol chart route
  const handleSymbolClick = (symbol) => {
    if (!symbol) return;
    navigate(`/symbol-chart/${encodeURIComponent(symbol)}`);
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
      <h2
        className="page-title"
        style={{ marginBottom: "1rem", textAlign: "center" }}
      >
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
          <button
            type="button"
            className="range-btn"
            onClick={() => handlePointsChange(0)}
          >
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
          Cash-Value used for this Buy Order
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

        {/* Broker range validation */}
        {cashLimitError && (
          <p className="points-error" style={{ marginTop: "0.75rem", fontSize: "0.9rem" }}>
            {cashLimitError}
          </p>
        )}
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
        {searching && (
          <p className="caption" style={{ marginTop: 8 }}>
            Searching…
          </p>
        )}
        {stockError && !isStockListOpen && (
          <p className="points-error" style={{ marginTop: 8 }}>
            {stockError}
          </p>
        )}
      </div>

      {/* Categories */}
      <h2 className="categories-title" style={{ textAlign: "center" }}>
        Select a Category
      </h2>

      {hasLimits && (
        <p
          className="caption"
          style={{
            textAlign: "center",
            marginTop: "-0.25rem",
            marginBottom: "0.75rem",
            fontSize: "0.85rem",
            color: isCashOutsideLimits ? "#b91c1c" : "#6b7280",
          }}
        >
          {brokerName} order range: ${minOrderAmount?.toFixed(2)} – $
          {maxOrderAmount?.toFixed(2)}
        </p>
      )}

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
        {/* ✅ NEW: Popular Member Picks button (FIRST) */}
        <button
          key={POPULAR_MEMBER_PICKS}
          type="button"
          onClick={handlePopularMemberPicks}
          className="category-btn"
          disabled={isCashOutsideLimits}
          style={{
            minWidth: "160px",
            height: "100px",
            marginRight: "10px",
            borderRadius: "8px",
            backgroundImage: `url(${categoryImages[POPULAR_MEMBER_PICKS]})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            position: "relative",
            overflow: "hidden",
            color: "white",
            fontWeight: "600",
            opacity: isCashOutsideLimits ? 0.4 : 1,
            cursor: isCashOutsideLimits ? "not-allowed" : "pointer",
          }}
          title="Most purchased securities by StockLoyal members"
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
            {POPULAR_MEMBER_PICKS}
          </span>
        </button>

        {/* Existing Yahoo screener categories */}
        {Object.entries(categoryMap).map(([cat, scrId]) => (
          <button
            key={cat}
            type="button"
            onClick={() => handleCategoryClick(cat, scrId)}
            className="category-btn"
            disabled={isCashOutsideLimits}
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
              opacity: isCashOutsideLimits ? 0.4 : 1,
              cursor: isCashOutsideLimits ? "not-allowed" : "pointer",
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

      {/* 🔥 Bottom-sheet Stock list overlay - rendered via portal to dedicated container */}
      {isStockListOpen &&
        createPortal(
          <div
            className="stocklist-overlay"
            onClick={handleCloseStockList}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: "var(--footer-height)",
              width: "100vw",
              height: "calc(100vh - var(--footer-height))",
              background: "rgba(0, 0, 0, 0.5)",
              zIndex: 999999,
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-end",
              pointerEvents: "auto",
            }}
          >
            <div
              className="stocklist-sheet"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "relative",
                width: "100%",
                maxWidth: "var(--app-max-width)",
                background: "#fff",
                borderTopLeftRadius: "20px",
                borderTopRightRadius: "20px",
                boxShadow: "0 -10px 30px rgba(0, 0, 0, 0.25)",
                maxHeight: "calc(85vh - var(--footer-height))",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                animation: "stocklist-slide-up 0.3s ease-out",
                margin: "0 auto",
                zIndex: 999999,
                pointerEvents: "auto",
              }}
            >
              <div className="stocklist-sheet-header">
                <div className="stocklist-sheet-handle" />
                <div className="stocklist-sheet-title-row">
                  <h2 className="stocklist-heading">
                    {category ? `${category} Stocks` : "Stocks"}
                  </h2>
                  <button
                    type="button"
                    className="stocklist-close-btn"
                    onClick={handleCloseStockList}
                  >
                    ✕
                  </button>
                </div>
                {loadingCategory && (
                  <p className="stocklist-loading">Loading stocks…</p>
                )}
                {stockError && !loadingCategory && (
                  <p className="stocklist-error">{stockError}</p>
                )}
              </div>

              <div
                className="stocklist-sheet-content"
                ref={stockListContentRef}
                onScroll={handleStockListScroll}
              >
                {!loadingCategory && !stockError && results.length === 0 && (
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
                            <td
                              className="symbol"
                              style={{
                                color: "#2563eb",
                                cursor: "pointer",
                                fontWeight: 600,
                                textDecoration: "underline",
                              }}
                              onClick={() => handleSymbolClick(stock.symbol)}
                              title={`View ${stock.symbol} chart`}
                            >
                              {stock.symbol}
                            </td>
                            <td className="text-left">{stock.name || "-"}</td>
                            <td className="price-change">
                              <div className="price">
                                {stock.price != null
                                  ? `$${Number(stock.price).toFixed(2)}`
                                  : "N/A"}
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

                    {/* ✅ Loading indicator for infinite scroll (Yahoo only) */}
                    {loadingMore && (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "20px",
                          color: "#6b7280",
                          fontSize: "0.9rem",
                        }}
                      >
                        Loading more stocks...
                      </div>
                    )}

                    {/* ✅ End of results indicator */}
                    {!hasMore && results.length > 0 && !loadingMore && (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "20px",
                          color: "#9ca3af",
                          fontSize: "0.85rem",
                          fontStyle: "italic",
                        }}
                      >
                        No more stocks to load
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Sheet footer actions */}
              <div className="stocklist-sheet-footer">
                <button
                  type="button"
                  onClick={handleContinueStocks}
                  className="btn-primary"
                  style={{ width: "100%", marginBottom: 8 }}
                  disabled={isCashOutsideLimits}
                >
                  Continue with Selected
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsStockListOpen(false);
                    navigate("/wallet");
                  }}
                  className="btn-secondary"
                  style={{ width: "100%" }}
                >
                  Back to Wallet
                </button>
              </div>
            </div>
          </div>,
          document.getElementById("stocklist-portal-root") || document.body
        )}
    </div>
  );
}
