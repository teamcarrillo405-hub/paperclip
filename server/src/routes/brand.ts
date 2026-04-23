import { Router } from "express";
import { loadBrandConfig } from "../whitelabel-config.js";

export function brandRoutes() {
  const router = Router();

  router.get("/", (_req, res) => {
    const brand = loadBrandConfig();
    res.json({
      productName: brand.productName,
      productTagline: brand.productTagline,
      supportEmail: brand.supportEmail,
      docsUrl: brand.docsUrl,
      primaryColor: brand.primaryColor,
      accentColor: brand.accentColor,
      faviconPath: brand.faviconPath,
      logoPath: brand.logoPath,
      companyName: brand.companyName,
      hideOpenSourceBranding: brand.hideOpenSourceBranding,
    });
  });

  return router;
}
