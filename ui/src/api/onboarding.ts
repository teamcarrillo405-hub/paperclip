import { api } from "./client";

export interface OnboardingBusinessProfile {
  businessName?: string;
  industry?: string;
  revenueRange?: string;
  biggestPainPoint?: string;
  templateId?: string;
  [key: string]: unknown;
}

export interface OnboardingStatus {
  companyId: string;
  onboardingCompleted: boolean;
  onboardingStep: number;
  businessProfile: OnboardingBusinessProfile | null;
}

export interface OnboardingRecommendation {
  templateId: string;
  template: {
    id: string;
    name: string;
    description: string;
    industry: string;
    icon: string;
    agentCount: number;
    routineCount: number;
  } | null;
}

export interface OnboardingStepBody {
  step: number;
  companyId?: string;
  data?: {
    businessProfile?: OnboardingBusinessProfile;
    templateId?: string;
    selectedAgents?: string[];
    selectedRoutines?: string[];
    [key: string]: unknown;
  };
}

export const onboardingApi = {
  status: (companyId: string) =>
    api.get<OnboardingStatus>(`/onboarding/status?companyId=${encodeURIComponent(companyId)}`),
  saveStep: (body: OnboardingStepBody) => api.post<OnboardingStatus>("/onboarding/step", body),
  complete: (companyId: string) =>
    api.post<{ companyId: string; onboardingCompleted: boolean }>("/onboarding/complete", {
      companyId,
    }),
  recommendation: (companyId: string) =>
    api.get<OnboardingRecommendation>(
      `/onboarding/recommendation?companyId=${encodeURIComponent(companyId)}`,
    ),
};
