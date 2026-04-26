// Register in server/src/app.ts:
// import { backupS3Routes } from "./routes/backup-s3.js";
// api.use(backupS3Routes());

import { Router } from "express";
import { assertInstanceAdmin } from "./authz.js";
import {
  getS3BackupConfig,
  listRemoteBackups,
  uploadBackupToS3,
  deleteOldRemoteBackups,
} from "../services/s3-backup.js";

export function backupS3Routes() {
  const router = Router();

  router.get("/instance/backup-s3/config", (req, res) => {
    assertInstanceAdmin(req);
    const config = getS3BackupConfig();
    if (!config) {
      res.json({ connected: false });
      return;
    }
    res.json({
      connected: true,
      bucket: config.bucket,
      region: config.region,
      prefix: config.prefix ?? null,
      retentionDays: config.retentionDays ?? null,
    });
  });

  router.get("/instance/backup-s3/list", async (req, res) => {
    assertInstanceAdmin(req);
    const config = getS3BackupConfig();
    if (!config) {
      res.status(400).json({ error: "S3 not configured" });
      return;
    }
    const backups = await listRemoteBackups(config);
    res.json({ backups });
  });

  router.post("/instance/backup-s3/sync", async (req, res) => {
    assertInstanceAdmin(req);
    const { localFilePath } = req.body as { localFilePath?: string };
    if (!localFilePath || typeof localFilePath !== "string") {
      res.status(400).json({ error: "localFilePath is required" });
      return;
    }
    const config = getS3BackupConfig();
    if (!config) {
      res.status(400).json({ error: "S3 not configured" });
      return;
    }
    const result = await uploadBackupToS3(localFilePath, config);
    res.status(201).json(result);
  });

  router.delete("/instance/backup-s3/prune", async (req, res) => {
    assertInstanceAdmin(req);
    const config = getS3BackupConfig();
    if (!config) {
      res.status(400).json({ error: "S3 not configured" });
      return;
    }
    const deleted = await deleteOldRemoteBackups(config);
    res.json({ deleted });
  });

  return router;
}
