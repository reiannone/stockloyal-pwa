// OrderTicker.jsx - UPDATED
import React, { useEffect, useMemo, useRef, useState } from "react";

const POLL_MS = 15000; // refresh every 15s

export default function OrderTicker() {
  const [items, setItems] = useState([]);
  const timerRef = useRef(null);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/get-order-ticker.php");
      const data = await res.json();
      if (data?.success && Array.isArray(data.items)) setItems(data.items);
    } catch (e) {
      // no-op; keep UI calm
    }
  };

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, []);

  const line = useMemo(() => {
    if (!items.length) return "No recent orders.";
    return items
      .map((it) => {
        const member = it.member_id ?? "—";
        const pts = Number(it.pts ?? 0).toLocaleString();
        const shrs = Number(it.shares ?? 0).toFixed(3);
        const sym = (it.symbol || "").toUpperCase();
        return `${member} • ${pts} pts ➜ ${shrs} shrs ${sym}`;
      })
      .join("   |   ");
  }, [items]);

  return (
    <div className="order-ticker">
      <div className="rounded-t-2xl bg-black/80 text-white text-sm leading-8 overflow-hidden backdrop-blur px-3">
        <div className="ticker-track">
          <span className="ticker-copy">{line}</span>
          <span aria-hidden="true" className="ticker-copy">{line}</span>
        </div>
      </div>
    </div>
  );
}