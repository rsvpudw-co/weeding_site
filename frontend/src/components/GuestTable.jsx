import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  FileText,
  Edit3,
  Trash2,
  Eye,
  PlaneLanding,
  PlaneTakeoff,
  MessageSquare,
  PhoneCall,
  CheckCircle2,
  Clock,
  Sparkles,
  Check,
  MapPin,
  Calendar,
  Plane,
  Heart,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Image as ImageIcon,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { animateStaggerIn } from "../utils/animations";
import { getGuestIdCardMeta } from "../utils/idCardUtils";

const getAvatarTheme = (name = "") => {
  const char = (name.charAt(0) || "G").toUpperCase();
  const themes = [
    { bg: "bg-[#eaf9d9]", text: "text-[#4d7f1d]" },
    { bg: "bg-[#dcfce7]", text: "text-[#15803d]" },
    { bg: "bg-[#e0e7ff]", text: "text-[#4338ca]" },
    { bg: "bg-[#fef3c7]", text: "text-[#b45309]" },
    { bg: "bg-[#fce7f3]", text: "text-[#be185d]" },
    { bg: "bg-[#e0f2fe]", text: "text-[#0369a1]" },
  ];
  const index = char.charCodeAt(0) % themes.length;
  return themes[index];
};

export default function GuestTable({
  guests = [],
  loading = false,
  onEditGuest,
  onDeleteGuest,
  onViewGuest,
  onOpenCallLogs,
  onOpenQuickWhatsApp,
  onUpdateRsvp,
}) {
  const { isAdmin, isViewOnly, canEditGuests, canUpdateCallLogs, canSendWhatsApp } = useAuth();
  const showCallDesk = true;

  const renderIdBadge = (guest, extraClass = "") => {
    const meta = getGuestIdCardMeta(guest);
    if (!meta.hasDocument) return null;
    return (
      <button
        type="button"
        onClick={() => onViewGuest && onViewGuest(guest)}
        title={meta.isImage ? "View attached ID Photo" : "View attached ID PDF document"}
        className={`text-[10px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 cursor-pointer transition-transform hover:scale-105 ${extraClass}`}
      >
        {meta.isImage ? (
          <ImageIcon className="w-2.5 h-2.5 text-emerald-600" />
        ) : (
          <FileText className="w-2.5 h-2.5 text-[#FF6574]" />
        )}
        <span>{meta.isImage ? "ID Photo" : "ID PDF"}</span>
      </button>
    );
  };

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Reset to page 1 if guest list changes or current page exceeds total pages
  useEffect(() => {
    setCurrentPage(1);
  }, [guests.length]);

  const totalPages = pageSize === "all" ? 1 : Math.ceil(guests.length / pageSize);

  const paginatedGuests = useMemo(() => {
    if (pageSize === "all") return guests;
    const start = (currentPage - 1) * pageSize;
    return guests.slice(start, start + pageSize);
  }, [guests, currentPage, pageSize]);

  const tbodyRef = useRef(null);
  const mobileListRef = useRef(null);

  // GSAP: Stagger table rows and mobile cards when paginated guests change
  useEffect(() => {
    if (tbodyRef.current && paginatedGuests.length > 0) {
      animateStaggerIn(tbodyRef.current.children, {
        y: 10,
        duration: 0.35,
        stagger: 0.02,
      });
    }
    if (mobileListRef.current && paginatedGuests.length > 0) {
      animateStaggerIn(mobileListRef.current.children, {
        y: 10,
        duration: 0.35,
        stagger: 0.025,
      });
    }
  }, [currentPage, pageSize, guests.length]);

  if (loading && guests.length === 0) {
    return (
      <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 p-8 sm:p-12 text-center my-3 sm:my-4 shadow-sm animate-fadeIn text-slate-800">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-[#FF6574] animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[#FF6574] animate-pulse" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-800">Loading Guests...</h3>
            <p className="text-xs text-slate-500">Fetching guest entries for this marriage</p>
          </div>
          {/* Skeleton rows shimmer */}
          <div className="w-full max-w-3xl space-y-2.5 pt-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-11 bg-slate-50 border border-slate-200 rounded-xl animate-pulse flex items-center px-4 justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-slate-200" />
                  <div className="space-y-1 text-left">
                    <div className="w-28 sm:w-36 h-3 bg-slate-200 rounded" />
                    <div className="w-16 sm:w-20 h-2 bg-slate-200/70 rounded" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-14 h-5 bg-slate-200 rounded-full" />
                  <div className="w-16 h-5 bg-slate-200 rounded-full hidden sm:block" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (guests.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/90 p-10 text-center my-4 shadow-sm animate-fadeIn text-slate-800">
        <div className="w-12 h-12 rounded-2xl bg-[#FF6574]/15 text-[#FF6574] flex items-center justify-center mx-auto mb-3 animate-floatSlow">
          <FileText className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-800">No guests found</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          Try adjusting search filters, or click "+ Add Guest" to register new guests.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 overflow-hidden shadow-sm my-3 sm:my-4 animate-fadeIn text-slate-800">
      {/* 1. Mobile Cards View (< md) */}
      <div ref={mobileListRef} className="block md:hidden divide-y divide-slate-100">
        {paginatedGuests.map((guest) => {
          const avatarTheme = getAvatarTheme(guest.guest_name);
          const rsvp = (guest.rsvp_status || "Pending").toLowerCase();
          const side = (guest.side || "Groom").toLowerCase();
          const callCount = Number(guest.call_count) || 0;
          const hasArrival = Boolean(
            guest.arrival_date || guest.arrival_time || guest.arrival_flight_train_no || guest.arrival_location
          );
          const hasDeparture = Boolean(
            guest.departure_date || guest.departure_time || guest.departure_flight_train_no || guest.departure_location
          );

          return (
            <div key={guest.id} className="p-3.5 space-y-2.5 hover:bg-slate-50/70 transition-colors">
              {/* Header: Avatar, Name, Sr No, and RSVP badge */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl ${avatarTheme.bg} ${avatarTheme.text} flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs`}
                  >
                    {(guest.guest_name || "G").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-extrabold text-slate-900 text-xs sm:text-sm leading-tight truncate">
                        {guest.guest_name}
                      </p>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                        #{guest.sr_no}
                      </span>
                    </div>

                    {/* Side & Phone */}
                    <div className="flex items-center gap-2 mt-0.5 text-xs">
                      {side === "bride" ? (
                        <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full border border-rose-200/80">
                          👰 Bride
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded-full border border-sky-200/80">
                          🤵 Groom
                        </span>
                      )}

                      {guest.relation && (
                        <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200 inline-flex items-center gap-1">
                          <Heart className="w-2.5 h-2.5 text-[#FF6574] fill-[#FF6574]/20 shrink-0" />
                          <span className="truncate max-w-[120px]">{guest.relation}</span>
                        </span>
                      )}

                      {guest.contact ? (
                        <a
                          href={`tel:${guest.contact}`}
                          className="text-[11px] text-slate-500 hover:text-[#FF6574] font-mono font-medium truncate flex items-center gap-1"
                        >
                          <PhoneCall className="w-2.5 h-2.5 text-[#FF6574]" />
                          <span>{guest.contact}</span>
                        </a>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">No phone</span>
                      )}

                      {renderIdBadge(guest, "ml-auto")}
                    </div>
                  </div>
                </div>

                {/* RSVP Status Pill / Quick Selector */}
                {canEditGuests && onUpdateRsvp ? (
                  <select
                    value={rsvp === "confirmed" ? "Confirmed" : rsvp === "declined" || rsvp.includes("regret") ? "Declined" : "Pending"}
                    onChange={(e) => onUpdateRsvp(guest, e.target.value)}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 shadow-2xs cursor-pointer focus:outline-none transition-all ${
                      rsvp === "confirmed"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : rsvp === "declined" || rsvp.includes("regret")
                        ? "bg-rose-50 text-rose-700 border border-rose-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}
                    title="Tap to change RSVP status"
                  >
                    <option value="Confirmed" className="bg-white text-emerald-800 font-bold">✓ Confirmed</option>
                    <option value="Pending" className="bg-white text-amber-800 font-bold">⏳ Pending</option>
                    <option value="Declined" className="bg-white text-rose-800 font-bold">✕ Declined</option>
                  </select>
                ) : (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1 shadow-2xs ${
                      rsvp === "confirmed"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : rsvp === "declined"
                        ? "bg-rose-50 text-rose-700 border border-rose-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}
                  >
                    {rsvp === "confirmed" ? (
                      <CheckCircle2 className="w-3 h-3 text-[#16a34a]" />
                    ) : (
                      <Clock className="w-3 h-3" />
                    )}
                    <span className="capitalize">{guest.rsvp_status || "Pending"}</span>
                  </span>
                )}
              </div>

              {/* Logistics Row (Arrival & Departure) */}
              {(hasArrival || hasDeparture) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] bg-slate-50 p-2 rounded-xl border border-slate-200 text-slate-800">
                  {hasArrival && (
                    <div className="flex items-center gap-1.5 text-slate-700 min-w-0">
                      <PlaneLanding className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">
                        <strong>Arr:</strong> {guest.arrival_date || "TBD"} {guest.arrival_time ? `(${guest.arrival_time})` : ""} {guest.arrival_flight_train_no ? `• ${guest.arrival_flight_train_no}` : ""}
                      </span>
                    </div>
                  )}
                  {hasDeparture && (
                    <div className="flex items-center gap-1.5 text-slate-700 min-w-0">
                      <PlaneTakeoff className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                      <span className="truncate">
                        <strong>Dep:</strong> {guest.departure_date || "TBD"} {guest.departure_time ? `(${guest.departure_time})` : ""} {guest.departure_flight_train_no ? `• ${guest.departure_flight_train_no}` : ""}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Call Desk & Quick Actions Row */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                {/* Left: Call Desk Checkpoints */}
                {showCallDesk ? (
                  <div className="flex items-center gap-1.5">
                    <div
                      className="flex items-center gap-1 cursor-pointer"
                      onClick={() => onOpenCallLogs && onOpenCallLogs(guest)}
                      title={`${callCount} calls completed`}
                    >
                      {callCount > 0 ? (
                        Array.from({ length: callCount }, (_, idx) => (
                          <div
                            key={idx}
                            className="min-w-5 h-5 px-1 rounded-full flex items-center justify-center text-[9px] font-bold bg-[#16a34a] text-white shadow-2xs gap-0.5"
                          >
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                            <span>{idx + 1}</span>
                          </div>
                        ))
                      ) : (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold bg-slate-100 text-slate-400 border border-slate-200">
                          0
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenCallLogs && onOpenCallLogs(guest)}
                      className="bg-[#FF6574] hover:bg-[#e05463] text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 cursor-pointer shadow-xs"
                    >
                      <PhoneCall className="w-2.5 h-2.5 text-white" />
                      <span>{!canUpdateCallLogs ? `Responses (${callCount})` : callCount > 0 ? "Notes" : "Log Call"}</span>
                    </button>
                  </div>
                ) : (
                  <div />
                )}

                {/* Right: Quick Action Buttons */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onViewGuest(guest)}
                    title="View full details"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  {canSendWhatsApp && guest.contact && (
                    <button
                      type="button"
                      onClick={() => onOpenQuickWhatsApp && onOpenQuickWhatsApp(guest)}
                      title="Send WhatsApp"
                      className="p-1.5 rounded-lg text-[#25d366] hover:bg-slate-100 cursor-pointer"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                  )}

                  {canEditGuests && (
                    <button
                      type="button"
                      onClick={() => onEditGuest(guest)}
                      title="Edit guest"
                      className="p-1.5 rounded-lg text-emerald-600 hover:bg-slate-100 cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                  )}

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => onDeleteGuest(guest)}
                      title="Delete guest"
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. Desktop Table View (>= md) - Clean White Matching Reference Image 2 */}
      <div className="hidden md:block overflow-x-auto bg-white">
        <table className="w-full text-left border-collapse min-w-[1100px] bg-white">
          {/* Table Header */}
          <thead>
            <tr className="border-b border-slate-200 bg-white text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
              <th className="py-3.5 px-3.5 w-12 text-center text-slate-400">Sr #</th>
              <th className="py-3.5 px-4 min-w-[180px] text-slate-500">Guest & Contact</th>
              <th className="py-3.5 px-3 w-28 text-slate-500">Side</th>
              <th className="py-3.5 px-3 min-w-[140px] text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5 text-[#FF6574] fill-[#FF6574]/20" />
                  <span>Relation</span>
                </div>
              </th>
              <th className="py-3.5 px-3 w-28 text-slate-500">RSVP</th>
              <th className="py-3.5 px-4 min-w-[210px] bg-white text-emerald-700 font-bold">
                <div className="flex items-center gap-1.5">
                  <PlaneLanding className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Arrival Logistics</span>
                </div>
              </th>
              <th className="py-3.5 px-4 min-w-[210px] bg-white text-purple-700 font-bold">
                <div className="flex items-center gap-1.5">
                  <PlaneTakeoff className="w-3.5 h-3.5 text-purple-600" />
                  <span>Departure Logistics</span>
                </div>
              </th>
              {showCallDesk && (
                <th className="py-3.5 px-4 bg-white text-emerald-700 font-bold min-w-[190px]">
                  <div className="flex items-center gap-1.5">
                    <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Call Responses</span>
                  </div>
                </th>
              )}
              <th className="py-3.5 px-3 text-center w-24 text-slate-500">Actions</th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody ref={tbodyRef} className="divide-y divide-slate-100 text-xs bg-white text-slate-800">
            {paginatedGuests.map((guest) => {
              const avatarTheme = getAvatarTheme(guest.guest_name);
              const rsvp = (guest.rsvp_status || "Pending").toLowerCase();
              const side = (guest.side || "Groom").toLowerCase();
              const callCount = Number(guest.call_count) || 0;

              const hasArrival = Boolean(
                guest.arrival_date ||
                guest.arrival_time ||
                guest.arrival_flight_train_no ||
                guest.arrival_location
              );

              const hasDeparture = Boolean(
                guest.departure_date ||
                guest.departure_time ||
                guest.departure_flight_train_no ||
                guest.departure_location
              );

              return (
                <tr
                  key={guest.id}
                  className="hover:bg-slate-50/70 transition-colors duration-150 group bg-white text-slate-800"
                >
                  {/* Sr No */}
                  <td className="py-3.5 px-3.5 text-center font-semibold text-slate-400 group-hover:text-slate-700 transition-colors">
                    {guest.sr_no}
                  </td>

                  {/* Guest Name & Phone */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-xl ${avatarTheme.bg} ${avatarTheme.text} flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs group-hover:scale-105 transition-transform`}
                      >
                        {(guest.guest_name || "G").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 leading-tight group-hover:text-[#FF6574] transition-colors truncate">
                          {guest.guest_name}
                        </p>
                        {guest.contact ? (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <a
                              href={`tel:${guest.contact}`}
                              className="text-[11px] text-slate-500 hover:text-[#FF6574] font-mono inline-flex items-center gap-1 transition-colors font-medium"
                            >
                              <span>{guest.contact}</span>
                            </a>
                            {!isViewOnly && (
                              <button
                                type="button"
                                onClick={() => onOpenQuickWhatsApp && onOpenQuickWhatsApp(guest)}
                                title="Send WhatsApp Message"
                                className="text-[#25d366] hover:text-[#128c7e] transition-transform hover:scale-115 cursor-pointer"
                              >
                                <MessageSquare className="w-3 h-3 stroke-[2.5]" />
                              </button>
                            )}
                            {renderIdBadge(guest)}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-slate-400 italic">No phone</span>
                            {renderIdBadge(guest)}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Side */}
                  <td className="py-3.5 px-3">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[11px] shadow-2xs transition-transform group-hover:scale-102 ${
                        side === "bride"
                          ? "bg-rose-50 text-rose-600 border border-rose-200/80"
                          : "bg-sky-50 text-sky-700 border border-sky-200/80"
                      }`}
                    >
                      {side === "bride" ? "👰 Bride" : "🤵 Groom"}
                    </span>
                  </td>

                  {/* Relation */}
                  <td className="py-3.5 px-3">
                    {guest.relation ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50/80 text-emerald-800 border border-emerald-200/80 shadow-2xs group-hover:scale-102 transition-transform">
                        <Heart className="w-2.5 h-2.5 text-[#FF6574] fill-[#FF6574]/20 shrink-0" />
                        <span className="truncate max-w-[130px]" title={guest.relation}>
                          {guest.relation}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-300 italic">
                        —
                      </span>
                    )}
                  </td>

                  {/* RSVP */}
                  <td className="py-3.5 px-3">
                    {canEditGuests && onUpdateRsvp ? (
                      <select
                        value={rsvp === "confirmed" ? "Confirmed" : rsvp === "declined" || rsvp.includes("regret") ? "Declined" : "Pending"}
                        onChange={(e) => onUpdateRsvp(guest, e.target.value)}
                        className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[11px] shadow-2xs cursor-pointer focus:outline-none transition-all ${
                          rsvp === "confirmed"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/90 hover:bg-emerald-100"
                            : rsvp === "declined" || rsvp.includes("regret") || rsvp.includes("not")
                            ? "bg-rose-50 text-rose-700 border border-rose-200/90 hover:bg-rose-100"
                            : "bg-amber-50 text-amber-700 border border-amber-200/90 hover:bg-amber-100"
                        }`}
                        title="Click to toggle or change RSVP status"
                      >
                        <option value="Confirmed" className="bg-white text-emerald-800 font-bold">✓ Confirmed</option>
                        <option value="Pending" className="bg-white text-amber-800 font-bold">⏳ Pending</option>
                        <option value="Declined" className="bg-white text-rose-800 font-bold">✕ Regrets</option>
                      </select>
                    ) : (
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[11px] shadow-2xs ${
                          rsvp === "confirmed"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200/90"
                            : rsvp === "declined" || rsvp.includes("regret") || rsvp.includes("not")
                            ? "bg-rose-50 text-rose-700 border border-rose-200/90"
                            : "bg-amber-50 text-amber-700 border border-amber-200/90"
                        }`}
                      >
                        {rsvp === "confirmed"
                          ? "✓ Confirmed"
                          : rsvp === "declined" || rsvp.includes("regret") || rsvp.includes("not")
                          ? "✕ Regrets"
                          : "⏳ Pending"}
                      </span>
                    )}
                  </td>

                  {/* DIRECT ARRIVAL LOGISTICS */}
                  <td className="py-3 px-4 bg-white group-hover:bg-slate-50/70 transition-colors">
                    {hasArrival ? (
                      <div className="space-y-1">
                        {/* Flight / Train Number */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {guest.arrival_flight_train_no ? (
                            <span className="text-[10px] font-bold font-mono bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200/80 flex items-center gap-1">
                              <span>✈</span>
                              <span>{guest.arrival_flight_train_no}</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/80">
                              🛬 Scheduled
                            </span>
                          )}

                          {guest.arrival_time && (
                            <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              ⏰ {guest.arrival_time}
                            </span>
                          )}
                        </div>

                        {/* Date */}
                        {guest.arrival_date && (
                          <p className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-emerald-600 shrink-0" />
                            <span>{guest.arrival_date}</span>
                          </p>
                        )}

                        {/* Location */}
                        {guest.arrival_location && (
                          <p
                            title={guest.arrival_location}
                            className="text-[10px] text-slate-500 flex items-center gap-1 line-clamp-1"
                          >
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{guest.arrival_location}</span>
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 italic flex items-center gap-1">
                        <span>— No arrival info</span>
                      </div>
                    )}
                  </td>

                  {/* DIRECT DEPARTURE LOGISTICS */}
                  <td className="py-3 px-4 bg-white group-hover:bg-slate-50/70 transition-colors">
                    {hasDeparture ? (
                      <div className="space-y-1">
                        {/* Flight / Train Number */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {guest.departure_flight_train_no ? (
                            <span className="text-[10px] font-bold font-mono bg-purple-50 text-purple-800 px-1.5 py-0.5 rounded border border-purple-200/80 flex items-center gap-1">
                              <span>🛫</span>
                              <span>{guest.departure_flight_train_no}</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-purple-800 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200/80">
                              🛫 Scheduled
                            </span>
                          )}

                          {guest.departure_time && (
                            <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              ⏰ {guest.departure_time}
                            </span>
                          )}
                        </div>

                        {/* Date */}
                        {guest.departure_date && (
                          <p className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-[#FF6574] shrink-0" />
                            <span>{guest.departure_date}</span>
                          </p>
                        )}

                        {/* Location */}
                        {guest.departure_location && (
                          <p
                            title={guest.departure_location}
                            className="text-[10px] text-slate-500 flex items-center gap-1 line-clamp-1"
                          >
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{guest.departure_location}</span>
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 italic flex items-center gap-1">
                        <span>— No departure info</span>
                      </div>
                    )}
                  </td>

                  {/* Call Center Checkpoint Column (Matches Reference Image 2) */}
                  {showCallDesk && (
                    <td className="py-3.5 px-4 bg-white group-hover:bg-slate-50/70 transition-colors">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Visual Call Checkpoint Indicator */}
                        <div
                          className="flex items-center gap-1 flex-wrap cursor-pointer"
                          onClick={() => onOpenCallLogs && onOpenCallLogs(guest)}
                          title={`${callCount} call${callCount === 1 ? "" : "s"} logged - click to view/add`}
                        >
                          {callCount > 0 ? (
                            Array.from({ length: callCount }, (_, idx) => (
                              <div
                                key={idx}
                                title={`Call ${idx + 1} completed`}
                                className="min-w-5 h-5 px-1 rounded-full flex items-center justify-center text-[9px] font-bold bg-[#16a34a] text-white shadow-2xs scale-105 transition-all duration-300 gap-0.5"
                              >
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                                <span>{idx + 1}</span>
                              </div>
                            ))
                          ) : (
                            <div
                              title="No calls completed yet (0)"
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200 transition-colors"
                            >
                              0
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => onOpenCallLogs && onOpenCallLogs(guest)}
                          className="bg-[#FF6574] hover:bg-[#e05463] text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 cursor-pointer shadow-xs btn-interactive"
                        >
                          <PhoneCall className="w-2.5 h-2.5 text-white" />
                          <span>{!canUpdateCallLogs ? `Responses (${callCount})` : callCount > 0 ? "Notes" : "Log Call"}</span>
                        </button>
                      </div>

                      {guest.last_call_summary &&
                        guest.last_call_summary.trim().toLowerCase() !== (guest.guest_name || "").trim().toLowerCase() && (
                        <p
                          title={guest.last_call_summary}
                          className="text-[10px] text-slate-500 line-clamp-1 italic mt-1.5 max-w-[200px]"
                        >
                          "{guest.last_call_summary}"
                        </p>
                      )}
                    </td>
                  )}

                  {/* Actions */}
                  <td className="py-3.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => onViewGuest(guest)}
                        title="View full details"
                        className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all hover:scale-110 active:scale-95 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {canSendWhatsApp && guest.contact && (
                        <button
                          type="button"
                          onClick={() => onOpenQuickWhatsApp && onOpenQuickWhatsApp(guest)}
                          title="Draft & Send WhatsApp"
                          className="p-1.5 rounded-xl text-[#25d366] hover:text-[#128c7e] hover:bg-slate-100 transition-all hover:scale-110 active:scale-95 cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {canEditGuests && (
                        <button
                          type="button"
                          onClick={() => onEditGuest(guest)}
                          title="Edit guest & logistics"
                          className="p-1.5 rounded-xl text-emerald-600 hover:text-emerald-700 hover:bg-slate-100 transition-all hover:scale-110 active:scale-95 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => onDeleteGuest(guest)}
                          title="Delete guest"
                          className="p-1.5 rounded-xl text-rose-500 hover:text-rose-600 hover:bg-rose-50 transition-all hover:scale-110 active:scale-95 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls Bar - Clean White */}
      {guests.length > 0 && (
        <div className="px-4 py-3 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          {/* Left: Summary text */}
          <div className="text-slate-500 font-semibold text-center sm:text-left">
            Showing{" "}
            <span className="font-extrabold text-slate-900">
              {pageSize === "all" ? 1 : (currentPage - 1) * pageSize + 1}
            </span>{" "}
            to{" "}
            <span className="font-extrabold text-slate-900">
              {pageSize === "all" ? guests.length : Math.min(currentPage * pageSize, guests.length)}
            </span>{" "}
            of <span className="font-extrabold text-slate-900">{guests.length}</span> guests
          </div>

          {/* Right: Controls & Page size */}
          <div className="flex items-center gap-3 flex-wrap justify-center">
            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5 text-slate-500">
              <span className="text-[11px] font-semibold">Show:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(e.target.value === "all" ? "all" : Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#FF6574] cursor-pointer"
              >
                <option value={25} className="bg-white text-slate-800">25</option>
                <option value={50} className="bg-white text-slate-800">50</option>
                <option value={100} className="bg-white text-slate-800">100</option>
                <option value="all" className="bg-white text-slate-800">All ({guests.length})</option>
              </select>
            </div>

            {/* Page Navigation Buttons */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                {/* First Page */}
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  className="p-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  title="First Page"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </button>

                {/* Previous Page */}
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                {/* Page Number Pills */}
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .map((p, index, array) => {
                      const prevPage = array[index - 1];
                      const showEllipsis = prevPage && p - prevPage > 1;

                      return (
                        <React.Fragment key={p}>
                          {showEllipsis && (
                            <span className="px-1 text-slate-400 font-bold">...</span>
                          )}
                          <button
                            type="button"
                            onClick={() => setCurrentPage(p)}
                            className={`w-7 h-7 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              currentPage === p
                                ? "bg-[#FF6574] text-white shadow-xs font-extrabold"
                                : "text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200"
                            }`}
                          >
                            {p}
                          </button>
                        </React.Fragment>
                      );
                    })}
                </div>

                {/* Next Page */}
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  title="Next Page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                {/* Last Page */}
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="p-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  title="Last Page"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

