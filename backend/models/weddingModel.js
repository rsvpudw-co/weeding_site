import pool from "../Db_connection/dbconnection.js";
import { supabase } from "../Db_connection/supabaseClient.js";
import { store, saveMessagesToFile } from "../Db_connection/queries.js";
import crypto from "crypto";
import { GoogleSheetsService } from "../services/googleSheetsService.js";

// Helper to heal any corrupted wedding groom names
const sanitizeWeddingRecord = (w) => {
  if (!w) return w;
  let groom = (w.groom_name || "").trim();
  if (!groom || groom.startsWith("wedding_") || groom === w.id) {
    if (w.client_username) {
      const usernamePart = w.client_username.split("_")[0];
      const cleanName = usernamePart.replace(/[0-9]/g, "");
      if (cleanName) {
        groom = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
      } else if (usernamePart) {
        groom = usernamePart.charAt(0).toUpperCase() + usernamePart.slice(1);
      }
    }
    if (!groom || groom.startsWith("wedding_")) groom = "Groom";
    if (supabase && w.id && groom !== "Groom" && w.groom_name !== groom) {
      Promise.resolve(supabase.from("weddings").update({ groom_name: groom }).eq("id", w.id)).catch(() => {});
    }
  }
  return { ...w, groom_name: groom };
};

export const WeddingModel = {
  // 1. Get all weddings with guest counts and stats
  async getAll() {
    // Check Supabase first
    if (supabase) {
      try {
        const { data: weddingsData, error: wErr } = await supabase.from("weddings").select("*").order("created_at", { ascending: false });
        if (!wErr && Array.isArray(weddingsData)) {
          const { data: guestsData } = await supabase.from("guests").select("wedding_id, rsvp_status, side");
          const guestsList = guestsData || [];
          return weddingsData.map((rawW) => {
            const w = sanitizeWeddingRecord(rawW);
            const wGuests = guestsList.filter((g) => g.wedding_id === w.id);
            return {
              ...w,
              total_guests: wGuests.length,
              confirmed_guests: wGuests.filter((g) => (g.rsvp_status || "").toLowerCase() === "confirmed").length,
              bride_guests: wGuests.filter((g) => (g.side || "").toLowerCase() === "bride").length,
              groom_guests: wGuests.filter((g) => (g.side || "").toLowerCase() === "groom").length,
            };
          });
        }
      } catch (err) {
        console.warn("Supabase wedding getAll notice:", err.message);
      }
    }

    const query = `
      SELECT 
        w.*,
        COUNT(g.id)::int AS total_guests,
        COALESCE(SUM(CASE WHEN LOWER(g.rsvp_status) = 'confirmed' THEN 1 ELSE 0 END), 0)::int AS confirmed_guests,
        COALESCE(SUM(CASE WHEN LOWER(g.side) = 'bride' THEN 1 ELSE 0 END), 0)::int AS bride_guests,
        COALESCE(SUM(CASE WHEN LOWER(g.side) = 'groom' THEN 1 ELSE 0 END), 0)::int AS groom_guests
      FROM weddings w
      LEFT JOIN guests g ON w.id = g.wedding_id
      GROUP BY w.id
      ORDER BY w.wedding_date ASC, w.created_at DESC
    `;
    const { rows } = await pool.query(query);
    return rows;
  },

  // 2. Get single wedding by ID
  async getById(id) {
    if (supabase) {
      try {
        const { data: wedding } = await supabase.from("weddings").select("*").eq("id", id).single();
        if (wedding) {
          const sanitized = sanitizeWeddingRecord(wedding);
          const { data: guestsData } = await supabase.from("guests").select("rsvp_status, side").eq("wedding_id", id);
          const wGuests = guestsData || [];
          return {
            ...sanitized,
            total_guests: wGuests.length,
            confirmed_guests: wGuests.filter((g) => (g.rsvp_status || "").toLowerCase() === "confirmed").length,
            bride_guests: wGuests.filter((g) => (g.side || "").toLowerCase() === "bride").length,
            groom_guests: wGuests.filter((g) => (g.side || "").toLowerCase() === "groom").length,
          };
        }
      } catch (err) {}
    }

    const query = `
      SELECT 
        w.*,
        COUNT(g.id)::int AS total_guests,
        COALESCE(SUM(CASE WHEN LOWER(g.rsvp_status) = 'confirmed' THEN 1 ELSE 0 END), 0)::int AS confirmed_guests,
        COALESCE(SUM(CASE WHEN LOWER(g.side) = 'bride' THEN 1 ELSE 0 END), 0)::int AS bride_guests,
        COALESCE(SUM(CASE WHEN LOWER(g.side) = 'groom' THEN 1 ELSE 0 END), 0)::int AS groom_guests
      FROM weddings w
      LEFT JOIN guests g ON w.id = g.wedding_id
      WHERE w.id = $1
      GROUP BY w.id
    `;
    const { rows } = await pool.query(query, [id]);
    return rows[0] ? sanitizeWeddingRecord(rows[0]) : null;
  },

  // 3. Create wedding / marriage card
  async create(data) {
    const id = data.id || `wedding_${crypto.randomUUID().slice(0, 8)}`;
    
    // Auto-generate client username if not provided
    const groomFirst = (data.groom_name || "groom").trim().split(" ")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
    const brideFirst = (data.bride_name || "bride").trim().split(" ")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
    const defaultUsername = `${groomFirst}_${brideFirst}`;
    const client_username = (data.client_username && data.client_username.trim()) || defaultUsername;

    // Auto-generate client password if not provided
    const year = data.wedding_date ? data.wedding_date.slice(0, 4) : new Date().getFullYear();
    const defaultPassword = `${groomFirst.charAt(0).toUpperCase() + groomFirst.slice(1)}@${year}`;
    const client_password = (data.client_password && data.client_password.trim()) || defaultPassword;

    let google_sheet_id = data.google_sheet_id;
    let google_sheet_url = data.google_sheet_url;
    let google_sheet_sync_status = data.google_sheet_sync_status || "connected";

    if (!google_sheet_id || !google_sheet_url) {
      try {
        const sheetMeta = await GoogleSheetsService.generateOrRealCreateSheet({
          ...data,
          id,
        });
        google_sheet_id = sheetMeta.google_sheet_id;
        google_sheet_url = sheetMeta.google_sheet_url;
        google_sheet_sync_status = sheetMeta.google_sheet_sync_status;
      } catch (err) {
        console.warn("⚠️ Google Sheet auto-creation note:", err.message);
      }
    }

    const newRecord = {
      id,
      groom_name: data.groom_name,
      bride_name: data.bride_name,
      wedding_date: data.wedding_date || null,
      venue: data.venue || null,
      city: data.city || null,
      cover_theme: data.cover_theme || "emerald",
      notes: data.notes || null,
      client_username,
      client_password,
      google_sheet_id,
      google_sheet_url,
      google_sheet_sync_status,
      google_sheet_last_synced: new Date().toISOString(),
    };

    if (supabase) {
      try {
        await supabase.from("weddings").upsert(newRecord);
      } catch (err) {
        console.warn("Supabase wedding insert note:", err.message);
      }
    }

    const query = `
      INSERT INTO weddings (
        id, groom_name, bride_name, wedding_date, venue, city, cover_theme, notes, 
        client_username, client_password, google_sheet_id, google_sheet_url, google_sheet_sync_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `;
    const values = [
      id,
      data.groom_name,
      data.bride_name,
      data.wedding_date || null,
      data.venue || null,
      data.city || null,
      data.cover_theme || "emerald",
      data.notes || null,
      client_username,
      client_password,
      google_sheet_id,
      google_sheet_url,
      google_sheet_sync_status,
    ];
    await pool.query(query, values);
    return this.getById(id);
  },

  // 4. Update wedding
  async update(id, data) {
    const existing = await this.getById(id);
    if (!existing) return null;

    let safeGroom = data.groom_name !== undefined ? String(data.groom_name).trim() : existing.groom_name;
    if (safeGroom && (safeGroom.startsWith("wedding_") || safeGroom === id)) {
      if (existing.groom_name && !existing.groom_name.startsWith("wedding_") && existing.groom_name !== id) {
        safeGroom = existing.groom_name;
      } else if (existing.client_username) {
        const uPart = existing.client_username.split("_")[0]?.replace(/[0-9]/g, "");
        if (uPart) safeGroom = uPart.charAt(0).toUpperCase() + uPart.slice(1);
      }
    }

    const cleanWeddingRecord = {
      groom_name: safeGroom,
      bride_name: data.bride_name !== undefined ? String(data.bride_name).trim() : existing.bride_name,
      wedding_date: data.wedding_date !== undefined ? (data.wedding_date || null) : existing.wedding_date,
      venue: data.venue !== undefined ? (data.venue || null) : existing.venue,
      city: data.city !== undefined ? (data.city || null) : existing.city,
      cover_theme: data.cover_theme !== undefined ? data.cover_theme : (existing.cover_theme || "emerald"),
      notes: data.notes !== undefined ? (data.notes || null) : existing.notes,
      client_username: data.client_username !== undefined ? (data.client_username || null) : existing.client_username,
      client_password: data.client_password !== undefined ? (data.client_password || null) : existing.client_password,
      google_sheet_id: data.google_sheet_id !== undefined ? (data.google_sheet_id || null) : existing.google_sheet_id,
      google_sheet_url: data.google_sheet_url !== undefined ? (data.google_sheet_url || null) : existing.google_sheet_url,
      google_sheet_sync_status: data.google_sheet_sync_status !== undefined ? (data.google_sheet_sync_status || "connected") : (existing.google_sheet_sync_status || "connected"),
      google_sheet_last_synced: data.google_sheet_last_synced !== undefined ? (data.google_sheet_last_synced || null) : (existing.google_sheet_last_synced || new Date().toISOString()),
      updated_at: new Date().toISOString(),
    };

    let updatedResult = null;

    if (supabase) {
      try {
        const { data: supaUpdated, error: supaError } = await supabase
          .from("weddings")
          .update(cleanWeddingRecord)
          .eq("id", id)
          .select();

        if (supaError) {
          console.error("❌ Supabase wedding update error:", supaError.message);
        } else if (supaUpdated && supaUpdated.length > 0) {
          updatedResult = supaUpdated[0];
        }
      } catch (err) {
        console.warn("Supabase wedding update notice:", err.message);
      }
    }

    const merged = { ...existing, ...cleanWeddingRecord, id };
    const wIdx = store.weddings.findIndex((w) => w.id === id);
    if (wIdx >= 0) {
      store.weddings[wIdx] = { ...store.weddings[wIdx], ...merged };
    } else {
      store.weddings.push(merged);
    }

    try {
      const query = `
        UPDATE weddings SET
          groom_name = COALESCE($1, groom_name),
          bride_name = COALESCE($2, bride_name),
          wedding_date = $3,
          venue = $4,
          city = $5,
          cover_theme = COALESCE($6, cover_theme),
          notes = $7,
          client_username = COALESCE($8, client_username),
          client_password = COALESCE($9, client_password),
          google_sheet_id = COALESCE($10, google_sheet_id),
          google_sheet_url = COALESCE($11, google_sheet_url),
          google_sheet_sync_status = COALESCE($12, google_sheet_sync_status),
          google_sheet_last_synced = COALESCE($13, google_sheet_last_synced),
          updated_at = NOW()
        WHERE id = $14
      `;
      const values = [
        cleanWeddingRecord.groom_name,
        cleanWeddingRecord.bride_name,
        cleanWeddingRecord.wedding_date,
        cleanWeddingRecord.venue,
        cleanWeddingRecord.city,
        cleanWeddingRecord.cover_theme,
        cleanWeddingRecord.notes,
        cleanWeddingRecord.client_username,
        cleanWeddingRecord.client_password,
        cleanWeddingRecord.google_sheet_id,
        cleanWeddingRecord.google_sheet_url,
        cleanWeddingRecord.google_sheet_sync_status,
        cleanWeddingRecord.google_sheet_last_synced,
        id,
      ];
      await pool.query(query, values);
    } catch (e) {}

    return updatedResult || merged;
  },

  // 5. Authenticate wedding client credentials directly from Database
  async findByClientCredentials(usernameOrEmail, password) {
    const cleanId = (usernameOrEmail || "").trim().toLowerCase();
    const cleanPass = (password || "").trim();
    if (!cleanId || !cleanPass) return null;

    const baseCleanId = cleanId
      .replace("@weddingportal.com", "")
      .replace("@weddingsite.com", "")
      .replace("@emitly.com", "")
      .trim();

    // 1. Check live Supabase DB
    if (supabase) {
      try {
        const { data } = await supabase.from("weddings").select("*");
        if (data && data.length > 0) {
          const wedding = data.find((w) => {
            const wUser = (w.client_username || "").toLowerCase().trim();
            const wId = (w.id || "").toLowerCase().trim();
            const wGroom = (w.groom_name || "").toLowerCase().trim();
            const wBride = (w.bride_name || "").toLowerCase().trim();
            const combined = `${wGroom}_${wBride}`.replace(/[^a-z0-9_]/g, "");

            const userMatch =
              wUser === cleanId ||
              wUser === baseCleanId ||
              wId === cleanId ||
              wId === baseCleanId ||
              `${wUser}@weddingportal.com` === cleanId ||
              `${wUser}@weddingsite.com` === cleanId ||
              `${wUser}@emitly.com` === cleanId ||
              combined === baseCleanId ||
              `${wGroom} & ${wBride}` === cleanId ||
              wGroom.includes(baseCleanId) ||
              wBride.includes(baseCleanId);

            const passMatch =
              (w.client_password && w.client_password.trim() === cleanPass) ||
              (cleanPass.toLowerCase() === (w.client_password || "").toLowerCase().trim());

            return userMatch && passMatch;
          });
          if (wedding) return wedding;
        }
      } catch (err) {
        console.warn("Supabase wedding find notice:", err.message);
      }
    }

    // 2. Query pool / in-memory store
    const query = `
      SELECT * FROM weddings 
      WHERE (LOWER(client_username) = $1 OR id = $2 OR LOWER(client_username) = $3)
    `;
    try {
      const { rows } = await pool.query(query, [
        cleanId,
        usernameOrEmail,
        baseCleanId,
      ]);

      if (rows && rows.length > 0) {
        const wedding = rows[0];
        if (
          wedding.client_password &&
          (wedding.client_password.trim() === cleanPass ||
            wedding.client_password.trim().toLowerCase() === cleanPass.toLowerCase())
        ) {
          return wedding;
        }
      }
    } catch (e) {}

    return null;
  },

  // 6. Synchronously delete wedding from local memory store in <1ms
  deleteLocal(id) {
    let deleted = null;
    if (store && Array.isArray(store.weddings)) {
      deleted = store.weddings.find((w) => w.id === id) || null;
      store.weddings = store.weddings.filter((w) => w.id !== id);
      store.guests = (store.guests || []).filter((g) => g.wedding_id !== id);
      store.guest_call_logs = (store.guest_call_logs || []).filter((c) => c.wedding_id !== id);
      store.guest_id_cards = (store.guest_id_cards || []).filter((ic) => ic.wedding_id !== id);
      store.messages = (store.messages || []).filter((m) => m.wedding_id !== id);
      // skip writing to disk on deletion to prevent file watchers restart
    }
    return deleted;
  },

  // 7. Delete wedding and all associated guests & logs from PostgreSQL & memory
  async delete(id) {
    if (!id) return true;

    // 1. Purge from in-memory cache & local store immediately (<1ms)
    this.deleteLocal(id);

    // 2. Direct PostgreSQL cascading purge on DigitalOcean VM
    try {
      await pool.query("DELETE FROM wedding_messages WHERE wedding_id = $1", [id]).catch(() => {});
      await pool.query("DELETE FROM guest_id_cards WHERE wedding_id = $1", [id]).catch(() => {});
      await pool.query("DELETE FROM guest_call_logs WHERE wedding_id = $1", [id]).catch(() => {});
      await pool.query("DELETE FROM guests WHERE wedding_id = $1", [id]).catch(() => {});
      await pool.query("DELETE FROM weddings WHERE id = $1", [id]);
      console.log(`✅ [PostgreSQL DB] Records purged for wedding: ${id}`);
    } catch (err) {
      console.warn(`PostgreSQL delete notice for wedding ${id}:`, err.message);
    }

    return true;
  },
};
