// whitelabel.config.ts
// Single-file branding configuration for this deployment.
// Edit the fields below to rebrand the product. The server reads this at
// startup via server/src/ui-branding.ts and exposes it to the UI through
// /api/brand. No code changes are required elsewhere.

export type BrandConfig = {
  productName: string;
  productTagline: string;
  supportEmail: string;
  docsUrl: string;
  primaryColor: string;
  accentColor: string;
  faviconPath: string;
  logoPath: string;
  companyName: string;
  hideOpenSourceBranding: boolean;
};

export const brandConfig: BrandConfig = {
  productName: "Avero AI",
  productTagline: "AI-powered business operations for small business",
  supportEmail: "support@averoai.com",
  docsUrl: "https://docs.averoai.com",
  primaryColor: "#2563eb",
  accentColor: "#16a34a",
  faviconPath: "./branding/favicon.ico",
  logoPath: "./branding/logo.svg",
  companyName: "Avero AI",
  hideOpenSourceBranding: true,
};

export default brandConfig;
