import React from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";

import ErrorBoundary from "./ErrorBoundary.jsx";
import { HashRouter as Router, Routes, Route } from "react-router-dom";

import SplashScreen from "./pages/SplashScreen.jsx";
import Onboard from "./pages/Onboard.jsx";
import Promotions from "./pages/Promotions.jsx";
import Wallet from "./pages/Wallet.jsx";
import Convert from "./pages/Convert.jsx";
import Order from "./pages/Order.jsx";
import Goodbye from "./pages/Goodbye.jsx";
import SelectBroker from "./pages/SelectBroker.jsx";
import Terms from "./pages/Terms.jsx";

function App() {
  return (
    <ErrorBoundary>
      <Router>
      <Routes>
        <Route path="/" element={<SplashScreen />} />
        <Route path="/onboard" element={<Onboard />} />
        <Route path="/promotions" element={<Promotions />} />
        <Route path="/wallet" element={<Wallet />} />
        <Route path="/convert" element={<Convert />} />
        <Route path="/order" element={<Order />} />
        <Route path="/goodbye" element={<Goodbye />} />
        <Route path="/select-broker" element={<SelectBroker />} />
        <Route path="/terms" element={<Terms />} />
      </Routes>
    </Router>
    </ErrorBoundary>
  );
}

export default App;

