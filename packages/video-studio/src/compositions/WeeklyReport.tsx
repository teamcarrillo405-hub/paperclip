import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "../remotion-shim.js";

export interface WeeklyReportProps {
  companyName: string;
  revenue: number;
  customers: number;
  topMetric: string;
  weekOf: string;
}

export const WEEKLY_REPORT_DURATION = 150;
export const WEEKLY_REPORT_FPS = 30;

export const WeeklyReport: React.FC<WeeklyReportProps> = ({
  companyName,
  revenue,
  customers,
  topMetric,
  weekOf,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
  const titleScale = spring({ frame, fps, from: 0.8, to: 1 });

  const metricsProgress = interpolate(frame, [30, 90], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const revenueDisplay = Math.round(revenue * metricsProgress);
  const customersDisplay = Math.round(customers * metricsProgress);

  const footerOpacity = interpolate(frame, [90, 150], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#2563eb",
        color: "white",
        fontFamily: "system-ui, -apple-system, Inter, sans-serif",
        padding: 80,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          opacity: titleOpacity,
          transform: `scale(${titleScale})`,
        }}
      >
        <div style={{ fontSize: 32, opacity: 0.8 }}>Weekly Report</div>
        <h1 style={{ fontSize: 96, margin: 0, fontWeight: 800 }}>{companyName}</h1>
      </div>

      <div style={{ opacity: metricsProgress }}>
        <div style={{ display: "flex", gap: 80 }}>
          <div>
            <div style={{ fontSize: 24, opacity: 0.7 }}>Revenue</div>
            <div style={{ fontSize: 84, fontWeight: 700 }}>
              ${revenueDisplay.toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 24, opacity: 0.7 }}>Customers</div>
            <div style={{ fontSize: 84, fontWeight: 700 }}>{customersDisplay}</div>
          </div>
        </div>
        <div style={{ marginTop: 24, fontSize: 28, opacity: 0.9 }}>
          Top metric: {topMetric}
        </div>
      </div>

      <div style={{ opacity: footerOpacity, fontSize: 24 }}>
        <div>Week of {weekOf}</div>
        <div style={{ marginTop: 8, opacity: 0.7 }}>Powered by Avero AI</div>
      </div>
    </AbsoluteFill>
  );
};

export default WeeklyReport;
