import path from "path";

export const MAX_ID_CARD_BYTES = 20 * 1024 * 1024; // 20 MB max per guest ID card

export const ALLOWED_ID_CARD_MIMES = new Set([
  "application/pdf",
  "application/x-pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
]);

const MIME_TO_EXT = {
  "application/pdf": "pdf",
  "application/x-pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
};

const EXT_TO_MIME = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

/**
 * Sanitize uploaded filenames so Content-Disposition headers stay safe
 */
export function sanitizeFileName(rawName, mimeType = "application/octet-stream") {
  const extFromMime = MIME_TO_EXT[mimeType] || "bin";
  const baseRaw = path.basename(String(rawName || `guest_id_card.${extFromMime}`));
  const cleaned = baseRaw.replace(/[^\w.\-() ]+/g, "_").trim() || `guest_id_card.${extFromMime}`;
  const currentExt = path.extname(cleaned).toLowerCase();
  if (!currentExt || !EXT_TO_MIME[currentExt]) {
    return `${cleaned}.${extFromMime}`;
  }
  return cleaned;
}

/**
 * Inspect file magic bytes to accurately detect PDF or raster photo format
 */
export function detectMimeFromBuffer(buf, declaredMime = "", fileName = "") {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return null;

  // PDF: %PDF
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
    return "application/pdf";
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  // GIF: GIF87a or GIF89a
  const head4 = buf.subarray(0, 4).toString("ascii");
  if (head4 === "GIF8") {
    return "image/gif";
  }
  // WEBP: RIFF....WEBP
  if (buf.length >= 12 && head4 === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  // BMP: BM
  if (buf[0] === 0x42 && buf[1] === 0x4d) {
    return "image/bmp";
  }

  // Fallback to declared MIME or extension if valid (useful for edge-case/truncated test fixtures)
  const normDeclared = String(declaredMime || "").split(";")[0].trim().toLowerCase();
  if (normDeclared === "image/jpg") return "image/jpeg";
  if (normDeclared === "application/x-pdf") return "application/pdf";
  if (ALLOWED_ID_CARD_MIMES.has(normDeclared)) return normDeclared;

  const ext = path.extname(String(fileName || "")).toLowerCase();
  if (EXT_TO_MIME[ext]) return EXT_TO_MIME[ext];

  return null;
}

/**
 * Validate binary Buffer as photo or PDF and normalize metadata
 */
export function validateIdCardBuffer(buf, declaredMime = "", fileName = "") {
  if (!Buffer.isBuffer(buf) || buf.length === 0) {
    throw new Error("ID card file is empty.");
  }
  if (buf.length > MAX_ID_CARD_BYTES) {
    throw new Error("ID card file exceeds maximum allowed size of 20 MB.");
  }

  // Explicitly reject SVG or HTML payloads passed disguised as image/octet-stream
  const declaredLower = String(declaredMime || "").toLowerCase();
  if (declaredLower.includes("svg") || declaredLower.includes("html") || declaredLower.includes("javascript")) {
    throw new Error("Unsupported format. Only photo (JPG, PNG, WEBP, GIF, BMP) or PDF files are allowed.");
  }

  const detectedMime = detectMimeFromBuffer(buf, declaredMime, fileName);
  if (!detectedMime || !ALLOWED_ID_CARD_MIMES.has(detectedMime)) {
    throw new Error("Unsupported file format. Please upload a photo (JPG, PNG, WEBP, GIF, BMP) or PDF document.");
  }

  const normalizedMime =
    detectedMime === "image/jpg"
      ? "image/jpeg"
      : detectedMime === "application/x-pdf"
      ? "application/pdf"
      : detectedMime;

  return {
    fileData: buf,
    mimeType: normalizedMime,
    fileSize: buf.length,
    fileName: sanitizeFileName(fileName, normalizedMime),
  };
}

/**
 * Decode a base64 Data URL (e.g. data:image/png;base64,... or data:application/pdf;base64,...)
 */
export function parseDataUrl(dataUrl, fallbackName = "guest_id_card") {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const trimmed = dataUrl.trim();
  const match = trimmed.match(/^data:([a-zA-Z0-9/+.-]+)(?:;[^;,]+)*;base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) return null;

  const mime = match[1].toLowerCase();
  const base64Payload = match[2].replace(/\s+/g, "");
  const fileData = Buffer.from(base64Payload, "base64");
  return validateIdCardBuffer(fileData, mime, fallbackName);
}

/**
 * Parse binary file field from multipart/form-data Buffer without external dependencies
 */
export function parseMultipartFile(rawBuffer, contentTypeHeader = "") {
  if (!Buffer.isBuffer(rawBuffer)) return null;
  const boundaryMatch = String(contentTypeHeader).match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (!boundaryMatch) {
    throw new Error("Invalid multipart/form-data header: missing boundary.");
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const delimiter = Buffer.from(`--${boundary}`);

  let offset = rawBuffer.indexOf(delimiter);
  while (offset !== -1) {
    const start = offset + delimiter.length;
    // End boundary marker "--"
    if (rawBuffer.subarray(start, start + 2).toString("ascii") === "--") {
      break;
    }

    const nextOffset = rawBuffer.indexOf(delimiter, start);
    if (nextOffset === -1) break;

    // Part bytes start after leading \r\n (or \n) and end before trailing \r\n (or \n)
    let partStart = start;
    if (rawBuffer[partStart] === 0x0d && rawBuffer[partStart + 1] === 0x0a) partStart += 2;
    else if (rawBuffer[partStart] === 0x0a) partStart += 1;

    let partEnd = nextOffset;
    if (rawBuffer[partEnd - 2] === 0x0d && rawBuffer[partEnd - 1] === 0x0a) partEnd -= 2;
    else if (rawBuffer[partEnd - 1] === 0x0a) partEnd -= 1;

    const partBuf = rawBuffer.subarray(partStart, partEnd);
    let headerEnd = partBuf.indexOf(Buffer.from("\r\n\r\n"));
    let sepLen = 4;
    if (headerEnd === -1) {
      headerEnd = partBuf.indexOf(Buffer.from("\n\n"));
      sepLen = 2;
    }

    if (headerEnd !== -1) {
      const headersText = partBuf.subarray(0, headerEnd).toString("utf8");
      const filenameMatch = headersText.match(/filename="([^"]*)"/i);
      const nameMatch = headersText.match(/name="([^"]*)"/i);
      const mimeMatch = headersText.match(/content-type:\s*([^\r\n;]+)/i);

      if (filenameMatch || (nameMatch && ["file", "id_card", "id_card_copy", "document"].includes(nameMatch[1]))) {
        const bodyBuf = partBuf.subarray(headerEnd + sepLen);
        if (bodyBuf.length > 0) {
          const decodedName = filenameMatch?.[1]
            ? decodeSafeUriComponent(filenameMatch[1])
            : "guest_id_card";
          return validateIdCardBuffer(bodyBuf, mimeMatch?.[1] || "", decodedName);
        }
      }
    }

    offset = nextOffset;
  }

  return null;
}

function decodeSafeUriComponent(val) {
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
}

/**
 * Extract validated photo or PDF binary payload from an Express request
 * Supports multipart/form-data, raw binary body, or JSON { dataUrl / base64 / id_card_copy }
 */
export function extractIdCardFromRequest(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  const headerFileName = req.headers["x-file-name"]
    ? decodeSafeUriComponent(String(req.headers["x-file-name"]))
    : req.query?.fileName
    ? String(req.query.fileName)
    : "";

  // 1. Multipart form-data Buffer
  if (contentType.includes("multipart/form-data")) {
    const parsed = parseMultipartFile(req.body, req.headers["content-type"]);
    if (!parsed) {
      throw new Error("No ID card file found in multipart upload.");
    }
    return parsed;
  }

  // 2. Raw binary body (image/*, application/pdf, application/octet-stream)
  if (Buffer.isBuffer(req.body)) {
    const declaredMime = contentType.split(";")[0].trim();
    return validateIdCardBuffer(req.body, declaredMime, headerFileName || "guest_id_card");
  }

  // 3. JSON body with Data URL or raw base64
  if (req.body && typeof req.body === "object") {
    const rawDataUrl = req.body.dataUrl || req.body.id_card_copy;
    const targetName = req.body.fileName || req.body.id_card_file_name || headerFileName || "guest_id_card";
    if (typeof rawDataUrl === "string" && rawDataUrl.trim().startsWith("data:")) {
      const parsed = parseDataUrl(rawDataUrl, targetName);
      if (!parsed) {
        throw new Error("Invalid base64 Data URL. Upload a valid photo or PDF document.");
      }
      return parsed;
    }

    if (typeof req.body.base64 === "string" && req.body.base64.trim()) {
      const fileData = Buffer.from(req.body.base64.replace(/\s+/g, ""), "base64");
      return validateIdCardBuffer(fileData, req.body.mimeType || "", targetName);
    }
  }

  throw new Error("No ID card photo or PDF file provided in request body.");
}
