// src/components/OrderTicker.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

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
    if (!items.length) {
      return [
        <span key="empty" className="inline-block mr-6">
          No recent orders.
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

      return (
        <span
          key={`${member}-${totalPts}-${idx}`}
          className="inline-block mr-6"
          style={{
            pointerEvents: "auto", // ⭐ allow clicks inside this span
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
              pointerEvents: "auto", // ⭐ make sure link itself is clickable
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
  }, [items]);

  return (
    <div
      className="order-ticker"
      style={{
        pointerEvents: "auto", // ⭐ allow interaction on the ticker generally
      }}
    >
      <div className="rounded-t-2xl bg-black/80 text-white text-sm leading-8 overflow-hidden backdrop-blur px-3">
        <div
          className="ticker-track whitespace-nowrap flex"
          style={{
            pointerEvents: "auto", // ⭐ make sure the track isn't blocking clicks
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
