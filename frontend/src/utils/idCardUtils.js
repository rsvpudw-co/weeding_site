import { API_BASE_URL, BACKEND_SERVER_URL } from "../config/apiConfig";

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
 * Resolve stored ID card URL (either /api/guests/:id/id-card?v=... in PostgreSQL, data: URL, or blob: URL)
 */
export function resolveIdCardUrl(guestOrUrl, { download = false } = {}) {
  if (!guestOrUrl) return "";
  const raw = typeof guestOrUrl === "string" ? guestOrUrl : guestOrUrl.id_card_copy;
  if (!raw) return "";

  const str = String(raw).trim();
  if (!str) return "";

  if (str.startsWith("data:") || str.startsWith("blob:")) {
    return str;
  }

  let resolved = str;
    const isApiRelative = str.startsWith("/api/");
    if (isApiRelative) {
      resolved = `${BACKEND_SERVER_URL}${str}`;
    } else if (str.startsWith("/")) {
      resolved = `${API_BASE_URL}${str}`;
    } else if (!str.startsWith("http://") && !str.startsWith("https://")) {
      return "";
    }

      if (download && (isApiRelative || str.startsWith("/"))) {
        return resolved.includes("?") ? `${resolved}&download=1` : `${resolved}?download=1`;
      }
      return resolved;
    }

    /**
     * Derive unified photo vs PDF metadata from guest record
     */
    export function getGuestIdCardMeta(guest) {
      if (!guest || !guest.id_card_copy) {
        return {
          hasDocument: false,
          isImage: false,
          isPdf: false,
          isPdfPreviewable: false,
          fileName: "",
          fileSizeLabel: "",
          viewUrl: "",
          downloadUrl: "",
        };
      }

      const copy = String(guest.id_card_copy);
      const mime = String(guest.id_card_mime_type || "").toLowerCase();
      const storedName = String(guest.id_card_file_name || "").trim();

      const isImage =
        mime.startsWith("image/") ||
        copy.startsWith("data:image/") ||
        /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(storedName) ||
        /\.(png|jpe?g|webp|gif|bmp)(\?|$)/i.test(copy);

      const isPdf =
        !isImage &&
        (mime.includes("pdf") ||
          copy.startsWith("data:application/pdf") ||
          copy.startsWith("data:application/x-pdf") ||
          /\.pdf(\?|$)/i.test(storedName) ||
          /\.pdf(\?|$)/i.test(copy) ||
          copy.includes("/id-card"));

      const isPdfPreviewable =
        isPdf && (copy.startsWith("data:") || copy.startsWith("blob:") || copy.includes("/id-card"));

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
      const fileName =
        storedName ||
        (!copy.startsWith("data:") && !copy.startsWith("/api/") && !copy.startsWith("http")
          ? copy
          : `${safeGuestName}_ID_Card.${ext}`);

      const fileSizeLabel = formatBytes(guest.id_card_file_size) || "Stored in PostgreSQL";
      const viewUrl = resolveIdCardUrl(guest, { download: false });
      const downloadUrl = resolveIdCardUrl(guest, { download: true });

      return {
        hasDocument: Boolean(copy),
        isImage,
        isPdf,
        isPdfPreviewable,
        fileName,
        fileSizeLabel,
        viewUrl,
        downloadUrl,
      };
    }
