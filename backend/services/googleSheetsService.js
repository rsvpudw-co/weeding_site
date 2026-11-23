import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../Db_connection/dbconnection.js";
import { GuestModel } from "../models/guestModel.js";
import { WeddingModel } from "../models/weddingModel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let googleModule = null;
const getGoogleLib = async () => {
  if (googleModule) return googleModule;
  try {
    const mod = await import("googleapis");
    googleModule = mod.google || mod.default?.google || mod;
    return googleModule;
  } catch (err) {
    return null;
  }
};

// Standard column headers for Google Sheet
export const GOOGLE_SHEET_HEADERS = [
  "Sr No",
  "Guest Name",
  "Contact",
  "Side",
  "Relation",
  "RSVP Status",
  "ID Card Received",
  "Arrival Date",
  "Arrival Time",
  "Arrival Location",
  "Arrival Flight/Train",
  "Departure Date",
  "Departure Time",
  "Departure Location",
  "Departure Flight/Train",
  "Special Request",
  "Call Status",
  "Call Count",
  "Last Call Notes",
];

export const GoogleSheetsService = {
  // 1. Get Google Auth Client from credentials JSON or ENV
  async getGoogleAuth() {
    try {
      const google = await getGoogleLib();
      if (!google || !google.auth) {
        return { auth: null, source: "googleapis package not installed yet" };
      }

      // Check both "google_cred" and "google _cred" folders
      const possibleCredDirs = [
        path.resolve(__dirname, "../google_cred"),
        path.resolve(__dirname, "../google _cred"),
        path.resolve(process.cwd(), "google_cred"),
        path.resolve(process.cwd(), "google _cred"),
        path.resolve(process.cwd(), "backend/google_cred"),
        path.resolve(process.cwd(), "backend/google _cred"),
      ];

      let foundInCredDir = null;
      for (const dir of possibleCredDirs) {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
          if (files.length > 0) {
            foundInCredDir = path.join(dir, files[0]);
            break;
          }
        }
      }

      const possibleJsonPaths = [
        foundInCredDir,
        path.resolve(process.cwd(), "google_cred/marriage-data-510707-d6602e06d760.json"),
        path.resolve(process.cwd(), "google _cred/marriage-data-510707-d6602e06d760.json"),
        path.resolve(__dirname, "../google_cred/marriage-data-510707-d6602e06d760.json"),
        path.resolve(__dirname, "../google _cred/marriage-data-510707-d6602e06d760.json"),
        path.resolve(process.cwd(), "google-credentials.json"),
        path.resolve(process.cwd(), "credentials.json"),
        path.resolve(process.cwd(), "service-account.json"),
        path.resolve(__dirname, "../google-credentials.json"),
        path.resolve(__dirname, "../../google-credentials.json"),
        process.env.GOOGLE_APPLICATION_CREDENTIALS
          ? path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS)
          : null,
      ].filter(Boolean);

      let keyFile = null;
      for (const p of possibleJsonPaths) {
        if (fs.existsSync(p)) {
          keyFile = p;
          break;
        }
      }

      if (keyFile) {
        let credentials = null;
        let projectId = null;
        try {
          credentials = JSON.parse(fs.readFileSync(keyFile, "utf8"));
          projectId = credentials.project_id || null;
          if (credentials.private_key) {
            let key = String(credentials.private_key).replace(/\\n/g, "\n").trim();
            if (!key.includes("-----BEGIN PRIVATE KEY-----")) {
              key = `-----BEGIN PRIVATE KEY-----\n${key}`;
            }
            if (!key.includes("-----END PRIVATE KEY-----")) {
              key = `${key}\n-----END PRIVATE KEY-----\n`;
            }
            credentials.private_key = key;
          }
        } catch (e) { }

        const auth = new google.auth.GoogleAuth({
          credentials: credentials || undefined,
          keyFile: credentials ? undefined : keyFile,
          scopes: [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
            "https://www.googleapis.com/auth/drive.file",
          ],
        });
        return { auth, keyFile, projectId, source: `File: ${path.basename(keyFile)}` };
      }

      // Check for raw JSON string in environment variable
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        try {
          const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
          if (credentials.private_key) {
            let key = String(credentials.private_key).replace(/\\n/g, "\n").trim();
            if (!key.includes("-----BEGIN PRIVATE KEY-----")) {
              key = `-----BEGIN PRIVATE KEY-----\n${key}`;
            }
            if (!key.includes("-----END PRIVATE KEY-----")) {
              key = `${key}\n-----END PRIVATE KEY-----\n`;
            }
            credentials.private_key = key;
          }
          const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: [
              "https://www.googleapis.com/auth/spreadsheets",
              "https://www.googleapis.com/auth/drive",
              "https://www.googleapis.com/auth/drive.file",
            ],
          });
          return { auth, projectId: credentials.project_id || null, source: "ENV: GOOGLE_APPLICATION_CREDENTIALS" };
        } catch (e) { }
      }

      return { auth: null, source: "None (Fallback Mode)" };
    } catch (err) {
      console.warn("⚠️ Google Auth initialization warning:", err.message);
      return { auth: null, source: `Error: ${err.message}` };
    }
  },

  // 2. Check Auth Status
  async getAuthStatus() {
    const { auth, source, projectId } = await this.getGoogleAuth();
    if (!auth) {
      return {
        isConfigured: false,
        source: source,
        message:
          "Google credentials JSON not detected. Place your Service Account JSON file as 'backend/google_cred/marriage-data-510707-d6602e06d760.json' for automated live Google Drive creation.",
      };
    }

    try {
      const client = await auth.getClient();
      const email = client.email || client.credentials?.client_email || "Service Account";
      const resolvedProjectId = projectId || client.projectId || "marriage-data-510707";
      return {
        isConfigured: true,
        clientEmail: email,
        projectId: resolvedProjectId,
        sheetsApiUrl: `https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=${resolvedProjectId}`,
        driveApiUrl: `https://console.cloud.google.com/apis/library/drive.googleapis.com?project=${resolvedProjectId}`,
        source: source,
        message: `Authenticated with Google Cloud as ${email}`,
      };
    } catch (e) {
      return {
        isConfigured: false,
        source: source,
        message: `Failed to authenticate with Google API: ${e.message}`,
      };
    }
  },

  // 2b. Helper to retrieve configured Google Auth Service Account client email
  async getGoogleAuthClientEmail() {
    try {
      const { auth } = await this.getGoogleAuth();
      if (auth) {
        const client = await auth.getClient();
        return (
          client.email ||
          client.credentials?.client_email ||
          "manish@marriage-data-510707.iam.gserviceaccount.com"
        );
      }
    } catch (e) {}
    return "manish@marriage-data-510707.iam.gserviceaccount.com";
  },

  // 2c. Helper to dynamically detect the true header row index from tabular sheet data
  findHeaderRowIndex(rows) {
    if (!rows || rows.length === 0) return 0;
    const isGuestCol = (c) => {
      const s = String(c || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      return (
        s === "guestname" ||
        s === "name" ||
        s === "fullname" ||
        s === "guest" ||
        s === "guests" ||
        s === "invitee" ||
        s.includes("guestname") ||
        s === "contact" ||
        s === "phone" ||
        s === "mobile" ||
        s === "side" ||
        s === "relation" ||
        s === "rsvp" ||
        s === "rsvpstatus" ||
        s === "srno" ||
        s === "sr" ||
        s === "sno"
      );
    };

    const maxScan = Math.min(rows.length, 12);
    for (let i = 0; i < maxScan; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.length === 0) continue;
      const matchCount = row.filter(isGuestCol).length;
      // If at least 2 guest-related columns match, or 1 strong match with >= 2 non-empty cells
      if (matchCount >= 2) return i;
      const cleaned = row.map((c) => String(c || "").toLowerCase().replace(/[^a-z0-9]/g, ""));
      const hasStrong = cleaned.some((c) => c === "guestname" || c === "fullname" || c === "guest_name" || (c === "name" && row.filter(Boolean).length >= 3));
      if (hasStrong) return i;
    }
    return 0;
  },

  // 3. Extract Spreadsheet ID from URL or return ID as-is
  extractSheetId(urlOrId) {
    if (!urlOrId) return null;
    const trimmed = urlOrId.trim();
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return match[1];
    }
    if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
      return trimmed;
    }
    return trimmed;
  },

  // 3b. Extract Google Drive Folder ID from full URL or raw ID
  extractDriveFolderId(urlOrId) {
    if (!urlOrId) return null;
    const trimmed = String(urlOrId).trim().replace(/['"]/g, "");
    // Match /drive/folders/<id> or /folders/<id> or /u/0/folders/<id>
    const match = trimmed.match(/\/folders\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return match[1];
    }
    // Match ?id=<id>
    const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9-_]+)/);
    if (idMatch && idMatch[1]) {
      return idMatch[1];
    }
    // Strip trailing slash / query params if any
    const clean = trimmed.split("?")[0].split("#")[0].replace(/\/$/, "");
    return clean;
  },

  // 3c. Get configured Google Drive Folder ID from ENV or .env file
  getDriveFolderId() {
    let rawFolderInput = process.env.GOOGLE_DRIVE_FOLDER_ID || null;
    if (!rawFolderInput) {
      try {
        const envPaths = [
          path.resolve(__dirname, "../.env"),
          path.resolve(process.cwd(), "backend/.env"),
          path.resolve(process.cwd(), ".env"),
        ];
        for (const ep of envPaths) {
          if (fs.existsSync(ep)) {
            const content = fs.readFileSync(ep, "utf8");
            const match = content.match(/GOOGLE_DRIVE_FOLDER_ID\s*=\s*([^\r\n]+)/);
            if (match && match[1]) {
              rawFolderInput = match[1].trim();
              break;
            }
          }
        }
      } catch (e) {}
    }
    return this.extractDriveFolderId(rawFolderInput);
  },

  // 4. Create or generate a Google Sheet for a Wedding
  async generateOrRealCreateSheet(wedding) {
    const cleanGroom = (wedding.groom_name || "Groom").trim();
    const cleanBride = (wedding.bride_name || "Bride").trim();
    const title = `${cleanGroom} & ${cleanBride} - Guest & Logistics Directory`;

    const { auth, projectId } = await this.getGoogleAuth();
    const google = await getGoogleLib();
    let apiErrorMessage = null;
    let clientEmail = null;

    if (auth && google) {
      try {
        const authClient = await auth.getClient();
        clientEmail = authClient.email || authClient.credentials?.client_email || null;
        const sheets = google.sheets({ version: "v4", auth: authClient });
        const drive = google.drive({ version: "v3", auth: authClient });

        const folderId = this.getDriveFolderId();
        let spreadsheetId = null;
        let spreadsheetUrl = null;

        // 1. If a Google Drive Folder ID is configured, create or manage inside that shared folder
        if (folderId) {
          try {
            console.log(`📁 Checking for spreadsheets in Drive Folder ID: ${folderId}...`);
            const listRes = await drive.files.list({
              q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
              supportsAllDrives: true,
              fields: "files(id, name, webViewLink)",
              pageSize: 20,
            });

            const templateFile = listRes.data.files && listRes.data.files[0];

            if (templateFile) {
              const targetSpreadsheetId = templateFile.id;
              console.log(`📋 Using Google Spreadsheet '${templateFile.name}' (${targetSpreadsheetId}) for wedding directory...`);

              // Get existing sheets/tabs in the spreadsheet
              const metaRes = await sheets.spreadsheets.get({ spreadsheetId: targetSpreadsheetId });
              const existingSheets = metaRes.data.sheets || [];
              const tabTitle = `${cleanGroom} & ${cleanBride}`;
              let targetSheetGid = null;

              const matchingSheet = existingSheets.find(
                (s) => s.properties?.title?.toLowerCase().trim() === tabTitle.toLowerCase().trim()
              );

              if (matchingSheet) {
                targetSheetGid = matchingSheet.properties.sheetId;
                console.log(`✓ Tab '${tabTitle}' already exists with GID: ${targetSheetGid}`);
              } else if (
                existingSheets.length === 1 &&
                (existingSheets[0].properties.title === "Sheet1" ||
                  existingSheets[0].properties.title === "Guest Directory" ||
                  existingSheets[0].properties.title === "Templete")
              ) {
                // Rename first default sheet to wedding name
                const firstSheetId = existingSheets[0].properties.sheetId;
                await sheets.spreadsheets.batchUpdate({
                  spreadsheetId: targetSpreadsheetId,
                  requestBody: {
                    requests: [
                      {
                        updateSheetProperties: {
                          properties: {
                            sheetId: firstSheetId,
                            title: tabTitle,
                            gridProperties: { frozenRowCount: 1 },
                          },
                          fields: "title,gridProperties.frozenRowCount",
                        },
                      },
                    ],
                  },
                });
                targetSheetGid = firstSheetId;
                console.log(`✓ Renamed primary sheet to '${tabTitle}' (GID: ${targetSheetGid})`);
              } else {
                // Add a new dedicated tab for this wedding
                const addSheetRes = await sheets.spreadsheets.batchUpdate({
                  spreadsheetId: targetSpreadsheetId,
                  requestBody: {
                    requests: [
                      {
                        addSheet: {
                          properties: {
                            title: tabTitle,
                            gridProperties: { frozenRowCount: 1 },
                          },
                        },
                      },
                    ],
                  },
                });
                targetSheetGid =
                  addSheetRes.data.replies?.[0]?.addSheet?.properties?.sheetId || 0;
                console.log(`✓ Created new tab '${tabTitle}' with GID: ${targetSheetGid}`);
              }

              // Format Header Row A1:R1 on the specific tab
              await sheets.spreadsheets.values.update({
                spreadsheetId: targetSpreadsheetId,
                range: `'${tabTitle}'!A1:R1`,
                valueInputOption: "USER_ENTERED",
                requestBody: {
                  values: [GOOGLE_SHEET_HEADERS],
                },
              });

              spreadsheetId = targetSpreadsheetId;
              spreadsheetUrl =
                targetSheetGid !== null
                  ? `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit#gid=${targetSheetGid}`
                  : `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;

              console.log(`✅ Live Google Sheet tab ready & formatted: ${spreadsheetUrl}`);
            }
          } catch (folderErr) {
            console.warn("⚠️ Folder spreadsheet setup note:", folderErr.message);
            apiErrorMessage = folderErr.response?.data?.error?.message || folderErr.message;
          }
        }

        // 2. Direct Sheets API creation with 2 separate sheets: "Groom Side" and "Bride Side"
        if (!spreadsheetId) {
          const createRes = await sheets.spreadsheets.create({
            requestBody: {
              properties: {
                title: title,
              },
              sheets: [
                {
                  properties: {
                    title: "Groom Side",
                    gridProperties: {
                      frozenRowCount: 1,
                    },
                  },
                },
                {
                  properties: {
                    title: "Bride Side",
                    gridProperties: {
                      frozenRowCount: 1,
                    },
                  },
                },
              ],
            },
          });

          spreadsheetId = createRes.data.spreadsheetId;
          spreadsheetUrl =
            createRes.data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
        }

        // 3. Format Header Row on both tabs
        if (spreadsheetId) {
          try {
            await sheets.spreadsheets.values.batchUpdate({
              spreadsheetId: spreadsheetId,
              requestBody: {
                valueInputOption: "USER_ENTERED",
                data: [
                  { range: "'Groom Side'!A1:S1", values: [GOOGLE_SHEET_HEADERS] },
                  { range: "'Bride Side'!A1:S1", values: [GOOGLE_SHEET_HEADERS] },
                ],
              },
            });
          } catch (e) {
            await sheets.spreadsheets.values.update({
              spreadsheetId: spreadsheetId,
              range: "A1:S1",
              valueInputOption: "USER_ENTERED",
              requestBody: {
                values: [GOOGLE_SHEET_HEADERS],
              },
            });
          }

          // 4. Make the Spreadsheet Publicly Editable / Viewable by Anyone with Link
          try {
            await drive.permissions.create({
              fileId: spreadsheetId,
              supportsAllDrives: true,
              requestBody: {
                role: "writer",
                type: "anyone",
              },
            });
          } catch (permErr) {
            console.warn("⚠️ Drive permission share warning:", permErr.message);
          }

          console.log(`✅ Real Google Sheet created via Google API: ${spreadsheetUrl}`);

          return {
            google_sheet_id: spreadsheetId,
            google_sheet_url: spreadsheetUrl,
            google_sheet_sync_status: "connected",
            isLiveCreated: true,
            clientEmail: clientEmail,
            projectId: projectId,
          };
        }
      } catch (apiError) {
        apiErrorMessage = apiError.response?.data?.error?.message || apiError.message;
        console.warn("⚠️ Error creating live Google Sheet via API (falling back to generated link):", apiErrorMessage);
        if (apiError.response?.data?.error?.details) {
          console.warn("API Error Details:", JSON.stringify(apiError.response.data.error.details));
        }
      }
    }

    // Fallback: Generate unique Google Sheet metadata
    const groomClean = cleanGroom.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const brideClean = cleanBride.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    const randomSuffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const sheetId = `wed_${groomClean}_${brideClean}_${randomSuffix}`;
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;

    return {
      google_sheet_id: sheetId,
      google_sheet_url: sheetUrl,
      google_sheet_sync_status: "connected",
      isLiveCreated: false,
      apiError: apiErrorMessage,
      clientEmail: clientEmail,
      projectId: projectId || "marriage-data-510707",
    };
  },

  // 5. Parse CSV text (from Google Sheet CSV Export or Webhook) into row objects
  parseCSV(csvText) {
    if (!csvText) return [];
    const lines = [];
    let currentLine = [];
    let currentField = "";
    let insideQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentField += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === "," && !insideQuotes) {
        currentLine.push(currentField.trim());
        currentField = "";
      } else if ((char === "\r" || char === "\n") && !insideQuotes) {
        if (char === "\r" && nextChar === "\n") {
          i++;
        }
        currentLine.push(currentField.trim());
        if (currentLine.some((field) => field.length > 0)) {
          lines.push(currentLine);
        }
        currentLine = [];
        currentField = "";
      } else {
        currentField += char;
      }
    }

    if (currentField.length > 0 || currentLine.length > 0) {
      currentLine.push(currentField.trim());
      if (currentLine.some((field) => field.length > 0)) {
        lines.push(currentLine);
      }
    }

    if (lines.length < 2) return [];

    const headerIdx = this.findHeaderRowIndex(lines);
    const rawHeaders = lines[headerIdx] || lines[0];
    const headers = rawHeaders.map((h) => h.toLowerCase().trim().replace(/[^a-z0-9]/g, "_"));
    const rows = [];

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const row = lines[i];
      if (!row || row.length === 0 || row.every((c) => !c || String(c).trim() === "")) continue;
      const rowObj = {};
      headers.forEach((header, index) => {
        rowObj[header] = row[index] !== undefined ? row[index] : "";
      });
      rows.push(rowObj);
    }

    return rows;
  },

  // 6. Normalize a row object into MySQL Guest structure
  normalizeRowToGuest(row, weddingId, defaultSrNo = 1, defaultSide = null) {
    const rowKeys = Object.keys(row || {});
    const getVal = (...keys) => {
      // 1. Direct or sanitized match on row
      for (const k of keys) {
        if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") {
          return String(row[k]).trim();
        }
        const cleaned = k.toLowerCase().replace(/[^a-z0-9]/g, "_");
        if (row[cleaned] !== undefined && row[cleaned] !== null && String(row[cleaned]).trim() !== "") {
          return String(row[cleaned]).trim();
        }
      }
      // 2. Fuzzy match across all row keys
      for (const k of keys) {
        const cleanKw = k.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!cleanKw) continue;
        for (const rk of rowKeys) {
          const cleanRk = rk.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (cleanRk === cleanKw || cleanRk.includes(cleanKw) || cleanKw.includes(cleanRk)) {
            if (row[rk] !== undefined && row[rk] !== null && String(row[rk]).trim() !== "") {
              return String(row[rk]).trim();
            }
          }
        }
      }
      return null;
    };

    const guestName =
      getVal(
        "guest_name",
        "guestname",
        "name",
        "full_name",
        "fullname",
        "name_of_guest",
        "guest",
        "guests",
        "guest_names",
        "family_name",
        "person_name",
        "invitee",
        "invitees",
        "member_name",
        "contact_name",
        "attendee"
      ) || "";
    const srNoRaw = getVal("sr_no", "srno", "sr", "serial_no", "serial", "s_no", "sno", "id", "#");
    const srNo = srNoRaw && !isNaN(Number(srNoRaw)) ? Number(srNoRaw) : defaultSrNo;
    const contact =
      getVal(
        "contact",
        "phone",
        "mobile",
        "contact_no",
        "phone_number",
        "mobile_no",
        "whatsapp",
        "cell",
        "contact_number",
        "tel"
      ) || "";
    const relation =
      getVal(
        "relation",
        "relationship",
        "relation_to_couple",
        "relation_to_bride_groom",
        "guest_relation",
        "relative",
        "relation_type"
      ) || null;

    // Side normalization supporting single/combined column, Indian wedding terms, and abbreviations
    const rawSideVal = getVal(
      "side",
      "bride_groom",
      "groom_bride",
      "side_bride_groom",
      "side_groom_bride",
      "whose_side",
      "family_side",
      "side_type",
      "party",
      "affiliation",
      "category",
      "ladka_ladki",
      "ladki_ladka",
      "team",
      "paksh"
    );

    let side = null;
    if (rawSideVal) {
      const s = rawSideVal.toLowerCase().trim();
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
        side = "Bride";
      } else if (
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
        side = "Groom";
      } else if (s.includes("both") || s.includes("mutual") || s.includes("common")) {
        side = "Both";
      }
    }

    // If side column is missing or empty, infer from relation or tab default
    if (!side) {
      const relLower = (relation || "").toLowerCase();
      if (
        relLower.includes("bride") ||
        relLower.includes("ladki") ||
        relLower.includes("girl") ||
        relLower.includes("female") ||
        relLower.includes("wife")
      ) {
        side = "Bride";
      } else if (
        relLower.includes("groom") ||
        relLower.includes("ladka") ||
        relLower.includes("ladke") ||
        relLower.includes("boy") ||
        relLower.includes("male") ||
        relLower.includes("husband")
      ) {
        side = "Groom";
      } else if (row._tabDefaultSide) {
        side = row._tabDefaultSide;
      } else if (defaultSide) {
        side = defaultSide;
      } else {
        side = "Groom";
      }
    }

    // RSVP normalization
    let rsvp = getVal("rsvp_status", "rsvp", "status") || "Confirmed";
    if (rsvp.toLowerCase().includes("confirm")) rsvp = "Confirmed";
    else if (rsvp.toLowerCase().includes("pend")) rsvp = "Pending";
    else if (rsvp.toLowerCase().includes("decline") || rsvp.toLowerCase().includes("regret")) rsvp = "Declined";

    // ID Card Received normalization
    let idCard = getVal("id_card_received", "id_card", "id_received", "id_proof") || "No";
    if (idCard.toLowerCase().includes("yes") || idCard.toLowerCase().includes("true") || idCard.toLowerCase().includes("y")) {
      idCard = "Yes";
    } else {
      idCard = "No";
    }

    // Call status & count
    let callStatus = getVal("call_status", "calling_status", "call") || "Not Called";
    const callCountRaw = getVal("call_count", "call_attempts", "attempts");
    const callCount = callCountRaw && !isNaN(Number(callCountRaw)) ? Number(callCountRaw) : 0;
    let callSummary = getVal("last_call_notes", "last_call_summary", "call_summary", "remarks", "notes") || null;

    // Safety guard: last_call_summary is NEVER the guest's name
    if (
      callSummary !== null &&
      callSummary !== undefined &&
      guestName &&
      String(callSummary).trim().toLowerCase() === String(guestName).trim().toLowerCase()
    ) {
      callSummary = null;
    }
    if (callStatus === "1" || callStatus === "2" || (!isNaN(Number(callStatus)) && callStatus !== "Not Called")) {
      callStatus = callCount > 0 ? "Connected" : "Not Called";
    }

    return {
      wedding_id: weddingId,
      sr_no: srNo,
      guest_name: guestName,
      contact: contact,
      side: side,
      relation: relation,
      rsvp_status: rsvp,
      id_card_received: idCard,
      arrival_date: getVal("arrival_date", "arrival"),
      arrival_time: getVal("arrival_time", "arr_time"),
      arrival_location: getVal("arrival_location", "arr_location", "arrival_city"),
      arrival_flight_train_no: getVal("arrival_flight_train_no", "arr_flight", "flight_no", "train_no", "arrival_flight_train"),
      departure_date: getVal("departure_date", "departure"),
      departure_time: getVal("departure_time", "dep_time"),
      departure_location: getVal("departure_location", "dep_location", "departure_city"),
      departure_flight_train_no: getVal("departure_flight_train_no", "dep_flight", "departure_flight_train"),
      special_request: getVal("special_request", "special_requests", "preferences", "dietary"),
      call_count: callCount,
      call_status: callStatus,
      last_call_summary: callSummary,
    };
  },

  // 7. Upsert guest record into MySQL / Supabase
  async upsertGuest(weddingId, guestData) {
    let existing = null;

    if (guestData.sr_no) {
      existing = await GuestModel.findBySrNo(weddingId, guestData.sr_no);
    }

    if (!existing && guestData.guest_name) {
      existing = await GuestModel.findByName(weddingId, guestData.guest_name);
    }

    if (existing) {
      const updated = await GuestModel.update(existing.id, {
        ...guestData,
        wedding_id: weddingId,
      });
      return { action: "updated", guest: updated };
    } else {
      const created = await GuestModel.create({
        ...guestData,
        wedding_id: weddingId,
      });
      return { action: "created", guest: created };
    }
  },

  // 7b. Extract Tab GID from URL
  extractSheetGid(url) {
    if (!url) return null;
    const match = String(url).match(/[#&]gid=([0-9]+)/);
    return match ? Number(match[1]) : null;
  },

  // 7c. Resolve active tab title for a wedding
  async resolveSheetTab(sheets, spreadsheetId, sheetUrlOrId, weddingId) {
    try {
      const gid = this.extractSheetGid(sheetUrlOrId);
      const res = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetsList = res.data.sheets || [];

      if (gid !== null) {
        const foundByGid = sheetsList.find((s) => s.properties?.sheetId === gid);
        if (foundByGid && foundByGid.properties?.title) {
          return foundByGid.properties.title;
        }
      }

      if (weddingId) {
        const wedding = await WeddingModel.getById(weddingId);
        if (wedding) {
          const expectedTitle = `${wedding.groom_name} & ${wedding.bride_name}`.toLowerCase().trim();
          const foundByName = sheetsList.find(
            (s) => s.properties?.title?.toLowerCase().trim() === expectedTitle
          );
          if (foundByName && foundByName.properties?.title) {
            return foundByName.properties.title;
          }
        }
      }

      if (sheetsList.length > 0 && sheetsList[0].properties?.title) {
        return sheetsList[0].properties.title;
      }
    } catch (e) {}
    return null;
  },

  // 7d. Discover all tabs and their GIDs directly from Google Sheet HTML (Works without Service Account API)
  async discoverSheetTabsFromHtml(sheetId) {
    if (!sheetId) return [];
    try {
      const urls = [
        `https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`,
        `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
      ];
      for (const u of urls) {
        try {
          const res = await fetch(u, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) WeddingLogisticsApp/1.0",
            },
          });
          if (!res.ok) continue;
          const html = await res.text();
          if (!html || html.length < 50) continue;

          const tabs = [];
          const seenGids = new Set();

          // Regex 1: <li id="sheet-button-([0-9]+)"[^>]*><a[^>]*>([^<]+)</a>
          const r1 = /id=["']sheet-button-([0-9]+)["'][^>]*><a[^>]*>([^<]+)<\/a>/gi;
          let m1;
          while ((m1 = r1.exec(html)) !== null) {
            const gid = m1[1];
            const name = m1[2].trim();
            if (!seenGids.has(gid)) {
              seenGids.add(gid);
              tabs.push({ gid, name });
            }
          }

          // Regex 2: {"sheetId":([0-9]+),"title":"([^"]+)"}
          const r2 = /\{[^}]*?["']sheetId["']?\s*:\s*([0-9]+)[^}]*?["']title["']?\s*:\s*["']([^"']+)["']/gi;
          let m2;
          while ((m2 = r2.exec(html)) !== null) {
            const gid = m2[1];
            const name = m2[2].trim();
            if (!seenGids.has(gid)) {
              seenGids.add(gid);
              tabs.push({ gid, name });
            }
          }

          // Regex 3: {"pageUrl":"...gid=([0-9]+)...","name":"([^"]+)"}
          const r3 = /pageUrl["']?\s*:\s*["'][^"']*gid=([0-9]+)["'][^}]*?["']?name["']?\s*:\s*["']([^"']+)["']/gi;
          let m3;
          while ((m3 = r3.exec(html)) !== null) {
            const gid = m3[1];
            const name = m3[2].trim();
            if (!seenGids.has(gid)) {
              seenGids.add(gid);
              tabs.push({ gid, name });
            }
          }

          if (tabs.length > 0) {
            return tabs;
          }
        } catch (innerErr) {}
      }
    } catch (e) {}
    return [];
  },

  // 8. Sync from Google Sheet to MySQL DB (via Google API v4 if authenticated, or CSV fallback)
  async syncFromGoogleSheet(weddingId, sheetUrlOrId) {
    const sheetId = this.extractSheetId(sheetUrlOrId);
    if (!sheetId) {
      throw new Error("Invalid Google Sheet URL or ID");
    }

    if (sheetId.startsWith("wed_")) {
      throw new Error(
        "This wedding is currently linked to a placeholder link. Please link an actual Google Sheet URL via the 'Link Custom Sheet' tab (or enable Google Sheets API in Google Cloud Console and create a new wedding)."
      );
    }

    const { auth } = await this.getGoogleAuth();
    const google = await getGoogleLib();
    let rows = [];

    // 1. Try Google Sheets API v4 with Service Account
    if (auth && google) {
      try {
        const sheets = google.sheets({ version: "v4", auth });
        const gid = this.extractSheetGid(sheetUrlOrId);
        
        // Retrieve spreadsheet metadata to inspect all tabs
        const metaRes = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
        const sheetsList = metaRes.data.sheets || [];

        let targetTabs = [];
        if (gid !== null) {
          const found = sheetsList.find((s) => s.properties?.sheetId === gid);
          if (found) targetTabs.push(found);
        }

        if (targetTabs.length === 0) {
          // If no specific gid was provided, check all valid guest sheets
          const isExcludedTab = (t) => /summary|dashboard|stats|overview|instructions|readme|settings|template/i.test(t);
          const candidateTabs = sheetsList.filter(
            (s) => s.properties?.title && !isExcludedTab(s.properties.title)
          );
          if (candidateTabs.length > 0) {
            targetTabs = candidateTabs;
          } else if (sheetsList.length > 0) {
            targetTabs = [sheetsList[0]];
          }
        }

        for (const tab of targetTabs) {
          const tabTitle = tab.properties?.title;
          if (!tabTitle) continue;

          let tabDefaultSide = null;
          const tLower = tabTitle.toLowerCase();
          if (tLower.includes("bride") || tLower.includes("ladki") || tLower.includes("girl") || tLower.includes("female")) {
            tabDefaultSide = "Bride";
          } else if (tLower.includes("groom") || tLower.includes("ladka") || tLower.includes("ladke") || tLower.includes("boy") || tLower.includes("male")) {
            tabDefaultSide = "Groom";
          }

          try {
            const fetchRange = `'${tabTitle}'!A1:Z2000`;
            const res = await sheets.spreadsheets.values.get({
              spreadsheetId: sheetId,
              range: fetchRange,
            });

            const values = res.data.values;
            if (values && values.length >= 2) {
              const headerIdx = this.findHeaderRowIndex(values);
              const rawHeaders = values[headerIdx] || values[0];
              const headers = rawHeaders.map((h) => String(h || "").toLowerCase().trim().replace(/[^a-z0-9]/g, "_"));
              for (let i = headerIdx + 1; i < values.length; i++) {
                const rowValues = values[i];
                if (!rowValues || rowValues.length === 0 || rowValues.every((v) => !v || String(v).trim() === "")) continue;
                const rowObj = { _tabDefaultSide: tabDefaultSide };
                headers.forEach((header, index) => {
                  rowObj[header] = rowValues[index] !== undefined && rowValues[index] !== null ? String(rowValues[index]).trim() : "";
                });
                rows.push(rowObj);
              }
            }
          } catch (tabErr) {
            console.warn(`Note reading tab '${tabTitle}':`, tabErr.message);
          }
        }
      } catch (apiErr) {
        console.warn("Google API v4 fetch note:", apiErr.message);
      }
    }

    // 2. If API v4 returned no rows or wasn't configured, try CSV export URLs across all discovered tabs
    if (rows.length === 0) {
      const gid = this.extractSheetGid(sheetUrlOrId);

      // Try discovering multiple tabs (e.g. Groom tab and Bride tab) from Sheet HTML
      let tabsToFetch = [];
      if (gid !== null) {
        tabsToFetch = [{ gid: String(gid), name: "Target Sheet" }];
      } else {
        const discovered = await this.discoverSheetTabsFromHtml(sheetId);
        if (discovered && discovered.length > 0) {
          tabsToFetch = discovered;
        }
      }

      if (tabsToFetch.length > 0) {
        for (const t of tabsToFetch) {
          const tName = t.name || "";
          const tLower = tName.toLowerCase();
          let tabDefaultSide = null;
          if (tLower.includes("bride") || tLower.includes("ladki") || tLower.includes("girl") || tLower.includes("female")) {
            tabDefaultSide = "Bride";
          } else if (tLower.includes("groom") || tLower.includes("ladka") || tLower.includes("ladke") || tLower.includes("boy") || tLower.includes("male")) {
            tabDefaultSide = "Groom";
          }

          const csvUrls = [
            `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${t.gid}`,
            `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${t.gid}`,
          ];

          for (const url of csvUrls) {
            try {
              const response = await fetch(url, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) WeddingLogisticsApp/1.0",
                },
              });
              if (response.ok) {
                const text = await response.text();
                if (text && !text.includes("<!DOCTYPE html>") && text.length > 10) {
                  const tabRows = this.parseCSV(text);
                  tabRows.forEach((r) => {
                    r._tabDefaultSide = tabDefaultSide;
                  });
                  rows.push(...tabRows);
                  break;
                }
              }
            } catch (err) {}
          }
        }
      }

      // If still 0 rows, try standard root CSV export URL
      if (rows.length === 0) {
        const rootCsvUrls = [
          `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`,
          `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`,
        ];

        for (const url of rootCsvUrls) {
          try {
            const response = await fetch(url, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) WeddingLogisticsApp/1.0",
              },
            });
            if (response.ok) {
              const text = await response.text();
              if (text && !text.includes("<!DOCTYPE html>") && text.length > 10) {
                rows = this.parseCSV(text);
                break;
              }
            }
          } catch (err) {}
        }
      }
    }

    if (!rows || rows.length === 0) {
      throw new Error(
        `Unable to read rows from Google Sheet. Please ensure the Google Sheet is shared with '${this.getGoogleAuthClientEmail ? await this.getGoogleAuthClientEmail() : "service account"}' as Editor, or set share settings to "Anyone with the link can view".`
      );
    }

    // Fetch all current guests for this wedding to match existing records safely
    const currentGuests = await GuestModel.getAll({ weddingId });
    const existingPool = [...currentGuests];

    let createdCount = 0;
    let updatedCount = 0;
    let brideCount = 0;
    let groomCount = 0;
    let bothCount = 0;
    const recordsToUpsert = [];

    // Track active section side if stacked tables exist on a single sheet
    let activeSectionSide = null;

    const isSectionHeader = (name) => {
      if (!name) return false;
      const clean = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      return (
        clean.includes("brideside") ||
        clean.includes("bridefamily") ||
        clean.includes("brideguest") ||
        clean.includes("ladkiwale") ||
        clean.includes("groomside") ||
        clean.includes("groomfamily") ||
        clean.includes("groomguest") ||
        clean.includes("ladkewale") ||
        clean === "bride" ||
        clean === "groom" ||
        clean === "ladki" ||
        clean === "ladka"
      );
    };

    const isHeaderRow = (name, rawRow = {}) => {
      if (!name) return true;
      const clean = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (
        clean === "guestname" ||
        clean === "guestnames" ||
        clean === "fullname" ||
        clean === "srno" ||
        clean === "serialno" ||
        clean === "nameofguest" ||
        clean === "guest_name"
      ) {
        return true;
      }
      // If name is simply 'guest' or 'name', only treat as header if other cells also contain header keywords
      if (clean === "guest" || clean === "name") {
        const otherValues = Object.values(rawRow).map((v) =>
          String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "")
        );
        const looksLikeHeader = otherValues.some((v) =>
          ["contact", "side", "rsvp", "phone", "mobile", "srno", "relation"].includes(v)
        );
        if (looksLikeHeader) return true;
      }
      return false;
    };

    let nextSr = 1;

    for (let i = 0; i < rows.length; i++) {
      const rawRow = rows[i];
      const tabSide = rawRow._tabDefaultSide || activeSectionSide || null;
      const normalized = this.normalizeRowToGuest(rawRow, weddingId, nextSr, tabSide);

      const rawName = (normalized.guest_name || "").trim();
      if (!rawName) continue;

      // Skip repeated header rows
      if (isHeaderRow(rawName, rawRow)) continue;

      // Detect section headers (e.g., "Bride Side", "Groom Side", "Ladkiwale")
      if (isSectionHeader(rawName)) {
        const lowerName = rawName.toLowerCase();
        if (lowerName.includes("bride") || lowerName.includes("ladki") || lowerName.includes("girl")) {
          activeSectionSide = "Bride";
        } else if (lowerName.includes("groom") || lowerName.includes("ladka") || lowerName.includes("ladke") || lowerName.includes("boy")) {
          activeSectionSide = "Groom";
        }
        continue; // Do NOT insert section header as a guest record
      }

      // If side was defaulted to Groom but activeSectionSide is Bride, assign Bride
      if (activeSectionSide && (!rawRow.side && !rawRow.family_side && !rawRow.side_type && !rawRow.side_bride_groom)) {
        normalized.side = activeSectionSide;
      }

      if (normalized.side === "Bride") brideCount++;
      else if (normalized.side === "Both") bothCount++;
      else groomCount++;

      // Match existing guest safely by:
      // 1. Name + Side + Contact (best match)
      // 2. Name + Side
      // 3. Name only
      const nameKey = rawName.toLowerCase();
      const rawSide = (normalized.side || tabSide || "Groom").toLowerCase();
      const cleanContact = (normalized.contact || "").replace(/[^0-9]/g, "");

      let matchIdx = -1;
      if (cleanContact.length >= 7) {
        matchIdx = existingPool.findIndex((g) => {
          const gName = (g.guest_name || "").trim().toLowerCase();
          const gSide = (g.side || "Groom").toLowerCase();
          const gContact = (g.contact || "").replace(/[^0-9]/g, "");
          return gName === nameKey && gSide === rawSide && gContact === cleanContact;
        });
      }

      if (matchIdx === -1) {
        matchIdx = existingPool.findIndex((g) => {
          const gName = (g.guest_name || "").trim().toLowerCase();
          const gSide = (g.side || "Groom").toLowerCase();
          return gName === nameKey && gSide === rawSide;
        });
      }

      if (matchIdx === -1) {
        matchIdx = existingPool.findIndex((g) => {
          const gName = (g.guest_name || "").trim().toLowerCase();
          return gName === nameKey;
        });
      }

      let existing = null;
      if (matchIdx !== -1) {
        // Remove from pool so no two rows can ever claim or share the same ID
        existing = existingPool.splice(matchIdx, 1)[0];
      }

      if (existing) {
        updatedCount++;
        const record = {
          ...existing,
          ...normalized,
          id: existing.id,
          sr_no: normalized.sr_no || existing.sr_no || nextSr++,
          wedding_id: weddingId,
        };
        recordsToUpsert.push(record);
      } else {
        createdCount++;
        const newId = `guest_${crypto.randomUUID().slice(0, 8)}`;
        const record = {
          ...normalized,
          id: newId,
          sr_no: normalized.sr_no || nextSr++,
          wedding_id: weddingId,
        };
        recordsToUpsert.push(record);
      }
    }

    // Safety guard: Guarantee 100% unique IDs across the entire batch to prevent PostgreSQL 21000 ON CONFLICT error
    const seenBatchIds = new Set();
    for (const rec of recordsToUpsert) {
      if (!rec.id || seenBatchIds.has(rec.id)) {
        rec.id = `guest_${crypto.randomUUID().slice(0, 8)}`;
      }
      seenBatchIds.add(rec.id);
    }

    // High performance bulk upsert to Supabase & Store
    if (recordsToUpsert.length > 0) {
      await GuestModel.bulkUpsert(weddingId, recordsToUpsert);
    }

    // Update wedding last_synced timestamp in DB
    try {
      await pool.query(
        "UPDATE weddings SET google_sheet_last_synced = NOW(), google_sheet_sync_status = 'synced' WHERE id = $1",
        [weddingId]
      );
    } catch (wErr) {
      console.warn("Notice: could not update wedding last_synced timestamp:", wErr.message);
    }

    return {
      success: true,
      message: `Successfully synchronized ${recordsToUpsert.length} guests (${brideCount} Bride, ${groomCount} Groom) from Google Sheet with database!`,
      createdCount,
      updatedCount,
      totalRows: rows.length,
      brideCount,
      groomCount,
      bothCount,
    };
  },

  // 9. Push Database Guests into Google Sheet (Clears stale rows & rewrites active guests)
  async pushGuestsToGoogleSheet(weddingId, sheetUrlOrId) {
    if (!weddingId) return { success: false, message: "Missing weddingId" };

    let targetSheetUrl = sheetUrlOrId;
    if (!targetSheetUrl) {
      const wedding = await WeddingModel.getById(weddingId);
      targetSheetUrl = wedding?.google_sheet_url || wedding?.google_sheet_id;
    }

    if (!targetSheetUrl || String(targetSheetUrl).startsWith("wed_")) {
      return { success: false, message: "No active Google Sheet linked" };
    }

    const sheetId = this.extractSheetId(targetSheetUrl);
    if (!sheetId) throw new Error("Missing Google Sheet ID");

    const guests = await GuestModel.getAll({ weddingId });
    const rows = guests.map((g) => [
      g.sr_no || "",
      g.guest_name || "",
      g.contact || "",
      g.side || "Groom",
      g.relation || "",
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

    const { auth } = await this.getGoogleAuth();
    const google = await getGoogleLib();
    if (auth && google) {
      try {
        const sheets = google.sheets({ version: "v4", auth });
        
        // Inspect all tabs in the target spreadsheet
        const metaRes = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
        const existingSheets = metaRes.data.sheets || [];

        const groomTab = existingSheets.find((s) => {
          const t = (s.properties?.title || "").toLowerCase();
          return t.includes("groom") || t.includes("ladka") || t.includes("ladke");
        });
        const brideTab = existingSheets.find((s) => {
          const t = (s.properties?.title || "").toLowerCase();
          return t.includes("bride") || t.includes("ladki");
        });

        const formatGuestRow = (g, idx) => [
          g.sr_no || idx + 1,
          g.guest_name || "",
          g.contact || "",
          g.side || "Groom",
          g.relation || "",
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
        ];

        // If both Groom and Bride tabs exist, write separated lists!
        if (groomTab && brideTab) {
          const groomTitle = groomTab.properties.title;
          const brideTitle = brideTab.properties.title;

          const groomGuests = guests.filter((g) => (g.side || "").toLowerCase() !== "bride");
          const brideGuests = guests.filter((g) => (g.side || "").toLowerCase() === "bride");

          const groomRows = groomGuests.map(formatGuestRow);
          const brideRows = brideGuests.map(formatGuestRow);

          // Clear & update Groom tab
          try {
            await sheets.spreadsheets.values.clear({ spreadsheetId: sheetId, range: `'${groomTitle}'!A2:S2000` });
          } catch (e) {}
          await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `'${groomTitle}'!A1:S1`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [GOOGLE_SHEET_HEADERS] },
          });
          if (groomRows.length > 0) {
            await sheets.spreadsheets.values.update({
              spreadsheetId: sheetId,
              range: `'${groomTitle}'!A2:S${groomRows.length + 1}`,
              valueInputOption: "USER_ENTERED",
              requestBody: { values: groomRows },
            });
          }

          // Clear & update Bride tab
          try {
            await sheets.spreadsheets.values.clear({ spreadsheetId: sheetId, range: `'${brideTitle}'!A2:S2000` });
          } catch (e) {}
          await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `'${brideTitle}'!A1:S1`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [GOOGLE_SHEET_HEADERS] },
          });
          if (brideRows.length > 0) {
            await sheets.spreadsheets.values.update({
              spreadsheetId: sheetId,
              range: `'${brideTitle}'!A2:S${brideRows.length + 1}`,
              valueInputOption: "USER_ENTERED",
              requestBody: { values: brideRows },
            });
          }

          console.log(`✅ Synced separate sheets: '${groomTitle}' (${groomRows.length} Groom) and '${brideTitle}' (${brideRows.length} Bride).`);
          return { success: true, count: guests.length, groomCount: groomRows.length, brideCount: brideRows.length };
        } else {
          // Single tab fallback
          const tabTitle = await this.resolveSheetTab(sheets, sheetId, targetSheetUrl, weddingId);
          const clearRange = tabTitle ? `'${tabTitle}'!A2:S2000` : "A2:S2000";
          try {
            await sheets.spreadsheets.values.clear({
              spreadsheetId: sheetId,
              range: clearRange,
            });
          } catch (clearErr) {}

          const headerRange = tabTitle ? `'${tabTitle}'!A1:S1` : "A1:S1";
          await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: headerRange,
            valueInputOption: "USER_ENTERED",
            requestBody: {
              values: [GOOGLE_SHEET_HEADERS],
            },
          });

          if (rows.length > 0) {
            const writeRange = tabTitle
              ? `'${tabTitle}'!A2:S${rows.length + 1}`
              : "A2:S" + (rows.length + 1);

            await sheets.spreadsheets.values.update({
              spreadsheetId: sheetId,
              range: writeRange,
              valueInputOption: "USER_ENTERED",
              requestBody: {
                values: rows,
              },
            });
          }
          console.log(`✅ Synced ${rows.length} active guests to Google Sheet (tab: '${tabTitle || "default"}').`);
          return { success: true, count: rows.length };
        }
      } catch (err) {
        console.warn("⚠️ Error pushing data via Google API:", err.message);
      }
    }

  },

  // 9b. Update a single guest row in Google Sheet directly (fast in-place row update for call count, call status, notes, RSVP)
  async updateGuestRowInSheet(weddingId, guestOrId) {
    if (!weddingId || !guestOrId) {
      return { success: false, message: "Missing weddingId or guest" };
    }

    const wedding = await WeddingModel.getById(weddingId);
    if (!wedding) return { success: false, message: "Wedding not found" };

    const targetSheetUrl = wedding.google_sheet_url || wedding.google_sheet_id;
    if (!targetSheetUrl || String(targetSheetUrl).startsWith("wed_")) {
      return { success: false, message: "No active Google Sheet linked" };
    }

    const spreadsheetId = this.extractSheetId(targetSheetUrl);
    if (!spreadsheetId) return { success: false, message: "Invalid Google Sheet ID" };

    const guest = typeof guestOrId === "object" ? guestOrId : await GuestModel.getById(guestOrId);
    if (!guest) return { success: false, message: "Guest not found" };

    const { auth } = await this.getGoogleAuth();
    const google = await getGoogleLib();
    if (!auth || !google) {
      return { success: false, message: "Google API not authenticated" };
    }

    try {
      const sheets = google.sheets({ version: "v4", auth });

      // Inspect spreadsheet tabs to target the correct tab (e.g. Groom tab vs Bride tab)
      const metaRes = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetsList = metaRes.data.sheets || [];
      if (sheetsList.length === 0) {
        return { success: false, message: "No sheets found in document" };
      }

      const isBrideGuest = (guest.side || "").toLowerCase() === "bride";
      let targetTab = null;

      if (isBrideGuest) {
        targetTab = sheetsList.find((s) => {
          const t = (s.properties?.title || "").toLowerCase();
          return t.includes("bride") || t.includes("ladki");
        });
      } else {
        targetTab = sheetsList.find((s) => {
          const t = (s.properties?.title || "").toLowerCase();
          return t.includes("groom") || t.includes("ladka") || t.includes("ladke");
        });
      }

      if (!targetTab) {
        targetTab = sheetsList[0];
      }

      const tabTitle = targetTab.properties?.title || "Sheet1";

      // Fetch Columns A to D to find the row index
      const valRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${tabTitle}'!A:D`,
      });

      const rows = valRes.data.values || [];
      const searchSrNo = guest.sr_no ? String(guest.sr_no).trim() : null;
      const searchName = guest.guest_name ? String(guest.guest_name).toLowerCase().trim() : "";
      const searchContact = guest.contact ? String(guest.contact).replace(/[^0-9]/g, "") : "";

      let targetRowIndex = -1;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const colA = String(row[0] || "").trim();
        const colB = String(row[1] || "").toLowerCase().trim();
        const colC = String(row[2] || "").replace(/[^0-9]/g, "");

        if (
          (searchName && colB === searchName) ||
          (searchSrNo && colA === searchSrNo && (!colB || colB.includes(searchName) || searchName.includes(colB))) ||
          (searchContact && searchContact.length >= 7 && (colC === searchContact || colC.includes(searchContact)))
        ) {
          targetRowIndex = i;
          break;
        }
      }

      const formatGuestRow = (g) => [
        g.sr_no || "",
        g.guest_name || "",
        g.contact || "",
        g.side || "Groom",
        g.relation || "",
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
        g.call_status || (Number(g.call_count) > 0 ? "Connected" : "Not Called"),
        g.call_count !== undefined && !isNaN(Number(g.call_count)) ? Number(g.call_count) : 0,
        g.last_call_summary || "",
      ];

      if (targetRowIndex !== -1) {
        const sheetRowNum = targetRowIndex + 1; // 1-indexed row number in Google Sheets
        const fullRow = formatGuestRow(guest);

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `'${tabTitle}'!A${sheetRowNum}:S${sheetRowNum}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [fullRow] },
        });

        console.log(`✅ In-place updated guest '${guest.guest_name}' (call_count: ${guest.call_count}) in Google Sheet '${tabTitle}' at Row ${sheetRowNum}`);
        return { success: true, updatedRow: sheetRowNum, tabTitle };
      } else {
        // If not found in tab, append as new row
        const fullRow = formatGuestRow(guest);
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `'${tabTitle}'!A:S`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [fullRow] },
        });
        console.log(`✅ Appended guest '${guest.guest_name}' to Google Sheet '${tabTitle}'`);
        return { success: true, appended: true, tabTitle };
      }
    } catch (err) {
      console.warn("⚠️ Error updating single guest row in Google Sheet:", err.message);
      return this.pushGuestsToGoogleSheet(weddingId, targetSheetUrl).catch(() => {});
    }
  },

  // 9d. Delete exact guest row from Google Sheet using spreadsheets.batchUpdate & deleteDimension
  async deleteGuestRowFromSheet(weddingId, guestOrId) {
    if (!weddingId || !guestOrId) {
      return { success: false, message: "Missing weddingId or guest" };
    }

    const wedding = await WeddingModel.getById(weddingId);
    if (!wedding) return { success: false, message: "Wedding not found" };

    const targetSheetUrl = wedding.google_sheet_url || wedding.google_sheet_id;
    if (!targetSheetUrl || String(targetSheetUrl).startsWith("wed_")) {
      return { success: false, message: "No active Google Sheet linked" };
    }

    const spreadsheetId = this.extractSheetId(targetSheetUrl);
    if (!spreadsheetId) return { success: false, message: "Invalid Google Sheet ID" };

    const { auth } = await this.getGoogleAuth();
    const google = await getGoogleLib();
    if (!auth || !google) {
      return { success: false, message: "Google API not authenticated" };
    }

    try {
      const sheets = google.sheets({ version: "v4", auth });

      // 1. Get spreadsheet metadata to resolve numeric sheetId (GID) and tab title
      const metaRes = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetsList = metaRes.data.sheets || [];
      if (sheetsList.length === 0) {
        return { success: false, message: "No sheets found in document" };
      }

      const gid = this.extractSheetGid(targetSheetUrl);
      const expectedTitle = `${wedding.groom_name} & ${wedding.bride_name}`.toLowerCase().trim();

      let targetSheet = null;
      if (gid !== null) {
        targetSheet = sheetsList.find((s) => s.properties?.sheetId === gid);
      }
      if (!targetSheet) {
        targetSheet = sheetsList.find(
          (s) => s.properties?.title?.toLowerCase().trim() === expectedTitle
        );
      }
      if (!targetSheet) {
        targetSheet = sheetsList[0];
      }

      const numericSheetTabId = targetSheet.properties?.sheetId ?? 0;
      const tabTitle = targetSheet.properties?.title || "Sheet1";

      console.log(`🔍 Searching for row to delete in '${tabTitle}' (Sheet ID: ${numericSheetTabId})...`);

      // 2. Fetch Columns A to C from the tab
      const fetchRange = `'${tabTitle}'!A:C`;
      const valRes = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: fetchRange,
      });

      const rows = valRes.data.values || [];
      if (rows.length <= 1) {
        console.warn("Sheet has no guest data rows.");
        return { success: false, message: "Sheet has no data rows" };
      }

      const searchSrNo = guestOrId.sr_no ? String(guestOrId.sr_no).trim() : null;
      const searchId = typeof guestOrId === "object" ? String(guestOrId.id || "").trim() : String(guestOrId).trim();
      const searchName = guestOrId.guest_name ? String(guestOrId.guest_name).toLowerCase().trim() : null;
      const searchContact = guestOrId.contact ? String(guestOrId.contact).replace(/[^0-9]/g, "") : null;

      // 3. Find 0-indexed row index matching Sr No, ID, Guest Name, or Contact
      let targetRowIndex = -1;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const colA = String(row[0] || "").trim();
        const colB = String(row[1] || "").toLowerCase().trim();
        const colC = String(row[2] || "").replace(/[^0-9]/g, "");

        if (
          (searchName && (colB === searchName || (searchName.length >= 3 && colB.includes(searchName)))) ||
          (searchSrNo && colA === searchSrNo && (!colB || !searchName || colB.includes(searchName) || searchName.includes(colB))) ||
          (searchContact && searchContact.length >= 6 && (colC === searchContact || colC.includes(searchContact))) ||
          (searchId && colA === searchId)
        ) {
          targetRowIndex = i;
          break;
        }
      }

      if (targetRowIndex === -1) {
        console.warn(`⚠️ Guest not found in Google Sheet rows. Running fallback active sync.`);
        await this.pushGuestsToGoogleSheet(weddingId, targetSheetUrl);
        return { success: true, message: "Synchronized active guests via full sync." };
      }

      const sheetRowNumber = targetRowIndex + 1;
      console.log(`🎯 Found guest at 0-indexed row ${targetRowIndex} (Sheet Row ${sheetRowNumber}). Executing deleteDimension...`);

      // 4. Delete the exact row using deleteDimension batchUpdate
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: numericSheetTabId,
                  dimension: "ROWS",
                  startIndex: targetRowIndex,
                  endIndex: targetRowIndex + 1,
                },
              },
            },
          ],
        },
      });

      console.log(`✅ Successfully deleted row ${sheetRowNumber} from Google Sheet.`);
      return {
        success: true,
        deletedRowIndex: targetRowIndex,
        sheetRowNumber: sheetRowNumber,
        message: `Deleted row ${sheetRowNumber} from Google Sheet.`,
      };
    } catch (err) {
      console.error("❌ Error executing deleteDimension on Google Sheet:", err.message);
      // Fallback: sync active guests to ensure sheet stays clean
      await this.pushGuestsToGoogleSheet(weddingId, targetSheetUrl).catch(() => {});
      return { success: false, error: err.message };
    }
  },

  // 9c. Delete Google Sheet file or specific Wedding Tab when Wedding is deleted
  async deleteWeddingSheet(wedding) {
    if (!wedding) return;
    const sheetUrlOrId = wedding.google_sheet_url || wedding.google_sheet_id;
    if (!sheetUrlOrId || String(sheetUrlOrId).startsWith("wed_")) return;

    const spreadsheetId = this.extractSheetId(sheetUrlOrId);
    if (!spreadsheetId) return;

    const gid = this.extractSheetGid(sheetUrlOrId);

    const { auth } = await this.getGoogleAuth();
    const google = await getGoogleLib();
    if (!auth || !google) return;

    try {
      const sheets = google.sheets({ version: "v4", auth });
      const drive = google.drive({ version: "v3", auth });

      // 1. Get all tabs in the spreadsheet
      const metaRes = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetsList = metaRes.data.sheets || [];
      const expectedTitle = `${wedding.groom_name} & ${wedding.bride_name}`.toLowerCase().trim();

      // Find the sheet to delete by GID or by Title
      let targetSheet = null;
      if (gid !== null) {
        targetSheet = sheetsList.find((s) => s.properties?.sheetId === gid);
      }
      if (!targetSheet) {
        targetSheet = sheetsList.find(
          (s) => s.properties?.title?.toLowerCase().trim() === expectedTitle
        );
      }

      if (targetSheet && targetSheet.properties) {
        const targetSheetId = targetSheet.properties.sheetId;
        const targetTabTitle = targetSheet.properties.title;

        // If there are multiple tabs in the spreadsheet, safely delete this wedding's tab
        if (sheetsList.length > 1) {
          console.log(`🗑️ Deleting tab '${targetTabTitle}' (ID: ${targetSheetId}) from spreadsheet ${spreadsheetId}...`);
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            requestBody: {
              requests: [
                {
                  deleteSheet: {
                    sheetId: targetSheetId,
                  },
                },
              ],
            },
          });
          console.log(`✅ Successfully deleted wedding tab '${targetTabTitle}'.`);
          return;
        } else {
          // If it's the only tab in the spreadsheet, clear all data and rename it to 'Sheet1'
          console.log(`🧹 Clearing only tab '${targetTabTitle}' in spreadsheet ${spreadsheetId}...`);
          await sheets.spreadsheets.values.clear({
            spreadsheetId: spreadsheetId,
            range: `'${targetTabTitle}'!A1:Z1000`,
          });
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId,
            requestBody: {
              requests: [
                {
                  updateSheetProperties: {
                    properties: {
                      sheetId: targetSheetId,
                      title: "Sheet1",
                    },
                    fields: "title",
                  },
                },
              ],
            },
          });
          console.log(`✅ Cleared and reset sheet contents.`);
          return;
        }
      }

      // 2. Only attempt file deletion if it is NOT a shared folder or shared template spreadsheet
      const configuredFolder = this.getDriveFolderId();
      if (spreadsheetId === configuredFolder) {
        console.log(`ℹ️ Spreadsheet ID matches shared folder; skipping file deletion.`);
        return;
      }

      // Check if it's a dedicated standalone file (only 1 sheet and not a shared template)
      if (sheetsList.length <= 1) {
        try {
          console.log(`🗑️ Attempting to clean standalone Google Drive file ${spreadsheetId}...`);
          await sheets.spreadsheets.values.clear({
            spreadsheetId: spreadsheetId,
            range: "A1:Z1000",
          });
          console.log(`✅ Cleared standalone sheet contents.`);
        } catch (clearErr) {
          console.warn("Drive sheet clear note:", clearErr.message);
        }
      }
    } catch (err) {
      console.warn("⚠️ Error during Google Sheet deletion:", err.message);
    }
  },

  // 9b. Initialize headers and push guests to a linked sheet
  async initializeAndPushToSheet(weddingId, sheetUrlOrId) {
    const sheetId = this.extractSheetId(sheetUrlOrId);
    if (!sheetId) return;

    const { auth } = await this.getGoogleAuth();
    const google = await getGoogleLib();
    if (!auth || !google) return;

    try {
      const sheets = google.sheets({ version: "v4", auth });

      // Check if header row exists
      let hasHeaders = false;
      try {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: "A1:R1",
        });
        if (res.data.values && res.data.values.length > 0 && res.data.values[0].length > 0) {
          hasHeaders = true;
        }
      } catch (e) {}

      if (!hasHeaders) {
        // Write standard 18 headers to A1:R1
        await sheets.spreadsheets.values.update({
          spreadsheetId: sheetId,
          range: "A1:R1",
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [GOOGLE_SHEET_HEADERS],
          },
        });
        console.log(`✅ Formatted headers in Google Sheet ID: ${sheetId}`);
      }

      // Push all existing guests into rows
      await this.pushGuestsToGoogleSheet(weddingId, sheetId);
    } catch (err) {
      console.warn("⚠️ Error initializing sheet headers and data:", err.message);
    }
  },

  // 10. Handle Google Apps Script onEdit / onChange Webhook
  async handleWebhook(payload) {
    if (!payload || !payload.wedding_id) {
      throw new Error("Missing wedding_id in webhook payload");
    }

    const weddingId = payload.wedding_id;
    const eventType = payload.event || "edit";

    if (Array.isArray(payload.rows)) {
      let created = 0;
      let updated = 0;
      for (let i = 0; i < payload.rows.length; i++) {
        const normalized = this.normalizeRowToGuest(payload.rows[i], weddingId, i + 1, payload.rows[i]._tabDefaultSide);
        if (!normalized.guest_name) continue;
        const res = await this.upsertGuest(weddingId, normalized);
        if (res.action === "created") created++;
        else updated++;
      }
      await pool.query(
        "UPDATE weddings SET google_sheet_last_synced = NOW(), google_sheet_sync_status = 'synced' WHERE id = $1",
        [weddingId]
      );
      return {
        success: true,
        eventType,
        created,
        updated,
        total: payload.rows.length,
      };
    }

    if (payload.row || payload.data) {
      const rowData = payload.row || payload.data;
      const normalized = this.normalizeRowToGuest(rowData, weddingId, 1, rowData._tabDefaultSide);
      const res = await this.upsertGuest(weddingId, normalized);

      await pool.query(
        "UPDATE weddings SET google_sheet_last_synced = NOW(), google_sheet_sync_status = 'synced' WHERE id = $1",
        [weddingId]
      );

      return {
        success: true,
        eventType,
        action: res.action,
        guest: res.guest,
      };
    }

    return { success: true, message: "Webhook processed." };
  },

  // 11. Generate Google Apps Script code to paste into Google Sheet
  generateAppsScriptCode(weddingId, serverUrl = "http://localhost:5000") {
    const webhookEndpoint = `${serverUrl.replace(/\/$/, "")}/api/sheets/webhook`;

    return `/**
 * =========================================================================
 * Wedding Logistics & Guest Management - Real-Time Google Sheet Sync Script
 * Wedding ID: ${weddingId}
 * Target API: ${webhookEndpoint}
 * =========================================================================
 * Instructions:
 * 1. Open your Google Sheet -> Click 'Extensions' -> 'Apps Script'
 * 2. Delete any existing code in Code.gs, paste this entire script, and click Save (💾).
 * 3. Any edit made in this Sheet will automatically sync to your MySQL database in real-time!
 */

const WEDDING_ID = "${weddingId}";
const WEBHOOK_URL = "${webhookEndpoint}";

/**
 * Triggered automatically every time any cell in this Sheet is edited
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    const rowNumber = e.range.getRow();
    
    // Ignore header row
    if (rowNumber <= 1) return;
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const rowValues = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    const rowObject = {};
    for (let i = 0; i < headers.length; i++) {
      const key = String(headers[i]).trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
      rowObject[key] = rowValues[i];
    }
    
    // Send updated row payload to Wedding Backend
    const payload = {
      wedding_id: WEDDING_ID,
      event: "edit",
      row_number: rowNumber,
      row: rowObject,
      timestamp: new Date().toISOString()
    };
    
    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    UrlFetchApp.fetch(WEBHOOK_URL, options);
  } catch (err) {
    Logger.log("Error in onEdit webhook sync: " + err.toString());
  }
}

/**
 * Creates a convenient custom menu in Google Sheets
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("💍 Wedding System")
    .addItem("🔄 Sync All Guests to Database", "syncAllGuestsToDatabase")
    .addItem("📋 Setup Standard Column Headers", "setupStandardHeaders")
    .addToUi();
}

/**
 * 1-Click Sync all rows in this Sheet to the MySQL database
 */
function syncAllGuestsToDatabase() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    SpreadsheetApp.getUi().alert("No guest rows found to sync.");
    return;
  }
  
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
    rows: rows,
    timestamp: new Date().toISOString()
  };
  
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(WEBHOOK_URL, options);
  SpreadsheetApp.getUi().alert("✓ Synced " + rows.length + " guests to Wedding Database!\\nResponse: " + response.getContentText());
}

/**
 * Sets up recommended column headers if sheet is blank
 */
function setupStandardHeaders() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const headers = [
    "Sr No",
    "Guest Name",
    "Contact",
    "Side",
    "RSVP Status",
    "ID Card Received",
    "Arrival Date",
    "Arrival Time",
    "Arrival Location",
    "Arrival Flight/Train",
    "Departure Date",
    "Departure Time",
    "Departure Location",
    "Departure Flight/Train",
    "Special Request",
    "Call Status",
    "Call Count",
    "Last Call Notes"
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#0f2922").setFontColor("#ffffff");
  SpreadsheetApp.getUi().alert("✓ Standard Wedding Column Headers applied successfully!");
}
`;
  },
};
