import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "../remotion-shim.js";

export interface SocialPostProps {
  headline: string;
  subtext: string;
  ctaText: string;
  brandColor: string;
}

export const SOCIAL_POST_DURATION = 90;
export const SOCIAL_POST_FPS = 30;

export const SocialPost: React.FC<SocialPostProps> = ({
  headline,
  subtext,
  ctaText,
  brandColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();

  const headlineX = interpolate(frame, [0, 20], [-width, 0], {
    extrapolateRight: "clamp",
  });
  const subtextOpacity = interpolate(frame, [25, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const ctaAppearProgress = spring({
    frame: Math.max(0, frame - 55),
    fps,
    from: 0,
    to: 1,
  });
  const pulse = 1 + 0.05 * Math.sin((frame - 55) * 0.35);
  const ctaScale = frame > 70 ? pulse : ctaAppearProgress;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: brandColor || "#2563eb",
        color: "white",
        fontFamily: "system-ui, -apple-system, Inter, sans-serif",
        padding: 80,
        justifyContent: "center",
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
        gap: 32,
      }}
    >
      <div
        style={{
          transform: `translateX(${headlineX}px)`,
          fontSize: 88,
          fontWeight: 800,
          textAlign: "center",
          lineHeight: 1.05,
        }}
      >
        {headline}
      </div>

      <div
        style={{
          opacity: subtextOpacity,
          fontSize: 32,
          textAlign: "center",
          maxWidth: "80%",
        }}
      >
        {subtext}
      </div>

      <div
        style={{
          transform: `scale(${ctaScale})`,
          marginTop: 24,
          padding: "20px 40px",
          backgroundColor: "white",
          color: brandColor || "#2563eb",
          borderRadius: 999,
          fontSize: 32,
          fontWeight: 700,
        }}
      >
        {ctaText}
      </div>
    </AbsoluteFill>
  );
};

export default SocialPost;
