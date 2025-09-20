// src/context/BrokerContext.jsx
import React, { createContext, useContext, useState } from "react";

const BrokerContext = createContext();

export function BrokerProvider({ children }) {
  const [broker, setBroker] = useState(() => {
    // ✅ Load initial broker from localStorage (if exists)
    return localStorage.getItem("broker") || null;
  });

  // ✅ Use this everywhere instead of setBroker
  const updateBroker = (newBroker) => {
    setBroker(newBroker);
    if (newBroker) {
      localStorage.setItem("broker", newBroker); // persist
    } else {
      localStorage.removeItem("broker"); // clear if null
    }
  };

  return (
    <BrokerContext.Provider value={{ broker, updateBroker }}>
      {children}
    </BrokerContext.Provider>
  );
}

export function useBroker() {
  return useContext(BrokerContext);
}
