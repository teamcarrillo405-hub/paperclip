export type ImageStyle =
  | "photorealistic"
  | "illustration"
  | "logo"
  | "social-post"
  | "product"
  | "banner";

export type ImageJobStatus =
  | "pending"
  | "generating"
  | "completed"
  | "failed";

export type ImageProvider = "dalle3" | "comfyui";

export interface ImageJob {
  id: string;
  companyId: string;
  prompt: string;
  enhancedPrompt?: string | null;
  style: ImageStyle;
  width: number;
  height: number;
  status: ImageJobStatus;
  imageUrl: string | null;
  provider: ImageProvider;
  error?: string | null;
  createdAt: Date;
  completedAt?: Date | null;
}

export interface ComfyUIWorkflowNode {
  class_type: string;
  inputs: Record<string, unknown>;
}

export interface ComfyUIWorkflow {
  prompt: Record<string, ComfyUIWorkflowNode>;
  client_id?: string;
}

export interface GenerateImageOptions {
  prompt: string;
  style?: ImageStyle;
  width?: number;
  height?: number;
  negativePrompt?: string;
}
