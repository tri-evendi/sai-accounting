import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// Allowed extensions and their expected magic bytes
const ALLOWED_FILES: Record<string, number[][]> = {
  ".jpg": [[0xff, 0xd8, 0xff]],
  ".jpeg": [[0xff, 0xd8, 0xff]],
  ".png": [[0x89, 0x50, 0x4e, 0x47]],
  ".gif": [[0x47, 0x49, 0x46, 0x38]],
  ".pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
};

function validateFileContent(buffer: Buffer, ext: string): boolean {
  const signatures = ALLOWED_FILES[ext.toLowerCase()];
  if (!signatures) return false;

  return signatures.some((sig) =>
    sig.every((byte, i) => buffer[i] === byte)
  );
}

export async function POST(request: Request) {
  const result = await requireAuth(["bos", "core"]);
  if (!result.authorized) return result.response;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const contractId = formData.get("contractId") as string | null;
  const docType = formData.get("type") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Validate file size
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 10MB" },
      { status: 400 }
    );
  }

  // Validate extension
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_FILES[ext]) {
    return NextResponse.json(
      { error: "File type not allowed. Accepted: JPG, PNG, GIF, PDF" },
      { status: 400 }
    );
  }

  // Read file bytes and validate magic bytes
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  if (!validateFileContent(buffer, ext)) {
    return NextResponse.json(
      { error: "File content does not match its extension" },
      { status: 400 }
    );
  }

  // Validate contractId exists if provided
  if (contractId) {
    const contract = await prisma.contract.findUnique({
      where: { id: parseInt(contractId) },
    });
    if (!contract) {
      return NextResponse.json(
        { error: "Referenced contract does not exist" },
        { status: 400 }
      );
    }
  }

  // Create upload directory
  await mkdir(UPLOAD_DIR, { recursive: true });

  // Generate safe filename (strip all special chars, use timestamp)
  const safeName = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);
  const timestamp = Date.now();
  const filename = `${safeName}_${timestamp}${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);

  // Prevent path traversal
  if (!filepath.startsWith(UPLOAD_DIR)) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  await writeFile(filepath, buffer);

  const document = await prisma.document.create({
    data: {
      filename: file.name,
      filepath: `/uploads/${filename}`,
      type: docType || null,
      contractId: contractId ? parseInt(contractId) : null,
    },
  });

  return NextResponse.json(document, { status: 201 });
}
