// src/pages/AdminLanding.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api";
import OrderPipeline from "../components/OrderPipeline";
import {
  CreditCard,
  FileText,
  Store,
  Building2,
  Wallet,
  BookOpen,
  ShoppingCart,
  Webhook,
  Bell,
  BellRing,
  HelpCircle,
  CheckCircle,
  Rocket,
  Plane,
  LogOut,
  Lock,
  Share2,
  ChartColumn,
  Paintbrush,
  Briefcase,
  ShoppingBasket,
  ClipboardCheck,
  CircleDollarSign,
} from "lucide-react";

export default function AdminLanding() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [queueCounts, setQueueCounts] = useState(null);

  const ADMIN_PASSWORD = "StockLoyal2024!";

  const fetchQueueCounts = async () => {
    try {
      const data = await apiPost("admin-queue-counts.php");
      if (data?.success) setQueueCounts(data.counts);
    } catch (err) {
      console.warn("[AdminLanding] Failed to fetch queue counts:", err);
    }
  };

  useEffect(() => {
    const auth = localStorage.getItem("adminAuthenticated") === "true";
    setIsAuthenticated(auth);
    if (!auth) {
      setShowAuthPrompt(true);
    } else {
      fetchQueueCounts();
    }
  }, []);

  const handleAuth = () => {
    if (password === ADMIN_PASSWORD) {
      localStorage.setItem("adminAuthenticated", "true");
      setIsAuthenticated(true);
      setShowAuthPrompt(false);
      setPassword("");
      setError("");
      fetchQueueCounts();
    } else {
      setError("Incorrect password. Please try again.");
      setPassword("");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("adminAuthenticated");
    setIsAuthenticated(false);
    navigate("/");
  };

  // Admin menu tiles with icons and colors
  const adminTiles = [
    {
      to: "/admin",
      label: "Merchant Admin",
      icon: <Store size={32} />,
      color: "#10b981",
      bgColor: "#ecfdf5",
    },
    {
      to: "/admin-broker",
      label: "Broker Admin",
      icon: <Building2 size={32} />,
      color: "#f59e0b",
      bgColor: "#fffbeb",
    },
    {
      to: "/wallet-admin",
      label: "Member Wallet Admin",
      icon: <Wallet size={32} />,
      color: "#06b6d4",
      bgColor: "#ecfeff",
    },
    {
      to: "/prepare-orders",
      label: "Prepare Batch Orders",
      icon: <ClipboardCheck size={32} />,
      color: "#6366f1",
      bgColor: "#eef2ff",
    },
    {
      to: "/sweep-admin",
      label: "Sweep Process Order Entry",
      icon: <Paintbrush size={32} />,
      color: "#6366f1",
      bgColor: "#eef2ff",
    },
    {
      to: "/admin-broker-exec",
      label: "Broker Execution Simulator",
      icon: <Briefcase size={32} />,
      color: "#6366f1",
      bgColor: "#eef2ff",
    },
    {
      to: "/payments-processing",
      label: "Payments Processing",
      icon: <CreditCard size={32} />,
      color: "#3b82f6",
      bgColor: "#eff6ff",
    },
    {
      to: "/fee-admin",
      label: "Fee Structure",
      icon: <CircleDollarSign size={32} />,
      color: "#3b82f6",
      bgColor: "#eff6ff",
    },
    {
      to: "/csv-files",
      label: "CSV Files Browser",
      icon: <FileText size={32} />,
      color: "#8b5cf6",
      bgColor: "#f5f3ff",
    },
    {
      to: "/ledger-admin",
      label: "Ledger Admin",
      icon: <BookOpen size={32} />,
      color: "#ec4899",
      bgColor: "#fdf2f8",
    },
    {
      to: "/orders-admin",
      label: "Baskets and Orders Admin",
      icon: <ShoppingBasket size={32} />,
      color: "#6366f1",
      bgColor: "#eef2ff",
    },
    {
      to: "/webhook-admin",
      label: "StockLoyal Webhook API Admin",
      icon: <Webhook size={32} />,
      color: "#14b8a6",
      bgColor: "#f0fdfa",
    },
    {
      to: "/merchant-notifications",
      label: "Merchant Webhook Notifications",
      icon: <Bell size={32} />,
      color: "#f97316",
      bgColor: "#fff7ed",
    },
    {
      to: "/broker-notifications",
      label: "Broker Webhook Notifications",
      icon: <BellRing size={32} />,
      color: "#ef4444",
      bgColor: "#fef2f2",
    },
    {
      to: "/social-posts-admin",
      label: "Monitor Social Posts",
      icon: <Share2 size={32} />,
      color: "#84cc16",
      bgColor: "#f7fee7",
    },
    {
      to: "/admin-faq",
      label: "FAQ Admin",
      icon: <HelpCircle size={32} />,
      color: "#84cc16",
      bgColor: "#f7fee7",
    },
    {
      to: "/dashboard",
      label: "Daily App Performance Charts",
      icon: <ChartColumn size={32} />,
      color: "#22c55e",
      bgColor: "#f0fdf4",
    },
    {
      to: "/data-quality",
      label: "Data Quality Check",
      icon: <CheckCircle size={32} />,
      color: "#22c55e",
      bgColor: "#f0fdf4",
    },
    {
      to: "/demo-launch",
      label: "Merchant Demo Launch",
      icon: <Rocket size={32} />,
      color: "#a855f7",
      bgColor: "#faf5ff",
    },
    {
      to: "/broker-sell-order",
      label: "Broker Sell Order Simulator",
      icon: <LogOut size={32} />,
      color: "#6366f1",
      bgColor: "#eef2ff",
    },
  ];

  // Auth prompt modal
  if (showAuthPrompt && !isAuthenticated) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f3f4f6",
          padding: "20px",
        }}
      >
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "12px",
            padding: "32px",
            maxWidth: "400px",
            width: "100%",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              backgroundColor: "#eff6ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <Lock size={32} color="#3b82f6" />
          </div>

          <h2 style={{ margin: "0 0 8px 0", fontSize: "24px", fontWeight: "700" }}>
            Admin Access
          </h2>

          <p style={{ margin: "0 0 24px 0", color: "#6b7280", fontSize: "14px" }}>
            Enter the admin password to continue
          </p>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter") handleAuth();
            }}
            placeholder="Enter password"
            style={{
              width: "100%",
              padding: "12px 16px",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              fontSize: "16px",
              marginBottom: "16px",
              boxSizing: "border-box",
            }}
            autoFocus
          />

          {error && (
            <p style={{ color: "#ef4444", fontSize: "14px", margin: "0 0 16px 0" }}>
              {error}
            </p>
          )}

          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => navigate("/")}
              style={{
                flex: 1,
                padding: "12px",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                backgroundColor: "white",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "500",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleAuth}
              style={{
                flex: 1,
                padding: "12px",
                border: "none",
                borderRadius: "8px",
                backgroundColor: "#3b82f6",
                color: "white",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: "500",
              }}
            >
              Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f3f4f6",
        paddingBottom: "100px",
      }}
    >
      {/* Header */}
      <div
        style={{
          backgroundColor: "#1f2937",
          color: "white",
          padding: "24px 20px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            maxWidth: "800px",
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h1 style={{ margin: "0 0 4px 0", fontSize: "24px", fontWeight: "700" }}>
              Admin Dashboard
            </h1>
            <p style={{ margin: 0, opacity: 0.8, fontSize: "14px" }}>
              StockLoyal Administration
            </p>
          </div>
          <button
            onClick={handleLogout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 16px",
              backgroundColor: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "8px",
              color: "white",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "500",
            }}
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div
        style={{
          maxWidth: "800px",
          margin: "0 auto",
          padding: "0 16px",
        }}
      >
        {/* Order Processing Pipeline - Subway Timeline */}
        <OrderPipeline currentStep={0} counts={queueCounts} />

        {/* Tiles Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: "16px",
          }}
        >
          {adminTiles.map(({ to, label, icon, color, bgColor }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px 16px",
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                minHeight: "140px",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.boxShadow = "0 8px 25px rgba(0,0,0,0.1)";
                e.currentTarget.style.borderColor = color;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
                e.currentTarget.style.borderColor = "#e5e7eb";
              }}
            >
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "12px",
                  backgroundColor: bgColor,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "12px",
                  color: color,
                }}
              >
                {icon}
              </div>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: "600",
                  color: "#374151",
                  textAlign: "center",
                  lineHeight: 1.3,
                }}
              >
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
