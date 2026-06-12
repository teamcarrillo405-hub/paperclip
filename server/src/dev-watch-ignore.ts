import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function toGlobstarPath(candidate: string): string {
  return `${candidate.replaceAll(path.sep, "/")}/**`;
}

function addIgnorePath(target: Set<string>, candidate: string): void {
  target.add(candidate);
  target.add(toGlobstarPath(candidate));
  try {
    const realPath = fs.realpathSync(candidate);
    target.add(realPath);
    target.add(toGlobstarPath(realPath));
  } catch {
    // Ignore paths that do not exist in the current checkout.
  }
}

export function resolveServerDevWatchIgnorePaths(serverRoot: string): string[] {
  const paperclipHome = process.env.PAPERCLIP_HOME?.trim() ||
    path.join(process.env.HOME ?? process.env.USERPROFILE ?? os.homedir(), ".paperclip");
  const ignorePaths = new Set<string>([
    "**/{node_modules,bower_components,vendor}/**",
    "**/.vite-temp/**",
  ]);

  const paths = [
    "../ui/node_modules",
    "../ui/node_modules/.vite-temp",
    "../ui/.vite",
    "../ui/dist",
    // npm install during reinstall would trigger a restart mid-request
    // if tsx watch sees the new files. Exclude the managed plugins dir.
  ];
  paths.push(path.join(paperclipHome, "adapter-plugins"));

  for (const relativePath of paths) {
    addIgnorePath(ignorePaths, path.resolve(serverRoot, relativePath));
  }

  return [...ignorePaths];
}
