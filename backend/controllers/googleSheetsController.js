import { GoogleSheetsService, GOOGLE_SHEET_HEADERS } from "../services/googleSheetsService.js";
import { WeddingModel } from "../models/weddingModel.js";
import { GuestModel } from "../models/guestModel.js";
import { broadcastDataChange } from "../socket/chatSocket.js";

export const googleSheetsController = {
  // 0. GET /api/sheets/auth-status
  async getAuthStatus(req, res) {
    try {
      const status = await GoogleSheetsService.getAuthStatus();
      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  },

  // 1. POST /api/weddings/:id/sheets/sync-from-sheet
  // Syncs all guests from linked Google Sheet into MySQL Database
  async syncFromSheet(req, res) {
    try {
      const { id } = req.params;
      const { sheet_url, sheet_id } = req.body || {};

      let wedding = await WeddingModel.getById(id);
      if (!wedding && id) {
        const altId = id.startsWith("wedding_") ? id.replace("wedding_", "") : `wedding_${id}`;
        wedding = await WeddingModel.getById(altId);
      }
      if (!wedding && (sheet_url || sheet_id)) {
        wedding = await WeddingModel.create({
          id,
          groom_name: "Groom",
          bride_name: "Bride",
          google_sheet_url: sheet_url || null,
          google_sheet_id: sheet_id || GoogleSheetsService.extractSheetId(sheet_url),
        });
      }
      if (!wedding) {
        return res.status(404).json({
          success: false,
          message: `Wedding '${id}' not found in database.`,
        });
      }

      const targetUrlOrId = sheet_url || sheet_id || wedding.google_sheet_url || wedding.google_sheet_id;
      if (!targetUrlOrId) {
        return res.status(400).json({
          success: false,
          message: "No Google Sheet URL or ID is linked to this wedding. Please provide or link a Google Sheet.",
        });
      }

      // If wedding didn't have this URL saved, save it now!
      if (sheet_url && (!wedding.google_sheet_url || wedding.google_sheet_url !== sheet_url)) {
        const extractedId = GoogleSheetsService.extractSheetId(sheet_url);
        await WeddingModel.update(wedding.id, {
          google_sheet_url: sheet_url,
          google_sheet_id: extractedId || wedding.google_sheet_id,
        });
      }

      const syncResult = await GoogleSheetsService.syncFromGoogleSheet(wedding.id, targetUrlOrId);

      // Fetch freshly updated guest list and wedding stats
      const updatedGuests = await GuestModel.getAll({ weddingId: wedding.id });
      const stats = await GuestModel.getStatistics(wedding.id);
      const weddingRecord = await WeddingModel.getById(wedding.id);

      // Broadcast WebSocket mutation event for live sync
      const io = req.app.get("io");
      broadcastDataChange(io, {
        event: "guests_updated",
        weddingId: wedding.id,
        payload: { action: "sheet_sync", stats, count: updatedGuests.length },
      });
      broadcastDataChange(io, {
        event: "weddings_updated",
        weddingId: wedding.id,
        payload: { action: "sheet_sync", wedding: weddingRecord },
      });

      res.status(200).json({
        success: true,
        message: syncResult.message,
        data: {
          createdCount: syncResult.createdCount,
          updatedCount: syncResult.updatedCount,
          totalRows: syncResult.totalRows,
          brideCount: syncResult.brideCount,
          groomCount: syncResult.groomCount,
          bothCount: syncResult.bothCount,
          guests: updatedGuests,
          stats: stats,
          wedding: weddingRecord,
        },
      });
    } catch (error) {
      console.error("Error syncing from Google Sheet:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to sync from Google Sheet",
      });
    }
  },

  // 2. GET /api/weddings/:id/sheets/export-data
  // Returns formatted 2D array / CSV rows of all guests for the Google Sheet
  async exportSheetData(req, res) {
    try {
      const { id } = req.params;
      const wedding = await WeddingModel.getById(id);
      if (!wedding) {
        return res.status(404).json({ success: false, message: "Wedding not found" });
      }

      const guests = await GuestModel.getAll({ weddingId: id });

      const rows = guests.map((g) => [
        g.sr_no || "",
        g.guest_name || "",
        g.contact || "",
        g.side || "Groom",
        g.rsvp_status || "Confirmed",
        g.id_card_received || "No",
        g.arrival_date || "",
        g.arrival_time || "",
        g.arrival_location || "",
        g.arrival_flight_train_no || "",
        g.departure_date || "",
        g.departure_time || "",
        g.departure_location || "",
        g.departure_flight_train_no || "",
        g.special_request || "",
        g.call_status || "Not Called",
        g.call_count || 0,
        g.last_call_summary || "",
      ]);

      res.status(200).json({
        success: true,
        headers: GOOGLE_SHEET_HEADERS,
        rows: rows,
        totalGuests: guests.length,
        wedding: {
          id: wedding.id,
          name: `${wedding.groom_name} & ${wedding.bride_name}`,
          google_sheet_url: wedding.google_sheet_url,
          google_sheet_id: wedding.google_sheet_id,
        },
      });
    } catch (error) {
      console.error("Error exporting sheet data:", error);
      res.status(500).json({
        success: false,
        message: "Failed to export sheet data",
        error: error.message,
      });
    }
  },

  // 3. GET /api/weddings/:id/sheets/script
  // Returns customized Google Apps Script code for onEdit real-time sync
  async getAppsScript(req, res) {
    try {
      const { id } = req.params;
      const wedding = await WeddingModel.getById(id);
      if (!wedding) {
        return res.status(404).json({ success: false, message: "Wedding not found" });
      }

      const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
      const host = req.get("host") || "localhost:5000";
      const serverUrl = `${protocol}://${host}`;

      const scriptCode = GoogleSheetsService.generateAppsScriptCode(id, serverUrl);

      res.status(200).json({
        success: true,
        wedding_id: id,
        server_url: serverUrl,
        script_code: scriptCode,
      });
    } catch (error) {
      console.error("Error generating Apps Script code:", error);
      res.status(500).json({
        success: false,
        message: "Failed to generate Apps Script code",
        error: error.message,
      });
    }
  },

  // 4. POST /api/weddings/:id/sheets/link
  // Link or update custom Google Sheet URL/ID for a wedding
  async linkGoogleSheet(req, res) {
    try {
      const { id } = req.params;
      const { google_sheet_url, google_sheet_id } = req.body;

      const extractedId = GoogleSheetsService.extractSheetId(google_sheet_url || google_sheet_id);
      const computedUrl = google_sheet_url || (extractedId ? `https://docs.google.com/spreadsheets/d/${extractedId}/edit` : null);

      const updated = await WeddingModel.update(id, {
        google_sheet_id: extractedId,
        google_sheet_url: computedUrl,
        google_sheet_sync_status: "connected",
      });

      if (!updated) {
        return res.status(404).json({ success: false, message: "Wedding not found" });
      }

      // When linking, check if the sheet already contains guest rows to sync into the DB
      let syncResult = null;
      if (extractedId && !extractedId.startsWith("wed_")) {
        try {
          syncResult = await GoogleSheetsService.syncFromGoogleSheet(id, extractedId);
          console.log(`✅ Automatically imported ${syncResult.totalRows} guests from linked Google Sheet!`);
        } catch (syncErr) {
          console.warn("⚠️ Note on auto-import from linked sheet:", syncErr.message);
        }
      }

      const guests = await GuestModel.getAll({ weddingId: id });
      const stats = await GuestModel.getStatistics(id);

      // Broadcast WebSocket mutation events
      const io = req.app.get("io");
      broadcastDataChange(io, {
        event: "weddings_updated",
        weddingId: id,
        payload: { action: "sheet_linked", wedding: updated },
      });
      broadcastDataChange(io, {
        event: "guests_updated",
        weddingId: id,
        payload: { action: "sheet_linked" },
      });

      res.status(200).json({
        success: true,
        message: syncResult
          ? `Google Sheet linked & synchronized successfully! (${syncResult.totalRows} guests loaded)`
          : "Google Sheet linked successfully! Headers and guests synchronized.",
        data: updated,
        syncResult,
        guests,
        stats,
      });
    } catch (error) {
      console.error("Error linking Google Sheet:", error);
      res.status(500).json({
        success: false,
        message: "Failed to link Google Sheet",
        error: error.message,
      });
    }
  },

  // 5. POST /api/sheets/webhook
  // Real-time receiver for Google Apps Script onEdit(e) & bulk sync triggers
  async handleWebhook(req, res) {
    try {
      const payload = req.body;
      if (!payload || !payload.wedding_id) {
        return res.status(400).json({
          success: false,
          message: "Invalid webhook payload. 'wedding_id' is required.",
        });
      }

      const result = await GoogleSheetsService.handleWebhook(payload);

      // Broadcast WebSocket mutation event
      const io = req.app.get("io");
      broadcastDataChange(io, {
        event: "guests_updated",
        weddingId: payload.wedding_id,
        payload: { action: "webhook_edit", data: result },
      });

      res.status(200).json({
        success: true,
        message: "Google Sheet edit processed and synced with MySQL Database successfully!",
        data: result,
      });
    } catch (error) {
      console.error("Error handling Google Sheet webhook:", error);
      res.status(500).json({
        success: false,
        message: "Failed to process Google Sheet webhook",
        error: error.message,
      });
    }
  },

  // 6. POST /api/sheets/weddings/:id/create-live-sheet
  // Automatically generates a live Google Spreadsheet via Google API for an existing wedding
  async createLiveSheet(req, res) {
    try {
      const { id } = req.params;
      const wedding = await WeddingModel.getById(id);
      if (!wedding) {
        return res.status(404).json({ success: false, message: "Wedding not found" });
      }

      const sheetData = await GoogleSheetsService.generateOrRealCreateSheet(wedding);
      
      const updated = await WeddingModel.update(id, {
        google_sheet_id: sheetData.google_sheet_id,
        google_sheet_url: sheetData.google_sheet_url,
        google_sheet_sync_status: sheetData.google_sheet_sync_status,
      });

      // If guests exist, push them to the new sheet
      try {
        await GoogleSheetsService.pushGuestsToGoogleSheet(id, sheetData.google_sheet_url);
      } catch (pushErr) {
        console.warn("Could not push guests immediately:", pushErr.message);
      }

      // Broadcast WebSocket mutation event
      const io = req.app.get("io");
      broadcastDataChange(io, {
        event: "weddings_updated",
        weddingId: id,
        payload: { action: "live_sheet_created", wedding: updated },
      });

      res.status(200).json({
        success: sheetData.isLiveCreated,
        isLiveCreated: sheetData.isLiveCreated,
        message: sheetData.isLiveCreated
          ? "Live Google Spreadsheet created successfully on Google Drive!"
          : (sheetData.apiError
              ? `Google Cloud API note: ${sheetData.apiError}`
              : "Created Google Sheet fallback link."),
        apiError: sheetData.apiError || null,
        help: !sheetData.isLiveCreated
          ? {
              clientEmail: sheetData.clientEmail || "manish@marriage-data-510707.iam.gserviceaccount.com",
              projectId: sheetData.projectId || "marriage-data-510707",
              sheetsApiUrl: `https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=${sheetData.projectId || "marriage-data-510707"}`,
              driveApiUrl: `https://console.cloud.google.com/apis/library/drive.googleapis.com?project=${sheetData.projectId || "marriage-data-510707"}`,
            }
          : null,
        data: {
          wedding: updated,
          sheet_url: sheetData.google_sheet_url,
          sheet_id: sheetData.google_sheet_id,
          isLiveCreated: sheetData.isLiveCreated,
        },
      });
    } catch (error) {
      console.error("Error creating live Google Sheet:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to create Google Sheet",
      });
    }
  },
};

