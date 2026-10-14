import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

// Allowed file types and their extensions
const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export function getAllowedMimeTypes() {
  return Object.keys(ALLOWED_TYPES);
}

// Save an uploaded file to /uploads/{userId}/{uuid}{ext}
// Returns the relative path stored in the DB
export async function saveUploadedFile(
  userId: string,
  fileBuffer: Buffer,
  originalFilename: string,
  mimeType: string
): Promise<{ filePath: string; docId: string }> {
  const ext = ALLOWED_TYPES[mimeType];
  if (!ext) throw new Error(`Unsupported file type: ${mimeType}`);

  const docId = uuidv4();
  const userDir = path.join(UPLOAD_ROOT, userId);

  // Create the user's folder if it doesn't exist yet
  await fs.mkdir(userDir, { recursive: true });

  const filename = `${docId}${ext}`;
  const absolutePath = path.join(userDir, filename);
  await fs.writeFile(absolutePath, fileBuffer);

  // Store relative path in DB (portable across machines)
  return { filePath: `uploads/${userId}/${filename}`, docId };
}

// Read a file back from the relative path stored in the DB
export async function readUploadedFile(filePath: string): Promise<Buffer> {
  const absolutePath = path.join(process.cwd(), filePath);
  return fs.readFile(absolutePath);
}

// Delete a file (used on document deletion)
export async function deleteUploadedFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(path.join(process.cwd(), filePath));
  } catch {
    // File already gone — not an error
  }
}

// Validate file size (returns error message or null)
export function validateFileSize(sizeBytes: number): string | null {
  const maxMB = Number(process.env.MAX_FILE_SIZE_MB ?? 20);
  if (sizeBytes > maxMB * 1024 * 1024) {
    return `File too large. Maximum size is ${maxMB}MB.`;
  }
  return null;
}
