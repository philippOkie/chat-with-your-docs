import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { env } from "@/server/config/env";
import { AppError } from "@/server/domain/errors";

const STORAGE_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:pdf|txt|md|markdown)$/i;

function getStoragePath(storageKey: string): string {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) {
    throw new AppError({
      code: "STORAGE_ERROR",
      message: "The stored document path is invalid.",
    });
  }

  return resolve(env.STORAGE_DIR, storageKey);
}

export async function writeDocumentFile(
  storageKey: string,
  bytes: Buffer,
): Promise<void> {
  try {
    await mkdir(resolve(env.STORAGE_DIR), { recursive: true });
    await writeFile(getStoragePath(storageKey), bytes, { flag: "wx" });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError({
      cause: error,
      code: "STORAGE_ERROR",
      message: "The document could not be stored.",
      retryable: true,
    });
  }
}

export async function readDocumentFile(storageKey: string): Promise<Buffer> {
  try {
    return await readFile(getStoragePath(storageKey));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError({
      cause: error,
      code: "STORAGE_ERROR",
      message: "The stored document could not be read.",
    });
  }
}

export async function deleteDocumentFile(storageKey: string): Promise<void> {
  try {
    await unlink(getStoragePath(storageKey));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
