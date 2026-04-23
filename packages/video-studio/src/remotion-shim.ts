/**
 * Thin shim that re-exports Remotion APIs if installed, otherwise
 * provides minimal no-op stand-ins so compositions still typecheck.
 *
 * This lets the video-studio package build inside environments where
 * Remotion isn't installed (placeholder fallback path is used at runtime).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

type RemotionModule = {
  useCurrentFrame: () => number;
  useVideoConfig: () => { fps: number; width: number; height: number; durationInFrames: number };
  interpolate: (input: number, inputRange: number[], outputRange: number[], options?: any) => number;
  spring: (config: { frame: number; fps: number; config?: any; from?: number; to?: number }) => number;
  Composition: any;
  AbsoluteFill: any;
  Sequence: any;
  Easing?: any;
};

let remotion: RemotionModule;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  remotion = require("remotion") as RemotionModule;
} catch {
  remotion = {
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 150 }),
    interpolate: (_i: number, _ir: number[], or: number[]) => or[0] ?? 0,
    spring: (c: { from?: number; to?: number }) => c.to ?? 1,
    Composition: (_props: any) => null,
    AbsoluteFill: ((p: any) => p?.children ?? null) as any,
    Sequence: ((p: any) => p?.children ?? null) as any,
    Easing: { inOut: (_f: any) => (v: number) => v, ease: (v: number) => v },
  };
}

export const useCurrentFrame = remotion.useCurrentFrame;
export const useVideoConfig = remotion.useVideoConfig;
export const interpolate = remotion.interpolate;
export const spring = remotion.spring;
export const Composition = remotion.Composition;
export const AbsoluteFill = remotion.AbsoluteFill;
export const Sequence = remotion.Sequence;
export const Easing = remotion.Easing;
