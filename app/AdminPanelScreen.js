import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import { BlurView } from "expo-blur";
import * as DocumentPicker from "expo-document-picker";
import { LinearGradient } from "expo-linear-gradient";
import * as Speech from "expo-speech";
import { createElement, useContext, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { LineChart } from "react-native-chart-kit";
import * as XLSX from "xlsx";
import firebase from "../firebase";
import { AuthContext } from "./AuthContext";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const SCREEN_WIDTH = Dimensions.get("window").width;
const MENU_WIDTH = SCREEN_WIDTH * 0.6;
const MINI_SIDEBAR_WIDTH = 56; // 14 in tailwind units (14*4=56)
const IS_DESKTOP = SCREEN_WIDTH > 768;

const THEME = {
  light: {
    background: ["#f8fafc", "#f8fafc"],
    cardBg: "rgba(255, 255, 255, 0.85)",
    text: "#1E293B",
    textSecondary: "#64748B",
    primary: "#4F7DFF",
    border: "#E2E8F0",
    shadow: "rgba(148, 163, 184, 0.2)",
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
    info: "#8B5CF6",
    menuBg: "rgba(255, 255, 255, 0.95)"
  },
  dark: {
    background: ["#030712", "#08132b", "#0b1f46"],
    cardBg: "rgba(30, 41, 59, 0.6)",
    text: "#F8FAFC",
    textSecondary: "#94A3B8",
    primary: "#60A5FA",
    border: "#334155",
    shadow: "rgba(0, 0, 0, 0.3)",
    success: "#34D399",
    warning: "#FBBF24",
    error: "#F87171",
    info: "#A78BFA",
    menuBg: "rgba(30, 41, 59, 0.95)"
  }
};

const BackgroundDecorations = ({ theme }) => {
  const orbAnim1 = useRef(new Animated.Value(0)).current;
  const orbAnim2 = useRef(new Animated.Value(0)).current;
  const driftAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(orbAnim1, { toValue: 1, duration: 4000, useNativeDriver: true }),
        Animated.timing(orbAnim1, { toValue: 0, duration: 4000, useNativeDriver: true })
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(orbAnim2, { toValue: 1, duration: 5000, useNativeDriver: true }),
        Animated.timing(orbAnim2, { toValue: 0, duration: 5000, useNativeDriver: true })
      ])
    ).start();
    Animated.loop(
      Animated.timing(driftAnim, {
        toValue: 1,
        duration: 18000,
        useNativeDriver: true
      })
    ).start();
  }, []);

  const driftX = driftAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 24]
  });

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 0, pointerEvents: "none" }]}>
      <View style={styles.glow1} />
      <View style={styles.glow2} />
      <View style={styles.glow3} />
      <Animated.View style={[styles.spaceGrid, { transform: [{ translateX: driftX }] }]} />
      {Array.from({ length: 44 }).map((_, i) => (
        <View
          key={`star-${i}`}
          style={[
            styles.starPoint,
            {
              top: `${(i * 19) % 100}%`,
              left: `${(i * 37) % 100}%`,
              opacity: 0.16 + ((i % 6) * 0.1),
            },
          ]}
        />
      ))}
      {/* Threads */}
      <View style={{ position: 'absolute', top: '-20%', left: '10%', width: 1, height: 800, backgroundColor: theme.primary + '1A', transform: [{ rotate: '45deg' }] }} />
      <View style={{ position: 'absolute', top: '20%', left: '80%', width: 1, height: 1000, backgroundColor: theme.primary + '1A', transform: [{ rotate: '-30deg' }] }} />
      <View style={{ position: 'absolute', top: '70%', left: '5%', width: 1, height: 900, backgroundColor: theme.primary + '1A', transform: [{ rotate: '25deg' }] }} />
      <View style={{ position: 'absolute', top: '50%', left: '-20%', width: 1, height: 1200, backgroundColor: theme.primary + '1A', transform: [{ rotate: '60deg' }] }} />
      <View style={{ position: 'absolute', top: '90%', left: '60%', width: 1, height: 700, backgroundColor: theme.primary + '1A', transform: [{ rotate: '-55deg' }] }} />
      {/* Floating Orbs */}
      <Animated.View style={[styles.floatingOrb, { opacity: orbAnim1, top: '10%', left: '20%', backgroundColor: theme.primary + '40' }]} />
      <Animated.View style={[styles.floatingOrb, { opacity: orbAnim2, bottom: '20%', right: '15%', backgroundColor: theme.info + '40' }]} />
    </View>
  );
};

const CyberCorner = ({ theme, color }) => (
  <>
    <View style={[styles.cyberCorner, styles.cyberCornerTopLeft, { borderColor: color ? color + '99' : theme.primary + '30' }]} />
    <View style={[styles.cyberCorner, styles.cyberCornerBottomRight, { borderColor: color ? color + '99' : theme.primary + '30' }]} />
  </>
);

const BlinkingDot = ({ color }) => {
  const opacity = useRef(new Animated.Value(0.3)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true })
        ]),
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.2, duration: 800, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 800, useNativeDriver: true })
        ])
      ])
    ).start();
  }, []);

  return <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity, transform: [{ scale }] }} />;
};

export default function AdminPanelScreen({ navigation }) {
  const { user, logout } = useContext(AuthContext);
  const [cases, setCases] = useState([]);
  const [members, setMembers] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [refNoFilter, setRefNoFilter] = useState("");
  const [verificationFilter, setVerificationFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [fromDate, setFromDate] = useState(null);
  const [toDate, setToDate] = useState(null);
  const [selectedCases, setSelectedCases] = useState([]);
  const [assignTo, setAssignTo] = useState("");
  const [assignSearchText, setAssignSearchText] = useState("");
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [headerFilters, setHeaderFilters] = useState({});
  const [showHeaderFilters, setShowHeaderFilters] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [pendingUploadData, setPendingUploadData] = useState(null);
  const [lastUploadBatch, setLastUploadBatch] = useState({ ids: [], count: 0, at: null });
  const [isLightTheme, setIsLightTheme] = useState(false); // Default to dark theme
  const [archivedCount, setArchivedCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [assignMode, setAssignMode] = useState(false);
  const [dateInitiatedFilter, setDateInitiatedFilter] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [uploadDateFilter, setUploadDateFilter] = useState("");
  const [showUploadDatePicker, setShowUploadDatePicker] = useState(false);
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [voiceCommand, setVoiceCommand] = useState("");
  const [aiResponse, setAiResponse] = useState("Listening for command...");

  // Alert System State
  const [auditAlert, setAuditAlert] = useState(null);
  const [devBroadcastAlert, setDevBroadcastAlert] = useState(null);
  const [devAlertVisible, setDevAlertVisible] = useState(false);
  const [showAppreciationBurst, setShowAppreciationBurst] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const knownCaseStatuses = useRef(new Map());
  const isFirstLoad = useRef(true);

  // Feature Flags
  const [newUI, setNewUI] = useState(false);
  const [betaFeatures, setBetaFeatures] = useState(false);
  const [maintenanceModeAdmin, setMaintenanceModeAdmin] = useState(false);

  const [insightsOpen, setInsightsOpen] = useState(false);
  const [chartData, setChartData] = useState(null);
  const theme = isLightTheme ? THEME.light : THEME.dark;
  const isMobile = !IS_DESKTOP;
  const isCompactMobile = isMobile && SCREEN_WIDTH < 430;
  const contentPadding = isMobile ? 12 : 24;
  const chartWidth = Math.max(isMobile ? SCREEN_WIDTH - 36 : SCREEN_WIDTH - 320, 280);
  const statCardWidth = isMobile ? Math.max((SCREEN_WIDTH - contentPadding * 2 - 24) / 5, 58) : null;
  
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [activeSidebarItem, setActiveSidebarItem] = useState("Command");

  const sidebarItems = [
    { label: "Command", icon: "grid-outline", screen: "AdminPanel" },
    { label: "Users", icon: "people-outline", screen: "MemberViewScreen" },
    { label: "Completed", icon: "checkmark-done-circle-outline", screen: "CompletedCases" },
    { label: "Reverted", icon: "refresh-circle-outline", screen: "RevertedCasesScreen" },
    { label: "Verify", icon: "shield-checkmark-outline", screen: "VerifyProfileScreen" },
    { label: "DSR", icon: "document-text-outline", screen: "MemberDSRScreen" },
    { label: "Mails", icon: "mail-outline", screen: "MailRecordsScreen" },
    { label: "Analytics", icon: "stats-chart-outline", screen: "StatisticsScreen" },
    { label: "Tickets", icon: "ticket-outline", screen: "AllTicketsScreen" }, // Assuming this exists
    { label: "Settings", icon: "settings-outline" },
  ];

  useEffect(() => {
    const devRef = firebase.database().ref("dev");
    const listener = devRef.on("value", (snapshot) => {
      const flags = snapshot.val() || {};
      console.log("[AdminPanel] Dev Flags Received:", flags);
      // Handle both boolean and string "true"
      setNewUI(flags.enableNewUI === true || flags.enableNewUI === "true");
      setBetaFeatures(flags.enableBetaFeatures === true || flags.enableBetaFeatures === "true");
      setMaintenanceModeAdmin(flags.maintenanceModeAdmin === true || flags.maintenanceModeAdmin === "true");
    });
    return () => devRef.off("value", listener);
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    const ref = firebase.database().ref(`users/${user.uid}`);
    const listener = ref.on("value", (snapshot) => {
      setCurrentUserProfile(snapshot.val() || null);
    });
    return () => ref.off("value", listener);
  }, [user?.uid]);

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
    setDevAlertVisible(false);
    setDevBroadcastAlert(null);
  };

  // Animation for Menu
  const slideAnim = useRef(new Animated.Value(-MENU_WIDTH)).current;

  useEffect(() => {
    if (!IS_DESKTOP) {
      Animated.timing(slideAnim, {
        toValue: menuOpen ? 0 : -MENU_WIDTH,
        duration: 300,
        useNativeDriver: false, // 'left' is not supported by native driver
      }).start();
    }
  }, [menuOpen, IS_DESKTOP]);

  // Chart Data Generation
  useEffect(() => {
    if (cases.length === 0) return;

    const completedCases = cases.filter(c => c.status === 'completed' || c.status === 'closed');
    const pendingCases = cases.filter(c => c.status === 'assigned' || c.status === 'audit' || c.status === 'fired' || c.status === 'reverted');

    const groupedCompleted = {};
    const groupedPending = {};

    completedCases.forEach(c => {
        const dateKey = new Date(c.completedAt || c.finalizedAt || c.updatedAt).toLocaleDateString();
        if (!groupedCompleted[dateKey]) groupedCompleted[dateKey] = 0;
        groupedCompleted[dateKey]++;
    });
    
    pendingCases.forEach(c => {
        const dateKey = new Date(c.assignedAt || c.dateInitiated).toLocaleDateString(); // Use assigned/initiated for pending
        if (!groupedPending[dateKey]) groupedPending[dateKey] = 0;
        groupedPending[dateKey]++;
    });

    const labels = [];
    const completedDataPoints = [];
    const pendingDataPoints = [];

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateKey = d.toLocaleDateString();
        labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
        completedDataPoints.push(groupedCompleted[dateKey] || 0);
        pendingDataPoints.push(groupedPending[dateKey] || 0);
    }

    setChartData({ 
        labels, 
        datasets: [
            { data: completedDataPoints, color: (opacity = 1) => theme.success, strokeWidth: 3 }, 
            { data: pendingDataPoints, color: (opacity = 1) => theme.warning, strokeWidth: 3 }
        ],
        legend: ["Verified Cycles", "Queue Load"]
    });
  }, [cases, theme]);

  const clearAllFilters = () => {
    setCityFilter("");
    setSearchText("");
    setStatusFilter("");
    setRefNoFilter("");
    setVerificationFilter("");
    setFromDate(null);
    setToDate(null);
    setDateInitiatedFilter("");
    setUploadDateFilter("");
    setHeaderFilters({});
  };

  useEffect(() => {
    if (voiceModalVisible) {
        Speech.speak("System under development. AI module offline.", { pitch: 1.0, rate: 0.9 });
    } else {
        Speech.stop();
    }
  }, [voiceModalVisible]);

  // --- SPACE_ADMIN AI LOGIC ---
  const processVoiceCommand = (cmd) => {
    const lowerCmd = cmd.toLowerCase();
    let response = "Command not recognized.";
    let closeDelay = 1500;

    if (lowerCmd.includes("filter by city") || lowerCmd.includes("filter city")) {
        const city = lowerCmd.replace("filter by city", "").replace("filter city", "").trim();
        setCityFilter(city); 
        response = `Filtering by city: ${city}`;
    } else if (lowerCmd.includes("filter by name") || lowerCmd.includes("search")) {
        const text = lowerCmd.replace("filter by name", "").replace("search", "").trim();
        setSearchText(text);
        response = `Searching for: ${text}`;
    } else if (lowerCmd.includes("select all")) {
        const allIds = fullyFilteredCases.map(c => c.id);
        setSelectedCases(allIds);
        response = `Selected ${allIds.length} cases.`;
    } else if (lowerCmd.includes("assign")) {
        if (selectedCases.length > 0) {
            setAssignModalVisible(true);
            response = "Opening assignment menu...";
            closeDelay = 500;
        } else {
            response = "No cases selected to assign.";
        }
    } else if (lowerCmd.includes("confirm")) {
        if (assignModalVisible && assignTo) {
            assignCases();
            response = "Assignment confirmed.";
        } else {
            response = "Cannot confirm. Check assignment menu.";
        }
    } else if (lowerCmd.includes("manual audit")) {
        if (fullyFilteredCases.length === 1) {
            const item = fullyFilteredCases[0];
            navigation.navigate("AuditCaseScreen", { caseId: item.id, caseData: item, manualMode: true });
            response = "Opening Manual Audit...";
            closeDelay = 500;
        } else {
            response = "Please filter to a single case first.";
        }
    } else if (lowerCmd.includes("clear")) {
        clearAllFilters();
        response = "Filters and selection cleared.";
    }

    setAiResponse(response);
    Speech.speak(response, { pitch: 1.0, rate: 0.9 });
    setTimeout(() => {
        setVoiceModalVisible(false);
        setVoiceCommand("");
        setAiResponse("Listening for command...");
    }, closeDelay);
  };

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

  const openMenu = () => {
    setMenuOpen(true);
  };

  const closeMenu = () => {
    setMenuOpen(false);
  };

  // Fetch cases
  useEffect(() => {
    const casesRef = firebase.database().ref("cases");
    const listener = casesRef.on("value", async (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data).map((key) => ({ id: key, ...data[key] }));
      
      // Alert Logic: Check for status changes to 'audit'
      if (isFirstLoad.current) {
        const unacknowledgedAudits = [];
        
        // Retrieve acknowledged audits from storage
        let ackList = [];
        try {
          const stored = await AsyncStorage.getItem("acknowledged_audits");
          if (stored) ackList = JSON.parse(stored);
        } catch(e) {}
        const ackSet = new Set(ackList);

        list.forEach(c => {
          knownCaseStatuses.current.set(c.id, c.status);
          // Check for cases submitted while logged out
          // Only alert if NOT previously acknowledged
          if (c.status === 'audit' && !ackSet.has(c.id)) {
            unacknowledgedAudits.push(c);
          }
        });
        
        if (unacknowledgedAudits.length > 0) {
          const latest = unacknowledgedAudits[unacknowledgedAudits.length - 1];
          setAuditAlert({
            refNo: latest.matrixRefNo || latest.RefNo || latest.id,
            memberName: latest.assigneeName || "Unknown Member"
          });
          // Mark ALL pending audits as seen immediately so they don't queue up
          try {
            const newIds = unacknowledgedAudits.map(c => c.id);
            ackList.push(...newIds);
            await AsyncStorage.setItem("acknowledged_audits", JSON.stringify(ackList));
          } catch(e) {}
        }
        isFirstLoad.current = false;
      } else {
        list.forEach(c => {
          const oldStatus = knownCaseStatuses.current.get(c.id);
          if (c.status === 'audit' && oldStatus !== 'audit') {
            setAuditAlert({
              refNo: c.matrixRefNo || c.RefNo || c.id,
              memberName: c.assigneeName || "Unknown Member"
            });
            // Persist live alerts too so they don't reappear on reload
            AsyncStorage.getItem("acknowledged_audits").then(stored => {
              const currentList = stored ? JSON.parse(stored) : [];
              if (!currentList.includes(c.id)) {
                currentList.push(c.id);
                AsyncStorage.setItem("acknowledged_audits", JSON.stringify(currentList));
              }
            });
          }
          knownCaseStatuses.current.set(c.id, c.status);
        });
      }

      setCases(list);
    });
    return () => casesRef.off("value", listener);
  }, []);

  // Fetch members
  useEffect(() => {
    const membersRef = firebase.database().ref("users");
    membersRef.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data)
        .map((key) => ({ id: key, ...data[key] }))
        .filter(m => m.role !== 'admin' && m.role !== 'dev');
      setMembers(list);
    });
  }, []);

  // Fetch archived count
  useEffect(() => {
    const statsRef = firebase.database().ref("metadata/statistics/archivedCount");
    const listener = statsRef.on("value", (snapshot) => {
      setArchivedCount(snapshot.val() || 0);
    });
    return () => statsRef.off("value", listener);
  }, []);

  // Auto-dismiss alert after 4 seconds
  useEffect(() => {
    if (auditAlert) {
      setNotifications(prev => [{
          id: Date.now(),
          title: "Audit Request",
          message: `${auditAlert.refNo} submitted by ${auditAlert.memberName}`,
          time: new Date().toLocaleTimeString()
      }, ...prev]);

      const timer = setTimeout(() => {
        setAuditAlert(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [auditAlert]);

  const toTitleCase = (str) => str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  const uniqueCities = [...new Set(cases.map(c => toTitleCase((c.city || "").trim())).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const sortedMembers = [...members].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  // Counters
  const assignedTL = cases.length + archivedCount;
  const reverted = cases.filter((c) => c.status === "reverted").length;
  const assignedFE = cases.filter((c) => c.status === "assigned").length;
  const audited = cases.filter((c) => c.status === "audit").length;
  const completed = cases.filter((c) => c.status === "completed").length + archivedCount;

  const uniqueDates = [...new Set(cases.map(c => c.dateInitiated ? new Date(c.dateInitiated).toLocaleDateString() : null).filter(Boolean))].sort();

  // Filtered cases
  const filteredCases = cases.filter((c) => {
    // Exclude completed and closed cases from the main admin view
    if (c.status === "completed" || c.status === "closed") return false;

    const matchesSearch =
      c.matrixRefNo?.toLowerCase().includes(searchText.toLowerCase()) ||
      c.candidateName?.toLowerCase().includes(searchText.toLowerCase());
    const matchesStatus = statusFilter ? c.status === statusFilter : true;
    const matchesRefNo = refNoFilter ? c.matrixRefNo?.includes(refNoFilter) : true;
    const matchesVerification = verificationFilter
      ? c.checkType?.toUpperCase() === verificationFilter.toUpperCase()
      : true;
    const matchesCity = cityFilter ? (c.city || "").toLowerCase() === cityFilter.toLowerCase() : true;
    let matchesDate = true;
    if (fromDate) matchesDate = matchesDate && new Date(c.dateInitiated) >= fromDate;
    if (toDate) matchesDate = matchesDate && new Date(c.dateInitiated) <= toDate;
    
    let matchesDateInitiated = true;
    if (dateInitiatedFilter) {
        if (!c.dateInitiated) matchesDateInitiated = false;
        else {
            const d = new Date(c.dateInitiated);
            const localYMD = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            matchesDateInitiated = localYMD === dateInitiatedFilter;
        }
    }

    let matchesUploadDate = true;
    if (uploadDateFilter) {
        if (!c.ingestedAt) matchesUploadDate = false;
        else {
            const d = new Date(c.ingestedAt);
            const localYMD = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            matchesUploadDate = localYMD === uploadDateFilter;
        }
    }
    return matchesSearch && matchesStatus && matchesRefNo && matchesVerification && matchesCity && matchesDate && matchesDateInitiated && matchesUploadDate;
  });

  const fullyFilteredCases = filteredCases.filter((c) => {
    if (Object.keys(headerFilters).length === 0) return true;
    return Object.keys(headerFilters).every((key) => {
      if (!headerFilters[key]) return true;
      const filterVal = headerFilters[key].toLowerCase();
      let val = "";
      if (key === "client") val = c.client;
      else if (key === "ReferenceNo") val = c.matrixRefNo;
      else if (key === "candidateName") val = c.candidateName;
      else if (key === "checkType") val = c.checkType;
      else if (key === "chkType") val = c.chkType;
      else if (key === "company") val = c.company;
      else if (key === "address") val = c.address;
      else if (key === "city") val = c.city;
      else if (key === "state") val = c.state;
      else if (key === "pincode") val = c.pincode;
      else if (key === "contactNumber") val = c.contactNumber;
      else if (key === "status") val = c.status;
      else if (key === "assigneeName") val = c.assigneeName;
      else if (key === "assigneeRole") val = c.assigneeRole;
      else if (key === "comments") val = c.comments;
      else if (key === "completedAt") val = c.completedAt ? new Date(c.completedAt).toLocaleDateString() : "";
      else if (key === "dateInitiated") {
          if (c.dateInitiated) {
              const d = new Date(c.dateInitiated);
              if (!isNaN(d.getTime())) {
                  const day = String(d.getDate()).padStart(2, '0');
                  const month = String(d.getMonth() + 1).padStart(2, '0');
                  const year = d.getFullYear();
                  val = `${day}/${month}/${year}`;
              }
          }
      }
      return (val || "").toString().toLowerCase().includes(filterVal);
    });
  }).sort((a, b) => {
    const dateA = new Date(a.assignedAt || a.dateInitiated || 0).getTime();
    const dateB = new Date(b.assignedAt || b.dateInitiated || 0).getTime();
    return dateB - dateA;
  });

  const handleDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selectedDate) {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      setDateInitiatedFilter(`${year}-${month}-${day}`);
    }
  };

  const handleUploadDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setShowUploadDatePicker(false);
    if (selectedDate) {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      setUploadDateFilter(`${year}-${month}-${day}`);
    }
  };

  const toggleSelectCase = (id) => {
    setSelectedCases((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleSelectAll = () => {
    const allIds = fullyFilteredCases.map(c => c.id);
    const allSelected = allIds.length > 0 && allIds.every(id => selectedCases.includes(id));
    
    if (allSelected) {
      setSelectedCases(prev => prev.filter(id => !allIds.includes(id)));
    } else {
      const newSelected = [...new Set([...selectedCases, ...allIds])];
      setSelectedCases(newSelected);
    }
  };

  const assignCases = () => {
    if (selectedCases.length === 0) {
      if (Platform.OS === "web") return alert("Error: Please select at least one case to assign.");
      return Alert.alert("Error", "Please select at least one case to assign.");
    }
    if (!assignTo) {
      if (Platform.OS === "web") return alert("Select a member to assign!");
      return Alert.alert("Select a member to assign!");
    }

    const member = members.find((m) => m.id === assignTo);
    if (!member) {
      if (Platform.OS === "web") return alert("Member not found!");
      return Alert.alert("Member not found!");
    }

    const performAssignment = () => {
      selectedCases.forEach((caseId) => {
        firebase.database().ref(`cases/${caseId}`).update({
          assigneeName: member.name,
          assignedTo: member.id,
          assigneeRole: member.role || "FE",
          status: "assigned",
          assignedAt: new Date().toISOString(),
        });
      });
      setSelectedCases([]);
      setAssignTo("");
      setAssignModalVisible(false);
      setTimeout(() => {
          if (Platform.OS === "web") alert("Success: Cases assigned successfully!");
          else Alert.alert("Success", "Cases assigned successfully!");
      }, 100);
    };

    const alreadyAssigned = selectedCases
      .map(id => cases.find(c => c.id === id))
      .filter(c => c && c.assignedTo);

    if (alreadyAssigned.length > 0) {
      const names = [...new Set(alreadyAssigned.map(c => c.assigneeName || "Unknown"))].join(", ");
      const msg = `Case already assigned to ${names}, wish to continue?`;
      if (Platform.OS === "web") {
        if (confirm(msg)) performAssignment();
      } else {
        Alert.alert("Warning", msg, [{ text: "Cancel", style: "cancel" }, { text: "Continue", onPress: performAssignment }]);
      }
      return;
    }

    performAssignment();
  };

  const handleRevert = (caseId) => {
    const revertAction = () => {
      firebase.database().ref(`cases/${caseId}`).update({
        status: "reverted",
        completedAt: null,
        assigneeName: null,
        assigneeRole: null,
        assignedTo: null,
        photosFolder: null,
        formCompleted: false,
        filledForm: null,
        auditFeedback: null,
        photosToRedo: null,
        assignedAt: null,
        // Clear Matrix Fields
        verificationDateTime: null, candidateAddressPeriod: null, respondentPeriodStay: null, modeOfConfirmation: null, 
        respondentName: null, respondentRelationship: null, residenceStatus: null, addressProofDetails: null, 
        neighbourConfirmation: null, landmark: null, policeStation: null, verificationComments: null, 
        matrixRepNameDate: null, natureLocation: null, addressProof: null, respondentSignature: null, matrixRepSignature: null,
        // Clear CES Fields
        fatherName: null, detailsVerified: null, relationship: null, fieldExecutiveName: null, 
        stayFromDate: null, stayToDate: null, addressType: null, maritalStatus: null, residenceType: null, 
        locationType: null, siteVisit: null, verificationStatus: null, remarks: null, fieldExecutiveSignature: null,
        // Clear DHI Fields
        locationDetailsIfNoCompany: null, officeSpace: null, employeeCount: null, businessNature: null, 
        respondentDetails: null, verifierDetails: null, emailIds: null, phoneNumbers: null, additionalContacts: null, 
        neighbor1: null, neighbor2: null, postalCheck: null, courierCheck: null, fieldAssistantSignatureText: null, 
        checkboxes: null, verifierSignature: null,
        // Clear Common/Other
        comments: null,
        // Ensure critical fields remain (commented out to show what is KEPT)
        // matrixRefNo: KEEP
        // candidateName: KEEP
        // address: KEEP
        // client: KEEP
        // company: KEEP
        // contactNumber: KEEP
      });
    };

    const alertMessage = "Are you sure you want to revert this case? This will clear all associated photos and form data.";

    if (Platform.OS === "web") {
      if (confirm(alertMessage)) {
        revertAction();
      }
    } else {
      Alert.alert("Revert Case", alertMessage, [
        { text: "Cancel", style: "cancel" },
        { text: "Revert", onPress: revertAction, style: "destructive" },
      ]);
    }
  };

  const uploadExcel = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;

      const file = result.assets?.[0];
      if (!file?.uri) {
        throw new Error("No file selected.");
      }

      const response = await fetch(file.uri);
      const arrayBuffer = await response.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      if (!jsonData.length) {
        if (Platform.OS === "web") alert("Selected file has no readable rows.");
        else Alert.alert("Empty File", "Selected file has no readable rows.");
        return;
      }

      setPendingUploadData(jsonData);
      setUploadModalVisible(true);
    } catch (error) {
      if (Platform.OS === "web") alert("Upload failed: " + error.message);
      else Alert.alert("Upload Failed", error.message);
    }
  };

  const handleReverseLastUpload = () => {
    if (!lastUploadBatch?.ids?.length) {
      if (Platform.OS === "web") alert("No recent upload batch to reverse.");
      else Alert.alert("Nothing to Reverse", "No recent upload batch found.");
      return;
    }

    const doReverse = async () => {
      try {
        const updates = {};
        lastUploadBatch.ids.forEach((id) => {
          updates[`cases/${id}`] = null;
        });
        await firebase.database().ref().update(updates);
        const removed = lastUploadBatch.count;
        setLastUploadBatch({ ids: [], count: 0, at: null });
        if (Platform.OS === "web") alert(`Reversed successfully. Removed ${removed} uploaded cases.`);
        else Alert.alert("Reversed", `Removed ${removed} uploaded cases.`);
      } catch (e) {
        if (Platform.OS === "web") alert("Reverse failed: " + e.message);
        else Alert.alert("Reverse Failed", e.message);
      }
    };

    const msg = `Remove last uploaded batch (${lastUploadBatch.count} cases)? This cannot be undone.`;
    if (Platform.OS === "web") {
      if (confirm(msg)) doReverse();
    } else {
      Alert.alert("Reverse Upload", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Reverse", style: "destructive", onPress: doReverse },
      ]);
    }
  };
  const processExcelData = async (jsonData, mode) => {
    let addedCount = 0;
    let duplicateCount = 0;
    const addedIds = [];

    for (const row of jsonData) {
      const refNo = row["Reference ID"]?.toString() || "";
      if (!refNo) continue;

      const caseData = {
        client: row["Client"] || "",
        matrixRefNo: refNo,
        checkType: row["Check type"] || "",
        company: row["company"] || "",
        candidateName: row["Candidate Name"] || "",
        address: row["Address"] || "",
        chkType: row["ChkType"] || "",
        dateInitiated: (() => {
          const excelValue = row["Date Initiated"];
          if (!excelValue) return new Date().toISOString();
          if (typeof excelValue === "number") {
            const jsDate = XLSX.SSF.parse_date_code(excelValue);
            return new Date(jsDate.y, jsDate.m - 1, jsDate.d).toISOString();
          }
          if (typeof excelValue === "string" && excelValue.includes("-")) {
            const [day, month, year] = excelValue.split("-");
            const parsedDate = new Date(`${year}-${month}-${day}`);
            return isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();
          }
          const parsed = new Date(excelValue);
          return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
        })(),
        contactNumber: row["Contact Number"] || "",
        status: "fired",
        city: row["Location"] || "",
        state: row["State"] || "",
        pincode: row["Pincode"] || "",
        assigneeName: "",
        assignedTo: null,
        assigneeRole: "",
        completedAt: null,
        comments: row["comments"] || "",
        ingestedAt: new Date().toISOString(),
      };

      // Check for exact duplicates (all fields match) to prevent re-uploading same file
      const isDuplicate = cases.some((existing) => {
        return (
          (existing.matrixRefNo || "").toString().trim() === (caseData.matrixRefNo || "").toString().trim() &&
          (existing.candidateName || "").toString().trim() === (caseData.candidateName || "").toString().trim() &&
          (existing.checkType || "").toString().trim() === (caseData.checkType || "").toString().trim() &&
          (existing.chkType || "").toString().trim() === (caseData.chkType || "").toString().trim() &&
          (existing.client || "").toString().trim() === (caseData.client || "").toString().trim() &&
          (existing.company || "").toString().trim() === (caseData.company || "").toString().trim() &&
          (existing.address || "").toString().trim() === (caseData.address || "").toString().trim() &&
          (existing.city || "").toString().trim() === (caseData.city || "").toString().trim() &&
          (existing.state || "").toString().trim() === (caseData.state || "").toString().trim() &&
          (existing.pincode || "").toString().trim() === (caseData.pincode || "").toString().trim() &&
          (existing.contactNumber || "").toString().trim() === (caseData.contactNumber || "").toString().trim()
        );
      });

      if (isDuplicate) {
        duplicateCount++;
        continue;
      }

      if (mode === "automate") {
        const feName = row["fe name"];
        if (feName) {
          const member = members.find((m) => m.name?.toLowerCase() === feName.toLowerCase());
          if (member) {
            caseData.status = "assigned";
            caseData.assigneeName = member.name;
            caseData.assignedTo = member.id;
            caseData.assigneeRole = member.role || "FE";
            caseData.assignedAt = new Date().toISOString();
          }
        }
      }

      const newRef = firebase.database().ref(`cases`).push();
      await newRef.set(caseData);
      if (newRef.key) addedIds.push(newRef.key);
      addedCount++;
    }
    if (addedIds.length > 0) {
      setLastUploadBatch({ ids: addedIds, count: addedIds.length, at: new Date().toISOString() });
    }
    if (Platform.OS === "web") alert(`Upload Complete\nAdded: ${addedCount}\nSkipped (Exact Duplicates): ${duplicateCount}`);
    else Alert.alert("Upload Complete", `Added: ${addedCount}\nSkipped (Exact Duplicates): ${duplicateCount}`);
  };

  const StatCard = ({ label, value, icon, color, change }) => {
    const [isPressed, setIsPressed] = useState(false);
    const [realtimeValue, setRealtimeValue] = useState(0);
    const glowAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      const interval = setInterval(() => {
          setRealtimeValue(prev => prev + Math.floor(Math.random() * 3) + 1);
      }, 2500 + Math.random() * 1500);

      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 2000, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0, duration: 2000, useNativeDriver: false })
        ])
      ).start();

      return () => clearInterval(interval);
    }, []);

    const isPositive = change ? !String(change).trim().startsWith("-") : true;

    return (
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={() => setIsPressed(true)}
        onPressOut={() => setIsPressed(false)}
        style={[
          styles.statCardTouchable,
          isMobile ? { width: statCardWidth, minWidth: statCardWidth, flex: 0 } : null,
          isPressed && { transform: [{ scale: 1.05 }] },
          { shadowColor: color + "66", shadowOpacity: 0.6, shadowRadius: 20 }
        ]}
      >
        <BlurView intensity={30} tint={isLightTheme ? 'light' : 'dark'} style={[styles.statCard, isCompactMobile && styles.statCardMobile, isMobile && styles.statCardLineMobile, { borderColor: color + "55" }]}>
          <CyberCorner theme={theme} color={color} />
          <View style={[styles.statCardHeader, isMobile && styles.statCardHeaderMobile]}>
            <Animated.View style={[styles.statIconContainer, isMobile && styles.statIconContainerMobile, { backgroundColor: isLightTheme ? theme.border : 'rgba(15, 23, 42, 0.5)', transform: [{ rotate: glowAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
              <Ionicons name={icon} size={isMobile ? 14 : 22} color={color} style={{ textShadowColor: color, textShadowRadius: 8 }} />
            </Animated.View>
            {!isMobile && change && (
              <Text style={[styles.statChange, { color: isPositive ? theme.success : theme.error, backgroundColor: (isPositive ? theme.success : theme.error) + '15', borderColor: (isPositive ? theme.success : theme.error) + '30' }]}>{change}</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: isMobile ? 0 : 2 }}>
            <Text style={[styles.statValue, isMobile && styles.statValueMobile, { color: theme.text, textShadowColor: color, textShadowRadius: 15, textShadowOffset: {width: 0, height: 0} }]}>{value}</Text>
            {!isMobile && <View style={styles.realtimeContainer}>
                <Text style={[styles.realtimeArrow, { color: theme.success }]}>↝</Text>
                <Text style={[styles.realtimeValue, { color: theme.success }]}>+{realtimeValue}</Text>
            </View>}
          </View>
          <Text style={[styles.statLabel, isMobile && styles.statLabelMobile, { color: theme.textSecondary }]} numberOfLines={1}>{label}</Text>
        </BlurView>
      </TouchableOpacity>
    );
  };

  const columnWidths = {
    number: 55,
    select: 30,
    client: 100,
    ReferenceNo: 100,
    candidateName: 120,
    tmName: 100,
    checkType: 100,
    chkType: 100,
    company: 120,
    address: 150,
    city: 100,
    state: 80,
    pincode: 80,
    contactNumber: 100,
    status: 100,
    assigneeName: 120,
    assigneeRole: 80,
    completedAt: 100,
    comments: 150,
    dateInitiated: 100,
    revert: 60,
    manualAudit: 60,
  };

  const getVisibleColumns = () => {
      if (!assignMode) return columnWidths;
      const hidden = ['tmName', 'checkType', 'chkType', 'state', 'assigneeRole', 'completedAt', 'comments'];
      const visible = {};
      Object.keys(columnWidths).forEach(key => {
          if (!hidden.includes(key)) visible[key] = columnWidths[key];
      });
      return visible;
  };
  const visibleCols = getVisibleColumns();

  // Table Row Renderer
  const renderCase = ({ item, index }) => {
    const isSelected = selectedCases.includes(item.id);
    const isOdd = index % 2 === 1;

    return (
      <View style={[styles.caseRow, isCompactMobile && styles.caseRowMobile, { borderBottomColor: theme.border, borderBottomWidth: 0, backgroundColor: isOdd ? (isLightTheme ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)") : "transparent" }]}>
        {Object.keys(visibleCols).map((key) => {
          let value = "";
          let component = null;
          switch (key) {
            case "number":
              value = index + 1;
              break;
            case "select":
              value = isSelected ? "selected" : "unselected";
              break;
            case "client":
              value = item.client || "-";
              break;
            case "ReferenceNo":
              value = item.matrixRefNo || "-";
              break;
            case "candidateName":
              value = item.candidateName || "-";
              break;
            case "tmName":
              value = "Spacesolutions";
              break;
            case "checkType":
              value = item.checkType || "-";
              break;
            case "company":
              value = item.company || "-";
              break;
            case "address":
              value = item.address || "-";
              break;
            case "chkType":
              value = item.chkType || "-";
              break;
            case "city":
              value = item.city || "-";
              break;
            case "state":
              value = item.state || "-";
              break;
            case "pincode":
              value = item.pincode || "-";
              break;
            case "contactNumber":
              value = item.contactNumber || "-";
              break;
            case "status":
              value = item.status || "-";
              break;
            case "assigneeName":
              value = item.assigneeName || "-";
              if (item.assignedTo && item.assignedTo !== "null") {
                const member = members.find(m => m.id === item.assignedTo);
                component = (
                  <View key={key} style={[styles.assigneeCell, { width: visibleCols[key] }]}>
                    {member?.photoURL ? (
                      <Image source={{ uri: member.photoURL }} style={styles.assigneeAvatar} />
                    ) : (
                      <View style={[styles.assigneeAvatarPlaceholder, { backgroundColor: theme.primary + '30' }]}>
                        <Text style={[styles.assigneeAvatarText, { color: theme.primary }]}>{(value || '?').charAt(0)}</Text>
                      </View>
                    )}
                    <Text style={[styles.cell, isCompactMobile && styles.cellMobile, { flex: 1, paddingHorizontal: 4, color: theme.text }]} numberOfLines={2}>{value}</Text>
                  </View>
                );
              } else {
                component = (
                  <View key={key} style={[styles.assigneeCell, { width: visibleCols[key], opacity: 0.6 }]}>
                     <Ionicons name="person-add-outline" size={16} color={theme.textSecondary} style={{ marginRight: 6 }} />
                     <Text style={[styles.cell, isCompactMobile && styles.cellMobile, { fontSize: 11, color: theme.textSecondary, fontStyle: 'italic' }]}>Select Member</Text>
                  </View>
                );
              }
              break;
            case "assigneeRole":
              value = item.assigneeRole || "-";
              break;
            case "completedAt":
              value = item.completedAt ? new Date(item.completedAt).toLocaleDateString() : "-";
              break;
            case "comments":
              value = item.comments || "-";
              break;
            case "dateInitiated":
              if (item.dateInitiated) {
                  const d = new Date(item.dateInitiated);
                  if (!isNaN(d.getTime())) {
                      const day = String(d.getDate()).padStart(2, '0');
                      const month = String(d.getMonth() + 1).padStart(2, '0');
                      const year = d.getFullYear();
                      value = `${day}/${month}/${year}`;
                  } else {
                      value = "Invalid Date";
                  }
              } else {
                  value = "-";
              }
              break;
            case "revert":
              value = "Revert";
              break;
          }

          if (key === "select") {
            component = (
              <TouchableOpacity
                key={key}
                style={{ width: visibleCols[key], alignItems: "center", justifyContent: "center" }}
                onPress={() => toggleSelectCase(item.id)}
              >
                <Ionicons
                  name={isSelected ? "checkbox" : "square-outline"}
                  size={20}
                  color={isSelected ? theme.success : theme.textSecondary}
                />
              </TouchableOpacity>
            );
          } else if (key === "revert") {
            component = (
              <TouchableOpacity
                key={key}
                style={[styles.iconActionBtn, { width: 36, height: 36, backgroundColor: theme.error + '15' }]}
                onPress={() => handleRevert(item.id)}
              >
                <Ionicons name="arrow-undo" size={18} color={theme.error} />
              </TouchableOpacity>
            );
          } else if (key === "manualAudit") {
            component = (
              <TouchableOpacity
                key={key}
                style={[styles.iconActionBtn, { width: 36, height: 36, backgroundColor: theme.info + '15' }]}
                onPress={() => navigation.navigate("AuditCaseScreen", { caseId: item.id, caseData: item, manualMode: true })}
              >
                <Ionicons name="create-outline" size={18} color={theme.info} />
              </TouchableOpacity>
            );
          } else if (key === "status") {
             const statusColor = 
                (item.status === "completed") ? theme.success : 
                (item.status === "audit") ? theme.info :
                item.status === "assigned" ? theme.warning : 
                (item.status === "reverted" || item.status === "fired") ? theme.error : 
                theme.textSecondary;
             
             if (item.status === "audit") {
               component = (
                  <TouchableOpacity 
                    key={key}
                    style={{ width: visibleCols[key], justifyContent: 'center', paddingRight: 5 }}
                    onPress={() => navigation.navigate("AuditCaseScreen", { caseId: item.id, caseData: item })}
                  >
                      <View style={[styles.statusPill, { backgroundColor: statusColor + '20', borderColor: statusColor, shadowColor: statusColor, shadowOpacity: 0.5, shadowRadius: 8, shadowOffset: {width: 0, height: 0} }]}>
                          <Text style={[styles.statusText, { color: statusColor, textShadowColor: statusColor, textShadowRadius: 5 }]}>
                              {value.toUpperCase()}
                          </Text>
                      </View>
                  </TouchableOpacity>
               );
             } else {
               component = (
                  <View key={key} style={{ width: visibleCols[key], justifyContent: 'center', paddingRight: 5 }}>
                      <View style={[styles.statusPill, { backgroundColor: statusColor + '20', borderColor: statusColor, shadowColor: statusColor, shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: {width: 0, height: 0} }]}>
                          <Text style={[styles.statusText, { color: statusColor }]}>
                              {value.toUpperCase()}
                          </Text>
                      </View>
                  </View>
               );
             }
          }

          if (component) return component;

          return (
            <Text
              key={key}
              style={[styles.cell, { width: visibleCols[key], color: theme.text }]}
              numberOfLines={key === 'number' ? 1 : 2}
              ellipsizeMode="tail"
              onPress={
                key === "select"
                  ? () => toggleSelectCase(item.id)
                  : key === "status" && item.status === "audit"
                  ? () => navigation.navigate("AuditCaseScreen", { caseId: item.id, caseData: item })
                  : undefined
              }
            >
              {value}
            </Text>
          );
        })}
      </View>
    );
  };

  const renderFilterRow = () => (
    <View style={[styles.filterRow, { borderBottomColor: theme.border, backgroundColor: isLightTheme ? "#F8FAFC" : "#1E293B" }]}>
        {Object.keys(visibleCols).map(key => {
            if (['select', 'number', 'revert', 'manualAudit'].includes(key)) {
                return <View key={key} style={{ width: visibleCols[key] }} />;
            }
            return (
                <View key={key} style={{ width: visibleCols[key], paddingHorizontal: 4 }}>
                    <TextInput
                        style={[styles.compactFilterInput, isCompactMobile && styles.compactFilterInputMobile, { backgroundColor: theme.background[0], color: theme.text, borderColor: theme.border }]}
                        placeholder={`Filter...`}
                        placeholderTextColor={theme.textSecondary}
                        value={headerFilters[key] || ''}
                        onChangeText={text => setHeaderFilters(prev => ({ ...prev, [key]: text }))}
                    />
                </View>
            );
        })}
    </View>
  );

  const renderActiveFiltersBar = () => {
    const filters = [];
    if (cityFilter) filters.push({ label: `City: ${cityFilter}`, clear: () => setCityFilter("") });
    if (statusFilter) filters.push({ label: `Status: ${statusFilter}`, clear: () => setStatusFilter("") });
    if (searchText) filters.push({ label: `Search: ${searchText}`, clear: () => setSearchText("") });
    if (dateInitiatedFilter) filters.push({ label: `Init: ${dateInitiatedFilter}`, clear: () => setDateInitiatedFilter("") });
    if (uploadDateFilter) filters.push({ label: `Upload: ${uploadDateFilter}`, clear: () => setUploadDateFilter("") });
    
    if (filters.length === 0) return null;

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: 'bold' }}>Active Filters:</Text>
            {filters.map((f, i) => (
                <TouchableOpacity key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.primary + '20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: theme.primary }} onPress={f.clear}>
                    <Text style={{ color: theme.primary, fontSize: 11, fontWeight: 'bold', marginRight: 4 }}>{f.label}</Text>
                    <Ionicons name="close-circle" size={14} color={theme.primary} />
                </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={clearAllFilters} style={{ marginLeft: 4 }}>
                <Text style={{ color: theme.error, fontSize: 11, fontWeight: 'bold', textDecorationLine: 'underline' }}>Clear All</Text>
            </TouchableOpacity>
        </View>
    );
  };

  if (maintenanceModeAdmin) {
    return (
      <View style={styles.maintenanceScreen}>
        <View style={styles.maintenanceAlertBox}>
          <Ionicons name="warning" size={60} color="#fff" style={{ marginBottom: 15 }} />
          <Text style={styles.maintenanceAlertTitle}>MAINTENANCE MODE ENABLED</Text>
          <Text style={styles.maintenanceAlertText}>Wait for some time or contact dev.</Text>
        </View>
      </View>
    );
  }

  return (
    <LinearGradient colors={theme.background} style={styles.container}>
      <BackgroundDecorations theme={theme} />
      <View style={{flex: 1, flexDirection: 'row'}}>
      
      {/* 1️⃣ SIDEBAR (Desktop) */}
      {IS_DESKTOP && (
        <BlurView intensity={80} tint={isLightTheme ? 'light' : 'dark'} style={[styles.sidebar, { width: isSidebarExpanded ? 240 : MINI_SIDEBAR_WIDTH, borderColor: theme.border, shadowColor: theme.primary, shadowOpacity: 0.15, shadowRadius: 25, zIndex: 20 }]}>
            <View style={[styles.sidebarHeader, !isSidebarExpanded && { alignItems: 'center' }]}>
                <TouchableOpacity onPress={() => setIsSidebarExpanded(!isSidebarExpanded)} style={{ marginBottom: isMobile ? 0 : 24 }}>
                    <Ionicons name="menu-outline" size={24} color={theme.textSecondary} />
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Image source={require("../assets/logo.png")} style={styles.sidebarLogoImage} />
                    {isSidebarExpanded && <Text style={[styles.sidebarTitle, { color: theme.text, textShadowColor: theme.primary, textShadowRadius: 10 }]}>SPACE SOLUTIONS</Text>}
                </View>
            </View>
            
            <ScrollView style={{flex: 1}}>
                {sidebarItems.map((item, idx) => (
                    <TouchableOpacity 
                        key={idx} 
                        style={[styles.sidebarItem, activeSidebarItem === item.label && { backgroundColor: theme.primary + '20' }, isSidebarExpanded && styles.sidebarItemExpanded]}
                        onPress={() => {
                            setActiveSidebarItem(item.label);
                            if(item.screen && item.screen !== "AdminPanel") navigation.navigate(item.screen);
                        }}
                    >
                        <Ionicons name={item.icon} size={20} color={activeSidebarItem === item.label ? theme.primary : theme.textSecondary} />
                        <Text style={[styles.sidebarItemText, { color: activeSidebarItem === item.label ? theme.primary : theme.textSecondary }, isSidebarExpanded && styles.sidebarItemTextExpanded]}>{item.label}</Text>
                        {activeSidebarItem === item.label && <View style={[styles.activeIndicator, { backgroundColor: theme.primary }]} />}
                    </TouchableOpacity>
                ))}
            </ScrollView>
            <View style={styles.sidebarFooter}>
                <TouchableOpacity onPress={() => setIsLightTheme(!isLightTheme)} style={styles.sidebarIcon}>
                    <Ionicons name={isLightTheme ? "moon-outline" : "sunny-outline"} size={18} color={theme.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => {
                    firebase.auth().signOut().then(() => logout());
                }}>
                    <Image 
                    source={{ uri: user?.photoURL || 'https://picsum.photos/id/11/60/60' }} 
                    style={styles.sidebarAvatar}
                    />
                </TouchableOpacity>
            </View>
        </BlurView>
      )}

      {/* Mobile Sidebar (Pushes Content) */}
      {!IS_DESKTOP && (
        <Animated.View style={[styles.sidebarMobile, { left: slideAnim, width: MENU_WIDTH, backgroundColor: theme.menuBg, borderColor: theme.border }]}>
            <View style={{ width: MENU_WIDTH, height: '100%' }}>
            <View style={styles.menuHeader}>
                <Ionicons name="cube" size={28} color={theme.primary} />
                <Text style={[styles.sidebarTitle, { color: theme.text }]}>Admin</Text>
            </View>
            
            <ScrollView style={{flex: 1}}>
                {sidebarItems.map((item, idx) => (
                    <TouchableOpacity 
                        key={idx} 
                        style={styles.menuItem}
                        onPress={() => { closeMenu(); navigation.navigate(item.screen); }}
                    >
                        <Ionicons name={item.icon} size={20} color={theme.textSecondary} />
                        <Text style={[styles.menuText, { color: theme.textSecondary, marginLeft: 12 }]}>{item.label}</Text>
                    </TouchableOpacity>
                ))}

                <TouchableOpacity style={[styles.menuItem, { marginTop: 20 }]} onPress={() => {
                    closeMenu(); 
                    firebase.auth().signOut().then(() => {
                      logout(); // This updates App.js state and switches to AuthStack
                    }).catch((error) => {
                      if (Platform.OS === 'web') alert("Error: Failed to log off: " + error.message);
                      else Alert.alert("Error", "Failed to log off: " + error.message);
                    });
                }}>
                    <Ionicons name="log-out-outline" size={20} color={theme.error} />
                    <Text style={[styles.menuText, { color: theme.error, marginLeft: 12 }]}>Log Off</Text>
                </TouchableOpacity>
            </ScrollView>
            </View>
        </Animated.View>
      )}

      {/* Upload Mode Modal (Web Support) */}
      {uploadModalVisible && (
        <View style={styles.webModalOverlay}>
          <View style={styles.webModalContent}>
            <Text style={styles.webModalTitle}>Upload Mode</Text>
            <Text style={styles.webModalText}>Choose how to process these cases:</Text>
            <View style={styles.webModalButtons}>
              <TouchableOpacity
                style={[styles.webModalButton, { backgroundColor: "#17a2b8" }]}
                onPress={() => {
                  setUploadModalVisible(false);
                  processExcelData(pendingUploadData, "manual");
                }}
              >
                <Text style={styles.webModalButtonText}>Manual</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.webModalButton, { backgroundColor: "#28a745" }]}
                onPress={() => {
                  setUploadModalVisible(false);
                  processExcelData(pendingUploadData, "automate");
                }}
              >
                <Text style={styles.webModalButtonText}>Automate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.webModalButton, { backgroundColor: "#dc3545" }]}
                onPress={() => {
                  setUploadModalVisible(false);
                  setPendingUploadData(null);
                }}
              >
                <Text style={styles.webModalButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* MAIN CONTENT AREA */}
      <View style={{ flex: 1, zIndex: 1, marginLeft: IS_DESKTOP ? (isSidebarExpanded ? 240 : MINI_SIDEBAR_WIDTH) : 0 }}>
        
        {/* Overlay to close menu when tapping content */}
        {!IS_DESKTOP && menuOpen && (
            <TouchableOpacity 
               style={styles.contentOverlay} 
               activeOpacity={1} 
               onPress={closeMenu} 
            />
        )}
        
        {/* 2️⃣ TOP NAV BAR */}
        <BlurView intensity={50} tint={isLightTheme ? 'light' : 'dark'} style={[styles.topBar, isMobile && styles.topBarMobile, { borderBottomColor: theme.border }]}>
          {!IS_DESKTOP && (
          <TouchableOpacity onPress={openMenu} style={styles.iconButton}>
            <Ionicons name="menu" size={24} color={theme.text} />
          </TouchableOpacity>
          )}
          
          <View style={[styles.topBarSearch, isMobile && styles.topBarSearchMobile, { backgroundColor: isLightTheme ? "#F1F5F9" : "#1E293B" }]}>
             <Ionicons name="search" size={18} color={theme.textSecondary} />
             <TextInput 
                placeholder="Search..." 
                placeholderTextColor={theme.textSecondary}
                value={searchText}
                onChangeText={setSearchText}
                style={{ flex: 1, marginLeft: 10, color: theme.text, height: '100%' }}
             />
          </View>

          {/* Top Actions: Upload & Assign */}
          <View style={[{ flexDirection: 'row', gap: 10, marginHorizontal: 10 }, isMobile && styles.topActionsRowMobile]}>
             <TouchableOpacity style={[styles.topActionButton, { backgroundColor: theme.primary }]} onPress={uploadExcel}>
                <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                <Text style={[styles.topActionButtonText, isMobile && styles.topActionButtonTextMobile]}>{isMobile ? "UPLOAD" : "BATCH_INGEST"}</Text>
             </TouchableOpacity>
             <TouchableOpacity 
                style={[styles.topActionButton, { backgroundColor: isLightTheme ? theme.cardBg : 'rgba(255,255,255,0.05)', borderColor: theme.border, borderWidth: 1 }]} 
                onPress={() => {
                    if (selectedCases.length === 0) {
                        if (Platform.OS === 'web') return alert("Please select at least one case to assign.");
                        return Alert.alert("Error", "Please select at least one case to assign.");
                    }
                    setAssignModalVisible(true);
                }}
             >
                <Ionicons name="person-add-outline" size={16} color={theme.text} />
                <Text style={[styles.topActionButtonText, isMobile && styles.topActionButtonTextMobile, { color: theme.text }]}>{isMobile ? "ASSIGN" : "ASSIGN_LINK"}</Text>
             </TouchableOpacity>

             {/* 🎤 SPACE_ADMIN AI MIC BUTTON */}
             <TouchableOpacity 
                style={[styles.iconButton, { backgroundColor: voiceModalVisible ? theme.primary : 'transparent', borderColor: theme.primary, borderWidth: 1, width: 40, height: 40, borderRadius: 20 }]}
                onPress={() => setVoiceModalVisible(true)}
             >
                <Ionicons name="mic" size={20} color={voiceModalVisible ? "#fff" : theme.primary} />
             </TouchableOpacity>
             {isMobile && (
               <TouchableOpacity
                 onPress={handleReverseLastUpload}
                 style={[
                   styles.iconButton,
                   {
                     backgroundColor: lastUploadBatch.count > 0 ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.05)',
                     borderColor: '#ef4444',
                     borderWidth: 1,
                   },
                 ]}
               >
                 <Ionicons name="arrow-undo-outline" size={19} color={lastUploadBatch.count > 0 ? "#ef4444" : theme.textSecondary} />
               </TouchableOpacity>
             )}
             {isMobile && (
               <TouchableOpacity onPress={() => setIsLightTheme(!isLightTheme)} style={[styles.iconButton, { backgroundColor: isLightTheme ? theme.border : 'rgba(255,255,255,0.05)' }]}>
                 <Ionicons name={isLightTheme ? "moon-outline" : "sunny-outline"} size={20} color={theme.text} />
               </TouchableOpacity>
             )}
             {isMobile && (
               <TouchableOpacity onPress={() => setShowNotifications(true)} style={[styles.iconButton, { backgroundColor: isLightTheme ? theme.border : 'rgba(255,255,255,0.05)' }]}>
                 <Ionicons name="notifications-outline" size={20} color={theme.text} />
                 {notifications.length > 0 && <View style={[styles.badge, { backgroundColor: theme.primary }]} />}
               </TouchableOpacity>
             )}
          </View>

          {IS_DESKTOP && <View style={{ height: 24, width: 1, backgroundColor: theme.border, marginHorizontal: 12 }} />}

          {IS_DESKTOP && <View style={styles.topBarActions}>
             <TouchableOpacity
               onPress={handleReverseLastUpload}
               style={[
                 styles.iconButton,
                 {
                   backgroundColor: lastUploadBatch.count > 0 ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.05)',
                   borderColor: '#ef4444',
                   borderWidth: 1,
                 },
               ]}
             >
                <Ionicons name="arrow-undo-outline" size={20} color={lastUploadBatch.count > 0 ? "#ef4444" : theme.textSecondary} />
             </TouchableOpacity>
             <TouchableOpacity onPress={() => setIsLightTheme(!isLightTheme)} style={[styles.iconButton, { backgroundColor: isLightTheme ? theme.border : 'rgba(255,255,255,0.05)' }]}>
                <Ionicons name={isLightTheme ? "moon-outline" : "sunny-outline"} size={20} color={theme.text} />
             </TouchableOpacity>
             <TouchableOpacity onPress={() => setShowNotifications(true)} style={[styles.iconButton, { backgroundColor: isLightTheme ? theme.border : 'rgba(255,255,255,0.05)' }]}>
                <Ionicons name="notifications-outline" size={20} color={theme.text} />
                {notifications.length > 0 && <View style={[styles.badge, { backgroundColor: theme.primary }]} />}
             </TouchableOpacity>
          </View>}
        </BlurView>

        <ScrollView contentContainerStyle={{ padding: contentPadding, paddingBottom: isMobile ? 72 : 100 }}>
            <View style={[styles.pageHeader, isMobile && styles.pageHeaderMobile]}>
              <View>
                <Text style={[styles.pageTitle, isMobile && styles.pageTitleMobile, { color: theme.text, textShadowColor: theme.primary, textShadowRadius: 20, textShadowOffset: {width: 0, height: 0} }]}>SPACE_COMMAND</Text>
                <View style={styles.pageSubtitleContainer}>
                  <BlinkingDot color={theme.success} />
                  <Text style={styles.pageSubtitle}>PIPELINE_OPS // ENCRYPTED_STREAM_ACTIVE</Text>
                </View>
              </View>
              <View style={[{ flexDirection: 'row', gap: 24 }, isMobile && styles.pageStatsRowMobile]}>
                <View style={[{ alignItems: 'flex-end', borderRightWidth: 1, borderRightColor: theme.border, paddingRight: 24 }, isMobile && { alignItems: 'flex-start', borderRightWidth: 0, paddingRight: 0 }]}>
                  <Text style={styles.headerStatLabel}>UPLINK_STABILITY</Text>
                  <Text style={[styles.headerStatValue, {color: theme.text, textShadowColor: theme.primary, textShadowRadius: 10}]}>99.98<Text style={{fontSize: 18, opacity: 0.4}}>%</Text></Text>
                </View>
                <View style={[{ alignItems: 'flex-end' }, isMobile && { alignItems: 'flex-start' }]}>
                  <Text style={styles.headerStatLabel}>SYNC_LATENCY</Text>
                  <Text style={[styles.headerStatValue, {color: theme.success, textShadowColor: theme.success, textShadowRadius: 10}]}>04<Text style={{fontSize: 18, opacity: 0.4}}>ms</Text></Text>
                </View>
              </View>
              <TouchableOpacity 
                  style={[styles.dynamicsButton, isMobile && styles.dynamicsButtonMobile, { borderColor: theme.border }, insightsOpen && { backgroundColor: theme.primary + '20', borderColor: theme.primary + '50' }]}
                  onPress={() => setInsightsOpen(!insightsOpen)}
              >
                  <Ionicons name="analytics-outline" size={16} color={insightsOpen ? theme.primary : theme.textSecondary} />
                  <Text style={[styles.dynamicsButtonText, { color: insightsOpen ? theme.primary : theme.textSecondary }]}>
                      {insightsOpen ? 'HIDE_DYNAMICS' : 'VIEW_DYNAMICS'}
                  </Text>
                  <Ionicons name={insightsOpen ? "chevron-up" : "chevron-down"} size={14} color={insightsOpen ? theme.primary : theme.textSecondary} />
              </TouchableOpacity>
            </View>
            {/* Insights Chart */}
            {insightsOpen && chartData && (
              <BlurView intensity={30} tint={isLightTheme ? 'light' : 'dark'} style={[styles.chartCard, isMobile && styles.chartCardMobile, { borderColor: theme.border, shadowColor: theme.primary, shadowOpacity: 0.2, shadowRadius: 30 }]}>
                <CyberCorner theme={theme} color={theme.primary} />
                {chartData.legend && (
                <View style={{flexDirection: 'row', justifyContent: 'center', gap: 24, marginBottom: isMobile ? 0 : 20}}>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                        <View style={{width: 12, height: 12, borderRadius: 6, backgroundColor: theme.success, shadowColor: theme.success, shadowRadius: 8, shadowOpacity: 0.8}} />
                        <Text style={{color: theme.textSecondary, fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase'}}>{chartData.legend[0]}</Text>
                    </View>
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                        <View style={{width: 12, height: 12, borderRadius: 6, backgroundColor: theme.warning, shadowColor: theme.warning, shadowRadius: 8, shadowOpacity: 0.8}} />
                        <Text style={{color: theme.textSecondary, fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase'}}>{chartData.legend[1]}</Text>
                    </View>
                </View>
                )}
                <LineChart
                  data={chartData}
                  width={chartWidth}
                  height={220}
                  yAxisInterval={1}
                  chartConfig={{
                    backgroundColor: theme.primary,
                    backgroundGradientFrom: theme.cardBg,
                    backgroundGradientTo: theme.background[1],
                    decimalPlaces: 0,
                    color: (opacity = 1) => theme.textSecondary,
                    labelColor: (opacity = 1) => theme.textSecondary,
                    propsForDots: { r: "4", strokeWidth: "2", stroke: theme.primary },
                  }}
                  style={{ marginLeft: isMobile ? 0 : -30 }}
                />
              </BlurView>
            )}
            
            {/* 3️⃣ METRIC CARDS */}
            <View style={[styles.metricsGrid, isMobile && styles.metricsGridSingleLine]}>
              <StatCard label={isMobile ? "TOTAL" : "TOTAL CASES"} value={assignedTL} icon="layers-outline" color={theme.primary} />
              <StatCard label={isMobile ? "ASSIGN" : "ASSIGNED"} value={assignedFE} icon="person-outline" color={theme.warning} />
              <StatCard label={isMobile ? "REVERT" : "REVERTED"} value={reverted} icon="arrow-undo-outline" color={theme.error} />
              <StatCard label={isMobile ? "AUDIT" : "AUDIT"} value={audited} icon="eye-outline" color={theme.info} />
              <StatCard label={isMobile ? "DONE" : "COMPLETED"} value={completed} icon="checkmark-circle-outline" color={theme.success} />
            </View>

            {/* 5️⃣ DATA TABLE SECTION */}
            <View style={[styles.sectionCard, isCompactMobile && styles.sectionCardMobile, { backgroundColor: theme.cardBg, borderColor: theme.border, marginTop: isCompactMobile ? 14 : 24, padding: 0, overflow: 'hidden', shadowColor: theme.primary, shadowOpacity: 0.1, shadowRadius: 20 }]}>
                <View style={[styles.sectionHeader, isCompactMobile && styles.sectionHeaderMobile, { padding: isCompactMobile ? 10 : 16, borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                    <Text style={[styles.sectionTitle, isCompactMobile && styles.sectionTitleMobile, { color: theme.text }]}>All Cases</Text>
                    
                    <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: isMobile ? 'wrap' : 'nowrap', justifyContent: isMobile ? 'flex-end' : 'flex-start'}}>
                        <Text style={{color: theme.textSecondary, fontSize: 12}}>Assign Mode</Text>
                        <Switch 
                            value={assignMode} 
                            onValueChange={setAssignMode}
                            trackColor={{ false: "#767577", true: theme.primary }}
                        />
                    <TouchableOpacity 
                        style={[styles.filterBtnSmall, { borderColor: theme.border }]}
                        onPress={() => setShowHeaderFilters(!showHeaderFilters)}
                    >
                        <Ionicons name={showHeaderFilters ? "funnel" : "funnel-outline"} size={12} color={theme.textSecondary} style={{ marginRight: 4 }} />
                        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{showHeaderFilters ? (isMobile ? "Hide Filters" : "Hide Column Filters") : (isMobile ? "Show Filters" : "Show Column Filters")}</Text>
                    </TouchableOpacity>
                    </View>
                </View>

                {/* Search & Filters Toolbar */}
                <ScrollView
                    horizontal={isMobile}
                    showsHorizontalScrollIndicator={isMobile}
                    contentContainerStyle={[styles.tableToolbar, isCompactMobile && styles.tableToolbarMobile]}
                >
                    <View style={[styles.pickerContainer, isCompactMobile && styles.pickerContainerMobile, { backgroundColor: isLightTheme ? "#F8FAFC" : "#1E293B", borderColor: theme.border }]}>
                        <Picker key={isLightTheme ? 'light-city' : 'dark-city'} selectedValue={cityFilter} onValueChange={setCityFilter} style={[styles.picker, { color: theme.text }]} dropdownIconColor={theme.text}>
                            <Picker.Item label="City: All" value="" color="#000" style={{fontSize: 12}} />
                            {uniqueCities.map(city => (
                                <Picker.Item key={city} label={city} value={city} color="#000" style={{fontSize: 12}} />
                            ))}
                        </Picker>
                    </View>
                    <View style={[styles.pickerContainer, isCompactMobile && styles.pickerContainerMobile, { backgroundColor: isLightTheme ? "#F8FAFC" : "#1E293B", borderColor: theme.border }]}>
                        <Picker key={isLightTheme ? 'light-status' : 'dark-status'} selectedValue={statusFilter} onValueChange={setStatusFilter} style={[styles.picker, { color: theme.text }]} dropdownIconColor={theme.text}>
                            <Picker.Item label="Status: All" value="" color="#000" style={{fontSize: 12}} />
                            <Picker.Item label="Assigned" value="assigned" color="#000" style={{fontSize: 12}} />
                            <Picker.Item label="Audit" value="audit" color="#000" style={{fontSize: 12}} />
                            <Picker.Item label="Reverted" value="reverted" color="#000" style={{fontSize: 12}} />
                            <Picker.Item label="Fired" value="fired" color="#000" style={{fontSize: 12}} />
                        </Picker>
                    </View>
                    
                    {/* Date Initiated Filter */}
                    <View style={[styles.pickerContainer, isCompactMobile && styles.pickerContainerMobile, { backgroundColor: isLightTheme ? "#F8FAFC" : "#1E293B", borderColor: theme.border, minWidth: isCompactMobile ? 145 : 170, justifyContent: 'center' }]}>
                        {Platform.OS === 'web' ? (
                            <View style={{ paddingHorizontal: 10, width: '100%', flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={{color: theme.textSecondary, fontSize: 12, marginRight: 4}}>Init:</Text>
                                {createElement('input', {
                                    type: 'date',
                                    value: dateInitiatedFilter || '',
                                    onChange: (e) => {
                                        setDateInitiatedFilter(e.target.value);
                                    },
                                    style: {
                                        border: 'none',
                                        backgroundColor: 'transparent',
                                        color: theme.text,
                                        fontFamily: 'inherit',
                                        fontSize: 12,
                                        flex: 1,
                                        outline: 'none',
                                        minWidth: 0
                                    }
                                })}
                            </View>
                        ) : (
                            <TouchableOpacity onPress={() => setShowDatePicker(true)} style={{ paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={{ color: theme.text, fontSize: 12 }}>
                                    {dateInitiatedFilter || "Init Date"}
                                </Text>
                                {dateInitiatedFilter ? (
                                    <TouchableOpacity onPress={() => setDateInitiatedFilter("")} style={{ marginLeft: 5 }}>
                                        <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
                                    </TouchableOpacity>
                                ) : (
                                    <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
                                )}
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Upload Date Filter (Ingested At) */}
                    <View style={[styles.pickerContainer, isCompactMobile && styles.pickerContainerMobile, { backgroundColor: isLightTheme ? "#F8FAFC" : "#1E293B", borderColor: theme.border, minWidth: isCompactMobile ? 145 : 170, justifyContent: 'center' }]}>
                        {Platform.OS === 'web' ? (
                            <View style={{ paddingHorizontal: 10, width: '100%', flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={{color: theme.textSecondary, fontSize: 12, marginRight: 4}}>Upload:</Text>
                                {createElement('input', {
                                    type: 'date',
                                    value: uploadDateFilter || '',
                                    onChange: (e) => {
                                        setUploadDateFilter(e.target.value);
                                    },
                                    style: {
                                        border: 'none',
                                        backgroundColor: 'transparent',
                                        color: theme.text,
                                        fontFamily: 'inherit',
                                        fontSize: 12,
                                        flex: 1,
                                        outline: 'none',
                                        minWidth: 0
                                    }
                                })}
                            </View>
                        ) : (
                            <TouchableOpacity onPress={() => setShowUploadDatePicker(true)} style={{ paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={{ color: theme.text, fontSize: 12 }}>
                                    {uploadDateFilter || "Upload Date"}
                                </Text>
                                {uploadDateFilter ? (
                                    <TouchableOpacity onPress={() => setUploadDateFilter("")} style={{ marginLeft: 5 }}>
                                        <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
                                    </TouchableOpacity>
                                ) : (
                                    <Ionicons name="cloud-upload-outline" size={16} color={theme.textSecondary} />
                                )}
                            </TouchableOpacity>
                        )}
                    </View>
                </ScrollView>
                {renderActiveFiltersBar()}

                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                    <View style={{ width: Object.values(visibleCols).reduce((a, b) => a + b, 0) }}>
                        <View style={[styles.tableHeader, isCompactMobile && styles.tableHeaderMobile, { borderBottomColor: theme.border, backgroundColor: isLightTheme ? "#F1F5F9" : "#0F172A" }]}>
                        {Object.keys(visibleCols).map((key) => (
                            key === 'select' && cityFilter ? (
                                <TouchableOpacity key={key} onPress={handleSelectAll} style={{ width: visibleCols[key], alignItems: 'center' }}>
                                    <Ionicons name={selectedCases.length > 0 && fullyFilteredCases.every(c => selectedCases.includes(c.id)) ? "checkbox" : "square-outline"} size={18} color={theme.primary} />
                                </TouchableOpacity>
                            ) :
                            <Text key={key} style={[styles.headerCell, isCompactMobile && styles.headerCellMobile, { width: visibleCols[key], color: theme.textSecondary }]}>{key === "number" ? "#" : key}</Text>
                        ))}
                        </View>
                        {showHeaderFilters && renderFilterRow()}
                        <ScrollView style={{ maxHeight: isCompactMobile ? 420 : 600, minHeight: 100 }} nestedScrollEnabled={true}>
                          {fullyFilteredCases.length > 0 ? (
                            fullyFilteredCases.map((item, index) => (
                                <View key={item.id}>
                                {renderCase({ item, index })}
                                </View>
                            ))
                          ) : (
                            <View style={{ padding: 40, alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="filter-circle-outline" size={48} color={theme.textSecondary} style={{ opacity: 0.5 }} />
                                <Text style={{ color: theme.textSecondary, marginTop: 10, fontSize: 14 }}>No cases match current filters.</Text>
                                <TouchableOpacity onPress={clearAllFilters} style={{ marginTop: 10, padding: 8, backgroundColor: theme.primary + '20', borderRadius: 8 }}>
                                    <Text style={{ color: theme.primary, fontWeight: 'bold', fontSize: 12 }}>Reset Filters</Text>
                                </TouchableOpacity>
                            </View>
                          )}
                        </ScrollView>
                    </View>
                </ScrollView>
            </View>

            {showDatePicker && Platform.OS !== 'web' && (
                <DateTimePicker
                    value={(() => {
                        if (!dateInitiatedFilter) return new Date();
                        const [y, m, d] = dateInitiatedFilter.split('-').map(Number);
                        return new Date(y, m - 1, d);
                    })()}
                    mode="date"
                    display="default"
                    onChange={handleDateChange}
                />
            )}

            {showUploadDatePicker && Platform.OS !== 'web' && (
                <DateTimePicker
                    value={(() => {
                        if (!uploadDateFilter) return new Date();
                        const [y, m, d] = uploadDateFilter.split('-').map(Number);
                        return new Date(y, m - 1, d);
                    })()}
                    mode="date"
                    display="default"
                    onChange={handleUploadDateChange}
                />
            )}

            {/* Footer */}
            <BlurView intensity={50} tint={isLightTheme ? 'light' : 'dark'} style={[styles.footer, { borderTopColor: theme.border }]}>
              <View style={styles.footerSection}>
                <Text style={styles.footerLabel}>NEON_KERNEL_V6.0_STABLE</Text>
              </View>
              <View style={{height: 16, width: 1, backgroundColor: theme.border}} />
              <View style={styles.footerSection}>
                <View style={[styles.footerIndicator, {backgroundColor: theme.success, shadowColor: theme.success}]} />
                <Text style={[styles.footerText, {color: theme.success}]}>GATEWAY_STABLE</Text>
              </View>
              <View style={{flex: 1}} />
              <View style={styles.footerSection}>
                <Text style={[styles.footerText, {color: theme.primary}]}>{new Date().toLocaleDateString()} // {new Date().toLocaleTimeString()} UTC</Text>
              </View>
            </BlurView>
        </ScrollView>
      </View>
      </View>

      {/* In-App Alert for Audit Submission */}
      {auditAlert && (
        <View style={styles.toastContainer}>
          <LinearGradient
            colors={["#00C851", "#007E33"]}
            style={styles.toastContent}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name="notifications-circle" size={34} color="#fff" style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.toastTitle}>Case Submitted for Audit!</Text>
              <Text style={styles.toastText}>
                {auditAlert.refNo} by {auditAlert.memberName}
              </Text>
            </View>
          </LinearGradient>
        </View>
      )}

      <Modal
        visible={devAlertVisible && !!devBroadcastAlert}
        transparent={true}
        animationType="fade"
        onRequestClose={acknowledgeDevAlert}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.alertBoxDev, {
            borderColor:
              String(devBroadcastAlert?.severity || "").toLowerCase() === "critical"
                ? "#dc2626"
                : String(devBroadcastAlert?.severity || "").toLowerCase() === "warning"
                ? "#f59e0b"
                : String(devBroadcastAlert?.severity || "").toLowerCase() === "appreciation"
                ? "#16a34a"
                : theme.primary
          }]}>
            <Ionicons
              name={
                String(devBroadcastAlert?.severity || "").toLowerCase() === "critical"
                  ? "alert-circle"
                  : String(devBroadcastAlert?.severity || "").toLowerCase() === "appreciation"
                  ? "trophy"
                  : "warning"
              }
              size={42}
              color={
                String(devBroadcastAlert?.severity || "").toLowerCase() === "critical"
                  ? "#dc2626"
                  : String(devBroadcastAlert?.severity || "").toLowerCase() === "warning"
                  ? "#f59e0b"
                  : String(devBroadcastAlert?.severity || "").toLowerCase() === "appreciation"
                  ? "#16a34a"
                  : theme.primary
              }
            />
            <Text style={styles.alertBoxDevTitle}>DEV ALERT</Text>
            <Text style={styles.alertBoxDevSeverity}>{String(devBroadcastAlert?.severity || "info").toUpperCase()}</Text>
            <Text style={styles.alertBoxDevMessage}>{devBroadcastAlert?.message}</Text>
            <TouchableOpacity style={styles.alertBoxDevBtn} onPress={acknowledgeDevAlert}>
              <Text style={styles.alertBoxDevBtnText}>Acknowledge</Text>
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

      {/* Notifications Modal */}
      <Modal
        visible={showNotifications}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowNotifications(false)}
      >
        <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setShowNotifications(false)}
        >
            <BlurView intensity={90} tint={isLightTheme ? 'light' : 'dark'} style={[styles.notificationDropdown, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
                <View style={[styles.notificationHeader, { borderBottomColor: theme.border }]}>
                    <Text style={[styles.notificationTitle, { color: theme.text }]}>Notifications</Text>
                    <TouchableOpacity onPress={() => setNotifications([])}>
                        <Text style={{ color: theme.primary, fontSize: 12 }}>Clear All</Text>
                    </TouchableOpacity>
                </View>
                <ScrollView style={{ maxHeight: 300 }}>
                    {notifications.length === 0 ? (
                        <Text style={{ padding: 20, textAlign: 'center', color: theme.textSecondary }}>No new notifications</Text>
                    ) : (
                        notifications.map((notif, index) => (
                            <View key={index} style={[styles.notificationItem, { borderBottomColor: theme.border }]}>
                                <View style={[styles.notificationIcon, { backgroundColor: theme.primary + '20' }]}>
                                    <Ionicons name="notifications" size={16} color={theme.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.notificationItemTitle, { color: theme.text }]}>{notif.title}</Text>
                                    <Text style={[styles.notificationItemMessage, { color: theme.textSecondary }]}>{notif.message}</Text>
                                    <Text style={[styles.notificationItemTime, { color: theme.textSecondary }]}>{notif.time}</Text>
                                </View>
                            </View>
                        ))
                    )}
                </ScrollView>
            </BlurView>
        </TouchableOpacity>
      </Modal>

      {/* Assign Member Modal */}
      <Modal
        visible={assignModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setAssignModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <LinearGradient
            colors={['#4e0360', '#302b63']}
            style={styles.assignModalContent}
          >
            <Text style={styles.modalTitle}>Assign to Member</Text>
            
            <View style={styles.modalSearchContainer}>
                <Ionicons name="search" size={20} color="#ccc" style={{marginRight: 8}}/>
                <TextInput 
                    style={styles.modalSearchInput}
                    placeholder="Search member..."
                    placeholderTextColor="#aaa"
                    value={assignSearchText}
                    onChangeText={setAssignSearchText}
                />
            </View>

            <ScrollView style={styles.memberList}>
              {sortedMembers.filter(m => (m.name || "").toLowerCase().includes(assignSearchText.toLowerCase()) || (m.uniqueId || "").toLowerCase().includes(assignSearchText.toLowerCase())).map(member => (
                <TouchableOpacity
                  key={member.id}
                  style={[
                    styles.memberItem,
                    assignTo === member.id && styles.memberItemSelected
                  ]}
                  onPress={() => setAssignTo(member.id)}
                >
                  <Text style={styles.memberItemText}>{member.name} ({member.uniqueId || 'N/A'})</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setAssignModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmAssignButton, !assignTo && { opacity: 0.5 }]}
                onPress={assignCases}
                disabled={!assignTo}
              >
                <Text style={styles.modalButtonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </Modal>

      {/* SPACE_ADMIN AI MODAL */}
      <Modal
        visible={voiceModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setVoiceModalVisible(false)}
      >
        <View style={styles.voiceOverlay}>
            <BlurView intensity={100} tint="dark" style={styles.voiceCard}>
                <View style={styles.voiceHeader}>
                    <Ionicons name="construct" size={32} color={theme.warning} />
                    <Text style={[styles.voiceTitle, { color: theme.warning }]}>UNDER DEVELOPMENT</Text>
                </View>
                <Text style={[styles.voiceStatus, { color: theme.text }]}>Space Admin AI is currently being upgraded.</Text>
                <View style={{ alignItems: 'center', marginVertical: 20 }}>
                    <Ionicons name="planet" size={80} color={theme.textSecondary} style={{ opacity: 0.2 }} />
                    <Text style={{ color: theme.textSecondary, marginTop: 15, textAlign: 'center' }}>Voice command modules are offline for maintenance.</Text>
                </View>
                <TouchableOpacity onPress={() => setVoiceModalVisible(false)} style={[styles.voiceClose, { marginTop: 0 }]}>
                    <Ionicons name="close-circle-outline" size={40} color={theme.text} />
                </TouchableOpacity>
            </BlurView>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  maintenanceScreen: { flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" },
  maintenanceAlertBox: { padding: 20, backgroundColor: "#333", borderRadius: 10, alignItems: "center" },
  maintenanceAlertTitle: { color: "#ff4444", fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  webModalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", zIndex: 200 },
  webModalContent: { width: 400, backgroundColor: "#fff", borderRadius: 10, padding: 20, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  webModalTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 10 },
  webModalText: { fontSize: 16, marginBottom: 20 },
  webModalButtons: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  webModalButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 5 },
  webModalButtonText: { color: "#fff", fontWeight: "bold" },
  iconButton: { padding: 8 },

  glow1: { position: 'absolute', top: '-20%', left: '-10%', width: 1000, height: 1000, borderRadius: 500, backgroundColor: 'rgba(34, 211, 238, 0.08)', opacity: 0.7 },
  glow2: { position: 'absolute', bottom: '-10%', right: '-10%', width: 800, height: 800, borderRadius: 400, backgroundColor: 'rgba(59, 130, 246, 0.16)', opacity: 0.7 },
  glow3: { position: 'absolute', top: '30%', left: '28%', width: 600, height: 600, borderRadius: 300, backgroundColor: 'rgba(16, 185, 129, 0.06)', opacity: 0.45 },
  spaceGrid: {
    ...StyleSheet.absoluteFillObject,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: 'rgba(147, 197, 253, 0.07)',
  },
  starPoint: {
    position: 'absolute',
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#dbeafe',
  },
  cyberCorner: { position: 'absolute', width: 15, height: 15, pointerEvents: 'none' },
  cyberCornerTopLeft: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
  cyberCornerBottomRight: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
  
  // Sidebar
  sidebar: { width: MINI_SIDEBAR_WIDTH, height: '100%', borderRightWidth: 1, alignItems: 'center', paddingVertical: 32 },
  sidebarHeader: { marginBottom: 48 },
  sidebarLogoImage: { width: 40, height: 40, resizeMode: 'contain' },
  sidebarLogo: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: '#8B5CF6', shadowRadius: 20, shadowOpacity: 0.4 },
  sidebarItem: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, marginBottom: 16, position: 'relative' },
  sidebarItemExpanded: {
    width: 220,
    justifyContent: 'flex-start',
    paddingHorizontal: 12,
  },
  sidebarItemText: { display: 'none' }, // Icon only
  sidebarItemTextExpanded: {
    display: 'flex',
    marginLeft: 15,
    fontWeight: '600',
    fontSize: 14,
  },
  activeIndicator: { position: 'absolute', right: 0, width: 4, height: 24, borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  sidebarFooter: { marginTop: 'auto', gap: 24 },
  sidebarIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  sidebarAvatar: { width: 40, height: 40, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(139, 92, 246, 0.3)' },
  
  sidebarMobile: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: MENU_WIDTH, zIndex: 100,
    borderRightWidth: 1, paddingVertical: 20,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, elevation: 10
  },
  menuHeader: { paddingHorizontal: 24, marginBottom: 20, flexDirection: "row", alignItems: "center" },
  menuItem: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 24, borderRadius: 8, marginHorizontal: 8 },
  menuText: { fontSize: 15, fontWeight: "500" },

  // Page Header
  pageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40, flexWrap: 'wrap', gap: 12 },
  pageHeaderMobile: { marginBottom: 20, alignItems: 'flex-start' },
  pageStatsRowMobile: { width: '100%', justifyContent: 'space-between', gap: 8 },
  pageTitle: { fontSize: 40, fontWeight: '900', fontStyle: 'italic', letterSpacing: -2 },
  pageTitleMobile: { fontSize: 28, letterSpacing: -1 },
  pageSubtitleContainer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  pageSubtitle: { color: '#94A3B8', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', letterSpacing: 6, textTransform: 'uppercase' },
  headerStatLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 3, opacity: 0.4, marginBottom: 6 },
  headerStatValue: { fontSize: 32, fontWeight: '900', fontStyle: 'italic', letterSpacing: -1 },

  // Chart
  chartCard: { padding: 40, borderRadius: 40, borderWidth: 1, minHeight: 320, overflow: 'hidden', marginBottom: 40 },
  chartCardMobile: { padding: 12, borderRadius: 18, minHeight: 280, marginBottom: 20 },

  contentOverlay: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 999,
    backgroundColor: 'transparent'
  },

  // Top Bar
  topBar: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderBottomWidth: 1,
    flexWrap: 'wrap',
    rowGap: 10,
  },
  topBarMobile: { paddingHorizontal: 12, marginTop: Platform.OS === 'ios' ? 8 : 6 },
  topBarSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    flex: 1,
    minWidth: 140,
    maxWidth: 360,
  },
  topBarSearchMobile: { width: '100%', maxWidth: '100%' },
  topActionsRowMobile: { width: '100%', marginHorizontal: 0, justifyContent: 'space-between', flexWrap: 'wrap' },
  topActionButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, gap: 8 },
  topActionButtonText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.3 },
  topActionButtonTextMobile: { letterSpacing: 0.6, fontSize: 10 },
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { position: 'absolute', top: 8, right: 8, width: 6, height: 6, borderRadius: 3, borderWidth: 1, borderColor: '#020617' },

  // Metrics
  statCardTouchable: { flex: 1, minWidth: 180 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginBottom: 24 },
  metricsGridMobile: { gap: 10, marginBottom: 14, flexDirection: "row", flexWrap: "nowrap" },
  metricsGridSingleLine: { gap: 6, marginBottom: 12, flexDirection: "row", flexWrap: "nowrap", justifyContent: "space-between" },
  metricsRowScroll: { gap: 10, paddingVertical: 4, paddingRight: 4, marginBottom: 14 },
  statCard: {
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    flex: 1,
    minWidth: 180,
    shadowOpacity: 0.2,
    shadowRadius: 40,
    elevation: 12,
  },
  statCardMobile: { borderRadius: 18, padding: 12, minWidth: 0 },
  statCardLineMobile: { borderRadius: 12, padding: 8 },
  statCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  statCardHeaderMobile: { marginBottom: 4 },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statIconContainerMobile: { width: 24, height: 24, borderRadius: 8, borderWidth: 0.6 },
  statValue: { fontSize: 24, fontWeight: '800' },
  statValueMobile: { fontSize: 12, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5 },
  statLabelMobile: { fontSize: 8, letterSpacing: 0.2 },
  
  // Table Section
  sectionCard: { borderRadius: 48, borderWidth: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  sectionCardMobile: { borderRadius: 18 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionHeaderMobile: { marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  sectionTitleMobile: { fontSize: 14 },
  filterBtnSmall: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  tableToolbar: { flexDirection: 'row', padding: 16, gap: 12, flexWrap: 'wrap' },
  tableToolbarMobile: { padding: 10, gap: 8, flexWrap: 'nowrap', alignItems: 'center' },
  betaToolbar: { marginBottom: 10, padding: 10, backgroundColor: "rgba(100,0,200,0.2)", borderRadius: 8 },
  betaLabel: { color: "#c471ed", fontSize: 10, fontWeight: "bold", marginBottom: 5 },
  betaButton: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.1)", padding: 8, borderRadius: 5, marginRight: 10 },
  betaButtonText: { color: "#fff", fontSize: 12, marginLeft: 5 },
  uploadAssignRow: { flexDirection: "row", justifyContent: "flex-start", marginBottom: 10, gap: 10 },
  searchFilter: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 10, flexWrap: "wrap" },
  searchContainer: { flexDirection: "row", alignItems: "center", borderRadius: 8, paddingHorizontal: 12, height: 36, flex: 1, minWidth: 120, borderWidth: 1 },
  tableHeader: { flexDirection: "row", borderBottomWidth: 1, paddingVertical: 12, paddingHorizontal: 8 },
  tableHeaderMobile: { paddingVertical: 8, paddingHorizontal: 6 },
  filterRow: { flexDirection: "row", borderBottomWidth: 1, paddingVertical: 8, paddingHorizontal: 8 },
  compactFilterInput: { fontSize: 11, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, height: 28 },
  compactFilterInputMobile: { fontSize: 10, height: 24, paddingVertical: 2, paddingHorizontal: 6 },
  cell: { paddingHorizontal: 12, fontSize: 13, fontWeight: "400" },
  cellMobile: { paddingHorizontal: 8, fontSize: 11 },
  headerCell: { fontWeight: "600", textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 },
  headerCellMobile: { fontSize: 9, letterSpacing: 0.2 },
  caseRow: { flexDirection: "row", borderBottomWidth: 1, paddingVertical: 8, alignItems: "center", paddingHorizontal: 8 },
  caseRowMobile: { paddingVertical: 6, paddingHorizontal: 6 },
  iconActionBtn: { borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginHorizontal: 2 },
  
  assigneeCell: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  assigneeAvatar: { width: 24, height: 24, borderRadius: 12, marginRight: 6 },
  assigneeAvatarPlaceholder: {
    width: 24, height: 24, borderRadius: 12, marginRight: 6,
    justifyContent: 'center', alignItems: 'center',
  },
  assigneeAvatarText: { fontSize: 10, fontWeight: 'bold' },

  statusPill: { borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '700', textAlign: 'center', textTransform: 'uppercase' },

  // Footer
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 40, borderTopWidth: 1 },
  footerSection: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  footerLabel: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 6, opacity: 0.4, fontStyle: 'italic' },
  footerIndicator: { width: 10, height: 10, borderRadius: 5, shadowRadius: 15, shadowOpacity: 1 },
  footerText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 3 },

  // Misc
  searchInput: { flex: 1, fontSize: 13, height: "100%" },
  toastContainer: { position: "absolute", bottom: 20, left: 20, right: 20, alignItems: "center" },
  toastContent: { flexDirection: "row", alignItems: "center", padding: 15, borderRadius: 10, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 5, elevation: 5, width: "100%", maxWidth: 400 },
  toastTitle: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  toastText: { color: "#fff", fontSize: 14 },
  alertBoxDev: { width: "86%", maxWidth: 420, backgroundColor: "#fff", borderRadius: 14, padding: 20, borderWidth: 2, alignItems: "center" },
  alertBoxDevTitle: { marginTop: 8, fontSize: 20, fontWeight: "bold", color: "#111827" },
  alertBoxDevSeverity: { fontSize: 12, fontWeight: "700", letterSpacing: 1, color: "#6b7280", marginTop: 4 },
  alertBoxDevMessage: { marginTop: 10, fontSize: 14, color: "#374151", textAlign: "center", marginBottom: 14 },
  alertBoxDevBtn: { backgroundColor: "#4e0360", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  alertBoxDevBtnText: { color: "#fff", fontWeight: "700" },
  burstOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 2500 },
  burstEmoji: { position: "absolute", fontSize: 36 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  notificationDropdown: {
      position: 'absolute', top: 70, right: 20, width: 320, borderRadius: 16, borderWidth: 1, overflow: 'hidden', elevation: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10
  },
  notificationHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1
  },
  notificationTitle: { fontWeight: 'bold', fontSize: 16 },
  notificationItem: {
      flexDirection: 'row', padding: 16, borderBottomWidth: 1, alignItems: 'flex-start', gap: 12
  },
  notificationIcon: {
      width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center'
  },
  notificationItemTitle: { fontWeight: '600', fontSize: 14, marginBottom: 2 },
  notificationItemMessage: { fontSize: 12, marginBottom: 4 },
  notificationItemTime: { fontSize: 10, opacity: 0.6 },
  assignModalContent: { width: '85%', maxWidth: 400, maxHeight: '70%', borderRadius: 15, padding: 20, elevation: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 20 },
  memberList: { flex: 1, width: '100%' },
  memberItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', borderRadius: 8, marginBottom: 5 },
  memberItemSelected: { backgroundColor: 'rgba(0, 198, 255, 0.3)' },
  memberItemText: { color: '#fff', fontSize: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  modalButton: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, flex: 1, alignItems: 'center' },
  cancelButton: { backgroundColor: '#666', marginRight: 10 },
  confirmAssignButton: { backgroundColor: '#007AFF' },
  modalButtonText: { color: '#fff', fontWeight: 'bold' },
  modalSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    height: 40,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },
  modalSearchInput: { flex: 1, color: '#fff', fontSize: 14 },
  pickerContainer: { borderRadius: 8, height: 36, justifyContent: "center", overflow: "hidden", minWidth: 120, borderWidth: 1 },
  pickerContainerMobile: { minWidth: 138, height: 34, borderRadius: 7 },
  picker: { height: 36, width: 130, backgroundColor: "transparent", borderWidth: 0 },
  statChange: {
    fontSize: 9, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 8, borderWidth: 1,
  },
  dynamicsButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, gap: 8, borderWidth: 1 },
  dynamicsButtonMobile: { alignSelf: 'flex-start' },
  dynamicsButtonText: {
    fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2
  },
  sidebarTitle: { fontSize: 20, fontWeight: '800', marginLeft: 10 },
  realtimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  realtimeArrow: {
    fontSize: 16,
    marginRight: 2,
  },
  realtimeValue: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  // Voice AI Styles
  voiceOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  voiceCard: { width: '90%', maxWidth: 400, padding: 30, borderRadius: 24, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  voiceHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  voiceTitle: { fontSize: 20, fontWeight: '900', letterSpacing: 2 },
  voiceStatus: { color: '#fff', fontSize: 16, marginBottom: 20, textAlign: 'center', fontWeight: '600' },
  voiceInput: { width: '100%', backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', padding: 15, borderRadius: 12, fontSize: 16, textAlign: 'center' },
  voiceClose: { marginTop: 20, padding: 10 },
  floatingOrb: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    shadowColor: '#fff',
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
});



