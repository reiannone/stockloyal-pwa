// App.jsx
import React from "react";
import { Routes, Route } from "react-router-dom";

import ErrorBoundary from "./ErrorBoundary.jsx";
import FrameOnly from "./components/FrameOnly.jsx";   // <-- iPhone frame only
import Layout from "./components/Layout.jsx";

import SplashScreen from "./pages/SplashScreen.jsx";
import Promotions from "./pages/Promotions.jsx";
import Login from "./pages/Login.jsx";
import Terms from "./pages/Terms.jsx";
import Goodbye from "./pages/Goodbye.jsx";

import Onboard from "./pages/Onboard.jsx";
import About from "./pages/About.jsx";
import Wallet from "./pages/Wallet.jsx";
import Convert from "./pages/Convert.jsx";
import Order from "./pages/Order.jsx";
import SelectBroker from "./pages/SelectBroker.jsx";
import Election from "./pages/Election.jsx";
import PointsSelect from "./pages/PointsSelect.jsx";
import StockCategories from "./pages/StockCategories.jsx";
import StockList from "./pages/StockList.jsx";
import Basket from "./pages/Basket.jsx";   // ✅ new import
import TestButtons from "./pages/TestButtons.jsx";   // ✅ new import

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Pages that should be in the iPhone frame but WITHOUT header/footer */}
        <Route element={<FrameOnly />}>
          <Route path="/" element={<SplashScreen />} />
          <Route path="/promotions" element={<Promotions />} />
          <Route path="/login" element={<Login />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/goodbye" element={<Goodbye />} />
          <Route path="/test-buttons" element={<TestButtons />} />
        </Route>

        {/* Pages WITH header/footer */}
        <Route element={<Layout />}>
          <Route path="/about" element={<About />} />
          <Route path="/onboard" element={<Onboard />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/convert" element={<Convert />} />
          <Route path="/order" element={<Order />} />
          <Route path="/select-broker" element={<SelectBroker />} />
          <Route path="/election" element={<Election />} />
          <Route path="/points-select" element={<PointsSelect />} />
          <Route path="/stock-categories" element={<StockCategories />} />
          <Route path="/stock-list" element={<StockList />} />
          <Route path="/basket" element={<Basket />} />   {/* ✅ new route */}
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
