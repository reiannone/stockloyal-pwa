import React, { useState, useEffect, useCallback } from 'react';

/**
 * MarketStatusBanner
 * 
 * Displays a contextual banner showing market open/closed status.
 * Use on the redemption/invest page so members know upfront if there's a delay.
 * 
 * Usage:
 *   <MarketStatusBanner />
 *   <MarketStatusBanner compact />
 */

const API_BASE = process.env.REACT_APP_API_URL || '/api';

// ─── Market Status Hook ─────────────────────────────────────────

export function useMarketStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/market-status.php`);
      const data = await res.json();
      if (data.success) {
        setStatus(data.data);
      } else {
        setError(data.error || 'Failed to fetch market status');
      }
    } catch (err) {
      setError('Unable to check market status');
      console.error('Market status fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    // Refresh every 5 minutes (market status can change)
    const interval = setInterval(fetchStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return { status, loading, error, refresh: fetchStatus };
}

// ─── Banner Component ───────────────────────────────────────────

export function MarketStatusBanner({ compact = false }) {
  const { status, loading, error } = useMarketStatus();

  if (loading || error) return null;
  if (!status) return null;

  // Don't show banner if market is open (no delay to communicate)
  if (status.is_open) return null;

  const icon = getStatusIcon(status.delay_reason);
  const bgClass = getBannerStyle(status.delay_reason);

  if (compact) {
    return (
      <div className={`market-banner-compact ${bgClass}`}>
        <span className="market-banner-icon">{icon}</span>
        <span className="market-banner-text">{status.message_short}</span>
      </div>
    );
  }

  return (
    <div className={`market-banner ${bgClass}`}>
      <div className="market-banner-content">
        <span className="market-banner-icon">{icon}</span>
        <div className="market-banner-text-wrap">
          <p className="market-banner-message">{status.message}</p>
          {status.next_trading_day && (
            <p className="market-banner-detail">
              Orders placed now will execute on market open.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Order Confirmation Component ───────────────────────────────

/**
 * OrderConfirmation
 * 
 * Shown after a member confirms a redemption/investment.
 * Displays the appropriate message based on whether the order
 * will execute immediately or is queued.
 *
 * Usage:
 *   <OrderConfirmation orderResult={result} onClose={() => setShowConfirm(false)} />
 */
export function OrderConfirmation({ orderResult, onClose }) {
  if (!orderResult) return null;

  const { is_immediate, member_message, scheduled_date, market_status } = orderResult;

  return (
    <div className="order-confirmation-overlay">
      <div className="order-confirmation-card">
        {/* Header */}
        <div className={`order-confirmation-header ${is_immediate ? 'header-success' : 'header-queued'}`}>
          <span className="order-confirmation-icon">
            {is_immediate ? '✓' : '⏳'}
          </span>
          <h3 className="order-confirmation-title">
            {is_immediate ? 'Order Submitted' : 'Order Scheduled'}
          </h3>
        </div>

        {/* Body */}
        <div className="order-confirmation-body">
          <p className="order-confirmation-message">{member_message}</p>

          {!is_immediate && scheduled_date && (
            <div className="order-confirmation-schedule">
              <div className="schedule-row">
                <span className="schedule-label">Scheduled for</span>
                <span className="schedule-value">
                  {formatScheduledDate(scheduled_date)}
                </span>
              </div>
              <div className="schedule-row">
                <span className="schedule-label">Market opens</span>
                <span className="schedule-value">9:30 AM ET</span>
              </div>
            </div>
          )}

          {!is_immediate && (
            <p className="order-confirmation-note">
              You'll receive a notification when your order is executed. 
              You can view your pending orders in your portfolio.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="order-confirmation-footer">
          <button className="btn-primary" onClick={onClose}>
            {is_immediate ? 'View Portfolio' : 'Got It'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Invest Button with Market Awareness ────────────────────────

/**
 * InvestButton
 * 
 * A market-aware invest button that shows scheduling context.
 * When market is closed, the button label changes to indicate queuing.
 *
 * Usage:
 *   <InvestButton
 *     symbol="AAPL"
 *     amount={25.00}
 *     merchantId={1}
 *     onSuccess={(result) => setConfirmation(result)}
 *     onError={(err) => setError(err)}
 *   />
 */
export function InvestButton({ symbol, amount, merchantId, onSuccess, onError, disabled }) {
  const { status } = useMarketStatus();
  const [submitting, setSubmitting] = useState(false);

  const handleInvest = async () => {
    if (submitting || disabled) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/market-status.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          symbol,
          amount,
          merchant_id: merchantId,
          source: 'points_redemption',
        }),
      });

      const data = await res.json();

      if (data.success) {
        onSuccess?.(data.data);
      } else {
        onError?.(data.error || 'Failed to place order');
      }
    } catch (err) {
      onError?.('Unable to place order. Please try again.');
      console.error('Order submission error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const isMarketOpen = status?.is_open ?? true;
  const buttonLabel = submitting
    ? 'Placing Order...'
    : isMarketOpen
      ? `Invest $${amount?.toFixed(2)}`
      : `Schedule $${amount?.toFixed(2)} Investment`;

  return (
    <button
      className={`invest-button ${isMarketOpen ? 'invest-now' : 'invest-scheduled'}`}
      onClick={handleInvest}
      disabled={submitting || disabled}
    >
      {buttonLabel}
      {!isMarketOpen && !submitting && (
        <span className="invest-button-subtitle">
          Executes {status?.message_short?.replace('Market closed — executes ', '') || 'next trading day'}
        </span>
      )}
    </button>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

function getStatusIcon(delayReason) {
  switch (delayReason) {
    case 'weekend':     return '📅';
    case 'holiday':     return '🏖️';
    case 'after_hours': return '🌙';
    case 'pre_market':  return '🌅';
    default:            return '⏸️';
  }
}

function getBannerStyle(delayReason) {
  switch (delayReason) {
    case 'weekend':
    case 'holiday':
      return 'banner-info';
    case 'after_hours':
    case 'pre_market':
      return 'banner-subtle';
    default:
      return 'banner-info';
  }
}

function formatScheduledDate(dateStr) {
  const date = new Date(dateStr + 'T09:30:00-05:00');
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === now.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function getAuthToken() {
  // TODO: Replace with your actual token retrieval
  return localStorage.getItem('auth_token') || '';
}

export default MarketStatusBanner;
