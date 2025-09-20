// App.jsx
import React from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";

import ErrorBoundary from "./ErrorBoundary.jsx";
import FrameOnly from "./components/FrameOnly.jsx";
import Layout from "./components/Layout.jsx";

import SplashScreen from "./pages/SplashScreen.jsx";
import Promotions from "./pages/Promotions.jsx";
import Login from "./pages/Login.jsx";
import MemberOnboard from "./pages/MemberOnboard.jsx";
import Terms from "./pages/Terms.jsx";
import Goodbye from "./pages/Goodbye.jsx";
import Onboard from "./pages/Onboard.jsx";
import About from "./pages/About.jsx";
import Wallet from "./pages/Wallet.jsx";
import Convert from "./pages/Convert.jsx";
import Order from "./pages/Order.jsx";
import OrderConfirmation from "./pages/OrderConfirmation.jsx";
import SelectBroker from "./pages/SelectBroker.jsx";
import Election from "./pages/Election.jsx";
import PointsSelect from "./pages/PointsSelect.jsx";
import StockCategories from "./pages/StockCategories.jsx";
import StockPicker from "./pages/StockPicker.jsx";
import StockList from "./pages/StockList.jsx";
import Basket from "./pages/Basket.jsx";
import TestButtons from "./pages/TestButtons.jsx";

import PageWrapper from "./components/PageWrapper.jsx"; // ✅ new wrapper

function App() {
  const location = useLocation();

  return (
    <ErrorBoundary>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          {/* Pages WITHOUT header/footer */}
          <Route element={<FrameOnly />}>
            <Route path="/" element={<SplashScreen />} />
            <Route path="/promotions" element={<PageWrapper><Promotions /></PageWrapper>} />
            <Route path="/login" element={<PageWrapper><Login /></PageWrapper>} />
            <Route path="/terms" element={<PageWrapper><Terms /></PageWrapper>} />
            <Route path="/goodbye" element={<PageWrapper><Goodbye /></PageWrapper>} />
            <Route path="/test-buttons" element={<PageWrapper><TestButtons /></PageWrapper>} />
          </Route>

          {/* Pages WITH header/footer */}
          <Route element={<Layout />}>
            <Route path="/about" element={<PageWrapper><About /></PageWrapper>} />
            <Route path="/member-onboard" element={<PageWrapper><MemberOnboard /></PageWrapper>} />
            <Route path="/wallet" element={<PageWrapper><Wallet /></PageWrapper>} />
            <Route path="/convert" element={<PageWrapper><Convert /></PageWrapper>} />
            <Route path="/order" element={<PageWrapper><Order /></PageWrapper>} />
            <Route path="/order-confirmation" element={<PageWrapper><OrderConfirmation /></PageWrapper>} />
            <Route path="/select-broker" element={<PageWrapper><SelectBroker /></PageWrapper>} />
            <Route path="/election" element={<PageWrapper><Election /></PageWrapper>} />
            <Route path="/points-select" element={<PageWrapper><PointsSelect /></PageWrapper>} />
            <Route path="/stock-picker" element={<PageWrapper><StockPicker /></PageWrapper>} />
            <Route path="/stock-categories" element={<PageWrapper><StockCategories /></PageWrapper>} />
            <Route path="/stock-list" element={<PageWrapper><StockList /></PageWrapper>} />
            <Route path="/basket" element={<PageWrapper><Basket /></PageWrapper>} />
          </Route>
        </Routes>
      </AnimatePresence>
    </ErrorBoundary>
  );
}

export default App;
