import { GuestModel } from "../models/guestModel.js";
import { GuestIdCardModel } from "../models/guestIdCardModel.js";
import { extractIdCardFromRequest } from "../utils/idCardHelper.js";
import { GoogleSheetsService } from "../services/googleSheetsService.js";
import { broadcastDataChange } from "../socket/chatSocket.js";
import { verifyJwt } from "../services/jwtService.js";
import { loadUsersMeta } from "../models/userModel.js";

// Helper for CSV escaping
const escapeCsvField = (field) => {
  if (field === null || field === undefined) return '""';
  const stringValue = String(field).replace(/"/g, '""');
  return `"${stringValue}"`;
};

export const guestController = {
  // GET /api/guests
  async getGuests(req, res) {
    try {
      const { weddingId, side, search, rsvp, idCard, callStatus, callAttempts, sortBy, order } =
        req.query;

      let targetWeddingId = weddingId;
      const userRole = (req.headers["x-user-role"] || req.query.role || "").toLowerCase();
      let userWeddingId = req.headers["x-user-wedding-id"] || req.query.wedding_id;
      const userId = req.headers["x-user-id"] || req.query.user_id;

      if (userRole === "call_center") {
        if (userId) {
          try {
            const meta = loadUsersMeta();
            const userMeta = meta[userId] || {};
            if (userMeta.wedding_id) userWeddingId = userMeta.wedding_id;
          } catch (e) {}
        }
        if (userWeddingId && userWeddingId !== "all") {
          targetWeddingId = userWeddingId;
        }
      } else if (userRole === "marriage_client" && userWeddingId) {
        targetWeddingId = userWeddingId;
      }

      const guests = await GuestModel.getAll({
        weddingId: targetWeddingId,
        side,
        search,
        rsvp,
        idCard,
        callStatus,
        callAttempts,
        sortBy,
        order,
      });
      res.status(200).json({
        success: true,
        count: guests.length,
        data: guests,
      });
    } catch (error) {
      console.error("Error fetching guests:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch guests",
        error: error.message,
      });
    }
  },

  // GET /api/guests/stats
  async getStats(req, res) {
    try {
      const { weddingId } = req.query;

      let targetWeddingId = weddingId;
      const userRole = (req.headers["x-user-role"] || req.query.role || "").toLowerCase();
      let userWeddingId = req.headers["x-user-wedding-id"] || req.query.wedding_id;
      const userId = req.headers["x-user-id"] || req.query.user_id;

      if (userRole === "call_center") {
        if (userId) {
          try {
            const meta = loadUsersMeta();
            const userMeta = meta[userId] || {};
            if (userMeta.wedding_id) userWeddingId = userMeta.wedding_id;
          } catch (e) {}
        }
        if (userWeddingId && userWeddingId !== "all") {
          targetWeddingId = userWeddingId;
        }
      } else if (userRole === "marriage_client" && userWeddingId) {
        targetWeddingId = userWeddingId;
      }

      const stats = await GuestModel.getStatistics(targetWeddingId);
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Error fetching guest statistics:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch statistics",
        error: error.message,
      });
    }
  },

  // GET /api/guests/:id
  async getGuestById(req, res) {
    try {
      const { id } = req.params;
      const guest = await GuestModel.getById(id);
      if (!guest) {
        return res.status(404).json({
          success: false,
          message: `Guest with ID ${id} not found`,
        });
      }
      res.status(200).json({
        success: true,
        data: guest,
      });
    } catch (error) {
      console.error("Error fetching guest by ID:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch guest details",
        error: error.message,
      });
    }
  },

  // POST /api/guests
  async createGuest(req, res) {
    try {
      const userRole = req.headers["x-user-role"];
      if (userRole === "call_center") {
        return res.status(403).json({
          success: false,
          message: "Call center users have view-only access to guest details. They cannot create new guests.",
        });
      }

      const { guest_name } = req.body;
      if (!guest_name || guest_name.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "Guest name is required",
        });
      }

      const newGuest = await GuestModel.create(req.body);

      // Auto-sync new guest to linked Google Sheet
      if (newGuest?.wedding_id) {
        GoogleSheetsService.pushGuestsToGoogleSheet(newGuest.wedding_id).catch((e) =>
          console.warn("Auto Google Sheet sync note on create:", e.message)
        );
      }

      // Broadcast WebSocket mutation event (clients ask only once on mount & update only on changes)
      const io = req.app.get("io");
      broadcastDataChange(io, {
        event: "guests_updated",
        weddingId: newGuest?.wedding_id,
        payload: { action: "create", guest: newGuest },
      });

      res.status(201).json({
        success: true,
        message: "Guest added successfully",
        data: newGuest,
      });
    } catch (error) {
      console.error("Error creating guest:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create guest",
        error: error.message,
      });
    }
  },

  // POST /api/guests/bulk-import
  async bulkImportGuests(req, res) {
    try {
      const userRole = req.headers["x-user-role"];
      if (userRole === "call_center") {
        return res.status(403).json({
          success: false,
          message: "Call center users have view-only access to guest details. They cannot import guests.",
        });
      }

      const { wedding_id = "wedding_01", guests = [] } = req.body;
      if (!Array.isArray(guests) || guests.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No guest records provided for import",
        });
      }

      const imported = await GuestModel.bulkCreate(wedding_id, guests);

      // Auto-sync imported guests to linked Google Sheet
      if (wedding_id) {
        GoogleSheetsService.pushGuestsToGoogleSheet(wedding_id).catch((e) =>
          console.warn("Auto Google Sheet sync note on bulk import:", e.message)
        );
      }

      // Broadcast WebSocket mutation event
      const io = req.app.get("io");
      broadcastDataChange(io, {
        event: "guests_updated",
        weddingId: wedding_id,
        payload: { action: "bulk_import", count: imported.length },
      });

      res.status(201).json({
        success: true,
        count: imported.length,
        message: `Successfully imported ${imported.length} guests`,
        data: imported,
      });
    } catch (error) {
      console.error("Error bulk importing guests:", error);
      res.status(500).json({
        success: false,
        message: "Failed to bulk import guests",
        error: error.message,
      });
    }
  },

  // PUT /api/guests/:id
  async updateGuest(req, res) {
    try {
      const userRole = req.headers["x-user-role"];
      if (userRole === "call_center") {
        return res.status(403).json({
          success: false,
          message: "Call center users have view-only access to guest details. They cannot modify guest records.",
        });
      }

      const { id } = req.params;
      const updatedGuest = await GuestModel.update(id, req.body);
      if (!updatedGuest) {
        return res.status(404).json({
          success: false,
          message: `Guest with ID ${id} not found`,
        });
      }

      // Auto-sync updated guest to linked Google Sheet
      if (updatedGuest?.wedding_id) {
        GoogleSheetsService.updateGuestRowInSheet(updatedGuest.wedding_id, updatedGuest).catch((e) =>
          console.warn("Auto Google Sheet sync note on update:", e.message)
        );
      }

      // Broadcast WebSocket mutation event
      const io = req.app.get("io");
      broadcastDataChange(io, {
        event: "guests_updated",
        weddingId: updatedGuest?.wedding_id,
        payload: { action: "update", guest: updatedGuest },
      });

      res.status(200).json({
        success: true,
        message: "Guest updated successfully",
        data: updatedGuest,
      });
    } catch (error) {
      console.error("Error updating guest:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update guest",
        error: error.message,
      });
    }
  },

  // DELETE /api/guests/:id
  async deleteGuest(req, res) {
    try {
      const userRole = req.headers["x-user-role"];
      if (userRole === "call_center") {
        return res.status(403).json({
          success: false,
          message: "Call center users have view-only access to guest details. They cannot delete guest records.",
        });
      }

      const { id } = req.params;
      const guest = await GuestModel.getById(id);
      if (!guest) {
        return res.status(404).json({
          success: false,
          message: `Guest with ID ${id} not found`,
        });
      }

      const weddingId = guest.wedding_id;
      const success = await GuestModel.delete(id);
      if (!success) {
        return res.status(500).json({
          success: false,
          message: `Failed to delete guest with ID ${id}`,
        });
      }

      // Automatically delete that exact row from the linked Google Sheet via deleteDimension
      if (weddingId) {
        try {
          await GoogleSheetsService.deleteGuestRowFromSheet(weddingId, guest);
        } catch (sheetErr) {
          console.warn("Auto Google Sheet deleteDimension sync note on delete:", sheetErr.message);
        }
      }

      // Broadcast WebSocket mutation event
      const io = req.app.get("io");
      broadcastDataChange(io, {
        event: "guests_updated",
        weddingId,
        payload: { action: "delete", guest_id: id },
      });

      res.status(200).json({
        success: true,
        message: "Guest deleted successfully and row removed from Google Sheet",
      });
    } catch (error) {
      console.error("Error deleting guest:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete guest",
        error: error.message,
      });
    }
  },

  // GET /api/guests/export/csv
  async exportCsv(req, res) {
    try {
      const { weddingId, side, callStatus, callAttempts } = req.query;
      const guests = await GuestModel.getAll({
        weddingId,
        side,
        callStatus,
        callAttempts,
        sortBy: "sr_no",
        order: "ASC",
      });

      const headers = [
        "Sr No",
        "ID",
        "Wedding ID",
        "Guest Name",
        "Contact",
        "Side (Bride/Groom)",
        "Relation (to Bride/Groom)",
        "RSVP Status",
        "ID Card Received",
        "Call Checkpoint Count",
        "Call Status",
        "Last Called At",
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
        "ID Card Copy",
      ];

      const rows = guests.map((g) => [
        escapeCsvField(g.sr_no),
        escapeCsvField(g.id),
        escapeCsvField(g.wedding_id),
        escapeCsvField(g.guest_name),
        escapeCsvField(g.contact),
        escapeCsvField(g.side),
        escapeCsvField(g.relation || "—"),
        escapeCsvField(g.rsvp_status),
        escapeCsvField(g.id_card_received),
        escapeCsvField(`${g.call_count || 0} calls`),
        escapeCsvField(g.call_status || "Not Called"),
        escapeCsvField(g.last_called_at || "—"),
        escapeCsvField(g.last_call_summary || "None"),
        escapeCsvField(g.arrival_date),
        escapeCsvField(g.arrival_time),
        escapeCsvField(g.arrival_location),
        escapeCsvField(g.arrival_flight_train_no),
        escapeCsvField(g.departure_date),
        escapeCsvField(g.departure_time),
        escapeCsvField(g.departure_location),
        escapeCsvField(g.departure_flight_train_no),
        escapeCsvField(g.special_request),
        escapeCsvField(g.id_card_copy ? "Attached" : "None"),
      ]);

      const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\r\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=guest_travel_and_call_logistics_${Date.now()}.csv`
      );
      res.status(200).send(csvContent);
    } catch (error) {
      console.error("Error exporting CSV:", error);
      res.status(500).json({
        success: false,
        message: "Failed to export CSV",
        error: error.message,
      });
    }
  },

  // POST /api/guests/sync
  async syncGuests(req, res) {
    try {
      const { weddingId } = req.query;
      const guests = await GuestModel.getAll({ weddingId });

      // Broadcast WebSocket mutation event
      const io = req.app.get("io");
      broadcastDataChange(io, {
        event: "guests_updated",
        weddingId,
        payload: { action: "sync" },
      });

      res.status(200).json({
        success: true,
        message: "Guest records synchronized successfully",
        data: guests,
      });
    } catch (error) {
      console.error("Error syncing guests:", error);
      res.status(500).json({
        success: false,
        message: "Failed to sync guest data",
        error: error.message,
      });
    }
  },

  // POST/PUT /api/guests/:id/id-card
  // Stores guest ID card (photo or PDF binary) directly inside PostgreSQL
  async uploadGuestIdCard(req, res) {
    try {
      const userRole = String(req.headers["x-user-role"] || "").toLowerCase();
      if (userRole === "call_center") {
        return res.status(403).json({
          success: false,
          message: "Call center users have view-only access to guest details. They cannot upload ID cards.",
        });
      }

      const { id } = req.params;
      const guest = await GuestModel.getById(id);
      if (!guest) {
        return res.status(404).json({
          success: false,
          message: `Guest with ID ${id} not found`,
        });
      }

      let parsedFile;
      try {
        parsedFile = extractIdCardFromRequest(req);
      } catch (validationErr) {
        return res.status(400).json({
          success: false,
          message: validationErr.message || "Invalid ID card file upload",
        });
      }

      await GuestIdCardModel.saveForGuest(id, {
        weddingId: guest.wedding_id || "wedding_01",
        fileName: parsedFile.fileName,
        mimeType: parsedFile.mimeType,
        fileData: parsedFile.fileData,
      });

      const updatedGuest = await GuestModel.getById(id);

      const io = req.app.get("io");
      broadcastDataChange(io, {
        event: "guests_updated",
        weddingId: updatedGuest?.wedding_id || guest.wedding_id,
        payload: { action: "id_card_uploaded", guest: updatedGuest },
      });

      res.status(200).json({
        success: true,
        message: "Guest ID card saved in PostgreSQL successfully",
        data: updatedGuest,
      });
    } catch (error) {
      console.error("Error uploading guest ID card:", error);
      res.status(500).json({
        success: false,
        message: "Failed to store guest ID card",
        error: error.message,
      });
    }
  },

  // GET /api/guests/:id/id-card
  // Serves stored photo or PDF binary strictly to authenticated wedding session users
  async getGuestIdCard(req, res) {
    try {
      const authHeader = String(req.headers.authorization || "");
      const bearerToken = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : "";
      const decoded = bearerToken ? verifyJwt(bearerToken) : null;
      const isValidQuickToken =
        !decoded &&
        bearerToken &&
        (bearerToken.startsWith("mock_admin_") ||
          bearerToken.startsWith("mock_callcenter_") ||
          bearerToken.startsWith("mock_client_") ||
          bearerToken.startsWith("token_"));

      if (!decoded && !isValidQuickToken) {
        return res.status(401).json({
          success: false,
          message: "Authentication required to preview guest ID documents.",
        });
      }

      const { id } = req.params;
      const card = await GuestIdCardModel.getByGuestId(id);
      if (!card || !card.file_data) {
        return res.status(404).json({
          success: false,
          message: `No ID card stored for guest ${id}`,
        });
      }

      // Enforce wedding scoping for client/call-center sessions
      const callerRole = String(
        decoded?.role || req.headers["x-user-role"] || ""
      ).toLowerCase();
      let callerWeddingId =
        decoded?.wedding_id || req.headers["x-user-wedding-id"] || "";
      if (!callerWeddingId && bearerToken.startsWith("mock_client_")) {
        callerWeddingId = bearerToken
          .replace(/^mock_client_/, "")
          .replace(/_\d+$/, "");
      }

      if (
        (callerRole === "marriage_client" || callerRole === "call_center") &&
        callerWeddingId &&
        callerWeddingId !== "all"
      ) {
        const cleanTarget = String(card.wedding_id || "").replace(/^wedding_/, "");
        const cleanCaller = String(callerWeddingId).replace(/^wedding_/, "");
        if (cleanTarget && cleanCaller && cleanTarget !== cleanCaller) {
          return res.status(403).json({
            success: false,
            message: "Forbidden: You may only view ID cards for your assigned wedding.",
          });
        }
      }

      const isDownload = req.query.download === "1" || req.query.download === "true";
      const safeName = (card.file_name || `guest_${id}_id_card`).replace(/["\r\n]/g, "_");
      const disposition = isDownload ? "attachment" : "inline";

      res.removeHeader("X-Frame-Options");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader(
        "Access-Control-Expose-Headers",
        "Content-Disposition, Content-Type, Content-Length"
      );
      res.setHeader("Content-Type", card.mime_type || "application/octet-stream");
      res.setHeader("Content-Length", String(card.file_data.length));
      res.setHeader(
        "Content-Disposition",
        `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
      );
      res.setHeader("Cache-Control", "private, max-age=300");
      res.status(200).send(card.file_data);
    } catch (error) {
      console.error("Error fetching guest ID card:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve guest ID card",
        error: error.message,
      });
    }
  },

  // DELETE /api/guests/:id/id-card
  async deleteGuestIdCard(req, res) {
    try {
      const userRole = String(req.headers["x-user-role"] || "").toLowerCase();
      if (userRole === "call_center") {
        return res.status(403).json({
          success: false,
          message: "Call center users have view-only access to guest details.",
        });
      }

      const { id } = req.params;
      const guest = await GuestModel.getById(id);
      if (!guest) {
        return res.status(404).json({
          success: false,
          message: `Guest with ID ${id} not found`,
        });
      }

      await GuestIdCardModel.deleteByGuestId(id, {
        markPending: req.query.markPending === "true",
      });

      const updatedGuest = await GuestModel.getById(id);

      const io = req.app.get("io");
      broadcastDataChange(io, {
        event: "guests_updated",
        weddingId: updatedGuest?.wedding_id || guest.wedding_id,
        payload: { action: "id_card_deleted", guest: updatedGuest },
      });

      res.status(200).json({
        success: true,
        message: "Guest ID card removed from PostgreSQL",
        data: updatedGuest,
      });
    } catch (error) {
      console.error("Error deleting guest ID card:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete guest ID card",
        error: error.message,
      });
    }
  },
};
