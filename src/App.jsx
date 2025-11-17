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
import StockPicker from "./pages/StockPicker.jsx";
import Basket from "./pages/Basket.jsx";
import Portfolio from "./pages/Portfolio.jsx";
import Transactions from "./pages/Transactions.jsx";
import Admin from "./pages/Admin.jsx";
import WalletAdmin from "./pages/WalletAdmin.jsx";
import LedgerAdmin from "./pages/LedgerAdmin.jsx";
import AdminFAQ from "./pages/AdminFAQ.jsx";
import DemoLaunch from "./pages/DemoLaunch.jsx";
import SkyBlueRewards from "./pages/SkyBlueRewards.jsx";
import PageWrapper from "./components/PageWrapper.jsx"; // ✅ page transition wrapper

function App() {
  const location = useLocation();

  return (
    <ErrorBoundary>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          {/* Pages WITHOUT header/footer (always full screen) */}
          <Route element={<FrameOnly />}>
            <Route path="/" element={<SplashScreen />} />
            <Route
              path="/promotions"
              element={<PageWrapper><Promotions /></PageWrapper>}
            />
            <Route
              path="/login"
              element={<PageWrapper><Login /></PageWrapper>}
            />
            <Route
              path="/terms"
              element={<PageWrapper><Terms /></PageWrapper>}
            />
            <Route
              path="/goodbye"
              element={<PageWrapper><Goodbye /></PageWrapper>}
            />
            <Route
              path="/skyblue-rewards"
              element={<PageWrapper><SkyBlueRewards /></PageWrapper>}
            />
          </Route>

          {/* Pages WITH layout (Header hidden in prod, Footer always visible) */}
          <Route element={<Layout />}>
            <Route
              path="/about"
              element={<PageWrapper><About /></PageWrapper>}
            />
            <Route
              path="/member-onboard"
              element={<PageWrapper><MemberOnboard /></PageWrapper>}
            />
            <Route
              path="/wallet"
              element={<PageWrapper><Wallet /></PageWrapper>}
            />
            <Route
              path="/convert"
              element={<PageWrapper><Convert /></PageWrapper>}
            />
            <Route
              path="/order"
              element={<PageWrapper><Order /></PageWrapper>}
            />
            <Route
              path="/order-confirmation"
              element={<PageWrapper><OrderConfirmation /></PageWrapper>}
            />
            <Route
              path="/select-broker"
              element={<PageWrapper><SelectBroker /></PageWrapper>}
            />
            <Route
              path="/election"
              element={<PageWrapper><Election /></PageWrapper>}
            />
            <Route
              path="/points-select"
              element={<PageWrapper><PointsSelect /></PageWrapper>}
            />
            <Route
              path="/stock-picker"
              element={<PageWrapper><StockPicker /></PageWrapper>}
            />
            <Route
              path="/basket"
              element={<PageWrapper><Basket /></PageWrapper>}
            />
            <Route
              path="/portfolio"
              element={<PageWrapper><Portfolio /></PageWrapper>}
            />
            <Route
              path="/transactions"
              element={<PageWrapper><Transactions /></PageWrapper>}
            />
            <Route
              path="/admin"
              element={<PageWrapper><Admin /></PageWrapper>}
            />
            <Route
              path="/wallet-admin"
              element={<PageWrapper><WalletAdmin /></PageWrapper>}
            />
            <Route
              path="/ledger-admin"
              element={<PageWrapper><LedgerAdmin /></PageWrapper>}
            />
            <Route
              path="/admin-faq"
              element={<PageWrapper><AdminFAQ /></PageWrapper>}
            />
            <Route
              path="/demo-launch"
              element={<PageWrapper><DemoLaunch /></PageWrapper>}
            />
          </Route>
        </Routes>
      </AnimatePresence>
    </ErrorBoundary>
  );
}

export default App;
