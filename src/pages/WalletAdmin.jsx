// src/pages/WalletAdmin.jsx
import React, { useEffect, useState, useRef, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { apiGet, apiPost } from "../api.js";
import AddressLookup from "../components/AddressLookup.jsx";
import {
  CreditCard,
  BarChart2,
  RefreshCw,
  XCircle,
  AlertTriangle,
  ShoppingBasket,
  ClipboardCheck,
  Cog,
  Upload, 
  X, 
  Image,
  CalendarDays,
  Briefcase,
  CircleCheckBig,
  Lock,
  Search,
  Eye,
  EyeOff,
  Unlock,
  ArrowRight,
} from "lucide-react";
import ConfirmModal from "../components/ConfirmModal";

export default function WalletAdmin() {
  const location = useLocation();
  const [wallets, setWallets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showTaxId, setShowTaxId] = useState(false);
  const editPanelRef = useRef(null);

  // Merchants for dropdown
  const [merchants, setMerchants] = useState([]);
  const [merchantsLoading, setMerchantsLoading] = useState(true);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [filterMerchantId, setFilterMerchantId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  
  // ✅ Check if we're coming from Data Quality Check
  // Memoize these to prevent unnecessary re-renders
  const affectedMembers = useMemo(() => location.state?.affectedMembers || [], [location.state?.affectedMembers]);
  const fieldName = useMemo(() => location.state?.fieldName || "", [location.state?.fieldName]);
  const fromDataQuality = useMemo(() => location.state?.fromDataQuality || false, [location.state?.fromDataQuality]);
  const totalAffected = useMemo(() => location.state?.totalAffected || 0, [location.state?.totalAffected]);

  // ---- timezone helpers ----
  const detectedTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    } catch {
      return "America/New_York";
    }
  }, []);

  // Curated IANA timezone options
  const timezones = useMemo(
    () => [
      // Americas
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Phoenix",
      "America/Anchorage",
      "Pacific/Honolulu",
      "America/Detroit",
      "America/Indiana/Indianapolis",
      "America/Kentucky/Louisville",
      "America/Toronto",
      "America/Vancouver",
      "America/Winnipeg",
      "America/Edmonton",
      "America/Mexico_City",
      "America/Cancun",
      // Europe
      "Europe/London",
      "Europe/Dublin",
      "Europe/Paris",
      "Europe/Berlin",
      "Europe/Madrid",
      "Europe/Rome",
      "Europe/Amsterdam",
      "Europe/Brussels",
      // Asia
      "Asia/Tokyo",
      "Asia/Shanghai",
      "Asia/Hong_Kong",
      "Asia/Singapore",
      "Asia/Taipei",
      "Asia/Seoul",
      "Asia/Kolkata",
      "Asia/Dubai",
      // Oceania
      "Australia/Sydney",
      "Australia/Melbourne",
      "Australia/Brisbane",
      "Australia/Perth",
      "Pacific/Auckland",
      // Fallback
      "UTC",
    ],
    []
  );

  // If DB has a timezone not in our curated list (e.g., "US/Eastern"), inject it so <select> can display it
  const tzOptions = useMemo(() => {
    const current = selected?.member_timezone?.trim();
    if (!current) return timezones;
    return timezones.includes(current) ? timezones : [current, ...timezones];
  }, [selected?.member_timezone, timezones]);

  const isNonStandardTz = useMemo(() => {
    const current = selected?.member_timezone?.trim();
    return !!current && !timezones.includes(current);
  }, [selected?.member_timezone, timezones]);

  // ---- helpers ----
  const normalizeRate = (raw) => {
    const rnum = Number(raw);
    if (!Number.isFinite(rnum) || rnum <= 0) return 0;
    // support 0.05 or 5 (5%)
    return rnum >= 1 ? rnum / 100 : rnum;
  };

  const calcCashFromPoints = (points, rateFromMerchant) => {
    const p = Number(points || 0);
    const r = normalizeRate(rateFromMerchant);
    if (!Number.isFinite(p) || !Number.isFinite(r) || r <= 0) return 0;
    const cents = Math.round(p * r * 100);
    return cents / 100;
  };

  // Friendly display + safe fallback for member tier
  // derive current merchant and rate for the selected wallet
  const selectedMerchant = useMemo(() => {
    if (!selected) return null;
    return merchants.find((x) => String(x.merchant_id) === String(selected.merchant_id)) || null;
  }, [merchants, selected]);

  const selectedMerchantRate = selectedMerchant?.conversion_rate ?? 0;
  
  // ✅ Helper function to get tier-specific rate from merchant
  const getTierRate = (merchant, tierName) => {
    if (!merchant || !tierName) return null;
    
    for (let i = 1; i <= 6; i++) {
      const mTierName = merchant[`tier${i}_name`];
      if (mTierName && mTierName.toLowerCase() === tierName.toLowerCase()) {
        return merchant[`tier${i}_conversion_rate`] ?? null;
      }
    }
    return null;
  };
  
  // ✅ Calculate tier-specific rate for selected wallet
  const selectedTierRate = useMemo(() => {
    return getTierRate(selectedMerchant, selected?.member_tier);
  }, [selected, selectedMerchant]);
  
  // ✅ Effective rate: tier-specific if available, otherwise base merchant rate
  const effectiveConversionRate = selectedTierRate ?? selectedMerchantRate;

  // ✅ Get available tier names for the selected merchant
  const availableTiers = useMemo(() => {
    if (!selectedMerchant) return [];
    
    const tiers = [];
    for (let i = 1; i <= 6; i++) {
      const tierName = selectedMerchant[`tier${i}_name`];
      if (tierName && tierName.trim() !== '') {
        tiers.push(tierName.trim());
      }
    }
    return tiers;
  }, [selectedMerchant]);

  // --- load merchants for dropdown ---
  useEffect(() => {
    (async () => {
      setMerchantsLoading(true);
      try {
        const data = await apiGet("get-merchants.php");
        setMerchants(data?.success ? data.merchants || [] : []);
        if (!data?.success) console.warn("[WalletAdmin] merchants error:", data?.error);
      } catch (e) {
        console.error("[WalletAdmin] merchants fetch failed", e);
        setMerchants([]);
      } finally {
        setMerchantsLoading(false);
      }
    })();
  }, []);

  // --- load all wallets ---
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await apiGet("get-multiple-wallets.php");
        if (data?.success) {
          setWallets(data.wallets || []);

          let initialWallet = null;

          // ✅ Priority 1: If coming from Data Quality Check, load first affected member
          if (fromDataQuality && fieldName) {
            if (affectedMembers.length > 0) {
              // Find first affected member in the wallet list
              const firstAffectedId = affectedMembers[0];
              initialWallet = (data.wallets || []).find(
                (w) => String(w.member_id) === String(firstAffectedId)
              );
            } else {
              // No specific member IDs, find first record with missing field
              initialWallet = (data.wallets || []).find((w) => {
                const fieldValue = w[fieldName];
                return fieldValue === null || 
                       fieldValue === undefined || 
                       (typeof fieldValue === 'string' && fieldValue.trim() === '');
              });
            }
          }

          // No auto-select — table shows first, user clicks row to edit

          if (initialWallet) {
            // merchant lookup for rate
            const m = merchants.find(
              (x) => String(x.merchant_id) === String(initialWallet.merchant_id)
            );
            
            // normalize tier fields first
            const member_tier =
              initialWallet.member_tier ??
              initialWallet.tier ??
              initialWallet.tier_name ??
              initialWallet.loyalty_tier ??
              "";
            
            // ✅ Use tier rate if member has a tier
            const tierRate = getTierRate(m, member_tier);
            const rateToUse = tierRate ?? (m?.conversion_rate ?? 0);
            const points = Number(initialWallet.points || 0);
            const cash_balance = calcCashFromPoints(points, rateToUse);

            // ensure timezone present (default to detected only if blank/missing)
            const member_timezone =
              initialWallet.member_timezone && String(initialWallet.member_timezone).trim() !== ""
                ? initialWallet.member_timezone
                : detectedTz;

            setSelected({
              ...initialWallet,
              cash_balance, // live calc from tier-specific or base merchant rate
              merchant_name: initialWallet.merchant_name || m?.merchant_name || "",
              member_timezone,
              member_tier,
            });
          }
        } else {
          console.warn("[WalletAdmin] wallets error:", data?.error);
        }
      } catch (e) {
        console.error("[WalletAdmin] wallets fetch failed", e);
      } finally {
        setLoading(false);
      }
    })();
    // include merchants so merchant_name/rate can hydrate once loaded
    // include fromDataQuality, fieldName, affectedMembers to auto-load when coming from DQ Check
  }, [merchants, detectedTz, fromDataQuality, fieldName, affectedMembers]);

  // --- save wallet (with optional password reset) ---
  const saveWallet = async (e) => {
    e.preventDefault();
    if (!selected) return;

    const updated = { ...selected };

    if (newPassword.trim()) {
      if (newPassword.trim() !== confirmPassword.trim()) {
        showAlert("Validation Error", "Passwords do not match.", <XCircle size={20} color="#ef4444" />, "#ef4444");
        return;
      }
      updated.new_password = newPassword.trim();
    }

    // Recalc using effective merchant rate (tier-specific or base)
    const points = Number(updated.points || 0);
    updated.cash_balance = calcCashFromPoints(points, effectiveConversionRate);

    // Ensure we DO NOT send conversion_rate from the admin page
    delete updated.conversion_rate;

    console.log('═══════════════════════════════════════════════════');
    console.log('[WalletAdmin] SAVING WALLET');
    console.log('Admin logged in as:', localStorage.getItem('memberId'));
    console.log('Updating member:', updated.member_id);
    console.log('Changes being saved:', {
      member_tier: updated.member_tier,
      points: updated.points,
      cash_balance: updated.cash_balance,
      member_email: updated.member_email,
      merchant_id: updated.merchant_id
    });
    console.log('═══════════════════════════════════════════════════');

    try {
      const res = await apiPost("save-wallet.php", updated);
      if (res?.success) {
        setNewPassword("");
        setConfirmPassword("");
        setShowPw(false);
        showAlert("Wallet Saved", "All changes have been saved successfully.", <CircleCheckBig size={20} color="#10b981" />, "#10b981", () => window.location.reload());
      } else {
        showAlert("Save Failed", res?.error || "Unknown error", <XCircle size={20} color="#ef4444" />, "#ef4444");
      }
    } catch (e) {
      console.error("[WalletAdmin] save failed", e);
      showAlert("Save Failed", "Network or server error — please try again.", <XCircle size={20} color="#ef4444" />, "#ef4444");
    }
  };

  // --- Custom confirmation state ---
  const [deleteData, setDeleteData] = useState(null);

  // ── Shared ConfirmModal state ──
  const [modal, setModal] = useState({
    show: false, title: "", message: "", details: null,
    icon: null,
    confirmText: "OK", confirmColor: "#3b82f6",
    cancelText: null, // null = hide cancel button (alert mode)
    data: null,
  });
  const closeModal = () => {
    const d = modal.data;
    setModal(prev => ({ ...prev, show: false }));
    if (d?.type === "alert" && d?.onDismiss) d.onDismiss();
  };
  const showAlert = (title, message, icon, color, onDismiss) => {
    setModal({
      show: true, title, message, details: null,
      icon: icon || <CircleCheckBig size={20} color={color || "#3b82f6"} />,
      confirmText: "OK", confirmColor: color || "#3b82f6",
      cancelText: null, data: { type: "alert", onDismiss: onDismiss || null },
    });
  };

  // ── Broker credential lockout state ──
  const [lockoutInfo, setLockoutInfo] = useState(null);
  const [lockoutLoading, setLockoutLoading] = useState(false);
  const [lockoutResetting, setLockoutResetting] = useState(false);
  const [lockoutMsg, setLockoutMsg] = useState("");

  // ── Alpaca account info (account_id + account_number) ──
  const [alpacaAccountInfo, setAlpacaAccountInfo] = useState(null);
  const [alpacaAccountLoading, setAlpacaAccountLoading] = useState(false);

  // --- delete wallet ---
  const deleteWallet = async (record_id) => {
    if (!selected?.member_id) {
      showAlert("Delete Error", "Cannot determine member ID for deletion.", <XCircle size={20} color="#ef4444" />, "#ef4444");
      return;
    }

    const memberId = selected.member_id;

    try {
      // Check for related data
      const checkRes = await apiPost("check-member-references.php", { 
        member_id: memberId 
      }).catch((err) => {
        console.warn("[WalletAdmin] check-member-references.php not available, proceeding with simple delete:", err);
        return null; // Endpoint doesn't exist yet, proceed with simple delete
      });

      let hasReferences = false;
      let referenceCounts = {};

      // If endpoint doesn't exist or returns error, proceed with simple delete confirmation
      if (!checkRes || !checkRes.success) {
        setDeleteData({
          record_id,
          member_id: memberId,
          has_references: false,
          reference_counts: {}
        });
        setModal({
          show: true, title: "Confirm Delete",
          message: <p>Delete wallet for member <strong>{memberId}</strong>?</p>,
          details: null,
          icon: <AlertTriangle size={20} color="#ef4444" />,
          confirmText: "Delete", confirmColor: "#dc2626",
          cancelText: "Cancel", data: { type: "delete" },
        });
        return;
      }

      hasReferences = checkRes.has_references;
      referenceCounts = checkRes.reference_counts || {};

      // Store data and show confirmation dialog
      setDeleteData({
        record_id,
        member_id: memberId,
        has_references: hasReferences,
        reference_counts: referenceCounts
      });

      const refDetails = hasReferences ? (
        <div>
          <p style={{ marginBottom: 8, fontWeight: 600, color: "#dc2626", display: "flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={16} color="#dc2626" /> This member has related data:
          </p>
          <ul style={{ marginBottom: 8, paddingLeft: 24, fontSize: "0.85rem" }}>
            {referenceCounts.orders > 0 && <li>Orders: <strong>{referenceCounts.orders}</strong></li>}
            {referenceCounts.transactions > 0 && <li>Transactions/Ledger: <strong>{referenceCounts.transactions}</strong></li>}
            {referenceCounts.portfolios > 0 && <li>Portfolio Holdings: <strong>{referenceCounts.portfolios}</strong></li>}
            {referenceCounts.social > 0 && <li>Social Posts: <strong>{referenceCounts.social}</strong></li>}
            {referenceCounts.other > 0 && <li>Other Records: <strong>{referenceCounts.other}</strong></li>}
          </ul>
          <div style={{ padding: 10, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, color: "#991b1b", fontSize: "0.85rem", fontWeight: 600 }}>
            WARNING: This will permanently delete ALL of this member's data.
          </div>
        </div>
      ) : null;

      setModal({
        show: true, title: "Confirm Delete",
        message: <p>Delete wallet for member <strong>{memberId}</strong>?</p>,
        details: refDetails,
        icon: <AlertTriangle size={20} color="#ef4444" />,
        confirmText: "Delete", confirmColor: "#dc2626",
        cancelText: "Cancel", data: { type: "delete" },
      });

    } catch (e) {
      console.error("[WalletAdmin] delete check failed", e);
      // Fallback to simple delete confirmation
      setDeleteData({
        record_id,
        member_id: memberId,
        has_references: false,
        reference_counts: {}
      });
      setModal({
        show: true, title: "Confirm Delete",
        message: <p>Delete wallet for member <strong>{memberId}</strong>?</p>,
        details: null,
        icon: <AlertTriangle size={20} color="#ef4444" />,
        confirmText: "Delete", confirmColor: "#dc2626",
        cancelText: "Cancel", data: { type: "delete" },
      });
    }
  };

  const confirmDelete = async () => {
    if (!deleteData) return;

    try {
      // Perform the deletion
      const deleteRes = await apiPost("delete-wallet.php", { 
        record_id: deleteData.record_id,
        member_id: deleteData.member_id,
        cascade_delete: deleteData.has_references ? true : false
      });

      if (deleteRes?.success) {
        const deletedCount = deleteRes.deleted_count || 1;
        if (deleteData.has_references) {
          showAlert("Member Deleted", `Successfully deleted member "${deleteData.member_id}" and ${deletedCount} related records.`, <CircleCheckBig size={20} color="#10b981" />, "#10b981");
        } else {
          showAlert("Wallet Deleted", "Wallet deleted successfully.", <CircleCheckBig size={20} color="#10b981" />, "#10b981");
        }
        
        // Remove from local state
        setWallets(wallets.filter((w) => w.record_id !== deleteData.record_id));
        if (selected?.record_id === deleteData.record_id) {
          setSelected(null);
        }
      } else {
        showAlert("Delete Failed", deleteRes?.error || "Unknown error", <XCircle size={20} color="#ef4444" />, "#ef4444");
      }
    } catch (e) {
      console.error("[WalletAdmin] delete failed", e);
      showAlert("Delete Failed", "Network or server error — please try again.", <XCircle size={20} color="#ef4444" />, "#ef4444");
    } finally {
      closeModal();
      setDeleteData(null);
    }
  };

  const cancelDelete = () => {
    closeModal();
    setDeleteData(null);
  };

  // ── Fetch broker lockout info for a member ──
  const fetchLockoutInfo = async (memberId) => {
    setLockoutLoading(true);
    setLockoutInfo(null);
    setLockoutMsg("");
    try {
      const data = await apiPost("get-wallet.php", { member_id: memberId });
      if (data?.success) {
        const creds = data.broker_credentials || {};
        setLockoutInfo({
          fail_count: parseInt(creds.credential_fail_count || "0", 10),
          locked_at: creds.locked_at || null,
          fail_reset_at: creds.fail_reset_at || null,
          has_credentials: !!creds.username,
        });
      } else {
        setLockoutInfo({ fail_count: 0, locked_at: null, fail_reset_at: null, has_credentials: false });
      }
    } catch (err) {
      console.error("[WalletAdmin] lockout fetch error:", err);
      setLockoutInfo(null);
    } finally {
      setLockoutLoading(false);
    }
  };

  // ── Fetch Alpaca account ID + account number for a member ──
  const fetchAlpacaAccountInfo = async (memberId) => {
    setAlpacaAccountLoading(true);
    setAlpacaAccountInfo(null);
    try {
      const data = await apiPost("alpaca-get-portfolio.php", { member_id: memberId });
      if (data?.success && data.account) {
        setAlpacaAccountInfo({
          account_id:     data.account.account_id     || "",
          account_number: data.account.account_number || "",
          status:         data.account.status         || "",
        });
      } else {
        setAlpacaAccountInfo(null);
      }
    } catch {
      setAlpacaAccountInfo(null);
    } finally {
      setAlpacaAccountLoading(false);
    }
  };

  // ── Reset lockout for selected member ──
  const handleResetLockout = async () => {
    if (!selected?.member_id) return;
    setLockoutResetting(true);
    setLockoutMsg("");
    try {
      const res = await apiPost("admin-reset-broker-lockout.php", {
        member_id: selected.member_id,
      });
      if (res?.success) {
        setLockoutMsg(res.message || "Lockout reset successfully.");
        // Refresh lockout info
        await fetchLockoutInfo(selected.member_id);
      } else {
        setLockoutMsg("Reset failed: " + (res?.error || "Unknown error"));
      }
    } catch (err) {
      console.error("[WalletAdmin] lockout reset error:", err);
      setLockoutMsg("Network error during reset.");
    } finally {
      setLockoutResetting(false);
    }
  };

  // --- handle field changes (LIVE RECALC) ---
  const handleChange = (e) => {
    const { name, value } = e.target;
    const updated = { ...selected, [name]: value };

    if (name === "points") {
      const points = Number(updated.points || 0);
      // ✅ Use effective rate (tier-specific or base)
      updated.cash_balance = calcCashFromPoints(points, effectiveConversionRate);
    }

    setSelected(updated);
  };

  // --- handle merchant dropdown change ---
  const handleMerchantSelect = (e) => {
    const merchant_id = e.target.value;
    const m = merchants.find((x) => String(x.merchant_id) === String(merchant_id));

    const updated = {
      ...selected,
      merchant_id,
      merchant_name: m?.merchant_name || "",
    };

    const points = Number(updated.points || 0);
    // ✅ Use tier rate if member has a tier
    const tierRate = getTierRate(m, updated.member_tier);
    const rateToUse = tierRate ?? (m?.conversion_rate ?? 0);
    updated.cash_balance = calcCashFromPoints(points, rateToUse);

    setSelected(updated);
  };

  // --- edit button scrolls to top ---
  const handleEditClick = (wallet) => {
    const withCalc = { ...wallet };
    const points = Number(withCalc.points || 0);

    const m = merchants.find((x) => String(x.merchant_id) === String(withCalc.merchant_id));
    // ✅ Use tier rate if member has a tier
    const tierRate = getTierRate(m, withCalc.member_tier);
    const rateToUse = tierRate ?? (m?.conversion_rate ?? 0);

    withCalc.cash_balance = calcCashFromPoints(points, rateToUse);

    if (!withCalc.merchant_name && m?.merchant_name) withCalc.merchant_name = m.merchant_name;
    if (!withCalc.broker && m?.broker) withCalc.broker = m.broker;
    if (!withCalc.broker_url && m?.broker_url) withCalc.broker_url = m.broker_url;

    // normalize tier fields (support multiple backend names)
    if (withCalc.member_tier == null) {
      withCalc.member_tier =
        withCalc.member_tier ??
        withCalc.tier ??
        withCalc.tier_name ??
        withCalc.loyalty_tier ??
        "";
    }

    // ensure timezone present
    if (!withCalc.member_timezone || String(withCalc.member_timezone).trim() === "") {
      withCalc.member_timezone = detectedTz;
    }

    setSelected(withCalc);
    setNewPassword("");
    setConfirmPassword("");
    setShowPw(false);
    setShowTaxId(false);
    setLockoutMsg("");
    setAlpacaAccountInfo(null);
    fetchLockoutInfo(withCalc.member_id);
    if ((withCalc.broker || "").toLowerCase() === "alpaca") {
      fetchAlpacaAccountInfo(withCalc.member_id);
    }
    setTimeout(() => {
      editPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  // Filter wallets based on merchant and search term
  const filteredWallets = useMemo(() => {
    console.log('[WalletAdmin] Filtering wallets:', {
      totalWallets: wallets.length,
      fromDataQuality,
      fieldName,
      affectedMembersCount: affectedMembers.length,
      filterMerchantId,
      searchTerm
    });

    let result = wallets;

    // ✅ If coming from Data Quality Check, filter by affected members OR by missing field
    if (fromDataQuality && fieldName) {
      if (affectedMembers.length > 0) {
        // If we have specific member IDs, use those
        result = result.filter((w) => affectedMembers.includes(w.member_id));
        console.log('[WalletAdmin] Filtered by affected members:', result.length);
      } else {
        // Otherwise, filter by records where the field is missing/empty
        result = result.filter((w) => {
          const fieldValue = w[fieldName];
          
          // Check if field is null, undefined, empty string, or whitespace only
          if (fieldValue === null || fieldValue === undefined) {
            return true;
          }
          
          // For string fields, check if empty or whitespace
          if (typeof fieldValue === 'string') {
            return fieldValue.trim() === '' || 
                   fieldValue === '0000-00-00 00:00:00' || 
                   fieldValue === '0000-00-00';
          }
          
          // For numbers, check if 0 (might indicate missing data)
          // Be careful here - 0 might be a valid value for some fields
          return false;
        });
        console.log('[WalletAdmin] Filtered by missing field:', result.length);
      }
    }

    // Filter by merchant
    if (filterMerchantId) {
      result = result.filter((w) => 
        String(w.merchant_id) === String(filterMerchantId)
      );
    }

    // Search by member_id, first_name, last_name, or email
    if (searchTerm.trim()) {
      const search = searchTerm.trim().toLowerCase();
      result = result.filter((w) => {
        const memberId = (w.member_id || "").toLowerCase();
        const firstName = (w.first_name || "").toLowerCase();
        const lastName = (w.last_name || "").toLowerCase();
        const email = (w.member_email || "").toLowerCase();
        const fullName = `${firstName} ${lastName}`.toLowerCase();
        
        return (
          memberId.includes(search) ||
          firstName.includes(search) ||
          lastName.includes(search) ||
          fullName.includes(search) ||
          email.includes(search)
        );
      });
    }

    console.log('[WalletAdmin] Final filtered result:', result.length);
    return result;
  }, [wallets, filterMerchantId, searchTerm, fromDataQuality, affectedMembers, fieldName]);


  
  // ── Modal confirm dispatcher ──
  const handleModalConfirm = () => {
    const d = modal.data;
    if (!d) { setModal(prev => ({ ...prev, show: false })); return; }
    if (d.type === "delete") { confirmDelete(); return; }
    // alert mode — dismiss handled by closeModal which runs onDismiss
    closeModal();
  };

  return (
    <div className="app-container app-content">
      <ConfirmModal
        show={modal.show} title={modal.title} message={modal.message}
        details={modal.details} icon={modal.icon}
        confirmText={modal.confirmText} confirmColor={modal.confirmColor}
        onConfirm={handleModalConfirm} onCancel={closeModal}
      />

      <h1 className="page-title">Member Wallet Administration</h1>
      <p className="page-deck">
        This administration page is to manage member wallet information to correct or originate
        information for demonstration purposes.
      </p>

      {/* ✅ Data Quality Check Banner */}
      {fromDataQuality && fieldName && (
        <div style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "white",
          padding: "1rem",
          borderRadius: "8px",
          marginBottom: "1rem",
          boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
            <Search size={24} color="#1e40af" />
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: "600" }}>
              Data Quality Issue: Missing {fieldName}
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: "0.9rem", opacity: 0.95 }}>
            {affectedMembers.length > 0 ? (
              <>
                Filtered to show <strong>{affectedMembers.length}</strong> member{affectedMembers.length !== 1 ? 's' : ''} with missing <strong>{fieldName}</strong>.
              </>
            ) : (
              <>
                Filtered to show records with missing or invalid <strong>{fieldName}</strong> data.
                {totalAffected > 0 && ` (${totalAffected} total records affected)`}
              </>
            )}
            {" "}Click any row below to edit and fix the issue.
          </p>
        </div>
      )}

      {/* Filter bar */}
      {!loading && wallets.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem", padding: "1rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {/* Filter controls row */}
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: "0.9rem", fontWeight: "600", color: "#374151", minWidth: "80px" }}>
                Filter by:
              </label>
              
              {/* Merchant dropdown */}
              <select
                className="form-input"
                style={{ minWidth: 200, flex: "0 1 auto" }}
                value={filterMerchantId}
                onChange={(e) => setFilterMerchantId(e.target.value)}
                disabled={merchantsLoading}
              >
                <option value="">All Merchants</option>
                {merchants.map((m) => (
                  <option key={m.merchant_id} value={m.merchant_id}>
                    {m.merchant_name || m.merchant_id}
                  </option>
                ))}
              </select>

              {/* Search input */}
              <input
                className="form-input"
                type="text"
                placeholder="Search member ID, name, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ minWidth: 280, flex: "1 1 auto", maxWidth: "500px" }}
              />

              <span style={{ fontSize: "0.85rem", color: "#6b7280", marginLeft: "auto", whiteSpace: "nowrap" }}>
                Showing <strong>{filteredWallets.length}</strong> of <strong>{wallets.length}</strong> wallets
              </span>
            </div>

            {/* Clear filters button row */}
            {(filterMerchantId || searchTerm) && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setFilterMerchantId("");
                    setSearchTerm("");
                  }}
                  style={{ fontSize: "0.85rem", minWidth: "120px" }}
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Panel — only visible when a row is clicked */}
      {selected && (
      <div className="card" ref={editPanelRef} style={{ overflowX: "hidden", maxWidth: "100%", marginBottom: "1rem" }}>
        <h2 className="subheading" style={{ marginTop: 0 }}>
          Edit Wallet: {selected.member_id}
        </h2>
        <form onSubmit={saveWallet} className="form-grid" style={{ maxWidth: "100%" }}>
            <input type="hidden" name="record_id" value={selected?.record_id || ""} />

            {/* Member details */}
            <FormRow label="Member ID">
              <input
                className="form-input"
                type="text"
                name="member_id"
                value={selected?.member_id || ""}
                onChange={handleChange}
                required
              />
            </FormRow>

            <FormRow label="Member Email">
              <input
                className="form-input"
                type="email"
                name="member_email"
                value={selected?.member_email || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Phone">
              <input
                className="form-input"
                type="tel"
                name="member_phone"
                value={selected?.member_phone || ""}
                onChange={handleChange}
                placeholder="e.g. 2125551234"
              />
            </FormRow>

            {/* Admin-only password reset */}
            <FormRow label="New Password">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  className="form-input"
                  type={showPw ? "text" : "password"}
                  name="new_password"
                  value={newPassword}
                  placeholder="Enter new password"
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{
                    background: "none",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    padding: "0.45rem 0.6rem",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    color: "#6b7280",
                    whiteSpace: "nowrap",
                  }}
                  title={showPw ? "Hide passwords" : "Show passwords"}
                >
                  {showPw ? <><EyeOff size={14} /> Hide</> : <><Eye size={14} /> Show</>}
                </button>
              </div>
            </FormRow>

            <FormRow label="Confirm Password">
              <input
                className="form-input"
                type={showPw ? "text" : "password"}
                name="confirm_password"
                value={confirmPassword}
                placeholder="Re-enter new password"
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{
                  borderColor: confirmPassword && confirmPassword !== newPassword ? "#dc2626" : undefined,
                }}
              />
              {confirmPassword && confirmPassword !== newPassword && (
                <p style={{ fontSize: "0.8rem", color: "#dc2626", marginTop: "0.25rem", marginBottom: 0 }}>
                  Passwords do not match
                </p>
              )}
            </FormRow>

            <FormRow label="First Name">
              <input
                className="form-input"
                type="text"
                name="first_name"
                value={selected?.first_name || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Middle Name">
              <input
                className="form-input"
                type="text"
                name="middle_name"
                value={selected?.middle_name || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Last Name">
              <input
                className="form-input"
                type="text"
                name="last_name"
                value={selected?.last_name || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Date of Birth">
              <input
                className="form-input"
                type="date"
                name="date_of_birth"
                value={selected?.date_of_birth || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="SSN / Tax ID">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  className="form-input"
                  type={showTaxId ? "text" : "password"}
                  name="tax_id"
                  value={selected?.tax_id || ""}
                  onChange={handleChange}
                  placeholder="e.g. 123-45-6789"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => setShowTaxId(!showTaxId)}
                  style={{
                    background: "none",
                    border: "1px solid #d1d5db",
                    borderRadius: "6px",
                    padding: "0.45rem 0.6rem",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    color: "#6b7280",
                    whiteSpace: "nowrap",
                  }}
                  title={showTaxId ? "Hide SSN" : "Show SSN"}
                >
                  {showTaxId ? <><EyeOff size={14} /> Hide</> : <><Eye size={14} /> Show</>}
                </button>
              </div>
              <p style={{ fontSize: "0.78rem", color: "#9ca3af", marginTop: "0.25rem", marginBottom: 0 }}>
                Used for Alpaca KYC onboarding. Stored encrypted.
              </p>
            </FormRow>

            {/* Address */}
            <FormRow label="Address Lookup">
              <AddressLookup
                onSelect={({ line1, city, state, zip, country }) => {
                  setSelected((prev) => ({
                    ...prev,
                    member_address_line1: line1,
                    member_town_city: city,
                    member_state: state,
                    member_zip: zip,
                    member_country: country,
                  }));
                }}
              />
            </FormRow>

            <FormRow label="Address Line 1">
              <input
                className="form-input"
                type="text"
                name="member_address_line1"
                value={selected?.member_address_line1 || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Address Line 2">
              <input
                className="form-input"
                type="text"
                name="member_address_line2"
                value={selected?.member_address_line2 || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Town/City">
              <input
                className="form-input"
                type="text"
                name="member_town_city"
                value={selected?.member_town_city || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="State">
              <input
                className="form-input"
                type="text"
                name="member_state"
                value={selected?.member_state || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="ZIP">
              <input
                className="form-input"
                type="text"
                name="member_zip"
                value={selected?.member_zip || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Country">
              <input
                className="form-input"
                type="text"
                name="member_country"
                value={selected?.member_country || ""}
                onChange={handleChange}
              />
            </FormRow>

            {/* ✅ Local Timezone */}
            <FormRow label="Local Timezone">
              <div className="form-inline">
                <select
                  className="form-input"
                  name="member_timezone"
                  value={selected?.member_timezone ?? ""} // controlled; no auto-fallback
                  onChange={handleChange}
                >
                  <option value="">-- Select Timezone --</option>
                  {tzOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                <small className="subtext" style={{ marginLeft: "0.5rem" }}>
                  Detected: <strong>{detectedTz}</strong>
                  {isNonStandardTz && (
                    <span style={{ marginLeft: 8, color: "#b45309" }}>
                      (Non-standard; consider switching)
                    </span>
                  )}
                </small>
              </div>
            </FormRow>

            {/* Merchant & Broker */}
            <FormRow label="Merchant ID">
              <select
                className="form-input"
                name="merchant_id"
                value={String(selected?.merchant_id ?? "")}
                onChange={handleMerchantSelect}
                disabled={merchantsLoading}
              >
                <option value="">{merchantsLoading ? "Loading…" : "Select a merchant"}</option>
                {merchants.map((m) => (
                  <option key={m.merchant_id} value={String(m.merchant_id)}>
                    {m.merchant_name} ({m.merchant_id})
                  </option>
                ))}
              </select>
            </FormRow>

            <FormRow label="Merchant Name">
              <input
                className="form-input"
                type="text"
                name="merchant_name"
                value={selected?.merchant_name || ""}
                readOnly
              />
            </FormRow>

            {/* ✅ Member Tier (display below merchant name and above conversion rate) */}
            <FormRow label="Member Tier">
              <select
                className="form-input"
                name="member_tier"
                value={selected?.member_tier || ""}
                onChange={handleChange}
                style={{
                  backgroundColor: availableTiers.length === 0 ? "#f3f4f6" : "white"
                }}
              >
                <option value="">-- Select Tier --</option>
                {availableTiers.map((tierName) => (
                  <option key={tierName} value={tierName}>
                    {tierName}
                  </option>
                ))}
              </select>
              {availableTiers.length === 0 && (
                <p style={{ 
                  fontSize: "0.8rem", 
                  color: "#ef4444", 
                  marginTop: "0.25rem",
                  marginBottom: 0
                }}>
                  No tiers configured for this merchant
                </p>
              )}
              {availableTiers.length > 0 && (
                <p style={{ 
                  fontSize: "0.8rem", 
                  color: "#6b7280", 
                  marginTop: "0.25rem",
                  marginBottom: 0
                }}>
                  Available tiers: {availableTiers.join(", ")}
                </p>
              )}
            </FormRow>

            {/* ✅ Member Status */}
            <FormRow label="Member Status">
              <select
                className="form-input"
                name="member_status"
                value={selected?.member_status || "active"}
                onChange={handleChange}
                style={{
                  fontWeight: "600",
                  color:
                    selected?.member_status === "blocked" ? "#dc2626" :
                    selected?.member_status === "closed"  ? "#6b7280" :
                    selected?.member_status === "inactive" ? "#d97706" :
                    "#059669",
                  backgroundColor:
                    selected?.member_status === "blocked" ? "#fef2f2" :
                    selected?.member_status === "closed"  ? "#f3f4f6" :
                    selected?.member_status === "inactive" ? "#fffbeb" :
                    "#f0fdf4"
                }}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="blocked">Blocked</option>
                <option value="closed">Closed</option>
              </select>
            </FormRow>

            {/* 🔒 Base Conversion Rate (display-only from merchant) */}
            <FormRow label="Base Conversion Rate (Merchant Default)">
              <input
                className="form-input"
                type="text"
                name="conversion_rate_display"
                value={
                  selectedMerchantRate
                    ? `${selectedMerchantRate} ${selectedMerchantRate >= 1 ? "(% or ratio)" : ""}`
                    : ""
                }
                readOnly
                style={{
                  color: "#6b7280",
                  fontStyle: "italic"
                }}
              />
            </FormRow>
            
            {/* ✅ Active Conversion Rate (tier-specific or base) */}
            <FormRow label="Active Conversion Rate (Currently Using)">
              <input
                className="form-input"
                type="text"
                name="active_rate_display"
                value={
                  effectiveConversionRate
                    ? `${effectiveConversionRate}${selectedTierRate ? ` (${selected?.member_tier} Tier)` : " (Base Rate)"}`
                    : ""
                }
                readOnly
                style={{
                  fontWeight: "600",
                  color: selectedTierRate ? "#059669" : "#1f2937",
                  backgroundColor: selectedTierRate ? "#f0fdf4" : "transparent"
                }}
              />
            </FormRow>

            <FormRow label="Broker">
              <input
                className="form-input"
                type="text"
                name="broker"
                value={selected?.broker || ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Broker URL">
              <input
                className="form-input"
                type="url"
                name="broker_url"
                value={selected?.broker_url || ""}
                onChange={handleChange}
              />
            </FormRow>

            {/* ── Alpaca Brokerage Account (read-only) ── */}
            {(selected?.broker || "").toLowerCase() === "alpaca" && (
              <div style={{
                margin: "4px 0 16px",
                padding: "12px 14px",
                borderRadius: 8,
                border: "1px solid #bae6fd",
                background: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
              }}>
                <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "#0369a1", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <CreditCard size={14} /> Alpaca Brokerage Account
                  {alpacaAccountLoading && (
                    <RefreshCw size={12} style={{ marginLeft: 4, animation: "spin 1s linear infinite" }} />
                  )}
                  {alpacaAccountInfo?.status && (
                    <span style={{
                      marginLeft: "auto", fontSize: "0.7rem", fontWeight: 700,
                      padding: "1px 8px", borderRadius: 999,
                      background: alpacaAccountInfo.status === "ACTIVE" ? "#dcfce7" : "#fef3c7",
                      color: alpacaAccountInfo.status === "ACTIVE" ? "#166534" : "#92400e",
                    }}>
                      {alpacaAccountInfo.status}
                    </span>
                  )}
                </div>

                {alpacaAccountLoading && !alpacaAccountInfo ? (
                  <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>Loading Alpaca account…</div>
                ) : alpacaAccountInfo ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Account ID (UUID)</div>
                      <div style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#0c4a6e", background: "#fff", padding: "5px 8px", borderRadius: 5, border: "1px solid #bae6fd", wordBreak: "break-all" }}>
                        {alpacaAccountInfo.account_id || "—"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Account Number</div>
                      <div style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#0c4a6e", background: "#fff", padding: "5px 8px", borderRadius: 5, border: "1px solid #bae6fd", fontWeight: 700 }}>
                        {alpacaAccountInfo.account_number || "—"}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: "0.8rem", color: "#9ca3af", fontStyle: "italic" }}>
                    No Alpaca account data — member may not have completed onboarding.
                  </div>
                )}
              </div>
            )}

            {/* ── Broker Credential Lockout ── */}
            {lockoutInfo?.has_credentials && (
              <div
                style={{
                  margin: "12px 0 16px",
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: `1px solid ${lockoutInfo.locked_at ? "#fecaca" : lockoutInfo.fail_count > 0 ? "#fed7aa" : "#e5e7eb"}`,
                  background: lockoutInfo.locked_at ? "#fef2f2" : lockoutInfo.fail_count > 0 ? "#fffbeb" : "#f9fafb",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#374151" }}>
                    Broker Credential Status
                  </span>
                  {lockoutInfo.locked_at ? (
                    <span style={{
                      padding: "2px 10px", borderRadius: 999, fontSize: "0.75rem",
                      fontWeight: 700, background: "#fee2e2", color: "#991b1b",
                    }}>
                      <Lock /> LOCKED
                    </span>
                  ) : lockoutInfo.fail_count > 0 ? (
                    <span style={{
                      padding: "2px 10px", borderRadius: 999, fontSize: "0.75rem",
                      fontWeight: 700, background: "#fef3c7", color: "#92400e",
                    }}>
                      <AlertTriangle /> {lockoutInfo.fail_count}/10 fails
                    </span>
                  ) : (
                    <span style={{
                      padding: "2px 10px", borderRadius: 999, fontSize: "0.75rem",
                      fontWeight: 700, background: "#dcfce7", color: "#166534",
                    }}>
                      <CircleCheckBig /> OK
                    </span>
                  )}
                </div>

                {lockoutInfo.locked_at && (
                  <div style={{ fontSize: "0.8rem", color: "#991b1b", marginBottom: 6 }}>
                    Locked at: {lockoutInfo.locked_at}
                  </div>
                )}
                {lockoutInfo.fail_reset_at && (
                  <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: 6 }}>
                    Last reset: {lockoutInfo.fail_reset_at}
                  </div>
                )}

                {(lockoutInfo.fail_count > 0 || lockoutInfo.locked_at) && (
                  <button
                    type="button"
                    onClick={handleResetLockout}
                    disabled={lockoutResetting}
                    style={{
                      width: "100%",
                      marginTop: 6,
                      padding: "8px 14px",
                      borderRadius: 6,
                      border: "none",
                      fontWeight: 700,
                      fontSize: "0.82rem",
                      cursor: lockoutResetting ? "not-allowed" : "pointer",
                      background: lockoutInfo.locked_at ? "#dc2626" : "#f59e0b",
                      color: "#fff",
                      opacity: lockoutResetting ? 0.6 : 1,
                    }}
                  >
                    {lockoutResetting
                      ? "Resetting…"
                      : lockoutInfo.locked_at
                      ? <><Unlock size={14} style={{ verticalAlign: "middle" }} /> Unlock Account & Reset Fails</>
                      : `Reset Fail Count (${lockoutInfo.fail_count})`}
                  </button>
                )}

                {lockoutMsg && (
                  <div style={{
                    marginTop: 8, fontSize: "0.8rem", fontWeight: 600,
                    color: lockoutMsg.includes("fail") || lockoutMsg.includes("error") ? "#dc2626" : "#166534",
                  }}>
                    {lockoutMsg}
                  </div>
                )}
              </div>
            )}

            {lockoutLoading && lockoutInfo === null && (
              <div style={{ fontSize: "0.8rem", color: "#6b7280", padding: "8px 0" }}>
                Loading lockout status…
              </div>
            )}

            <FormRow label="Election Type">
              <input
                className="form-input"
                type="text"
                name="election_type"
                value={selected?.election_type || ""}
                onChange={handleChange}
              />
            </FormRow>

            {/* Balances */}
            <FormRow label="Points">
              <input
                className="form-input"
                type="number"
                name="points"
                value={selected?.points ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            {/* cash_balance is display only (but we show the live calc) */}
            <FormRow label="Cash Balance (calc)">
              <input
                className="form-input"
                type="number"
                step="0.01"
                name="cash_balance"
                value={
                  Number.isFinite(Number(selected?.cash_balance))
                    ? selected?.cash_balance
                    : calcCashFromPoints(Number(selected?.points || 0), effectiveConversionRate)
                }
                readOnly
              />
            </FormRow>

            <FormRow label="Portfolio Value">
              <input
                className="form-input"
                type="number"
                step="0.01"
                name="portfolio_value"
                value={selected?.portfolio_value ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <FormRow label="Sweep %">
              <input
                className="form-input"
                type="number"
                step="0.01"
                name="sweep_percentage"
                value={selected?.sweep_percentage ?? ""}
                onChange={handleChange}
              />
            </FormRow>

            <div className="card-actions">
              <button type="submit" className="btn-primary">
                Save Wallet
              </button>
              {selected?.record_id && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: "#dc2626" }}
                  onClick={() => deleteWallet(selected.record_id)}
                >
                  Delete Wallet
                </button>
              )}
              <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
          </form>
      </div>
      )}

      {/* Wallets table */}
      <h2 className="subheading">Wallet Records</h2>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="basket-table">
            <thead>
              <tr>
                <th>Member ID</th>
                <th>Email</th>
                <th>Merchant / Broker</th>
                <th>Tier</th>
                <th>Status</th>
                <th>Points → Cash / Portfolio</th>
              </tr>
            </thead>
            <tbody>
              {filteredWallets.map((w) => {
                const points = w.points == null || isNaN(Number(w.points)) ? null : Number(w.points);
                const cash =
                  w.cash_balance != null && !isNaN(Number(w.cash_balance))
                    ? Number(w.cash_balance)
                    : null;
                const portfolio =
                  w.portfolio_value == null || isNaN(Number(w.portfolio_value))
                    ? null
                    : Number(w.portfolio_value);

                return (
                  <tr 
                    key={w.record_id}
                    onClick={() => handleEditClick(w)}
                    style={{ 
                      cursor: 'pointer',
                      // Highlight row if this record has the missing field
                      backgroundColor: fromDataQuality && fieldName && !w[fieldName] ? '#fef2f2' : 'transparent'
                    }}
                    title={
                      fromDataQuality && fieldName && !w[fieldName] 
                        ? `Missing ${fieldName} - Click to fix`
                        : "Click to edit this wallet"
                    }
                  >
                    <td>{w.member_id}</td>
                    <td>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem' 
                      }}>
                        <span>{w.member_email}</span>
                        {/* Show warning icon if this is the missing field */}
                        {fromDataQuality && fieldName === 'member_email' && !w.member_email && (
                          <AlertTriangle size={14} color="#ef4444" title="Missing email" />
                        )}
                      </div>
                      {w.member_timezone && <div className="subtext">{w.member_timezone}</div>}
                    </td>
                    <td>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem' 
                      }}>
                        <span>{w.merchant_name || "-"}</span>
                        {/* Show warning icon if merchant_name is the missing field */}
                        {fromDataQuality && fieldName === 'merchant_name' && !w.merchant_name && (
                          <AlertTriangle size={14} color="#ef4444" title="Missing merchant name" />
                        )}
                      </div>
                      <div className="subtext">{w.broker || "-"}</div>
                    </td>
                    <td>
                      <span style={{ 
                        fontSize: '0.85rem',
                        fontWeight: w.member_tier ? '500' : '400',
                        color: w.member_tier ? '#059669' : '#9ca3af'
                      }}>
                        {w.member_tier || '-'}
                      </span>
                    </td>
                    <td>
                      {(() => {
                        const status = w.member_status || 'active';
                        const cfg = {
                          active:   { bg: '#d1fae5', color: '#065f46', label: 'Active' },
                          inactive: { bg: '#fef3c7', color: '#92400e', label: 'Inactive' },
                          blocked:  { bg: '#fee2e2', color: '#991b1b', label: 'Blocked' },
                          closed:   { bg: '#f3f4f6', color: '#6b7280', label: 'Closed' },
                        }[status] || { bg: '#f3f4f6', color: '#6b7280', label: status };
                        return (
                          <span style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            backgroundColor: cfg.bg,
                            color: cfg.color,
                          }}>
                            {cfg.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <span>{points == null ? "-" : points.toLocaleString()}</span>
                        <span aria-hidden="true" title="converts to">
                          <ArrowRight size={12} color="#6b7280" />
                        </span>
                        <span>
                          {cash == null
                            ? "-"
                            : cash.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                        </span>
                      </div>
                      <div className="subtext" style={{ marginTop: "0.15rem" }}>
                        {portfolio == null
                          ? "-"
                          : portfolio.toLocaleString(undefined, {
                              style: "currency",
                              currency: "USD",
                            })}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredWallets.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}>
                    {wallets.length === 0 
                      ? "No wallets found." 
                      : "No wallets match the current filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

function FormRow({ label, children }) {
  return (
    <div className="form-row" style={{ maxWidth: "100%", boxSizing: "border-box" }}>
      {label && <label className="form-label">{label}:</label>}
      <div style={{ maxWidth: "100%", boxSizing: "border-box" }}>
        {children}
      </div>
    </div>
  );
}