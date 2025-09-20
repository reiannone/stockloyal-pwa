// src/components/Header.jsx
import React, { useEffect, useState } from "react";
import { Battery, Wifi, Signal } from "lucide-react";

export default function Header({ title }) {
  const [time, setTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      setTime(`${hours}:${minutes} ${ampm}`);
    };

    updateTime();
    const id = setInterval(updateTime, 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="app-header">
      <div className="status-bar">
        <span className="select-none">{time || "9:41 AM"}</span>

        <div className="status-icons">
          <Signal aria-hidden />
          <Wifi aria-hidden />
          <Battery aria-hidden />
        </div>
      </div>

      {title && (
        <div className="app-title">
          <h1>{title}</h1>
        </div>
      )}
    </header>
  );
}
