import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
} from "../remotion-shim.js";

export interface ProposalProps {
  companyName: string;
  proposalTitle: string;
  keyPoints: string[];
  price: number;
}

export const PROPOSAL_DURATION = 300;
export const PROPOSAL_FPS = 30;

export const Proposal: React.FC<ProposalProps> = ({
  companyName,
  proposalTitle,
  keyPoints,
  price,
}) => {
  const frame = useCurrentFrame();

  // Title card: 0-75
  const titleOpacity = interpolate(frame, [0, 20, 65, 80], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Bullet points: 80-220, each bullet gets 40 frames offset
  const bulletStart = 80;
  const bulletDuration = 40;

  // Pricing slide: 220-300
  const priceOpacity = interpolate(frame, [220, 240], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const showTitle = frame < 85;
  const showBullets = frame >= 80 && frame < 225;
  const showPrice = frame >= 220;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0f172a",
        color: "white",
        fontFamily: "system-ui, -apple-system, Inter, sans-serif",
        padding: 100,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {showTitle && (
        <div style={{ opacity: titleOpacity }}>
          <div style={{ fontSize: 28, color: "#60a5fa", fontWeight: 600 }}>
            {companyName}
          </div>
          <h1 style={{ fontSize: 96, fontWeight: 800, margin: "24px 0 0 0" }}>
            {proposalTitle}
          </h1>
        </div>
      )}

      {showBullets && (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          <h2 style={{ fontSize: 40, color: "#60a5fa", marginBottom: 24 }}>
            Key Points
          </h2>
          {keyPoints.slice(0, 3).map((point, i) => {
            const start = bulletStart + i * bulletDuration;
            const opacity = interpolate(frame, [start, start + 15], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const translateY = interpolate(frame, [start, start + 15], [20, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={i}
                style={{
                  opacity,
                  transform: `translateY(${translateY}px)`,
                  fontSize: 44,
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                }}
              >
                <span style={{ color: "#16a34a", fontWeight: 800 }}>✓</span>
                <span>{point}</span>
              </div>
            );
          })}
        </div>
      )}

      {showPrice && (
        <div
          style={{
            opacity: priceOpacity,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 36, color: "#94a3b8" }}>Investment</div>
          <div style={{ fontSize: 140, fontWeight: 800, color: "#16a34a" }}>
            ${price.toLocaleString()}
          </div>
          <div style={{ fontSize: 28, color: "#94a3b8", marginTop: 16 }}>
            Prepared by {companyName}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

export default Proposal;
