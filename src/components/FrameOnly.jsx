import React from "react";
import { Outlet } from "react-router-dom";

export default function FrameOnly() {
  return (
    <div className="relative flex flex-col h-[100dvh] overflow-y-auto">
      <Outlet />
    </div>
  );
}
