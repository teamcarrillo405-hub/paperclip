import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { ModeBadge } from "./ModeBadge";

const meta = {
  component: ModeBadge,
  tags: ["ai-generated", "test"],
  args: {
    deploymentMode: "local_trusted",
  },
} satisfies Meta<typeof ModeBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LocalTrusted: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/local trusted/i)).toBeVisible();
  },
};

export const AuthenticatedPrivate: Story = {
  args: {
    deploymentMode: "authenticated",
    deploymentExposure: "private",
  },
};

export const HiddenWithoutMode: Story = {
  args: {
    deploymentMode: undefined,
  },
};
