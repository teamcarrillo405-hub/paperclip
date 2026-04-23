import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "../remotion-shim.js";

export interface OnboardingDemoProps {
  companyName: string;
  features: string[];
}

export const ONBOARDING_DEMO_DURATION = 180;
export const ONBOARDING_DEMO_FPS = 30;

export const OnboardingDemo: React.FC<OnboardingDemoProps> = ({
  companyName,
  features,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const welcomeOpacity = interpolate(frame, [0, 15, 55, 70], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const welcomeScale = spring({ frame, fps, from: 0.8, to: 1 });

  const featuresStart = 70;
  const perFeature = 22;
  const showFeatures = frame >= featuresStart;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#f8fafc",
        color: "#0f172a",
        fontFamily: "system-ui, -apple-system, Inter, sans-serif",
        padding: 100,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      {frame < 75 && (
        <div
          style={{
            opacity: welcomeOpacity,
            transform: `scale(${welcomeScale})`,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 36, color: "#64748b" }}>Welcome to</div>
          <h1
            style={{
              fontSize: 112,
              fontWeight: 800,
              margin: "16px 0 0 0",
              color: "#2563eb",
            }}
          >
            {companyName}
          </h1>
          <div style={{ fontSize: 28, marginTop: 24, color: "#64748b" }}>
            Let us show you around.
          </div>
        </div>
      )}

      {showFeatures && (
        <div>
          <h2 style={{ fontSize: 48, fontWeight: 700, marginBottom: 40 }}>
            Here's what you can do
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {features.slice(0, 5).map((feature, i) => {
              const start = featuresStart + i * perFeature;
              const opacity = interpolate(frame, [start, start + 12], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const translateX = interpolate(frame, [start, start + 12], [-40, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return (
                <div
                  key={i}
                  style={{
                    opacity,
                    transform: `translateX(${translateX}px)`,
                    fontSize: 36,
                    display: "flex",
                    alignItems: "center",
                    gap: 20,
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      backgroundColor: "#16a34a",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                    }}
                  >
                    {i + 1}
                  </div>
                  <span>{feature}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

export default OnboardingDemo;
