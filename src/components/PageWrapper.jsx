// PageWrapper.jsx
import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

const variants = {
  initial: { x: "100%", opacity: 0 },
  enter: { x: 0, opacity: 1, transition: { duration: 0.5, ease: "easeOut" } },
  exit: { x: "-100%", opacity: 0, transition: { duration: 0.5, ease: "easeIn" } },
};

export default function PageWrapper({ children }) {
  const navigate = useNavigate();

  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="enter"
      exit="exit"
      style={{
        width: "100%",
        minHeight: "100vh",
        position: "relative",
      }}
    >
      {/* Go Back clickable icon */}
      <img
        src="/icons/back-arrow.png"   // ✅ directly from public/icons
        alt="Go Back"
        onClick={() => navigate(-1)}
        style={{
          position: "absolute",
          top: "1rem",
          left: "1rem",
          zIndex: 50,
          width: "28px",
          height: "28px",
          cursor: "pointer",
        }}
      />

      {children}
    </motion.div>
  );
}
