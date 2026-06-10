import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { Inbox, Plus } from "lucide-react";
import { EmptyState } from "./EmptyState";

const meta = {
  component: EmptyState,
  tags: ["ai-generated", "test"],
  args: {
    icon: Inbox,
    message: "No assigned issues yet.",
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Informational: Story = {};

export const AlertTone: Story = {
  args: {
    message: "No approval history could be loaded.",
    role: "alert",
  },
};

export const WithAction: Story = {
  render: () => {
    const [created, setCreated] = useState(false);
    return (
      <EmptyState
        icon={Inbox}
        message={created ? "Draft issue created." : "No assigned issues yet."}
        action="Create issue"
        actionIcon={<Plus aria-hidden="true" className="mr-1.5 h-4 w-4" />}
        actionClassName="text-2xl font-semibold"
        onAction={() => setCreated(true)}
      />
    );
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /create issue/i }));
    await expect(canvas.getByText(/draft issue created/i)).toBeVisible();
  },
};
