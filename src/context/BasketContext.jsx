import React, { createContext, useContext, useState } from "react";

const BasketContext = createContext();

export function BasketProvider({ children }) {
  const [basket, setBasket] = useState([]);

  const addToBasket = (stock) => {
    setBasket((prev) => {
      if (prev.find((s) => s.symbol === stock.symbol)) return prev; // avoid duplicates
      return [...prev, stock];
    });
  };

  const removeFromBasket = (symbol) => {
    setBasket((prev) => prev.filter((s) => s.symbol !== symbol));
  };

  const clearBasket = () => setBasket([]);

  return (
    <BasketContext.Provider
      value={{ basket, addToBasket, removeFromBasket, clearBasket }}
    >
      {children}
    </BasketContext.Provider>
  );
}

export function useBasket() {
  return useContext(BasketContext);
}
