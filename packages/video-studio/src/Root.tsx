import React from "react";
import { Composition } from "./remotion-shim.js";
import {
  WeeklyReport,
  WEEKLY_REPORT_DURATION,
  WEEKLY_REPORT_FPS,
} from "./compositions/WeeklyReport.js";
import {
  SocialPost,
  SOCIAL_POST_DURATION,
  SOCIAL_POST_FPS,
} from "./compositions/SocialPost.js";
import {
  Proposal,
  PROPOSAL_DURATION,
  PROPOSAL_FPS,
} from "./compositions/Proposal.js";
import {
  OnboardingDemo,
  ONBOARDING_DEMO_DURATION,
  ONBOARDING_DEMO_FPS,
} from "./compositions/OnboardingDemo.js";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="WeeklyReport"
        component={WeeklyReport}
        durationInFrames={WEEKLY_REPORT_DURATION}
        fps={WEEKLY_REPORT_FPS}
        width={1920}
        height={1080}
        defaultProps={{
          companyName: "Acme Co.",
          revenue: 48250,
          customers: 127,
          topMetric: "Customer retention up 12%",
          weekOf: "Apr 14, 2026",
        }}
      />
      <Composition
        id="SocialPost"
        component={SocialPost}
        durationInFrames={SOCIAL_POST_DURATION}
        fps={SOCIAL_POST_FPS}
        width={1080}
        height={1080}
        defaultProps={{
          headline: "New feature launched",
          subtext: "Faster, smarter, better.",
          ctaText: "Learn more",
          brandColor: "#2563eb",
        }}
      />
      <Composition
        id="Proposal"
        component={Proposal}
        durationInFrames={PROPOSAL_DURATION}
        fps={PROPOSAL_FPS}
        width={1920}
        height={1080}
        defaultProps={{
          companyName: "Acme Co.",
          proposalTitle: "Growth partnership",
          keyPoints: [
            "Custom AI agents tailored to your workflow",
            "24/7 automated monitoring and reporting",
            "Dedicated success team",
          ],
          price: 12500,
        }}
      />
      <Composition
        id="OnboardingDemo"
        component={OnboardingDemo}
        durationInFrames={ONBOARDING_DEMO_DURATION}
        fps={ONBOARDING_DEMO_FPS}
        width={1920}
        height={1080}
        defaultProps={{
          companyName: "Acme Co.",
          features: [
            "Connect your tools in one click",
            "Automate routine work",
            "Get weekly performance reports",
          ],
        }}
      />
    </>
  );
};

export default RemotionRoot;
