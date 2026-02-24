// App.jsx
import React, { useState, useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import VoiceAssistant from "./components/VoiceAssistant";
import ErrorBoundary from "./ErrorBoundary.jsx";
import FrameOnly from "./components/FrameOnly.jsx";
import Layout from "./components/Layout.jsx";
import AdminLanding from "./pages/AdminLanding";
import StockLoyalLanding from "./pages/StockLoyalLanding";
import SplashScreen from "./pages/SplashScreen.jsx";
import Promotions from "./pages/Promotions.jsx";
import Login from "./pages/Login.jsx";
import MemberOnboard from "./pages/MemberOnboard.jsx";
import Onboard from "./pages/Onboard.jsx";
import Terms from "./pages/Terms.jsx";
import Goodbye from "./pages/Goodbye.jsx";
import About from "./pages/About.jsx";
import Wallet from "./pages/Wallet.jsx";
import Convert from "./pages/Convert.jsx";
import Order from "./pages/Order.jsx";
import OrderConfirmation from "./pages/OrderConfirmation.jsx";
import SelectBroker from "./pages/SelectBroker.jsx";
import Election from "./pages/Election.jsx";
import PointsSelect from "./pages/PointsSelect.jsx";
import StockPicker from "./pages/StockPicker.jsx";
import PointsSlider from "./pages/PointsSlider.jsx";
import FillBasket from "./pages/FillBasket.jsx";
import Basket from "./pages/Basket.jsx";
import Portfolio from "./pages/Portfolio.jsx";
import Transactions from "./pages/Transactions.jsx";
import Ledger from "./pages/Ledger.jsx";
import Admin from "./pages/Admin.jsx";
import AdminBroker from "./pages/AdminBroker.jsx";
import PaymentsProcessing from "./pages/PaymentsProcessing.jsx";
import FeeAdmin from "./pages/FeeAdmin.jsx";
import PaymentsBroker from "./pages/PaymentsBroker.jsx";
import PaymentsBasketDetail from "./pages/PaymentsBasketDetail.jsx";
import WalletAdmin from "./pages/WalletAdmin.jsx";
import LedgerAdmin from "./pages/LedgerAdmin.jsx";
import OrdersAdmin from "./pages/OrdersAdmin.jsx";
import PrepareOrders from "./pages/PrepareOrders.jsx";
import JournalAdmin from "./pages/JournalAdmin.jsx";
import SweepAdmin from "./pages/SweepAdmin.jsx";
import BrokerSellOrder from "./pages/BrokerSellOrder.jsx";
import BrokerExecAdmin from "./pages/BrokerExecAdmin.jsx";
import SocialPostsAdmin from "./pages/SocialPostsAdmin.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import WebhookAdmin from "./pages/WebhookAdmin.jsx";
import MerchantNotifications from "./pages/MerchantNotifications.jsx";
import BrokerNotifications from "./pages/BrokerNotifications.jsx";
import AdminFAQ from "./pages/AdminFAQ.jsx";
import DataQualityCheck from "./pages/DataQualityCheck.jsx";
import DemoLaunch from "./pages/DemoLaunch.jsx";
import SocialFeed from "./pages/SocialFeed.jsx";
import PostDetail from "./pages/PostDetail.jsx";
import SkyBlueRewards from "./pages/SkyBlueRewards.jsx";
import SymbolChart from "./pages/SymbolChart.jsx";
import CSVFilesBrowser from "./pages/CSVFilesBrowser.jsx";
import PageWrapper from "./components/PageWrapper.jsx";

// Global share sheet
import SharePointsSheet from "./components/SharePointsSheet.jsx";

function App() {
  const location = useLocation();

  // Global share sheet state
  const [shareOpen, setShareOpen] = useState(false);
  const [shareProps, setShareProps] = useState({
    memberId: "",
    pointsUsed: 0,
    cashValue: 0,
    primaryTicker: null,
    tickers: [],
  });

  // Listen globally for "open-share-sheet" from Footer / Wallet / anywhere
  useEffect(() => {
    function handleOpenShareSheet(event) {
      const detail = event.detail || {};

      const memberId =
        detail.memberId ||
        localStorage.getItem("memberId") ||
        "";

      const pointsUsed =
        detail.pointsUsed ??
        parseInt(localStorage.getItem("points") || "0", 10);

      const cashRaw =
        detail.cashValue ??
        detail.cash ??
        localStorage.getItem("cashBalance") ??
        0;

      const cashValue =
        typeof cashRaw === "number"
          ? cashRaw
          : parseFloat(cashRaw);

      setShareProps({
        memberId,
        pointsUsed,
        cashValue,
        primaryTicker: detail.primaryTicker ?? null,
        tickers: detail.tickers || [],
      });

      setShareOpen(true);
    }

    window.addEventListener("open-share-sheet", handleOpenShareSheet);
    return () =>
      window.removeEventListener("open-share-sheet", handleOpenShareSheet);
  }, []);

  return (
    <ErrorBoundary>
      <>
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            {/* Pages WITHOUT header/footer (always full screen) */}
            <Route element={<FrameOnly />}>
              <Route path="/" element={<SplashScreen />} />
              <Route
                path="/promotions"
                element={
                  <PageWrapper>
                    <Promotions />
                  </PageWrapper>
                }
              />
              <Route
                path="/login"
                element={
                  <PageWrapper>
                    <Login />
                  </PageWrapper>
                }
              />
              <Route
                path="/terms"
                element={
                  <PageWrapper>
                    <Terms />
                  </PageWrapper>
                }
              />
              <Route
                path="/goodbye"
                element={
                  <PageWrapper>
                    <Goodbye />
                  </PageWrapper>
                }
              />
              <Route
                path="/demo-launch"
                element={
                  <PageWrapper>
                    <DemoLaunch />
                  </PageWrapper>
                }
              />
            </Route>

            {/* Pages WITH layout (Header + Footer) */}
            <Route element={<Layout />}>
              <Route path="/stockloyal-landing" element={<StockLoyalLanding />} />
              <Route path="/admin-home" element={<AdminLanding />} />
              <Route
                path="/about"
                element={
                  <PageWrapper>
                    <About />
                  </PageWrapper>
                }
              />
              <Route
                path="/member-onboard"
                element={
                  <PageWrapper>
                    <MemberOnboard />
                  </PageWrapper>
                }
              />
              <Route
                path="/onboard"
                element={
                  <PageWrapper>
                    <Onboard />
                  </PageWrapper>
                }
              />
              <Route
                path="/wallet"
                element={
                  <PageWrapper>
                    <Wallet />
                  </PageWrapper>
                }
              />
              <Route
                path="/convert"
                element={
                  <PageWrapper>
                    <Convert />
                  </PageWrapper>
                }
              />
              <Route
                path="/order"
                element={
                  <PageWrapper>
                    <Order />
                  </PageWrapper>
                }
              />
              <Route
                path="/order-confirmation"
                element={
                  <PageWrapper>
                    <OrderConfirmation />
                  </PageWrapper>
                }
              />
              <Route
                path="/select-broker"
                element={
                  <PageWrapper>
                    <SelectBroker />
                  </PageWrapper>
                }
              />
              <Route
                path="/election"
                element={
                  <PageWrapper>
                    <Election />
                  </PageWrapper>
                }
              />
              <Route
                path="/points-select"
                element={
                  <PageWrapper>
                    <PointsSelect />
                  </PageWrapper>
                }
              />
              <Route
                path="/stock-picker"
                element={
                  <PageWrapper>
                    <StockPicker />
                  </PageWrapper>
                }
              />
              <Route
                path="/points-slider"
                element={
                  <PageWrapper>
                    <PointsSlider />
                  </PageWrapper>
                }
              />
              <Route
                path="/fill-basket"
                element={
                  <PageWrapper>
                    <FillBasket />
                  </PageWrapper>
                }
              />
              <Route
                path="/basket"
                element={
                  <PageWrapper>
                    <Basket />
                  </PageWrapper>
                }
              />
              <Route
                path="/portfolio"
                element={
                  <PageWrapper>
                    <Portfolio />
                  </PageWrapper>
                }
              />
              <Route
                path="/transactions"
                element={
                  <PageWrapper>
                    <Transactions />
                  </PageWrapper>
                }
              />
              <Route
                path="/ledger"
                element={
                  <PageWrapper>
                    <Ledger />
                  </PageWrapper>
                }
              />
              <Route
                path="/admin"
                element={
                  <PageWrapper>
                    <Admin />
                  </PageWrapper>
                }
              />
              <Route
                path="/admin-broker"
                element={
                  <PageWrapper>
                    <AdminBroker />
                  </PageWrapper>
                }
              />
              <Route
                path="/payments-processing"
                element={
                  <PageWrapper>
                    <PaymentsProcessing />
                  </PageWrapper>
                }
              />
              <Route
                path="/fee-admin"
                element={
                  <PageWrapper>
                    <FeeAdmin />
                  </PageWrapper>
                }
              />
              <Route
                path="/payments-broker"
                element={
                  <PageWrapper>
                    <PaymentsBroker />
                  </PageWrapper>
                }
              />
              <Route
                path="/payments-basket"
                element={
                  <PageWrapper>
                    <PaymentsBasketDetail />
                  </PageWrapper>
                }
              />
              <Route
                path="/wallet-admin"
                element={
                  <PageWrapper>
                    <WalletAdmin />
                  </PageWrapper>
                }
              />
              <Route
                path="/ledger-admin"
                element={
                  <PageWrapper>
                    <LedgerAdmin />
                  </PageWrapper>
                }
              />
              <Route
                path="/orders-admin"
                element={
                  <PageWrapper>
                    <OrdersAdmin />
                  </PageWrapper>
                }
              />
              <Route
                path="/prepare-orders"
                element={
                  <PageWrapper>
                    <PrepareOrders />
                  </PageWrapper>
                }
              />
              <Route
                path="/jornal-admin"
                element={
                  <PageWrapper>
                    <JournalAdmin />
                  </PageWrapper>
                }
              />
              <Route
                path="/sweep-admin"
                element={
                  <PageWrapper>
                    <SweepAdmin />
                  </PageWrapper>
                }
              />
              <Route
                path="/admin-broker-exec"
                element={
                  <PageWrapper>
                    <BrokerExecAdmin />
                  </PageWrapper>
                }
              />
              <Route
                path="/broker-sell-order"
                element={
                  <PageWrapper>
                    <BrokerSellOrder />
                  </PageWrapper>
                }
              />
              <Route
                path="/social-posts-admin"
                element={
                  <PageWrapper>
                    <SocialPostsAdmin />
                  </PageWrapper>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <PageWrapper>
                    <AdminDashboard />
                  </PageWrapper>
                }
              />
              <Route
                path="/webhook-admin"
                element={
                  <PageWrapper>
                    <WebhookAdmin />
                  </PageWrapper>
                }
              />
              <Route
                path="/merchant-notifications"
                element={
                  <PageWrapper>
                    <MerchantNotifications />
                  </PageWrapper>
                }
              />
              <Route
                path="/broker-notifications"
                element={
                  <PageWrapper>
                    <BrokerNotifications />
                  </PageWrapper>
                }
              />
              <Route
                path="/admin-faq"
                element={
                  <PageWrapper>
                    <AdminFAQ />
                  </PageWrapper>
                }
              />
              <Route
                path="/data-quality"
                element={
                  <PageWrapper>
                    <DataQualityCheck />
                  </PageWrapper>
                }
              />
              <Route
                path="/csv-files"
                element={
                  <PageWrapper>
                    <CSVFilesBrowser />
                  </PageWrapper>
                }
              />
              <Route
                path="/social"
                element={
                  <PageWrapper>
                    <SocialFeed />
                  </PageWrapper>
                }
              />
              <Route
                path="/symbol-chart/:symbol"
                element={
                  <PageWrapper>
                    <SymbolChart />
                  </PageWrapper>
                }
              />
              <Route
                path="/social/post/:postId"
                element={
                  <PageWrapper>
                    <PostDetail />
                  </PageWrapper>
                }
              />
            </Route>
          </Routes>
        </AnimatePresence>

        {/* Global share sheet, available from any route */}
        <SharePointsSheet
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          memberId={shareProps.memberId}
          pointsUsed={shareProps.pointsUsed}
          cashValue={shareProps.cashValue}
          primaryTicker={shareProps.primaryTicker}
          tickers={shareProps.tickers}
        />

        {/* Voice-powered AI assistant overlay */}
        <VoiceAssistant />
      </>
    </ErrorBoundary>
  );
}

export default App;
