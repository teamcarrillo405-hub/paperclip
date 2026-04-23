import { useContext } from "react";
import { BrandContext, type BrandConfig } from "@/context/BrandContext";

export function useBrand(): BrandConfig {
  return useContext(BrandContext);
}
