import React from "react";
import { Outlet } from "react-router-dom";

export default function FrameOnly() {
  return (
    <div className="iphone-frame">
      <div className="iphone-content">
        {/* The child route will render here */}
        <Outlet />
      </div>
    </div>
  );
}
