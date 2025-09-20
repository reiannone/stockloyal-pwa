// main.jsx

import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";

import "./index.css";   // ✅ Tailwind must load before components

import { BasketProvider } from "./context/BasketContext";   // ✅ new
import { BrokerProvider } from "./context/BrokerContext";   // ✅ new

ReactDOM.createRoot(document.getElementById("root")).render(
  <BasketProvider>
    <BrokerProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </BrokerProvider>
  </BasketProvider>
);
