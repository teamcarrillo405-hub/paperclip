import { promises as fs } from "node:fs";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

export type S3BackupConfig = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix?: string;
  retentionDays?: number;
};

export function getS3BackupConfig(): S3BackupConfig | null {
  const bucket = process.env.S3_BACKUP_BUCKET?.trim();
  const region = process.env.S3_BACKUP_REGION?.trim();
  const accessKeyId = process.env.S3_BACKUP_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_BACKUP_SECRET_ACCESS_KEY?.trim();

  if (!bucket || !region || !accessKeyId || !secretAccessKey) return null;

  const prefix = process.env.S3_BACKUP_PREFIX?.trim();
  const retentionRaw = process.env.S3_BACKUP_RETENTION_DAYS?.trim();
  const retentionDays = retentionRaw ? parseInt(retentionRaw, 10) : undefined;

  return {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    ...(prefix !== undefined ? { prefix } : {}),
    ...(retentionDays !== undefined && !isNaN(retentionDays) ? { retentionDays } : {}),
  };
}

function makeS3Client(config: S3BackupConfig): S3Client {
  return new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function buildS3Key(config: S3BackupConfig, filename: string): string {
  const prefix = config.prefix ?? "";
  const datePart = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${prefix}${datePart}/${filename}`;
}

export async function uploadBackupToS3(
  localFilePath: string,
  config: S3BackupConfig,
): Promise<{ s3Key: string; url: string }> {
  const filename = path.basename(localFilePath);
  const s3Key = buildS3Key(config, filename);

  const fileBuffer = await fs.readFile(localFilePath);

  const client = makeS3Client(config);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: s3Key,
      Body: fileBuffer,
    }),
  );

  const url = `https://${config.bucket}.s3.${config.region}.amazonaws.com/${s3Key}`;
  return { s3Key, url };
}

export async function listRemoteBackups(
  config: S3BackupConfig,
): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
  const client = makeS3Client(config);
  const results: Array<{ key: string; size: number; lastModified: Date }> = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: config.prefix ?? "",
        ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
      }),
    );

    for (const obj of response.Contents ?? []) {
      if (obj.Key && obj.Size !== undefined && obj.LastModified) {
        results.push({
          key: obj.Key,
          size: obj.Size,
          lastModified: obj.LastModified,
        });
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return results;
}

export async function deleteOldRemoteBackups(config: S3BackupConfig): Promise<number> {
  const retentionDays = config.retentionDays ?? 30;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const all = await listRemoteBackups(config);
  const toDelete = all.filter((obj) => obj.lastModified < cutoff);

  if (toDelete.length === 0) return 0;

  const client = makeS3Client(config);
  await client.send(
    new DeleteObjectsCommand({
      Bucket: config.bucket,
      Delete: {
        Objects: toDelete.map((obj) => ({ Key: obj.key })),
        Quiet: true,
      },
    }),
  );

  return toDelete.length;
}

export async function syncBackupToS3(
  localFilePath: string,
): Promise<{ uploaded: boolean; reason?: string; s3Key?: string }> {
  const config = getS3BackupConfig();
  if (!config) {
    return { uploaded: false, reason: "S3 not configured" };
  }

  const { s3Key } = await uploadBackupToS3(localFilePath, config);
  await deleteOldRemoteBackups(config);

  return { uploaded: true, s3Key };
}
