import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useContext, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import firebase from "../firebase";
import { AuthContext } from "./AuthContext";

const TRANSLATIONS = {
  en: {
    goodMorning: "Good Morning",
    goodAfternoon: "Good Afternoon",
    goodEvening: "Good Evening",
    total: "Total",
    completed: "Completed",
    pending: "Pending",
    filter: "Filter",
    viewDetails: "View Details",
    highPriority: "HIGH PRIORITY",
    auditFail: "AUDIT FAIL",
    changeLanguage: "Change Language (தமிழ்)",
    signOut: "Sign Out",
    chatAdmin: "Chat with Admin",
  },
  ta: {
    goodMorning: "காலை வணக்கம்",
    goodAfternoon: "மதிய வணக்கம்",
    goodEvening: "மாலை வணக்கம்",
    total: "மொத்தம்",
    completed: "முடிந்தது",
    pending: "நிலுவையில்",
    filter: "வடிகட்டி",
    viewDetails: "விவரங்கள்",
    highPriority: "அவசரம்",
    auditFail: "தணிக்கை தோல்வி",
    changeLanguage: "Change Language (English)",
    signOut: "வெளியேறு",
    chatAdmin: "நிர்வாகியுடன் பேச",
  }
};

export default function Dashboard({ navigation }) {
  const { user, logout, language, setLanguage } = useContext(AuthContext);
  const [cases, setCases] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Filter states
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState([]);
  const [sortField, setSortField] = useState("assignedAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedFilter, setExpandedFilter] = useState(null);

  const [loading, setLoading] = useState(true);

  // Revert modal states
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [revertReason, setRevertReason] = useState("");
  const [selectedCase, setSelectedCase] = useState(null);
  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const [selectedCaseForType, setSelectedCaseForType] = useState(null);

  // Alert System State
  const [newCasesList, setNewCasesList] = useState([]);
  const knownCaseIds = useRef(new Set());
  const isFirstLoad = useRef(true);

  const [bribeWarningVisible, setBribeWarningVisible] = useState(false);
  const [devBroadcastAlert, setDevBroadcastAlert] = useState(null);
  const [devAlertVisible, setDevAlertVisible] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [showAppreciationBurst, setShowAppreciationBurst] = useState(false);

  const t = (key) => TRANSLATIONS[language]?.[key] || TRANSLATIONS['en'][key] || key;

  useEffect(() => {
    if (!user?.uid) return;
    const role = String(user?.role || "member").toLowerCase();
    if (role === "member") {
      setBribeWarningVisible(true);
    }
  }, [user?.uid, user?.role]);

  // Feature Flags
  const [newUI, setNewUI] = useState(false);
  const [betaFeatures, setBetaFeatures] = useState(false);
  const [maintenanceModeMember, setMaintenanceModeMember] = useState(false);
  const [maintenanceModalVisible, setMaintenanceModalVisible] = useState(false);

  useEffect(() => {
    const devRef = firebase.database().ref("dev");
    const listener = devRef.on("value", (snapshot) => {
      const flags = snapshot.val() || {};
      console.log("[Dashboard] Dev Flags Received:", flags);
      // Handle both boolean and string "true"
      setNewUI(flags.enableNewUI === true || flags.enableNewUI === "true");
      setBetaFeatures(flags.enableBetaFeatures === true || flags.enableBetaFeatures === "true");
      
      const isMaint = flags.maintenanceModeMember === true || flags.maintenanceModeMember === "true";
      if (isMaint && !maintenanceModeMember) {
          setMaintenanceModalVisible(true);
      }
      setMaintenanceModeMember(isMaint);
    });
    return () => devRef.off("value", listener);
  }, []);

  useEffect(() => {
    if (user?.uid) {
      console.log("Loading cases for UID:", user.uid);
      loadCases(user.uid);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user?.uid) return;
    const ref = firebase.database().ref(`users/${user.uid}`);
    const listener = ref.on("value", (snapshot) => {
      setCurrentUserProfile(snapshot.val() || null);
    });
    return () => ref.off("value", listener);
  }, [user?.uid]);

  // Listen for account status changes (Revoke Access)
  useEffect(() => {
    if (user?.uid) {
      const statusRef = firebase.database().ref(`users/${user.uid}/status`);
      const listener = statusRef.on("value", (snapshot) => {
        if (snapshot.val() === "banned") {
          Alert.alert(
            "Access Revoked",
            "Access revoked due to unofficial activity? Contact dev.",
            [{ text: "OK", onPress: async () => {
                try { await firebase.auth().signOut(); } catch(e) {}
                logout();
            }}],
            { cancelable: false }
          );
        }
      });
      return () => statusRef.off("value", listener);
    }
  }, [user]);


  useEffect(() => {
    if (!user?.uid) return;
    const ref = firebase.database().ref("memberAlerts");
    const listener = ref.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data).map((id) => ({ id, ...data[id] }));
      const eligible = list
        .filter((a) => a?.active !== false)
        .filter((a) => {
          const targetType = String(a?.targetType || "all").toLowerCase();
          if (targetType === "all") return true;
          if (targetType === "user") {
            const targetUid = String(a?.targetUid || "").trim().toLowerCase();
            const targetQuery = String(a?.targetQuery || "").trim().toLowerCase();
            const myUid = String(user.uid || "").toLowerCase();
            const myEmail = String(user.email || "").toLowerCase();
            const myUniqueId = String(currentUserProfile?.uniqueId || "").toLowerCase();
            return targetUid === myUid || targetQuery === myUid || targetQuery === myEmail || (myUniqueId && targetQuery === myUniqueId);
          }
          return true;
        })
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      const next = eligible.find((a) => !(a?.ackBy && a.ackBy[user.uid]));
      if (next) {
        setDevBroadcastAlert(next);
        setDevAlertVisible(true);
        if (String(next.severity || "").toLowerCase() === "appreciation") {
          setShowAppreciationBurst(true);
          setTimeout(() => setShowAppreciationBurst(false), 2200);
        }
      }
    });
    return () => ref.off("value", listener);
  }, [user?.uid, user?.email, currentUserProfile?.uniqueId]);

  const acknowledgeDevAlert = async () => {
    if (!devBroadcastAlert?.id || !user?.uid) {
      setDevAlertVisible(false);
      return;
    }
    try {
      await firebase.database().ref("memberAlerts/" + devBroadcastAlert.id + "/ackBy/" + user.uid).set(Date.now());
    } catch (e) {
      console.log("Failed to acknowledge dev alert", e);
    }
    const templateId = String(devBroadcastAlert?.templateId || "").toLowerCase();
    setDevAlertVisible(false);
    setDevBroadcastAlert(null);
    if (templateId === "photo_upload") {
      navigation.navigate("Updatescreen");
    }
  };

  const loadCases = (uid) => {
    firebase
      .database()
      .ref("cases")
      .orderByChild("assignedTo")
      .equalTo(uid)
      .on("value", async (snapshot) => {
        const data = snapshot.val()
          ? Object.keys(snapshot.val()).map((key) => ({
              id: key,
              ...snapshot.val()[key],
            }))
          : [];

        // Alert System Logic
        if (isFirstLoad.current) {
          // First load: Populate known IDs AND alert for currently assigned cases (missed while logged out)
          // Only alert if NOT previously acknowledged locally
          let ackSet = new Set();
          try {
            const storedAck = await AsyncStorage.getItem("acknowledged_alerts");
            if (storedAck) ackSet = new Set(JSON.parse(storedAck));
          } catch (e) {
            console.log("Error reading acknowledged alerts, resetting", e);
            AsyncStorage.removeItem("acknowledged_alerts");
          }

          const initialAlerts = [];
          data.forEach(c => {
            knownCaseIds.current.add(c.id);
            if (c.status === 'assigned' && !ackSet.has(c.id)) {
              initialAlerts.push(c);
            }
          });
          if (initialAlerts.length > 0) {
            setNewCasesList(prev => [...prev, ...initialAlerts]);
          }
          isFirstLoad.current = false;
        } else {
          // Subsequent updates: check for new IDs
          const newAlerts = [];
          data.forEach(c => {
            if (!knownCaseIds.current.has(c.id)) {
              if (c.status === 'assigned') {
                newAlerts.push(c);
              }
              knownCaseIds.current.add(c.id);
            }
          });
          if (newAlerts.length > 0) {
            setNewCasesList(prev => [...prev, ...newAlerts]);
          }
        }

        setCases(data.filter((c) => c.status !== "reverted"));
      });
  };

  const loadAllCases = () => {
    firebase
      .database()
      .ref("cases")
      .on("value", (snapshot) => {
        const data = snapshot.val()
          ? Object.keys(snapshot.val()).map((key) => ({
              id: key,
              ...snapshot.val()[key],
            }))
          : [];
        setCases(data.filter((c) => c.status !== "reverted"));
      });
  };

  const computeMemberStatus = (caseItem) => {
    return caseItem.status === "assigned" || caseItem.status === "audit"
      ? "open"
      : "closed";
  };

  const filteredCases = cases.filter((c) => {
    const isClosed = c.status === 'completed' || c.status === 'closed';
    
    const showClosed = activeFilters.some(f => f.field === 'status' && f.value === 'closed');
    const showCompleted = activeFilters.some(f => f.field === 'completedAt');
    
    // Visibility Logic:
    // If case is closed, hide it UNLESS 'Closed Cases' OR 'Completed' filter is active.
    if (isClosed) {
        if (!showClosed && !showCompleted) return false;
    } else {
        // If case is open, hide it IF 'Closed Cases' filter is active (exclusive view).
        if (showClosed) return false;
    }

    if (activeFilters.length === 0) return true;
    return activeFilters.every((f) => {
      switch (f.field) {
        case "status":
          return computeMemberStatus(c) === f.value;
        case "client":
          const cVal = (c.client || c.company || "").toLowerCase();
          const fVal = f.value.toLowerCase();
          return cVal.includes(fVal);
        case "highPriority":
          return !!c.highPriority;
        case "completedAt":
          return !!c.completedAt;
        default:
          return true;
      }
    });
  });

  const sortedCases = filteredCases.slice().sort((a, b) => {
    let valA, valB;
    switch (sortField) {
      case "assignedAt":
        valA = a.assignedAt ? new Date(a.assignedAt).getTime() : 0;
        valB = b.assignedAt ? new Date(b.assignedAt).getTime() : 0;
        break;
      case "completedAt":
        valA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        valB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        break;
      case "highPriority":
        valA = a.highPriority ? 1 : 0;
        valB = b.highPriority ? 1 : 0;
        break;
      case "status":
        valA = computeMemberStatus(a) === "closed" ? 1 : 0;
        valB = computeMemberStatus(b) === "closed" ? 1 : 0;
        break;
      case "pincode":
        valA = a.pincode || "";
        valB = b.pincode || "";
        break;
      default:
        valA = 0;
        valB = 0;
    }
    if (typeof valA === "string") {
      return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else {
      return sortAsc ? valA - valB : valB - valA;
    }
  });

  const totalCasesCount = cases.length;
  const completedCasesCount = cases.filter(c => c.status === 'completed' || c.status === 'closed').length;
  const pendingCasesCount = cases.filter(c => c.status === 'assigned' || c.status === 'audit' || c.status === 'open').length;

  if (loading) return null;

  // Extract unique clients for filter
  const uniqueClients = [...new Set([
    ...cases.map(c => (c.client || c.company || "").toString().trim()).filter(Boolean),
    "Matrix", "DHI", "CES"
  ])].sort();

  const filterOptions = [
    { label: "Recent", field: "assignedAt" },
    { label: "High Priority", field: "highPriority" },
    { label: "Completed", field: "completedAt" },
    { label: "Open Cases", field: "status", value: "open" },
    { label: "Closed Cases", field: "status", value: "closed" },
    { label: "Pincode", field: "pincode" },
    { label: "Client", field: "client_group" }
  ];

  const toggleFilter = (option) => {
    if (option.field === 'client_group') {
      setExpandedFilter(prev => prev === 'client_group' ? null : 'client_group');
      return;
    }

    const exists = activeFilters.find((f) => f.field === option.field && f.value === option.value);
    if (exists) {
      setActiveFilters(activeFilters.filter((f) => f !== exists));
    } else {
      // Remove conflicting filters
      let newFilters = [...activeFilters];
      
      if (option.field === 'status') {
         newFilters = newFilters.filter(f => f.field !== 'status');
      }
      if (option.field === 'client') {
         newFilters = newFilters.filter(f => f.field !== 'client');
      }

      setActiveFilters([...newFilters, option]);
    }
    setFilterDropdownOpen(false);
    if (['assignedAt', 'pincode'].includes(option.field)) {
      setSortField(option.field);
      setSortAsc(true);
    }
  };

  const removeActiveFilter = (field) => {
    setActiveFilters(activeFilters.filter((f) => f.field !== field));
  };

  const toggleSortOrder = () => {
    setSortAsc(!sortAsc);
  };

  const getGreeting = () => {
    const hours = new Date().getHours();
    if (hours < 12) return t("goodMorning");
    if (hours < 16) return t("goodAfternoon");
    return t("goodEvening");
  };

  const computeStatusText = (caseItem) => {
    const assignedAt = caseItem.assignedAt ? new Date(caseItem.assignedAt) : null;
    const today = new Date();
    if (!assignedAt) return "";
    const diffDays = Math.ceil((today - assignedAt) / (1000 * 60 * 60 * 24));
    return diffDays <= 4
      ? `Due in ${4 - diffDays} day${4 - diffDays !== 1 ? "s" : ""}`
      : `Delay by ${diffDays - 4} day${diffDays - 4 !== 1 ? "s" : ""}`;
  };

  const openMap = (address) => {
    const query = encodeURIComponent(address || "");
    const url = Platform.select({
      ios: `maps:0,0?q=${query}`,
      android: `geo:0,0?q=${query}`,
      default: `https://www.google.com/maps/search/?api=1&query=${query}`,
    });
    Linking.openURL(url);
  };

  const handleRevertSubmit = async () => {
    if (!revertReason.trim()) return;
    const caseId = selectedCase.id;
    const caseData = { ...selectedCase };
    await firebase.database().ref(`revertedCases/${caseId}`).set({
      ...caseData,
      revertedBy: user?.email || user?.uid,
      uid: user?.uid,
      revertReason,
      revertedAt: new Date().toISOString(),
    });
    await firebase.database().ref(`cases/${caseId}`).remove();
    setShowRevertModal(false);
    setSelectedCase(null);
    setRevertReason("");
  };

  const handleSetType = (type) => {
    if (selectedCaseForType) {
      firebase.database().ref(`cases/${selectedCaseForType.id}`).update({
        cesType: type
      });
      setTypeModalVisible(false);
      setSelectedCaseForType(null);
    }
  };

  return (
    <LinearGradient
      colors={newUI ? ["#141E30", "#243B55"] : ["#12c2e9", "#c471ed", "#f64f59"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      {/* Maintenance Banner (Non-blocking) */}
      {maintenanceModeMember && (
        <View style={styles.maintenanceBanner}>
          <Text style={styles.maintenanceText}>⚠️ MAINTENANCE MODE ENABLED</Text>
        </View>
      )}

      {/* Header */}
      <View style={[styles.headerRow, maintenanceModeMember && { marginTop: 10 }]}>
        <TouchableOpacity onPress={() => setMenuOpen(true)}>
          <Ionicons name="menu" size={28} color="#fff" />
        </TouchableOpacity>
        <LinearGradient
          colors={["#ff9a9e", "#fad0c4"]}
          style={styles.headerBadge}
        >
        <Text style={styles.headerText}>
            {getGreeting()}, {user?.name || user?.email?.split('@')[0] || "Member"}
          </Text>
        </LinearGradient>
        <TouchableOpacity onPress={() => setProfileMenuOpen((prev) => !prev)}>
          <View style={styles.profilePhoto}>
            {user?.photoURL ? (
              <Image
                source={{ uri: user.photoURL }}
                style={{ width: 40, height: 40, borderRadius: 20 }}
              />
            ) : (
              <Ionicons name="person-circle" size={40} color="#fff" />
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Profile Menu */}
      {profileMenuOpen && (
        <>
          <TouchableOpacity
            style={styles.fullScreenTouchable}
            activeOpacity={1}
            onPress={() => setProfileMenuOpen(false)}
          />
          <View style={styles.profileMenu}>
            <TouchableOpacity onPress={() => { setProfileMenuOpen(false); navigation.navigate("Updatescreen"); }}>
              <Text style={styles.menuText}>Update Profile</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Hamburger Menu */}
      {menuOpen && (
        <View style={styles.menuOverlay}>
          <TouchableOpacity 
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} 
            onPress={() => setMenuOpen(false)} 
            activeOpacity={1}
          />
          <View style={styles.menuContainer}>
            {/* Modern Header */}
            <LinearGradient colors={["#4e0360", "#c471ed"]} style={styles.menuHeader}>
                <View style={styles.menuUserAvatar}>
                    <Text style={styles.menuUserInitials}>{(user?.name || user?.email || "U").charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{flex: 1}}>
                    <Text style={styles.menuUserName} numberOfLines={1}>{user?.name || "User"}</Text>
                    <Text style={styles.menuUserEmail} numberOfLines={1}>{user?.email}</Text>
                </View>
            </LinearGradient>

            {/* Scrollable Menu Items */}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 10 }}>
            {[
              {
                label: "Open Cases",
                action: () => {
                  setActiveFilters([
                    { field: "status", value: "open", label: "Closed/Open" },
                  ]);
                  setSortField("assignedAt");
                  setSortAsc(false);
                },
                icon: "briefcase-outline"
              },
              {
                label: "Closed Cases",
                action: () => {
                  setActiveFilters([
                    { field: "status", value: "closed", label: "Closed/Open" },
                  ]);
                  setSortField("assignedAt");
                  setSortAsc(false);
                },
                icon: "checkmark-done-circle-outline"
              },
              {
                label: "Dashboard",
                action: () => {
                  setActiveFilters([]);
                  setSortField("assignedAt");
                  setSortAsc(false);
                },
                icon: "grid-outline"
              },
              {
                label: "Plan Your Day",
                action: () => navigation.navigate("PlanYourDayScreen"),
                icon: "calendar-outline"
              },
              {
                label: "Day-wise Tracker",
                action: () => navigation.navigate("DaywiseTrackerScreen"),
                icon: "stats-chart-outline"
              },
              {
                label: "DSR",
                action: () => navigation.navigate("DSRScreen"),
                icon: "document-text-outline"
              },
              {
                label: "All Cases",
                action: () => navigation.navigate("AllCasesScreen"),
                icon: "list-outline"
              },
              {
                label: "Raise Ticket",
                action: () => navigation.navigate("RaiseTicketScreen"),
                icon: "alert-circle-outline"
              },
              {
                label: "My Tickets",
                action: () => navigation.navigate("MyTicketsScreen"),
                icon: "ticket-outline"
              },
            ].map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.menuItem}
                onPress={() => {
                  item.action();
                  setMenuOpen(false);
                }}
              >
                <Ionicons name={item.icon} size={22} color="#555" style={{ marginRight: 15 }} />
                <Text style={styles.menuText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            </ScrollView>

            {/* Settings Footer */}
            <View style={styles.settingsContainer}>
              <TouchableOpacity 
                style={styles.settingsButton} 
                onPress={() => setShowSettings(!showSettings)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="settings-outline" size={22} color="#333" />
                    <Text style={styles.settingsLabel}>Settings</Text>
                </View>
                <Ionicons name={showSettings ? "chevron-down" : "chevron-up"} size={20} color="#666" />
              </TouchableOpacity>
              {showSettings && (
                <View style={styles.settingsOptions}>
                  <TouchableOpacity style={styles.settingItem} onPress={() => setLanguage(language === 'en' ? 'ta' : 'en')}>
                    <Ionicons name="language-outline" size={20} color="#4e0360" />
                    <Text style={styles.settingText}>{language === 'en' ? 'Tamil' : 'English'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.settingItem} onPress={() => { setMenuOpen(false); navigation.navigate("Updatescreen"); }}>
                    <Ionicons name="person-outline" size={20} color="#4e0360" />
                    <Text style={styles.settingText}>Account</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Beta Heavy Feature: Performance Analytics Widget */}
      {betaFeatures && (
        <View style={styles.betaWidget}>
          <View style={styles.betaWidgetHeader}>
            <Ionicons name="speedometer" size={18} color="#fff" />
            <Text style={styles.betaWidgetTitle}>Performance Analytics</Text>
          </View>
          <View style={styles.betaWidgetContent}>
            <View style={styles.betaMetric}>
              <Text style={styles.betaMetricValue}>98%</Text>
              <Text style={styles.betaMetricLabel}>Accuracy</Text>
            </View>
            <View style={styles.betaMetric}>
              <Text style={styles.betaMetricValue}>4.2h</Text>
              <Text style={styles.betaMetricLabel}>Avg Time</Text>
            </View>
          </View>
        </View>
      )}

      {/* Stats Row */}
      <View style={styles.statsContainer}>
        <BlurView intensity={50} tint="light" style={styles.statsBlur}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalCasesCount}</Text>
            <Text style={styles.statLabel}>{t("total")}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: 'green' }]}>{completedCasesCount}</Text>
            <Text style={styles.statLabel}>{t("completed")}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#d35400' }]}>{pendingCasesCount}</Text>
            <Text style={styles.statLabel}>{t("pending")}</Text>
          </View>
        </BlurView>
      </View>

      {/* Filter Bar */}
      <View style={[styles.filterBar, { zIndex: 100 }]}>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setFilterDropdownOpen((prev) => !prev)}
        >
          <LinearGradient
            colors={["#6a11cb", "#2575fc"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.filterGradient}
          >
            <Ionicons name="filter" size={16} color="#fff" />
            <Text style={styles.filterButtonText}>{t("filter")}</Text>
            <Ionicons name={filterDropdownOpen ? "chevron-up" : "chevron-down"} size={16} color="#fff" style={{ marginLeft: 4 }} />
          </LinearGradient>
        </TouchableOpacity>

        {filterDropdownOpen && (
          <View style={{ position: 'absolute', top: 45, left: 0, flexDirection: 'row', zIndex: 200 }}>
            {/* Main Dropdown */}
            <View style={[styles.filterDropdown, { position: 'relative', top: 0, left: 0 }]}>
              <Text style={styles.filterTitle}>Sort & Filter</Text>
              <ScrollView style={{ maxHeight: 250 }} nestedScrollEnabled={true}>
                {filterOptions.map((f) => (
                  <TouchableOpacity
                    key={f.label}
                    style={[
                        styles.filterOption, 
                        activeFilters.some(af => af.field === f.field && af.value === f.value) && styles.filterOptionActive,
                        f.field === 'client_group' && expandedFilter === 'client_group' && { backgroundColor: '#f0f0f0' }
                    ]}
                    onPress={() => toggleFilter(f)}
                  >
                    <Text style={[
                        styles.filterOptionText,
                        activeFilters.some(af => af.field === f.field && af.value === f.value) && styles.filterOptionTextActive
                    ]}>{f.label}</Text>
                    
                    {f.field === 'client_group' ? (
                       <Ionicons name="chevron-forward" size={16} color="#555" />
                    ) : (
                       activeFilters.some(af => af.field === f.field && af.value === f.value) && (
                          <Ionicons name="checkmark" size={16} color="#fff" />
                       )
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Client Sub-menu (Opens to the Right) */}
            {expandedFilter === 'client_group' && (
              <View style={[styles.filterDropdown, { position: 'relative', top: 0, left: 10, minWidth: 200 }]}>
                <Text style={styles.filterTitle}>Select Client</Text>
                <ScrollView style={{ maxHeight: 250 }} nestedScrollEnabled={true}>
                  {uniqueClients.length > 0 ? (
                    uniqueClients.map(c => (
                      <TouchableOpacity
                        key={c}
                        style={[
                            styles.filterOption,
                            activeFilters.some(af => af.field === 'client' && af.value === c) && styles.filterOptionActive
                        ]}
                        onPress={() => toggleFilter({ label: `Client: ${c}`, field: "client", value: c })}
                      >
                        <Text style={[
                            styles.filterOptionText,
                            activeFilters.some(af => af.field === 'client' && af.value === c) && styles.filterOptionTextActive
                        ]}>{c}</Text>
                        {activeFilters.some(af => af.field === 'client' && af.value === c) && (
                            <Ionicons name="checkmark" size={16} color="#fff" />
                        )}
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text style={{ padding: 15, color: '#888', fontStyle: 'italic' }}>No clients found</Text>
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={styles.activeFilters}>
          {activeFilters.map((f) => (
            <View key={f.field + f.value} style={styles.filterTag}>
              <Text style={{ color: "#fff", fontSize: 12, marginRight: 5 }}>{f.label}</Text>
              <TouchableOpacity onPress={() => removeActiveFilter(f.field)}>
                <Ionicons name="close-circle" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          {activeFilters.length > 0 && (
            <TouchableOpacity onPress={toggleSortOrder} style={styles.sortArrow}>
              <Ionicons
                name={sortAsc ? "arrow-up" : "arrow-down"}
                size={18}
                color="#fff"
              />
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* Cases List */}
      <FlatList
        data={sortedCases}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        renderItem={({ item }) => {
          const statusText = computeStatusText(item);
          const memberStatus = computeMemberStatus(item);
          const isDelayed = statusText.includes("Delay");
          const isCES = (item.client || item.company || "").toUpperCase().includes("CES");

          return (
            <View style={[styles.caseCard, item.highPriority && styles.highPriorityCard]}>
              {/* Header */}
              <View style={styles.cardHeader}>
                <View style={[styles.headerLeft, { flex: 1, paddingRight: 110 }]}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="briefcase" size={16} color="#fff" />
                  </View>
                  <Text style={[styles.caseTitle, { flexShrink: 1 }]}>{item.matrixRefNo || item.RefNo || item.id}</Text>
                </View>
                
                <View style={{ position: 'absolute', top: 0, right: 0, alignItems: 'flex-end' }}>
                    {item.highPriority && (
                      <View style={[styles.priorityBadge, { marginBottom: 4 }]}>
                        <Text style={styles.priorityText}>{t("highPriority")}</Text>
                      </View>
                    )}
                    {(item.auditFeedback || (item.photosToRedo && item.photosToRedo.length > 0)) && item.status === 'assigned' && (
                        <View style={[styles.auditFailBadge, { marginLeft: 0 }]}>
                          <Text style={styles.auditFailText}>{t("auditFail")}</Text>
                        </View>
                    )}
                </View>
              </View>

              {/* Content */}
              <View style={styles.cardContent}>
                <View style={styles.infoRow}>
                  <Ionicons name="location" size={16} color="#888" style={{ marginRight: 8 }} />
                  <Text style={styles.infoText} numberOfLines={2}>{item.address || "No Address Provided"}</Text>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Ionicons name="business" size={14} color="#888" style={{ marginRight: 4 }} />
                    <Text style={styles.metaText}>{item.client || "N/A"}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="navigate" size={14} color="#888" style={{ marginRight: 4 }} />
                    <Text style={styles.metaText}>{item.pincode || "N/A"}</Text>
                  </View>
                </View>

                {statusText ? (
                  <View style={[styles.statusContainer, isDelayed ? styles.statusDelayed : styles.statusOnTime]}>
                    <Ionicons name={isDelayed ? "alert-circle" : "time"} size={14} color={isDelayed ? "#d32f2f" : "#2e7d32"} style={{ marginRight: 4 }} />
                    <Text style={[styles.statusText, { color: isDelayed ? "#d32f2f" : "#2e7d32" }]}>{statusText}</Text>
                  </View>
                ) : null}
              </View>

              {/* Actions */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.openButton}
                  onPress={() =>
                    navigation.navigate("CaseDetail", { caseId: item.id, user })
                  }
                >
                  <Text style={styles.openButtonText}>{t("viewDetails")}</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </TouchableOpacity>

                {memberStatus === "open" && (
                  <TouchableOpacity
                    style={styles.mapButton}
                    onPress={() => openMap(item.address)}
                  >
                    <Ionicons name="map" size={20} color="#fff" />
                  </TouchableOpacity>
                )}

                {isCES && (
                  <TouchableOpacity
                    style={styles.typeButton}
                    onPress={() => { setSelectedCaseForType(item); setTypeModalVisible(true); }}
                  >
                    <Text style={styles.typeButtonText}>{item.cesType ? `Type: ${item.cesType}` : "Set Type"}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={{ color: "#fff" }}>No cases found.</Text>}
      />

      {/* Revert Modal */}
      {showRevertModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={{ fontSize: 16, marginBottom: 10 }}>
              Enter reason to revert:
            </Text>
            <TextInput
              style={styles.reasonInput}
              value={revertReason}
              onChangeText={setRevertReason}
              placeholder="Reason..."
              multiline
            />
            <View style={{ flexDirection: "row", marginTop: 10 }}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setShowRevertModal(false);
                  setSelectedCase(null);
                  setRevertReason("");
                }}
              >
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmit}
                onPress={handleRevertSubmit}
              >
                <Text style={{ color: "#fff" }}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Type Selection Modal for CES */}
      <Modal
        visible={typeModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setTypeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' }}>Select Case Type</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <TouchableOpacity style={[styles.modalSubmit, { backgroundColor: '#28a745', flex: 1, marginRight: 5 }]} onPress={() => handleSetType("Yes")}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Yes (Normal)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSubmit, { backgroundColor: '#dc3545', flex: 1, marginLeft: 5 }]} onPress={() => handleSetType("No")}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>No (Locked/NA)</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={{ marginTop: 15, alignSelf: 'center' }} onPress={() => setTypeModalVisible(false)}><Text style={{ color: '#666' }}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Maintenance Warning Modal */}
      <Modal
        visible={maintenanceModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMaintenanceModalVisible(false)}
      >
        <View style={styles.alertOverlay}>
          <View style={[styles.alertBox, { backgroundColor: "#fff3e0", borderColor: "#ff9800", borderWidth: 2 }]}>
            <Ionicons name="construct" size={50} color="#ff9800" style={{ marginBottom: 10 }} />
            <Text style={[styles.alertTitle, { color: "#f57c00" }]}>Maintenance Mode</Text>
            <Text style={[styles.alertSub, { color: "#ef6c00" }]}>The system is currently under maintenance. Some actions like filling forms or uploading photos are disabled.</Text>
            <TouchableOpacity style={[styles.alertButton, { backgroundColor: "#ff9800" }]} onPress={() => setMaintenanceModalVisible(false)}>
                <Text style={[styles.alertButtonText, { padding: 10, textAlign: 'center' }]}>I Understand</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Dev Broadcast Alert */}
      <Modal
        visible={devAlertVisible && !!devBroadcastAlert && !bribeWarningVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={acknowledgeDevAlert}
      >
        <View style={styles.alertOverlay}>
          <View style={[
            styles.alertBox,
            {
              borderWidth: 2,
              borderColor:
                String(devBroadcastAlert?.severity || "").toLowerCase() === "critical"
                  ? "#dc2626"
                  : String(devBroadcastAlert?.severity || "").toLowerCase() === "warning"
                  ? "#f59e0b"
                  : String(devBroadcastAlert?.severity || "").toLowerCase() === "appreciation"
                  ? "#16a34a"
                  : "#0ea5e9",
            },
          ]}>
            <Ionicons
              name={
                String(devBroadcastAlert?.severity || "").toLowerCase() === "critical"
                  ? "alert-circle"
                  : String(devBroadcastAlert?.severity || "").toLowerCase() === "appreciation"
                  ? "trophy"
                  : "warning"
              }
              size={44}
              color={
                String(devBroadcastAlert?.severity || "").toLowerCase() === "critical"
                  ? "#dc2626"
                  : String(devBroadcastAlert?.severity || "").toLowerCase() === "warning"
                  ? "#f59e0b"
                  : String(devBroadcastAlert?.severity || "").toLowerCase() === "appreciation"
                  ? "#16a34a"
                  : "#0ea5e9"
              }
              style={{ marginBottom: 10 }}
            />
            <Text style={styles.devAlertTitle}>ADMIN ALERT</Text>
            <Text
              style={[
                styles.devAlertSeverity,
                {
                  color:
                    String(devBroadcastAlert?.severity || "").toLowerCase() === "critical"
                      ? "#dc2626"
                      : String(devBroadcastAlert?.severity || "").toLowerCase() === "warning"
                      ? "#d97706"
                      : String(devBroadcastAlert?.severity || "").toLowerCase() === "appreciation"
                      ? "#16a34a"
                      : "#0ea5e9",
                },
              ]}
            >
              {String(devBroadcastAlert?.severity || "info").toUpperCase()}
            </Text>
            <Text style={styles.devAlertMessage}>{devBroadcastAlert?.message}</Text>
            <TouchableOpacity style={styles.alertButton} onPress={acknowledgeDevAlert}>
              <LinearGradient colors={["#4e0360", "#c471ed"]} style={styles.alertGradient}>
                <Text style={styles.alertButtonText}>Acknowledge</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Bribe Warning Modal (Mandatory for Member) */}
      <Modal
        visible={bribeWarningVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setBribeWarningVisible(false)}
      >
        <View style={styles.alertOverlay}>
          <View style={[styles.alertBox, { backgroundColor: "#ffebee", borderColor: "#c62828", borderWidth: 2, width: '75%', padding: 20 }]}>
            <Ionicons name="warning" size={40} color="#c62828" style={{ marginBottom: 10 }} />
            <Text style={{ fontSize: 16, fontWeight: "bold", color: "#c62828", textAlign: "center", marginBottom: 8 }}>STRICT WARNING</Text>
            <Text style={{ fontSize: 13, color: "#b71c1c", textAlign: "center", marginBottom: 15, lineHeight: 18 }}>
              Do not get or give bribe. SpaceSolutions is totally against it and violations will be punished.
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: "#c62828", paddingVertical: 8, paddingHorizontal: 25, borderRadius: 6 }}
              onPress={() => setBribeWarningVisible(false)}
            >
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 14 }}>I Understand</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {showAppreciationBurst && (
        <View style={styles.burstOverlay} pointerEvents="none">
          <Text style={[styles.burstEmoji, { top: "18%", left: "15%" }]}>🎉</Text>
          <Text style={[styles.burstEmoji, { top: "22%", left: "68%" }]}>✨</Text>
          <Text style={[styles.burstEmoji, { top: "40%", left: "30%" }]}>🎊</Text>
          <Text style={[styles.burstEmoji, { top: "48%", left: "58%" }]}>⭐</Text>
          <Text style={[styles.burstEmoji, { top: "62%", left: "20%" }]}>🎉</Text>
          <Text style={[styles.burstEmoji, { top: "64%", left: "72%" }]}>🎊</Text>
        </View>
      )}

      {/* New Case Alert Modal */}
      <Modal
        visible={newCasesList.length > 0 && !bribeWarningVisible && !devAlertVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={async () => {
          // Save acknowledged IDs on dismiss
          try {
            const ids = newCasesList.map(c => c.id);
            const storedAck = await AsyncStorage.getItem("acknowledged_alerts");
            const currentAck = storedAck ? JSON.parse(storedAck) : [];
            const newAck = [...new Set([...currentAck, ...ids])];
            await AsyncStorage.setItem("acknowledged_alerts", JSON.stringify(newAck));
          } catch(e) {}
          setNewCasesList([]);
        }}
      >
        <View style={styles.alertOverlay}>
          <View style={styles.alertBox}>
            <Ionicons name="notifications" size={50} color="#ffd700" style={{ marginBottom: 10 }} />
            <Text style={styles.alertTitle}>New Cases Allocated!</Text>
            <Text style={styles.alertSub}>You have {newCasesList.length} new case(s).</Text>
            
            <FlatList
              data={newCasesList}
              keyExtractor={item => item.id}
              style={{ maxHeight: 200, width: '100%', marginBottom: 15 }}
              renderItem={({ item }) => (
                <View style={{ backgroundColor: '#f3e5f5', padding: 10, borderRadius: 5, marginBottom: 5 }}>
                  <Text style={{ fontWeight: 'bold', color: '#4e0360' }}>{item.matrixRefNo || item.RefNo || item.id}</Text>
                  <Text style={{ fontSize: 12, color: '#666' }}>{item.candidateName}</Text>
                </View>
              )}
            />
            
            <TouchableOpacity 
                style={styles.alertButton} 
                onPress={async () => {
                    // Save acknowledged IDs on button press
                    try {
                      const ids = newCasesList.map(c => c.id);
                      const storedAck = await AsyncStorage.getItem("acknowledged_alerts");
                      const currentAck = storedAck ? JSON.parse(storedAck) : [];
                      const newAck = [...new Set([...currentAck, ...ids])];
                      await AsyncStorage.setItem("acknowledged_alerts", JSON.stringify(newAck));
                    } catch(e) {}
                    setNewCasesList([]);
                }}
            >
                <LinearGradient colors={["#4e0360", "#c471ed"]} style={styles.alertGradient}>
                    <Text style={styles.alertButtonText}>Acknowledge</Text>
                </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sign Out & Chat */}
      <View style={{ width: '100%', alignItems: 'center' }}>
        <TouchableOpacity
          style={{ marginTop: 20 }}
          onPress={async () => {
            await firebase.auth().signOut(); // Optional if using custom auth
            logout();
          }}
        >
          <Text style={{ color: "white" }}>{t("signOut")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ marginTop: 10 }}
          onPress={() => navigation.navigate("MemberChats")}
        >
          <Text style={{ color: "#fff" }}>{t("chatAdmin")}</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: Platform.OS === 'android' ? 40 : 20 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 15, paddingHorizontal: 5 },
  headerBadge: { flex: 1, marginLeft: 10, paddingHorizontal: 15, paddingVertical: 10, borderRadius: 10, shadowColor: "#000", shadowOpacity: 0.3, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 5 },
  headerText: { fontSize: 18, fontWeight: "bold", color: "#fff", letterSpacing: 0.5 },
  betaBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: '#ff9800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  betaText: { fontSize: 8, fontWeight: 'bold', color: '#000' },
  profilePhoto: { marginLeft: 10, borderRadius: 20, overflow: "hidden" },
  profileMenu: { position: "absolute", top: 60, right: 20, backgroundColor: "#fff", padding: 15, borderRadius: 8, shadowColor: "#000", shadowOpacity: 0.2, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 5, zIndex: 1100 },
  fullScreenTouchable: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1099,
  },
  menuOverlay: { position: "absolute", top: 0, left: 0, bottom: 0, right: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1200 },
  menuContainer: { width: "75%", backgroundColor: "#fff", height: "100%", elevation: 10, shadowColor: "#000", shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.5, shadowRadius: 5 },
  menuHeader: { padding: 20, paddingTop: 50, flexDirection: "row", alignItems: "center" },
  menuUserAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#fff", justifyContent: "center", alignItems: "center", marginRight: 15 },
  menuUserInitials: { fontSize: 20, fontWeight: "bold", color: "#4e0360" },
  menuUserName: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  menuUserEmail: { color: "rgba(255,255,255,0.8)", fontSize: 12 },
  menuItem: { flexDirection: "row", alignItems: "center", paddingVertical: 15, paddingHorizontal: 20 },
  menuText: { fontSize: 16, color: "#333", fontWeight: "500" },
  caseCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.05)",
  },
  highPriorityCard: { borderLeftWidth: 5, borderLeftColor: "#e94e77" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, borderBottomWidth: 1, borderBottomColor: "#f0f0f0", paddingBottom: 8 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#4e0360", justifyContent: "center", alignItems: "center" },
  caseTitle: { fontSize: 16, fontWeight: "bold", color: "#333" },
  auditFailBadge: { backgroundColor: '#ffebee', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 8, borderWidth: 1, borderColor: '#ffcdd2' },
  auditFailText: { color: '#c62828', fontSize: 10, fontWeight: 'bold' },
  priorityBadge: { backgroundColor: "#ffebee", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  priorityText: { color: "#c62828", fontSize: 10, fontWeight: "bold" },
  cardContent: { marginBottom: 15 },
  infoRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  infoText: { color: "#444", fontSize: 14, flex: 1, lineHeight: 20 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  metaItem: { flexDirection: "row", alignItems: "center" },
  metaText: { color: "#666", fontSize: 13 },
  statusContainer: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: "#f5f5f5" },
  statusDelayed: { backgroundColor: "#ffebee" },
  statusOnTime: { backgroundColor: "#e8f5e9" },
  statusText: { fontSize: 12, fontWeight: "600" },
  actionRow: { flexDirection: "row", gap: 10 },
  openButton: {
    flex: 1,
    backgroundColor: "#4e0360",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  typeButton: { backgroundColor: "#673AB7", paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, justifyContent: 'center' },
  typeButtonText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
  openButtonText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  mapButton: {
    width: 48,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  revertButton: { backgroundColor: "#FF3B30", padding: 10, borderRadius: 6, alignItems: "center", flex: 1 },
  filterBar: { flexDirection: "row", alignItems: "center", marginBottom: 15, zIndex: 100 },
  filterButton: { borderRadius: 20, overflow: 'hidden', marginRight: 10, elevation: 5, shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity:0.2, shadowRadius:3 },
  filterGradient: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 15 },
  filterButtonText: { color: "#fff", marginLeft: 6, fontWeight: "600", fontSize: 14 },
  filterDropdown: { position: "absolute", top: 45, left: 0, backgroundColor: "#fff", borderRadius: 12, padding: 5, zIndex: 200, elevation: 10, shadowColor: "#000", shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, minWidth: 180 },
  filterTitle: { fontSize: 12, fontWeight: 'bold', color: '#888', margin: 10, textTransform: 'uppercase' },
  filterOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8 },
  filterOptionActive: { backgroundColor: '#6a11cb' },
  filterOptionText: { color: "#333", fontSize: 14, fontWeight: '500' },
  filterOptionTextActive: { color: "#fff" },
  activeFilters: { flexDirection: "row", alignItems: "center", paddingRight: 20 },
  filterTag: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 15, marginRight: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  sortArrow: { marginLeft: 5, padding: 5 },
  modalOverlay: { position: "absolute", top: 0, left: 0, bottom: 0, right: 0, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", zIndex: 200 },
  modalBox: { width: "80%", backgroundColor: "#fff", padding: 20, borderRadius: 10 },
  reasonInput: { height: 80, borderColor: "#ccc", borderWidth: 1, borderRadius: 6, padding: 10, textAlignVertical: "top" },
  modalCancel: { backgroundColor: "#ccc", padding: 10, borderRadius: 6, flex: 1, alignItems: "center", marginRight: 5 },
  modalSubmit: { backgroundColor: "#007AFF", padding: 10, borderRadius: 6, flex: 1, alignItems: "center" },
  statsContainer: { marginHorizontal: 5, marginBottom: 15, borderRadius: 15, overflow: 'hidden', borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1 },
  statsBlur: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 15 },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  statLabel: { fontSize: 12, color: '#555', fontWeight: '600' },
  
  // Alert Modal Styles
  alertOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 20 },
  alertBox: { backgroundColor: "#fff", width: "85%", borderRadius: 20, padding: 25, alignItems: "center", elevation: 10 },
  alertTitle: { fontSize: 22, fontWeight: "bold", color: "#333", marginBottom: 5 },
  alertRef: { fontSize: 18, fontWeight: "bold", color: "#4e0360", marginBottom: 10, backgroundColor: "#f3e5f5", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5, overflow: 'hidden' },
  alertSub: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 20 },
  alertButton: { width: "100%", borderRadius: 10, overflow: "hidden", marginBottom: 15 },
  alertGradient: { paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  alertButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  alertClose: { padding: 10 },
  alertCloseText: { color: "#888", fontWeight: "600" },
  burstOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 2500 },
  burstEmoji: { position: "absolute", fontSize: 36 },
  maintenanceBanner: {
    backgroundColor: "#ffbb33",
    marginHorizontal: -20,
    marginTop: -40, // Pull up to cover status bar area if needed or just sit at top
    paddingTop: Platform.OS === 'android' ? 40 : 50,
    paddingBottom: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    zIndex: 999,
  },
  maintenanceText: {
    color: "#000",
    fontWeight: "bold",
    fontSize: 12,
    textTransform: "uppercase",
  },
  maintenanceScreen: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  maintenanceAlertBox: {
    backgroundColor: "#d32f2f",
    padding: 30,
    borderRadius: 15,
    alignItems: "center",
    width: "100%",
    maxWidth: 350,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  maintenanceAlertTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 10,
  },
  maintenanceAlertText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
  },
  betaWidget: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  betaWidgetHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 },
  betaWidgetTitle: { color: "#fff", fontWeight: "bold", fontSize: 14, textTransform: "uppercase" },
  betaWidgetContent: { flexDirection: "row", justifyContent: "space-around" },
  betaMetric: { alignItems: "center" },
  betaMetricValue: { color: "#00e676", fontSize: 20, fontWeight: "bold" },
  betaMetricLabel: { color: "#ddd", fontSize: 10 },
  settingsContainer: { borderTopWidth: 1, borderTopColor: "#eee", padding: 15, backgroundColor: "#f9f9f9" },
  settingsButton: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 5 },
  settingsLabel: { fontSize: 16, fontWeight: "bold", marginLeft: 10, color: "#333" },
  settingsOptions: { marginTop: 10, paddingLeft: 10 },
  settingItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  settingText: { fontSize: 14, marginLeft: 10, color: "#4e0360" },
});
