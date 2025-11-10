// src/components/OrderTicker.jsx
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
    } catch {
      // keep UI calm
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
      .map((order) => {
        const member = order.member_id ?? "—";
        const pts = Number(order.pts ?? 0).toLocaleString();

        const details = (order.lines || [])
          .map((ln) => {
            const sym = String(ln.symbol || "").toUpperCase();
            const shrs = Number(ln.shares ?? 0).toFixed(3);
            const amt = Number(ln.amount ?? 0).toFixed(2);
            return `${sym} ${shrs} shrs $${amt}`;
          })
          .join(", ");

        return details
          ? `${member} • ${pts} pts ➜ ${details}`
          : `${member} • ${pts} pts`;
      })
      .join("   |   ");
  }, [items]);

  return (
    <div className="order-ticker">
      <div className="rounded-t-2xl bg-black/80 text-white text-sm leading-8 overflow-hidden backdrop-blur px-3">
        <div className="ticker-track whitespace-nowrap">
          <span className="ticker-copy">{line}</span>
          <span aria-hidden="true" className="ticker-copy">
            {line}
          </span>
        </div>
      </div>
    </div>
  );
}
