import { useEffect, useState, type ReactNode } from "react";
import type { Preview } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MockDate from "mockdate";
import { initialize, mswLoader } from "msw-storybook-addon";
import { MemoryRouter } from "@/lib/router";
import { BreadcrumbProvider } from "@/context/BreadcrumbContext";
import { CompanyProvider } from "@/context/CompanyContext";
import { DialogProvider } from "@/context/DialogContext";
import { EditorAutocompleteProvider } from "@/context/EditorAutocompleteContext";
import { PanelProvider } from "@/context/PanelContext";
import { SidebarProvider } from "@/context/SidebarContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ToastProvider } from "@/context/ToastContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { mswHandlers } from "./msw-handlers";
import "@mdxeditor/editor/style.css";
import "./tailwind-entry.css";
import "./styles.css";

initialize({ onUnhandledRequest: "bypass" });

function applyStorybookTheme(theme: "light" | "dark") {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

function StorybookProviders({
  children,
  theme,
}: {
  children: ReactNode;
  theme: "light" | "dark";
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: Number.POSITIVE_INFINITY,
          },
        },
      }),
  );

  useEffect(() => {
    applyStorybookTheme(theme);
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MemoryRouter initialEntries={["/PAP/storybook"]}>
          <CompanyProvider>
            <EditorAutocompleteProvider>
              <ToastProvider>
                <TooltipProvider>
                  <BreadcrumbProvider>
                    <SidebarProvider>
                      <PanelProvider>
                        <DialogProvider>{children}</DialogProvider>
                      </PanelProvider>
                    </SidebarProvider>
                  </BreadcrumbProvider>
                </TooltipProvider>
              </ToastProvider>
            </EditorAutocompleteProvider>
          </CompanyProvider>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const preview: Preview = {
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme === "light" ? "light" : "dark";
      return (
        <StorybookProviders key={theme} theme={theme}>
          <Story />
        </StorybookProviders>
      );
    },
  ],
  loaders: [mswLoader],
  globalTypes: {
    theme: {
      description: "Paperclip color mode",
      defaultValue: "dark",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "dark", title: "Dark" },
          { value: "light", title: "Light" },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    msw: {
      handlers: mswHandlers,
    },
    a11y: {
      test: "error",
    },
    backgrounds: {
      disable: true,
    },
    controls: {
      expanded: true,
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: {
      toc: true,
    },
    layout: "fullscreen",
    viewport: {
      viewports: {
        mobile: {
          name: "Mobile",
          styles: { width: "390px", height: "844px" },
        },
        tablet: {
          name: "Tablet",
          styles: { width: "834px", height: "1112px" },
        },
        desktop: {
          name: "Desktop",
          styles: { width: "1440px", height: "960px" },
        },
      },
    },
  },
  async beforeEach() {
    window.localStorage.setItem("paperclip.theme", "dark");
    MockDate.set("2026-04-20T12:00:00Z");
  },
};

export default preview;
