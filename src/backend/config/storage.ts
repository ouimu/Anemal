import { S3Client } from '@aws-sdk/client-s3'

export function getStorageConfig() {
  return {
    region:    process.env.AWS_REGION             ?? '',
    bucket:    process.env.AWS_BUCKET             ?? '',
    accessKey: process.env.AWS_ACCESS_KEY_ID      ?? '',
    secretKey: process.env.AWS_SECRET_ACCESS_KEY  ?? '',
  }
}

export function isStorageConfigured(): boolean {
  const cfg = getStorageConfig()
  return !!(cfg.region && cfg.bucket && cfg.accessKey && cfg.secretKey)
}

// Lazy instantiation — no singleton so missing env vars don't crash startup.
export function createS3Client(): S3Client {
  const cfg = getStorageConfig()
  return new S3Client({
    region: cfg.region,
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
  })
}
