// src/pages/StockPicker.jsx
import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { apiPost } from "../api.js";
import { useBasket } from "../context/BasketContext";
import { Search, Heart, HeartOff, Trash2 } from "lucide-react";
import "../styles/StockPicker.css";

// ✅ Special category labels
const MY_PICKS = "My Picks"; // ✅ Member's persisted picks
const POPULAR_MEMBER_PICKS = "Popular Member Picks";

// ✅ Map categories -> API screener IDs
const categoryMap = {
  "Most Active": "most_actives",
  "Growth Tech": "growth_technology_stocks",
  "Mutual Funds": "top_mutual_funds",
  "ETFs": "etf",
  "Crypto - Most Active": "most_actives_cryptocurrencies",
  "Large Caps": "undervalued_large_caps",
  "Small Caps": "aggressive_small_caps",
  "Day Gainers": "day_gainers",
  "Day Losers": "day_losers",
};

// ✅ Map categories -> background images
const categoryImages = {
  [POPULAR_MEMBER_PICKS]: "/icons/StockLoyal-icon.png",
  [MY_PICKS]: "/icons/thumbs-up.jpg",
  "Most Active": "/icons/most-active.jpg",
  "Large Caps": "/icons/large-caps.jpg",
  "Small Caps": "/icons/small-caps.jpg",
  "Growth Tech": "/icons/growth-tech.jpg",
  "Mutual Funds": "/icons/mutual-funds.jpg",
  "ETFs": "/icons/etfs.jpg",
  "Crypto - Most Active": "/icons/crypto.jpg",
  "Day Gainers": "/icons/day-gainers.jpg",
  "Day Losers": "/icons/day-losers.jpg",
};

export default function StockPicker() {
  const navigate = useNavigate();
  const location = useLocation();
  const { addToBasket, basket } = useBasket();

  const memberId = localStorage.getItem("memberId");
  const { amount: initialAmount = 0, pointsUsed: initialPoints = 0 } =
    location.state || {};

  // ✅ Get merchant name from localStorage
  const merchantName =
    localStorage.getItem("merchantName") || "Merchant";
  
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

  // ✅ NEW: Member's saved picks (from junction table)
  const [memberPicks, setMemberPicks] = useState(new Set());
  const [savingPick, setSavingPick] = useState(null); // Track which symbol is being saved/removed

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

  // ✅ NEW: Load member's saved picks on mount
  useEffect(() => {
    if (!memberId) return;
    
    (async () => {
      try {
        const data = await apiPost("get-member-picks.php", { 
          member_id: memberId,
          active_only: true 
        });
        if (data?.success && Array.isArray(data.picks)) {
          const symbols = new Set(data.picks.map(p => p.symbol.toUpperCase()));
          setMemberPicks(symbols);
        }
      } catch (err) {
        console.error("[StockPicker] Failed to load member picks:", err);
      }
    })();
  }, [memberId]);

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

        // ✅ Only apply sweep default if user didn't pass explicit values via location.state
        // This preserves the slider values when user comes from Wallet with specific amounts
        if (initialPoints === 0 && data.wallet?.sweep_percentage && data.wallet?.points) {
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
  }, [memberId, initialPoints]);

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

  // ✅ Sync slider values to localStorage so they always reflect current selection
  useEffect(() => {
    if (selectedPoints > 0 && cashValue > 0) {
      localStorage.setItem("basket_amount", cashValue.toFixed(2));
      localStorage.setItem("basket_pointsUsed", String(selectedPoints));
    }
  }, [selectedPoints, cashValue]);

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

  // ✅ NEW: Save a stock to My Picks
  const handleSaveToPicks = async (symbol) => {
    if (!memberId || !symbol) return;
    
    const sym = symbol.toUpperCase();
    setSavingPick(sym);
    
    try {
      const data = await apiPost("save-member-pick.php", {
        member_id: memberId,
        symbol: sym,
        is_active: true
      });
      
      if (data?.success) {
        setMemberPicks(prev => new Set([...prev, sym]));
        // Show brief feedback
        console.log(`✅ Added ${sym} to My Picks`);
      } else {
        console.error("Failed to save pick:", data?.error);
        alert(data?.error || "Failed to save pick");
      }
    } catch (err) {
      console.error("[StockPicker] save pick error:", err);
      alert("Failed to save pick");
    } finally {
      setSavingPick(null);
    }
  };

  // ✅ NEW: Remove a stock from My Picks
  const handleRemoveFromPicks = async (symbol) => {
    if (!memberId || !symbol) return;
    
    const sym = symbol.toUpperCase();
    setSavingPick(sym);
    
    try {
      const data = await apiPost("remove-member-pick.php", {
        member_id: memberId,
        symbol: sym,
        hard_delete: true // Permanent remove
      });
      
      if (data?.success) {
        setMemberPicks(prev => {
          const next = new Set(prev);
          next.delete(sym);
          return next;
        });
        
        // If we're in My Picks view, also remove from results
        if (category === MY_PICKS) {
          setResults(prev => prev.filter(s => s.symbol !== sym));
          setSelectedStocks(prev => prev.filter(s => s !== sym));
        }
        
        console.log(`🗑️ Removed ${sym} from My Picks`);
      } else {
        console.error("Failed to remove pick:", data?.error);
        alert(data?.error || "Failed to remove pick");
      }
    } catch (err) {
      console.error("[StockPicker] remove pick error:", err);
      alert("Failed to remove pick");
    } finally {
      setSavingPick(null);
    }
  };

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

  // ✅ My Picks - Member's persisted picks from junction table
  // autoLoadToBasket: false = just show the list, true = load to basket and navigate
  const handleMyPicks = async (autoLoadToBasket = false) => {
    if (isCashOutsideLimits) return;

    try {
      setCategory(MY_PICKS);
      setStockError("");
      setResults([]);
      setSelectedStocks([]);
      setIsStockListOpen(true);
      setLoadingCategory(true);

      // ✅ Disable Yahoo pagination for this list
      setCurrentScrId("");
      setCurrentOffset(0);
      setHasMore(false);

      // 1) Pull member's saved picks from junction table
      const data = await apiPost("my-picks.php", { 
        member_id: memberId,
        limit: 50 
      });
      
      if (!data?.success) {
        throw new Error(data?.error || "Failed to load your picks");
      }

      const rows = Array.isArray(data.rows) ? data.rows : [];
      const cleaned = rows
        .map((r) => ({
          symbol: String(r?.symbol || "").trim().toUpperCase(),
          allocation_pct: r?.allocation_pct,
          priority: r?.priority || 0,
        }))
        .filter((r) => r.symbol);

      if (cleaned.length === 0) {
        setResults([]);
        setStockError("You haven't saved any picks yet. Browse categories and tap the ❤️ to save stocks for your monthly sweep!");
        setLoadingCategory(false);
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

      // Build map by symbol
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

      // 3) Merge: show allocation if set
      const merged = cleaned.map((r) => {
        const q = quoteBySymbol.get(r.symbol);
        const displayName = q?.name || r.symbol;
        const allocLabel = r.allocation_pct ? ` — ${r.allocation_pct}%` : '';

        return {
          symbol: r.symbol,
          name: `${displayName}${allocLabel}`,
          price: q?.price ?? null,
          change: q?.change ?? 0,
          allocation_pct: r.allocation_pct,
        };
      });

      setResults(merged);
      
      // ✅ Auto-select all stocks for My Picks
      const allSymbols = merged.map((s) => s.symbol);
      setSelectedStocks(allSymbols);

      // ✅ If autoLoadToBasket, add all picks to basket and navigate
      if (autoLoadToBasket && merged.length > 0) {
        // Calculate amount per stock (equal split or use allocation_pct)
        merged.forEach((stock) => {
          const allocation = stock.allocation_pct 
            ? (parseFloat(stock.allocation_pct) / 100) 
            : (1 / merged.length);
          const stockAmount = cashValue * allocation;
          const stockPoints = Math.round(selectedPoints * allocation);

          addToBasket({
            symbol: stock.symbol,
            name: stock.name,
            price: stock.price,
            amount: stockAmount,
            pointsUsed: stockPoints,
          });
        });

        // ✅ localStorage is already synced via useEffect when slider changes

        // Close the modal and navigate to basket
        setIsStockListOpen(false);
        setLoadingCategory(false);
        navigate("/basket");
        return;
      }
    } catch (err) {
      console.error("[StockPicker] my picks error:", err);
      setStockError("Failed to load your picks.");
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

      if (!data || data.error) throw new Error(data.error || "Failed to load more");

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

      if (fetched.length === 0) {
        setHasMore(false);
        return;
      }

      // Filter out duplicates
      setResults((prev) => {
        const existingSymbols = new Set(prev.map((s) => s.symbol));
        const newStocks = fetched.filter((s) => !existingSymbols.has(s.symbol));
        return [...prev, ...newStocks];
      });

      setCurrentOffset((prev) => prev + 25);
      setHasMore(fetched.length >= 25);
    } catch (err) {
      console.error("[StockPicker] load more error:", err);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  // ✅ Infinite scroll handler
  const handleStockListScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const threshold = 100;

    if (scrollHeight - scrollTop - clientHeight < threshold) {
      loadMoreStocks();
    }
  };

  // --- Toggle stock selection ---
  const toggleSelect = (symbol) => {
    setSelectedStocks((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]
    );
  };

  // --- Close stock list ---
  const handleCloseStockList = () => {
    setIsStockListOpen(false);
  };

  // --- Continue with selected stocks ---
  // ✅ Adds to basket but stays on StockPicker page (doesn't navigate)
  const handleContinueStocks = () => {
    if (selectedStocks.length === 0) {
      alert("Please select at least one stock.");
      return;
    }

    // Get full stock details for selected symbols
    const selectedDetails = results.filter((s) =>
      selectedStocks.includes(s.symbol)
    );

    // Calculate amount per stock
    const amountPerStock = cashValue / selectedStocks.length;
    const pointsPerStock = Math.round(selectedPoints / selectedStocks.length);

    // Add to basket
    selectedDetails.forEach((stock) => {
      addToBasket({
        symbol: stock.symbol,
        name: stock.name,
        price: stock.price,
        amount: amountPerStock,
        pointsUsed: pointsPerStock,
      });
    });

    // ✅ localStorage is already synced via useEffect when slider changes

    // ✅ Close the stock list sheet but stay on StockPicker page
    setIsStockListOpen(false);
    
    // Reset selections for next browse
    setSelectedStocks([]);
    setResults([]);
    setCategory("");
  };

  // --- Symbol search ---
  const handleSymbolSearch = async () => {
    const sym = symbolInput.trim().toUpperCase();
    if (!sym) return;

    if (isCashOutsideLimits) return;

    try {
      setSearching(true);
      setCategory(`Search: ${sym}`);
      setStockError("");
      setResults([]);
      setSelectedStocks([]);
      setIsStockListOpen(true);
      setLoadingCategory(true);

      // Disable pagination for search
      setCurrentScrId("");
      setCurrentOffset(0);
      setHasMore(false);

      const quoteResp = await apiPost("proxy.php", { symbol: sym });

      const quoteArr =
        quoteResp?.data ??
        quoteResp?.results ??
        quoteResp?.finance?.result?.[0]?.quotes ??
        [];

      if (!Array.isArray(quoteArr) || quoteArr.length === 0) {
        setStockError(`No results found for "${sym}"`);
        return;
      }

      const fetched = quoteArr.map((q) => ({
        symbol: q.symbol || q.Symbol || sym,
        name: q.name || q.shortName || q.longName || sym,
        price:
          q.price ??
          q.regularMarketPrice ??
          q.postMarketPrice ??
          q.preMarketPrice ??
          null,
        change:
          q.change ??
          q.regularMarketChangePercent ??
          q.postMarketChangePercent ??
          q.preMarketChangePercent ??
          0,
      }));

      setResults(fetched);
    } catch (err) {
      console.error("[StockPicker] symbol search error:", err);
      setStockError(`Failed to search for "${sym}"`);
    } finally {
      setSearching(false);
      setLoadingCategory(false);
    }
  };

  // --- Handle clicking on symbol to view chart ---
  const handleSymbolClick = (symbol) => {
    window.open(`https://finance.yahoo.com/quote/${symbol}`, "_blank");
  };

  // --- Cash input handlers ---
  const handleCashInputChange = (e) => {
    setCashInput(e.target.value);
  };

  const handleCashInputFocus = () => {
    setIsEditingCash(true);
  };

  const handleCashInputBlur = () => {
    setIsEditingCash(false);
    let val = parseFloat(cashInput);
    if (Number.isNaN(val) || val < 0) val = 0;

    // Reverse calculate points from cash
    const points = Math.round(val / conversionRate);
    const max = parseInt(wallet?.points ?? "0", 10) || 0;
    const clampedPoints = Math.min(points, max);

    setSelectedPoints(clampedPoints);

    // Recalculate cash from clamped points
    const cents = Math.round(clampedPoints * conversionRate * 100);
    const finalCash = cents / 100;
    setCashValue(finalCash);
    setCashInput(finalCash.toFixed(2));
  };

  // --- Derived values ---
  const maxPoints = parseInt(wallet?.points ?? "0", 10) || 0;

  // ✅ Render pick action button (heart to add, trash to remove)
  const renderPickAction = (stock) => {
    const sym = stock.symbol.toUpperCase();
    const isPicked = memberPicks.has(sym);
    const isSaving = savingPick === sym;

    if (category === MY_PICKS) {
      // In My Picks view, show remove button
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleRemoveFromPicks(sym);
          }}
          disabled={isSaving}
          title="Remove from My Picks"
          style={{
            background: "transparent",
            border: "none",
            cursor: isSaving ? "wait" : "pointer",
            padding: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: isSaving ? 0.5 : 1,
          }}
        >
          <Trash2 size={18} color="#ef4444" />
        </button>
      );
    }

    // In other views, show heart toggle
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (isPicked) {
            handleRemoveFromPicks(sym);
          } else {
            handleSaveToPicks(sym);
          }
        }}
        disabled={isSaving}
        title={isPicked ? "Remove from My Picks" : "Add to My Picks"}
        style={{
          background: "transparent",
          border: "none",
          cursor: isSaving ? "wait" : "pointer",
          padding: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: isSaving ? 0.5 : 1,
        }}
      >
        {isPicked ? (
          <Heart size={18} color="#ef4444" fill="#ef4444" />
        ) : (
          <Heart size={18} color="#9ca3af" />
        )}
      </button>
    );
  };

  if (error) {
    return (
      <div className="page-container">
        <p className="form-error">{error}</p>
        <button className="btn-secondary" onClick={() => navigate("/wallet")}>
          Back to Wallet
        </button>
      </div>
    );
  }

  if (!wallet) {
    return (
      <div className="page-container">
        <p>Loading wallet...</p>
      </div>
    );
  }

  return (
    <div className="wallet-container" style={{ paddingBottom: "100px" }}>
      <h1 className="page-title">Pick Your Securities</h1>
      <p style={{ textAlign: "center", color: "#6b7280", marginBottom: "1rem" }}>
        All orders are placed through your broker, {brokerName}.
      </p>

      {/* Points / Cash display */}
      <div
        style={{
          background: "#f9fafb",
          borderRadius: "12px",
          padding: "1rem",
          marginBottom: "1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          {/* Points side */}
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "0.25rem" }}>
              Points Used
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: "700", color: "#2563eb" }}>
              {selectedPoints.toLocaleString()}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
              out of {maxPoints.toLocaleString()} available
            </div>
          </div>

          {/* Arrow */}
          <div style={{ fontSize: "1.5rem", color: "#9ca3af" }}>→</div>

          {/* Cash side */}
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: "0.85rem", color: "#6b7280", marginBottom: "0.25rem" }}>
              Cash Value
            </div>
            <div style={{ position: "relative", display: "inline-block", width: "100%" }}>
              <span
                style={{
                  position: "absolute",
                  left: "0.5rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: "1.5rem",
                  fontWeight: "700",
                  color: "#22c55e",
                }}
              >
                $
              </span>
              <input
                type="text"
                value={cashInput}
                onChange={handleCashInputChange}
                onFocus={handleCashInputFocus}
                onBlur={handleCashInputBlur}
                className="form-input"
                style={{ 
                  width: "100%",
                  fontSize: "1.5rem",
                  fontWeight: "700",
                  textAlign: "center",
                  padding: "0.5rem",
                  paddingLeft: "1.5rem",
                  height: "auto",
                  color: "#22c55e",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div 
              style={{ 
                fontSize: "0.75rem", 
                color: "#6b7280",
                textAlign: "center",
                marginTop: "0.25rem",
              }}
            >
              @ {conversionRate}/pt conversion rate
            </div>
          </div>
        </div>

        {/* Slider below */}
        <div style={{ marginTop: "1rem" }}>
          <input
            type="range"
            min={0}
            max={maxPoints}
            value={selectedPoints}
            onChange={(e) => handlePointsChange(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        {cashLimitError && (
          <p className="form-error" style={{ marginTop: "0.5rem", textAlign: "center" }}>
            {cashLimitError}
          </p>
        )}
      </div>

       {/* ✅ Category slider at TOP */}
      <div
        ref={sliderRef}
        className="category-slider"
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          display: "flex",
          overflowX: "auto",
          gap: "0px",
          paddingBottom: "10px",
          marginBottom: "1rem",
          cursor: "grab",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {/* My Picks button - opens slide to view/manage */}
        <button
          type="button"
          onClick={() => handleMyPicks(false)}
          className="category-btn"
          disabled={isCashOutsideLimits}
          style={{
            minWidth: "140px",
            height: "90px",
            marginRight: "10px",
            borderRadius: "8px",
            backgroundImage: `url(${categoryImages[MY_PICKS]})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            position: "relative",
            overflow: "hidden",
            color: "white",
            fontWeight: "600",
            opacity: isCashOutsideLimits ? 0.4 : 1,
            cursor: isCashOutsideLimits ? "not-allowed" : "pointer",
          }}
          title="Your saved picks for monthly sweep"
        >
          {/* Badge showing count of picks */}
          {memberPicks.size > 0 && (
            <span
              style={{
                position: "absolute",
                top: "6px",
                right: "6px",
                background: "#ef4444",
                color: "white",
                borderRadius: "50%",
                width: "22px",
                height: "22px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.75rem",
                fontWeight: "700",
              }}
            >
              {memberPicks.size}
            </span>
          )}
          <span
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              padding: "6px",
              background: "rgba(0,0,0,0.5)",
              textAlign: "center",
              fontSize: "0.85rem",
            }}
          >
            {MY_PICKS}
          </span>
        </button>

        {/* Popular Member Picks */}
        <button
          type="button"
          onClick={handlePopularMemberPicks}
          className="category-btn"
          disabled={isCashOutsideLimits}
          style={{
            minWidth: "140px",
            height: "90px",
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
              fontSize: "0.85rem",
            }}
          >
            {POPULAR_MEMBER_PICKS}
          </span>
        </button>

        {/* Yahoo screener categories */}
        {Object.entries(categoryMap).map(([catName, scrId]) => (
          <button
            key={catName}
            type="button"
            onClick={() => handleCategoryClick(catName, scrId)}
            className="category-btn"
            disabled={isCashOutsideLimits}
            style={{
              minWidth: "140px",
              height: "90px",
              marginRight: "10px",
              borderRadius: "8px",
              backgroundImage: `url(${categoryImages[catName] || "/icons/default-category.jpg"})`,
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
                fontSize: "0.85rem",
              }}
            >
              {catName}
            </span>
          </button>
        ))}
      </div>

      {/* Symbol search */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "1rem",
        }}
      >
        <label style={{ fontSize: "0.9rem", color: "#6b7280", flexShrink: 0 }}>
          Search:
        </label>
        <input
          type="text"
          placeholder="AAPL"
          value={symbolInput}
          onChange={(e) => setSymbolInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSymbolSearch()}
          className="form-input"
          style={{ width: "100px", fontSize: "0.9rem", flexShrink: 0 }}
          disabled={isCashOutsideLimits}
        />
        <button
          type="button"
          onClick={handleSymbolSearch}
          className="btn-primary"
          disabled={searching || isCashOutsideLimits}
          style={{ 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            padding: "0.4rem",
            minWidth: "36px",
            width: "36px",
            height: "36px",
            flexShrink: 0,
          }}
        >
          <Search size={16} />
        </button>
      </div>

      {/* ==== Dynamic Disclosure (Correct Broker Displayed) ==== */}
<p className="form-disclosure">
  <strong>My Picks:</strong> Securities saved under <em>My Picks</em> are used in the automated <b><em>Sweep</em></b> process according to the schedule 
  established between {merchantName} and {brokerName}. You can add securities to your <em>My Picks</em> list by selecting 
  them from any category and clicking the heart <Heart size={18} color="#9ca3af" /> icon.
  To remove a selection, click the trash can <Trash2 size={18} color="#9ca3af" /> icon.
</p>

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
                          <th style={{ width: "40px" }}>Pick</th>
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
                            <td className="text-center">
                              {renderPickAction(stock)}
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
        {/* Bottom Action Bar */}
      <div className="stockpicker-bottom-actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate("/wallet")}
        >
          Go back to Wallet
        </button>

        {/* ✅ Go to Basket - shows basket item count */}
        <button
          type="button"
          className="btn-primary"
          onClick={() => navigate("/basket")}
          disabled={!basket || basket.length === 0}
          style={{
            opacity: (!basket || basket.length === 0) ? 0.5 : 1,
            cursor: (!basket || basket.length === 0) ? "not-allowed" : "pointer",
          }}
        >
          Go to Basket {basket?.length > 0 && `(${basket.length})`}
        </button>
      </div>

    </div>
  );
}
