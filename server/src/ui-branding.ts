import { loadBrandConfig, type BrandConfig } from "./whitelabel-config.js";

const FAVICON_BLOCK_START = "<!-- PAPERCLIP_FAVICON_START -->";
const FAVICON_BLOCK_END = "<!-- PAPERCLIP_FAVICON_END -->";
const RUNTIME_BRANDING_BLOCK_START = "<!-- PAPERCLIP_RUNTIME_BRANDING_START -->";
const RUNTIME_BRANDING_BLOCK_END = "<!-- PAPERCLIP_RUNTIME_BRANDING_END -->";
const TITLE_BLOCK_REGEX = /<title>[^<]*<\/title>/i;
const APPLE_TITLE_REGEX = /<meta\s+name="apple-mobile-web-app-title"\s+content="[^"]*"\s*\/?>/i;

const DEFAULT_FAVICON_LINKS = [
  '<link rel="icon" href="/favicon.ico" sizes="48x48" />',
  '<link rel="icon" href="/favicon.svg" type="image/svg+xml" />',
  '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />',
  '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />',
].join("\n");

export type WorktreeUiBranding = {
  enabled: boolean;
  name: string | null;
  color: string | null;
  textColor: string | null;
  faviconHref: string | null;
};

function isTruthyEnvValue(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function nonEmpty(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeHexColor(value: string | undefined): string | null {
  const raw = nonEmpty(value);
  if (!raw) return null;
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex.split("").map((char) => `${char}${char}`).join("").toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex.toLowerCase()}`;
  }
  return null;
}

function hslComponentToHex(n: number): string {
  return Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, "0");
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = Math.max(0, Math.min(100, saturation)) / 100;
  const l = Math.max(0, Math.min(100, lightness)) / 100;
  const c = (1 - Math.abs((2 * l) - 1)) * s;
  const h = ((hue % 360) + 360) % 360;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - (c / 2);

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return `#${hslComponentToHex((r + m) * 255)}${hslComponentToHex((g + m) * 255)}${hslComponentToHex((b + m) * 255)}`;
}

function deriveColorFromSeed(seed: string): string {
  let hash = 0;
  for (const char of seed) {
    hash = ((hash * 33) + char.charCodeAt(0)) >>> 0;
  }
  return hslToHex(hash % 360, 68, 56);
}

function hexToRgb(color: string): { r: number; g: number; b: number } {
  const normalized = normalizeHexColor(color) ?? "#000000";
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function relativeLuminanceChannel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: string): number {
  const { r, g, b } = hexToRgb(color);
  return (
    (0.2126 * relativeLuminanceChannel(r)) +
    (0.7152 * relativeLuminanceChannel(g)) +
    (0.0722 * relativeLuminanceChannel(b))
  );
}

function pickReadableTextColor(background: string): string {
  const backgroundLuminance = relativeLuminance(background);
  const whiteContrast = 1.05 / (backgroundLuminance + 0.05);
  const blackContrast = (backgroundLuminance + 0.05) / 0.05;
  return whiteContrast >= blackContrast ? "#f8fafc" : "#111827";
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function createFaviconDataUrl(background: string, foreground: string): string {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">',
    `<rect width="24" height="24" rx="6" fill="${background}"/>`,
    `<path stroke="${foreground}" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.15" d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/>`,
    "</svg>",
  ].join("");
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function isWorktreeUiBrandingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthyEnvValue(env.PAPERCLIP_IN_WORKTREE);
}

export function getWorktreeUiBranding(env: NodeJS.ProcessEnv = process.env): WorktreeUiBranding {
  if (!isWorktreeUiBrandingEnabled(env)) {
    return {
      enabled: false,
      name: null,
      color: null,
      textColor: null,
      faviconHref: null,
    };
  }

  const name = nonEmpty(env.PAPERCLIP_WORKTREE_NAME) ?? nonEmpty(env.PAPERCLIP_INSTANCE_ID) ?? "worktree";
  const color = normalizeHexColor(env.PAPERCLIP_WORKTREE_COLOR) ?? deriveColorFromSeed(name);
  const textColor = pickReadableTextColor(color);

  return {
    enabled: true,
    name,
    color,
    textColor,
    faviconHref: createFaviconDataUrl(color, textColor),
  };
}

export function renderFaviconLinks(branding: WorktreeUiBranding): string {
  if (!branding.enabled || !branding.faviconHref) return DEFAULT_FAVICON_LINKS;

  const href = escapeHtmlAttribute(branding.faviconHref);
  return [
    `<link rel="icon" href="${href}" type="image/svg+xml" sizes="any" />`,
    `<link rel="shortcut icon" href="${href}" type="image/svg+xml" />`,
  ].join("\n");
}

export function renderRuntimeBrandingMeta(branding: WorktreeUiBranding): string {
  if (!branding.enabled || !branding.name || !branding.color || !branding.textColor) return "";

  return [
    '<meta name="paperclip-worktree-enabled" content="true" />',
    `<meta name="paperclip-worktree-name" content="${escapeHtmlAttribute(branding.name)}" />`,
    `<meta name="paperclip-worktree-color" content="${escapeHtmlAttribute(branding.color)}" />`,
    `<meta name="paperclip-worktree-text-color" content="${escapeHtmlAttribute(branding.textColor)}" />`,
  ].join("\n");
}

function replaceMarkedBlock(html: string, startMarker: string, endMarker: string, content: string): string {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) return html;

  const before = html.slice(0, start + startMarker.length);
  const after = html.slice(end);
  const indentedContent = content
    ? `\n${content
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n")}\n    `
    : "\n    ";
  return `${before}${indentedContent}${after}`;
}

function renderWhitelabelFaviconLinks(brand: BrandConfig): string | null {
  if (!brand.faviconPath) return null;
  const normalized = brand.faviconPath.replace(/^\.?\//, "/");
  const href = escapeHtmlAttribute(normalized.startsWith("/") ? normalized : `/${normalized}`);
  return `<link rel="icon" href="${href}" sizes="any" />`;
}

function renderWhitelabelRuntimeMeta(brand: BrandConfig): string {
  const lines: string[] = [];
  if (brand.productName) {
    lines.push(`<meta name="paperclip-brand-product-name" content="${escapeHtmlAttribute(brand.productName)}" />`);
  }
  if (brand.primaryColor) {
    lines.push(
      `<style>:root{--brand-primary:${escapeHtmlAttribute(brand.primaryColor)};--brand-accent:${escapeHtmlAttribute(brand.accentColor || brand.primaryColor)};}</style>`,
    );
  }
  return lines.join("\n");
}

function applyTitleBranding(html: string, brand: BrandConfig): string {
  if (!brand.productName) return html;
  const escaped = escapeHtmlAttribute(brand.productName);
  let out = html.replace(TITLE_BLOCK_REGEX, `<title>${escaped}</title>`);
  out = out.replace(
    APPLE_TITLE_REGEX,
    `<meta name="apple-mobile-web-app-title" content="${escaped}" />`,
  );
  return out;
}

function isWhitelabelActive(brand: BrandConfig): boolean {
  // Whitelabel injection is active when an operator has opted in by setting
  // hideOpenSourceBranding=true in their config. Absent a config file (or
  // with defaults), this stays false, preserving upstream OSS behavior.
  return brand.hideOpenSourceBranding === true;
}

export function applyUiBranding(html: string, env: NodeJS.ProcessEnv = process.env): string {
  const worktreeBranding = getWorktreeUiBranding(env);
  const brand = loadBrandConfig();
  const whitelabelActive = isWhitelabelActive(brand);

  const titled = whitelabelActive ? applyTitleBranding(html, brand) : html;

  const worktreeFavicon = renderFaviconLinks(worktreeBranding);
  const whitelabelFavicon = whitelabelActive ? renderWhitelabelFaviconLinks(brand) : null;
  const faviconContent = worktreeBranding.enabled && worktreeBranding.faviconHref
    ? worktreeFavicon
    : (whitelabelFavicon ?? worktreeFavicon);
  const withFavicon = replaceMarkedBlock(titled, FAVICON_BLOCK_START, FAVICON_BLOCK_END, faviconContent);

  const worktreeMeta = renderRuntimeBrandingMeta(worktreeBranding);
  const whitelabelMeta = whitelabelActive ? renderWhitelabelRuntimeMeta(brand) : "";
  const runtimeMeta = [whitelabelMeta, worktreeMeta].filter((part) => part.length > 0).join("\n");

  return replaceMarkedBlock(
    withFavicon,
    RUNTIME_BRANDING_BLOCK_START,
    RUNTIME_BRANDING_BLOCK_END,
    runtimeMeta,
  );
}
