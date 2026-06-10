import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { Settings } from "lucide-react";
import { Button } from "./button";

const meta = {
  component: Button,
  tags: ["ai-generated", "test"],
  args: {
    children: "Create issue",
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    className: "text-2xl font-semibold",
  },
};

export const Secondary: Story = {
  args: {
    children: "View queue",
    variant: "secondary",
  },
};

export const IconAction: Story = {
  args: {
    children: <Settings aria-hidden="true" />,
    variant: "outline",
    size: "icon",
    "aria-label": "Open settings",
  },
  play: async ({ canvas }) => {
    const button = canvas.getByRole("button", { name: /open settings/i });
    await expect(button).toHaveAttribute("data-size", "icon");
  },
};

export const CssCheck: Story = {
  args: {
    children: "Submit",
    className: "text-2xl font-semibold",
  },
  play: async ({ canvas }) => {
    const button = canvas.getByRole("button", { name: /submit/i });
    // Button's default variant uses the global --primary token from src/index.css.
    await expect(getComputedStyle(button).backgroundColor).toBe("oklch(0.585 0.196 255)");
  },
};
