export const MAX_ID_CARD_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * Format bytes as human-readable size
 */
export function formatBytes(bytes) {
  const num = Number(bytes);
  if (!num || isNaN(num) || num <= 0) return "";
  if (num >= 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  if (num >= 1024) return `${Math.round(num / 1024)} KB`;
  return `${num} B`;
}

/**
 * Check if a string is an internal API ID-card path that must never be displayed publicly
 */
export function isInternalIdCardPath(val) {
  const str = String(val || "").trim();
  return /^\/api\/guests\/[^/]+\/id-card/i.test(str) || /\/guests\/[^/]+\/id-card/i.test(str);
}

/**
 * Resolve external/inline ID card URL (data:, blob:, or external http(s)://).
 * Internal PostgreSQL binary routes are fetched via authenticated Blob requests instead.
 */
export function resolveIdCardUrl(guestOrUrl) {
  if (!guestOrUrl) return "";
  const raw = typeof guestOrUrl === "string" ? guestOrUrl : guestOrUrl.id_card_copy;
  if (!raw) return "";

  const str = String(raw).trim();
  if (!str || isInternalIdCardPath(str)) return "";

  if (str.startsWith("data:") || str.startsWith("blob:")) {
    return str;
  }

  if (str.startsWith("http://") || str.startsWith("https://")) {
    return str;
  }

  return "";
}

/**
 * Derive unified photo vs PDF metadata from guest record without exposing internal API paths
 */
export function getGuestIdCardMeta(guest) {
  const copy = String(guest?.id_card_copy || "").trim();
  const mime = String(guest?.id_card_mime_type || "").toLowerCase();
  const storedName = String(guest?.id_card_file_name || "").trim();
  const hasBackendBinary = Boolean(
    guest?.has_id_card || mime || isInternalIdCardPath(copy)
  );
  const hasDocument = Boolean(copy || hasBackendBinary);

  if (!guest || !hasDocument) {
    return {
      hasDocument: false,
      hasBackendBinary: false,
      isImage: false,
      isPdf: false,
      isPdfPreviewable: false,
      fileName: "",
      fileSizeLabel: "",
      viewUrl: "",
      downloadUrl: "",
    };
  }

  const isImage =
    mime.startsWith("image/") ||
    copy.startsWith("data:image/") ||
    /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(storedName) ||
    (!isInternalIdCardPath(copy) && /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(copy));

  const isPdf =
    !isImage &&
    (mime.includes("pdf") ||
      copy.startsWith("data:application/pdf") ||
      copy.startsWith("data:application/x-pdf") ||
      /\.pdf(\?|$)/i.test(storedName) ||
      (!isInternalIdCardPath(copy) && /\.pdf(\?|$)/i.test(copy)) ||
      hasBackendBinary);

  const isPdfPreviewable =
    isPdf && (copy.startsWith("data:") || copy.startsWith("blob:") || hasBackendBinary);

  const ext = isImage
    ? mime === "image/png"
      ? "png"
      : mime === "image/webp"
      ? "webp"
      : mime === "image/gif"
      ? "gif"
      : "jpg"
    : "pdf";

  const safeGuestName = String(guest.guest_name || "Guest").replace(/\s+/g, "_");
  const cleanCopyName =
    copy &&
    !copy.startsWith("data:") &&
    !copy.startsWith("blob:") &&
    !copy.startsWith("http") &&
    !isInternalIdCardPath(copy) &&
    !copy.startsWith("/")
      ? copy
      : "";

  const fileName = storedName || cleanCopyName || `${safeGuestName}_ID_Card.${ext}`;
  const fileSizeLabel = formatBytes(guest.id_card_file_size) || "Stored securely in PostgreSQL";
  const externalOrInlineUrl = resolveIdCardUrl(guest);

  return {
    hasDocument: true,
    hasBackendBinary,
    isImage,
    isPdf,
    isPdfPreviewable,
    fileName,
    fileSizeLabel,
    viewUrl: externalOrInlineUrl,
    downloadUrl: externalOrInlineUrl,
  };
}
