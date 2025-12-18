import React from "react";
import { useNavigate } from "react-router-dom";

const Terms = () => {
  const navigate = useNavigate();

  const handleAccept = () => {
    navigate("/election");
  };

  const handleReject = () => {
    navigate("/goodbye");
  };

  return (
    <div className="terms-container">
      <h2 className="page-title">Terms & Conditions</h2>

      <p>This application allows investments only in listed securities.</p>
      <p>
        Points awarded by merchants are converted to cash-equivalent values as
        determined by each merchant.
      </p>
      <p>
        The projected value of points can only be used to fund selected
        brokerage accounts to settle trades based on generated trade orders.
      </p>
      <p>Investing in securities is risky, and your principal is at risk.</p>
      <p>
        StockLoyal, LLC does not provide investment advice and is not a licensed
        securities dealer.
      </p>
      <p>
        Merchants are responsible for forwarding payment for settled trades
        within one day.
      </p>
      <p>
        StockLoyal, LLC will facilitate funds transfer based on available point
        value at the time of settlement.
      </p>

      <h3 className="terms-subheading">Additional Legal Disclaimers</h3>
      <p>
        Nothing in this application constitutes tax, legal, insurance, or
        investment advice. StockLoyal, LLC is not offering or soliciting the
        sale of any securities or providing personalized recommendations.
      </p>
      <p>
        Investing involves risk, including the possible loss of principal. Past
        performance is not indicative of future results.
      </p>
      <p>
        You are solely responsible for your investment decisions. Before
        investing, you should understand the risks involved and consider seeking
        professional advice.
      </p>

      <div className="terms-actions">
        <button onClick={handleAccept} className="btn-primary">
          I Agree & Continue
        </button>
        <button onClick={handleReject} className="btn-secondary">
          No Thanks
        </button>
      </div>
    </div>
  );
};

export default Terms;
