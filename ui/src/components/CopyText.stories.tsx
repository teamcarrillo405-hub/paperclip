import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { CopyText } from "./CopyText";

const meta = {
  component: CopyText,
  tags: ["ai-generated", "test"],
  args: {
    text: "PAP-1641",
    children: "PAP-1641",
    ariaLabel: "Copy issue key",
  },
} satisfies Meta<typeof CopyText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IssueKey: Story = {};

export const WithTitle: Story = {
  args: {
    text: "agent-codex",
    children: "CodexCoder",
    ariaLabel: "Copy agent id",
    title: "Copy agent id",
  },
};

export const ShowsCopyStatus: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /copy issue key/i }));
    await expect(canvas.getByRole("status")).toHaveTextContent(/copied|copy failed/i);
  },
};
