import React, { useState, useEffect, useRef } from "react";
import {
  X,
  PlaneLanding,
  PlaneTakeoff,
  User,
  Calendar,
  Clock,
  MapPin,
  Plane,
  FileText,
  MessageSquare,
  Phone,
  Send,
  Sparkles,
  Train,
  Accessibility,
  Check,
  CreditCard,
  UploadCloud,
  File,
  Trash2,
  Eye,
  FileCheck2,
  Heart,
  FileSpreadsheet,
} from "lucide-react";
import { api } from "../services/api";
import { getGuestIdCardMeta, formatBytes, MAX_ID_CARD_FILE_BYTES } from "../utils/idCardUtils";

const normalizeRsvp = (status) => {
  if (!status) return "Confirmed";
  const s = String(status).toLowerCase().trim();
  if (s.includes("confirm") || s.includes("attend")) return "Confirmed";
  if (s.includes("pend")) return "Pending";
  if (s.includes("decline") || s.includes("regret") || s.includes("not")) return "Declined";
  return "Confirmed";
};

export default function GuestModal({
  isOpen,
  onClose,
  onSubmit,
  initialData = null,
  isSubmitting = false,
  nextSrNo = 1,
  currentWeddingId = "wedding_01",
}) {
  const [formData, setFormData] = useState({
    sr_no: "",
    wedding_id: currentWeddingId,
    guest_name: "",
    contact: "",
    side: "Groom",
    relation: "",
    rsvp_status: "Confirmed",
    id_card_received: "No",
    arrival_date: "",
    arrival_time: "",
    arrival_location: "",
    arrival_flight_train_no: "",
    departure_date: "",
    departure_time: "",
    departure_location: "",
    departure_flight_train_no: "",
    id_card_copy: "",
    special_request: "",
  });

  const [errors, setErrors] = useState({});
  const [isDragging, setIsDragging] = useState(false);
  const [fileDetails, setFileDetails] = useState(null);
  const [selectedIdFile, setSelectedIdFile] = useState(null);
  const [removeIdCard, setRemoveIdCard] = useState(false);
  const fileInputRef = useRef(null);
  const objectUrlRef = useRef(null);

  const revokeObjectUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  useEffect(() => {
    return () => revokeObjectUrl();
  }, []);

  useEffect(() => {
    revokeObjectUrl();
    setSelectedIdFile(null);
    setRemoveIdCard(false);

    if (initialData) {
      setFormData({
        sr_no: initialData.sr_no || "",
        wedding_id: initialData.wedding_id || currentWeddingId,
        guest_name: initialData.guest_name || "",
        contact: initialData.contact || "",
        side: initialData.side || "Groom",
        relation: initialData.relation || "",
        rsvp_status: normalizeRsvp(initialData.rsvp_status),
        id_card_received: initialData.id_card_received || "No",
        arrival_date: initialData.arrival_date || "",
        arrival_time: initialData.arrival_time || "",
        arrival_location: initialData.arrival_location || "",
        arrival_flight_train_no: initialData.arrival_flight_train_no || "",
        departure_date: initialData.departure_date || "",
        departure_time: initialData.departure_time || "",
        departure_location: initialData.departure_location || "",
        departure_flight_train_no: initialData.departure_flight_train_no || "",
        id_card_copy: initialData.id_card_copy || "",
        special_request: initialData.special_request || "",
      });

      const meta = getGuestIdCardMeta(initialData);
      if (meta.hasDocument) {
        setFileDetails({
          name: meta.fileName,
          preview: meta.isImage ? meta.viewUrl : null,
          isPdf: meta.isPdf,
          isImage: meta.isImage,
          viewUrl: meta.viewUrl,
          downloadUrl: meta.downloadUrl,
          size: meta.fileSizeLabel,
        });

        if (meta.hasBackendBinary && initialData.id) {
          const controller = new AbortController();
          api
            .fetchGuestIdCardBlob(initialData.id, { signal: controller.signal })
            .then(({ blobUrl, mimeType }) => {
              revokeObjectUrl();
              objectUrlRef.current = blobUrl;
              const fetchedIsImg = mimeType ? mimeType.startsWith("image/") : meta.isImage;
              const fetchedIsPdf = mimeType ? mimeType.includes("pdf") : meta.isPdf;
              setFileDetails((prev) =>
                prev
                  ? {
                      ...prev,
                      preview: fetchedIsImg ? blobUrl : null,
                      isImage: fetchedIsImg,
                      isPdf: fetchedIsPdf,
                      viewUrl: blobUrl,
                      downloadUrl: blobUrl,
                    }
                  : prev
              );
            })
            .catch(() => {});
          return () => controller.abort();
        }
      } else {
        setFileDetails(null);
      }
    } else {
      setFormData({
        sr_no: nextSrNo,
        wedding_id: currentWeddingId,
        guest_name: "",
        contact: "",
        side: "Groom",
        relation: "",
        rsvp_status: "Confirmed",
        id_card_received: "No",
        arrival_date: "",
        arrival_time: "",
        arrival_location: "",
        arrival_flight_train_no: "",
        departure_date: "",
        departure_time: "",
        departure_location: "",
        departure_flight_train_no: "",
        id_card_copy: "",
        special_request: "",
      });
      setFileDetails(null);
    }
    setErrors({});
  }, [initialData, isOpen, nextSrNo, currentWeddingId]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleFileProcess = (file) => {
    if (!file) return;
    const fileName = (file.name || "").toLowerCase();
    const isPdf =
      file.type === "application/pdf" ||
      file.type === "application/x-pdf" ||
      fileName.endsWith(".pdf");
    const isImage =
      (file.type.startsWith("image/") && !file.type.includes("svg")) ||
      fileName.endsWith(".png") ||
      fileName.endsWith(".jpg") ||
      fileName.endsWith(".jpeg") ||
      fileName.endsWith(".webp") ||
      fileName.endsWith(".gif") ||
      fileName.endsWith(".bmp");

    if (!isPdf && !isImage) {
      alert("Please upload a valid Photo (JPG, PNG, WEBP, GIF, BMP) or PDF document.");
      return;
    }

    if (file.size > MAX_ID_CARD_FILE_BYTES) {
      alert("File size is too large (max 20 MB). Please choose a smaller document.");
      return;
    }

    revokeObjectUrl();
    const previewUrl = URL.createObjectURL(file);
    objectUrlRef.current = previewUrl;

    setSelectedIdFile(file);
    setRemoveIdCard(false);
    setFormData((prev) => ({
      ...prev,
      id_card_copy: previewUrl,
      id_card_received: "Yes",
    }));

    setFileDetails({
      name: file.name,
      size: formatBytes(file.size) || "Ready to upload",
      preview: isImage ? previewUrl : null,
      isPdf: isPdf,
      isImage: isImage,
      viewUrl: previewUrl,
      downloadUrl: previewUrl,
    });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileProcess(e.target.files[0]);
    }
  };

  const handleRemoveFile = () => {
    revokeObjectUrl();
    setSelectedIdFile(null);
    setRemoveIdCard(true);
    setFormData((prev) => ({
      ...prev,
      id_card_copy: "",
      id_card_file_name: "",
      id_card_mime_type: "",
      id_card_file_size: "",
    }));
    setFileDetails(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };



  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!formData.guest_name || formData.guest_name.trim() === "") {
      newErrors.guest_name = "Guest name is required";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const cleanSrNo =
      formData.sr_no !== undefined && formData.sr_no !== ""
        ? Number(formData.sr_no) || formData.sr_no
        : (initialData?.sr_no || nextSrNo);

    onSubmit({
      ...formData,
      sr_no: cleanSrNo,
      _idCardFile: selectedIdFile || null,
      _removeIdCard: removeIdCard,
    });
  };

  const currentSrNo = formData.sr_no || nextSrNo;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/45 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div className="bg-white rounded-2xl sm:rounded-[28px] w-full max-w-2xl max-h-[94vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden my-auto">
        {/* Modal Top Header */}
        <div className="px-4 sm:px-7 pt-4 sm:pt-6 pb-3 sm:pb-4 border-b border-slate-100 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {/* Badges */}
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 flex-wrap">
                <span className="bg-[#ebf9df] text-[#4d7f1d] px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-bold shadow-2xs">
                  Guest Entry Form
                </span>
                <span className="bg-[#f1f5f9] text-[#475569] px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold shadow-2xs">
                  Auto Sr No #{currentSrNo}
                </span>
              </div>

              {/* Title */}
              <h2 className="text-lg sm:text-2xl font-extrabold text-slate-900 tracking-tight leading-tight">
                {initialData ? "Edit Guest & Travel Details" : "Add Guest & Travel Details"}
              </h2>

              {/* Subtitle */}
              <p className="text-xs text-slate-500 mt-0.5 font-normal">
                Fill in guest information, wedding side affiliation, and logistics.
              </p>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer shrink-0 mt-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <form onSubmit={handleSubmit} autoComplete="off" className="flex-1 overflow-y-auto px-4 sm:px-7 py-4 sm:py-5 space-y-4 sm:space-y-5">
          {/* ================= 1. GUEST INFORMATION ================= */}
          <div className="bg-[#fafcfb] border border-slate-200/90 rounded-2xl p-5 space-y-4 shadow-2xs">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-700" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                1. GUEST INFORMATION
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Guest Name */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Guest Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    name="guest_name"
                    autoComplete="off"
                    value={formData.guest_name}
                    onChange={handleChange}
                    placeholder="e.g. James Passaquindici"
                    className={`w-full bg-white border rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] shadow-2xs transition-all ${errors.guest_name ? "border-rose-400 bg-rose-50/30" : "border-slate-200"
                      }`}
                  />
                </div>
                {errors.guest_name && (
                  <p className="text-[11px] text-rose-500 mt-1 font-medium">{errors.guest_name}</p>
                )}
              </div>

              {/* Contact (Phone / Email) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Contact (Phone / Email)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    name="contact"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    value={formData.contact}
                    onChange={handleChange}
                    placeholder="e.g. +1 (555) 234-8901/james@emi.com"
                    className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] shadow-2xs transition-all"
                  />
                </div>
              </div>

              {/* Guest Side Selection (Bride / Groom Only) */}
              <div className="sm:col-span-2 bg-white border border-slate-200 rounded-xl p-3">
                <label className="block text-xs font-bold text-slate-800 mb-2">
                  Whose Side is the Guest from? (Wedding Affiliation)
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, side: "Bride" }))}
                    className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${formData.side === "Bride"
                        ? "bg-rose-500 text-white shadow-xs"
                        : "bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/70"
                      }`}
                  >
                    <span>👰</span>
                    <span>Bride's Side</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, side: "Groom" }))}
                    className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${formData.side === "Groom"
                        ? "bg-sky-600 text-white shadow-xs"
                        : "bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-200/70"
                      }`}
                  >
                    <span>🤵</span>
                    <span>Groom's Side</span>
                  </button>
                </div>
              </div>

              {/* Relation of Guest to Bride / Groom */}
              <div className="sm:col-span-2 bg-white border border-slate-200 rounded-xl p-3">
                <label className="block text-xs font-bold text-slate-800 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500/20" />
                    <span>Relation to {formData.side === "Bride" ? "Bride" : "Groom"}</span>
                  </span>
                  <span className="text-[10px] font-normal text-slate-400">e.g. Sister, Friend, Cousin, Colleague</span>
                </label>
                <div className="relative">
                  <Heart className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    name="relation"
                    list="relation-options"
                    value={formData.relation || ""}
                    onChange={handleChange}
                    placeholder={
                      formData.side === "Bride"
                        ? "e.g. Sister, Best Friend, Cousin, Aunt, Colleague..."
                        : "e.g. Brother, Best Friend, Colleague, Uncle, Cousin..."
                    }
                    className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] shadow-2xs transition-all"
                  />
                  <datalist id="relation-options">
                    <option value="Friend" />
                    <option value="Best Friend" />
                    <option value="Sister" />
                    <option value="Brother" />
                    <option value="Cousin" />
                    <option value="Uncle" />
                    <option value="Aunt" />
                    <option value="Colleague" />
                    <option value="Father" />
                    <option value="Mother" />
                    <option value="Grandfather" />
                    <option value="Grandmother" />
                    <option value="Family Relative" />
                  </datalist>
                </div>
                {/* Quick selection chips */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {(formData.side === "Bride"
                    ? ["Sister", "Brother", "Cousin", "Best Friend", "Colleague", "Aunt"]
                    : ["Brother", "Sister", "Cousin", "Best Friend", "Colleague", "Uncle"]
                  ).map((rel) => (
                    <button
                      key={rel}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, relation: rel }))}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer ${formData.relation === rel
                          ? "bg-emerald-100 text-emerald-900 border-emerald-300 font-bold"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                        }`}
                    >
                      +{rel}
                    </button>
                  ))}
                </div>
              </div>

              {/* RSVP Status */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  RSVP Status
                </label>
                <select
                  name="rsvp_status"
                  value={formData.rsvp_status}
                  onChange={handleChange}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] shadow-2xs cursor-pointer"
                >
                  <option value="Confirmed">✓ Confirmed (Attending)</option>
                  <option value="Pending">⏳ Pending Response</option>
                  <option value="Declined">✕ Regrets (Not Coming)</option>
                </select>
              </div>

              {/* D Card Received / ID Card (Segmented Button Group) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  D Card Received / ID Card
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, id_card_received: "Yes" }))}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs ${formData.id_card_received === "Yes"
                        ? "bg-[#eaf9bb] text-[#3b630a] border border-[#cbfa3b] font-bold"
                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                  >
                    <span>✓ Received (Yes)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, id_card_received: "No" }))}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs ${formData.id_card_received === "No"
                        ? "bg-slate-900 text-white border border-slate-900 font-bold"
                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                  >
                    <span>✕ Pending (No)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ================= 2. ARRIVAL SECTION ================= */}
          <div className="bg-[#f4fcf7] border border-emerald-200/80 rounded-2xl p-5 space-y-4 shadow-2xs">
            <div className="flex items-center gap-2">
              <PlaneLanding className="w-4 h-4 text-[#15803d]" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#15803d]">
                2. ARRIVAL SECTION
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Arrival Date */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Arrival Date
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    name="arrival_date"
                    value={formData.arrival_date}
                    onChange={handleChange}
                    placeholder="09-08-2026"
                    className="w-full bg-white border border-emerald-200 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-2xs"
                  />
                </div>
              </div>

              {/* Arrival Time */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Arrival Time
                </label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    name="arrival_time"
                    value={formData.arrival_time}
                    onChange={handleChange}
                    placeholder="10:00 AM"
                    className="w-full bg-white border border-emerald-200 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-2xs"
                  />
                </div>
              </div>

              {/* Arrival Location */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Arrival Location (Airport/Station)
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    name="arrival_location"
                    value={formData.arrival_location}
                    onChange={handleChange}
                    placeholder="Mumbai Int. Airport (T2)"
                    className="w-full bg-white border border-emerald-200 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-2xs"
                  />
                </div>
              </div>

              {/* Flight / Train No */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Flight / Train No
                </label>
                <div className="relative">
                  <Plane className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    name="arrival_flight_train_no"
                    value={formData.arrival_flight_train_no}
                    onChange={handleChange}
                    placeholder="AI-682"
                    className="w-full bg-white border border-emerald-200 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-2xs font-medium"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ================= 3. DEPARTURE SECTION ================= */}
          <div className="bg-[#f9f8ff] border border-purple-200/80 rounded-2xl p-5 space-y-4 shadow-2xs">
            <div className="flex items-center gap-2">
              <PlaneTakeoff className="w-4 h-4 text-[#7e22ce]" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#7e22ce]">
                3. DEPARTURE SECTION
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Departure Date */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Departure Date
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    name="departure_date"
                    value={formData.departure_date}
                    onChange={handleChange}
                    placeholder="09-11-2026"
                    className="w-full bg-white border border-purple-200 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400 shadow-2xs"
                  />
                </div>
              </div>

              {/* Departure Time */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Departure Time
                </label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    name="departure_time"
                    value={formData.departure_time}
                    onChange={handleChange}
                    placeholder="06:30 PM"
                    className="w-full bg-white border border-purple-200 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400 shadow-2xs"
                  />
                </div>
              </div>

              {/* Departure Location */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Departure Location
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    name="departure_location"
                    value={formData.departure_location}
                    onChange={handleChange}
                    placeholder="Mumbai Int. Airport (T2)"
                    className="w-full bg-white border border-purple-200 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400 shadow-2xs"
                  />
                </div>
              </div>

              {/* Flight / Train No */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Flight / Train No
                </label>
                <div className="relative">
                  <Plane className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    name="departure_flight_train_no"
                    value={formData.departure_flight_train_no}
                    onChange={handleChange}
                    placeholder="AI-894"
                    className="w-full bg-white border border-purple-200 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400 shadow-2xs font-medium"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ================= 4. DOCUMENTS & SPECIAL REQUESTS ================= */}
          <div className="bg-[#fafbfc] border border-slate-200/90 rounded-2xl p-5 space-y-4 shadow-2xs">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-700" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                4. DOCUMENTS & SPECIAL REQUESTS
              </h3>
            </div>

            {/* D Card Copy Drop Zone */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-800">
                  D Card Copy / ID Document (PDF or Image)
                </label>
                {formData.id_card_copy && (
                  <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                    <FileCheck2 className="w-3.5 h-3.5" /> File Attached
                  </span>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/jpg,image/gif,image/bmp"
                onChange={handleFileInputChange}
                className="hidden"
              />

              {!formData.id_card_copy ? (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${isDragging
                      ? "border-[#FF6574] bg-[#FF6574]/10 scale-[1.01]"
                      : "border-slate-300 hover:border-[#1E3A8A] bg-[#f8fafc] hover:bg-slate-100"
                    }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200/80 shadow-2xs flex items-center justify-center mx-auto text-emerald-700 mb-3">
                    <UploadCloud className="w-6 h-6 stroke-[2]" />
                  </div>
                  <p className="text-xs font-bold text-slate-800">
                    <span className="text-emerald-700 hover:underline">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Photo (JPG, PNG, WEBP, GIF) or PDF document — stored securely in PostgreSQL (max 20 MB)
                  </p>
                </div>
              ) : (
                <div className="bg-white border border-emerald-200/90 rounded-2xl p-3.5 shadow-2xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 overflow-hidden">
                    {fileDetails?.preview ? (
                      <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 shrink-0 bg-slate-50">
                        <img
                          src={fileDetails.preview}
                          alt="ID Card Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                        <FileText className="w-6 h-6" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">
                        {fileDetails?.name || formData.id_card_copy}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {fileDetails?.size || "Document ready"} • {fileDetails?.isPdf ? "PDF Document" : "Photo File"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                      { fileDetails?.viewUrl && (
                        <a
                          href={fileDetails.viewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-[11px] font-bold flex items-center gap-1 transition-colors"
                          title="Open document in new tab"
                        >
                          <Eye className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{fileDetails?.isPdf ? "View PDF" : "View"}</span>
                        </a>
                      )}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="p-1.5 rounded-xl text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Remove file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Special Request */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Special Request
              </label>
              <textarea
                name="special_request"
                value={formData.special_request}
                onChange={handleChange}
                rows={3}
                placeholder="e.g. Quiet room preference, vegetarian breakfast, airport shuttle pickup..."
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] shadow-2xs leading-relaxed"
              />
            </div>
          </div>
        </form>

        {/* Modal Bottom Footer */}
        <div className="px-7 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-[#1E3A8A] hover:bg-[#172554] active:scale-98 disabled:opacity-50 text-white text-xs font-bold px-6 py-2.5 rounded-full flex items-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            {isSubmitting ? (
              <span>Saving...</span>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Save Guest Entry</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
