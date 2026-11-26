import pool from "../Db_connection/dbconnection.js";
import { supabase } from "../Db_connection/supabaseClient.js";
import { store, saveGuestsToFile } from "../Db_connection/queries.js";
import crypto from "crypto";
import { GuestIdCardModel } from "./guestIdCardModel.js";
import { parseDataUrl } from "../utils/idCardHelper.js";

/**
 * Mask any internal /api/guests/:id/id-card endpoint string so internal URLs
 * are never exposed in API JSON responses or UI text while leaving DB rows untouched.
 */
export function sanitizeGuestPublicRecord(guest) {
  if (!guest) return guest;
  const rawCopy = String(guest.id_card_copy || "");
  const isInternalEndpoint = /\/guests\/[^/]+\/id-card/i.test(rawCopy);
  const hasStoredMime = Boolean(guest.id_card_mime_type);
  const hasDataUri = rawCopy.trim().startsWith("data:");
  const hasIdCardBinary = isInternalEndpoint || hasStoredMime || hasDataUri;

  if (!isInternalEndpoint) {
    return hasStoredMime || hasDataUri ? { ...guest, has_id_card: true } : guest;
  }

  const isImg = String(guest.id_card_mime_type || "").toLowerCase().startsWith("image/");
  const safeName =
    guest.id_card_file_name ||
    (isImg ? "ID_Card_Photo.jpg" : "ID_Card_Document.pdf");

  return {
    ...guest,
    id_card_copy: safeName,
    has_id_card: hasIdCardBinary,
  };
}

// Helper function to resolve and normalize guest side (Bride vs Groom vs Both)
export function resolveGuestSide(sideVal, relationVal, defaultSide = "Groom") {
  if (sideVal !== undefined && sideVal !== null) {
    const s = String(sideVal).toLowerCase().trim();
    if (
      s.includes("bride") ||
      s.includes("ladki") ||
      s.includes("girl") ||
      s.includes("female") ||
      s.includes("wife") ||
      s === "b" ||
      s === "b side" ||
      s === "b/s" ||
      s.startsWith("bride")
    ) {
      return "Bride";
    }
    if (
      s.includes("groom") ||
      s.includes("ladka") ||
      s.includes("ladke") ||
      s.includes("boy") ||
      s.includes("male") ||
      s.includes("husband") ||
      s === "g" ||
      s === "g side" ||
      s === "g/s" ||
      s.startsWith("groom")
    ) {
      return "Groom";
    }
    if (s.includes("both") || s.includes("mutual") || s.includes("common")) {
      return "Both";
    }
  }

  // Fallback to relation inference if side is empty or ambiguous
  if (relationVal !== undefined && relationVal !== null) {
    const rel = String(relationVal).toLowerCase().trim();
    if (
      rel.includes("bride") ||
      rel.includes("ladki") ||
      rel.includes("girl") ||
      rel.includes("female") ||
      rel.includes("wife")
    ) {
      return "Bride";
    }
    if (
      rel.includes("groom") ||
      rel.includes("ladka") ||
      rel.includes("ladke") ||
      rel.includes("boy") ||
      rel.includes("male") ||
      rel.includes("husband")
    ) {
      return "Groom";
    }
  }

  return defaultSide || "Groom";
}

// Helper function to calculate complete statistics from any list of guest objects
export const calculateGuestStats = (guests = []) => {
  const total = guests.length;

  const groomGuests = guests.filter((g) => (g.side || "").toLowerCase() === "groom");
  const brideGuests = guests.filter((g) => (g.side || "").toLowerCase() === "bride");
  const bothGuests = guests.filter((g) => (g.side || "").toLowerCase() === "both");

  const groomCount = groomGuests.length;
  const brideCount = brideGuests.length;
  const bothCount = bothGuests.length;

  // RSVP Check helpers
  const isConfirmedRsvp = (status = "") => (status || "").toLowerCase() === "confirmed";
  const isPendingRsvp = (status = "") => (status || "").toLowerCase() === "pending";
  const isDeclinedRsvp = (status = "") => {
    const s = (status || "").toLowerCase();
    return s === "declined" || s.includes("regret") || s.includes("not attending") || s.includes("not coming") || s === "no";
  };

  // RSVP Confirmed
  const confirmed = guests.filter((g) => isConfirmedRsvp(g.rsvp_status)).length;
  const groomConfirmed = groomGuests.filter((g) => isConfirmedRsvp(g.rsvp_status)).length;
  const brideConfirmed = brideGuests.filter((g) => isConfirmedRsvp(g.rsvp_status)).length;

  // RSVP Pending
  const pending = guests.filter((g) => isPendingRsvp(g.rsvp_status)).length;
  const groomPending = groomGuests.filter((g) => isPendingRsvp(g.rsvp_status)).length;
  const bridePending = brideGuests.filter((g) => isPendingRsvp(g.rsvp_status)).length;

  // RSVP Regrets / Declined (Not Coming)
  const declined = guests.filter((g) => isDeclinedRsvp(g.rsvp_status)).length;
  const groomDeclined = groomGuests.filter((g) => isDeclinedRsvp(g.rsvp_status)).length;
  const brideDeclined = brideGuests.filter((g) => isDeclinedRsvp(g.rsvp_status)).length;

  // ID Cards
  const isIdYes = (val = "") => (val || "").toLowerCase() === "yes" || (val || "").toLowerCase() === "received";
  const idReceived = guests.filter((g) => isIdYes(g.id_card_received)).length;
  const groomIdReceived = groomGuests.filter((g) => isIdYes(g.id_card_received)).length;
  const brideIdReceived = brideGuests.filter((g) => isIdYes(g.id_card_received)).length;

  // Flight / Travel Details
  const hasFlight = (g) =>
    Boolean(
      (g.arrival_flight_train_no && g.arrival_flight_train_no.trim() !== "") ||
      (g.arrival_date && g.arrival_date.trim() !== "") ||
      (g.departure_flight_train_no && g.departure_flight_train_no.trim() !== "") ||
      (g.departure_date && g.departure_date.trim() !== "")
    );

  const flightReceived = guests.filter(hasFlight).length;
  const groomFlightReceived = groomGuests.filter(hasFlight).length;
  const brideFlightReceived = brideGuests.filter(hasFlight).length;

  const specialRequests = guests.filter((g) => g.special_request && g.special_request.trim() !== "").length;

  const notCalled = guests.filter((g) => !g.call_count || Number(g.call_count) === 0).length;
  const call1 = guests.filter((g) => Number(g.call_count) === 1).length;
  const call2 = guests.filter((g) => Number(g.call_count) === 2).length;
  const call3Done = guests.filter((g) => Number(g.call_count || 0) >= 3).length;
  const groomCall3Done = groomGuests.filter((g) => Number(g.call_count || 0) >= 3).length;
  const brideCall3Done = brideGuests.filter((g) => Number(g.call_count || 0) >= 3).length;

  const groomCallsInProgress = Math.max(0, groomCount - groomCall3Done);
  const brideCallsInProgress = Math.max(0, brideCount - brideCall3Done);

  const callConnected = guests.filter(
    (g) =>
      (g.call_status || "").toLowerCase().includes("connected") ||
      (g.call_status || "").toLowerCase().includes("confirmed")
  ).length;
  const callback = guests.filter((g) => (g.call_status || "").toLowerCase().includes("callback")).length;

  return {
    totalRegistered: total,
    groomSideCount: groomCount,
    brideSideCount: brideCount,
    bothSideCount: bothCount,

    rsvpConfirmed: confirmed,
    rsvpConfirmedPercentage: total > 0 ? Math.round((confirmed / total) * 100) : 0,
    groomRsvpConfirmed: groomConfirmed,
    brideRsvpConfirmed: brideConfirmed,
    bothRsvpConfirmed: 0,

    rsvpPending: pending,
    rsvpPendingPercentage: total > 0 ? Math.round((pending / total) * 100) : 0,
    groomRsvpPending: groomPending,
    brideRsvpPending: bridePending,
    bothRsvpPending: 0,

    rsvpDeclined: declined,
    rsvpDeclinedPercentage: total > 0 ? Math.round((declined / total) * 100) : 0,
    groomRsvpDeclined: groomDeclined,
    brideRsvpDeclined: brideDeclined,
    bothRsvpDeclined: 0,

    idCardReceived: idReceived,
    idCardReceivedPercentage: total > 0 ? Math.round((idReceived / total) * 100) : 0,
    groomIdCardReceived: groomIdReceived,
    brideIdCardReceived: brideIdReceived,
    bothIdCardReceived: 0,

    flightDetailsReceived: flightReceived,
    flightDetailsPercentage: total > 0 ? Math.round((flightReceived / total) * 100) : 0,
    groomFlightDetailsReceived: groomFlightReceived,
    brideFlightDetailsReceived: brideFlightReceived,
    bothFlightDetailsReceived: 0,

    specialRequests,
    notCalledCount: notCalled,
    call1Count: call1,
    call2Count: call2,
    call3CompletedCount: call3Done,
    call3Percentage: total > 0 ? Math.round((call3Done / total) * 100) : 0,
    groomCall3CompletedCount: groomCall3Done,
    brideCall3CompletedCount: brideCall3Done,
    groomCallsInProgress,
    brideCallsInProgress,
    callConnectedCount: callConnected,
    callbackCount: callback,
  };
};

export const GuestModel = {
  // 1. Get all guests with optional wedding_id, side, search, rsvp, idCard, callStatus, callAttempts filtering
  async getAll({
    weddingId = null,
    side = "All",
    search = "",
    rsvp = "All",
    idCard = "All",
    callStatus = "All",
    callAttempts = "All",
    sortBy = "sr_no",
    order = "ASC",
  } = {}) {
    // 1. Check live Supabase DB
    if (supabase) {
      try {
        let query = supabase.from("guests").select("*");

        if (weddingId && weddingId !== "All" && weddingId !== "all") {
          query = query.eq("wedding_id", weddingId);
        }

        const { data, error } = await query;
        if (data && !error) {
          // Sanitize any previously corrupted records and preserve relation
          const sanitized = data.map((g) => {
            const memoryGuest = (store.guests || []).find((mg) => mg.id === g.id);
            const relation = g.relation !== undefined && g.relation !== null ? g.relation : (memoryGuest?.relation || null);
            let fixed = false;
            let callSummary = g.last_call_summary;
            let callStatus = g.call_status;
            let callCount = Number(g.call_count) || 0;

            if (
              callSummary !== null &&
              callSummary !== undefined &&
              g.guest_name &&
              String(callSummary).trim().toLowerCase() === String(g.guest_name).trim().toLowerCase()
            ) {
              callSummary = null;
              fixed = true;
            }

            if (callStatus === "1" || callStatus === "2" || (!isNaN(Number(callStatus)) && callStatus !== "Not Called")) {
              callStatus = callCount > 0 ? "Connected" : "Not Called";
              fixed = true;
            }

            if (fixed && (callSummary === null || !callSummary)) {
              if (callCount === 1 && !g.last_called_at) {
                callCount = 0;
              }
            }

            const updatedRow = {
              ...g,
              relation,
              last_call_summary: callSummary,
              call_status: callStatus,
              call_count: callCount,
            };

            if (fixed) {
              // Asynchronously heal the record in Supabase
              supabase
                .from("guests")
                .update({
                  last_call_summary: callSummary,
                  call_status: callStatus,
                  call_count: callCount,
                })
                .eq("id", g.id)
                .then(() => { })
                .catch(() => { });
            }
            return updatedRow;
          });

          // Keep in-memory store in sync without wiping other weddings
          if (weddingId && weddingId !== "All" && weddingId !== "all") {
            const fetchedIds = new Set(sanitized.map((g) => g.id));
            store.guests = [
              ...sanitized,
              ...(store.guests || []).filter((g) => !fetchedIds.has(g.id)),
            ];
          } else {
            store.guests = sanitized;
          }

          let list = [...sanitized];

          // Side filter
          if (side && side !== "All") {
            list = list.filter((g) => (g.side || "").toLowerCase() === side.toLowerCase());
          }

          // Search keyword
          if (search && search.trim() !== "") {
            const q = search.trim().toLowerCase();
            list = list.filter(
              (g) =>
                (g.guest_name && g.guest_name.toLowerCase().includes(q)) ||
                (g.contact && g.contact.toLowerCase().includes(q)) ||
                (g.relation && g.relation.toLowerCase().includes(q)) ||
                (g.arrival_flight_train_no && g.arrival_flight_train_no.toLowerCase().includes(q)) ||
                (g.departure_flight_train_no && g.departure_flight_train_no.toLowerCase().includes(q)) ||
                (g.arrival_location && g.arrival_location.toLowerCase().includes(q)) ||
                (g.departure_location && g.departure_location.toLowerCase().includes(q)) ||
                (g.special_request && g.special_request.toLowerCase().includes(q)) ||
                (g.last_call_summary && g.last_call_summary.toLowerCase().includes(q))
            );
          }

          // RSVP filter
          if (rsvp && rsvp !== "All") {
            list = list.filter((g) => (g.rsvp_status || "").toLowerCase() === rsvp.toLowerCase());
          }

          // ID Card filter
          if (idCard && idCard !== "All") {
            const isYes = idCard.includes("Yes") || idCard.toLowerCase() === "yes";
            list = list.filter((g) => ((g.id_card_received || "").toLowerCase() === "yes") === isYes);
          }

          // Call status filter
          if (callStatus && callStatus !== "All") {
            list = list.filter((g) => (g.call_status || "").toLowerCase() === callStatus.toLowerCase());
          }

          // Call attempts filter
          if (callAttempts && callAttempts !== "All") {
            if (callAttempts === "0" || callAttempts === "Not Called") {
              list = list.filter((g) => !g.call_count || Number(g.call_count) === 0);
            } else if (callAttempts === "1" || callAttempts === "1 Call") {
              list = list.filter((g) => Number(g.call_count) === 1);
            } else if (callAttempts === "2" || callAttempts === "2 Calls") {
              list = list.filter((g) => Number(g.call_count) === 2);
            } else if (callAttempts === "3+" || callAttempts === "3 Calls Completed" || callAttempts === "3") {
              list = list.filter((g) => Number(g.call_count || 0) >= 3);
            }
          }

          // Sorting
          const isDesc = order.toUpperCase() === "DESC";
          list.sort((a, b) => {
            let valA = a[sortBy] ?? "";
            let valB = b[sortBy] ?? "";
            if (sortBy === "sr_no" || sortBy === "call_count") {
              valA = Number(valA) || 0;
              valB = Number(valB) || 0;
            }
            if (valA < valB) return isDesc ? 1 : -1;
            if (valA > valB) return isDesc ? -1 : 1;
            return 0;
          });

          return list;
        }
      } catch (err) {
        console.warn("Supabase guest getAll notice:", err.message);
      }
    }

    // 2. Query pool fallback
    let query = "SELECT * FROM guests WHERE 1=1";
    const params = [];

    if (weddingId && weddingId !== "All" && weddingId !== "all") {
      params.push(weddingId);
      query += ` AND wedding_id = $${params.length}`;
    }

    if (side && side !== "All") {
      params.push(side);
      query += ` AND LOWER(side) = LOWER($${params.length})`;
    }

    if (search && search.trim() !== "") {
      const searchTerm = `%${search.trim()}%`;
      params.push(searchTerm);
      const pIdx = params.length;
      query += ` AND (
        guest_name ILIKE $${pIdx} OR 
        contact ILIKE $${pIdx} OR 
        relation ILIKE $${pIdx} OR 
        arrival_flight_train_no ILIKE $${pIdx} OR 
        departure_flight_train_no ILIKE $${pIdx} OR 
        arrival_location ILIKE $${pIdx} OR 
        departure_location ILIKE $${pIdx} OR
        special_request ILIKE $${pIdx} OR
        last_call_summary ILIKE $${pIdx}
      )`;
    }

    if (rsvp && rsvp !== "All") {
      params.push(rsvp);
      query += ` AND LOWER(rsvp_status) = LOWER($${params.length})`;
    }

    if (idCard && idCard !== "All") {
      if (idCard === "Received (Yes)" || idCard === "Yes") {
        query += " AND LOWER(id_card_received) = 'yes'";
      } else if (idCard === "Pending (No)" || idCard === "No") {
        query += " AND LOWER(id_card_received) = 'no'";
      }
    }

    if (callStatus && callStatus !== "All") {
      params.push(callStatus);
      query += ` AND LOWER(call_status) = LOWER($${params.length})`;
    }

    if (callAttempts && callAttempts !== "All") {
      if (callAttempts === "0" || callAttempts === "Not Called") {
        query += " AND (call_count = 0 OR call_count IS NULL)";
      } else if (callAttempts === "1" || callAttempts === "1 Call") {
        query += " AND call_count = 1";
      } else if (callAttempts === "2" || callAttempts === "2 Calls") {
        query += " AND call_count = 2";
      } else if (callAttempts === "3+" || callAttempts === "3 Calls Completed" || callAttempts === "3") {
        query += " AND call_count >= 3";
      }
    }

    const allowedSortColumns = [
      "sr_no",
      "guest_name",
      "created_at",
      "arrival_date",
      "departure_date",
      "side",
      "relation",
      "call_count",
      "last_called_at",
    ];
    const sortColumn = allowedSortColumns.includes(sortBy) ? sortBy : "sr_no";
    const sortDirection = order.toUpperCase() === "DESC" ? "DESC" : "ASC";

    query += ` ORDER BY ${sortColumn} ${sortDirection}`;

    const { rows } = await pool.query(query, params);
    return (rows || []).map(sanitizeGuestPublicRecord);
  },

  // 2. Get guest by ID
  async getById(id) {
    const memoryGuest = (store.guests || []).find((g) => g.id === id);
    if (supabase) {
      try {
        const { data } = await supabase.from("guests").select("*").eq("id", id).single();
        if (data) {
          const relation = data.relation !== undefined && data.relation !== null ? data.relation : (memoryGuest?.relation || null);
          return sanitizeGuestPublicRecord({ ...data, relation });
        }
      } catch (e) { }
    }

    const { rows } = await pool.query("SELECT * FROM guests WHERE id = $1", [id]);
    const found = rows[0] || memoryGuest || null;
    return sanitizeGuestPublicRecord(found);
  },

  // 3. Create a new guest
  async create(data) {
    const id = data.id || `guest_${crypto.randomUUID().slice(0, 8)}`;
    const weddingId = data.wedding_id || "wedding_01";

    // Auto-calculate next sr_no within this wedding
    let srNo = data.sr_no;
    if (!srNo) {
      if (supabase) {
        try {
          const { data: existingGuests } = await supabase
            .from("guests")
            .select("sr_no")
            .eq("wedding_id", weddingId);
          if (existingGuests && existingGuests.length > 0) {
            srNo = Math.max(...existingGuests.map((g) => Number(g.sr_no) || 0)) + 1;
          } else {
            srNo = 1;
          }
        } catch (e) {
          srNo = 1;
        }
      } else {
        const { rows: maxResult } = await pool.query(
          "SELECT (COALESCE(MAX(sr_no), 0) + 1)::int AS \"nextSr\" FROM guests WHERE wedding_id = $1",
          [weddingId]
        );
        srNo = maxResult[0]?.nextSr || 1;
      }
    }

    const rawIdCardCopy = data.id_card_copy || null;
    const inlineDataUrl =
      rawIdCardCopy && String(rawIdCardCopy).trim().startsWith("data:")
        ? parseDataUrl(rawIdCardCopy, data.id_card_file_name || `${data.guest_name || "Guest"}_ID_Card`)
        : null;

    const newGuestRecord = {
      id,
      wedding_id: weddingId,
      sr_no: Number(srNo) || 1,
      guest_name: (data.guest_name || "").trim(),
      contact: data.contact || null,
      side: resolveGuestSide(data.side, data.relation),
      relation: data.relation !== undefined && data.relation ? String(data.relation).trim() : null,
      rsvp_status: data.rsvp_status || "Confirmed",
      id_card_received: inlineDataUrl ? "Yes" : (data.id_card_received || "No"),
      arrival_date: data.arrival_date || null,
      arrival_time: data.arrival_time || null,
      arrival_location: data.arrival_location || null,
      arrival_flight_train_no: data.arrival_flight_train_no || null,
      departure_date: data.departure_date || null,
      departure_time: data.departure_time || null,
      departure_location: data.departure_location || null,
      departure_flight_train_no: data.departure_flight_train_no || null,
      id_card_copy: inlineDataUrl ? null : rawIdCardCopy,
      id_card_file_name: inlineDataUrl ? inlineDataUrl.fileName : (data.id_card_file_name || null),
      id_card_mime_type: inlineDataUrl ? inlineDataUrl.mimeType : (data.id_card_mime_type || null),
      id_card_file_size: inlineDataUrl ? inlineDataUrl.fileSize : (data.id_card_file_size || null),
      special_request: data.special_request || null,
      call_count: data.call_count !== undefined && !isNaN(Number(data.call_count)) ? Number(data.call_count) : 0,
      call_status: data.call_status && isNaN(Number(data.call_status)) ? data.call_status : "Not Called",
      last_called_at: data.last_called_at || null,
      last_call_summary:
        data.last_call_summary &&
          data.last_call_summary.trim().toLowerCase() !== (data.guest_name || "").trim().toLowerCase()
          ? data.last_call_summary.trim()
          : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (supabase) {
      try {
        const supaPayload = { ...newGuestRecord };
        const { error: supaErr } = await supabase.from("guests").upsert(supaPayload);
        if (supaErr && (supaErr.message?.includes("relation") || supaErr.code === "PGRST204")) {
          delete supaPayload.relation;
          await supabase.from("guests").upsert(supaPayload);
        }
      } catch (err) {
        console.warn("Supabase guest create notice:", err.message);
      }
    }

    const query = `
      INSERT INTO guests (
        id, wedding_id, sr_no, guest_name, contact, side, relation, rsvp_status, id_card_received,
        arrival_date, arrival_time, arrival_location, arrival_flight_train_no,
        departure_date, departure_time, departure_location, departure_flight_train_no,
        id_card_copy, special_request, call_count, call_status, last_called_at, last_call_summary
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
    `;

    const values = [
      id,
      weddingId,
      newGuestRecord.sr_no,
      newGuestRecord.guest_name,
      newGuestRecord.contact,
      newGuestRecord.side,
      newGuestRecord.relation,
      newGuestRecord.rsvp_status,
      newGuestRecord.id_card_received,
      newGuestRecord.arrival_date,
      newGuestRecord.arrival_time,
      newGuestRecord.arrival_location,
      newGuestRecord.arrival_flight_train_no,
      newGuestRecord.departure_date,
      newGuestRecord.departure_time,
      newGuestRecord.departure_location,
      newGuestRecord.departure_flight_train_no,
      newGuestRecord.id_card_copy,
      newGuestRecord.special_request,
      newGuestRecord.call_count,
      newGuestRecord.call_status,
      newGuestRecord.last_called_at,
      newGuestRecord.last_call_summary,
    ];

    await pool.query(query, values);
    if (inlineDataUrl) {
      await GuestIdCardModel.saveForGuest(id, {
        weddingId,
        fileName: inlineDataUrl.fileName,
        mimeType: inlineDataUrl.mimeType,
        fileData: inlineDataUrl.fileData,
      });
    }
    return this.getById(id);
  },

  // 3b. Bulk create multiple guests
  async bulkCreate(weddingId = "wedding_01", guestList = []) {
    if (!guestList || guestList.length === 0) return [];

    let nextSr = 1;
    if (supabase) {
      try {
        const { data: existing } = await supabase.from("guests").select("sr_no").eq("wedding_id", weddingId);
        if (existing && existing.length > 0) {
          nextSr = Math.max(...existing.map((g) => Number(g.sr_no) || 0)) + 1;
        }
      } catch (e) { }
    } else {
      const { rows: maxResult } = await pool.query(
        "SELECT COALESCE(MAX(sr_no), 0)::int AS \"maxSr\" FROM guests WHERE wedding_id = $1",
        [weddingId]
      );
      nextSr = (maxResult[0]?.maxSr || 0) + 1;
    }

    const createdGuests = [];
    for (const data of guestList) {
      if (!data.guest_name || data.guest_name.trim() === "") continue;

      const id = data.id || `guest_${crypto.randomUUID().slice(0, 8)}`;
      const srNo = data.sr_no || nextSr++;

      const newGuest = {
        id,
        wedding_id: weddingId,
        sr_no: srNo,
        guest_name: data.guest_name.trim(),
        contact: data.contact || null,
        side: resolveGuestSide(data.side, data.relation),
        relation: data.relation !== undefined && data.relation ? String(data.relation).trim() : null,
        rsvp_status: data.rsvp_status || "Confirmed",
        id_card_received: data.id_card_received || "No",
        arrival_date: data.arrival_date || null,
        arrival_time: data.arrival_time || null,
        arrival_location: data.arrival_location || null,
        arrival_flight_train_no: data.arrival_flight_train_no || null,
        departure_date: data.departure_date || null,
        departure_time: data.departure_time || null,
        departure_location: data.departure_location || null,
        departure_flight_train_no: data.departure_flight_train_no || null,
        id_card_copy: data.id_card_copy || null,
        special_request: data.special_request || null,
        call_count: data.call_count !== undefined ? Number(data.call_count) : 0,
        call_status: data.call_status || "Not Called",
        last_called_at: data.last_called_at || null,
        last_call_summary: data.last_call_summary || null,
      };

      if (supabase) {
        try {
          const supaPayload = { ...newGuest };
          const { error: supaErr } = await supabase.from("guests").upsert(supaPayload);
          if (supaErr && (supaErr.message?.includes("relation") || supaErr.code === "PGRST204")) {
            delete supaPayload.relation;
            await supabase.from("guests").upsert(supaPayload);
          }
        } catch (e) { }
      }

      await pool.query(
        `INSERT INTO guests (
          id, wedding_id, sr_no, guest_name, contact, side, relation, rsvp_status, id_card_received,
          arrival_date, arrival_time, arrival_location, arrival_flight_train_no,
          departure_date, departure_time, departure_location, departure_flight_train_no,
          id_card_copy, special_request, call_count, call_status, last_called_at, last_call_summary
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
        [
          id,
          weddingId,
          srNo,
          newGuest.guest_name,
          newGuest.contact,
          newGuest.side,
          newGuest.relation,
          newGuest.rsvp_status,
          newGuest.id_card_received,
          newGuest.arrival_date,
          newGuest.arrival_time,
          newGuest.arrival_location,
          newGuest.arrival_flight_train_no,
          newGuest.departure_date,
          newGuest.departure_time,
          newGuest.departure_location,
          newGuest.departure_flight_train_no,
          newGuest.id_card_copy,
          newGuest.special_request,
          newGuest.call_count,
          newGuest.call_status,
          newGuest.last_called_at,
          newGuest.last_call_summary,
        ]
      );
      createdGuests.push(newGuest);
    }

    return createdGuests;
  },

  // 3c. Bulk upsert multiple guests (High-performance sync)
  async bulkUpsert(weddingId, records = []) {
    if (!records || records.length === 0) return [];

    const now = new Date().toISOString();
    const sanitized = records.map((r, idx) => {
      const id = r.id || `guest_${crypto.randomUUID().slice(0, 8)}`;
      return {
        id,
        wedding_id: weddingId,
        sr_no: r.sr_no && !isNaN(Number(r.sr_no)) ? Number(r.sr_no) : idx + 1,
        guest_name: String(r.guest_name || "Guest").trim(),
        contact: r.contact ? String(r.contact).trim() : null,
        side: resolveGuestSide(r.side, r.relation),
        relation: r.relation ? String(r.relation).trim() : null,
        rsvp_status: r.rsvp_status || "Confirmed",
        id_card_received: r.id_card_received || "No",
        arrival_date: r.arrival_date || null,
        arrival_time: r.arrival_time || null,
        arrival_location: r.arrival_location || null,
        arrival_flight_train_no: r.arrival_flight_train_no || null,
        departure_date: r.departure_date || null,
        departure_time: r.departure_time || null,
        departure_location: r.departure_location || null,
        departure_flight_train_no: r.departure_flight_train_no || null,
        id_card_copy: r.id_card_copy || null,
        id_card_file_name: r.id_card_file_name || null,
        id_card_mime_type: r.id_card_mime_type || null,
        id_card_file_size: r.id_card_file_size || null,
        special_request: r.special_request || null,
        call_count: r.call_count !== undefined && !isNaN(Number(r.call_count)) ? Number(r.call_count) : 0,
        call_status: r.call_status || "Not Called",
        last_called_at: r.last_called_at || null,
        last_call_summary: r.last_call_summary || null,
        created_at: r.created_at || now,
        updated_at: now,
      };
    });

    // Enforce strictly unique IDs across the entire batch
    const seenBatchIds = new Set();
    for (const item of sanitized) {
      if (!item.id || seenBatchIds.has(item.id)) {
        item.id = `guest_${crypto.randomUUID().slice(0, 8)}`;
      }
      seenBatchIds.add(item.id);
    }

    // 1. PostgreSQL batch upsert into DigitalOcean Linux VM
    try {
      for (const g of sanitized) {
        const upsertQuery = `
          INSERT INTO guests (
            id, wedding_id, sr_no, guest_name, contact, side, relation, rsvp_status, id_card_received,
            arrival_date, arrival_time, arrival_location, arrival_flight_train_no,
            departure_date, departure_time, departure_location, departure_flight_train_no,
            id_card_copy, special_request, call_count, call_status, last_called_at, last_call_summary,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW())
          ON CONFLICT (id) DO UPDATE SET
            wedding_id = EXCLUDED.wedding_id,
            sr_no = EXCLUDED.sr_no,
            guest_name = EXCLUDED.guest_name,
            contact = EXCLUDED.contact,
            side = EXCLUDED.side,
            relation = EXCLUDED.relation,
            rsvp_status = EXCLUDED.rsvp_status,
            id_card_received = EXCLUDED.id_card_received,
            arrival_date = EXCLUDED.arrival_date,
            arrival_time = EXCLUDED.arrival_time,
            arrival_location = EXCLUDED.arrival_location,
            arrival_flight_train_no = EXCLUDED.arrival_flight_train_no,
            departure_date = EXCLUDED.departure_date,
            departure_time = EXCLUDED.departure_time,
            departure_location = EXCLUDED.departure_location,
            departure_flight_train_no = EXCLUDED.departure_flight_train_no,
            id_card_copy = EXCLUDED.id_card_copy,
            special_request = EXCLUDED.special_request,
            call_count = EXCLUDED.call_count,
            call_status = EXCLUDED.call_status,
            last_called_at = EXCLUDED.last_called_at,
            last_call_summary = EXCLUDED.last_call_summary,
            updated_at = NOW()
        `;
        const values = [
          g.id,
          g.wedding_id || "wedding_01",
          g.sr_no || 1,
          g.guest_name,
          g.contact || null,
          g.side || "Groom",
          g.relation || null,
          g.rsvp_status || "Confirmed",
          g.id_card_received || "No",
          g.arrival_date || null,
          g.arrival_time || null,
          g.arrival_location || null,
          g.arrival_flight_train_no || null,
          g.departure_date || null,
          g.departure_time || null,
          g.departure_location || null,
          g.departure_flight_train_no || null,
          g.id_card_copy || null,
          g.special_request || null,
          Number(g.call_count) || 0,
          g.call_status || "Not Called",
          g.last_called_at || null,
          g.last_call_summary || null,
        ];
        await pool.query(upsertQuery, values);
      }
    } catch (err) {
      console.warn("PostgreSQL bulkUpsert note:", err.message);
    }

    // 2. Synchronize store.guests in memory
    for (const g of sanitized) {
      const existIdx = (store.guests || []).findIndex((mg) => mg.id === g.id);
      if (existIdx >= 0) {
        store.guests[existIdx] = { ...store.guests[existIdx], ...g };
      } else {
        store.guests.push(g);
      }
    }
    saveGuestsToFile();

    return sanitized;
  },

  // 3d. Find guest by sr_no
  async findBySrNo(weddingId, srNo) {
    if (!weddingId || !srNo) return null;
    const targetSr = Number(srNo);
    if (supabase) {
      try {
        const { data } = await supabase
          .from("guests")
          .select("*")
          .eq("wedding_id", weddingId)
          .eq("sr_no", targetSr)
          .maybeSingle();
        if (data) return data;
      } catch (e) { }
    }
    const fromStore = (store.guests || []).find(
      (g) => g.wedding_id === weddingId && Number(g.sr_no) === targetSr
    );
    if (fromStore) return fromStore;

    const { rows } = await pool.query(
      "SELECT * FROM guests WHERE wedding_id = $1 AND sr_no = $2",
      [weddingId, targetSr]
    );
    return rows[0] || null;
  },

  // 3e. Find guest by name
  async findByName(weddingId, guestName) {
    if (!weddingId || !guestName) return null;
    const clean = String(guestName).trim().toLowerCase();
    if (supabase) {
      try {
        const { data } = await supabase
          .from("guests")
          .select("*")
          .eq("wedding_id", weddingId)
          .ilike("guest_name", clean)
          .maybeSingle();
        if (data) return data;
      } catch (e) { }
    }
    const fromStore = (store.guests || []).find(
      (g) => g.wedding_id === weddingId && String(g.guest_name || "").trim().toLowerCase() === clean
    );
    if (fromStore) return fromStore;

    const { rows } = await pool.query(
      "SELECT * FROM guests WHERE wedding_id = $1 AND LOWER(TRIM(guest_name)) = LOWER(TRIM($2))",
      [weddingId, clean]
    );
    return rows[0] || null;
  },

  // 4. Update an existing guest
  async update(id, data) {
    const existing = await this.getById(id);
    if (!existing) return null;

    const rawIdCard = data.id_card_copy;
    const isNewInlineUpload =
      Boolean(rawIdCard) &&
      rawIdCard !== existing.id_card_copy &&
      String(rawIdCard).trim().startsWith("data:");
    const inlineDataUrl = isNewInlineUpload
      ? parseDataUrl(rawIdCard, data.id_card_file_name || `${data.guest_name || existing.guest_name || "Guest"}_ID_Card`)
      : null;
    const shouldDeleteIdCard =
      data.remove_id_card === true ||
      (rawIdCard !== undefined && (rawIdCard === "" || rawIdCard === null) && Boolean(existing.id_card_copy));

    // Clean and validate every single field strictly according to schema
    const cleanRecord = {
      wedding_id: data.wedding_id !== undefined && data.wedding_id !== null ? String(data.wedding_id) : existing.wedding_id,
      sr_no: data.sr_no !== undefined && data.sr_no !== "" && !isNaN(Number(data.sr_no)) ? Number(data.sr_no) : (existing.sr_no || 1),
      guest_name: data.guest_name !== undefined ? String(data.guest_name).trim() : existing.guest_name,
      contact: data.contact !== undefined ? (data.contact ? String(data.contact).trim() : null) : existing.contact,
      side: data.side !== undefined && data.side ? resolveGuestSide(data.side, data.relation !== undefined ? data.relation : existing.relation) : (existing.side || "Groom"),
      relation: data.relation !== undefined ? (data.relation ? String(data.relation).trim() : null) : (existing.relation || null),
      rsvp_status: data.rsvp_status !== undefined && data.rsvp_status ? String(data.rsvp_status) : (existing.rsvp_status || "Confirmed"),
      id_card_received: inlineDataUrl
        ? "Yes"
        : data.id_card_received !== undefined && data.id_card_received
          ? String(data.id_card_received)
          : existing.id_card_received || "No",
      arrival_date: data.arrival_date !== undefined ? (data.arrival_date || null) : existing.arrival_date,
      arrival_time: data.arrival_time !== undefined ? (data.arrival_time || null) : existing.arrival_time,
      arrival_location: data.arrival_location !== undefined ? (data.arrival_location || null) : existing.arrival_location,
      arrival_flight_train_no: data.arrival_flight_train_no !== undefined ? (data.arrival_flight_train_no || null) : existing.arrival_flight_train_no,
      departure_date: data.departure_date !== undefined ? (data.departure_date || null) : existing.departure_date,
      departure_time: data.departure_time !== undefined ? (data.departure_time || null) : existing.departure_time,
      departure_location: data.departure_location !== undefined ? (data.departure_location || null) : existing.departure_location,
      departure_flight_train_no: data.departure_flight_train_no !== undefined ? (data.departure_flight_train_no || null) : existing.departure_flight_train_no,
      id_card_copy: inlineDataUrl
        ? existing.id_card_copy || null
        : rawIdCard !== undefined
          ? (rawIdCard || null)
          : existing.id_card_copy,
      id_card_file_name: inlineDataUrl
        ? inlineDataUrl.fileName
        : shouldDeleteIdCard
          ? null
          : data.id_card_file_name !== undefined
            ? data.id_card_file_name
            : existing.id_card_file_name || null,
      id_card_mime_type: inlineDataUrl
        ? inlineDataUrl.mimeType
        : shouldDeleteIdCard
          ? null
          : data.id_card_mime_type !== undefined
            ? data.id_card_mime_type
            : existing.id_card_mime_type || null,
      id_card_file_size: inlineDataUrl
        ? inlineDataUrl.fileSize
        : shouldDeleteIdCard
          ? null
          : data.id_card_file_size !== undefined
            ? data.id_card_file_size
            : existing.id_card_file_size || null,
      special_request: data.special_request !== undefined ? (data.special_request || null) : existing.special_request,
      call_count: data.call_count !== undefined && data.call_count !== "" && !isNaN(Number(data.call_count)) ? Number(data.call_count) : (existing.call_count || 0),
      call_status: data.call_status !== undefined && data.call_status && isNaN(Number(data.call_status)) ? String(data.call_status) : (existing.call_status && isNaN(Number(existing.call_status)) ? existing.call_status : "Not Called"),
      last_called_at: data.last_called_at !== undefined ? (data.last_called_at || null) : existing.last_called_at,
      last_call_summary: data.last_call_summary !== undefined ? (data.last_call_summary || null) : existing.last_call_summary,
      updated_at: new Date().toISOString(),
    };

    // Safety guard: ensure last_call_summary is NEVER accidentally set to guest_name
    if (
      cleanRecord.last_call_summary !== null &&
      cleanRecord.last_call_summary !== undefined &&
      cleanRecord.guest_name &&
      String(cleanRecord.last_call_summary).trim().toLowerCase() === String(cleanRecord.guest_name).trim().toLowerCase()
    ) {
      cleanRecord.last_call_summary = null;
    }
    if (cleanRecord.call_status === "1" || cleanRecord.call_status === "2" || (!isNaN(Number(cleanRecord.call_status)) && cleanRecord.call_status !== "Not Called")) {
      cleanRecord.call_status = Number(cleanRecord.call_count) > 0 ? "Connected" : "Not Called";
    }

    let updatedResult = null;

    if (supabase) {
      try {
        const supaPayload = { ...cleanRecord };
        const { data: supaUpdated, error: supaError } = await supabase
          .from("guests")
          .update(supaPayload)
          .eq("id", id)
          .select();

        if (supaError && (supaError.message?.includes("relation") || supaError.code === "PGRST204")) {
          delete supaPayload.relation;
          const { data: retryUpdated } = await supabase
            .from("guests")
            .update(supaPayload)
            .eq("id", id)
            .select();
          if (retryUpdated && retryUpdated.length > 0) {
            updatedResult = { ...retryUpdated[0], relation: cleanRecord.relation };
          }
        } else if (supaError) {
          console.error("❌ Supabase guest update error:", supaError.message, supaError.details || "");
        } else if (supaUpdated && supaUpdated.length > 0) {
          updatedResult = supaUpdated[0];
        }
      } catch (err) {
        console.warn("Supabase guest update notice:", err.message);
      }
    }

    // Always keep in-memory store in sync
    const merged = { ...existing, ...cleanRecord, id };
    const sIdx = store.guests.findIndex((g) => g.id === id);
    if (sIdx >= 0) {
      store.guests[sIdx] = { ...store.guests[sIdx], ...merged };
    } else {
      store.guests.push(merged);
    }

    try {
      const query = `
        UPDATE guests SET
          wedding_id = $1,
          sr_no = $2,
          guest_name = $3,
          contact = $4,
          side = $5,
          relation = $6,
          rsvp_status = $7,
          id_card_received = $8,
          arrival_date = $9,
          arrival_time = $10,
          arrival_location = $11,
          arrival_flight_train_no = $12,
          departure_date = $13,
          departure_time = $14,
          departure_location = $15,
          departure_flight_train_no = $16,
          id_card_copy = $17,
          special_request = $18,
          call_count = $19,
          call_status = $20,
          last_called_at = $21,
          last_call_summary = $22,
          updated_at = NOW()
        WHERE id = $23
      `;

      const values = [
        cleanRecord.wedding_id,
        cleanRecord.sr_no,
        cleanRecord.guest_name,
        cleanRecord.contact,
        cleanRecord.side,
        cleanRecord.relation,
        cleanRecord.rsvp_status,
        cleanRecord.id_card_received,
        cleanRecord.arrival_date,
        cleanRecord.arrival_time,
        cleanRecord.arrival_location,
        cleanRecord.arrival_flight_train_no,
        cleanRecord.departure_date,
        cleanRecord.departure_time,
        cleanRecord.departure_location,
        cleanRecord.departure_flight_train_no,
        cleanRecord.id_card_copy,
        cleanRecord.special_request,
        cleanRecord.call_count,
        cleanRecord.call_status,
        cleanRecord.last_called_at,
        cleanRecord.last_call_summary,
        id,
      ];

      await pool.query(query, values);
    } catch (poolErr) {
      console.warn("Pool query update notice:", poolErr.message);
    }

    if (inlineDataUrl) {
      await GuestIdCardModel.saveForGuest(id, {
        weddingId: cleanRecord.wedding_id,
        fileName: inlineDataUrl.fileName,
        mimeType: inlineDataUrl.mimeType,
        fileData: inlineDataUrl.fileData,
      });
      return this.getById(id);
    }

    if (shouldDeleteIdCard) {
      await GuestIdCardModel.deleteByGuestId(id, {
        markPending: cleanRecord.id_card_received === "No",
      });
      return this.getById(id);
    }

    return sanitizeGuestPublicRecord(updatedResult || merged);
  },

  // 5. Delete a guest and their call logs
  async delete(id) {
    if (supabase) {
      try {
        await supabase.from("guest_call_logs").delete().eq("guest_id", id);
        await supabase.from("guests").delete().eq("id", id);
      } catch (err) {
        console.warn("Supabase guest delete notice:", err.message);
      }
    }

    await pool.query("DELETE FROM guest_id_cards WHERE guest_id = $1", [id]).catch(() => { });
    await pool.query("DELETE FROM guest_call_logs WHERE guest_id = $1", [id]).catch(() => { });
    const result = await pool.query("DELETE FROM guests WHERE id = $1", [id]);
    return (result.rowCount || result.affectedRows) > 0;
  },

  // 6. Get dashboard statistics (optionally scoped to a wedding)
  async getStatistics(weddingId = null) {
    try {
      let sql = "SELECT * FROM guests WHERE 1=1";
      const params = [];
      if (weddingId && weddingId !== "All" && weddingId !== "all") {
        params.push(weddingId);
        sql += ` AND wedding_id = $${params.length}`;
      }
      const { rows } = await pool.query(sql, params);
      if (rows && rows.length > 0) {
        return calculateGuestStats(rows);
      }
    } catch (err) {
      console.warn("PostgreSQL getStatistics note:", err.message);
    }

    // In-memory fallback
    let list = store.guests || [];
    if (weddingId && weddingId !== "All" && weddingId !== "all") {
      list = list.filter((g) => g.wedding_id === weddingId);
    }
    return calculateGuestStats(list);
  },
};

