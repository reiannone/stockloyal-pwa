import React, { useRef } from "react";
import { useNavigate } from "react-router-dom";

const Terms = () => {
  const navigate = useNavigate();
  const bottomRef = useRef(null);

  const handleAccept = () => navigate("/election");
  const handleReject = () => navigate("/goodbye");

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  // ── Styles ──────────────────────────────────────────────────────────────
  const s = {
    page: {
      maxWidth: 860,
      margin: "0 auto",
      padding: "24px 20px 40px",
      fontFamily: "Arial, sans-serif",
      color: "#1f2937",
      fontSize: "0.92rem",
      lineHeight: 1.7,
    },
    sandboxBanner: {
      background: "#fef2f2",
      border: "2px solid #ef4444",
      borderRadius: 8,
      padding: "14px 20px",
      marginBottom: 28,
      textAlign: "center",
      color: "#7f1d1d",
      fontWeight: 700,
      fontSize: "0.88rem",
      lineHeight: 1.6,
    },
    titleBlock: {
      textAlign: "center",
      marginBottom: 28,
      paddingBottom: 20,
      borderBottom: "2px solid #e5e7eb",
    },
    logo: {
      fontSize: "2rem",
      fontWeight: 800,
      color: "#1e3a5f",
      letterSpacing: 2,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: "1.1rem",
      color: "#374151",
      fontWeight: 600,
      marginBottom: 4,
    },
    effectiveDate: {
      fontSize: "0.82rem",
      color: "#6b7280",
      fontStyle: "italic",
    },
    h1: {
      fontSize: "1.05rem",
      fontWeight: 700,
      color: "#1e3a5f",
      marginTop: 28,
      marginBottom: 8,
      paddingBottom: 4,
      borderBottom: "1px solid #e5e7eb",
    },
    h2: {
      fontSize: "0.95rem",
      fontWeight: 700,
      color: "#1e3a5f",
      marginTop: 18,
      marginBottom: 6,
    },
    p: {
      marginBottom: 10,
    },
    ul: {
      paddingLeft: 22,
      marginBottom: 10,
    },
    li: {
      marginBottom: 4,
    },
    allCaps: {
      fontWeight: 700,
      fontSize: "0.88rem",
    },
    divider: {
      border: "none",
      borderTop: "1px solid #e5e7eb",
      margin: "24px 0",
    },
    signoff: {
      background: "#f9fafb",
      border: "1px solid #d1d5db",
      borderRadius: 8,
      padding: "16px 20px",
      textAlign: "center",
      fontStyle: "italic",
      color: "#374151",
      fontSize: "0.88rem",
      marginTop: 28,
      marginBottom: 28,
    },
    actions: {
      flexShrink: 0,
      background: "#fff",
      borderTop: "2px solid #e5e7eb",
      padding: "14px 20px",
      display: "flex",
      gap: 12,
      justifyContent: "center",
      boxShadow: "0 -4px 12px rgba(0,0,0,0.08)",
    },
    btnPrimary: {
      background: "#1e3a5f",
      color: "#fff",
      border: "none",
      borderRadius: 6,
      padding: "10px 28px",
      fontSize: "0.95rem",
      fontWeight: 600,
      cursor: "pointer",
    },
    btnSecondary: {
      background: "#fff",
      color: "#6b7280",
      border: "1px solid #d1d5db",
      borderRadius: 6,
      padding: "10px 28px",
      fontSize: "0.95rem",
      fontWeight: 600,
      cursor: "pointer",
    },
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      background: "#fff",
    }}>
      {/* Scrollable content area */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={s.page}>

        {/* ── Sandbox Banner ── */}
        <div style={s.sandboxBanner}>
          ⚠ TEST ENVIRONMENT NOTICE ⚠<br />
          This platform is currently operating in a sandbox / test environment. No real securities
          transactions, real money transfers, or live brokerage activities are taking place.
          All accounts, balances, trades, and data shown are simulated for development and
          demonstration purposes only.
        </div>

        {/* ── Title Block ── */}
        <div style={s.titleBlock}>
          <div style={s.logo}>STOCKLOYAL</div>
          <div style={s.subtitle}>Terms and Conditions of Service</div>
          <div style={s.effectiveDate}>Effective Date: {today}</div>
        </div>

        {/* ── Section 1 ── */}
        <div style={s.h1}>1. Introduction and Parties</div>
        <p style={s.p}>
          These Terms and Conditions ("Agreement") govern your access to and use of the StockLoyal
          platform ("Platform"), a loyalty rewards investment service operated by StockLoyal, Inc.
          ("StockLoyal", "we", "us", or "our"), currently pending incorporation.
        </p>
        <p style={s.p}>
          By registering for, accessing, or using the Platform, you ("Member" or "you") agree to be
          bound by this Agreement in its entirety. If you do not agree, you must not access or use
          the Platform.
        </p>

        <div style={s.h2}>1.1 Introducing Broker Relationship</div>
        <p style={s.p}>
          StockLoyal operates as an Introducing Broker ("IB") for the purpose of facilitating the
          investment of loyalty points converted to fractional equity securities on behalf of Members.
          StockLoyal's registered personnel hold FINRA Series 7 (General Securities Representative)
          and Series 24 (General Securities Principal) licenses, among others, as required to operate
          in this capacity.
        </p>
        <p style={s.p}>
          As an Introducing Broker, StockLoyal introduces Member accounts and investment orders to
          its clearing and custodial partner but does not hold, clear, or custody Member funds or
          securities directly.
        </p>

        <div style={s.h2}>1.2 Clearing Agent and Custodian — Alpaca Securities LLC</div>
        <p style={s.p}>
          All Member brokerage accounts are established with, held by, and cleared through Alpaca
          Securities LLC ("Alpaca"), a FINRA-registered broker-dealer and member of SIPC. Alpaca acts
          as the carrying broker, custodian, and clearing agent for all securities held on behalf of Members.
        </p>
        <p style={s.p}>By using the Platform, you acknowledge and agree that:</p>
        <ul style={s.ul}>
          <li style={s.li}>Your brokerage account is held at Alpaca Securities LLC, not at StockLoyal;</li>
          <li style={s.li}>Securities purchased through the Platform are held in custody by Alpaca;</li>
          <li style={s.li}>Alpaca's own customer agreements, privacy policy, and disclosures also apply to your account;</li>
          <li style={s.li}>SIPC protection applies to your Alpaca-held account up to applicable limits (currently $500,000, including $250,000 for cash claims);</li>
          <li style={s.li}>StockLoyal is not a custodian and does not hold client funds or securities.</li>
        </ul>

        {/* ── Section 2 ── */}
        <div style={s.h1}>2. Platform Overview</div>
        <p style={s.p}>
          StockLoyal is a fintech platform that enables members of participating merchant loyalty
          programs to convert accumulated loyalty points into fractional share investments in publicly
          traded U.S. equity securities. The Platform operates in the following stages:
        </p>
        <ul style={s.ul}>
          <li style={s.li}>Merchants fund a sweep account on behalf of their loyalty members;</li>
          <li style={s.li}>StockLoyal converts member loyalty points to a USD cash value using tier-specific conversion rates established by the merchant;</li>
          <li style={s.li}>Cash is journaled from the StockLoyal omnibus sweep account to individual Member brokerage accounts held at Alpaca;</li>
          <li style={s.li}>Fractional share orders are placed and executed through Alpaca's brokerage infrastructure;</li>
          <li style={s.li}>Members may view their portfolio, transaction history, and account status through the Platform.</li>
        </ul>

        {/* ── Section 3 ── */}
        <div style={s.h1}>3. Eligibility</div>
        <p style={s.p}>To use the Platform, you must:</p>
        <ul style={s.ul}>
          <li style={s.li}>Be a natural person at least 18 years of age;</li>
          <li style={s.li}>Be a legal resident or citizen of the United States;</li>
          <li style={s.li}>Provide accurate and complete identity verification information (KYC) as required by applicable law and Alpaca's account opening requirements;</li>
          <li style={s.li}>Not be subject to sanctions, on any government watchlist, or otherwise legally prohibited from participating in U.S. securities markets;</li>
          <li style={s.li}>Be an active member of a participating merchant's loyalty program.</li>
        </ul>

        {/* ── Section 4 ── */}
        <div style={s.h1}>4. Account Opening and KYC</div>
        <p style={s.p}>
          Opening a brokerage account through the Platform requires the collection and verification
          of personal information including, but not limited to: full legal name, date of birth,
          Social Security Number (SSN), residential address, phone number, and employment information.
          This information is required by FINRA, SEC, and FinCEN regulations, including Customer
          Identification Program (CIP) and Anti-Money Laundering (AML) requirements.
        </p>
        <p style={s.p}>
          Sensitive personal data including SSN is encrypted at rest using AES-256 encryption.
          StockLoyal transmits KYC data to Alpaca for account establishment and is subject to
          Alpaca's data handling practices for brokerage account purposes.
        </p>

        {/* ── Section 5 ── */}
        <div style={s.h1}>5. Loyalty Points Conversion</div>
        <p style={s.p}>
          Loyalty points earned through a participating merchant's program may be converted to USD
          cash value for investment purposes, subject to the following:
        </p>
        <ul style={s.ul}>
          <li style={s.li}>Conversion rates are set by the merchant and may vary by member tier (e.g., Bronze, Silver, Gold, Elite);</li>
          <li style={s.li}>Points are deducted from your merchant loyalty account at the time of the sweep;</li>
          <li style={s.li}>A minimum order amount per security applies as set by the clearing broker ($5.00 per order for Alpaca);</li>
          <li style={s.li}>A maximum basket value per sweep cycle applies as set by the clearing broker ($5,000.00 per basket for Alpaca);</li>
          <li style={s.li}>A maximum number of securities per basket applies as set by the clearing broker (up to 10 securities for Alpaca);</li>
          <li style={s.li}>Conversion rates, minimums, maximums, and eligible securities are subject to change with notice.</li>
        </ul>

        {/* ── Section 6 ── */}
        <div style={s.h1}>6. Investment Risks</div>
        <p style={{ ...s.p, ...s.allCaps }}>
          INVESTING IN SECURITIES INVOLVES RISK, INCLUDING THE POSSIBLE LOSS OF PRINCIPAL.
          THE FOLLOWING DISCLOSURES ARE REQUIRED AND IMPORTANT:
        </p>
        <ul style={s.ul}>
          <li style={s.li}>Past performance of any security does not guarantee future results;</li>
          <li style={s.li}>Fractional shares carry the same market risks as whole shares;</li>
          <li style={s.li}>The value of your investment may decline below the amount converted from your loyalty points;</li>
          <li style={s.li}>StockLoyal does not provide investment advice. Stock selections are made by the Member and are not recommendations by StockLoyal or Alpaca;</li>
          <li style={s.li}>Order execution is subject to market conditions and may be delayed or unfilled;</li>
          <li style={s.li}>StockLoyal and Alpaca do not guarantee any particular investment outcome.</li>
        </ul>

        {/* ── Section 7 ── */}
        <div style={s.h1}>7. Order Execution</div>
        <p style={s.p}>
          Investment orders are submitted to Alpaca as fractional market orders during regular U.S.
          equity market trading hours (9:30 AM – 4:00 PM Eastern, Monday through Friday, excluding
          market holidays). Orders submitted outside of market hours will be queued and executed at
          the next available market open.
        </p>
        <p style={s.p}>
          StockLoyal uses the Alpaca Broker API to submit orders and monitor execution status.
          Execution prices are determined by market conditions at the time of order fill. StockLoyal
          does not guarantee any specific execution price.
        </p>

        {/* ── Section 8 ── */}
        <div style={s.h1}>8. Fees</div>
        <p style={s.p}>
          StockLoyal charges fees to participating merchants, not directly to Members, for use of the
          Platform. Fee structures include license fees, per-member fees, per-basket fees, per-order
          fees, and ACH processing fees as agreed upon in the merchant services agreement.
        </p>
        <p style={s.p}>Members should be aware that:</p>
        <ul style={s.ul}>
          <li style={s.li}>Alpaca may assess its own fees for brokerage account services; please review Alpaca's fee schedule;</li>
          <li style={s.li}>No fees are currently charged directly to Members for basic Platform use;</li>
          <li style={s.li}>Fee structures are subject to change with prior notice.</li>
        </ul>

        {/* ── Section 9 ── */}
        <div style={s.h1}>9. Privacy and Data</div>
        <p style={s.p}>
          StockLoyal collects, stores, and uses personal information in accordance with its Privacy
          Policy. Key data practices include:
        </p>
        <ul style={s.ul}>
          <li style={s.li}>SSN and tax identification numbers are encrypted with AES-256 before storage;</li>
          <li style={s.li}>Member passwords are hashed and never stored in plaintext;</li>
          <li style={s.li}>KYC data is transmitted to Alpaca for regulatory compliance purposes;</li>
          <li style={s.li}>Bank account information for merchant funding is handled through Plaid Inc., subject to Plaid's privacy policy;</li>
          <li style={s.li}>Data is hosted on Amazon Web Services (AWS) infrastructure within the United States.</li>
        </ul>

        {/* ── Section 10 ── */}
        <div style={s.h1}>10. Prohibited Activities</div>
        <p style={s.p}>Members may not use the Platform to:</p>
        <ul style={s.ul}>
          <li style={s.li}>Engage in market manipulation, wash trading, or any fraudulent trading activity;</li>
          <li style={s.li}>Provide false or misleading identity or financial information;</li>
          <li style={s.li}>Attempt to gain unauthorized access to other Member accounts or Platform systems;</li>
          <li style={s.li}>Use the Platform for any unlawful purpose or in violation of any applicable regulation;</li>
          <li style={s.li}>Circumvent or attempt to circumvent any Platform limits, controls, or restrictions.</li>
        </ul>

        {/* ── Section 11 ── */}
        <div style={s.h1}>11. Account Suspension and Termination</div>
        <p style={s.p}>
          StockLoyal reserves the right to suspend, restrict, or terminate any Member account at its
          sole discretion, including but not limited to cases of:
        </p>
        <ul style={s.ul}>
          <li style={s.li}>Suspected fraud, identity theft, or market manipulation;</li>
          <li style={s.li}>Failure to complete KYC or AML verification requirements;</li>
          <li style={s.li}>Violation of these Terms and Conditions;</li>
          <li style={s.li}>Direction from Alpaca, FINRA, the SEC, or any regulatory authority;</li>
          <li style={s.li}>Inactivity or membership termination from the associated merchant loyalty program.</li>
        </ul>
        <p style={s.p}>
          Upon termination, any securities held in your Alpaca account will remain subject to
          Alpaca's account closure procedures.
        </p>

        {/* ── Section 12 ── */}
        <div style={s.h1}>12. Limitation of Liability</div>
        <p style={{ ...s.p, ...s.allCaps }}>
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, STOCKLOYAL, ITS OFFICERS, DIRECTORS,
          EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
          CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED TO YOUR USE OF THE PLATFORM,
          INCLUDING BUT NOT LIMITED TO INVESTMENT LOSSES, DATA LOSS, OR SERVICE INTERRUPTIONS.
        </p>
        <p style={s.p}>
          StockLoyal's total liability to any Member for any claim arising under this Agreement shall
          not exceed the total cash value of loyalty points converted by that Member in the twelve
          (12) months preceding the claim.
        </p>

        {/* ── Section 13 ── */}
        <div style={s.h1}>13. Dispute Resolution and Arbitration</div>
        <p style={s.p}>
          Any dispute, claim, or controversy arising out of or relating to this Agreement or your use
          of the Platform shall be resolved by binding arbitration administered by FINRA Dispute
          Resolution Services in accordance with FINRA's Code of Arbitration Procedure for Customer
          Disputes, except where prohibited by applicable law.
        </p>
        <p style={s.p}>
          You acknowledge that by agreeing to arbitration you waive your right to a trial by jury
          and to participate in any class action lawsuit or class-wide arbitration.
        </p>

        {/* ── Section 14 ── */}
        <div style={s.h1}>14. Governing Law</div>
        <p style={s.p}>
          This Agreement shall be governed by and construed in accordance with the laws of the United
          States and the laws of the State of [State of Incorporation — To Be Determined], without
          regard to its conflict of law provisions.
        </p>

        {/* ── Section 15 ── */}
        <div style={s.h1}>15. Amendments</div>
        <p style={s.p}>
          StockLoyal reserves the right to modify these Terms and Conditions at any time. Material
          changes will be communicated to Members via email or platform notification at least 30 days
          prior to the effective date. Continued use of the Platform following notice of changes
          constitutes acceptance of the updated terms.
        </p>

        {/* ── Section 16 ── */}
        <div style={s.h1}>16. Regulatory Disclosures</div>
        <p style={s.p}>
          StockLoyal personnel hold the following FINRA registrations, among others: Series 7
          (General Securities Representative), Series 24 (General Securities Principal). StockLoyal
          is in the process of formal entity registration and FINRA broker-dealer registration. The
          Platform is currently operating in a test and development environment and is NOT currently
          registered as a broker-dealer.
        </p>
        <p style={s.p}>
          Alpaca Securities LLC is a registered broker-dealer with FINRA (CRD #304483) and a member
          of SIPC. For more information about Alpaca, visit{" "}
          <a href="https://www.alpaca.markets" target="_blank" rel="noreferrer">www.alpaca.markets</a>{" "}
          or FINRA BrokerCheck.
        </p>

        {/* ── Section 17 ── */}
        <div style={s.h1}>17. Contact Information</div>
        <p style={s.p}>For questions regarding these Terms and Conditions, please contact:</p>
        <p style={{ ...s.p, fontWeight: 600 }}>StockLoyal, Inc. (Pending Incorporation)</p>
        <p style={s.p}>Email: legal@stockloyal.com</p>
        <p style={s.p}>Website: www.stockloyal.com</p>

        <hr style={s.divider} ref={bottomRef} />

        {/* ── Sign-off ── */}
        <div style={s.signoff}>
          By clicking "I Agree &amp; Continue" below, you acknowledge that you have read, understood,
          and agree to these Terms and Conditions.
        </div>

        {/* ── Draft Footer Banner ── */}
        <div style={{ ...s.sandboxBanner, marginTop: 0 }}>
          DRAFT — TEST ENVIRONMENT ONLY — NOT REVIEWED BY LEGAL COUNSEL<br />
          <span style={{ fontWeight: 400, fontSize: "0.82rem" }}>
            This document is a working draft for development purposes. StockLoyal is pending
            incorporation. This document must be reviewed and approved by a qualified securities
            attorney before any use in a live or production environment.
          </span>
        </div>

      </div>

      </div>{/* end scrollable */}

      {/* Action bar — sits at bottom of flex column, never scrolls away */}
      <div style={s.actions}>
        <button onClick={handleReject} style={s.btnSecondary}>No Thanks</button>
        <button onClick={handleAccept} style={s.btnPrimary}>I Agree &amp; Continue</button>
      </div>
    </div>
  );
};

export default Terms;
