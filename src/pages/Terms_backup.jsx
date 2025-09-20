// src/pages/Terms.jsx

import React from "react";
import { useNavigate } from "react-router-dom";

const Terms = () => {
  const navigate = useNavigate();

  const handleAccept = () => {
    navigate("/select-broker");
  };

  const handleReject = () => {
    navigate("/goodbye");
  };

  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">
      <h2 className="text-2xl font-semibold text-center">Terms & Conditions</h2>
      
      <p>This application allows investments only in listed securities.</p>
      <p>Points awarded by merchants are converted to cash‑equivalent values as determined by each merchant.</p>
      <p>The projected value of points can only be used to fund selected brokerage accounts to settle trades based on generated trade orders.</p>
      <p>Investing in securities is risky, and your principal is at risk.</p>
      <p>StockLoyal, LLC does not provide investment advice and is not a licensed securities dealer.</p>
      <p>Merchants are responsible for forwarding payment for settled trades within one day.</p>
      <p>StockLoyal, LLC will facilitate funds transfer based on available point value at the time of settlement.</p>
      
      <h3 className="text-xl font-medium">Additional Legal Disclaimers</h3>
      <p>
        Nothing in this application constitutes tax, legal, insurance, or investment advice. StockLoyal, LLC is not offering or soliciting the sale of any securities or providing personalized recommendations.
      </p>
      <p>
        Investing involves risk, including the possible loss of principal. Past performance is not indicative of future results.
      </p>
      <p>
        You are solely responsible for your investment decisions. Before investing, you should understand the risks involved and consider seeking professional advice.
      </p>
      
      <div className="flex justify-center space-x-4 mt-6">
        <button
          onClick={handleAccept}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          I Agree & Continue
        </button>
        <button
          onClick={handleReject}
          className="px-6 py-3 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400"
        >
          No Thanks
        </button>
      </div>
    </div>
  );
};

export default Terms;
