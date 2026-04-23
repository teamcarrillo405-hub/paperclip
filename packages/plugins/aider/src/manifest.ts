import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclip.aider";
export const PLUGIN_VERSION = "0.1.0";

export const TOOL_NAMES = {
  fixBug: "aider_fix_bug",
  addFeature: "aider_add_feature",
  writeTests: "aider_write_tests",
  refactorCode: "aider_refactor_code",
  createBranchAndFix: "aider_create_branch_and_fix",
  getGitDiff: "aider_get_git_diff",
  listRecentCommits: "aider_list_recent_commits",
} as const;

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Aider",
  description:
    "Self-healing coding agent that wraps the Aider (aider-chat) CLI via subprocess. Developer/power-user feature — hidden from SMB users by default.",
  author: "Avero AI",
  categories: ["automation"],
  capabilities: ["agent.tools.register", "activity.log.write"],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  tools: [
    {
      name: TOOL_NAMES.fixBug,
      displayName: "Aider: Fix Bug",
      description: "Describe a bug and the files involved; Aider produces a fix and returns the diff.",
      parametersSchema: {
        type: "object",
        properties: {
          description: { type: "string" },
          files: { type: "array", items: { type: "string" } },
        },
        required: ["description", "files"],
      },
    },
    {
      name: TOOL_NAMES.addFeature,
      displayName: "Aider: Add Feature",
      description: "Add a feature to the specified files. Returns the resulting diff.",
      parametersSchema: {
        type: "object",
        properties: {
          description: { type: "string" },
          files: { type: "array", items: { type: "string" } },
        },
        required: ["description", "files"],
      },
    },
    {
      name: TOOL_NAMES.writeTests,
      displayName: "Aider: Write Tests",
      description: "Generate tests for the specified files.",
      parametersSchema: {
        type: "object",
        properties: {
          files: { type: "array", items: { type: "string" } },
        },
        required: ["files"],
      },
    },
    {
      name: TOOL_NAMES.refactorCode,
      displayName: "Aider: Refactor Code",
      description: "Refactor the provided files per the given instructions.",
      parametersSchema: {
        type: "object",
        properties: {
          files: { type: "array", items: { type: "string" } },
          instructions: { type: "string" },
        },
        required: ["files", "instructions"],
      },
    },
    {
      name: TOOL_NAMES.createBranchAndFix,
      displayName: "Aider: Create Branch & Fix",
      description: "Create a new git branch, fix the described issue, and commit the result.",
      parametersSchema: {
        type: "object",
        properties: {
          issueDescription: { type: "string" },
          files: { type: "array", items: { type: "string" } },
        },
        required: ["issueDescription"],
      },
    },
    {
      name: TOOL_NAMES.getGitDiff,
      displayName: "Aider: Get Git Diff",
      description: "Return the current uncommitted working-tree diff (git diff HEAD).",
      parametersSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: TOOL_NAMES.listRecentCommits,
      displayName: "Aider: List Recent Commits",
      description: "List the N most recent commits (git log --oneline -n).",
      parametersSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
        },
      },
    },
  ],
};

export default manifest;
