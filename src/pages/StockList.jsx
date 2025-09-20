// src/pages/StockList.jsx
import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useBasket } from "../context/BasketContext";

export default function StockList() {
  const navigate = useNavigate();
  const location = useLocation();

  // ✅ Pull everything passed from StockCategories
  const { category, results = [], error, amount, pointsUsed, memberId } = location.state || {};

  const { addToBasket } = useBasket();
  const [selectedStocks, setSelectedStocks] = useState([]);

  const toggleSelect = (symbol) => {
    setSelectedStocks((prev) =>
      prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol]
    );
  };

  const handleContinue = () => {
    if (selectedStocks.length === 0) {
      alert("Please select at least one stock to continue.");
      return;
    }

    // ✅ Add selected stocks to basket context
    results
      .filter((stock) => selectedStocks.includes(stock.symbol))
      .forEach((stock) => addToBasket(stock));

    // ✅ Pass amount + pointsUsed forward to Basket
    navigate("/basket", {
      state: { category, amount, pointsUsed, memberId },
    });
  };

  return (
    <div className="stocklist-container">
      <h2 className="stocklist-heading">
        {category ? `${category} Stocks` : "Stocks"}
      </h2>

      {error && <p className="stocklist-error">{error}</p>}

      {!error && results.length === 0 && (
        <p className="stocklist-empty">No stocks found.</p>
      )}

      {results.length > 0 && (
        <div className="stocklist-table-wrapper">
          <table className="stocklist-table">
            <thead>
              <tr>
                <th>Select</th>
                <th>Symbol</th>
                <th>Name</th>
                <th>Price</th>
                <th>Change %</th>
              </tr>
            </thead>
            <tbody>
              {results.map((stock) => (
                <tr key={stock.symbol}>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      checked={selectedStocks.includes(stock.symbol)}
                      onChange={() => toggleSelect(stock.symbol)}
                    />
                  </td>
                  <td className="symbol">{stock.symbol}</td>
                  <td className="text-left">{stock.name || "-"}</td>
                  <td>${stock.price?.toFixed(2) ?? "N/A"}</td>
                  <td
                    className={
                      stock.change > 0
                        ? "change-positive"
                        : stock.change < 0
                        ? "change-negative"
                        : "change-neutral"
                    }
                  >
                    {stock.change?.toFixed(2) ?? "0.00"}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="stocklist-actions">
        <button type="button" onClick={handleContinue} className="btn-primary">
          Continue with Selected
        </button>

        <button type="button" onClick={() => navigate(-1)} className="btn-secondary">
          Back
        </button>
      </div>
    </div>
  );
}
