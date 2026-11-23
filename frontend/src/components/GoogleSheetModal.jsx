import React, { useState, useEffect } from "react";
import {
  FileSpreadsheet,
  X,
  ExternalLink,
  RefreshCw,
  Copy,
  Check,
  Link2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Zap,
  PlusCircle,
} from "lucide-react";
import { api } from "../services/api";

export default function GoogleSheetModal({
  isOpen,
  wedding,
  onClose,
  onSyncSuccess,
}) {
  const [activeTab, setActiveTab] = useState("sync"); // 'sync' | 'link'
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [customSheetUrl, setCustomSheetUrl] = useState("");
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [isGeneratingSheet, setIsGeneratingSheet] = useState(false);
  const [permissionHelp, setPermissionHelp] = useState(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  useEffect(() => {
    if (wedding && isOpen) {
      setCustomSheetUrl(wedding.google_sheet_url || "");
      setSyncResult(null);
      setErrorMessage("");
      setPermissionHelp(null);
      setCopiedLink(false);
    }
  }, [wedding, isOpen]);

  if (!isOpen || !wedding) return null;

  const isPlaceholderLink =
    !wedding.google_sheet_url ||
    wedding.google_sheet_url.includes("wed_") ||
    !wedding.google_sheet_id ||
    String(wedding.google_sheet_id).startsWith("wed_");

  const sheetUrl =
    wedding.google_sheet_url ||
    `https://docs.google.com/spreadsheets/d/${wedding.google_sheet_id || "wed_" + wedding.id}/edit`;

  const serviceAccountEmail = "manish@marriage-data-510707.iam.gserviceaccount.com";
  const projectId = "marriage-data-510707";

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setErrorMessage("");
    setSyncResult(null);
    setPermissionHelp(null);

    try {
      const targetUrl = (customSheetUrl && customSheetUrl.trim()) || wedding.google_sheet_url;
      const result = await api.syncGoogleSheet(wedding.id, targetUrl);
      setSyncResult(result);
      if (onSyncSuccess) {
        onSyncSuccess(result);
      }
    } catch (err) {
      setErrorMessage(
        err.message ||
          "Failed to sync with Google Sheet. Please check that the Google Sheet link is valid and accessible."
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleGenerateLiveSheet = async () => {
    setIsGeneratingSheet(true);
    setErrorMessage("");
    setSyncResult(null);
    setPermissionHelp(null);

    try {
      const result = await api.createLiveGoogleSheet(wedding.id);
      if (result.isLiveCreated) {
        wedding.google_sheet_url = result.sheet_url;
        wedding.google_sheet_id = result.sheet_id;
        wedding.google_sheet_sync_status = "connected";
        
        setSyncResult({
          message: "🎉 Live Google Spreadsheet created on Google Drive and linked!",
        });

        if (onSyncSuccess) {
          onSyncSuccess({ updatedWedding: result.wedding });
        }
      } else {
        if (result.help) {
          setPermissionHelp(result.help);
        }
        setErrorMessage(
          result.apiError
            ? `Google Cloud API note: ${result.apiError}`
            : "Google Cloud APIs need to be enabled on your project to create live sheets automatically."
        );
      }
    } catch (err) {
      if (err.help) {
        setPermissionHelp(err.help);
      }
      setErrorMessage(
        err.message ||
          "Failed to auto-generate sheet via API. You can still create one manually at sheets.new and link it."
      );
    } finally {
      setIsGeneratingSheet(false);
    }
  };

  const handleSaveCustomLink = async (e) => {
    e.preventDefault();
    if (!customSheetUrl.trim()) return;

    setIsSavingLink(true);
    setErrorMessage("");

    try {
      const response = await api.linkGoogleSheet(wedding.id, customSheetUrl.trim());
      wedding.google_sheet_url = customSheetUrl.trim();
      setSyncResult({
        message: response?.message || "Google Sheet linked & synchronized successfully!",
        data: response?.syncResult || response?.data,
      });
      setActiveTab("sync");
      if (onSyncSuccess) {
        onSyncSuccess({ updatedWedding: response?.data || wedding, syncResult: response });
      }
    } catch (err) {
      setErrorMessage(err.message || "Failed to update Google Sheet link.");
    } finally {
      setIsSavingLink(false);
    }
  };

  const handleCopyLink = () => {
    if (!sheetUrl) return;
    navigator.clipboard.writeText(sheetUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyServiceEmail = () => {
    navigator.clipboard.writeText(serviceAccountEmail);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div className="bg-white rounded-2xl sm:rounded-[28px] w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden relative animate-scaleUp my-auto max-h-[94vh] flex flex-col">
        {/* Top Header Banner */}
        <div className="bg-gradient-to-br from-[#1E3A8A] via-[#172554] to-[#1E3A8A] p-4 sm:p-6 text-white text-center relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 w-36 h-36 bg-[#FF6574]/15 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-blue-400/10 rounded-full blur-xl pointer-events-none" />

          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="w-12 h-12 mx-auto rounded-2xl bg-[#172554] border border-[#2563EB]/40 flex items-center justify-center text-[#FF6574] mb-3 shadow-sm">
            <FileSpreadsheet className="w-6 h-6" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#172554] text-[#FF6574] border border-[#FF6574]/40 text-[10px] font-bold uppercase tracking-wider mb-1.5">
            <Zap className="w-3 h-3" />
            <span>Google Sheets Sync</span>
          </div>

          <h3 className="text-lg font-black tracking-tight text-white">
            {wedding.groom_name} & {wedding.bride_name}
          </h3>
          <p className="text-xs text-blue-100/90 mt-0.5 font-normal">
            Automated spreadsheet integration & live database synchronization
          </p>

          {/* Navigation Tabs */}
          <div className="grid grid-cols-2 gap-1.5 mt-5 bg-black/25 p-1 rounded-2xl border border-white/10 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab("sync")}
              className={`py-2 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === "sync"
                  ? "bg-white text-[#1E3A8A] font-bold shadow-xs"
                  : "text-blue-100 hover:text-white"
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync & Open</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("link")}
              className={`py-2 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === "link"
                  ? "bg-[#FF6574] text-white font-bold shadow-xs"
                  : "text-blue-100 hover:text-white"
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Link Custom Sheet</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Status / Error Notifications */}
          {syncResult && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs p-3.5 rounded-2xl flex items-start gap-2.5 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">{syncResult.message || "Sync Complete!"}</p>
                {syncResult.data && (
                  <p className="text-[11px] text-emerald-800 mt-1 flex items-center gap-2 flex-wrap">
                    <span>{syncResult.data.createdCount} new guests added</span>
                    <span>• {syncResult.data.updatedCount} updated</span>
                    {syncResult.data.brideCount !== undefined && (
                      <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-bold">
                        Bride: {syncResult.data.brideCount}
                      </span>
                    )}
                    {syncResult.data.groomCount !== undefined && (
                      <span className="bg-[#14213D]/10 text-[#14213D] px-2 py-0.5 rounded-full font-bold">
                        Groom: {syncResult.data.groomCount}
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3.5 rounded-2xl flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* TAB 1: SYNC & OPEN SHEET */}
          {activeTab === "sync" && (
            <div className="space-y-4">
              {/* Linked Sheet Card */}
              <div className="bg-[#f8fafc] border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                      GS
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        Linked Google Spreadsheet
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Synchronized with guest database
                      </p>
                    </div>
                  </div>

                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isPlaceholderLink ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                  }`}>
                    {isPlaceholderLink ? "Placeholder" : "Connected"}
                  </span>
                </div>

                <div className="flex items-center gap-2 bg-white border border-slate-200/80 rounded-xl p-2 font-mono text-[11px] text-slate-700 break-all">
                  <span className="truncate flex-1">{sheetUrl}</span>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg cursor-pointer transition-colors shrink-0"
                    title="Copy Sheet URL"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Primary Action Buttons */}
                {isPlaceholderLink ? (
                  <div className="space-y-3 pt-1">
                    <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">No real Google Sheet linked yet</p>
                        <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                          This wedding currently has a placeholder link. Click below to generate a live Google Spreadsheet via API, or connect your own Google Sheet.
                        </p>
                      </div>
                    </div>

                    {/* 1-Click Generate Button */}
                    <button
                      type="button"
                      onClick={handleGenerateLiveSheet}
                      disabled={isGeneratingSheet}
                      className="w-full bg-gradient-to-r from-emerald-600 to-[#14362a] hover:from-emerald-500 hover:to-[#0f2922] text-white py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-60"
                    >
                      <Sparkles className={`w-4 h-4 text-[#84e030] ${isGeneratingSheet ? "animate-spin" : ""}`} />
                      <span>{isGeneratingSheet ? "Creating Live Sheet on Google Drive..." : "✨ Generate Live Google Sheet via API Now"}</span>
                    </button>

                    <div className="flex items-center gap-2 text-[11px] text-slate-400 my-1 justify-center">
                      <span className="h-px bg-slate-200 flex-1" />
                      <span>or manually connect</span>
                      <span className="h-px bg-slate-200 flex-1" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <a
                        href="https://sheets.new"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer text-center"
                      >
                        <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Create at sheets.new</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => setActiveTab("link")}
                        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer text-center"
                      >
                        <Link2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Paste Sheet URL</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <a
                      href={sheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer text-center"
                    >
                      <span>Open Google Sheet</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    <button
                      type="button"
                      onClick={handleSyncNow}
                      disabled={isSyncing}
                      className="w-full bg-[#0f2922] hover:bg-[#163a30] text-white py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-60"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-[#84e030] ${isSyncing ? "animate-spin" : ""}`} />
                      <span>{isSyncing ? "Pulling..." : "Pull & Sync to DB"}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Google Cloud API Permission Help Guide (If Permission Error) */}
              {(permissionHelp || errorMessage.includes("permission")) && (
                <div className="bg-indigo-50/90 border border-indigo-200 rounded-2xl p-4 text-xs text-indigo-950 space-y-2.5 animate-fadeIn">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-900">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>How to Fix "The caller does not have permission":</span>
                  </div>
                  <p className="text-[11px] text-indigo-800 leading-relaxed">
                    Google Cloud requires enabling the <strong>Google Sheets API</strong> and <strong>Google Drive API</strong> on project <code className="bg-indigo-100 px-1 py-0.5 rounded font-mono text-indigo-900">{projectId}</code>:
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <a
                      href={`https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=${projectId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 bg-white hover:bg-indigo-100 border border-indigo-300 text-indigo-900 px-3 py-2 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors shadow-2xs text-center"
                    >
                      <span>1. Enable Sheets API</span>
                      <ExternalLink className="w-3 h-3 text-indigo-600" />
                    </a>
                    <a
                      href={`https://console.cloud.google.com/apis/library/drive.googleapis.com?project=${projectId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 bg-white hover:bg-indigo-100 border border-indigo-300 text-indigo-900 px-3 py-2 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors shadow-2xs text-center"
                    >
                      <span>2. Enable Drive API</span>
                      <ExternalLink className="w-3 h-3 text-indigo-600" />
                    </a>
                  </div>
                </div>
              )}

              {/* How Two-Way Sync Works Info Box */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-700 space-y-2">
                <span className="font-bold flex items-center gap-1.5 text-slate-900">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <span>How Google Sheet & Database Sync Works</span>
                </span>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600 leading-relaxed">
                  <li>
                    <strong>2 Separate Sheets Supported:</strong> In your Google Spreadsheet, you can have 2 separate tabs at the bottom: <strong>"Groom Side"</strong> (for Groom guests) and <strong>"Bride Side"</strong> (for Bride guests).
                  </li>
                  <li>
                    <strong>Automatic Side Detection:</strong> When you click <em>"Pull from Sheet"</em> or <em>"Pull & Sync to DB"</em>, both tabs are pulled into the database and tagged to their respective side.
                  </li>
                  <li>
                    <strong>Plain Text Format:</strong> Standard columns: <em>Sr No, Guest Name, Contact, Relation, RSVP Status, Arrival Date, Arrival Flight/Train, Special Request</em>. No formulas required!
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 2: CUSTOM SHEET LINK */}
          {activeTab === "link" && (
            <form onSubmit={handleSaveCustomLink} className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs text-slate-700 space-y-1.5">
                <p className="font-bold text-slate-900">Link an Existing Google Spreadsheet</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Have an existing Google Sheet with your guest list? Paste its shareable link or Spreadsheet ID below to connect it directly to this wedding.
                </p>
                <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-[11px] text-slate-700 mt-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">Service Account Email:</span>
                    <button
                      type="button"
                      onClick={handleCopyServiceEmail}
                      className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {copiedEmail ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedEmail ? "Copied" : "Copy Email"}</span>
                    </button>
                  </div>
                  <div className="font-mono text-[10px] text-slate-600 bg-slate-50 p-1.5 rounded select-all break-all">
                    {serviceAccountEmail}
                  </div>
                  <p className="text-[10px] text-slate-500 pt-0.5">
                    💡 In your Google Sheet, click <strong>Share</strong> and add this email as <strong>Editor</strong> (or set access to "Anyone with the link can edit/view").
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Google Sheet Shareable Link or ID
                </label>
                <input
                  type="text"
                  value={customSheetUrl}
                  onChange={(e) => setCustomSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/your-sheet-id/edit"
                  className="w-full bg-[#f8fafc] border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#84e030] font-mono"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <a
                  href="https://sheets.new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold inline-flex items-center gap-1"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Create new Sheet at sheets.new</span>
                </a>

                <button
                  type="submit"
                  disabled={isSavingLink || !customSheetUrl.trim()}
                  className="bg-[#1E3A8A] hover:bg-[#172554] text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 transition-all"
                >
                  {isSavingLink ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-[#FF6574]" />
                      <span>Save & Link</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Database Sync Ready</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-200/70 text-xs font-semibold cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

