import type { CompanyStatus, PauseReason } from "../constants.js";

export interface CompanyBusinessProfile {
  businessName?: string;
  industry?: string;
  revenueRange?: string;
  biggestPainPoint?: string;
  templateId?: string;
  [key: string]: unknown;
}

export interface Company {
  id: string;
  name: string;
  description: string | null;
  status: CompanyStatus;
  pauseReason: PauseReason | null;
  pausedAt: Date | null;
  issuePrefix: string;
  issueCounter: number;
  budgetMonthlyCents: number;
  spentMonthlyCents: number;
  requireBoardApprovalForNewAgents: boolean;
  feedbackDataSharingEnabled: boolean;
  feedbackDataSharingConsentAt: Date | null;
  feedbackDataSharingConsentByUserId: string | null;
  feedbackDataSharingTermsVersion: string | null;
  brandColor: string | null;
  logoAssetId: string | null;
  logoUrl: string | null;
  onboardingCompleted: boolean;
  onboardingStep: number;
  businessProfile: CompanyBusinessProfile | null;
  createdAt: Date;
  updatedAt: Date;
}
