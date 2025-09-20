// src/pages/SplashScreen.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function SplashScreen() {
  const navigate = useNavigate();
  const [fadeClass, setFadeClass] = useState("opacity-0");

  useEffect(() => {
    // fade in
    const t1 = setTimeout(() => setFadeClass("opacity-100"), 50);
    // fade out
    const t2 = setTimeout(() => setFadeClass("opacity-0"), 2200);
    // navigate after fade out
    const t3 = setTimeout(() => navigate("/promotions"), 3000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [navigate]);

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-white transition-opacity duration-1000 ease-in-out ${fadeClass}`}
    >
      <img
        src={`${import.meta.env.BASE_URL}logos/stockloyal.png`}
        alt="StockLoyal Logo"
        className="w-40 h-40 object-contain"
      />
    </div>
  );
}

export default SplashScreen;
