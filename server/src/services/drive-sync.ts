import fs from "node:fs";
import path from "node:path";
import type { Db } from "@paperclipai/db";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

const PORT = process.env.PORT ?? "3100";
const BASE = `http://localhost:${PORT}/api`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DriveSyncConfig = {
  companyId: string;
  folderId?: string;
  mimeTypeFilter?: string;
  lastSyncAt?: string;
};

export type DriveSyncResult = {
  synced: number;
  skipped: number;
  errors: number;
  documents: Array<{ fileId: string; name: string; status: "synced" | "skipped" | "error" }>;
};

type DriveFile = {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
};

type DriveFilesResponse =
  | DriveFile[]
  | { files?: DriveFile[]; items?: DriveFile[] };

type DriveFileContentResponse = {
  content?: string;
  text?: string;
  body?: string;
};

type IngestResponse = {
  id?: string;
  title?: string;
};

type DriveUploadResponse = {
  fileId?: string;
  id?: string;
  url?: string;
  webViewLink?: string;
};

// ---------------------------------------------------------------------------
// Config persistence
// ---------------------------------------------------------------------------

function resolveConfigFilePath(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "drive-sync-configs.json");
}

function loadAllConfigs(): Record<string, DriveSyncConfig> {
  const filePath = resolveConfigFilePath();
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as Record<string, DriveSyncConfig>;
  } catch {
    return {};
  }
}

function persistAllConfigs(configs: Record<string, DriveSyncConfig>): void {
  const filePath = resolveConfigFilePath();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(configs, null, 2), "utf8");
}

export function getDriveSyncConfig(companyId: string): DriveSyncConfig | null {
  const all = loadAllConfigs();
  return all[companyId] ?? null;
}

export function saveDriveSyncConfig(companyId: string, config: DriveSyncConfig): void {
  const all = loadAllConfigs();
  all[companyId] = { ...config, companyId };
  persistAllConfigs(all);
}

// ---------------------------------------------------------------------------
// Core sync logic
// ---------------------------------------------------------------------------

/**
 * List Drive files and ingest each one into the knowledge base.
 * Skips files whose content cannot be fetched (e.g. binary files).
 */
export async function runDriveSync(params: {
  companyId: string;
  db: Db;
}): Promise<DriveSyncResult> {
  const { companyId } = params;

  const config = getDriveSyncConfig(companyId) ?? { companyId };
  const mimeType =
    config.mimeTypeFilter ?? "application/vnd.google-apps.document";

  // Build the files list URL
  const filesUrl = new URL(`${BASE}/google/drive/files`);
  filesUrl.searchParams.set("companyId", companyId);
  filesUrl.searchParams.set("mimeType", mimeType);
  filesUrl.searchParams.set("maxResults", "50");
  if (config.folderId) {
    filesUrl.searchParams.set("folderId", config.folderId);
  }

  const filesRes = await fetch(filesUrl.toString());
  if (!filesRes.ok) {
    throw new Error(
      `Drive files list failed: ${filesRes.status} ${await filesRes.text()}`,
    );
  }

  const filesData = (await filesRes.json()) as DriveFilesResponse;
  const fileList: DriveFile[] = Array.isArray(filesData)
    ? filesData
    : (filesData.files ?? filesData.items ?? []);

  let synced = 0;
  let skipped = 0;
  let errors = 0;
  const documents: DriveSyncResult["documents"] = [];

  for (const file of fileList) {
    const fileId = file.id;
    const fileName = file.name ?? fileId;

    try {
      // Fetch file content
      const contentRes = await fetch(
        `${BASE}/google/drive/files/${encodeURIComponent(fileId)}/content?companyId=${encodeURIComponent(companyId)}`,
      );

      if (!contentRes.ok) {
        skipped += 1;
        documents.push({ fileId, name: fileName, status: "skipped" });
        continue;
      }

      const contentData = (await contentRes.json()) as DriveFileContentResponse;
      const content = contentData.content ?? contentData.text ?? contentData.body ?? "";

      if (!content.trim()) {
        skipped += 1;
        documents.push({ fileId, name: fileName, status: "skipped" });
        continue;
      }

      // Ingest into knowledge base
      const ingestRes = await fetch(`${BASE}/knowledge/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          title: fileName,
          content,
          source: "google-drive",
          docType: "document",
        }),
      });

      if (ingestRes.ok) {
        // Verify the response is well-formed (non-empty body)
        const _ingested = (await ingestRes.json()) as IngestResponse;
        void _ingested;
        synced += 1;
        documents.push({ fileId, name: fileName, status: "synced" });
      } else {
        errors += 1;
        documents.push({ fileId, name: fileName, status: "error" });
      }
    } catch {
      errors += 1;
      documents.push({ fileId, name: fileName, status: "error" });
    }
  }

  // Update lastSyncAt
  saveDriveSyncConfig(companyId, { ...config, lastSyncAt: new Date().toISOString() });

  return { synced, skipped, errors, documents };
}

// ---------------------------------------------------------------------------
// Auto-file to Drive
// ---------------------------------------------------------------------------

/**
 * Upload a document to a structured Avero Enterprise folder on Drive.
 * Folder path: Avero Enterprise / {docType} / {fileName}
 */
export async function autoFileToDrive(params: {
  companyId: string;
  content: string;
  fileName: string;
  docType: string;
  db: Db;
}): Promise<{ fileId: string; url: string }> {
  const { companyId, content, fileName, docType } = params;

  const uploadRes = await fetch(`${BASE}/google/drive/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyId,
      content,
      fileName,
      folderPath: `Avero Enterprise/${docType}`,
      mimeType: "text/plain",
    }),
  });

  if (!uploadRes.ok) {
    throw new Error(
      `Drive upload failed: ${uploadRes.status} ${await uploadRes.text()}`,
    );
  }

  const uploadData = (await uploadRes.json()) as DriveUploadResponse;
  const fileId = uploadData.fileId ?? uploadData.id ?? "";
  const url = uploadData.url ?? uploadData.webViewLink ?? "";

  if (!fileId) {
    throw new Error("Drive upload did not return a fileId");
  }

  return { fileId, url };
}
