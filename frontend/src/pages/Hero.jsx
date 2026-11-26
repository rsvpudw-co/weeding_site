import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Download,
  RefreshCw,
  Plus,
  AlertCircle,
  Heart,
  ArrowLeft,
  PlusCircle,
  Calendar,
  Sparkles,
  PhoneCall,
  Headphones,
  FileSpreadsheet,
  KeyRound,
  ShieldCheck,
  MessageSquare,
  BarChart3,
  Upload,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import ChromeTabBar from "../components/ChromeTabBar";
import WeddingHeroBanner from "../components/WeddingHeroBanner";
import StatsCards from "../components/StatsCards";
import FilterBar from "../components/FilterBar";
import GuestTable from "../components/GuestTable";
import GuestModal from "../components/GuestModal";
import GuestDetailsDrawer from "../components/GuestDetailsDrawer";
import DeleteModal from "../components/DeleteModal";
import WeddingCard from "../components/WeddingCard";
import WeddingModal from "../components/WeddingModal";
import WeddingCredentialsModal from "../components/WeddingCredentialsModal";
import LoginModal from "../components/LoginModal";
import CallLogModal from "../components/CallLogModal";
import AdminPasswordModal from "../components/AdminPasswordModal";
import GoogleSheetModal from "../components/GoogleSheetModal";
import WhatsAppMessageModal from "../components/WhatsAppMessageModal";
import AnalyticsView from "../components/AnalyticsView";
import RsvpAnalyticsView from "../components/RsvpAnalyticsView";
import CallDeskLogsView from "../components/CallDeskLogsView";
import WhatsAppOverviewView from "../components/WhatsAppOverviewView";
import VenuesMapView from "../components/VenuesMapView";
import ChatBotModal from "../components/ChatBotModal";
import CircularChatWidget from "../components/CircularChatWidget";
import CallCenterManagementModal from "../components/CallCenterManagementModal";
import LoginPage from "./LoginPage";
import { api, calculateStatsFromList } from "../services/api";
import { socket } from "../services/socket";
import { useAuth } from "../context/AuthContext";
import {
  gsap,
  animateToastIn,
  animateToastOut,
  animateStaggerIn,
} from "../utils/animations";

export default function Hero() {
  const {
    user,
    isAdmin,
    isCallCenter,
    isMarriageClient,
    isViewOnly,
    canEditGuests,
    canUpdateCallLogs,
    canSendWhatsApp,
    isLoginModalOpen,
    setIsLoginModalOpen,
    loginModalTab,
    isAdminPasswordModalOpen,
    setIsAdminPasswordModalOpen,
  } = useAuth();

  // Navigation & Workspace State
  const [activeTab, setActiveTab] = useState(isMarriageClient ? "directory" : "weddings"); // 'weddings' or 'directory'
  const [previousTab, setPreviousTab] = useState("directory");
  const [weddings, setWeddings] = useState([]);
  const [selectedWedding, setSelectedWedding] = useState(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Collapsible Sidebar State (persists preference)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("wedding_sidebar_collapsed") === "true";
    } catch (e) {
      return false;
    }
  });

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("wedding_sidebar_collapsed", String(next));
      } catch (e) { }
      return next;
    });
  }, []);

  // Chrome-Style Open Tabs State (hub tab + opened wedding tabs)
  const [openWeddingTabs, setOpenWeddingTabs] = useState(() => [
    { id: "all", title: "All Marriages", isHub: true, isFixed: true },
  ]);

  // Guests & Statistics State
  const [guests, setGuests] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [sideFilter, setSideFilter] = useState("All");
  const [rsvpFilter, setRsvpFilter] = useState("All");
  const [idCardFilter, setIdCardFilter] = useState("All");
  const [callAttemptsFilter, setCallAttemptsFilter] = useState("All");

  // Guest Modals State
  const [isAddGuestModalOpen, setIsAddGuestModalOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState(null);
  const [viewingGuest, setViewingGuest] = useState(null);
  const [expandIdCardOnView, setExpandIdCardOnView] = useState(false);
  const [deletingGuest, setDeletingGuest] = useState(null);
  const [callingGuest, setCallingGuest] = useState(null);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [whatsAppModalInitialGuest, setWhatsAppModalInitialGuest] = useState(null);
  const [isSubmittingGuest, setIsSubmittingGuest] = useState(false);
  const [isDeletingGuest, setIsDeletingGuest] = useState(false);

  // Wedding / Marriage Card Modals State
  const [isWeddingModalOpen, setIsWeddingModalOpen] = useState(false);
  const [editingWedding, setEditingWedding] = useState(null);
  const [deletingWedding, setDeletingWedding] = useState(null);
  const [isSubmittingWedding, setIsSubmittingWedding] = useState(false);
  const [isDeletingWedding, setIsDeletingWedding] = useState(false);

  // Wedding Credentials Modal State (For sharing generated login info)
  const [credentialsModalWedding, setCredentialsModalWedding] = useState(null);
  const [isNewlyCreatedWedding, setIsNewlyCreatedWedding] = useState(false);

  // Google Sheet Sync Modal State
  const [googleSheetModalWedding, setGoogleSheetModalWedding] = useState(null);

  // Live Chat Bot / Admin & Client Messenger State
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);

  // Call Center Team & Allocation Modal State
  const [isCallCenterModalOpen, setIsCallCenterModalOpen] = useState(false);

  // Toast Notification
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);
  const mainViewRef = useRef(null);

  // GSAP: Animate toast notification
  useEffect(() => {
    if (toast && toastRef.current) {
      animateToastIn(toastRef.current);
    }
  }, [toast]);

  // GSAP: Smooth view transition when switching tabs
  useEffect(() => {
    if (mainViewRef.current) {
      gsap.fromTo(
        mainViewRef.current,
        { opacity: 0.85, y: 8 },
        { opacity: 1, y: 0, duration: 0.35, ease: "power2.out" }
      );
    }
  }, [activeTab]);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      if (toastRef.current) {
        animateToastOut(toastRef.current, () => setToast(null));
      } else {
        setToast(null);
      }
    }, 3000);
  };

  // 1. Load Weddings (only called on mount and after explicit wedding creation/updates)
  const loadWeddings = useCallback(async () => {
    try {
      const data = await api.fetchWeddings();
      const weddingList = Array.isArray(data) ? data : [];
      setWeddings(weddingList);

      if (weddingList.length > 0) {
        const savedId = sessionStorage.getItem("manish_selected_wedding_id");
        const targetId = isMarriageClient
          ? user?.wedding_id
          : (savedId || (isCallCenter && user?.wedding_id && user.wedding_id !== "all" ? user.wedding_id : null));

        if (targetId) {
          const matched = weddingList.find((w) => w.id === targetId);
          if (matched) {
            setSelectedWedding(matched);
          }
        }
      }
    } catch (e) {
      console.error("Error fetching weddings:", e);
    }
  }, [isMarriageClient, isCallCenter, user?.wedding_id]);

  useEffect(() => {
    if (selectedWedding?.id && selectedWedding.id !== "all") {
      try {
        sessionStorage.setItem("manish_selected_wedding_id", selectedWedding.id);
      } catch (e) { }
    }
  }, [selectedWedding]);

  // 1b. Handle Marriage Client Scoping & Role Switching
  useEffect(() => {
    if (isMarriageClient && user?.wedding_id) {
      setActiveTab((prev) => (prev === "weddings" ? "directory" : prev));
      const matched =
        weddings.find((w) => w.id === user.wedding_id) ||
        user.wedding || {
          id: user.wedding_id,
          groom_name: user.name?.split("&")[0]?.trim() || "Groom",
          bride_name: user.name?.split("&")[1]?.trim() || "Bride",
          wedding_date: user.wedding_date || "",
          venue: user.venue || "",
          city: user.city || "",
          cover_theme: user.cover_theme || "emerald",
        };
      setSelectedWedding(matched);
    } else if (!isMarriageClient) {
      loadWeddings();
    }
  }, [isMarriageClient, user?.wedding_id, user?.role, loadWeddings]);

  // 1c. Strict Scoping: Compute visible weddings strictly based on caller/client assignment
  const visibleWeddings = useMemo(() => {
    if (!Array.isArray(weddings) || weddings.length === 0) return [];
    if (isCallCenter && user?.wedding_id && user.wedding_id !== "all") {
      const matched = weddings.filter((w) => w.id === user.wedding_id);
      if (matched.length > 0) return matched;
      if (selectedWedding && selectedWedding.id === user.wedding_id) return [selectedWedding];
      return weddings;
    }
    if (isMarriageClient && user?.wedding_id) {
      const matched = weddings.filter((w) => w.id === user.wedding_id);
      if (matched.length > 0) return matched;
      if (selectedWedding) return [selectedWedding];
      return weddings;
    }
    return weddings;
  }, [weddings, isCallCenter, isMarriageClient, user?.wedding_id, selectedWedding]);

  // Handle Call Center Scoping & Auto-Lock to Assigned Marriage
  useEffect(() => {
    if (isCallCenter && user?.wedding_id && user.wedding_id !== "all") {
      const matched =
        weddings.find((w) => w.id === user.wedding_id) ||
        (user.assigned_wedding_name
          ? {
            id: user.wedding_id,
            groom_name: user.assigned_wedding_name.split("&")[0]?.trim() || "Groom",
            bride_name: user.assigned_wedding_name.split("&")[1]?.trim() || "Bride",
            wedding_date: user.wedding_date || "",
            venue: user.venue || "",
            city: user.city || "",
            cover_theme: "emerald",
          }
          : null);

      if (matched) {
        setSelectedWedding(matched);
      }
      setActiveTab((prev) => (prev === "weddings" ? "directory" : prev));
    }
  }, [isCallCenter, user?.wedding_id, user?.assigned_wedding_name, weddings]);

  // 2. Load Guests & Stats (scoped strictly to selected wedding)
  const selectedWeddingId = selectedWedding ? selectedWedding.id : null;
  const activeWeddingRef = useRef(selectedWeddingId);

  useEffect(() => {
    activeWeddingRef.current = selectedWeddingId;
  }, [selectedWeddingId]);

  const loadGuests = useCallback(async () => {
    // If no wedding is selected and we are on the weddings dashboard, do not fetch guests
    if (!selectedWedding && activeTab === "weddings" && !isMarriageClient) {
      setLoading(false);
      return;
    }

    const targetWeddingId = selectedWeddingId || (isMarriageClient ? user?.wedding_id : "all");
    const requestedId = targetWeddingId;

    try {
      setLoading(true);
      const [guestRes, statsRes] = await Promise.all([
        api.fetchGuests({
          weddingId: targetWeddingId,
          side: sideFilter,
          search: searchQuery,
          rsvp: rsvpFilter,
          idCard: idCardFilter,
          callAttempts: callAttemptsFilter,
        }),
        api.fetchStats(targetWeddingId),
      ]);

      // Guard: Only commit results if the user has not switched away to another wedding
      if (
        activeWeddingRef.current === requestedId ||
        (!activeWeddingRef.current && requestedId === "all")
      ) {
        setGuests(guestRes.data || []);
        setStats(statsRes || calculateStatsFromList(guestRes.data || []));
      }
    } catch (err) {
      console.error("Error loading guests:", err);
    } finally {
      if (
        activeWeddingRef.current === requestedId ||
        (!activeWeddingRef.current && requestedId === "all")
      ) {
        setLoading(false);
      }
    }
  }, [
    selectedWedding,
    selectedWeddingId,
    activeTab,
    isMarriageClient,
    user?.wedding_id,
    sideFilter,
    searchQuery,
    rsvpFilter,
    idCardFilter,
    callAttemptsFilter,
  ]);

  // Strict client-side filter: ONLY guests belonging to this wedding can EVER be displayed.
  // This guarantees that even during state transitions or API re-fetching, guests from another marriage
  // are never visible for even a single frame!
  const displayedGuests = useMemo(() => {
    if (selectedWedding && selectedWedding.id && selectedWedding.id !== "all") {
      return guests.filter((g) => g.wedding_id === selectedWedding.id);
    }
    return guests;
  }, [guests, selectedWedding]);

  useEffect(() => {
    loadWeddings();
  }, [loadWeddings]);

  useEffect(() => {
    loadGuests();
  }, [loadGuests]);

  // ------------------- REAL-TIME WEBSOCKET SYNCHRONIZATION -------------------
  // Ask the server ONLY ONCE on mount/selection; then listen for live socket events to update ONLY when changes occur.
  // This eliminates periodic polling intervals and ensures zero unnecessary server stress.
  useEffect(() => {
    const token = sessionStorage.getItem("manish_auth_token") || "";
    const cleanWId = selectedWeddingId ? String(selectedWeddingId).replace(/^wedding:/, "").trim() : null;

    socket.auth = {
      token,
      role: user?.role || "client",
      weddingId: cleanWId || user?.wedding_id || "wedding_01",
      name: user?.name,
    };

    if (!socket.connected) {
      socket.connect();
    }

    const joinActiveRooms = () => {
      if (user?.role === "admin" || user?.role === "call_center") {
        socket.emit("join_admin");
      }
      if (cleanWId && cleanWId !== "all") {
        socket.emit("join_wedding", cleanWId);
      }
    };

    joinActiveRooms();

    const isMatchingWedding = (eventWeddingId, currentId) => {
      if (!eventWeddingId || !currentId || currentId === "all") return true;
      if (eventWeddingId === currentId) return true;
      const cleanEvent = String(eventWeddingId).replace(/^wedding_/, "");
      const cleanCurr = String(currentId).replace(/^wedding_/, "");
      return cleanEvent === cleanCurr;
    };

    let guestUpdateTimer = null;
    const handleGuestsUpdated = (payload) => {
      const eventWeddingId = payload?.wedding_id || payload?.weddingId;
      const currentId = activeWeddingRef.current;
      // Only refresh if mutation belongs to current wedding or viewing all
      if (isMatchingWedding(eventWeddingId, currentId)) {
        if (payload?.guest) {
          setGuests((prev) =>
            prev.map((g) => (g.id === payload.guest.id ? { ...g, ...payload.guest } : g))
          );
        }
        if (guestUpdateTimer) clearTimeout(guestUpdateTimer);
        guestUpdateTimer = setTimeout(() => {
          loadGuests();
        }, 150);
      }
    };

    const handleWeddingsUpdated = () => {
      loadWeddings();
    };

    const handleCallLogsUpdated = (payload) => {
      const eventWeddingId = payload?.wedding_id || payload?.weddingId;
      const currentId = activeWeddingRef.current;
      if (isMatchingWedding(eventWeddingId, currentId)) {
        if (payload?.guest) {
          setGuests((prev) =>
            prev.map((g) => (g.id === payload.guest.id ? { ...g, ...payload.guest } : g))
          );
        }
        if (guestUpdateTimer) clearTimeout(guestUpdateTimer);
        guestUpdateTimer = setTimeout(() => {
          loadGuests();
        }, 150);
      }
    };

    const handleDataChanged = (payload) => {
      if (!payload) return;
      if (payload.action === "user_updated" || payload.type === "user_updated") {
        loadWeddings();
        loadGuests();
      }
    };

    socket.on("connect", joinActiveRooms);
    socket.on("guests_updated", handleGuestsUpdated);
    socket.on("weddings_updated", handleWeddingsUpdated);
    socket.on("call_logs_updated", handleCallLogsUpdated);
    socket.on("data_changed", handleDataChanged);

    return () => {
      if (guestUpdateTimer) clearTimeout(guestUpdateTimer);
      socket.off("connect", joinActiveRooms);
      socket.off("guests_updated", handleGuestsUpdated);
      socket.off("weddings_updated", handleWeddingsUpdated);
      socket.off("call_logs_updated", handleCallLogsUpdated);
      socket.off("data_changed", handleDataChanged);
    };
  }, [selectedWeddingId, user?.role, user?.wedding_id, user?.name, loadGuests, loadWeddings]);

  // ------------------- WEDDING ACTIONS -------------------
  const handleSelectWedding = (wedding, targetTab = "directory") => {
    if (wedding) {
      if (isCallCenter && user?.wedding_id && user.wedding_id !== "all" && wedding.id !== user.wedding_id) {
        showToast(
          `Access restricted: You are assigned strictly to ${user.assigned_wedding_name || user.wedding_id}`,
          "error"
        );
        return;
      }
      activeWeddingRef.current = wedding.id;
      // Immediately reset guests and stats so no stale data from another marriage flashes
      setGuests([]);
      setStats({});
      setLoading(true);
      // Reset search and filter states for clean scoped browsing
      setSearchQuery("");
      setSideFilter("All");
      setRsvpFilter("All");
      setIdCardFilter("All");
      setCallAttemptsFilter("All");
      setSelectedWedding(wedding);
      setActiveTab(targetTab || "directory");

      // Synchronously open wedding in Chrome Tab Bar
      setOpenWeddingTabs((prev) => {
        if (prev.some((t) => t.id === wedding.id)) {
          return prev.map((t) =>
            t.id === wedding.id
              ? {
                ...t,
                wedding,
                title: `${wedding.groom_name} & ${wedding.bride_name}`,
                count: wedding.total_guests,
              }
              : t
          );
        }
        return [
          ...prev,
          {
            id: wedding.id,
            title: `${wedding.groom_name} & ${wedding.bride_name}`,
            wedding,
            isHub: false,
            isFixed: false,
            count: wedding.total_guests,
          },
        ];
      });
    } else {
      if (isCallCenter && user?.wedding_id && user.wedding_id !== "all") {
        setActiveTab("weddings");
        return;
      }
      activeWeddingRef.current = null;
      setSelectedWedding(null);
      setGuests([]);
      setStats({});
      setActiveTab("weddings");
      try {
        sessionStorage.removeItem("manish_selected_wedding_id");
        localStorage.removeItem("manish_selected_wedding_id");
      } catch (e) { }
    }
  };

  // Chrome Tabs computed list
  const chromeTabsList = useMemo(() => {
    if (isCallCenter && user?.wedding_id && user.wedding_id !== "all") {
      const callerWedding = selectedWedding || visibleWeddings[0];
      return [
        {
          id: user.wedding_id,
          title: callerWedding
            ? `${callerWedding.groom_name} & ${callerWedding.bride_name}`
            : user.assigned_wedding_name || "Assigned Marriage",
          wedding: callerWedding,
          isHub: false,
          isFixed: true,
          count: callerWedding?.total_guests,
        },
      ];
    }
    if (isMarriageClient) {
      const clientWedding = selectedWedding || visibleWeddings[0];
      return [
        {
          id: user.wedding_id || clientWedding?.id || "client",
          title: clientWedding
            ? `${clientWedding.groom_name} & ${clientWedding.bride_name}`
            : user.name || "Wedding Portal",
          wedding: clientWedding,
          isHub: false,
          isFixed: true,
          count: clientWedding?.total_guests,
        },
      ];
    }
    const hubTab = {
      id: "all",
      title: "All Marriages",
      isHub: true,
      isFixed: true,
      count: visibleWeddings.length,
    };
    const openTabsWithoutHub = openWeddingTabs.filter((t) => !t.isHub && t.id !== "all");
    return [hubTab, ...openTabsWithoutHub];
  }, [
    isCallCenter,
    isMarriageClient,
    user?.wedding_id,
    user?.assigned_wedding_name,
    user?.name,
    selectedWedding,
    visibleWeddings,
    openWeddingTabs,
  ]);

  const activeTabId = useMemo(() => {
    if (activeTab === "weddings" || !selectedWedding) return "all";
    return selectedWedding.id;
  }, [activeTab, selectedWedding]);

  const unopenedWeddings = useMemo(() => {
    const openIds = new Set(chromeTabsList.map((t) => t.id));
    return visibleWeddings.filter((w) => !openIds.has(w.id));
  }, [visibleWeddings, chromeTabsList]);

  const handleSelectChromeTab = useCallback(
    (tabId) => {
      if (tabId === "all") {
        handleSelectWedding(null);
      } else {
        const targetTab = openWeddingTabs.find((t) => t.id === tabId);
        if (targetTab?.wedding) {
          handleSelectWedding(targetTab.wedding);
        } else {
          const found = visibleWeddings.find((w) => w.id === tabId);
          if (found) handleSelectWedding(found);
        }
      }
    },
    [openWeddingTabs, visibleWeddings]
  );

  const handleCloseChromeTab = useCallback(
    (tabIdToClose) => {
      setOpenWeddingTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === tabIdToClose);
        const filtered = prev.filter((t) => t.id !== tabIdToClose);

        if (selectedWedding?.id === tabIdToClose) {
          const remainingWeddings = filtered.filter((t) => !t.isHub && t.id !== "all");
          if (remainingWeddings.length > 0) {
            const nextTab = remainingWeddings[Math.max(0, idx - 2)] || remainingWeddings[0];
            setTimeout(() => {
              if (nextTab?.wedding) {
                handleSelectWedding(nextTab.wedding);
              } else {
                handleSelectWedding(null);
              }
            }, 0);
          } else {
            setTimeout(() => handleSelectWedding(null), 0);
          }
        }
        return filtered;
      });
    },
    [selectedWedding]
  );

  const handleNewChromeTab = useCallback(() => {
    handleSelectWedding(null);
  }, []);

  const handleOpenAddWeddingModal = () => {
    if (!isAdmin) {
      showToast("Only Admin can create new Marriage Cards", "error");
      return;
    }
    setEditingWedding(null);
    setIsWeddingModalOpen(true);
  };

  const handleOpenEditWeddingModal = (wedding) => {
    if (!isAdmin) {
      showToast("Only Admin can edit Marriage Cards", "error");
      return;
    }
    setEditingWedding(wedding);
    setIsWeddingModalOpen(true);
  };

  const handleWeddingSubmit = async (formData) => {
    setIsSubmittingWedding(true);
    try {
      if (editingWedding) {
        const updated = await api.updateWedding(editingWedding.id, formData);
        showToast("Marriage Card updated!");
        const mergedWedding = { ...editingWedding, ...formData, ...(updated || {}) };
        setWeddings((prev) =>
          prev.map((w) => (w.id === editingWedding.id ? { ...w, ...mergedWedding } : w))
        );
        if (selectedWedding?.id === editingWedding.id) {
          setSelectedWedding((prev) => ({ ...prev, ...mergedWedding }));
        }
        setOpenWeddingTabs((prev) =>
          prev.map((t) =>
            t.id === editingWedding.id
              ? {
                ...t,
                wedding: mergedWedding,
                title: `${mergedWedding.groom_name} & ${mergedWedding.bride_name}`,
              }
              : t
          )
        );
      } else {
        const created = await api.createWedding(formData);
        showToast("New Marriage Card & Client Portal Created!");
        if (created) {
          setWeddings((prev) => [created, ...prev.filter((w) => w.id !== created.id)]);
        }
        setSelectedWedding(created);
        setActiveTab("directory");
        setCredentialsModalWedding(created);
        setIsNewlyCreatedWedding(true);
      }
      setIsWeddingModalOpen(false);
      setEditingWedding(null);
      await loadWeddings();
    } catch (err) {
      showToast("Error saving marriage card", "error");
    } finally {
      setIsSubmittingWedding(false);
    }
  };

  const handleDeleteWeddingConfirm = async () => {
    if (!deletingWedding) return;
    if (!isAdmin) {
      showToast("Only Admin can delete Marriage Cards", "error");
      return;
    }
    const delId = deletingWedding.id;
    try {
      setIsDeletingWedding(true);

      // 1. Optimistically remove wedding & its guests from local state immediately
      setWeddings((prev) => prev.filter((w) => w.id !== delId));
      setGuests((prev) => prev.filter((g) => g.wedding_id !== delId));

      // 2. Perform delete - cleans cache + syncs backend (graceful even if offline)
      await api.deleteWedding(delId);

      // Clean saved selected wedding id from sessionStorage & legacy localStorage if matching
      try {
        if (sessionStorage.getItem("manish_selected_wedding_id") === delId || localStorage.getItem("manish_selected_wedding_id") === delId) {
          sessionStorage.removeItem("manish_selected_wedding_id");
          localStorage.removeItem("manish_selected_wedding_id");
        }
      } catch (e) { }

      showToast("Marriage card removed");

      // 3. Navigate away if we were viewing the deleted wedding
      if (selectedWedding?.id === delId) {
        handleSelectWedding(null);
      }
      setOpenWeddingTabs((prev) => prev.filter((t) => t.id !== delId));
      setDeletingWedding(null);
    } catch (err) {
      showToast("Failed to delete marriage card", "error");
      setDeletingWedding(null);
    } finally {
      setIsDeletingWedding(false);
    }
  };

  // Update Wedding Cover Photo
  const handleUpdateWeddingCover = async (weddingId, coverThemeOrUrl) => {
    try {
      const updated = await api.updateWedding(weddingId, {
        cover_theme: coverThemeOrUrl,
        cover_image: coverThemeOrUrl,
      });
      setWeddings((prev) =>
        prev.map((w) =>
          w.id === weddingId
            ? { ...w, cover_theme: coverThemeOrUrl, cover_image: coverThemeOrUrl, ...(updated || {}) }
            : w
        )
      );
      if (selectedWedding?.id === weddingId) {
        setSelectedWedding((prev) => ({
          ...prev,
          cover_theme: coverThemeOrUrl,
          cover_image: coverThemeOrUrl,
          ...(updated || {}),
        }));
      }
      showToast("Cover photo updated!");
    } catch (err) {
      showToast("Failed to update cover photo", "error");
    }
  };

  // ------------------- GUEST ACTIONS -------------------
  const handleOpenAddGuestModal = () => {
    if (!canEditGuests) {
      showToast(isCallCenter ? "Call center desk has view-only access to guest details" : "Read-only access in client portal mode", "error");
      return;
    }
    if (!selectedWedding && weddings.length > 0) {
      setSelectedWedding(weddings[0]);
    }
    setEditingGuest(null);
    setIsAddGuestModalOpen(true);
  };

  const handleOpenEditGuestModal = (guest) => {
    if (!canEditGuests) {
      showToast(isCallCenter ? "Call center desk cannot update guest details (view-only)" : "Read-only access in client portal mode", "error");
      return;
    }
    setEditingGuest(guest);
    setIsAddGuestModalOpen(true);
  };

  const handleGuestSubmit = async (formData) => {
    if (!canEditGuests) {
      showToast(isCallCenter ? "Call center desk cannot update guest details" : "Read-only access in client portal mode", "error");
      return;
    }
    setIsSubmittingGuest(true);
    try {
      const targetWeddingId =
        formData.wedding_id ||
        editingGuest?.wedding_id ||
        (selectedWedding && selectedWedding.id !== "all" ? selectedWedding.id : null) ||
        (weddings && weddings.length > 0 ? weddings[0].id : "");

      const payload = {
        ...(editingGuest || {}),
        ...formData,
        wedding_id: targetWeddingId,
      };

      // Safely ensure last_call_summary is NEVER the guest's name
      if (
        payload.last_call_summary !== null &&
        payload.last_call_summary !== undefined &&
        payload.guest_name &&
        String(payload.last_call_summary).trim().toLowerCase() === String(payload.guest_name).trim().toLowerCase()
      ) {
        payload.last_call_summary = null;
      }

      // If creating a brand new guest, ensure call tracking starts strictly at 0
      if (!editingGuest) {
        payload.call_count = 0;
        payload.call_status = "Not Called";
        payload.last_called_at = null;
        payload.last_call_summary = null;
      } else {
        const sStr = String(payload.call_status || "");
        if (sStr === "1" || sStr === "2" || (!isNaN(Number(sStr)) && sStr !== "" && sStr !== "Not Called")) {
          payload.call_status = Number(payload.call_count) > 0 ? "Connected" : "Not Called";
        }
        if (!payload.last_call_summary && Number(payload.call_count) === 1 && !payload.last_called_at) {
          payload.call_count = 0;
        }
      }

      if (editingGuest) {
        const updatedGuest = await api.updateGuest(editingGuest.id, payload);
        const { _idCardFile, _removeIdCard, ...cleanPayload } = payload;
        const merged = { ...editingGuest, ...cleanPayload, ...(updatedGuest || {}) };
        setGuests((prev) =>
          prev.map((g) => (g.id === editingGuest.id ? merged : g))
        );
        if (viewingGuest?.id === editingGuest.id) {
          setViewingGuest(merged);
        }
        showToast("Guest updated successfully!");
      } else {
        const created = await api.createGuest(payload);
        showToast("Guest added to directory!");
        if (created) {
          setGuests((prev) => [created, ...prev.filter((g) => g.id !== created.id)]);
        }
      }
      setIsAddGuestModalOpen(false);
      setEditingGuest(null);
      try {
        await Promise.all([loadGuests(), loadWeddings()]);
      } catch (refreshErr) {
        console.warn("Background refresh notice after guest save:", refreshErr);
      }
    } catch (err) {
      console.error("Error saving guest:", err);
      showToast(err?.message ? `Error: ${err.message}` : "Error saving guest", "error");
    } finally {
      setIsSubmittingGuest(false);
    }
  };

  const handleDeleteGuestConfirm = async (id) => {
    if (isViewOnly || !isAdmin) {
      showToast("Only Admin can delete guest records", "error");
      return;
    }
    setIsDeletingGuest(true);
    try {
      setGuests((prev) => prev.filter((g) => g.id !== id));
      if (viewingGuest?.id === id) {
        setViewingGuest(null);
      }
      await api.deleteGuest(id);
      showToast("Guest entry removed");
      setDeletingGuest(null);
      await Promise.all([loadGuests(), loadWeddings()]);
    } catch (err) {
      showToast("Failed to delete guest", "error");
    } finally {
      setIsDeletingGuest(false);
    }
  };

  // Call Logger Trigger
  const handleOpenCallLogs = (guest) => {
    setCallingGuest(guest);
  };

  const handleQuickUpdateRsvp = async (guest, newRsvp) => {
    if (!canEditGuests) {
      showToast(isCallCenter ? "Call center desk cannot update guest details" : "Read-only access in client portal mode", "error");
      return;
    }
    const previousRsvp = guest.rsvp_status;
    const updatedGuest = { ...guest, rsvp_status: newRsvp };

    // Optimistic UI update
    setGuests((prev) =>
      prev.map((g) => (g.id === guest.id ? updatedGuest : g))
    );
    setStats(() => {
      const currentList = guests.map((g) => (g.id === guest.id ? updatedGuest : g));
      return calculateStatsFromList(currentList);
    });

    try {
      await api.updateGuest(guest.id, {
        ...updatedGuest,
        wedding_id: guest.wedding_id || selectedWedding?.id || (weddings && weddings[0]?.id) || "",
      });
      showToast(`RSVP updated to ${newRsvp} for ${guest.guest_name}`);
    } catch (err) {
      // Revert on error
      setGuests((prev) =>
        prev.map((g) => (g.id === guest.id ? { ...g, rsvp_status: previousRsvp } : g))
      );
      showToast("Failed to update RSVP: " + err.message, "error");
    }
  };

  const handleCallLogged = async (updatedGuest) => {
    showToast("✓ Call checkpoint recorded & synchronized with Google Sheets!");
    if (updatedGuest && updatedGuest.id) {
      setGuests((prev) =>
        prev.map((g) => (g.id === updatedGuest.id ? { ...g, ...updatedGuest } : g))
      );
      setStats((prev) => {
        const nextList = guests.map((g) => (g.id === updatedGuest.id ? { ...g, ...updatedGuest } : g));
        return calculateStatsFromList(nextList);
      });
    }
    await loadGuests();
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      await api.exportCsv(
        selectedWedding?.id || "all",
        sideFilter,
        "All",
        callAttemptsFilter
      );
      showToast("CSV exported!");
    } catch (err) {
      showToast("Failed to export CSV", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const handleSyncData = async () => {
    setIsSyncing(true);
    try {
      await loadWeddings();
      await loadGuests();
      showToast("Data refreshed!");
    } catch (err) {
      showToast("Sync failed", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  // If user is not logged in, show dedicated Full Login Page
  if (!user) {
    return <LoginPage />;
  }

  const nextSrNo =
    displayedGuests.length > 0
      ? Math.max(...displayedGuests.map((g) => Number(g.sr_no) || 0)) + 1
      : 1;

  const totalGlobalGuests = visibleWeddings.reduce(
    (acc, w) => acc + (w.total_guests || 0),
    0
  );
  const totalGlobalConfirmed = visibleWeddings.reduce(
    (acc, w) => acc + (w.confirmed_guests || 0),
    0
  );

  return (
    <div className="h-screen max-h-screen w-full flex flex-col bg-[#FAF9F6] text-[#1E293B] font-sans antialiased selection:bg-[#FF6574]/30 selection:text-[#1E3A8A] overflow-hidden">
      {/* Toast Notification */}
      {toast && (
        <div
          ref={toastRef}
          className={`fixed top-4 right-4 sm:top-5 sm:right-5 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold ${toast.type === "error"
              ? "bg-rose-900 text-white"
              : "bg-white text-[#1E293B] border border-[#FF6574]/50 shadow-2xl"
            }`}
        >
          <span>{toast.message}</span>
        </div>
      )}

      {/* TOP CHROME TAB BAR (Full-screen edge-to-edge navbar as in reference image) */}
      <ChromeTabBar
        tabs={chromeTabsList}
        activeTabId={activeTabId}
        onSelectTab={handleSelectChromeTab}
        onCloseTab={handleCloseChromeTab}
        onNewTab={handleNewChromeTab}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={toggleSidebar}
        unopenedWeddings={unopenedWeddings}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onOpenAddGuestModal={handleOpenAddGuestModal}
        onOpenMobileNav={() => setIsMobileNavOpen(true)}
      />

      {/* Full Page Body: Sidebar on Left + Main Content on Right */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
        {/* Left Sidebar (Desktop Static + Mobile Slide-Out Drawer) */}
        <Sidebar
          totalCount={
            selectedWedding
              ? stats.totalRegistered ?? displayedGuests.length
              : totalGlobalGuests
          }
          totalWeddingsCount={visibleWeddings.length}
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setActiveTab(tab);
            setIsMobileNavOpen(false);
          }}
          onOpenAddModal={() => {
            setIsMobileNavOpen(false);
            handleOpenAddGuestModal();
          }}
          onOpenAddWeddingModal={() => {
            setIsMobileNavOpen(false);
            handleOpenAddWeddingModal();
          }}
          selectedWedding={selectedWedding}
          weddings={visibleWeddings}
          onSelectWedding={(w, targetTab) => {
            setIsMobileNavOpen(false);
            handleSelectWedding(w, targetTab);
          }}
          isMobileNavOpen={isMobileNavOpen}
          setIsMobileNavOpen={setIsMobileNavOpen}
          onOpenChat={() => setIsChatModalOpen(true)}
          onOpenCallCenterModal={() => setIsCallCenterModalOpen(true)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />

        {/* Right Main Content */}
        <main ref={mainViewRef} className="flex-1 flex flex-col bg-[#FAF9F6] overflow-y-auto min-w-0 scroll-smooth">
          {/* Top Header Bar */}
          <Header
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onOpenAddModal={handleOpenAddGuestModal}
            selectedWedding={selectedWedding}
            weddings={visibleWeddings}
            onOpenMobileNav={() => setIsMobileNavOpen(true)}
            onOpenCallCenterModal={() => setIsCallCenterModalOpen(true)}
          />

          {/* Banner 1: Call Center Active Notice */}
          {isCallCenter && (
            <div className="bg-[#1E3A8A] border-b border-[#2563EB]/40 px-6 py-2.5 flex items-center justify-between text-xs text-white animate-fadeIn shadow-inner">
              <div className="flex items-center gap-2 font-semibold">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF6574] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#FF6574]"></span>
                </span>
                <Headphones className="w-4 h-4 text-[#FF6574]" />
                <span>
                  Call Center Telecaller Desk
                  {user?.wedding_id && user.wedding_id !== "all"
                    ? ` • Assigned: ${user.assigned_wedding_name || (selectedWedding ? `${selectedWedding.groom_name} & ${selectedWedding.bride_name}` : user.wedding_id)}`
                    : " • Global Desk (All Marriages)"}
                  {" • Call Logging & WhatsApp Enabled"}
                </span>
              </div>
              <span className="text-[10px] font-extrabold bg-[#FF6574] text-white px-2.5 py-0.5 rounded-full shadow-xs">
                {user?.wedding_id && user.wedding_id !== "all" ? "Assigned Marriage" : "Global Call Desk"}
              </span>
            </div>
          )}

          {/* ================= VIEW 1: MARRIAGE CARDS HUB (ALL WEDDINGS) ================= */}
          {!isMarriageClient && activeTab === "weddings" && (
            <div className="p-3.5 sm:p-5 md:p-7 space-y-4 sm:space-y-5 flex-1 animate-fadeIn">
              {/* Header Title & Action (Matches Reference Image 1) */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                    {isCallCenter && user?.wedding_id && user.wedding_id !== "all"
                      ? "Assigned Marriage Desk"
                      : "Marriage Cards"}
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {isCallCenter && user?.wedding_id && user.wedding_id !== "all"
                      ? `Workspace assigned strictly to ${user.assigned_wedding_name ||
                      (selectedWedding
                        ? `${selectedWedding.groom_name} & ${selectedWedding.bride_name}`
                        : "your assigned wedding")
                      }. Only this wedding's guests and logs are displayed.`
                      : "Select a wedding to manage its guest directory, view client login credentials, and manage call center logs."}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {isAdmin && (
                    <button
                      onClick={() => setIsCallCenterModalOpen(true)}
                      className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold px-3.5 py-2 rounded-full flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs btn-interactive"
                      title="Manage Call Center User IDs and Marriage Allocations"
                    >
                      <Headphones className="w-3.5 h-3.5 text-amber-500" />
                      <span>Call Center IDs</span>
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={handleOpenAddWeddingModal}
                      className="bg-[#FF6574] hover:bg-[#e05463] active:scale-98 text-white text-xs font-bold px-4 py-2 rounded-full flex items-center gap-1.5 cursor-pointer transition-all self-start sm:self-auto shadow-sm btn-interactive"
                    >
                      <PlusCircle className="w-3.5 h-3.5 text-white" />
                      <span>+ New Wedding</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Marriage Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-2">
                {visibleWeddings.map((wedding) => (
                  <WeddingCard
                    key={wedding.id}
                    wedding={wedding}
                    onSelect={handleSelectWedding}
                    onEdit={isAdmin ? handleOpenEditWeddingModal : null}
                    onDelete={isAdmin ? (w) => setDeletingWedding(w) : null}
                    onViewCredentials={(w) => {
                      setCredentialsModalWedding(w);
                      setIsNewlyCreatedWedding(false);
                    }}
                    onOpenGoogleSheet={
                      !isMarriageClient && !isViewOnly
                        ? (w) => {
                          setGoogleSheetModalWedding(w);
                        }
                        : null
                    }
                  />
                ))}

                {visibleWeddings.length === 0 && (
                  <div className="col-span-full bg-white rounded-3xl border border-dashed border-slate-300 p-10 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-rose-50 text-[#FF6574] flex items-center justify-center mx-auto">
                      <Heart className="w-6 h-6" />
                    </div>
                    <h3 className="text-base font-bold text-slate-800">No Marriages Displayed</h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      No wedding events currently available. Click below to refresh or create a new wedding card.
                    </p>
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={loadWeddings}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Refresh Marriages</span>
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={handleOpenAddWeddingModal}
                          className="px-4 py-2 bg-[#FF6574] hover:bg-[#e05463] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <PlusCircle className="w-3.5 h-3.5 text-white" />
                          <span>+ New Wedding</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= VIEW 2: GUEST DIRECTORY & CALL DESK ================= */}
          {activeTab === "directory" && (
            <div className="p-3 sm:p-6 md:p-8 space-y-3.5 sm:space-y-4 flex-1 animate-fadeIn min-w-0">
              {/* Luxury Wedding Hero Banner & Executive Summary Cards (Reference Design) */}
              {selectedWedding && (
                <WeddingHeroBanner
                  wedding={selectedWedding}
                  stats={stats}
                  displayedGuests={displayedGuests}
                  onScrollToTable={() => {
                    const el = document.getElementById("guest-directory-table");
                    if (el) el.scrollIntoView({ behavior: "smooth" });
                  }}
                  onOpenAnalytics={() => {
                    setPreviousTab(activeTab);
                    setActiveTab("analytics");
                  }}
                  onOpenGoogleSheet={() => setGoogleSheetModalWedding(selectedWedding)}
                  onUpdateCoverImage={!isMarriageClient && !isViewOnly ? handleUpdateWeddingCover : null}
                  onOpenCallDesk={() => {
                    setPreviousTab(activeTab);
                    setActiveTab("call_logs");
                  }}
                  onOpenWhatsApp={() => {
                    setPreviousTab(activeTab);
                    setActiveTab("whatsapp_overview");
                  }}
                />
              )}

              {/* Guest Directory Controls & Table */}
              <div id="guest-directory-table" className="space-y-4">
                {/* Back to All Weddings Bar & Wedding Info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    {!isMarriageClient && (!isCallCenter || !user?.wedding_id || user.wedding_id === "all") ? (
                      <button
                        type="button"
                        onClick={() => handleSelectWedding(null)}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#FF6574] mb-1 cursor-pointer transition-all hover:-translate-x-1"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 text-[#FF6574]" />
                        <span>← All Weddings</span>
                      </button>
                    ) : isCallCenter && user?.wedding_id && user.wedding_id !== "all" ? (
                      <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1">
                        <span className="w-2 h-2 rounded-full bg-[#FF6574]" />
                        <span>Assigned Marriage Workspace</span>
                      </div>
                    ) : null}

                    <h1 className="text-lg sm:text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <span className="truncate">
                        {selectedWedding
                          ? `${selectedWedding.groom_name} & ${selectedWedding.bride_name}`
                          : "Guest Directory"}
                      </span>
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs shrink-0">
                        {stats?.totalRegistered !== undefined
                          ? `${stats.totalRegistered} Guests`
                          : selectedWedding?.total_guests !== undefined
                            ? `${selectedWedding.total_guests} Guests`
                            : `${displayedGuests.length} Guests`}
                      </span>
                      {isMarriageClient && (
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                          View Only
                        </span>
                      )}
                    </h1>
                    <p className="text-xs text-slate-600 mt-0.5 truncate">
                      {selectedWedding?.wedding_date && `${selectedWedding.wedding_date} • `}
                      {selectedWedding?.venue || selectedWedding?.city || "Venue"}
                    </p>
                  </div>

                  {/* Top Actions */}
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    {!isMarriageClient && !isViewOnly && (
                      <button
                        onClick={() =>
                          setGoogleSheetModalWedding(
                            selectedWedding || (weddings && weddings[0])
                          )
                        }
                        className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[11px] sm:text-xs font-bold px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full flex items-center gap-1.5 cursor-pointer shadow-2xs btn-interactive"
                        title="Live Google Sheet Two-Way Sync Settings"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-[#FF6574]" />
                        <span>Google Sheet Sync</span>
                      </button>
                    )}

                    {canSendWhatsApp && (
                      <button
                        onClick={() => {
                          setWhatsAppModalInitialGuest(null);
                          setIsWhatsAppModalOpen(true);
                        }}
                        className="bg-[#25d366]/15 hover:bg-[#25d366]/25 border border-[#25d366]/40 text-[#128c7e] text-[11px] sm:text-xs font-bold px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full flex items-center gap-1.5 cursor-pointer shadow-2xs btn-interactive"
                        title="Open WhatsApp Message Desk for this Marriage"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-[#25d366]" />
                        <span>WhatsApp Messages</span>
                      </button>
                    )}

                    <button
                      onClick={handleExportCsv}
                      disabled={isExporting}
                      className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[11px] sm:text-xs font-bold px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full flex items-center gap-1.5 cursor-pointer shadow-2xs btn-interactive"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-500" />
                      <span>Export CSV</span>
                    </button>

                    <button
                      onClick={handleSyncData}
                      disabled={isSyncing}
                      className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[11px] sm:text-xs font-bold px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full flex items-center gap-1 cursor-pointer shadow-2xs btn-interactive"
                      title="Refresh data"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isSyncing ? "animate-spin" : ""}`} />
                    </button>

                    {!isViewOnly && (
                      <button
                        onClick={handleOpenAddGuestModal}
                        className="bg-[#FF6574] hover:bg-[#e05463] active:scale-98 text-white text-[11px] sm:text-xs font-bold px-3 sm:px-4 py-1.5 sm:py-2 rounded-full flex items-center gap-1.5 cursor-pointer shadow-sm btn-interactive"
                      >
                        <Plus className="w-3.5 h-3.5 text-white" />
                        <span>Add Guest</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Metric Summary Cards */}
                <StatsCards stats={stats} />

                {/* Filter and Search Bar */}
                <FilterBar
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  sideFilter={sideFilter}
                  setSideFilter={setSideFilter}
                  rsvpFilter={rsvpFilter}
                  setRsvpFilter={setRsvpFilter}
                  idCardFilter={idCardFilter}
                  setIdCardFilter={setIdCardFilter}
                  callAttemptsFilter={callAttemptsFilter}
                  setCallAttemptsFilter={setCallAttemptsFilter}
                />

                {/* Guest Directory Table */}
                <GuestTable
                  guests={displayedGuests}
                  loading={loading}
                  onEditGuest={handleOpenEditGuestModal}
                  onDeleteGuest={(guest) => setDeletingGuest(guest)}
                  onViewGuest={(guest, opts = {}) => {
                    setExpandIdCardOnView(Boolean(opts?.expandIdPreview));
                    setViewingGuest(guest);
                  }}
                  onOpenCallLogs={handleOpenCallLogs}
                  onOpenQuickWhatsApp={(guest) => {
                    setWhatsAppModalInitialGuest(guest);
                    setIsWhatsAppModalOpen(true);
                  }}
                  onUpdateRsvp={handleQuickUpdateRsvp}
                />
              </div>
            </div>
          )}

          {/* ================= VIEW 3: UNIFIED ANALYTICS (PIE CHART, BUBBLE GRAPH, FLIGHT MANIFEST, LOGISTICS) ================= */}
          {(activeTab === "analytics" || activeTab === "rsvp" || activeTab === "call_logs" || activeTab === "whatsapp") && (
            <AnalyticsView
              guests={displayedGuests}
              wedding={selectedWedding || (weddings && weddings[0])}
              weddings={weddings}
              onSelectWedding={handleSelectWedding}
              isAdmin={isAdmin}
              isMarriageClient={isMarriageClient}
              onBack={() => setActiveTab(previousTab || (selectedWedding ? "directory" : "weddings"))}
            />
          )}

          {/* ================= VIEW 7: VENUES OPENFREEMAP (ROLE-BASED LOCATIONS) ================= */}
          {activeTab === "venues" && (
            <VenuesMapView
              weddings={visibleWeddings}
              selectedWedding={selectedWedding}
              isAdmin={isAdmin}
              isMarriageClient={isMarriageClient}
              isViewOnly={isViewOnly}
              onBack={() => setActiveTab(previousTab || (selectedWedding ? "directory" : "weddings"))}
              onSelectWedding={(w) => {
                handleSelectWedding(w);
                setActiveTab("directory");
              }}
              onOpenDirectory={() => setActiveTab("directory")}
            />
          )}
        </main>
      </div>

      {/* ================= MODALS ================= */}

      {/* 1. Login Modal */}
      <LoginModal
        isOpen={isLoginModalOpen}
        initialTab={loginModalTab}
        onClose={() => setIsLoginModalOpen(false)}
      />

      {/* 2. Call Center Log & Checkpoint Modal */}
      <CallLogModal
        isOpen={Boolean(callingGuest)}
        guest={callingGuest}
        wedding={selectedWedding}
        onClose={() => {
          setCallingGuest(null);
          loadGuests();
        }}
        onCallLogged={handleCallLogged}
      />

      {/* 3. Add / Edit Marriage Card Modal */}
      <WeddingModal
        isOpen={isWeddingModalOpen}
        onClose={() => {
          setIsWeddingModalOpen(false);
          setEditingWedding(null);
        }}
        onSubmit={handleWeddingSubmit}
        initialData={editingWedding}
        isSubmitting={isSubmittingWedding}
      />

      {/* 4. Wedding Credentials & Share Modal */}
      <WeddingCredentialsModal
        isOpen={Boolean(credentialsModalWedding)}
        wedding={credentialsModalWedding}
        onClose={() => {
          setCredentialsModalWedding(null);
          setIsNewlyCreatedWedding(false);
        }}
        isNewlyCreated={isNewlyCreatedWedding}
      />

      {/* 5. Add / Edit Guest Modal */}
      <GuestModal
        isOpen={isAddGuestModalOpen}
        onClose={() => {
          setIsAddGuestModalOpen(false);
          setEditingGuest(null);
        }}
        onSubmit={handleGuestSubmit}
        initialData={editingGuest}
        isSubmitting={isSubmittingGuest}
        nextSrNo={nextSrNo}
        currentWeddingId={selectedWedding?.id || (weddings && weddings[0]?.id) || ""}
      />

      {/* 6. Guest Details Drawer */}
      <GuestDetailsDrawer
        isOpen={Boolean(viewingGuest)}
        guest={viewingGuest}
        initialExpandIdCard={expandIdCardOnView}
        onClose={() => {
          setViewingGuest(null);
          setExpandIdCardOnView(false);
        }}
        onEdit={canEditGuests ? (guest) => {
          setViewingGuest(null);
          handleOpenEditGuestModal(guest);
        } : null}
        onDelete={isAdmin ? (guest) => {
          setViewingGuest(null);
          setDeletingGuest(guest);
        } : null}
        onOpenCallLogs={(guest) => {
          setViewingGuest(null);
          handleOpenCallLogs(guest);
        }}
        onOpenQuickWhatsApp={(guest) => {
          setViewingGuest(null);
          setWhatsAppModalInitialGuest(guest);
          setIsWhatsAppModalOpen(true);
        }}
      />

      {/* 7. Delete Confirmation Modal */}
      <DeleteModal
        isOpen={Boolean(deletingGuest || deletingWedding)}
        wedding={deletingWedding}
        guest={deletingGuest}
        onClose={() => {
          setDeletingGuest(null);
          setDeletingWedding(null);
        }}
        onConfirm={
          deletingWedding ? handleDeleteWeddingConfirm : () => handleDeleteGuestConfirm(deletingGuest?.id)
        }
        title={deletingWedding ? "Delete Marriage Card" : "Delete Guest Record"}
        description={
          deletingWedding
            ? `Are you sure you want to delete ${deletingWedding?.groom_name} & ${deletingWedding?.bride_name}'s wedding card? All guest registrations and call records will be permanently removed.`
            : `Are you sure you want to delete ${deletingGuest?.guest_name}? This action cannot be undone.`
        }
        isDeleting={isDeletingGuest || isDeletingWedding}
      />

      {/* 8. Super Admin Password Verification Modal */}
      <AdminPasswordModal
        isOpen={isAdminPasswordModalOpen}
        onClose={() => setIsAdminPasswordModalOpen(false)}
        onSuccess={() => {
          showToast("Super Admin authenticated successfully!");
        }}
      />

      {/* 9. Marriage Guest Directory WhatsApp Message Desk Modal */}
      <WhatsAppMessageModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => {
          setIsWhatsAppModalOpen(false);
          setWhatsAppModalInitialGuest(null);
        }}
        guests={displayedGuests}
        wedding={selectedWedding}
        initialGuest={whatsAppModalInitialGuest}
      />

      {/* 10. Google Sheet Real-Time Sync Modal */}
      <GoogleSheetModal
        isOpen={Boolean(googleSheetModalWedding)}
        wedding={googleSheetModalWedding}
        onClose={() => setGoogleSheetModalWedding(null)}
        onSyncSuccess={async (syncData = {}) => {
          showToast(syncData?.message || "✓ Google Sheet synchronized with database!");
          const wRec = syncData?.data?.wedding || syncData?.updatedWedding;
          if (wRec) {
            setWeddings((prev) =>
              prev.map((w) => (w.id === wRec.id ? { ...w, ...wRec } : w))
            );
            if (selectedWedding?.id === wRec.id) {
              setSelectedWedding((prev) => ({ ...prev, ...wRec }));
            }
          }
          if (syncData?.data?.guests && Array.isArray(syncData.data.guests)) {
            setGuests(syncData.data.guests);
          }
          if (syncData?.data?.stats) {
            setStats(syncData.data.stats);
          }
          await Promise.all([loadGuests(), loadWeddings()]);
        }}
      />

      {/* 11. Floating Circular Chatbot Section (Opens Wide on Click) */}
      <CircularChatWidget
        onOpenChat={() => setIsChatModalOpen(true)}
        selectedWedding={selectedWedding || (weddings && weddings[0])}
        isChatOpen={isChatModalOpen}
      />

      {/* 12. Live Chat Bot & Direct Messenger Modal (User & Admin Communication) */}
      <ChatBotModal
        isOpen={isChatModalOpen}
        onClose={() => setIsChatModalOpen(false)}
        selectedWedding={selectedWedding || (weddings && weddings[0])}
        weddings={weddings}
        onSelectWedding={handleSelectWedding}
      />

      {/* 13. Call Center Team & Marriage Allocation Modal (Admin Only) */}
      <CallCenterManagementModal
        isOpen={isCallCenterModalOpen}
        onClose={() => setIsCallCenterModalOpen(false)}
        weddings={weddings}
        onUserUpdated={loadWeddings}
      />
    </div>
  );
}
