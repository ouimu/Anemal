// src/backend/utils/filename.ts
// Shared filename-safety control for storage-key construction (relocated
// from upload.service.ts before that file's deletion — ADR-0022 §5).
// Strips path-unsafe characters and caps length; applied by every
// key-builder (EMR attachments, pet photos) so a hostile filename can never
// become part of a filesystem path.
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
}
