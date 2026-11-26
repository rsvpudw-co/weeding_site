import crypto from "crypto";
import pool from "../Db_connection/dbconnection.js";
import { store, saveGuestsToFile, saveIdCardsToFile } from "../Db_connection/queries.js";
import { parseDataUrl, validateIdCardBuffer } from "../utils/idCardHelper.js";

export const GuestIdCardModel = {
  /**
   * Store a guest ID card (photo or PDF binary) into PostgreSQL guest_id_cards table
   * and update lightweight metadata/descriptor URL on the guests record.
   */
  async saveForGuest(guestId, { weddingId = "wedding_01", fileName, mimeType, fileData }) {
    if (!guestId) throw new Error("Missing guest ID");

    const validated = validateIdCardBuffer(fileData, mimeType, fileName);
    const cardId = `idcard_${crypto.randomUUID().slice(0, 12)}`;
    // Store clean filename in guests.id_card_copy rather than exposing internal API paths
    const storedCopyLabel = validated.fileName;

    // 1. Upsert binary BYTEA directly in PostgreSQL
    await pool.query(
      `INSERT INTO guest_id_cards (
        id, guest_id, wedding_id, file_name, mime_type, file_size, file_data, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (guest_id) DO UPDATE SET
        wedding_id = EXCLUDED.wedding_id,
        file_name = EXCLUDED.file_name,
        mime_type = EXCLUDED.mime_type,
        file_size = EXCLUDED.file_size,
        file_data = EXCLUDED.file_data,
        updated_at = NOW()`,
      [
        cardId,
        guestId,
        weddingId,
        validated.fileName,
        validated.mimeType,
        validated.fileSize,
        validated.fileData,
      ]
    );

    // 2. Update metadata columns on guests table
    await pool.query(
      `UPDATE guests SET
        id_card_received = $1,
        id_card_copy = $2,
        id_card_file_name = $3,
        id_card_mime_type = $4,
        id_card_file_size = $5,
        updated_at = NOW()
      WHERE id = $6`,
      [
        "Yes",
        storedCopyLabel,
        validated.fileName,
        validated.mimeType,
        validated.fileSize,
        guestId,
      ]
    );

    // 3. Synchronize in-memory store
    const gIdx = (store.guests || []).findIndex((g) => g.id === guestId);
    if (gIdx >= 0) {
      store.guests[gIdx] = {
        ...store.guests[gIdx],
        id_card_received: "Yes",
        id_card_copy: storedCopyLabel,
        id_card_file_name: validated.fileName,
        id_card_mime_type: validated.mimeType,
        id_card_file_size: validated.fileSize,
        updated_at: new Date().toISOString(),
      };
      saveGuestsToFile();
    }

    const icIdx = (store.guest_id_cards || []).findIndex((ic) => ic.guest_id === guestId);
    const storeEntry = {
      id: cardId,
      guest_id: guestId,
      wedding_id: weddingId,
      file_name: validated.fileName,
      mime_type: validated.mimeType,
      file_size: validated.fileSize,
      file_data_base64: validated.fileData.toString("base64"),
      updated_at: new Date().toISOString(),
    };
    if (!store.guest_id_cards) store.guest_id_cards = [];
    if (icIdx >= 0) {
      store.guest_id_cards[icIdx] = { ...store.guest_id_cards[icIdx], ...storeEntry };
    } else {
      store.guest_id_cards.push(storeEntry);
    }
    saveIdCardsToFile();

    return {
      id: cardId,
      guest_id: guestId,
      wedding_id: weddingId,
      id_card_copy: storedCopyLabel,
      has_id_card: true,
      id_card_received: "Yes",
      id_card_file_name: validated.fileName,
      id_card_mime_type: validated.mimeType,
      id_card_file_size: validated.fileSize,
    };
  },

  /**
   * Fetch stored binary ID card from PostgreSQL guest_id_cards (with lazy migration for legacy Data URLs)
   */
  async getByGuestId(guestId) {
    if (!guestId) return null;

    const { rows } = await pool.query(
      `SELECT id, guest_id, wedding_id, file_name, mime_type, file_size, file_data, created_at, updated_at
       FROM guest_id_cards
       WHERE guest_id = $1
       LIMIT 1`,
      [guestId]
    );

    if (rows && rows.length > 0 && rows[0].file_data) {
      const row = rows[0];
      return {
        ...row,
        file_data: Buffer.isBuffer(row.file_data) ? row.file_data : Buffer.from(row.file_data),
      };
    }

    // Legacy read-only compatibility: serve inline base64 Data URL without mutating existing DB rows
    const { rows: guestRows } = await pool.query(
      "SELECT id, wedding_id, guest_name, id_card_copy, id_card_file_name FROM guests WHERE id = $1 LIMIT 1",
      [guestId]
    );
    const guest = guestRows?.[0] || (store.guests || []).find((g) => g.id === guestId);
    if (guest?.id_card_copy && String(guest.id_card_copy).startsWith("data:")) {
      const fallbackName = guest.id_card_file_name || `${guest.guest_name || "Guest"}_ID_Card`;
      const decoded = parseDataUrl(guest.id_card_copy, fallbackName);
      if (decoded) {
        return {
          guest_id: guestId,
          wedding_id: guest.wedding_id || "wedding_01",
          file_name: decoded.fileName,
          mime_type: decoded.mimeType,
          file_size: decoded.fileSize,
          file_data: decoded.fileData,
        };
      }
    }

    return null;
  },

  /**
   * Delete stored ID card binary from PostgreSQL and clear metadata on guests row
   */
  async deleteByGuestId(guestId, { markPending = false } = {}) {
    if (!guestId) return false;

    await pool.query("DELETE FROM guest_id_cards WHERE guest_id = $1", [guestId]);

    if (markPending) {
      await pool.query(
        `UPDATE guests SET
          id_card_received = $1,
          id_card_copy = $2,
          id_card_file_name = $3,
          id_card_mime_type = $4,
          id_card_file_size = $5,
          updated_at = NOW()
        WHERE id = $6`,
        ["No", null, null, null, null, guestId]
      );
    } else {
      await pool.query(
        `UPDATE guests SET
          id_card_copy = $1,
          id_card_file_name = $2,
          id_card_mime_type = $3,
          id_card_file_size = $4,
          updated_at = NOW()
        WHERE id = $5`,
        [null, null, null, null, guestId]
      );
    }

    const gIdx = (store.guests || []).findIndex((g) => g.id === guestId);
    if (gIdx >= 0) {
      store.guests[gIdx] = {
        ...store.guests[gIdx],
        ...(markPending ? { id_card_received: "No" } : {}),
        id_card_copy: null,
        id_card_file_name: null,
        id_card_mime_type: null,
        id_card_file_size: null,
        updated_at: new Date().toISOString(),
      };
      saveGuestsToFile();
    }

    if (store.guest_id_cards) {
      store.guest_id_cards = store.guest_id_cards.filter((ic) => ic.guest_id !== guestId);
      saveIdCardsToFile();
    }

    return true;
  },
};
