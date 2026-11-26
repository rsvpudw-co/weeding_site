// API Service for Multi-Wedding, Guest Logistics & Call Center Management
import { API_BASE_URL, BACKEND_SERVER_URL } from "../config/apiConfig";
import { generate500GuestsForRohanPriya } from "./guestGenerator.js";

export { API_BASE_URL, BACKEND_SERVER_URL };

// Initial fallback users
export const DEFAULT_USERS = {
  admin: {
    id: "user_admin_01",
    name: "Manish",
    email: "admin@emitly.com",
    role: "admin",
    phone: "+91 98765 00001",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
  },
  callCenter: {
    id: "user_agent_01",
    name: "Sarah (Call Desk)",
    email: "callcenter@emitly.com",
    role: "call_center",
    phone: "+91 98765 00002",
    avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
  },
};

// Automatic startup purge: wipe any legacy stale localStorage caches from older versions
try {
  const legacyKeys = [
    "manish_auth_user",
    "manish_auth_token",
    "manish_weddings_data",
    "manish_guest_data_v3",
    "manish_guest_data_v2",
    "manish_guest_data",
    "manish_call_logs_v1",
    "manish_selected_wedding_id",
    "manish_custom_users",
    "manish_chat_active_wedding",
  ];
  legacyKeys.forEach((k) => {
    try { localStorage.removeItem(k); } catch (e) {}
  });
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && (k.startsWith("cached_messages_") || k.startsWith("chat_last_seen_"))) {
      try { localStorage.removeItem(k); } catch (e) {}
    }
  }
} catch (e) {}

export const getCurrentAuthUser = () => {
  try {
    const raw = sessionStorage.getItem("manish_auth_user");
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
};

export const getAuthToken = () => {
  try {
    return sessionStorage.getItem("manish_auth_token") || "";
  } catch (e) {
    return "";
  }
};

export const getCurrentUserRole = () => {
  return getCurrentAuthUser()?.role || null;
};

export const getCurrentUserWeddingId = () => {
  return getCurrentAuthUser()?.wedding_id || null;
};

// Initial seed / fallback weddings (Empty by default)
const INITIAL_FALLBACK_WEDDINGS = [];

// Initial seed guests scoped to weddings (Empty by default)
const INITIAL_FALLBACK_GUESTS = [];

// Initial fallback call logs (Empty by default)
const INITIAL_FALLBACK_CALL_LOGS = {};

const sanitizeWeddingFrontend = (w) => {
  if (!w || typeof w !== "object") return w;
  let groom = typeof w.groom_name === "string" ? w.groom_name.trim() : String(w.groom_name || "").trim();
  if (!groom || groom.startsWith("wedding_") || groom === w.id) {
    if (w.client_username) {
      const uPart = String(w.client_username).split("_")[0]?.replace(/[0-9]/g, "");
      if (uPart) groom = uPart.charAt(0).toUpperCase() + uPart.slice(1);
    }
    if (!groom || groom.startsWith("wedding_")) groom = "Groom";
  }
  let bride = typeof w.bride_name === "string" ? w.bride_name.trim() : String(w.bride_name || "").trim();
  if (!bride) bride = "Bride";
  return { ...w, groom_name: groom, bride_name: bride };
};

// Helper to manage session-scoped cache
const getCachedWeddings = () => {
  try {
    const cached = sessionStorage.getItem("manish_weddings_data");
    let weddingList = (cached ? JSON.parse(cached) : INITIAL_FALLBACK_WEDDINGS).map(sanitizeWeddingFrontend);
    const guests = getCachedGuests();

    const role = getCurrentUserRole();
    const userWeddingId = getCurrentUserWeddingId();
    if ((role === "call_center" || role === "marriage_client") && userWeddingId && userWeddingId !== "all") {
      weddingList = weddingList.filter((w) => w.id === userWeddingId);
    }

    return weddingList.map((w) => {
      const wGuests = guests.filter((g) => g.wedding_id === w.id);
      const confirmed = wGuests.filter(
        (g) => (g.rsvp_status || "").toLowerCase() === "confirmed"
      ).length;
      const bride = wGuests.filter(
        (g) => (g.side || "").toLowerCase() === "bride"
      ).length;
      const groom = wGuests.filter(
        (g) => (g.side || "").toLowerCase() === "groom"
      ).length;
      return {
        ...w,
        total_guests: wGuests.length,
        confirmed_guests: confirmed,
        bride_guests: bride,
        groom_guests: groom,
      };
    });
  } catch (e) { }
  return INITIAL_FALLBACK_WEDDINGS.map(sanitizeWeddingFrontend);
};

const setCachedWeddings = (weddings) => {
  try {
    const sanitized = (weddings || []).map(sanitizeWeddingFrontend);
    sessionStorage.setItem("manish_weddings_data", JSON.stringify(sanitized));
  } catch (e) { }
};

const sanitizeGuestRecord = (g) => {
  if (!g) return g;
  let summary = g.last_call_summary;
  let status = g.call_status;
  let count = Number(g.call_count) || 0;

  if (summary !== null && summary !== undefined && g.guest_name) {
    const sStr = String(summary).trim().toLowerCase();
    const nStr = String(g.guest_name).trim().toLowerCase();
    if (sStr.length > 0 && sStr === nStr) {
      summary = null;
    }
  }

  const statusStr = String(status || "");
  if (statusStr === "1" || statusStr === "2" || (!isNaN(Number(statusStr)) && statusStr !== "" && statusStr !== "Not Called")) {
    status = count > 0 ? "Connected" : "Not Called";
  }

  if (!summary && count === 1 && !g.last_called_at) {
    count = 0;
  }

  let safeIdCopy = g.id_card_copy;
  let hasIdCard = Boolean(g.has_id_card || g.id_card_mime_type);
  if (safeIdCopy && /\/guests\/[^/]+\/id-card/i.test(String(safeIdCopy))) {
    hasIdCard = true;
    const isImg = String(g.id_card_mime_type || "").toLowerCase().startsWith("image/");
    safeIdCopy = g.id_card_file_name || (isImg ? "ID_Card_Photo.jpg" : "ID_Card_Document.pdf");
  }

  return {
    ...g,
    id_card_copy: safeIdCopy,
    has_id_card: hasIdCard || Boolean(safeIdCopy && String(safeIdCopy).trim().startsWith("data:")),
    last_call_summary: summary,
    call_status: status || "Not Called",
    call_count: count,
  };
};

const getCachedGuests = () => {
  try {
    const cached = sessionStorage.getItem("manish_guest_data_v3");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        return parsed.map(sanitizeGuestRecord);
      }
    }
  } catch (e) { }
  return INITIAL_FALLBACK_GUESTS.map(sanitizeGuestRecord);
};

const setCachedGuests = (guests) => {
  try {
    const sanitized = Array.isArray(guests) ? guests.map(sanitizeGuestRecord) : [];
    sessionStorage.setItem("manish_guest_data_v3", JSON.stringify(sanitized));
  } catch (e) {
    try {
      const sanitized = Array.isArray(guests)
        ? guests.map((g) => ({
            ...sanitizeGuestRecord(g),
            id_card_copy: g.id_card_copy && g.id_card_copy.length > 50000 ? g.id_card_copy.slice(0, 100) : g.id_card_copy,
          }))
        : [];
      sessionStorage.setItem("manish_guest_data_v3", JSON.stringify(sanitized));
    } catch (e2) { }
  }
};

const getCachedCallLogs = (guestId) => {
  try {
    const all = JSON.parse(sessionStorage.getItem("manish_call_logs_v1") || "{}");
    return all[guestId] || INITIAL_FALLBACK_CALL_LOGS[guestId] || [];
  } catch (e) { }
  return INITIAL_FALLBACK_CALL_LOGS[guestId] || [];
};

const setCachedCallLogs = (guestId, logs) => {
  try {
    const all = JSON.parse(sessionStorage.getItem("manish_call_logs_v1") || "{}");
    all[guestId] = logs;
    sessionStorage.setItem("manish_call_logs_v1", JSON.stringify(all));
  } catch (e) { }
};

// Calculate stats from list
export const calculateStatsFromList = (guests = []) => {
  const total = guests.length;

  const groomGuests = guests.filter((g) => (g.side || "").toLowerCase() === "groom");
  const brideGuests = guests.filter((g) => (g.side || "").toLowerCase() === "bride");

  const groomCount = groomGuests.length;
  const brideCount = brideGuests.length;

  // RSVP Check helpers
  const isConfirmedRsvp = (status = "") => status.toLowerCase() === "confirmed";
  const isPendingRsvp = (status = "") => status.toLowerCase() === "pending";
  const isDeclinedRsvp = (status = "") => {
    const s = status.toLowerCase();
    return s === "declined" || s.includes("regret") || s.includes("not attending") || s.includes("not coming") || s === "no";
  };

  // RSVP Confirmed
  const confirmed = guests.filter((g) => isConfirmedRsvp(g.rsvp_status || "")).length;
  const groomConfirmed = groomGuests.filter((g) => isConfirmedRsvp(g.rsvp_status || "")).length;
  const brideConfirmed = brideGuests.filter((g) => isConfirmedRsvp(g.rsvp_status || "")).length;

  // RSVP Pending
  const pending = guests.filter((g) => isPendingRsvp(g.rsvp_status || "")).length;
  const groomPending = groomGuests.filter((g) => isPendingRsvp(g.rsvp_status || "")).length;
  const bridePending = brideGuests.filter((g) => isPendingRsvp(g.rsvp_status || "")).length;

  // RSVP Regrets / Declined (Not Coming)
  const declined = guests.filter((g) => isDeclinedRsvp(g.rsvp_status || "")).length;
  const groomDeclined = groomGuests.filter((g) => isDeclinedRsvp(g.rsvp_status || "")).length;
  const brideDeclined = brideGuests.filter((g) => isDeclinedRsvp(g.rsvp_status || "")).length;

  // ID Cards
  const idReceived = guests.filter(
    (g) => (g.id_card_received || "").toLowerCase() === "yes"
  ).length;
  const groomIdReceived = groomGuests.filter(
    (g) => (g.id_card_received || "").toLowerCase() === "yes"
  ).length;
  const brideIdReceived = brideGuests.filter(
    (g) => (g.id_card_received || "").toLowerCase() === "yes"
  ).length;

  // Confirmed Flight / Travel Details
  const hasFlight = (g) =>
    (g.arrival_flight_train_no && g.arrival_flight_train_no.trim() !== "") ||
    (g.arrival_date && g.arrival_date.trim() !== "") ||
    (g.departure_flight_train_no && g.departure_flight_train_no.trim() !== "") ||
    (g.departure_date && g.departure_date.trim() !== "");

  const flightReceived = guests.filter(hasFlight).length;
  const groomFlightReceived = groomGuests.filter(hasFlight).length;
  const brideFlightReceived = brideGuests.filter(hasFlight).length;

  // Travel Logistics stats
  const arrivalSet = guests.filter(
    (g) => g.arrival_date || g.arrival_flight_train_no || g.arrival_time
  ).length;
  const groomArrivalSet = groomGuests.filter(
    (g) => g.arrival_date || g.arrival_flight_train_no || g.arrival_time
  ).length;
  const brideArrivalSet = brideGuests.filter(
    (g) => g.arrival_date || g.arrival_flight_train_no || g.arrival_time
  ).length;

  const departureSet = guests.filter(
    (g) => g.departure_date || g.departure_flight_train_no || g.departure_time
  ).length;
  const groomDepartureSet = groomGuests.filter(
    (g) => g.departure_date || g.departure_flight_train_no || g.departure_time
  ).length;
  const brideDepartureSet = brideGuests.filter(
    (g) => g.departure_date || g.departure_flight_train_no || g.departure_time
  ).length;

  const specialRequests = guests.filter(
    (g) => g.special_request && g.special_request.trim() !== ""
  ).length;

  const notCalled = guests.filter((g) => !g.call_count || g.call_count === 0).length;
  const call1 = guests.filter((g) => g.call_count === 1).length;
  const call2 = guests.filter((g) => g.call_count === 2).length;
  const call3Done = guests.filter((g) => (g.call_count || 0) >= 3).length;
  const groomCall3Done = groomGuests.filter((g) => (g.call_count || 0) >= 3).length;
  const brideCall3Done = brideGuests.filter((g) => (g.call_count || 0) >= 3).length;

  const groomCallsInProgress = Math.max(0, groomCount - groomCall3Done);
  const brideCallsInProgress = Math.max(0, brideCount - brideCall3Done);

  const callConnected = guests.filter(
    (g) => (g.call_status || "").toLowerCase().includes("connected") || (g.call_status || "").toLowerCase().includes("confirmed")
  ).length;
  const callback = guests.filter(
    (g) => (g.call_status || "").toLowerCase().includes("callback")
  ).length;

  return {
    totalRegistered: total,
    groomSideCount: groomCount,
    brideSideCount: brideCount,
    bothSideCount: 0,

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

    arrivalSetCount: arrivalSet,
    groomArrivalSet: groomArrivalSet,
    brideArrivalSet: brideArrivalSet,

    departureSetCount: departureSet,
    groomDepartureSet: groomDepartureSet,
    brideDepartureSet: brideDepartureSet,

    specialRequests: specialRequests,
    notCalledCount: notCalled,
    call1Count: call1,
    call2Count: call2,
    call3CompletedCount: call3Done,
    call3Percentage: total > 0 ? Math.round((call3Done / total) * 100) : 0,
    groomCall3CompletedCount: groomCall3Done,
    brideCall3CompletedCount: brideCall3Done,
    groomCallsInProgress: groomCallsInProgress,
    brideCallsInProgress: brideCallsInProgress,

    callConnectedCount: callConnected,
    callbackCount: callback,
  };
};

// Helper to auto-generate marriage client portal credentials
export const generateWeddingCredentials = (groomName = "", brideName = "", weddingDate = "") => {
  const groomFirst = (groomName || "groom").trim().split(" ")[0].toLowerCase().replace(/[^a-z0-9]/g, "") || "groom";
  const brideFirst = (brideName || "bride").trim().split(" ")[0].toLowerCase().replace(/[^a-z0-9]/g, "") || "bride";
  const username = `${groomFirst}_${brideFirst}`;

  let year = "2026";
  if (weddingDate && weddingDate.length >= 4) {
    const matchedYear = weddingDate.match(/\d{4}/);
    if (matchedYear) year = matchedYear[0];
  }

  const capGroom = groomFirst.charAt(0).toUpperCase() + groomFirst.slice(1);
  const password = `${capGroom}@${year}`;

  return { username, password };
};

export const api = {
  // ------------------- AUTHENTICATION -------------------
  async login(identifier, password) {
    const cleanId = (identifier || "").trim();
    const cleanPass = (password || "").trim();

    if (!cleanId || !cleanPass) {
      throw new Error("Please enter both username/email and password.");
    }

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanId, username: cleanId, password: cleanPass }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.user) {
          return json;
        }
      } else {
        const errorJson = await res.json().catch(() => ({}));
        if (res.status !== 401 && errorJson.message) {
          throw new Error(errorJson.message);
        }
      }
    } catch (e) {
      if (e.message && !e.message.includes("Failed to fetch") && !e.message.includes("NetworkError")) {
        // If it's an explicit custom backend error, check fallback
      }
    }

    // Client fallback login
    const idLower = cleanId.toLowerCase();
    const idBase = idLower
      .replace("@weddingportal.com", "")
      .replace("@weddingsite.com", "")
      .replace("@emitly.com", "")
      .trim();

    // 1. Admin Fallback
    if (
      idLower === "admin" ||
      idLower === "admin@emitly.com" ||
      idLower === "admin@weddingsite.com" ||
      idLower === "manish" ||
      idLower.includes("admin")
    ) {
      if (cleanPass === "manish1122" || cleanPass === "admin123") {
        return {
          success: true,
          message: "Welcome back, Manish (Admin)!",
          user: DEFAULT_USERS.admin,
          token: `mock_admin_${Date.now()}`,
        };
      }
      throw new Error("Invalid Admin password. Default is manish1122.");
    }

    // 2. Call Center Fallback
    if (
      idLower === "callcenter" ||
      idLower === "callcenter@emitly.com" ||
      idLower === "callcenter@weddingsite.com" ||
      idLower === "sarah" ||
      idLower.includes("call") ||
      idLower.includes("agent") ||
      idLower === "telecaller"
    ) {
      if (cleanPass === "call123" || cleanPass === "callcenter123") {
        return {
          success: true,
          message: "Welcome back, Sarah (Call Center Desk)!",
          user: DEFAULT_USERS.callCenter,
          token: `mock_call_center_${Date.now()}`,
        };
      }
      throw new Error("Invalid Call Center password. Default is call123.");
    }

    // 3. Marriage / Client Portal Fallback
    const weddings = getCachedWeddings();
    const matchingWedding = weddings.find((w) => {
      const wUser = (w.client_username || "").toLowerCase().trim();
      const wId = (w.id || "").toLowerCase().trim();
      const wGroom = (w.groom_name || "").toLowerCase().trim();
      const wBride = (w.bride_name || "").toLowerCase().trim();
      const combined = `${wGroom}_${wBride}`.replace(/[^a-z0-9_]/g, "");

      const userMatch =
        wUser === idLower ||
        wUser === idBase ||
        wId === idLower ||
        wId === idBase ||
        `${wUser}@weddingportal.com` === idLower ||
        `${wUser}@weddingsite.com` === idLower ||
        `${wUser}@emitly.com` === idLower ||
        combined === idBase ||
        `${wGroom} & ${wBride}` === idLower ||
        wGroom.includes(idBase) ||
        wBride.includes(idBase);

      const passMatch =
        (w.client_password && w.client_password.trim() === cleanPass) ||
        (cleanPass.toLowerCase() === (w.client_password || "").toLowerCase().trim());

      return userMatch && passMatch;
    });

    if (matchingWedding) {
      const clientUser = {
        id: `marriage_${matchingWedding.id}`,
        name: `${matchingWedding.groom_name} & ${matchingWedding.bride_name}`,
        email: `${matchingWedding.client_username || matchingWedding.id}@weddingportal.com`,
        username: matchingWedding.client_username || matchingWedding.id,
        role: "marriage_client",
        wedding_id: matchingWedding.id,
        venue: matchingWedding.venue,
        city: matchingWedding.city,
        wedding_date: matchingWedding.wedding_date,
        cover_theme: matchingWedding.cover_theme,
        avatar: null,
        is_view_only: true,
        wedding: matchingWedding,
      };

      return {
        success: true,
        message: `Welcome to ${matchingWedding.groom_name} & ${matchingWedding.bride_name}'s Wedding Portal!`,
        user: clientUser,
        token: `mock_client_${matchingWedding.id}_${Date.now()}`,
      };
    }

    throw new Error("Invalid username, email, or password. Please check your credentials.");
  },

  async getMe(userId) {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me?userId=${userId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) return json.user;
      }
    } catch (e) { }
    return null;
  },

  // ------------------- WEDDINGS (MARRIAGE CARDS) -------------------
  async fetchWeddings() {
    try {
      const token = getAuthToken();
      const headers = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/weddings`, { headers });
      if (res.ok) {
        const json = await res.json();
        const rawList = Array.isArray(json)
          ? json
          : Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.weddings)
          ? json.weddings
          : [];

        if (Array.isArray(rawList)) {
          const sanitized = rawList.map(sanitizeWeddingFrontend);
          if (sanitized.length > 0) {
            setCachedWeddings(sanitized);
            return sanitized;
          }
        }
      }
    } catch (e) {
      console.warn("fetchWeddings network notice:", e?.message || e);
    }

    return getCachedWeddings();
  },
  async createWedding(weddingData) {
    // Generate credentials if not supplied
    const creds = generateWeddingCredentials(
      weddingData.groom_name,
      weddingData.bride_name,
      weddingData.wedding_date
    );

    const payload = {
      ...weddingData,
      client_username: weddingData.client_username || creds.username,
      client_password: weddingData.client_password || creds.password,
    };

    try {
      const res = await fetch(`${API_BASE_URL}/weddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) return json.data;
      }
    } catch (e) { }

    const list = getCachedWeddings();
    const newWedding = {
      ...payload,
      id: `wedding_${Date.now().toString(36)}`,
      created_at: new Date().toISOString(),
      total_guests: 0,
      confirmed_guests: 0,
      bride_guests: 0,
      groom_guests: 0,
    };
    const updated = [newWedding, ...list];
    setCachedWeddings(updated);
    return newWedding;
  },

  async updateWedding(id, weddingData) {
    let updated = null;
    try {
      const res = await fetch(`${API_BASE_URL}/weddings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(weddingData),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          updated = json.data;
        }
      }
    } catch (e) { }

    const list = getCachedWeddings();
    const idx = list.findIndex((w) => w.id === id);
    const finalWedding = updated || { ...weddingData, id };
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...finalWedding };
    } else {
      list.push(finalWedding);
    }
    setCachedWeddings(list);
    return list[idx] || finalWedding;
  },

  async deleteWedding(id) {
    if (!id) return true;

    // 1. Purge from local browser session cache immediately
    const list = getCachedWeddings().filter((w) => w.id !== id);
    setCachedWeddings(list);
    const guests = getCachedGuests().filter((g) => g.wedding_id !== id);
    setCachedGuests(guests);
    try {
      sessionStorage.removeItem('cached_messages_' + id);
      const savedSel = sessionStorage.getItem("manish_selected_wedding_id");
      if (savedSel === id) {
        sessionStorage.removeItem("manish_selected_wedding_id");
      }
      localStorage.removeItem('cached_messages_' + id);
      localStorage.removeItem("manish_selected_wedding_id");
    } catch (e) {}

    // 2. Call backend endpoint to purge database store & Google Sheet
    try {
      let res = await fetch(`${API_BASE_URL}/weddings/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      // Fallback: if DELETE is blocked by proxies, try POST /:id/delete
      if (!res.ok) {
        res = await fetch(`${API_BASE_URL}/weddings/${id}/delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        });
      }
      return res.ok;
    } catch (e) {
      console.warn("deleteWedding server notice:", e.message);
      try {
        const fallbackRes = await fetch(`${API_BASE_URL}/weddings/${id}/delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        });
        return fallbackRes.ok;
      } catch (err) {
        return false;
      }
    }
  },
  async exportMarriageExcel(weddingId) {
    try {
      const res = await fetch(`${API_BASE_URL}/weddings/${weddingId}/export-excel`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) return json.data;
      }
    } catch (e) {
      console.warn("API exportMarriageExcel error:", e);
    }
    return null;
  },

  // Direct download URL for Marriage Excel Sheet (.xlsx)
  getMarriageExcelDownloadUrl(weddingId) {
    return `${API_BASE_URL}/weddings/${weddingId}/download-excel`;
  },

  // ------------------- GUESTS & CALL TRACKING -------------------
  async fetchGuests({
    weddingId = "all",
    side = "All",
    search = "",
    rsvp = "All",
    idCard = "All",
    callStatus = "All",
    callAttempts = "All",
  } = {}) {
    try {
      const params = new URLSearchParams();
      if (weddingId && weddingId !== "all") params.append("weddingId", weddingId);
      if (side && side !== "All") params.append("side", side);
      if (search) params.append("search", search);
      if (rsvp && rsvp !== "All") params.append("rsvp", rsvp);
      if (idCard && idCard !== "All") params.append("idCard", idCard);
      if (callStatus && callStatus !== "All") params.append("callStatus", callStatus);
      if (callAttempts && callAttempts !== "All") params.append("callAttempts", callAttempts);

      const token = getAuthToken();
      const headers = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/guests?${params.toString()}`, { headers });
      if (res.ok) {
        const json = await res.json();
        const rawList = Array.isArray(json)
          ? json
          : Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.guests)
          ? json.guests
          : [];

        if (Array.isArray(rawList)) {
          const sanitized = rawList.map(sanitizeGuestRecord);
          if (sanitized.length > 0) {
            setCachedGuests(sanitized);
          }
          return { data: sanitized, source: "backend" };
        }
      }
    } catch (e) { }

    // Local client fallback
    let list = getCachedGuests();
    if (weddingId && weddingId !== "all") {
      list = list.filter((g) => g.wedding_id === weddingId);
    }
    if (side && side !== "All") {
      list = list.filter((g) => (g.side || "").toLowerCase() === side.toLowerCase());
    }
    if (search && search.trim() !== "") {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (g) =>
          (g.guest_name && g.guest_name.toLowerCase().includes(q)) ||
          (g.contact && g.contact.toLowerCase().includes(q)) ||
          (g.arrival_flight_train_no && g.arrival_flight_train_no.toLowerCase().includes(q)) ||
          (g.departure_flight_train_no && g.departure_flight_train_no.toLowerCase().includes(q)) ||
          (g.arrival_location && g.arrival_location.toLowerCase().includes(q)) ||
          (g.departure_location && g.departure_location.toLowerCase().includes(q)) ||
          (g.special_request && g.special_request.toLowerCase().includes(q)) ||
          (g.last_call_summary && g.last_call_summary.toLowerCase().includes(q))
      );
    }
    if (rsvp && rsvp !== "All") {
      list = list.filter((g) => (g.rsvp_status || "").toLowerCase() === rsvp.toLowerCase());
    }
    if (idCard && idCard !== "All") {
      const isYes = idCard.includes("Yes") || idCard.toLowerCase() === "yes";
      list = list.filter((g) => (g.id_card_received || "").toLowerCase() === (isYes ? "yes" : "no"));
    }
    if (callStatus && callStatus !== "All") {
      list = list.filter((g) => (g.call_status || "").toLowerCase() === callStatus.toLowerCase());
    }
    if (callAttempts && callAttempts !== "All") {
      if (callAttempts === "0" || callAttempts === "Not Called") {
        list = list.filter((g) => !g.call_count || g.call_count === 0);
      } else if (callAttempts === "1" || callAttempts === "1 Call") {
        list = list.filter((g) => g.call_count === 1);
      } else if (callAttempts === "2" || callAttempts === "2 Calls") {
        list = list.filter((g) => g.call_count === 2);
      } else if (callAttempts === "3+" || callAttempts === "3 Calls Completed" || callAttempts === "3") {
        list = list.filter((g) => (g.call_count || 0) >= 3);
      }
    }

    return { data: list, source: "local" };
  },

  async fetchStats(weddingId = "all") {
    try {
      const token = getAuthToken();
      const headers = { Accept: "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const params = weddingId && weddingId !== "all" ? `?weddingId=${weddingId}` : "";
      const res = await fetch(`${API_BASE_URL}/guests/stats${params}`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) return json.data;
        if (json && typeof json === "object") return json;
      }
    } catch (e) { }

    let list = getCachedGuests();
    if (weddingId && weddingId !== "all") {
      list = list.filter((g) => g.wedding_id === weddingId);
    }
    return calculateStatsFromList(list);
  },

  async fetchGuestIdCardBlob(guestId, { signal } = {}) {
    if (!guestId) throw new Error("Guest ID required");
    const token = getAuthToken();
    const authUser = getCurrentAuthUser();
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (authUser?.role) headers["x-user-role"] = authUser.role;
    if (authUser?.id) headers["x-user-id"] = authUser.id;
    if (authUser?.wedding_id) headers["x-user-wedding-id"] = authUser.wedding_id;

    const res = await fetch(`${API_BASE_URL}/guests/${guestId}/id-card`, {
      headers,
      signal,
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error("You do not have permission to view this ID card document.");
      }
      if (res.status === 404) {
        throw new Error("ID card document not found.");
      }
      throw new Error("Unable to load ID card preview.");
    }
    const blob = await res.blob();
    return {
      blob,
      blobUrl: URL.createObjectURL(blob),
      mimeType: blob.type || "",
    };
  },

  async uploadGuestIdCard(guestId, file) {
    if (getCurrentUserRole() === "call_center") {
      throw new Error("Call Center desk has view-only access. Only Super Admin can upload ID cards.");
    }
    if (!guestId || !file) {
      throw new Error("Guest ID and file are required to upload an ID card.");
    }

    const formData = new FormData();
    formData.append("file", file, file.name || "guest_id_card");

    const res = await fetch(`${API_BASE_URL}/guests/${guestId}/id-card`, {
      method: "POST",
      headers: {
        "x-user-role": getCurrentUserRole() || "admin",
      },
      body: formData,
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || "Failed to store ID card in PostgreSQL database.");
    }

    const updatedGuest = json.data ? sanitizeGuestRecord(json.data) : null;
    if (updatedGuest) {
      const list = getCachedGuests();
      const idx = list.findIndex((g) => g.id === guestId);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...updatedGuest };
      } else {
        list.push(updatedGuest);
      }
      setCachedGuests(list);
    }
    return updatedGuest;
  },

  async deleteGuestIdCard(guestId, markPending = false) {
    if (getCurrentUserRole() === "call_center") {
      throw new Error("Call Center desk has view-only access.");
    }
    const res = await fetch(`${API_BASE_URL}/guests/${guestId}/id-card?markPending=${markPending ? "true" : "false"}`, {
      method: "DELETE",
      headers: {
        "x-user-role": getCurrentUserRole() || "admin",
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || "Failed to delete ID card.");
    }
    const updatedGuest = json.data ? sanitizeGuestRecord(json.data) : null;
    if (updatedGuest) {
      const list = getCachedGuests();
      const idx = list.findIndex((g) => g.id === guestId);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...updatedGuest };
        setCachedGuests(list);
      }
    }
    return updatedGuest;
  },

  async createGuest(guestData) {
    if (getCurrentUserRole() === "call_center") {
      throw new Error("Call Center desk has view-only access. Only Super Admin can register new guests.");
    }
    const { _idCardFile, _removeIdCard, ...rawFields } = guestData || {};
    let created = null;
    const cleanGuestData = {
      ...rawFields,
      id_card_copy: _idCardFile || (rawFields.id_card_copy && String(rawFields.id_card_copy).startsWith("blob:"))
        ? null
        : rawFields.id_card_copy,
      id_card_received: _idCardFile ? "Yes" : (rawFields.id_card_received || "No"),
      call_count: rawFields.call_count !== undefined && !isNaN(Number(rawFields.call_count)) ? Number(rawFields.call_count) : 0,
      call_status: rawFields.call_status && isNaN(Number(rawFields.call_status)) ? rawFields.call_status : "Not Called",
      last_call_summary:
        rawFields.last_call_summary &&
        rawFields.last_call_summary.trim().toLowerCase() !== (rawFields.guest_name || "").trim().toLowerCase()
          ? rawFields.last_call_summary
          : null,
    };
    try {
      const res = await fetch(`${API_BASE_URL}/guests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": getCurrentUserRole() || "admin",
        },
        body: JSON.stringify(cleanGuestData),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          created = sanitizeGuestRecord(json.data);
        }
      } else if (_idCardFile) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to save guest record before uploading ID card.");
      }
    } catch (e) {
      if (_idCardFile) throw e;
    }

    if (created && _idCardFile) {
      const withIdCard = await this.uploadGuestIdCard(created.id, _idCardFile);
      if (withIdCard) created = withIdCard;
    }

    const list = getCachedGuests();
    if (created) {
      const updatedList = [created, ...list.filter((g) => g.id !== created.id)];
      setCachedGuests(updatedList);
      return created;
    }

    const nextSr = list.length > 0 ? Math.max(...list.map((g) => Number(g.sr_no) || 0)) + 1 : 1;
    const newGuest = sanitizeGuestRecord({
      ...cleanGuestData,
      id: `guest_${Date.now().toString(36)}`,
      sr_no: cleanGuestData.sr_no || nextSr,
      wedding_id: cleanGuestData.wedding_id || "wedding_01",
      side: cleanGuestData.side || "Groom",
      call_count: 0,
      call_status: "Not Called",
      last_called_at: null,
      last_call_summary: null,
      created_at: new Date().toISOString(),
    });
    const updatedList = [newGuest, ...list];
    setCachedGuests(updatedList);
    return newGuest;
  },

  async bulkImportGuests(weddingId, guestList) {
    if (getCurrentUserRole() === "call_center") {
      throw new Error("Call Center desk has view-only access. Only Super Admin can import guests.");
    }
    try {
      const res = await fetch(`${API_BASE_URL}/guests/bulk-import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": getCurrentUserRole() || "admin",
        },
        body: JSON.stringify({ wedding_id: weddingId, guests: guestList }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          const list = getCachedGuests();
          const merged = [...(json.data || []), ...list.filter((g) => !json.data?.some((d) => d.id === g.id))];
          setCachedGuests(merged);
          return json;
        }
      }
    } catch (e) { }

    // Fallback local cache
    const list = getCachedGuests();
    let nextSr = list.length > 0 ? Math.max(...list.map((g) => Number(g.sr_no) || 0)) + 1 : 1;
    const newItems = guestList.map((g) => ({
      ...g,
      id: g.id || `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      sr_no: g.sr_no || nextSr++,
      wedding_id: weddingId || "wedding_01",
      side: g.side || "Groom",
      call_count: g.call_count || 0,
      call_status: g.call_status || "Not Called",
      created_at: new Date().toISOString(),
    }));
    setCachedGuests([...list, ...newItems]);
    return { success: true, count: newItems.length, data: newItems };
  },

  async updateGuest(id, guestData) {
    if (getCurrentUserRole() === "call_center") {
      throw new Error("Call Center desk has view-only access to guest details. Modifications are not permitted.");
    }
    const { _idCardFile, _removeIdCard, ...rawFields } = guestData || {};
    let cleanSummary = rawFields.last_call_summary;
    if (cleanSummary !== null && cleanSummary !== undefined && rawFields.guest_name) {
      const sStr = String(cleanSummary).trim().toLowerCase();
      const nStr = String(rawFields.guest_name).trim().toLowerCase();
      if (sStr.length > 0 && sStr === nStr) {
        cleanSummary = null;
      }
    }
    const cleanGuestData = {
      ...rawFields,
      id_card_copy:
        _removeIdCard && !_idCardFile
          ? ""
          : _idCardFile || (rawFields.id_card_copy && String(rawFields.id_card_copy).startsWith("blob:"))
          ? undefined
          : rawFields.id_card_copy,
      remove_id_card: Boolean(_removeIdCard && !_idCardFile),
      id_card_received: _idCardFile ? "Yes" : rawFields.id_card_received,
      last_call_summary: cleanSummary !== undefined ? cleanSummary : null,
    };

    let updated = null;
    try {
      const res = await fetch(`${API_BASE_URL}/guests/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-role": getCurrentUserRole() || "admin",
        },
        body: JSON.stringify(cleanGuestData),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          updated = sanitizeGuestRecord(json.data);
        }
      } else if (_idCardFile) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to save guest record before uploading ID card.");
      }
    } catch (e) {
      if (_idCardFile) throw e;
      console.warn("API updateGuest fetch notice:", e);
    }

    if (_idCardFile) {
      const withIdCard = await this.uploadGuestIdCard(id, _idCardFile);
      if (withIdCard) updated = withIdCard;
    }

    try {
      const list = getCachedGuests();
      const idx = list.findIndex((g) => g.id === id);
      const fallbackGuest = sanitizeGuestRecord({ ...cleanGuestData, id });
      const finalGuest = updated || fallbackGuest;
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...finalGuest };
      } else {
        list.push(finalGuest);
      }
      setCachedGuests(list);
      return finalGuest;
    } catch (cacheErr) {
      console.warn("API updateGuest cache update notice:", cacheErr);
      return updated || { ...cleanGuestData, id };
    }
  },

  async deleteGuest(id) {
    if (getCurrentUserRole() === 'call_center') {
      throw new Error('Call Center desk has view-only access. Only Super Admin can delete guests.');
    }
    if (!id) return true;

    // 1. Purge from local cache immediately
    const list = getCachedGuests().filter((g) => g.id !== id);
    setCachedGuests(list);

    // 2. Notify backend to delete from database
    try {
      await fetch(`${API_BASE_URL}/guests/${id}`, {
        method: 'DELETE',
        headers: {
          'x-user-role': getCurrentUserRole() || 'admin',
        },
      });
    } catch (e) {
      console.warn("deleteGuest server notice:", e.message);
    }
    return true;
  },
  async fetchGuestCallLogs(guestId) {
    try {
      const res = await fetch(`${API_BASE_URL}/call-logs/guest/${guestId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setCachedCallLogs(guestId, json.data);
          return { data: json.data, guest: json.guest };
        }
      }
    } catch (e) { }

    const logs = getCachedCallLogs(guestId);
    return { data: logs };
  },

  async createCallLog(logData) {
    let createdCallLog = null;
    let callNumber = 1;
    let serverUpdatedGuest = null;
    try {
      const res = await fetch(`${API_BASE_URL}/call-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logData),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          createdCallLog = json.data;
          callNumber = json.data?.call_number || 1;
          serverUpdatedGuest = json.guest || null;
        }
      }
    } catch (e) { }

    if (!createdCallLog) {
      // Fallback local call logging
      const guestLogs = getCachedCallLogs(logData.guest_id);
      callNumber = guestLogs.length + 1;
      createdCallLog = {
        id: `call_log_${Date.now().toString(36)}`,
        guest_id: logData.guest_id,
        wedding_id: logData.wedding_id || "wedding_01",
        call_number: callNumber,
        agent_name: logData.agent_name || "Call Desk Agent",
        call_outcome: logData.call_outcome || "Connected",
        call_summary: logData.call_summary,
        callback_date: logData.callback_date || null,
        called_at: new Date().toISOString(),
      };

      const updatedLogs = [...guestLogs, createdCallLog];
      setCachedCallLogs(logData.guest_id, updatedLogs);
    } else {
      const guestLogs = getCachedCallLogs(logData.guest_id);
      setCachedCallLogs(logData.guest_id, [...guestLogs.filter((l) => l.id !== createdCallLog.id), createdCallLog]);
    }

    // Always keep guest in cache updated with call_count & summary
    const guests = getCachedGuests();
    const guestIdx = guests.findIndex((g) => g.id === logData.guest_id);
    if (guestIdx !== -1) {
      const currentCount = Number(guests[guestIdx].call_count) || 0;
      guests[guestIdx].call_count = Math.max(currentCount + 1, Number(callNumber) || 1);
      guests[guestIdx].call_status = logData.call_outcome || "Connected";
      guests[guestIdx].last_called_at = new Date().toISOString();
      guests[guestIdx].last_call_summary = logData.call_summary;
      if (logData.update_rsvp) {
        guests[guestIdx].rsvp_status = logData.update_rsvp;
      }
      setCachedGuests(guests);
    }

    return { success: true, data: createdCallLog, guest: serverUpdatedGuest };
  },

  async updateCallLog(id, logData, guestId) {
    try {
      const res = await fetch(`${API_BASE_URL}/call-logs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logData),
      });
      if (res.ok) {
        const json = await res.json();
      }
    } catch (e) { }

    if (guestId) {
      const logs = getCachedCallLogs(guestId);
      const idx = logs.findIndex((l) => l.id === id);
      if (idx !== -1) {
        logs[idx] = { ...logs[idx], ...logData };
        setCachedCallLogs(guestId, logs);
      }
      const guests = getCachedGuests();
      const guestIdx = guests.findIndex((g) => g.id === guestId);
      if (guestIdx !== -1) {
        if (!guests[guestIdx].call_count || Number(guests[guestIdx].call_count) === 0) {
          guests[guestIdx].call_count = 1;
        }
        if (logData.call_summary) {
          guests[guestIdx].last_call_summary = logData.call_summary;
        }
        if (logData.call_outcome) {
          guests[guestIdx].call_status = logData.call_outcome;
        }
        setCachedGuests(guests);
      }
      return (logs && logs[idx]) || null;
    }
    return null;
  },

  async deleteCallLog(id, guestId) {
    try {
      const res = await fetch(`${API_BASE_URL}/call-logs/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) return true;
      }
    } catch (e) { }

    if (guestId) {
      const logs = getCachedCallLogs(guestId).filter((l) => l.id !== id);
      setCachedCallLogs(guestId, logs);
    }
    return true;
  },

  async fetchCallingStats(weddingId = "all") {
    try {
      const params = weddingId && weddingId !== "all" ? `?weddingId=${weddingId}` : "";
      const res = await fetch(`${API_BASE_URL}/call-logs/stats${params}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) return json.data;
      }
    } catch (e) { }

    const guests = getCachedGuests();
    const filtered = weddingId && weddingId !== "all" ? guests.filter((g) => g.wedding_id === weddingId) : guests;
    return {
      totalGuests: filtered.length,
      notCalledCount: filtered.filter((g) => !g.call_count || g.call_count === 0).length,
      call1Count: filtered.filter((g) => g.call_count === 1).length,
      call2Count: filtered.filter((g) => g.call_count === 2).length,
      call3CompletedCount: filtered.filter((g) => (g.call_count || 0) >= 3).length,
      connectedCount: filtered.filter((g) => (g.call_status || "").toLowerCase().includes("connected")).length,
      callbackCount: filtered.filter((g) => (g.call_status || "").toLowerCase().includes("callback")).length,
    };
  },

  // ------------------- CSV EXPORT -------------------
  async exportCsv(weddingId = "all", side = "All", callStatus = "All", callAttempts = "All") {
    try {
      const params = new URLSearchParams();
      if (weddingId && weddingId !== "all") params.append("weddingId", weddingId);
      if (side && side !== "All") params.append("side", side);
      if (callStatus && callStatus !== "All") params.append("callStatus", callStatus);
      if (callAttempts && callAttempts !== "All") params.append("callAttempts", callAttempts);

      const res = await fetch(`${API_BASE_URL}/guests/export/csv?${params.toString()}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `guest_logistics_and_calls_${weddingId || "all"}_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return true;
      }
    } catch (e) { }

    // Client fallback CSV
    let list = getCachedGuests();
    if (weddingId && weddingId !== "all") {
      list = list.filter((g) => g.wedding_id === weddingId);
    }
    const headers = [
      "Sr No",
      "ID",
      "Wedding ID",
      "Guest Name",
      "Contact",
      "Side (Bride/Groom)",
      "RSVP Status",
      "ID Card Received",
      "Call Attempts Count",
      "Call Status",
      "Last Call Discussion Notes",
      "Arrival Date",
      "Arrival Time",
      "Arrival Location",
      "Arrival Flight/Train No",
      "Departure Date",
      "Departure Time",
      "Departure Location",
      "Departure Flight/Train No",
      "Special Request",
    ];
    const escapeCsv = (str) => `"${String(str || "").replace(/"/g, '""')}"`;
    const rows = list.map((g) => [
      escapeCsv(g.sr_no),
      escapeCsv(g.id),
      escapeCsv(g.wedding_id),
      escapeCsv(g.guest_name),
      escapeCsv(g.contact),
      escapeCsv(g.side),
      escapeCsv(g.rsvp_status),
      escapeCsv(g.id_card_received),
      escapeCsv(`${g.call_count || 0} calls`),
      escapeCsv(g.call_status || "Not Called"),
      escapeCsv(g.last_call_summary || "None"),
      escapeCsv(g.arrival_date),
      escapeCsv(g.arrival_time),
      escapeCsv(g.arrival_location),
      escapeCsv(g.arrival_flight_train_no),
      escapeCsv(g.departure_date),
      escapeCsv(g.departure_time),
      escapeCsv(g.departure_location),
      escapeCsv(g.departure_flight_train_no),
      escapeCsv(g.special_request),
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `guest_logistics_and_calls_${weddingId || "all"}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  },

  // ------------------- GOOGLE SHEETS INTEGRATION -------------------
  async syncGoogleSheet(weddingId, sheetUrl = null) {
    const res = await fetch(`${API_BASE_URL}/sheets/weddings/${weddingId}/sync-from-sheet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sheet_url: sheetUrl }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || "Failed to sync Google Sheet");
    }
    if (json.data?.guests && Array.isArray(json.data.guests)) {
      const allCached = getCachedGuests();
      const otherGuests = allCached.filter((g) => g.wedding_id !== weddingId);
      setCachedGuests([...otherGuests, ...json.data.guests]);
    }
    return json;
  },

  async createLiveGoogleSheet(weddingId) {
    const res = await fetch(`${API_BASE_URL}/sheets/weddings/${weddingId}/create-live-sheet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.message || "Failed to generate Google Sheet on Google Drive");
      err.help = json.help;
      err.isLiveCreated = json.isLiveCreated;
      throw err;
    }
    return {
      ...(json.data || {}),
      isLiveCreated: json.isLiveCreated,
      message: json.message,
      apiError: json.apiError,
      help: json.help,
    };
  },

  async getGoogleAppsScript(weddingId) {
    try {
      const res = await fetch(`${API_BASE_URL}/sheets/weddings/${weddingId}/script`);
      if (res.ok) {
        const json = await res.json();
        return json;
      }
    } catch (e) { }

    const serverUrl = BACKEND_SERVER_URL;
    return {
      success: true,
      wedding_id: weddingId,
      server_url: serverUrl,
      script_code: `/**
 * Wedding Logistics & Guest Management - Real-Time Google Sheet Sync Script
 * Wedding ID: ${weddingId}
 * Target API: ${serverUrl}/api/sheets/webhook
 */

const WEDDING_ID = "${weddingId}";
const WEBHOOK_URL = "${serverUrl}/api/sheets/webhook";

function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    const rowNumber = e.range.getRow();
    if (rowNumber <= 1) return;
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const rowValues = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    const rowObject = {};
    for (let i = 0; i < headers.length; i++) {
      const key = String(headers[i]).trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
      rowObject[key] = rowValues[i];
    }
    
    const payload = {
      wedding_id: WEDDING_ID,
      event: "edit",
      row_number: rowNumber,
      row: rowObject,
      timestamp: new Date().toISOString()
    };
    
    UrlFetchApp.fetch(WEBHOOK_URL, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) {
    Logger.log("Error in onEdit webhook sync: " + err.toString());
  }
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("💍 Wedding System")
    .addItem("🔄 Sync All Guests to Database", "syncAllGuestsToDatabase")
    .addToUi();
}

function syncAllGuestsToDatabase() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return;
  const headers = data[0];
  const rows = [];
  for (let r = 1; r < data.length; r++) {
    const rowObj = {};
    for (let c = 0; c < headers.length; c++) {
      const key = String(headers[c]).trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
      rowObj[key] = data[r][c];
    }
    rows.push(rowObj);
  }
  const payload = {
    wedding_id: WEDDING_ID,
    event: "bulk_sync",
    rows: rows
  };
  const res = UrlFetchApp.fetch(WEBHOOK_URL, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  SpreadsheetApp.getUi().alert("✓ Synced " + rows.length + " guests to Database!\\nResponse: " + res.getContentText());
}`,
    };
  },

  async linkGoogleSheet(weddingId, sheetUrl) {
    const res = await fetch(`${API_BASE_URL}/sheets/weddings/${weddingId}/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ google_sheet_url: sheetUrl }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.message || "Failed to link Google Sheet");
    }
    if (json.guests) {
      setCachedGuests(json.guests);
    }
    const weddings = getCachedWeddings();
    const idx = weddings.findIndex((w) => w.id === weddingId);
    if (idx !== -1 && json.data) {
      weddings[idx] = { ...weddings[idx], ...json.data };
      setCachedWeddings(weddings);
    }
    return json;
  },

  async getGoogleAuthStatus() {
    try {
      const res = await fetch(`${API_BASE_URL}/sheets/auth-status`);
      if (res.ok) {
        const json = await res.json();
        return json.data;
      }
    } catch (e) { }
    return {
      isConfigured: false,
      message: "Backend API not responding or credentials not loaded.",
    };
  },

  // ============================================================
  // DIRECT USER & ADMIN MESSAGING & CHATBOT API
  // ============================================================
  async fetchMessages(weddingId) {
    const targetId = weddingId || "wedding_01";
    const cleanId = String(targetId).replace(/^wedding:/, "").trim();

    try {
      const token = getAuthToken();
      const headers = { Accept: "application/json" };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE_URL}/messages/${encodeURIComponent(cleanId)}`, {
        headers,
      });
      if (res.ok) {
        const json = await res.json();
        // Support any response format: direct array, { data: [...] }, or { messages: [...] }
        const rawList = Array.isArray(json)
          ? json
          : Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.messages)
          ? json.messages
          : null;

        if (Array.isArray(rawList)) {
          const unique = [];
          const seen = new Set();
          rawList.forEach((m) => {
            if (m && m.id && !seen.has(m.id)) {
              seen.add(m.id);
              unique.push(m);
            }
          });
          unique.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

          try {
            sessionStorage.setItem(`cached_messages_${cleanId}`, JSON.stringify(unique));
            sessionStorage.setItem(`cached_messages_${targetId}`, JSON.stringify(unique));
          } catch (e) {}

          return unique;
        }
      }
    } catch (e) {
      console.warn("Messages API notice:", e.message);
    }

    try {
      const cacheKeys = [
        `cached_messages_${cleanId}`,
        `cached_messages_${targetId}`,
      ];
      for (const key of cacheKeys) {
        const local = sessionStorage.getItem(key);
        if (local) {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const unique = [];
            const seen = new Set();
            parsed.forEach((m) => {
              if (m && m.id && !seen.has(m.id)) {
                seen.add(m.id);
                unique.push(m);
              }
            });
            unique.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            return unique;
          }
        }
      }
    } catch (e) {}

    return [];
  },

  async sendMessage({ wedding_id, sender_id, sender_name, sender_role = "client", message, trigger_bot_reply = false }) {
    const safeWeddingId = wedding_id || "wedding_01";
    if (!message || !message.trim()) return null;

    // Helper: attempt a single POST to save message in backend DB
    const attempt = async () => {
      const token = getAuthToken();
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          wedding_id: safeWeddingId,
          sender_id,
          sender_name,
          sender_role,
          message,
          trigger_bot_reply,
        }),
      });
      return res;
    };

    try {
      let res = null;
      for (let attemptNum = 0; attemptNum < 3; attemptNum++) {
        try {
          res = await attempt();
          if (res && res.ok) break;
          if (attemptNum < 2) {
            await new Promise((r) => setTimeout(r, 2000 * (attemptNum + 1)));
          }
        } catch (fetchErr) {
          if (attemptNum < 2) {
            await new Promise((r) => setTimeout(r, 2000 * (attemptNum + 1)));
          } else {
            console.warn("Notice: Network retry exhausted for messages:", fetchErr.message);
          }
        }
      }

      if (res && res.ok) {
        const json = await res.json();
        if (json?.supabase_saved) {
          console.log("✅ Message confirmed saved in Supabase DB:", json.data?.id);
        } else if (json?.supabase_error) {
          console.warn("⚠️ Supabase save notice from backend:", json.supabase_error);
        }
        if (json?.data) {
          let list = [];
          try {
            const local = sessionStorage.getItem(`cached_messages_${safeWeddingId}`);
            if (local) list = JSON.parse(local);
          } catch (e) {}

          const seen = new Set(list.map((m) => m.id));
          if (!seen.has(json.data.id)) {
            list.push(json.data);
            seen.add(json.data.id);
          }
          if (json.bot_reply && !seen.has(json.bot_reply.id)) {
            list.push(json.bot_reply);
          }
          try {
            sessionStorage.setItem(`cached_messages_${safeWeddingId}`, JSON.stringify(list));
          } catch (e) {}
        }
        return json;
      }
    } catch (e) {
      console.warn("Error sending message via API, caching locally:", e);
    }

    // Local fallback
    const newMsg = {
      id: `msg_local_${Date.now()}`,
      wedding_id: safeWeddingId,
      sender_id: sender_id || "client_user",
      sender_name: sender_name || (sender_role === "admin" ? "Manish (Admin)" : "Wedding Client"),
      sender_role,
      message,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    let list = [];
    try {
      const local = sessionStorage.getItem(`cached_messages_${safeWeddingId}`);
      if (local) list = JSON.parse(local);
    } catch (e) {}

    // Avoid duplicate insertions
    const isDuplicate = list.some(
      (m) => m.wedding_id === safeWeddingId && m.message === message && Math.abs(new Date(m.created_at) - new Date()) < 2000
    );
    if (!isDuplicate) {
      list.push(newMsg);
      try {
        sessionStorage.setItem(`cached_messages_${safeWeddingId}`, JSON.stringify(list));
      } catch (e) {}
    }

    return { success: true, data: newMsg };
  },

  async markMessagesRead(weddingId, readerRole = "client") {
    if (!weddingId) return;
    const rawId = typeof weddingId === "object" && weddingId !== null
      ? weddingId.id || weddingId.wedding_id || ""
      : weddingId;
    const cleanId = String(rawId || "").replace(/^wedding:/, "").trim();
    if (!cleanId || cleanId === "[object Object]") return;

    // 1. Dispatch non-blocking HTTP PUT to update DB with 4s timeout
    try {
      const token = getAuthToken();
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 4000) : null;

      fetch(`${API_BASE_URL}/messages/read/${encodeURIComponent(cleanId)}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ readerRole }),
        signal: controller ? controller.signal : undefined,
      })
        .then(() => {
          if (timeoutId) clearTimeout(timeoutId);
        })
        .catch(() => {
          if (timeoutId) clearTimeout(timeoutId);
        });
    } catch (e) {}

    // 2. Update session storage cache for all possible key variants
    try {
      const cacheKeys = [
        `cached_messages_${cleanId}`,
        `cached_messages_wedding:${cleanId}`,
      ];
      if (!cleanId.startsWith("wedding_")) {
        cacheKeys.push(`cached_messages_wedding_${cleanId}`);
      }

      cacheKeys.forEach((key) => {
        const local = sessionStorage.getItem(key);
        if (local) {
          try {
            const msgs = JSON.parse(local).map((m) => {
              if (m.sender_role !== readerRole) m.is_read = true;
              return m;
            });
            sessionStorage.setItem(key, JSON.stringify(msgs));
          } catch (err) {}
        }
      });
    } catch (e) {}
  },

  // ============================================================
  // USER MANAGEMENT & CALL CENTER ALLOCATION API
  // ============================================================
  async getUsers() {
    try {
      const token = getAuthToken();
      const headers = {
        Accept: "application/json",
        "x-user-role": getCurrentUserRole() || "admin",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/auth/users`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          return json.data;
        }
      }
    } catch (e) {
      console.warn("GetUsers API notice:", e.message);
    }

    // Fallback: Default users + session users
    try {
      const local = sessionStorage.getItem("manish_custom_users");
      const customUsers = local ? JSON.parse(local) : [];
      return [
        { ...DEFAULT_USERS.admin, wedding_id: "all", assigned_wedding_name: "All Marriages" },
        { ...DEFAULT_USERS.callCenter, wedding_id: "all", assigned_wedding_name: "All Marriages" },
        ...customUsers,
      ];
    } catch (e) {
      return [DEFAULT_USERS.admin, DEFAULT_USERS.callCenter];
    }
  },

  async createUser(userData) {
    try {
      const token = getAuthToken();
      const headers = {
        "Content-Type": "application/json",
        "x-user-role": getCurrentUserRole() || "admin",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/auth/users`, {
        method: "POST",
        headers,
        body: JSON.stringify(userData),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        return json.data;
      }
      throw new Error(json.message || "Failed to create user account");
    } catch (e) {
      // If server error or offline, fallback to session storage
      const local = sessionStorage.getItem("manish_custom_users");
      const customUsers = local ? JSON.parse(local) : [];
      const newId = `user_${Date.now().toString(36)}`;
      const newUser = {
        id: newId,
        name: userData.name,
        email: userData.email || userData.username,
        role: userData.role || "call_center",
        phone: userData.phone || null,
        wedding_id: userData.wedding_id || "all",
        assigned_weddings: Array.isArray(userData.assigned_weddings) ? userData.assigned_weddings : [userData.wedding_id || "all"],
        assigned_wedding_name: userData.assigned_wedding_name || (userData.wedding_id === "all" ? "All Marriages" : userData.wedding_id),
        created_at: new Date().toISOString(),
      };
      customUsers.push(newUser);
      sessionStorage.setItem("manish_custom_users", JSON.stringify(customUsers));
      return newUser;
    }
  },

  async updateUser(id, updateData) {
    try {
      const token = getAuthToken();
      const headers = {
        "Content-Type": "application/json",
        "x-user-role": getCurrentUserRole() || "admin",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/auth/users/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(updateData),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        return json.data;
      }
      throw new Error(json.message || "Failed to update user account");
    } catch (e) {
      const local = sessionStorage.getItem("manish_custom_users");
      if (local) {
        let customUsers = JSON.parse(local);
        const idx = customUsers.findIndex((u) => u.id === id);
        if (idx >= 0) {
          customUsers[idx] = { ...customUsers[idx], ...updateData };
          sessionStorage.setItem("manish_custom_users", JSON.stringify(customUsers));
          return customUsers[idx];
        }
      }
      return { id, ...updateData };
    }
  },

  async deleteUser(id) {
    try {
      const token = getAuthToken();
      const headers = {
        "x-user-role": getCurrentUserRole() || "admin",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/auth/users/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      });

      const json = await res.json();
      if (res.ok && json.success) {
        return true;
      }
      throw new Error(json.message || "Failed to delete user");
    } catch (e) {
      const local = sessionStorage.getItem("manish_custom_users");
      if (local) {
        let customUsers = JSON.parse(local);
        customUsers = customUsers.filter((u) => u.id !== id);
        sessionStorage.setItem("manish_custom_users", JSON.stringify(customUsers));
      }
      return true;
    }
  },
};

