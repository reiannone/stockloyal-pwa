// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";

import "./index.css";

import { BasketProvider } from "./context/BasketContext";
import { BrokerProvider } from "./context/BrokerContext";

// src/main.jsx
if (import.meta.env.DEV) {
  console.log("[ENV] mode:", import.meta.env.MODE, {
    DEV: import.meta.env.DEV,
    PROD: import.meta.env.PROD,
    VITE_API_BASE: import.meta.env.VITE_API_BASE,
    all: import.meta.env, // only VITE_* are exposed
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <BasketProvider>
    <BrokerProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </BrokerProvider>
  </BasketProvider>
);
