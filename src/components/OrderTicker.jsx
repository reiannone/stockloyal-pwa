// src/components/OrderTicker.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

const POLL_MS = 15000; // refresh every 15s
const MAX_ITEMS = 20; // Limit to 20 most recent orders for performance

export default function OrderTicker() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(false);
  const timerRef = useRef(null);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/get-order-ticker.php");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data?.success && Array.isArray(data.items)) {
        // Limit to most recent MAX_ITEMS for performance
        const limitedItems = data.items.slice(0, MAX_ITEMS);
        setItems(limitedItems);
        setError(false);
      } else {
        setItems([]);
      }
    } catch (err) {
      console.warn('[OrderTicker] Fetch failed:', err);
      setError(true);
      // Keep showing last successful data instead of clearing
    }
  };

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const line = useMemo(() => {
    if (!items.length) {
      return [
        <span key="empty" className="inline-block mr-6">
          {error ? 'Loading orders...' : 'No recent orders.'}
        </span>,
      ];
    }

    return items.map((order, idx) => {
      const member = order.member_id ?? "—";

      const totalPts = Number(
        order.points_used ?? order.pts ?? 0
      ).toLocaleString("en-US");

      const sharesStr = (order.lines || [])
        .map((ln) => {
          const sym = String(ln.symbol || "").toUpperCase();
          let shrs = Number(ln.shares ?? 0).toFixed(4);
          shrs = shrs.replace(/0+$/, "").replace(/\.$/, "");
          return `${sym} ${shrs} shrs`;
        })
        .join(", ");

      // Use a stable unique key
      const uniqueKey = `${order.order_id || idx}-${member}-${totalPts}`;

      return (
        <span
          key={uniqueKey}
          className="inline-block mr-6"
          style={{
            pointerEvents: "auto",
          }}
        >
          {/* leading | separator */}
          <span style={{ color: "#AAAAAA", marginRight: 6 }}>|</span>

          {/* CLICKABLE MEMBER */}
          <Link
            to={`/social?member_id=${member}`}
            className="font-semibold"
            style={{
              color: "#FFD700", // bright gold
              textDecoration: "underline",
              cursor: "pointer",
              pointerEvents: "auto",
              position: "relative",
              zIndex: 2,
            }}
            onMouseEnter={(e) => (e.target.style.color = "#FFF8D0")}
            onMouseLeave={(e) => (e.target.style.color = "#FFD700")}
          >
            {member}
          </Link>

          {" • "}
          {totalPts}pts
          {sharesStr ? ` → ${sharesStr}` : ""}
        </span>
      );
    });
  }, [items, error]);

  return (
    <div className="order-ticker" style={{ pointerEvents: "auto" }}>
      <div className="rounded-t-2xl bg-black/80 text-white text-sm leading-8 overflow-hidden backdrop-blur px-3">
        <div 
          className="ticker-track whitespace-nowrap flex" 
          style={{ 
            pointerEvents: "auto",
            willChange: "transform" // Optimize animation performance
          }}
        >
          {/* We render line twice for the infinite scroll effect */}
          {line}
          {line}
        </div>
      </div>
    </div>
  );
}
