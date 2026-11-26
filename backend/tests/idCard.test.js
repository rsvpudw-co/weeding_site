import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { guestController } from "../controllers/guestController.js";
import { GuestModel } from "../models/guestModel.js";
import { GuestIdCardModel } from "../models/guestIdCardModel.js";
import { validateIdCardBuffer, parseMultipartFile, parseDataUrl } from "../utils/idCardHelper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_DIR = path.resolve(__dirname, "../database");

const snapshotFile = (name) => {
  const full = path.join(DB_DIR, name);
  return {
    path: full,
    existed: fs.existsSync(full),
    content: fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null,
  };
};

const guestsSnap = snapshotFile("guests_store.json");
const idCardsSnap = snapshotFile("id_cards_store.json");

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const WEBP_BYTES = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP", "ascii"),
  Buffer.from("VP8 ", "ascii"),
]);
const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n", "utf8");

function createMockReq({ params = {}, query = {}, headers = {}, body = undefined } = {}) {
  const req = new Readable({ read() {} });
  req.params = params;
  req.query = query;
  req.headers = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  req.body = body;
  req.app = { get: () => null };
  return req;
}

function createMockRes() {
  const headers = {};
  const res = {
    statusCode: 200,
    headers,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(k, v) {
      headers[k.toLowerCase()] = v;
    },
    getHeader(k) {
      return headers[k.toLowerCase()];
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe("Guest ID Card Photo & PDF Storage", () => {
  const createdIds = [];

  after(async () => {
    for (const id of createdIds) {
      await GuestModel.delete(id).catch(() => {});
    }
    for (const snap of [guestsSnap, idCardsSnap]) {
      if (snap.existed) {
        fs.writeFileSync(snap.path, snap.content, "utf8");
      } else if (fs.existsSync(snap.path)) {
        fs.unlinkSync(snap.path);
      }
    }
  });

  it("validates photo magic bytes (PNG/JPEG/WEBP) and PDF magic bytes while rejecting HTML/SVG", () => {
    const pngRes = validateIdCardBuffer(PNG_BYTES, "application/octet-stream", "passport");
    assert.equal(pngRes.mimeType, "image/png");
    assert.equal(pngRes.fileName, "passport.png");

    const jpegRes = validateIdCardBuffer(JPEG_BYTES, "image/jpg", "aadhaar.jpg");
    assert.equal(jpegRes.mimeType, "image/jpeg");
    assert.equal(jpegRes.fileName, "aadhaar.jpg");

    const webpRes = validateIdCardBuffer(WEBP_BYTES, "image/webp", "photo.webp");
    assert.equal(webpRes.mimeType, "image/webp");
    assert.equal(webpRes.fileName, "photo.webp");

    const pdfRes = validateIdCardBuffer(PDF_BYTES, "application/pdf", "license.pdf");
    assert.equal(pdfRes.mimeType, "application/pdf");
    assert.equal(pdfRes.fileName, "license.pdf");

    assert.throws(
      () => validateIdCardBuffer(Buffer.from("<svg><script/></svg>"), "image/svg+xml", "evil.svg"),
      /Unsupported/
    );
    assert.throws(
      () => validateIdCardBuffer(Buffer.from("plain text payload"), "text/plain", "notes.txt"),
      /Unsupported/
    );
  });

  it("parses multipart/form-data binary uploads accurately without byte corruption", () => {
    const boundary = "----TestBoundary12345";
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="guest_photo.png"\r\nContent-Type: image/png\r\n\r\n`,
      "utf8"
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
    const body = Buffer.concat([header, PNG_BYTES, footer]);

    const parsed = parseMultipartFile(body, `multipart/form-data; boundary=${boundary}`);
    assert.ok(parsed);
    assert.equal(parsed.fileName, "guest_photo.png");
    assert.equal(parsed.mimeType, "image/png");
    assert.deepEqual(parsed.fileData, PNG_BYTES);
  });

  it("stores, serves, downloads, replaces (photo & PDF), and deletes guest ID cards", async () => {
    // 1. Create guest via inline Data URL (photo JPEG)
    const jpegDataUrl = `data:image/jpeg;base64,${JPEG_BYTES.toString("base64")}`;
    const createReq = createMockReq({
      headers: { "x-user-role": "admin" },
      body: {
        wedding_id: "wedding_01",
        guest_name: "Test Guest Photo",
        side: "Groom",
        id_card_copy: jpegDataUrl,
        id_card_file_name: "pan_card.jpg",
      },
    });
    const createRes = createMockRes();
    await guestController.createGuest(createReq, createRes);
    assert.equal(createRes.statusCode, 201);
    const guest = createRes.body.data;
    createdIds.push(guest.id);

    assert.equal(guest.id_card_received, "Yes");
    assert.match(guest.id_card_copy, new RegExp(`^/api/guests/${guest.id}/id-card`));
    assert.equal(guest.id_card_mime_type, "image/jpeg");
    assert.equal(guest.id_card_file_name, "pan_card.jpg");

    // 2. Serve stored photo inline
    const getPhotoRes = createMockRes();
    await guestController.getGuestIdCard(createMockReq({ params: { id: guest.id } }), getPhotoRes);
    assert.equal(getPhotoRes.statusCode, 200);
    assert.equal(getPhotoRes.getHeader("content-type"), "image/jpeg");
    assert.match(getPhotoRes.getHeader("content-disposition"), /^inline;/);
    assert.deepEqual(getPhotoRes.body, JPEG_BYTES);

    // 3. Replace with PDF via multipart/form-data binary body
    const boundary = "----PdfBoundary99";
    const multipartBody = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="aadhaar_id.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
        "utf8"
      ),
      PDF_BYTES,
      Buffer.from(`\r\n--${boundary}--\r\n`, "utf8"),
    ]);
    const uploadPdfReq = createMockReq({
      params: { id: guest.id },
      headers: {
        "x-user-role": "admin",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      body: multipartBody,
    });
    const uploadPdfRes = createMockRes();
    await guestController.uploadGuestIdCard(uploadPdfReq, uploadPdfRes);
    assert.equal(uploadPdfRes.statusCode, 200);
    assert.equal(uploadPdfRes.body.data.id_card_mime_type, "application/pdf");
    assert.equal(uploadPdfRes.body.data.id_card_file_name, "aadhaar_id.pdf");

    // 4. Download stored PDF binary with ?download=1
    const dlPdfRes = createMockRes();
    await guestController.getGuestIdCard(
      createMockReq({ params: { id: guest.id }, query: { download: "1" } }),
      dlPdfRes
    );
    assert.equal(dlPdfRes.statusCode, 200);
    assert.equal(dlPdfRes.getHeader("content-type"), "application/pdf");
    assert.match(dlPdfRes.getHeader("content-disposition"), /^attachment;/);
    assert.deepEqual(dlPdfRes.body, PDF_BYTES);

    // 5. Replace with raw WEBP photo binary + x-file-name
    const rawWebpReq = createMockReq({
      params: { id: guest.id },
      headers: {
        "x-user-role": "admin",
        "content-type": "image/webp",
        "x-file-name": encodeURIComponent("voter_id.webp"),
      },
      body: WEBP_BYTES,
    });
    const rawWebpRes = createMockRes();
    await guestController.uploadGuestIdCard(rawWebpReq, rawWebpRes);
    assert.equal(rawWebpRes.statusCode, 200);
    assert.equal(rawWebpRes.body.data.id_card_mime_type, "image/webp");
    assert.equal(rawWebpRes.body.data.id_card_file_name, "voter_id.webp");

    // 6. Reject unsupported HTML upload with HTTP 400
    const badReq = createMockReq({
      params: { id: guest.id },
      headers: { "x-user-role": "admin", "content-type": "text/html", "x-file-name": "bad.html" },
      body: Buffer.from("<html>bad</html>"),
    });
    const badRes = createMockRes();
    await guestController.uploadGuestIdCard(badReq, badRes);
    assert.equal(badRes.statusCode, 400);

    // 7. Delete ID card with markPending=true
    const delRes = createMockRes();
    await guestController.deleteGuestIdCard(
      createMockReq({
        params: { id: guest.id },
        query: { markPending: "true" },
        headers: { "x-user-role": "admin" },
      }),
      delRes
    );
    assert.equal(delRes.statusCode, 200);
    assert.equal(delRes.body.data.id_card_copy, null);
    assert.equal(delRes.body.data.id_card_received, "No");

    const missingRes = createMockRes();
    await guestController.getGuestIdCard(createMockReq({ params: { id: guest.id } }), missingRes);
    assert.equal(missingRes.statusCode, 404);
  });

  it("handles Data URL parsing cleanly and confirms schema.sql contains guest_id_cards", () => {
    const parsed = parseDataUrl(`data:application/pdf;base64,${PDF_BYTES.toString("base64")}`, "id_proof");
    assert.equal(parsed.mimeType, "application/pdf");
    assert.equal(parsed.fileName, "id_proof.pdf");
    assert.deepEqual(parsed.fileData, PDF_BYTES);

    const stored = GuestIdCardModel.getByGuestId("nonexistent_guest_999");
    assert.ok(stored instanceof Promise);

    const schemaSql = fs.readFileSync(path.resolve(__dirname, "../schema.sql"), "utf8");
    assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS guest_id_cards/i);
    assert.match(schemaSql, /file_data BYTEA NOT NULL/i);
  });
});
