// src/pages/StockPicker.jsx
import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { apiPost } from "../api.js";
import { useBasket } from "../context/BasketContext";
import { Search, Trash2, ShoppingBasket, ClipboardCheck, Wallet as WalletIcon } from "lucide-react";
import "../styles/StockPicker.css";

// ✅ Special category labels
const MY_PICKS = "My Basket"; // ✅ Member's persisted list of securities for sweeps
const POPULAR_MEMBER_PICKS = "Popular Member Picks";

// ✅ Map categories -> API screener IDs
const categoryMap = {
  "Most Active": "most_actives",
  "Growth Tech": "growth_technology_stocks",
  "Mutual Funds": "top_mutual_funds",
  "ETFs": "etf",
  "Cryptocurrency ETFs": "most_actives_cryptocurrencies",
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
  "Cryptocurrency ETFs": "/icons/crypto.jpg",
  "Day Gainers": "/icons/day-gainers.jpg",
  "Day Losers": "/icons/day-losers.jpg",
};

export default function StockPicker() {
  const navigate = useNavigate();
  const location = useLocation();
  const { addToBasket, basket, clearBasket, removeFromBasket } = useBasket();

  const memberId = localStorage.getItem("memberId");
  const { amount: initialAmount = 0, pointsUsed: initialPoints = 0 } =
    location.state || {};

  // ✅ Get merchant name from localStorage
  const merchantName =
    localStorage.getItem("merchantName") || "Merchant";

  // ✅ Get sweep day from localStorage (merchant data)
  const sweepDay = localStorage.getItem("sweep_day");

  // ✅ Format sweep day for display (handles VARCHAR values)
  // Returns null for "T+1" (handled separately) or invalid values
  const formatSweepDay = (day) => {
    if (!day || day === "null") return null;
    // "T+1" is handled separately in the JSX, return null here
    if (day === "T+1") return null;
    const numDay = parseInt(day, 10);
    if (isNaN(numDay)) return null;
    if (numDay === -1) return "the last business day";
    if (numDay === 1) return "the 1st";
    if (numDay === 2) return "the 2nd";
    if (numDay === 3) return "the 3rd";
    if (numDay === 21) return "the 21st";
    if (numDay === 22) return "the 22nd";
    if (numDay === 23) return "the 23rd";
    if (numDay === 31) return "the 31st";
    return `the ${numDay}th`;
  };
  
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
  const [cashInput, setCashInput] = useState(String(Math.floor(initialAmount)));
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

  // ✅ NEW: Persistent My Basket data (always visible on page)
  const [myActiveListData, setMyActiveListData] = useState([]);
  const [loadingMyActiveList, setLoadingMyActiveList] = useState(true);
  const [myActiveListSelected, setMyActiveListSelected] = useState([]); // Selected symbols from persistent table

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

  // ✅ NEW: Load member's saved picks AND My Basket data on mount
  useEffect(() => {
    if (!memberId) return;
    
    (async () => {
      try {
        // Load member picks for the Set (used for checkbox state)
        const picksData = await apiPost("get-member-picks.php", { 
          member_id: memberId,
          active_only: true 
        });
        if (picksData?.success && Array.isArray(picksData.picks)) {
          const symbols = new Set(picksData.picks.map(p => p.symbol.toUpperCase()));
          setMemberPicks(symbols);
        }
      } catch (err) {
        console.error("[StockPicker] Failed to load member picks:", err);
      }

      // Load full My Basket data with price enrichment
      await loadMyActiveList();
    })();
  }, [memberId]);

  // ✅ Function to load My Basket with Yahoo quote enrichment
  const loadMyActiveList = async () => {
    if (!memberId) return;
    
    setLoadingMyActiveList(true);
    
    try {
      // 1) Pull member's saved picks from junction table
      const data = await apiPost("my-picks.php", { 
        member_id: memberId,
        limit: 50 
      });
      
      if (!data?.success) {
        console.error("[StockPicker] Failed to load My Basket:", data?.error);
        setMyActiveListData([]);
        setLoadingMyActiveList(false);
        return;
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
        setMyActiveListData([]);
        setLoadingMyActiveList(false);
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

      // 3) Merge
      const merged = cleaned.map((r) => {
        const q = quoteBySymbol.get(r.symbol);
        return {
          symbol: r.symbol,
          name: q?.name || r.symbol,
          price: q?.price ?? null,
          change: q?.change ?? 0,
          allocation_pct: r.allocation_pct,
        };
      });

      setMyActiveListData(merged);
      
      // Auto-select all stocks in My Basket
      setMyActiveListSelected(merged.map((s) => s.symbol));
      
    } catch (err) {
      console.error("[StockPicker] My Basket load error:", err);
      setMyActiveListData([]);
    } finally {
      setLoadingMyActiveList(false);
    }
  };

  // ✅ Sync basket with My Basket selections
  // This ensures the basket always reflects what's selected in My Basket
  useEffect(() => {
    if (loadingMyActiveList || myActiveListData.length === 0) return;
    
    // Clear basket and rebuild from My Basket selections
    clearBasket();
    
    const selectedData = myActiveListData.filter((s) =>
      myActiveListSelected.includes(s.symbol)
    );
    
    if (selectedData.length === 0) return;
    
    // Calculate amount per stock (equal split or use allocation_pct)
    const totalAllocation = selectedData.reduce(
      (sum, s) => sum + (s.allocation_pct ? parseFloat(s.allocation_pct) : 0),
      0
    );
    const hasAllocations = totalAllocation > 0;

    selectedData.forEach((stock) => {
      const allocation = hasAllocations && stock.allocation_pct
        ? parseFloat(stock.allocation_pct) / totalAllocation
        : 1 / selectedData.length;
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
  }, [myActiveListSelected, myActiveListData, cashValue, selectedPoints, loadingMyActiveList]);

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

  // ✅ Use member's tier-specific conversion rate from wallet (mirrors Wallet.jsx line 629)
  useEffect(() => {
    if (wallet?.conversion_rate) {
      let r = Number(wallet.conversion_rate);
      if (r >= 1) r = r / 100;
      if (r > 0) {
        setConversionRate(r);
        console.log(`[StockPicker] Tier conversion rate: ${r} (tier: ${wallet.member_tier || localStorage.getItem("memberTier") || "default"})`);
        return;
      }
    }
    // Fallback to localStorage while wallet is loading
    let r = parseFloat(localStorage.getItem("conversion_rate") || "0");
    if (r >= 1) r = r / 100;
    setConversionRate(r > 0 ? r : 0.01);
  }, [wallet]);

  // --- Sync cash value to points ---
  useEffect(() => {
    if (!isEditingCash) {
      const cents = Math.round(selectedPoints * conversionRate * 100);
      const val = Math.floor(cents / 100);
      setCashValue(val);
      setCashInput(val.toLocaleString());
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
        )} and $${maxOrderAmount.toFixed(2)} for broker.`
      : "";

  // ✅ NEW: Save a stock to My Basket
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
        console.log(`✅ Added ${sym} to My Basket`);
        
        // ✅ Reload My Basket to get updated data with prices
        await loadMyActiveList();
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

  // ✅ NEW: Remove a stock from My Basket
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
        
        // If we're in My Basket view, also remove from results
        if (category === MY_PICKS) {
          setResults(prev => prev.filter(s => s.symbol !== sym));
          setSelectedStocks(prev => prev.filter(s => s !== sym));
        }
        
        // ✅ Also remove from persistent My Basket table
        setMyActiveListData(prev => prev.filter(s => s.symbol !== sym));
        setMyActiveListSelected(prev => prev.filter(s => s !== sym));
        
        console.log(`🗑️ Removed ${sym} from My Basket`);
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

  // ✅ Continue with selected stocks from persistent My Basket
  const handleContinueWithMyActiveList = () => {
    if (myActiveListSelected.length === 0) {
      alert("Please select at least one stock from My Basket");
      return;
    }

    // Get the selected stocks with their data
    const selectedData = myActiveListData.filter((s) =>
      myActiveListSelected.includes(s.symbol)
    );

    // Calculate amount per stock (equal split or use allocation_pct)
    const totalAllocation = selectedData.reduce(
      (sum, s) => sum + (s.allocation_pct ? parseFloat(s.allocation_pct) : 0),
      0
    );
    const hasAllocations = totalAllocation > 0;

    selectedData.forEach((stock) => {
      const allocation = hasAllocations && stock.allocation_pct
        ? parseFloat(stock.allocation_pct) / totalAllocation
        : 1 / selectedData.length;
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

    // ✅ Use handleProceedToOrder to enrich + navigate (replaces old navigate("/order"))
    // Small delay to let basket context update
    setTimeout(() => handleProceedToOrder(), 50);
  };

  // ✅ Proceed to Order — enriches basket with shares/allocation (replaces Basket.jsx)
  const handleProceedToOrder = () => {
    const basketArray = Array.isArray(basket) ? basket : [];
    if (basketArray.length === 0) {
      alert("Basket is empty. Please select stocks first.");
      return;
    }

    const investedAmount = cashValue;
    const basketCount = basketArray.length;

    // 🔥 Persist values so Order.jsx and other pages can access them
    localStorage.setItem("lastPointsUsed", String(selectedPoints));
    localStorage.setItem("lastInvestedAmount", String(investedAmount));
    localStorage.setItem("basket_pointsUsed", String(selectedPoints));
    localStorage.setItem("basket_amount", String(investedAmount));

    // ✅ Enrich basket with allocation + shares (same logic as Basket.jsx)
    const enrichedBasket = basketArray.map((stock) => {
      const allocation = investedAmount / basketCount;
      const price = Number(stock.price || 0);
      const shares = price > 0 ? allocation / price : 0;
      return {
        ...stock,
        allocatedAmount: allocation,
        shares: parseFloat(shares.toFixed(4)),
      };
    });

    navigate("/order", {
      state: {
        basket: enrichedBasket,
        amount: investedAmount,
        pointsUsed: selectedPoints,
        memberId,
      },
    });
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
          name: displayName,
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

  // ✅ My Basket - Member's persisted picks from junction table
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
        throw new Error(data?.error || "Failed to load stock picks");
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
        setStockError("You haven't saved any picks yet. Browse categories or search by symbol then click the checkbox to save stocks for monthly sweep!");
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
      
      // ✅ Auto-select all stocks for My Basket
      const allSymbols = merged.map((s) => s.symbol);
      setSelectedStocks(allSymbols);

      // ✅ If autoLoadToBasket, add all picks to basket and navigate with enrichment
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

        // Close the modal and navigate via enriched order flow
        setIsStockListOpen(false);
        setLoadingCategory(false);
        setTimeout(() => handleProceedToOrder(), 50);
        return;
      }
    } catch (err) {
      console.error("[StockPicker] My Basket error:", err);
      setStockError("Failed to load stock picks.");
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
  // ✅ Also adds to My Basket when selecting
  const toggleSelect = (symbol) => {
    const sym = symbol.toUpperCase();
    const isCurrentlySelected = selectedStocks.includes(sym);
    
    if (isCurrentlySelected) {
      // Deselecting - just remove from selected list
      setSelectedStocks((prev) => prev.filter((s) => s !== sym));
    } else {
      // Selecting - add to selected list AND add to My Basket
      setSelectedStocks((prev) => [...prev, sym]);
      
      // Also add to My Basket if not already in picks
      if (!memberPicks.has(sym)) {
        handleSaveToPicks(sym);
      }
    }
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
    const input = symbolInput.trim();
    if (!input) return;

    if (isCashOutsideLimits) return;

    try {
      setSearching(true);
      setCategory(`Search: ${input}`);
      setStockError("");
      setResults([]);
      setSelectedStocks([]);
      setIsStockListOpen(true);
      setLoadingCategory(true);

      // Disable pagination for search
      setCurrentScrId("");
      setCurrentOffset(0);
      setHasMore(false);

      // Determine if input looks like a symbol (1-5 uppercase letters) or a name search
      const isSymbolSearch = /^[A-Za-z]{1,5}$/.test(input) && input === input.toUpperCase();
      
      let searchResults = [];
      
      if (isSymbolSearch) {
        // Direct symbol lookup via proxy.php
        const quoteResp = await apiPost("proxy.php", { symbol: input.toUpperCase() });
        const quoteArr =
          quoteResp?.data ??
          quoteResp?.results ??
          quoteResp?.finance?.result?.[0]?.quotes ??
          [];

        if (Array.isArray(quoteArr) && quoteArr.length > 0) {
          searchResults = quoteArr.map((q) => ({
            symbol: q.symbol || q.Symbol || input.toUpperCase(),
            name: q.name || q.shortName || q.longName || input.toUpperCase(),
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
        }
      }
      
      // If no results from symbol search, or input looks like a name, try name search
      if (searchResults.length === 0) {
        const searchResp = await apiPost("proxy.php", { search: input });
        const searchArr = searchResp?.quotes || searchResp?.data || [];
        
        if (Array.isArray(searchArr) && searchArr.length > 0) {
          // Filter to only equity types (stocks) and get symbols
          const symbols = searchArr
            .filter(q => q.quoteType === 'EQUITY' || q.typeDisp === 'Equity' || !q.quoteType)
            .map(q => q.symbol)
            .filter(Boolean)
            .slice(0, 10); // Limit to 10 results
          
          if (symbols.length > 0) {
            // Get full quote data for each symbol
            const quoteResp = await apiPost("proxy.php", { symbol: symbols.join(",") });
            const quoteArr =
              quoteResp?.data ??
              quoteResp?.results ??
              quoteResp?.finance?.result?.[0]?.quotes ??
              [];

            // Build a map of search results for name fallback
            const searchMap = new Map();
            searchArr.forEach(q => {
              if (q.symbol) {
                searchMap.set(q.symbol.toUpperCase(), q.shortname || q.longname || q.symbol);
              }
            });

            if (Array.isArray(quoteArr)) {
              searchResults = quoteArr.map((q) => ({
                symbol: q.symbol || q.Symbol,
                name: q.name || q.shortName || q.longName || searchMap.get((q.symbol || "").toUpperCase()) || q.symbol,
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
            }
          }
        }
      }

      if (searchResults.length === 0) {
        setStockError(`No results found for "${input}"`);
        return;
      }

      setResults(searchResults);
    } catch (err) {
      console.error("[StockPicker] search error:", err);
      setStockError(`Failed to search for "${input}"`);
    } finally {
      setSearching(false);
      setLoadingCategory(false);
    }
  };

  // --- Handle clicking on symbol to view chart (TradingView) ---
  const handleSymbolClick = (symbol) => {
    if (!symbol) return;
    navigate(`/symbol-chart/${encodeURIComponent(symbol)}`);
  };

  // --- Cash input handlers ---
  const handleCashInputChange = (e) => {
    const raw = e.target.value;
    setCashInput(raw);

    // ✅ Real-time reverse calculation: cash → points → slider
    const val = parseFloat(raw);
    if (Number.isNaN(val) || val < 0) return;

    const points = Math.round(val / conversionRate);
    const max = parseInt(wallet?.points ?? "0", 10) || 0;
    const clampedPoints = Math.min(points, max);

    setSelectedPoints(clampedPoints);

    // Update cashValue immediately so limits and basket recalculate
    const cents = Math.round(clampedPoints * conversionRate * 100);
    setCashValue(Math.floor(cents / 100));
  };

  const handleCashInputFocus = () => {
    setIsEditingCash(true);
  };

  const handleCashInputBlur = () => {
    setIsEditingCash(false);

    // ✅ Final formatting: clamp and display clean value
    let val = parseFloat(cashInput);
    if (Number.isNaN(val) || val < 0) val = 0;

    const points = Math.round(val / conversionRate);
    const max = parseInt(wallet?.points ?? "0", 10) || 0;
    const clampedPoints = Math.min(points, max);

    setSelectedPoints(clampedPoints);

    const cents = Math.round(clampedPoints * conversionRate * 100);
    const finalCash = Math.floor(cents / 100);
    setCashValue(finalCash);
    setCashInput(finalCash.toLocaleString());
  };

  // --- Derived values ---
  const maxPoints = parseInt(wallet?.points ?? "0", 10) || 0;

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
      <h1 className="page-title">Build My Basket of Securities</h1>

      {/* Points / Cash display */}
      <div class="card card--accent"
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
              @ {conversionRate}/pt conversion rate{wallet?.member_tier ? ` (${wallet.member_tier})` : ""}
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

      <p style={{ fontSize: "0.9rem", color: "#6b7280", marginBottom: "0.5rem" }}>
        Select from these categories
      </p>

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
          placeholder="AAPL or Apple"
          value={symbolInput}
          onChange={(e) => setSymbolInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSymbolSearch()}
          className="form-input"
          style={{ width: "140px", fontSize: "0.9rem", flexShrink: 0 }}
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

      {/* ✅ PERSISTENT My Basket Table */}
      <div
        style={{
          background: "#f9fafb",
          borderRadius: "12px",
          padding: "1rem",
          marginBottom: "1rem",
          border: "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.75rem",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "1.5rem",
              fontWeight: "700",
              color: "#0056b3", 
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <ShoppingBasket size={18} style={{ verticalAlign: "middle" }} /> My Basket
            {myActiveListData.length > 0 && (
              <span
                style={{
                  background: "#2563eb",
                  color: "white",
                  borderRadius: "50%",
                  width: "22px",
                  height: "22px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                  fontWeight: "700",
                }}
              >
                {myActiveListData.length}
              </span>
            )}
          </h1>
        </div>

        {/* ✅ Basket investment summary (from Basket.jsx) */}
        {myActiveListSelected.length > 0 && cashValue > 0 && (
          <div style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: "8px",
            padding: "0.6rem 1rem",
            marginBottom: "0.75rem",
            textAlign: "center",
            fontSize: "0.875rem",
            color: "#1e40af",
          }}>
            Investing <strong>${Number(cashValue).toFixed(2)}</strong> across{" "}
            {myActiveListSelected.length} stock{myActiveListSelected.length !== 1 ? "s" : ""}, using{" "}
            <strong>{Number(selectedPoints).toLocaleString()}</strong> points
            {myActiveListSelected.length > 0 && (
              <> — <strong>${(cashValue / myActiveListSelected.length).toFixed(2)}</strong> per stock</>
            )}
          </div>
        )}

        {loadingMyActiveList ? (
          <p style={{ color: "#6b7280", fontSize: "0.9rem", textAlign: "center", padding: "1rem 0" }}>
            Loading latest picks...
          </p>
        ) : myActiveListData.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: "0.9rem", textAlign: "center", padding: "1rem 0" }}>
            You haven't saved any picks yet. Browse categories above or search by symbol then click the checkbox to save stocks for sweep process!
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="stocklist-table" style={{ width: "100%", fontSize: "0.85rem" }}>
              <thead>
                <tr>
                  <th style={{ width: "40px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={myActiveListSelected.length === myActiveListData.length && myActiveListData.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setMyActiveListSelected(myActiveListData.map((s) => s.symbol));
                        } else {
                          setMyActiveListSelected([]);
                        }
                      }}
                      title="Select all"
                    />
                  </th>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th style={{ textAlign: "right" }}>Price</th>
                  <th style={{ textAlign: "right" }}>
                    Shares
                    <div style={{ fontSize: "0.7rem", fontWeight: "normal", color: "#6b7280" }}>
                      Allocation
                    </div>
                  </th>
                  <th style={{ width: "40px", textAlign: "center" }}>Remove</th>
                </tr>
              </thead>
              <tbody>
                {myActiveListData.map((stock) => (
                  <tr key={stock.symbol}>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={myActiveListSelected.includes(stock.symbol)}
                        onChange={() => {
                          setMyActiveListSelected((prev) =>
                            prev.includes(stock.symbol)
                              ? prev.filter((s) => s !== stock.symbol)
                              : [...prev, stock.symbol]
                          );
                        }}
                      />
                    </td>
                    <td
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
                    <td style={{ maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {stock.name || "-"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {stock.price != null ? `$${Number(stock.price).toFixed(2)}` : "N/A"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {(() => {
                        const selectedCount = myActiveListSelected.length;
                        const isSelected = myActiveListSelected.includes(stock.symbol);
                        if (!isSelected || selectedCount === 0 || cashValue <= 0) return "—";
                        const allocation = cashValue / selectedCount;
                        const price = Number(stock.price || 0);
                        const shares = price > 0 ? allocation / price : 0;
                        return (
                          <>
                            <div style={{ fontWeight: 600 }}>{shares.toFixed(4)}</div>
                            <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>
                              ${allocation.toFixed(2)}
                            </div>
                          </>
                        );
                      })()}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => handleRemoveFromPicks(stock.symbol)}
                        disabled={savingPick === stock.symbol}
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: savingPick === stock.symbol ? "wait" : "pointer",
                          padding: "4px",
                          opacity: savingPick === stock.symbol ? 0.5 : 1,
                        }}
                        title="Remove from My Basket"
                      >
                        <Trash2 size={18} color="#ef4444" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
                    {category ? `${category}` : "Securities"}
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
        {/* Bottom Action Bar */}
      <div className="stockpicker-bottom-actions">
        {/* ✅ Place Order — enriches basket and navigates to Order.jsx */}
        <button
          type="button"
          className="btn-primary"
          onClick={handleProceedToOrder}
          disabled={!basket || basket.length === 0 || isCashOutsideLimits}
          style={{
            opacity: (!basket || basket.length === 0 || isCashOutsideLimits) ? 0.5 : 1,
            cursor: (!basket || basket.length === 0 || isCashOutsideLimits) ? "not-allowed" : "pointer",
          }}
        >
           <ClipboardCheck size={16} style={{ verticalAlign: "middle", marginRight: 4 }} />{" "} Submit Buy Order with {brokerName} {basket?.length > 0 && `(${basket.length})`}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate("/wallet")}
        >
          <WalletIcon size={16} style={{ verticalAlign: "middle", marginRight: 4 }} />{" "}Go back to Wallet
        </button>
      </div>

      {/* Sweep Schedule Notice */}
      {(sweepDay === "T+1" || formatSweepDay(sweepDay)) && (
        <div style={{
          background: "#fef3c7",
          border: "1px solid #f59e0b",
          borderRadius: "8px",
          padding: "0.75rem 1rem",
          marginTop: "3rem",
          marginBottom: "1rem",
          textAlign: "center",
          fontSize: "0.875rem",
          color: "#92400e"
        }}>
          {sweepDay === "T+1" ? (
            <><strong>{merchantName}</strong> processes points conversion and trade orders same day with settlement next business day through <strong>{brokerName}</strong>.</>
          ) : (
            <><strong>{merchantName}</strong> processes points conversion and trade orders on <strong>{formatSweepDay(sweepDay)}</strong> of each month through <strong>{brokerName}</strong>.</>
          )}
        </div>
      )}

      {/* ==== Dynamic Disclosure (Correct Broker Displayed) ==== */}
      <p className="form-disclosure">
        <strong>My Basket:</strong> Securities saved under <em>My Basket</em> are used in the automated <b><em>Sweep</em></b> process according to the schedule 
        established between {merchantName} and {brokerName}. You can add securities to <em>My Basket</em> by selecting 
        them from any category and clicking the checkbox, or by sumbol using search bar <Search size={18} color="#9ca3af" />.
        To remove a selection, click the trash can <Trash2 size={18} color="#9ca3af" /> icon.
      </p>
    </div>
  );
}
