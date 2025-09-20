// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App.jsx";

import "./index.css";

import { BasketProvider } from "./context/BasketContext";
import { BrokerProvider } from "./context/BrokerContext";

// DEV toggle (only renders in dev)
import DevFrameToggle from "./components/DevFrameToggle";

ReactDOM.createRoot(document.getElementById("root")).render(
  <BasketProvider>
    <BrokerProvider>
      <HashRouter>
        {/* dev toggle rendered at top-level so it's always visible in dev */}
        <DevFrameToggle />
        <App />
      </HashRouter>
    </BrokerProvider>
  </BasketProvider>
);
