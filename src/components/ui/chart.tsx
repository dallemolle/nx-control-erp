"use client";

import { ResponsiveContainer } from "recharts";
import type { ReactElement } from "react";

export function ChartContainer({
  children,
  className = "h-64 w-full",
}: {
  children: ReactElement;
  className?: string;
}) {
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}
