import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";
import { mergeConfig } from "vite";

const storybookConfigDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(storybookConfigDir, "../..");

const config: StorybookConfig = {
  stories: [
    "../stories/**/*.stories.tsx",
    "../../src/**/*.stories.tsx",
  ],
  staticDirs: ["../../public"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "@storybook/addon-vitest"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  docs: {
    autodocs: true,
  },
  viteFinal: async (baseConfig) =>
    mergeConfig(baseConfig, {
      root: process.env.VITEST ? projectRoot : baseConfig.root,
      plugins: [tailwindcss()],
      resolve: {
        alias: {
          "@": path.resolve(projectRoot, "src"),
          lexical: path.resolve(projectRoot, "node_modules/lexical/Lexical.mjs"),
        },
      },
    }),
};

export default config;
