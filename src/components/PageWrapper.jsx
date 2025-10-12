// src/components/PageWrapper.jsx
import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

export default function PageWrapper({ children }) {
  const navigate = useNavigate();
  const [direction, setDirection] = useState("forward");

  const variants = {
    initial: (dir) => ({
      x: dir === "backward" ? "-100%" : "100%",
      opacity: 0,
    }),
    enter: {
      x: 0,
      opacity: 1,
      transition: { duration: 0.35, ease: "easeOut" },
    },
    exit: (dir) => ({
      x: dir === "backward" ? "100%" : "-100%",
      opacity: 0,
      transition: { duration: 0.35, ease: "easeIn" },
    }),
  };

  const handleBack = () => {
    setDirection("backward");
    setTimeout(() => {
      navigate(-1);
    }, 350); // match animation duration
  };

  return (
    <div
      className="app-container" // ✅ constrain width globally
      style={{ flex: 1, position: "relative" }}
    >
      <motion.div
        custom={direction}
        variants={variants}
        initial="initial"
        animate="enter"
        exit="exit"
        className="app-content" // ✅ add padding + max-width
        style={{
          flex: 1,
          minHeight: "100vh",
          position: "relative",
        }}
      >
        {/* Go Back clickable icon */}
        <img
          src={`${import.meta.env.BASE_URL}icons/back-arrow.png`}
          alt="Go Back"
          onClick={handleBack}
          style={{
            position: "absolute",
            top: "1rem",
            left: "-.5rem",
            zIndex: 50,
            width: "28px",
            height: "28px",
            cursor: "pointer",
          }}
        />

        {children}
      </motion.div>
    </div>
  );
}
