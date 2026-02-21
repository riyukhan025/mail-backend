import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as DocumentPicker from "expo-document-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useContext, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { BarChart, LineChart, PieChart } from "react-native-chart-kit";
import * as XLSX from "xlsx";
import firebase from "../firebase";
import { APPWRITE_CONFIG, client, databases, Query } from "./appwrite";
import { AuthContext } from "./AuthContext";

// --- CONSTANTS & CONFIGURATION ---
const APP_VERSION = "1.0.4 (Build 203)";
const API_URL = "https://api.production.example.com";
const ENV_NAME = "STAGING";

const manifest = Constants.manifest;
const localIp = manifest?.debuggerHost?.split(':').shift() || "localhost";
const SERVER_URL = `http://${localIp}:3000`;
const OVERVIEW_METRICS = [
  { id: "balance", title: "Nominal Balance", value: "$7,500.00", unit: "USD", delta: "+1.19%", deltaUp: true, icon: "wallet-outline", accent: "#f43f9e" },
  { id: "stock", title: "Total Stock Product", value: "3,142", unit: "ITEMS", delta: "+0.29%", deltaUp: true, icon: "cube-outline", accent: "#38bdf8" },
  { id: "revenue", title: "Nominal Revenue", value: "$21,430.00", unit: "USD", delta: "+0.29%", deltaUp: true, icon: "trending-up-outline", accent: "#2563eb" },
  { id: "expense", title: "Nominal Expense", value: "$12,980.00", unit: "USD", delta: "-0.15%", deltaUp: false, icon: "trending-down-outline", accent: "#7c3aed" },
];

const OVERVIEW_ACTIVITY = [
  { name: "To Be Packed", value: 110000, color: "#38bdf8", legendFontColor: "#cbd5e1", legendFontSize: 12 },
  { name: "Process Delivery", value: 98000, color: "#fbbf24", legendFontColor: "#cbd5e1", legendFontSize: 12 },
  { name: "Delivery Done", value: 140000, color: "#14b8a6", legendFontColor: "#cbd5e1", legendFontSize: 12 },
  { name: "Returned", value: 67236, color: "#ec4899", legendFontColor: "#cbd5e1", legendFontSize: 12 },
];

const OVERVIEW_COUNTRIES = [
  { id: "uk", name: "United Kingdom", count: 12628, pct: 80, color: "#22c55e" },
  { id: "us", name: "United States", count: 10628, pct: 70, color: "#f97316" },
  { id: "sw", name: "Sweden", count: 8628, pct: 60, color: "#3b82f6" },
  { id: "tr", name: "Turkey", count: 6628, pct: 40, color: "#a855f7" },
  { id: "sp", name: "Spain", count: 3628, pct: 30, color: "#38bdf8" },
];

const OVERVIEW_TRANSACTIONS = [
  { id: "AR-47380416-61", product: "Meta Quest 3", price: "$499.00", customer: "Liam Smith", date: "02 Apr 2025" },
  { id: "AR-30631995-17", product: "iPhone 15 Pro Max", price: "$1,399.00", customer: "Lily Thompson", date: "06 Apr 2025" },
  { id: "AR-79609316-32", product: "MacBook Air M3", price: "$1,299.00", customer: "Lucas Young", date: "10 Apr 2025" },
  { id: "AR-17288760-13", product: "AirPods Pro", price: "$229.00", customer: "Isabella Garcia", date: "14 Apr 2025" },
  { id: "AR-24593385-96", product: "Apple Vision Pro", price: "$3,499.00", customer: "Amelia Davis", date: "18 Apr 2025" },
  { id: "AR-57722590-75", product: "Oura Ring 4", price: "$399.00", customer: "Caleb Turner", date: "22 Apr 2025" },
];

const STATUS_OPTIONS = ["open", "assigned", "audit", "reverted", "fired", "completed", "closed"];

const TABS = [
  { id: "overview", label: "Overview", icon: "grid-outline" },
  { id: "alerts", label: "Alerts", icon: "warning-outline" },
  { id: "control_center", label: "Control Center", icon: "speedometer-outline" },
  { id: "status", label: "Status", icon: "swap-horizontal-outline" },
  { id: "reconciliation", label: "Reconciliation", icon: "git-compare-outline" },
  { id: "manual_audit", label: "Manual Audit", icon: "create-outline" },
  { id: "firebase", label: "Firebase DB", icon: "server-outline" },
  { id: "cloudinary", label: "Cloudinary", icon: "cloud-circle-outline" },
  { id: "tickets", label: "Tickets", icon: "ticket-outline" },
  { id: "users", label: "Users", icon: "people-outline" },
  { id: "roles_permissions", label: "Roles", icon: "shield-checkmark-outline" },
  { id: "content", label: "Content", icon: "newspaper-outline" },
  { id: "settings", label: "Settings", icon: "settings-outline" },
  { id: "analytics_hub", label: "Analytics", icon: "bar-chart-outline" },
  { id: "logs_monitoring", label: "Monitoring", icon: "pulse-outline" },
  { id: "tracking", label: "Tracking", icon: "analytics-outline" },
  { id: "logs", label: "Logs", icon: "terminal-outline" },
  { id: "network", label: "Network", icon: "wifi-outline" },
  { id: "utils", label: "Utils", icon: "construct-outline" },
  { id: "statistics", label: "Statistics", icon: "stats-chart-outline" },
  { id: "billing", label: "Billing", icon: "card-outline" },
  { id: "security", label: "Security", icon: "lock-closed-outline" },
  { id: "notifications", label: "Comms", icon: "notifications-outline" },
  { id: "api", label: "API", icon: "git-network-outline" },
  { id: "deployments", label: "Deployments", icon: "rocket-outline" },
  { id: "database", label: "Database", icon: "server-outline" },
  { id: "growth", label: "Growth", icon: "trending-up-outline" },
  { id: "ai", label: "AI", icon: "sparkles-outline" },
  { id: "enterprise", label: "Enterprise", icon: "business-outline" },
];

// --- REAL DATA INTERCEPTORS ---
const LOG_BUFFER = [];
const NETWORK_BUFFER = [];
const LISTENERS = new Set();

let notifyQueued = false;
const notifyListeners = () => {
  if (notifyQueued) return;
  notifyQueued = true;
  setTimeout(() => {
    notifyQueued = false;
    LISTENERS.forEach((l) => l());
  }, 0);
};

// Patch Console to capture real logs
if (!global.isConsolePatched) {
  const originalConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  ["log", "info", "warn", "error", "debug"].forEach((level) => {
    console[level] = (...args) => {
      const message = args
        .map((a) => {
          try { return typeof a === "object" ? JSON.stringify(a) : String(a); } 
          catch (e) { return "[Circular]"; }
        })
        .join(" ");

      // Filter out noisy Appwrite Realtime logs
      if (message.includes("Realtime got disconnected") || message.includes("Reconnect will be attempted")) return;
      // Filter recurring React/Web warnings from the live log buffer
      if (
        message.includes("Invalid DOM property `transform-origin`") ||
        message.includes("props.pointerEvents is deprecated") ||
        message.includes("Cannot update a component (`DevDashboardScreen`) while rendering a different component")
      ) return;

      if (originalConsole[level]) originalConsole[level](...args);

      LOG_BUFFER.unshift({
        id: Date.now().toString() + Math.random(),
        timestamp: new Date().toISOString(),
        type: level,
        message,
      });
      if (LOG_BUFFER.length > 200) LOG_BUFFER.pop();
      notifyListeners();
    };
  });
  global.isConsolePatched = true;
}

// Patch Fetch to capture real network requests
if (!global.isFetchPatched) {
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const id = Date.now().toString() + Math.random();
    const method = options.method || "GET";
    const start = Date.now();
    const reqEntry = {
      id,
      method,
      url: url.toString(),
      status: "...",
      duration: "...",
      time: new Date().toLocaleTimeString(),
    };
    NETWORK_BUFFER.unshift(reqEntry);
    if (NETWORK_BUFFER.length > 100) NETWORK_BUFFER.pop();
    notifyListeners();

    try {
      const response = await originalFetch(url, options);
      const found = NETWORK_BUFFER.find((n) => n.id === id);
      if (found) {
        found.status = response.status;
        found.duration = Date.now() - start + "ms";
      }
      notifyListeners();
      return response;
    } catch (err) {
      const found = NETWORK_BUFFER.find((n) => n.id === id);
      if (found) {
        found.status = "ERR";
        found.duration = Date.now() - start + "ms";
      }
      notifyListeners();
      throw err;
    }
  };
  global.isFetchPatched = true;
}

// --- MAIN SCREEN COMPONENT ---
export default function DevDashboardScreen({ navigation }) {
  const { user, logout } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState("overview");
  const [logs, setLogs] = useState(LOG_BUFFER);
  const [users, setUsers] = useState([]);
  const [cases, setCases] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [networkRequests, setNetworkRequests] = useState(NETWORK_BUFFER);
  const [featureFlags, setFeatureFlags] = useState({
    enableNewUI: false,
    enableBetaFeatures: false,
    maintenanceModeAdmin: false,
    maintenanceModeMember: false,
    debugLogging: true,
    enableManualAudit: false,
    maintenanceCamera: false,
  });
  const [caseStats, setCaseStats] = useState({ total: 0, completed: 0, pending: 0, audit: 0 });
  const [alertsMeta, setAlertsMeta] = useState({ total: 0, active: 0, critical: 0 });

  // Load feature flags on mount
  useEffect(() => {
    const devRef = firebase.database().ref("dev");
    const listener = devRef.on("value", (snapshot) => {
      const val = snapshot.val();
      if (val) setFeatureFlags((prev) => ({ 
          ...prev, 
          ...val,
          maintenanceModeAdmin: val.maintenanceModeAdmin === true || val.maintenanceModeAdmin === "true",
          maintenanceModeMember: val.maintenanceModeMember === true || val.maintenanceModeMember === "true",
          maintenanceCamera: val.maintenanceCamera === true || val.maintenanceCamera === "true"
      }));
    });
    return () => devRef.off("value", listener);
  }, []);

  // Subscribe to real data updates
  useEffect(() => {
    const updateData = () => {
      setLogs([...LOG_BUFFER]);
      setNetworkRequests([...NETWORK_BUFFER]);
    };
    LISTENERS.add(updateData);
    return () => LISTENERS.delete(updateData);
  }, []);

    // Fetch users for snapshot + management modules
  useEffect(() => {
    const ref = firebase.database().ref("users");
    const listener = ref.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data).map((key) => ({ id: key, ...data[key] }));
      setUsers(list);
    });
    return () => ref.off("value", listener);
  }, []);

  useEffect(() => {
    const ref = firebase.database().ref("cases");
    const listener = ref.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data).map((key) => ({ id: key, ...data[key] }));
      setCases(list);
      const completed = list.filter((c) => c?.status === "completed").length;
      const audit = list.filter((c) => c?.status === "audit").length;
      const pending = list.filter((c) => c?.status === "assigned" || c?.status === "open").length;
      setCaseStats({ total: list.length, completed, pending, audit });
    });
    return () => ref.off("value", listener);
  }, []);

  useEffect(() => {
    const ref = firebase.database().ref("memberAlerts");
    const listener = ref.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data).map((id) => ({ id, ...data[id] }));
      setAlerts(list);
      const active = list.filter((a) => a?.active !== false).length;
      const critical = list.filter((a) => String(a?.severity || "").toLowerCase() === "critical" && a?.active !== false).length;
      setAlertsMeta({ total: list.length, active, critical });
    });
    return () => ref.off("value", listener);
  }, []);

  useEffect(() => {
    const ref = firebase.database().ref("tickets");
    const listener = ref.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data).map((id) => ({ id, ...data[id] }));
      setTickets(list);
    });
    return () => ref.off("value", listener);
  }, []);

  const getTabLiveValue = (tabId) => {
    switch (tabId) {
      case "users":
        return users.length;
      case "logs":
        return logs.length;
      case "network":
      case "api":
        return networkRequests.length;
      case "alerts":
        return alertsMeta.active;
      case "control_center":
        return caseStats.total;
      case "status":
        return cases.length;
      case "tracking":
      case "statistics":
        return caseStats.completed;
      case "manual_audit":
        return caseStats.audit;
      default:
        return null;
    }
  };

  // --- LIVE ACTIVITY TRACKING ---
  useEffect(() => {
    const casesRef = firebase.database().ref("cases");
    
    // Track New Cases
    const onCaseAdded = casesRef.on("child_added", (snapshot) => {
       const val = snapshot.val();
       if (val) {
         const refNo = val.matrixRefNo || val.RefNo || snapshot.key;
         // Only log if it looks like a recent event to avoid flooding log on load
         // (Optional: check timestamp if available, otherwise just log)
         // console.log(`[EVENT] Case Loaded/Created: ${refNo}`); 
       }
    });

    // Track Updates (Completion, Assignment, Audit, Revert)
    const onCaseChanged = casesRef.on("child_changed", (snapshot) => {
      const val = snapshot.val();
      if (val) {
        const refNo = val.matrixRefNo || val.RefNo || snapshot.key;
        const status = val.status;
        const updatedBy = val.finalizedBy || val.assignedTo || "System";
        
        let action = "UPDATED";
        if (status === 'completed') action = "COMPLETED";
        if (status === 'assigned') action = "ASSIGNED";
        if (status === 'audit') action = "SUBMITTED FOR AUDIT";
        if (status === 'reverted') action = "REVERTED";

        console.log(`[EVENT] Case ${refNo} ${action}: Status '${status}' (User: ${updatedBy})`);
      }
    });

    // Track DSR Submissions via Appwrite Realtime
    let unsubscribeDSR;
    try {
        const channel = `databases.${APPWRITE_CONFIG.databaseId}.collections.${APPWRITE_CONFIG.dsrCollectionId}.documents`;
        unsubscribeDSR = client.subscribe(channel, response => {
        });
    } catch (e) {
        console.warn("Appwrite realtime failed", e);
    }

    return () => {
        casesRef.off("child_added", onCaseAdded);
        casesRef.off("child_changed", onCaseChanged);
        if (unsubscribeDSR) unsubscribeDSR();
    };
  }, []);

  // --- ACTIONS ---
  const handleRevokeAccess = (userId) => {
    const message = `Are you sure you want to revoke access for user ${userId}? This will invalidate their session immediately.`;
    
    const executeRevoke = async () => {
        try {
            // Real revoke via Firebase
            await firebase.database().ref(`users/${userId}`).update({ status: "banned" });
            if (Platform.OS === 'web') alert("Success: User access has been revoked.");
            else Alert.alert("Success", "User access has been revoked.");
        } catch (err) {
            if (Platform.OS === 'web') alert("Error: Failed to revoke access: " + err.message);
            else Alert.alert("Error", "Failed to revoke access: " + err.message);
        }
    };

    if (Platform.OS === 'web') {
        if (confirm(message)) executeRevoke();
    } else {
        Alert.alert(
          "Revoke Access",
          message,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Revoke",
              style: "destructive",
              onPress: executeRevoke,
            },
          ]
        );
    }
  };

  const handleGrantAccess = (userId) => {
    const message = `Are you sure you want to grant access for user ${userId}?`;
    
    const executeGrant = async () => {
        try {
            // Real grant via Firebase
            await firebase.database().ref(`users/${userId}`).update({ status: "active" });
            if (Platform.OS === 'web') alert("Success: User access has been granted.");
            else Alert.alert("Success", "User access has been granted.");
        } catch (err) {
            if (Platform.OS === 'web') alert("Error: Failed to grant access: " + err.message);
            else Alert.alert("Error", "Failed to grant access: " + err.message);
        }
    };

    if (Platform.OS === 'web') {
        if (confirm(message)) executeGrant();
    } else {
        Alert.alert(
          "Grant Access",
          message,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Grant",
              style: "default",
              onPress: executeGrant,
            },
          ]
        );
    }
  };

  const handleClearLogs = () => {
    LOG_BUFFER.length = 0;
    setLogs([]);
  };
  
  const handleClearNetwork = () => {
    NETWORK_BUFFER.length = 0;
    setNetworkRequests([]);
  };

  const toggleFeatureFlag = async (key) => {
    const newValue = !featureFlags[key];
    setFeatureFlags((prev) => ({ ...prev, [key]: newValue }));
    try {
      await firebase.database().ref("dev").update({ [key]: newValue });
      console.log(`[DevDashboard] Updated ${key} to ${newValue}`);
    } catch (error) {
      console.error("Failed to update feature flag:", error);
      Alert.alert("Error", "Failed to update feature flag in database.");
      setFeatureFlags((prev) => ({ ...prev, [key]: !newValue })); // Revert
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewTab featureFlags={featureFlags} toggleFeatureFlag={toggleFeatureFlag} navigation={navigation} cases={cases} users={users} alerts={alerts} tickets={tickets} />;
      case "alerts":
        return <AlertsTab currentUser={user} />;
      case "status":
        return <StatusTab cases={cases} users={users} currentUser={user} />;
      case "reconciliation":
        return <ReconciliationTab />;
      case "manual_audit":
        return <ManualAuditTab />;
      case "firebase":
        return <FirebaseTab />;
      case "cloudinary":
        return <CloudinaryTab />;
      case "tickets":
        return <TicketsTab />;
      case "users":
        return <UsersTab users={users} onRevoke={handleRevokeAccess} onGrant={handleGrantAccess} />;
      case "tracking":
        return <TrackingTab cases={cases} logs={logs} />;
      case "logs":
        return <LogsTab logs={logs} onClear={handleClearLogs} />;
      case "network":
        return <NetworkTab requests={networkRequests} onClear={handleClearNetwork} />;
      case "utils":
        return <UtilsTab />;
      case "statistics":
        return <StatisticsTab users={users} />;
      case "control_center":
        return <ControlCenterTab users={users} logs={logs} networkRequests={networkRequests} cases={cases} alerts={alerts} tickets={tickets} featureFlags={featureFlags} />;
      case "roles_permissions":
        return <RolesPermissionsTab canManage={user?.role === "admin" || user?.role === "dev"} users={users} />;
      case "content":
        return <ContentManagementTab canManage={user?.role === "admin" || user?.role === "dev"} cases={cases} />;
      case "settings":
        return <AppConfigTab featureFlags={featureFlags} toggleFeatureFlag={toggleFeatureFlag} canManage={user?.role === "admin" || user?.role === "dev"} cases={cases} users={users} currentUser={user} />;
      case "analytics_hub":
        return <AnalyticsInsightsTab cases={cases} users={users} tickets={tickets} />;
      case "logs_monitoring":
        return <MonitoringTab logs={logs} requests={networkRequests} cases={cases} />;
      case "billing":
        return <BillingSubscriptionTab canManage={user?.role === "admin" || user?.role === "dev"} tickets={tickets} cases={cases} users={users} />;
      case "security":
        return <SecurityCenterTab canManage={user?.role === "admin" || user?.role === "dev"} />;
      case "notifications":
        return <NotificationCenterTab alerts={alerts} users={users} />;
      case "api":
        return <ApiIntegrationTab canManage={user?.role === "admin" || user?.role === "dev"} requests={networkRequests} logs={logs} />;
      case "deployments":
        return <DeploymentControlTab canManage={user?.role === "admin" || user?.role === "dev"} />;
      case "database":
        return <DatabaseManagementTab canManage={user?.role === "admin" || user?.role === "dev"} />;
      case "growth":
        return <GrowthMarketingTab />;
      case "ai":
        return <AiAutomationTab canManage={user?.role === "admin" || user?.role === "dev"} />;
      case "enterprise":
        return <EnterpriseExtrasTab />;
      default:
        return <OverviewTab />;
    }
  };

  return (
    <LinearGradient colors={["#05080f", "#090d16", "#05080f"]} style={styles.dsScreen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.dsShellFrame}>
        {Dimensions.get("window").width >= 980 && (
          <View style={styles.dsSidebar}>
            <View style={styles.dsSidebarBrand}>
              <View style={styles.dsBrandAvatar}>
                <Ionicons name="flask-outline" size={16} color="#34d399" />
              </View>
              <View>
                <Text style={styles.dsBrandName}>Dev Quantico</Text>
                <Text style={styles.dsBrandSub}>ID: DEV-1006</Text>
              </View>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.dsSidebarMenu}>
              {TABS.map((tab) => (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.dsSidebarItem, activeTab === tab.id && styles.dsSidebarItemActive]}
                  onPress={() => setActiveTab(tab.id)}
                >
                  <Ionicons
                    name={tab.icon}
                    size={16}
                    color={activeTab === tab.id ? "#e2e8f0" : "#64748b"}
                    style={{ marginRight: 10 }}
                  />
                  <Text style={[styles.dsSidebarLabel, activeTab === tab.id && styles.dsSidebarLabelActive]}>{tab.label}</Text>
                  {getTabLiveValue(tab.id) !== null && (
                    <View style={[styles.dsSidebarBadge, tab.id === "alerts" && alertsMeta.critical > 0 && styles.dsSidebarBadgeCritical]}>
                      <Text style={styles.dsSidebarBadgeText}>{getTabLiveValue(tab.id)}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.dsSidebarFooter}
              onPress={() => firebase.auth().signOut().then(() => { if (logout) logout(); })}
            >
              <Ionicons name="log-out-outline" size={16} color="#fda4af" />
              <Text style={styles.dsSidebarFooterText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.dsMainArea}>
          <View style={styles.dsTopBar}>
            <View>
              <Text style={styles.dsBreadcrumb}>Home  �  Dashboard  �  Analytics</Text>
              <Text style={styles.dsTopTitle}>Dev Analytics Dashboard</Text>
            </View>
            <View style={styles.dsTopActions}>
              <TouchableOpacity style={styles.dsTopIconBtn} onPress={() => Alert.alert("Info", "Developer Tools v1.0")}>
                <Ionicons name="information-circle-outline" size={18} color="#cbd5e1" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.dsTopIconBtn} onPress={() => setActiveTab("overview")}>
                <Ionicons name="grid-outline" size={18} color="#cbd5e1" />
              </TouchableOpacity>
              {Dimensions.get("window").width < 980 && (
                <TouchableOpacity
                  style={styles.dsTopIconBtn}
                  onPress={() => firebase.auth().signOut().then(() => { if (logout) logout(); })}
                >
                  <Ionicons name="log-out-outline" size={18} color="#fda4af" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {Dimensions.get("window").width < 980 && (
            <View style={styles.dsMobileTabsWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dsMobileTabsContent}>
                {TABS.map((tab) => (
                  <TouchableOpacity
                    key={tab.id}
                    style={[styles.dsMobileTab, activeTab === tab.id && styles.dsMobileTabActive]}
                    onPress={() => setActiveTab(tab.id)}
                  >
                    <Ionicons name={tab.icon} size={14} color={activeTab === tab.id ? "#e2e8f0" : "#64748b"} />
                    <Text style={[styles.dsMobileTabText, activeTab === tab.id && styles.dsMobileTabTextActive]}>{tab.label}</Text>
                    {getTabLiveValue(tab.id) !== null && (
                      <View style={[styles.dsMobileTabBadge, tab.id === "alerts" && alertsMeta.critical > 0 && styles.dsMobileTabBadgeCritical]}>
                        <Text style={styles.dsMobileTabBadgeText}>{getTabLiveValue(tab.id)}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.dsContentArea}>{renderContent()}</View>
        </View>
      </View>
    </LinearGradient>
  );
}

// --- TAB COMPONENTS ---


function OverviewTab({ featureFlags = {}, toggleFeatureFlag = () => {}, navigation, cases = [], users = [], alerts = [], tickets = [] }) {
  const { logout } = useContext(AuthContext);
  const screenWidth = Dimensions.get("window").width;
  const isWide = screenWidth >= 980;
  const isWeb = Platform.OS === "web";

  const toggleGlobalMaintenance = () => {
    const newState = !featureFlags.maintenanceModeAdmin;
    firebase.database().ref("dev").update({
      maintenanceModeAdmin: newState,
      maintenanceModeMember: newState,
    });
  };

  const chartWidth = Math.max(Math.min(screenWidth - (isWide ? 620 : 90), 420), 260);
  const chartConfig = {
    backgroundGradientFrom: "#0f172a",
    backgroundGradientTo: "#0f172a",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(59,130,246,${opacity})`,
    labelColor: () => "#94a3b8",
    propsForDots: { r: "0" },
    barPercentage: 0.42,
  };

  const statusCounts = cases.reduce((acc, c) => {
    const key = String(c?.status || "unknown").toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const roleCounts = users.reduce((acc, u) => {
    const key = String(u?.role || "unknown").toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const cityCounts = cases.reduce((acc, c) => {
    const key = String(c?.city || "Unknown").trim() || "Unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const sortedCities = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const caseStatusPie = Object.entries(statusCounts)
    .filter(([, count]) => count > 0)
    .slice(0, 6)
    .map(([name, count], idx) => ({
      name: name.toUpperCase(),
      value: count,
      color: ["#38bdf8", "#fbbf24", "#14b8a6", "#ef4444", "#a78bfa", "#fb7185"][idx % 6],
      legendFontColor: "#cbd5e1",
      legendFontSize: 12,
    }));

  const recentCases = [...cases]
    .sort((a, b) => {
      const at = new Date(a.updatedAt || a.completedAt || a.assignedAt || a.dateInitiated || 0).getTime();
      const bt = new Date(b.updatedAt || b.completedAt || b.assignedAt || b.dateInitiated || 0).getTime();
      return bt - at;
    })
    .slice(0, 8);

  const liveMetrics = [
    { id: "cases", title: "Total Cases", value: String(cases.length), unit: "LIVE", delta: `${statusCounts.completed || 0} completed`, deltaUp: true, icon: "briefcase-outline", accent: "#38bdf8" },
    { id: "users", title: "Total Users", value: String(users.length), unit: "LIVE", delta: `${roleCounts.member || 0} members`, deltaUp: true, icon: "people-outline", accent: "#22c55e" },
    { id: "alerts", title: "Active Alerts", value: String(alerts.filter((a) => a?.active !== false).length), unit: "LIVE", delta: `${alerts.filter((a) => String(a?.severity || "").toLowerCase() === "critical" && a?.active !== false).length} critical`, deltaUp: false, icon: "warning-outline", accent: "#f97316" },
    { id: "tickets", title: "Total Tickets", value: String(tickets.length), unit: "LIVE", delta: `${tickets.filter((t) => String(t?.status || "").toLowerCase() !== "closed").length} open`, deltaUp: true, icon: "ticket-outline", accent: "#a78bfa" },
  ];

  return (
    <ScrollView style={styles.dsOverviewScroll} contentContainerStyle={styles.dsOverviewContent}>
      <View style={styles.dsOverviewRow}>
        <View style={styles.dsMetricGrid}>
          {liveMetrics.map((metric) => (
            <View key={metric.id} style={styles.dsMetricCard}>
              <View style={styles.dsMetricHeader}>
                <View style={[styles.dsMetricIconWrap, { backgroundColor: `${metric.accent}33` }]}>
                  <Ionicons name={metric.icon} size={15} color={metric.accent} />
                </View>
                <Text style={styles.dsMetricTitle}>{metric.title}</Text>
              </View>
              <View style={styles.dsMetricValueRow}>
                <Text style={styles.dsMetricValue}>{metric.value}</Text>
                <Text style={styles.dsMetricUnit}>{metric.unit}</Text>
              </View>
              <View style={styles.dsMetricDeltaRow}>
                <Ionicons
                  name={metric.deltaUp ? "arrow-up-circle" : "arrow-down-circle"}
                  size={14}
                  color={metric.deltaUp ? "#22c55e" : "#f43f5e"}
                />
                <Text style={[styles.dsMetricDelta, { color: metric.deltaUp ? "#22c55e" : "#f43f5e" }]}>{metric.delta}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.dsActivityCard}>
          <View style={styles.dsCardHeaderRow}>
            <Text style={styles.dsCardTitle}>Case Status Distribution</Text>
            <Text style={styles.dsCardSubTitle}>Realtime</Text>
          </View>
          {isWeb || caseStatusPie.length === 0 ? (
            <View style={styles.dsChartFallback}>
              <Text style={styles.dsChartFallbackText}>
                {caseStatusPie.length === 0 ? "No cases available." : "Chart preview unavailable on web build."}
              </Text>
            </View>
          ) : (
            <PieChart
              data={caseStatusPie}
              width={chartWidth}
              height={170}
              accessor="value"
              chartConfig={chartConfig}
              backgroundColor="transparent"
              paddingLeft={isWide ? "12" : "4"}
              hasLegend={false}
              absolute
            />
          )}
          <View style={styles.dsLegendList}>
            {caseStatusPie.map((item) => (
              <View key={item.name} style={styles.dsLegendRow}>
                <View style={[styles.dsLegendDot, { backgroundColor: item.color }]} />
                <Text style={styles.dsLegendName}>{item.name}</Text>
                <Text style={styles.dsLegendValue}>{item.value.toLocaleString()}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.dsOverviewRow}>
        <View style={styles.dsChartCard}>
          <View style={styles.dsCardHeaderRow}>
            <Text style={styles.dsCardTitle}>Case Volume (Last 7 Days)</Text>
            <Text style={styles.dsCardSubTitle}>Realtime</Text>
          </View>
          {isWeb ? (
            <View style={styles.dsChartFallback}>
              <Text style={styles.dsChartFallbackText}>Bar chart unavailable on web build.</Text>
            </View>
          ) : (
            <BarChart
              data={{
                labels: [...Array(7)].map((_, idx) => {
                  const d = new Date();
                  d.setDate(d.getDate() - (6 - idx));
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }),
                datasets: [{
                  data: [...Array(7)].map((_, idx) => {
                    const d = new Date();
                    d.setDate(d.getDate() - (6 - idx));
                    const y = d.getFullYear();
                    const m = d.getMonth();
                    const day = d.getDate();
                    return cases.filter((c) => {
                      const dt = new Date(c.dateInitiated || c.assignedAt || c.createdAt || 0);
                      return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === day;
                    }).length;
                  }),
                }],
              }}
              width={chartWidth + (isWide ? 60 : 0)}
              height={220}
              yAxisLabel=""
              yAxisSuffix=""
              chartConfig={chartConfig}
              withInnerLines
              fromZero
              showBarTops={false}
              style={styles.dsBarChart}
            />
          )}
        </View>

        <View style={styles.dsCountryCard}>
          <View style={styles.dsCardHeaderRow}>
            <Text style={styles.dsCardTitle}>Top Case Cities</Text>
            <Text style={styles.dsCardSubTitle}>Live</Text>
          </View>
          {sortedCities.map(([city, count]) => {
            const pct = cases.length ? Math.max(3, Math.round((count / cases.length) * 100)) : 0;
            return (
            <View key={city} style={styles.dsCountryRow}>
              <View style={styles.dsCountryLabelRow}>
                <Text style={styles.dsCountryName}>{city}</Text>
                <Text style={styles.dsCountryValue}>{count.toLocaleString()} ({pct}%)</Text>
              </View>
              <View style={styles.dsCountryTrack}>
                <View style={[styles.dsCountryFill, { width: `${pct}%`, backgroundColor: "#38bdf8" }]} />
              </View>
            </View>
          )})}
          {sortedCities.length === 0 && <Text style={{ color: "#94a3b8" }}>No city metadata in cases yet.</Text>}
        </View>
      </View>

      <View style={styles.dsTransactionCard}>
        <View style={styles.dsCardHeaderRow}>
          <Text style={styles.dsCardTitle}>Recent Case Activity</Text>
          <Text style={styles.dsCardSubTitle}>{recentCases.length} rows</Text>
        </View>
        <View style={styles.dsTransactionHeader}>
          <Text style={[styles.dsTransactionHeaderText, { flex: 1.2 }]}>REF</Text>
          <Text style={[styles.dsTransactionHeaderText, { flex: 1.1 }]}>STATUS</Text>
          <Text style={[styles.dsTransactionHeaderText, { flex: 1.1 }]}>ASSIGNEE</Text>
          <Text style={[styles.dsTransactionHeaderText, { flex: 1.2 }]}>CITY</Text>
          <Text style={[styles.dsTransactionHeaderText, { flex: 1 }]}>DATE</Text>
        </View>
        {recentCases.map((c) => (
          <View key={c.id} style={styles.dsTransactionRow}>
            <Text style={[styles.dsTransactionCell, { flex: 1.2 }]} numberOfLines={1}>{c.matrixRefNo || c.RefNo || c.id}</Text>
            <Text style={[styles.dsTransactionCell, { flex: 1.1, color: "#f8fafc" }]}>{String(c.status || "unknown").toUpperCase()}</Text>
            <Text style={[styles.dsTransactionCell, { flex: 1.1 }]} numberOfLines={1}>{c.assigneeName || c.assignedTo || "-"}</Text>
            <Text style={[styles.dsTransactionCell, { flex: 1.2 }]} numberOfLines={1}>{c.city || "-"}</Text>
            <Text style={[styles.dsTransactionCell, { flex: 1 }]}>{new Date(c.updatedAt || c.assignedAt || c.dateInitiated || 0).toLocaleDateString()}</Text>
          </View>
        ))}
      </View>

      <View style={styles.dsQuickGrid}>
        <TouchableOpacity style={styles.dsQuickBtn} onPress={() => { if (Platform.OS === "web") window.location.reload(); else Alert.alert("Info", "Use Expo reload"); }}>
          <Ionicons name="refresh-outline" size={16} color="#38bdf8" />
          <Text style={styles.dsQuickBtnText}>Reload</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dsQuickBtn} onPress={() => firebase.auth().signOut().then(() => { if (logout) logout(); })}>
          <Ionicons name="log-out-outline" size={16} color="#fb7185" />
          <Text style={styles.dsQuickBtnText}>Logout</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dsQuickBtn} onPress={toggleGlobalMaintenance}>
          <Ionicons name="construct-outline" size={16} color="#fbbf24" />
          <Text style={styles.dsQuickBtnText}>Maintenance</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dsQuickBtn} onPress={() => Object.keys(featureFlags).forEach((key) => toggleFeatureFlag(key))}>
          <Ionicons name="git-compare-outline" size={16} color="#4ade80" />
          <Text style={styles.dsQuickBtnText}>Flip Flags</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
function ReconciliationTab() {
  const [mismatches, setMismatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [excelCompletedData, setExcelCompletedData] = useState(null);
  const [dbCases, setDbCases] = useState(null);
  const [activeCheck, setActiveCheck] = useState(null);

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      if (result.canceled) return;
      
      setLoading(true);
      setExcelCompletedData(null);
      setDbCases(null);
      setMismatches([]);
      setActiveCheck(null);

      const fileUri = result.assets ? result.assets[0].uri : result.uri;

      // Read File
      let workbook;
      if (Platform.OS === "web") {
        const response = await fetch(fileUri);
        const arrayBuffer = await response.arrayBuffer();
        workbook = XLSX.read(arrayBuffer, { type: "array" });
      } else {
        const response = await fetch(fileUri);
        const blob = await response.blob();
        const b64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = (e) => reject(e);
          reader.readAsDataURL(blob);
        });
        workbook = XLSX.read(b64, { type: "base64" });
      }

      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      // Filter Excel for Completed
      const excelCompleted = jsonData.filter(row => {
          const status = row["Status"] || row["status"];
          return status && status.toString().toLowerCase() === "completed";
      });
      setExcelCompletedData(excelCompleted);

      // Fetch Firebase Data
      const snapshot = await firebase.database().ref("cases").once("value");
      const dbData = snapshot.val() || {};
      setDbCases(Object.values(dbData));

      setStats({
          totalExcel: jsonData.length,
          excelCompleted: excelCompleted.length,
          mismatches: 0
      });

    } catch (e) {
        Alert.alert("Error", "Failed to process file: " + e.message);
    } finally {
        setLoading(false);
    }
  };

  const runCheck = (checkType) => {
    if (!excelCompletedData || !dbCases) {
        Alert.alert("Info", "Please import an Excel file first.");
        return;
    }
    setLoading(true);
    setActiveCheck(checkType);

    const foundMismatches = [];

    excelCompletedData.forEach(row => {
        const refNo = row["Reference ID"] || row["Reference No"] || row["Ref No"] || row["matrixRefNo"];
        if (!refNo) return;

        const dbCase = dbCases.find(c => 
            (c.matrixRefNo && c.matrixRefNo.toString() === refNo.toString()) || 
            (c.RefNo && c.RefNo.toString() === refNo.toString()) ||
            (c.id && c.id.toString() === refNo.toString())
        );

        const isMissing = !dbCase;
        const isStatusMismatch = dbCase && dbCase.status !== "completed";

        if (checkType === 'missing' && isMissing) {
            foundMismatches.push({ refNo, excelStatus: "Completed", dbStatus: "Missing", reason: "Case not found in Database" });
        } else if (checkType === 'status' && isStatusMismatch) {
            foundMismatches.push({ refNo, excelStatus: "Completed", dbStatus: dbCase.status, reason: `Status mismatch (DB: ${dbCase.status})`, id: dbCase.id });
        } else if (checkType === 'all') {
            if (isMissing) {
                foundMismatches.push({ refNo, excelStatus: "Completed", dbStatus: "Missing", reason: "Case not found in Database" });
            } else if (isStatusMismatch) {
                foundMismatches.push({ refNo, excelStatus: "Completed", dbStatus: dbCase.status, reason: `Status mismatch (DB: ${dbCase.status})`, id: dbCase.id });
            }
        }
    });

    setMismatches(foundMismatches);
    setStats(prev => ({ ...prev, mismatches: foundMismatches.length }));
    setLoading(false);
  };

  return (
      <View style={styles.flexContainer}>
          <View style={styles.toolbar}>
              <Text style={styles.toolbarTitle}>Excel Reconciliation</Text>
              <GradientButton 
                  colors={['#2e7d32', '#4caf50']}
                  icon="cloud-upload"
                  label="Import Excel"
                  small
                  onPress={handleImport}
                  loading={loading && !excelCompletedData}
              />
          </View>
          
          {excelCompletedData && (
            <View style={{ padding: 10, flexDirection: 'row', justifyContent: 'space-around', backgroundColor: 'rgba(0,0,0,0.2)', gap: 10 }}>
                <GradientButton 
                    colors={activeCheck === 'status' ? ['#c62828', '#f44336'] : ['#6a1b9a', '#aa00ff']}
                    label="Status Mismatch"
                    small
                    onPress={() => runCheck('status')}
                    loading={loading && activeCheck === 'status'}
                />
                <GradientButton 
                    colors={activeCheck === 'missing' ? ['#c62828', '#f44336'] : ['#6a1b9a', '#aa00ff']}
                    label="Missing in DB"
                    small
                    onPress={() => runCheck('missing')}
                    loading={loading && activeCheck === 'missing'}
                />
                <GradientButton 
                    colors={activeCheck === 'all' ? ['#c62828', '#f44336'] : ['#6a1b9a', '#aa00ff']}
                    label="All Mismatches"
                    small
                    onPress={() => runCheck('all')}
                    loading={loading && activeCheck === 'all'}
                />
            </View>
          )}

          {stats && (
              <View style={{flexDirection: 'row', padding: 10, justifyContent: 'space-around', backgroundColor: 'rgba(255,255,255,0.05)'}}>
                  <Text style={{color: '#ccc'}}>Excel Total: <Text style={{color: '#fff', fontWeight: 'bold'}}>{stats.totalExcel}</Text></Text>
                  <Text style={{color: '#ccc'}}>Excel Completed: <Text style={{color: '#4caf50', fontWeight: 'bold'}}>{stats.excelCompleted}</Text></Text>
                  <Text style={{color: '#ccc'}}>Mismatches Found: <Text style={{color: '#ff4444', fontWeight: 'bold'}}>{stats.mismatches}</Text></Text>
              </View>
          )}

          <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 1 }]}>Ref No</Text>
              <Text style={[styles.tableHeaderText, { flex: 1 }]}>DB Status</Text>
              <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>Reason</Text>
          </View>

          <FlatList 
              data={mismatches}
              keyExtractor={(item, index) => item.refNo + index}
              contentContainerStyle={{paddingBottom: 20}}
              renderItem={({item}) => (
                  <View style={styles.tableRow}>
                      <Text style={[styles.tableCell, { flex: 1, fontWeight: 'bold' }]}>{item.refNo}</Text>
                      <Text style={[styles.tableCell, { flex: 1, color: getStatusColor(item.dbStatus) }]}>{item.dbStatus.toUpperCase()}</Text>
                      <Text style={[styles.tableCell, { flex: 1.5, color: '#ff4444' }]}>{item.reason}</Text>
                  </View>
              )}
              ListEmptyComponent={
                  !loading && excelCompletedData ? <Text style={{color: '#4caf50', textAlign: 'center', marginTop: 20}}>No mismatches found for this check.</Text> : 
                  !loading && !excelCompletedData ? <Text style={{color: '#ccc', textAlign: 'center', marginTop: 20}}>Import an Excel file to begin.</Text> : 
                  null
              }
          />
      </View>
  );
}

function ManualAuditTab() {
  const [cases, setCases] = useState([]);
  const [search, setSearch] = useState("");
  const [loadingMap, setLoadingMap] = useState({});
  const [selectedCases, setSelectedCases] = useState([]);

  useEffect(() => {
    const ref = firebase.database().ref("cases");
    const onValue = ref.on("value", snapshot => {
      const data = snapshot.val() || {};
      setCases(Object.keys(data).map(k => ({ id: k, ...data[k] })));
    });
    return () => ref.off("value", onValue);
  }, []);

  const handleForceComplete = async (item) => {
      const confirmMsg = `Mark case ${item.matrixRefNo || item.id} as COMPLETED? This bypasses normal audit flow.`;
      
      const execute = async () => {
          setLoadingMap(prev => ({...prev, [item.id]: true}));
          try {
              await firebase.database().ref(`cases/${item.id}`).update({
                  status: 'completed',
                  completedAt: item.completedAt || new Date().toISOString(),
                  finalizedAt: Date.now(),
                  finalizedBy: 'dev_manual_override'
              });
              if (Platform.OS !== 'web') Alert.alert("Success", "Case marked as completed.");
          } catch (e) {
              Alert.alert("Error", e.message);
          } finally {
              setLoadingMap(prev => ({...prev, [item.id]: false}));
          }
      };

      if (Platform.OS === 'web') {
          if (confirm(confirmMsg)) execute();
      } else {
          Alert.alert("Confirm Force Complete", confirmMsg, [
              { text: "Cancel", style: "cancel" },
              { text: "Complete", style: "destructive", onPress: execute }
          ]);
      }
  };

  const handleForceRevert = async (item) => {
      const confirmMsg = `Mark case ${item.matrixRefNo || item.id} as REVERTED?`;
      
      const execute = async () => {
          setLoadingMap(prev => ({...prev, [item.id]: true}));
          try {
              await firebase.database().ref(`cases/${item.id}`).update({
                  status: 'reverted',
                  revertedAt: Date.now(),
                  revertedBy: 'dev_manual_override'
              });
              if (Platform.OS !== 'web') Alert.alert("Success", "Case marked as reverted.");
          } catch (e) {
              Alert.alert("Error", e.message);
          } finally {
              setLoadingMap(prev => ({...prev, [item.id]: false}));
          }
      };

      if (Platform.OS === 'web') {
          if (confirm(confirmMsg)) execute();
      } else {
          Alert.alert("Confirm Force Revert", confirmMsg, [
              { text: "Cancel", style: "cancel" },
              { text: "Revert", style: "destructive", onPress: execute }
          ]);
      }
  };

  const toggleSelect = (id) => {
    setSelectedCases(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBulkComplete = async () => {
    if (selectedCases.length === 0) return;
    
    const confirmMsg = `Mark ${selectedCases.length} cases as COMPLETED?`;
    
    const execute = async () => {
        setLoadingMap(prev => ({...prev, bulk: true}));
        try {
            const updates = {};
            selectedCases.forEach(id => {
                const c = cases.find(x => x.id === id);
                updates[`cases/${id}/status`] = 'completed';
                updates[`cases/${id}/completedAt`] = (c && c.completedAt) ? c.completedAt : new Date().toISOString();
                updates[`cases/${id}/finalizedAt`] = Date.now();
                updates[`cases/${id}/finalizedBy`] = 'dev_manual_bulk';
            });
            await firebase.database().ref().update(updates);
            setSelectedCases([]);
            if (Platform.OS !== 'web') Alert.alert("Success", "Bulk completion successful.");
            else Alert.alert("Success", "Bulk completion successful.");
        } catch (e) {
            Alert.alert("Error", e.message);
        } finally {
            setLoadingMap(prev => ({...prev, bulk: false}));
        }
    };

    if (Platform.OS === 'web') {
        if (confirm(confirmMsg)) execute();
    } else {
        Alert.alert("Confirm Bulk Complete", confirmMsg, [
            { text: "Cancel", style: "cancel" },
            { text: "Complete All", style: "destructive", onPress: execute }
        ]);
    }
  };

  const filtered = cases.filter(c => {
      const s = search.toLowerCase();
      return (c.matrixRefNo || c.id).toLowerCase().includes(s) || (c.assigneeName || "").toLowerCase().includes(s);
  });

  return (
      <View style={styles.flexContainer}>
          <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#888" />
              <TextInput 
                  style={styles.searchInput} 
                  placeholder="Search Ref No or Assignee..." 
                  placeholderTextColor="#888"
                  value={search}
                  onChangeText={setSearch}
              />
          </View>

          {selectedCases.length > 0 && (
            <View style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, justifyContent: 'space-between'}}>
                <Text style={{color: '#fff', fontWeight: 'bold'}}>{selectedCases.length} Selected</Text>
                <GradientButton 
                    colors={['#11998e', '#38ef7d']}
                    label={`Complete Selected (${selectedCases.length})`}
                    small
                    onPress={handleBulkComplete}
                    loading={loadingMap['bulk']}
                />
            </View>
          )}

          <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 0.4 }]}>#</Text>
              <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>Ref No</Text>
              <Text style={[styles.tableHeaderText, { flex: 1 }]}>Status</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Action</Text>
          </View>
          <FlatList 
              data={filtered}
              keyExtractor={i => i.id}
              contentContainerStyle={{paddingBottom: 20}}
              renderItem={({item}) => (
                  <View style={styles.tableRow}>
                      <TouchableOpacity 
                        style={{flex: 0.4, justifyContent: 'center'}} 
                        onPress={() => toggleSelect(item.id)}
                      >
                        <Ionicons name={selectedCases.includes(item.id) ? "checkbox" : "square-outline"} size={20} color={selectedCases.includes(item.id) ? "#4caf50" : "#888"} />
                      </TouchableOpacity>
                      <Text style={[styles.tableCell, { flex: 1.5, fontWeight: 'bold' }]} numberOfLines={1}>{item.matrixRefNo || item.id}</Text>
                      <Text style={[styles.tableCell, { flex: 1, color: getStatusColor(item.status) }]}>{item.status?.toUpperCase()}</Text>
                      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 5 }}>
                          <GradientButton 
                            colors={['#11998e', '#38ef7d']}
                            label="Complete"
                            small
                            onPress={() => handleForceComplete(item)}
                            loading={loadingMap[item.id]}
                          />
                          <GradientButton 
                            colors={['#ff416c', '#ff4b2b']}
                            label="Revert"
                            small
                            onPress={() => handleForceRevert(item)}
                            loading={loadingMap[item.id]}
                          />
                      </View>
                  </View>
              )}
          />
      </View>
  );
}

function FirebaseTab() {
  const [cases, setCases] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("all");

  useEffect(() => {
    const ref = firebase.database().ref("cases");
    const onValue = ref.on("value", snapshot => {
      const data = snapshot.val() || {};
      setCases(Object.keys(data).map(k => ({ id: k, ...data[k] })));
    });
    return () => ref.off("value", onValue);
  }, []);

  const handleDelete = (id) => {
    if (Platform.OS === 'web') {
        if (confirm("Delete this case from Firebase permanently?")) {
             firebase.database().ref(`cases/${id}`).remove();
        }
    } else {
        Alert.alert("Delete Case", "Are you sure? This cannot be undone.", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => firebase.database().ref(`cases/${id}`).remove() }
        ]);
    }
  };

  const filtered = cases.filter(c => {
      const s = search.toLowerCase();
      const matchesSearch = (c.matrixRefNo || c.id).toLowerCase().includes(s) || (c.assigneeName || "").toLowerCase().includes(s);
      const matchesStatus = statusFilter ? c.status === statusFilter : true;
      
      let matchesDate = true;
      if (dateFilter === '>3m') {
          const dateToCheck = c.completedAt || c.assignedAt;
          if (dateToCheck) {
              const d = new Date(dateToCheck);
              const threeMonthsAgo = new Date();
              threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
              matchesDate = d < threeMonthsAgo;
          } else matchesDate = false;
      }
      return matchesSearch && matchesStatus && matchesDate;
  });

  return (
      <View style={styles.flexContainer}>
          <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#888" />
              <TextInput 
                  style={styles.searchInput} 
                  placeholder="Search ID or Assignee..." 
                  placeholderTextColor="#888"
                  value={search}
                  onChangeText={setSearch}
              />
          </View>
          <View style={{flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 10, flexWrap: 'wrap', gap: 8}}>
              {['', 'assigned', 'completed', 'audit', 'reverted'].map(st => (
                  <TouchableOpacity key={st} onPress={() => setStatusFilter(st)} style={[styles.filterChip, statusFilter === st && styles.activeFilterChip]}>
                      <Text style={[styles.filterText, statusFilter === st && styles.activeFilterText]}>{st ? st.toUpperCase() : 'ALL'}</Text>
                  </TouchableOpacity>
              ))}
              <TouchableOpacity onPress={() => setDateFilter(dateFilter === 'all' ? '>3m' : 'all')} style={[styles.filterChip, dateFilter === '>3m' && {backgroundColor: '#ff9800'}]}>
                  <Text style={[styles.filterText, dateFilter === '>3m' && {color: '#fff'}]}>{dateFilter === '>3m' ? '> 3 Months' : 'Date Filter'}</Text>
              </TouchableOpacity>
          </View>
          <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>Ref No</Text>
              <Text style={[styles.tableHeaderText, { flex: 1 }]}>Assigned To</Text>
              <Text style={[styles.tableHeaderText, { flex: 0.8 }]}>Status</Text>
              <Text style={[styles.tableHeaderText, { flex: 1 }]}>Completed At</Text>
              <Text style={[styles.tableHeaderText, { flex: 0.5, textAlign: 'center' }]}>Del</Text>
          </View>
          <FlatList 
              data={filtered}
              keyExtractor={i => i.id}
              contentContainerStyle={{paddingBottom: 20}}
              renderItem={({item}) => (
                  <View style={styles.tableRow}>
                      <Text style={[styles.tableCell, { flex: 1.5, fontWeight: 'bold' }]} numberOfLines={1}>{item.matrixRefNo || item.id}</Text>
                      <Text style={[styles.tableCell, { flex: 1 }]} numberOfLines={1}>{item.assigneeName || item.assignedTo || '-'}</Text>
                      <Text style={[styles.tableCell, { flex: 0.8, color: getStatusColor(item.status) }]}>{item.status?.toUpperCase()}</Text>
                      <Text style={[styles.tableCell, { flex: 1 }]} numberOfLines={1}>{item.completedAt ? new Date(item.completedAt).toLocaleDateString() : '-'}</Text>
                      <TouchableOpacity style={[styles.iconBtn, { flex: 0.5, alignItems: 'center' }]} onPress={() => handleDelete(item.id)}>
                          <Ionicons name="trash-outline" size={18} color="#ff4444" />
                      </TouchableOpacity>
                  </View>
              )}
          />
      </View>
  );
}

function CloudinaryTab() {
  const [cases, setCases] = useState([]);
  const [search, setSearch] = useState("");
  const [loadingMap, setLoadingMap] = useState({});
  const [dateFilter, setDateFilter] = useState("all");

  useEffect(() => {
    const ref = firebase.database().ref("cases");
    const onValue = ref.on("value", snapshot => {
      const data = snapshot.val() || {};
      setCases(Object.keys(data).map(k => ({ id: k, ...data[k] })));
    });
    return () => ref.off("value", onValue);
  }, []);

  const handleCleanup = async (item) => {
      setLoadingMap(prev => ({...prev, [item.id]: true}));
      try {
          const urls = [];
          if (item.photosFolderLink) urls.push(item.photosFolderLink);
          if (item.filledForm?.url) urls.push(item.filledForm.url);
          if (item.photosFolder) {
              Object.values(item.photosFolder).forEach(arr => {
                  if (Array.isArray(arr)) arr.forEach(p => { if(p.uri && p.uri.includes('cloudinary')) urls.push(p.uri); });
              });
          }

          if (urls.length === 0) {
              Alert.alert("Info", "No Cloudinary URLs found in this case.");
              setLoadingMap(prev => ({...prev, [item.id]: false}));
              return;
          }

          let deletedCount = 0;
          for (const url of urls) {
              try {
                  await fetch(`${SERVER_URL}/cloudinary/destroy-from-url`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ url, resource_type: url.endsWith('.pdf') ? 'raw' : 'image' }),
                  });
                  deletedCount++;
              } catch(e) { console.warn(e); }
          }
          
          Alert.alert("Success", `Cleanup command sent for ${deletedCount} resources.`);
      } catch (e) {
          Alert.alert("Error", e.message);
      } finally {
          setLoadingMap(prev => ({...prev, [item.id]: false}));
      }
  };

  const filtered = cases.filter(c => {
      const s = search.toLowerCase();
      const matchesSearch = (c.matrixRefNo || c.id).toLowerCase().includes(s);
      
      let matchesDate = true;
      if (dateFilter === '>3m') {
          const dateToCheck = c.completedAt || c.assignedAt;
          if (dateToCheck) {
              const d = new Date(dateToCheck);
              const threeMonthsAgo = new Date();
              threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
              matchesDate = d < threeMonthsAgo;
          } else matchesDate = false;
      }
      return matchesSearch && matchesDate && c.status === 'completed';
  });

  return (
      <View style={styles.flexContainer}>
          <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#888" />
              <TextInput 
                  style={styles.searchInput} 
                  placeholder="Search Completed Cases..." 
                  placeholderTextColor="#888"
                  value={search}
                  onChangeText={setSearch}
              />
          </View>
          <View style={{flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 10}}>
              <TouchableOpacity onPress={() => setDateFilter(dateFilter === 'all' ? '>3m' : 'all')} style={[styles.filterChip, dateFilter === '>3m' && {backgroundColor: '#ff9800'}]}>
                  <Text style={[styles.filterText, dateFilter === '>3m' && {color: '#fff'}]}>{dateFilter === '>3m' ? '> 3 Months' : 'Date Filter'}</Text>
              </TouchableOpacity>
          </View>
          <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>Ref No</Text>
              <Text style={[styles.tableHeaderText, { flex: 0.8 }]}>Status</Text>
              <Text style={[styles.tableHeaderText, { flex: 1 }]}>Assigned To</Text>
              <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'right' }]}>Action</Text>
          </View>
          <FlatList 
              data={filtered}
              keyExtractor={i => i.id}
              contentContainerStyle={{paddingBottom: 20}}
              ListEmptyComponent={<Text style={{color: '#fff', textAlign: 'center', marginTop: 20}}>No completed cases found.</Text>}
              renderItem={({item}) => (
                  <View style={styles.tableRow}>
                      <Text style={[styles.tableCell, { flex: 1.5, fontWeight: 'bold' }]} numberOfLines={1}>{item.matrixRefNo || item.id}</Text>
                      <Text style={[styles.tableCell, { flex: 0.8, color: getStatusColor(item.status) }]}>{item.status?.toUpperCase()}</Text>
                      <Text style={[styles.tableCell, { flex: 1 }]} numberOfLines={1}>{item.assigneeName || item.assignedTo || '-'}</Text>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          {item.status === 'completed' ? (
                              <View style={{flexDirection: 'row'}}>
                              <GradientButton 
                                colors={['#f12711', '#f5af19']}
                                label="Clean Files"
                                small
                                onPress={() => handleCleanup(item)}
                                loading={loadingMap[item.id]}
                              />
                              </View>
                          ) : (
                              <Text style={{color: '#666', fontSize: 10, fontStyle: 'italic'}}>Active</Text>
                          )}
                      </View>
                  </View>
              )}
          />
      </View>
  );
}

function TicketsTab() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commentMap, setCommentMap] = useState({});

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const response = await databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.ticketsCollectionId,
        [Query.orderDesc("$createdAt")]
      );
      setTickets(response.documents);
    } catch (error) {
      console.error("Error fetching tickets:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleUpdateStatus = async (id, status) => {
    const comment = commentMap[id] || "";
    try {
      await databases.updateDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.ticketsCollectionId,
        id,
        { status, devComments: comment || undefined }
      );
      // Optimistic update
      setTickets(prev => prev.map(t => t.$id === id ? { ...t, status, devComments: comment || t.devComments } : t));
      setCommentMap(prev => ({ ...prev, [id]: "" }));
      if (Platform.OS === 'web') alert(`Ticket marked as ${status}`);
      else Alert.alert("Success", `Ticket marked as ${status}`);
    } catch (error) {
      Alert.alert("Error", error.message);
    }
  };

  return (
    <View style={styles.flexContainer}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarTitle}>Support Tickets</Text>
        <TouchableOpacity onPress={fetchTickets}>
          <Ionicons name="refresh" size={20} color="#8e24aa" />
        </TouchableOpacity>
      </View>
      <FlatList
        data={tickets}
        keyExtractor={item => item.$id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View style={[styles.card, { marginBottom: 10, borderLeftWidth: 4, borderLeftColor: item.status === 'open' ? '#ff9800' : item.status === 'closed' ? '#4caf50' : '#2196f3' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{item.subject}</Text>
              <Text style={{ color: '#aaa', fontSize: 12 }}>{new Date(item.$createdAt).toLocaleDateString()}</Text>
            </View>
            <Text style={{ color: '#ccc', marginBottom: 10 }}>{item.message}</Text>
            <Text style={{ color: '#888', fontSize: 12, marginBottom: 10 }}>From: {item.userName}</Text>
            
            <TextInput
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', padding: 8, borderRadius: 6, marginBottom: 10, fontSize: 12 }}
                placeholder="Add developer comment..."
                placeholderTextColor="#666"
                value={commentMap[item.$id] || ""}
                onChangeText={text => setCommentMap(prev => ({ ...prev, [item.$id]: text }))}
            />
            
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              {item.status !== 'closed' && (
                <GradientButton 
                  colors={['#11998e', '#38ef7d']}
                  label="Close Ticket"
                  small
                  onPress={() => handleUpdateStatus(item.$id, 'closed')}
                />
              )}
              {item.status === 'open' && (
                <GradientButton 
                  colors={['#2193b0', '#6dd5ed']}
                  label="In-Progress"
                  small
                  onPress={() => handleUpdateStatus(item.$id, 'in-progress')}
                />
              )}
              <View style={[styles.badge, { backgroundColor: '#333', marginLeft: 'auto' }]}>
                 <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}

function UsersTab({ users, onRevoke, onGrant }) {
  const [search, setSearch] = useState("");
  
  const filteredUsers = users.filter(u => 
    (u.name || "").toLowerCase().includes(search.toLowerCase()) || 
    (u.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.flexContainer}>
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#888" />
        <TextInput 
          style={styles.searchInput} 
          placeholder="Search users by name or email..." 
          placeholderTextColor="#888"
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View style={styles.userCard}>
            <View style={styles.userHeader}>
              <View style={styles.userAvatar}>
                <Text style={styles.userAvatarText}>{(item.name || "?").charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{item.name}</Text>
                <Text style={styles.userEmail}>{item.email}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: getStatusColor(item.status || 'active') }]}>
                <Text style={styles.badgeText}>{(item.status || 'active').toUpperCase()}</Text>
              </View>
            </View>
            <View style={styles.userDetails}>
              <Text style={styles.detailText}>ID: {item.id}</Text>
              <Text style={styles.detailText}>Role: {item.role}</Text>
              <Text style={styles.detailText}>Active: {item.lastActive}</Text>
            </View>
            <View style={styles.userActions}>
              <GradientButton 
                colors={['#485563', '#29323c']}
                label="JSON"
                small
                onPress={() => {
                  const json = JSON.stringify(item, null, 2);
                  if (Platform.OS === 'web') alert(json);
                  else Alert.alert("Details", json);
                }}
              />
              {item.status === 'banned' ? (
                <GradientButton colors={['#11998e', '#38ef7d']} label="Grant" small onPress={() => onGrant(item.id)} />
              ) : (
                <GradientButton colors={['#ff416c', '#ff4b2b']} label="Revoke" small onPress={() => onRevoke(item.id)} />
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

function TrackingTab({ cases = [], logs = [] }) {
  const events = [...cases]
    .sort((a, b) => {
      const at = new Date(a.updatedAt || a.completedAt || a.assignedAt || a.dateInitiated || 0).getTime();
      const bt = new Date(b.updatedAt || b.completedAt || b.assignedAt || b.dateInitiated || 0).getTime();
      return bt - at;
    })
    .slice(0, 80)
    .map((c) => ({
      id: c.id,
      time: new Date(c.updatedAt || c.completedAt || c.assignedAt || c.dateInitiated || 0),
      name: String(c.status || "unknown").toUpperCase(),
      params: `${c.matrixRefNo || c.RefNo || c.id} • ${c.assigneeName || c.assignedTo || "unassigned"} • ${c.city || "unknown city"}`,
    }));

  return (
    <View style={styles.flexContainer}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarTitle}>Live Case Tracking</Text>
        <View style={styles.liveIndicator}>
          <View style={styles.dot} />
          <Text style={styles.liveText}>{events.length} EVENTS</Text>
        </View>
      </View>
      <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
        <Text style={{ color: "#94a3b8", fontSize: 12 }}>Console logs captured: {logs.length}</Text>
      </View>
      <FlatList
        data={events}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View style={styles.logRow}>
            <Text style={styles.logTime}>{item.time.toLocaleTimeString()}</Text>
            <Text style={styles.logTag}>{item.name}</Text>
            <Text style={styles.logMessage}>{item.params}</Text>
          </View>
        )}
      />
    </View>
  );
}

function LogsTab({ logs, onClear }) {
  const [filter, setFilter] = useState("all");

  const filteredLogs = logs.filter(l => filter === "all" || l.type === filter);

  return (
    <View style={styles.flexContainer}>
      <View style={styles.filterBar}>
        {["all", "info", "warn", "error"].map(f => (
          <TouchableOpacity 
            key={f} 
            style={[styles.filterChip, filter === f && styles.activeFilterChip]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.activeFilterText]}>{f.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.clearButton} onPress={onClear}>
          <Ionicons name="trash-outline" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
      <FlatList
        data={filteredLogs}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 10 }}
        renderItem={({ item }) => (
          <View style={[styles.logItem, { borderLeftColor: getLogColor(item.type) }]}>
            <View style={styles.logHeader}>
              <Text style={[styles.logType, { color: getLogColor(item.type) }]}>{item.type.toUpperCase()}</Text>
              <Text style={styles.logTimestamp}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
            </View>
            <Text style={styles.logContent}>{item.message}</Text>
          </View>
        )}
      />
    </View>
  );
}

function NetworkTab({ requests, onClear }) {
  return (
    <View style={styles.flexContainer}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarTitle}>Network Inspector</Text>
        <TouchableOpacity onPress={onClear}>
          <Text style={styles.linkText}>Clear</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={requests}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 10 }}
        renderItem={({ item }) => (
          <View style={styles.networkCard}>
            <View style={styles.networkRow}>
              <Text style={[styles.method, { color: getMethodColor(item.method) }]}>{item.method}</Text>
              <Text style={styles.url} numberOfLines={1}>{item.url}</Text>
            </View>
            <View style={styles.networkRow}>
              <Text style={[styles.status, { color: item.status >= 400 ? '#ff4444' : '#4caf50' }]}>
                {item.status}
              </Text>
              <Text style={styles.meta}>{item.duration} • {item.time}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

function UtilsTab() {
  const handleViewKeys = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const message = `Storage Keys (${keys.length}):\n${JSON.stringify(keys, null, 2)}`;
      if (Platform.OS === 'web') alert(message);
      else Alert.alert("Async Storage", message);
    } catch (e) {
      console.error("Failed to get keys", e);
    }
  };

  const handleClearStorage = async () => {
    const confirmMsg = "Clear all Async Storage? This will log you out and reset app state.";
    const executeClear = async () => {
        await AsyncStorage.clear();
        if (Platform.OS === 'web') alert("Storage cleared.");
        else Alert.alert("Success", "Storage cleared.");
    };

    if (Platform.OS === 'web') {
        if (confirm(confirmMsg)) executeClear();
    } else {
        Alert.alert("Confirm", confirmMsg, [
            { text: "Cancel", style: "cancel" },
            { text: "Clear", style: "destructive", onPress: executeClear }
        ]);
    }
  };

  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Async Storage</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.listItem} onPress={handleViewKeys}>
            <Ionicons name="list" size={20} color="#ccc" />
            <Text style={styles.listItemText}>View Real Storage Keys</Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.listItem} onPress={handleClearStorage}>
            <Ionicons name="trash-bin" size={20} color="#ff4444" />
            <Text style={[styles.listItemText, { color: '#ff4444' }]}>Nuke All Storage</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Device Info</Text>
        <View style={styles.card}>
          <InfoRow label="OS" value={`${Platform.OS} ${Platform.Version}`} />
          <InfoRow label="Screen" value={`${Math.round(Dimensions.get('window').width)} x ${Math.round(Dimensions.get('window').height)}`} />
          <InfoRow label="Pixel Ratio" value={Dimensions.get('window').scale.toString()} />
        </View>
      </View>
    </ScrollView>
  );
}

function StatisticsTab({ users }) {
  const [statsData, setStatsData] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const screenWidth = Dimensions.get("window").width;
  const isWeb = Platform.OS === "web";
  const [requestStatus, setRequestStatus] = useState('none');

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const pending = await AsyncStorage.getItem("stats_request_pending");
        const approved = await AsyncStorage.getItem("stats_approved");
        
        if (approved === "true") {
          setRequestStatus('approved');
        } else if (pending === "true") {
          setRequestStatus('pending');
        } else {
          setRequestStatus('none');
        }
      } catch (e) {
        console.error(e);
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleGrant = async () => {
    await AsyncStorage.setItem("stats_approved", "true");
    await AsyncStorage.setItem("stats_request_pending", "false");
    setRequestStatus('approved');
  };

  const handleRevoke = async () => {
    await AsyncStorage.setItem("stats_approved", "false");
    setRequestStatus('none');
  };

  const chartConfig = {
    backgroundGradientFrom: "#1a1a1a",
    backgroundGradientTo: "#1a1a1a",
    color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    strokeWidth: 2,
    barPercentage: 0.5,
    decimalPlaces: 0,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
  };

  const handleCalculateStats = async () => {
    setCalculating(true);
    try {
      // 1. Fetch all cases
      const snapshot = await firebase.database().ref("cases").once("value");
      const data = snapshot.val() || {};
      const allCases = Object.keys(data).map(key => ({ id: key, ...data[key] }));

      // 1b. Fetch users if not available (for names)
      let currentUsers = users;
      if (!currentUsers || currentUsers.length === 0) {
         const uSnap = await firebase.database().ref("users").once("value");
         const uData = uSnap.val() || {};
         currentUsers = Object.keys(uData).map(key => ({ id: key, ...uData[key] }));
      }

      // 2. Calculate Stats
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

      let currentMonthCount = 0;
      let prevMonthCount = 0;
      
      // Data structures for new charts
      const statusCounts = { completed: 0, pending: 0, reverted: 0, audit: 0 };
      const dailyTrend = {}; // Last 30 days
      const memberCounts = {}; // "uid": count

      // Initialize last 30 days
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = `${d.getMonth() + 1}/${d.getDate()}`;
        dailyTrend[key] = 0;
      }

      allCases.forEach(c => {
        // Status Counts (Pie Chart)
        if (c.status === 'completed' || c.status === 'closed') statusCounts.completed++;
        else if (c.status === 'reverted') statusCounts.reverted++;
        else if (c.status === 'audit') statusCounts.audit++;
        else statusCounts.pending++; // assigned, open, etc.

        // Member Performance (All Time Completed)
        if ((c.status === 'completed' || c.status === 'closed') && c.assignedTo) {
             memberCounts[c.assignedTo] = (memberCounts[c.assignedTo] || 0) + 1;
        }

        if ((c.status === 'completed' || c.status === 'audit') && c.completedAt) {
          const d = new Date(c.completedAt);
          
          // Daily Trend (Last 30 days)
          const dayDiff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
          if (dayDiff < 30 && dayDiff >= 0) {
            const key = `${d.getMonth() + 1}/${d.getDate()}`;
            if (dailyTrend[key] !== undefined) dailyTrend[key]++;
          }

          // Monthly
          if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
            currentMonthCount++;
          } else if (d.getMonth() === prevMonth && d.getFullYear() === prevMonthYear) {
            prevMonthCount++;
          }
        }
      });

      // Format Pie Data
      const pieData = [
        { name: "Done", count: statusCounts.completed, color: "#4caf50", legendFontColor: "#7F7F7F", legendFontSize: 12 },
        { name: "Pending", count: statusCounts.pending, color: "#ff9800", legendFontColor: "#7F7F7F", legendFontSize: 12 },
        { name: "Reverted", count: statusCounts.reverted, color: "#f44336", legendFontColor: "#7F7F7F", legendFontSize: 12 },
        { name: "Audit", count: statusCounts.audit, color: "#2196f3", legendFontColor: "#7F7F7F", legendFontSize: 12 }
      ];

      // Format Trend Data
      const trendLabels = Object.keys(dailyTrend);
      const trendData = Object.values(dailyTrend);

      // Format Member Data (Top 5)
      const sortedMembers = Object.entries(memberCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      const memberLabels = sortedMembers.map(([uid]) => {
          const u = currentUsers.find(user => user.id === uid);
          return u ? (u.name || u.email.split('@')[0]).substring(0, 8) : "Unknown";
      });
      const memberData = sortedMembers.map(([, count]) => count);

      const growth = prevMonthCount === 0 ? 100 : Math.round(((currentMonthCount - prevMonthCount) / prevMonthCount) * 100);

      const statsPayload = {
        summary: statusCounts,
        currentMonthCount,
        prevMonthCount,
        growth,
        pieData,
        trendLabels,
        trendData,
        memberLabels,
        memberData
      };

      setStatsData(statsPayload);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to calculate stats");
    } finally {
      setCalculating(false);
    }
  };

  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Access Control</Text>
        <View style={styles.card}>
           {requestStatus === 'pending' && (
             <View>
               <Text style={{color: '#ffbb33', fontWeight: 'bold', marginBottom: 10, fontSize: 16}}>⚠️ Admin Requested Report Access</Text>
               <GradientButton 
                 colors={['#11998e', '#38ef7d']}
                 icon="paper-plane"
                 label="Send Report (Grant Access)"
                 onPress={handleGrant}
                 style={{ width: '100%' }}
               />
             </View>
           )}
           {requestStatus === 'approved' && (
             <View>
               <Text style={{color: '#4caf50', fontWeight: 'bold', marginBottom: 10, fontSize: 16}}>✅ Access Currently Granted</Text>
               <Text style={{color: '#ccc', fontSize: 12, marginBottom: 15}}>Revoke access at start of next month or manually.</Text>
               <GradientButton 
                 colors={['#ff416c', '#ff4b2b']}
                 icon="lock-closed"
                 label="Revoke Access"
                 onPress={handleRevoke}
                 style={{ width: '100%' }}
               />
             </View>
           )}
           {requestStatus === 'none' && (
             <Text style={{color: '#888', fontStyle: 'italic'}}>No pending requests.</Text>
           )}
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Live Analytics</Text>
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
             <InfoRow label="Status" value={statsData ? "Calculated" : "Idle"} />
             <TouchableOpacity onPress={handleCalculateStats} disabled={calculating}>
                <Ionicons name="refresh-circle" size={28} color="#4caf50" />
             </TouchableOpacity>
          </View>
          
          {!statsData && (
            <GradientButton 
              colors={['#8E2DE2', '#4A00E0']}
              icon="analytics"
              label="Generate Report"
              onPress={handleCalculateStats}
              loading={calculating}
              style={{ width: '100%', marginTop: 15 }}
            />
          )}

          {statsData && (
            <View>
                {/* Summary */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, marginTop: 10 }}>
                    <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: '#aaa', fontSize: 12 }}>COMPLETED</Text>
                        <Text style={{ color: '#4caf50', fontSize: 20, fontWeight: 'bold' }}>{statsData.summary?.completed}</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: '#aaa', fontSize: 12 }}>PENDING</Text>
                        <Text style={{ color: '#ff9800', fontSize: 20, fontWeight: 'bold' }}>{statsData.summary?.pending}</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: '#aaa', fontSize: 12 }}>GROWTH</Text>
                        <Text style={{ color: statsData.growth >= 0 ? '#4caf50' : '#f44336', fontSize: 20, fontWeight: 'bold' }}>{statsData.growth}%</Text>
                    </View>
                </View>

                {/* Pie Chart */}
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold', marginBottom: 10 }}>Status Distribution</Text>
                {isWeb ? (
                    <View style={styles.dsChartFallback}>
                        <Text style={styles.dsChartFallbackText}>Status chart unavailable on web build.</Text>
                    </View>
                ) : (
                    <PieChart
                        data={statsData.pieData}
                        width={screenWidth - 80}
                        height={200}
                        chartConfig={chartConfig}
                        accessor={"count"}
                        backgroundColor={"transparent"}
                        paddingLeft={"15"}
                        absolute
                    />
                )}

                {/* Line Chart */}
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold', marginTop: 20, marginBottom: 10 }}>30-Day Trend</Text>
                {isWeb ? (
                    <View style={styles.dsChartFallback}>
                        <Text style={styles.dsChartFallbackText}>Trend chart unavailable on web build.</Text>
                    </View>
                ) : (
                    <LineChart
                        data={{
                            labels: statsData.trendLabels.filter((_, i) => i % 5 === 0), // Show fewer labels
                            datasets: [{ data: statsData.trendData }]
                        }}
                        width={screenWidth - 80}
                        height={220}
                        chartConfig={{
                            ...chartConfig,
                            decimalPlaces: 0,
                            color: (opacity = 1) => `rgba(33, 150, 243, ${opacity})`,
                        }}
                        bezier
                        style={{ borderRadius: 16 }}
                    />
                )}

                {/* Bar Chart */}
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold', marginTop: 20, marginBottom: 10 }}>Top Performers</Text>
                {statsData.memberLabels.length > 0 ? (
                    isWeb ? (
                      <View style={styles.dsChartFallback}>
                        <Text style={styles.dsChartFallbackText}>Performer chart unavailable on web build.</Text>
                      </View>
                    ) : (
                      <BarChart
                          data={{
                              labels: statsData.memberLabels,
                              datasets: [{ data: statsData.memberData }]
                          }}
                          width={screenWidth - 80}
                          height={220}
                          yAxisLabel=""
                          chartConfig={{
                              ...chartConfig,
                              color: (opacity = 1) => `rgba(255, 152, 0, ${opacity})`,
                          }}
                          verticalLabelRotation={30}
                          style={{ borderRadius: 16 }}
                      />
                    )
                ) : (
                    <Text style={{ color: '#666', fontStyle: 'italic' }}>No member data available</Text>
                )}
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}


function ControlCenterTab({ users = [], logs = [], networkRequests = [], cases = [], alerts = [], tickets = [], featureFlags = {} }) {
  const totalUsers = users.length;
  const activeDaily = users.filter((u) => u.lastSeen && (Date.now() - new Date(u.lastSeen).getTime()) < 24 * 60 * 60 * 1000).length;
  const activeMonthly = users.filter((u) => u.lastSeen && (Date.now() - new Date(u.lastSeen).getTime()) < 30 * 24 * 60 * 60 * 1000).length;
  const totalReq = networkRequests.length;
  const errorReq = networkRequests.filter((r) => r.status === "ERR" || Number(r.status) >= 400).length;
  const errorRate = totalReq ? ((errorReq / totalReq) * 100).toFixed(2) : "0.00";
  const openCases = cases.filter((c) => ["open", "assigned", "audit", "reverted", "fired"].includes(String(c.status || "").toLowerCase())).length;
  const completedCases = cases.filter((c) => String(c.status || "").toLowerCase() === "completed").length;
  const activeAlerts = alerts.filter((a) => a?.active !== false).length;
  const openTickets = tickets.filter((t) => String(t?.status || "").toLowerCase() !== "closed").length;

  const snapshot = [
    ["Total Users", totalUsers],
    ["Active Users (24h)", activeDaily],
    ["Active Users (30d)", activeMonthly],
    ["Total Cases", cases.length],
    ["Open Cases", openCases],
    ["Completed Cases", completedCases],
    ["Open Tickets", openTickets],
    ["Active Alerts", activeAlerts],
    ["API Requests", totalReq],
    ["Error Rate", `${errorRate}%`],
    ["Maintenance(Admin)", String(featureFlags.maintenanceModeAdmin ? "ON" : "OFF")],
    ["Maintenance(Member)", String(featureFlags.maintenanceModeMember ? "ON" : "OFF")],
  ];

  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Snapshot</Text>
        <View style={styles.card}>
          {snapshot.map(([k, v]) => <InfoRow key={k} label={k} value={String(v)} />)}
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Activity Logs</Text>
        <View style={styles.card}>
          {logs.slice(0, 8).map((log) => (
            <View key={log.id} style={styles.logRow}>
              <Text style={styles.logTime}>{new Date(log.timestamp).toLocaleTimeString()}</Text>
              <Text style={styles.logTag}>{log.type.toUpperCase()}</Text>
              <Text style={styles.logMessage} numberOfLines={1}>{log.message}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function ModuleChecklist({ title, items, canManage = true }) {
  return (
    <View style={[styles.card, { marginBottom: 12 }]}> 
      <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>{title}</Text>
      {!canManage && <Text style={{ color: "#ffbb33", marginBottom: 8 }}>Read-only: elevated role required for dangerous actions.</Text>}
      {items.map((item) => (
        <View key={item} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
          <Ionicons name="checkmark-circle-outline" size={16} color="#4caf50" style={{ marginRight: 8 }} />
          <Text style={{ color: "#ddd", flex: 1 }}>{item}</Text>
        </View>
      ))}
    </View>
  );
}


function AlertsTab({ currentUser }) {
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState("warning");
  const [targetMode, setTargetMode] = useState("all");
  const [targetUid, setTargetUid] = useState("");
  const [templateId, setTemplateId] = useState(null);
  const [sending, setSending] = useState(false);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [userDirectory, setUserDirectory] = useState([]);
  const [missingPhotoTargets, setMissingPhotoTargets] = useState([]);
  const [selectedTargetIds, setSelectedTargetIds] = useState([]);
  const [templateNotice, setTemplateNotice] = useState("");

  useEffect(() => {
    const ref = firebase.database().ref("memberAlerts").limitToLast(25);
    const listener = ref.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data).map((id) => ({ id, ...data[id] }));
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setRecentAlerts(list);
    });
    return () => ref.off("value", listener);
  }, []);

  useEffect(() => {
    const ref = firebase.database().ref("users");
    const listener = ref.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data).map((id) => ({ id, ...data[id] }));
      setUserDirectory(list);
    });
    return () => ref.off("value", listener);
  }, []);

  const resolveTargetUser = (input) => {
    const val = String(input || "").trim().toLowerCase();
    if (!val) return null;
    return userDirectory.find((u) =>
      String(u.id || "").toLowerCase() === val ||
      String(u.uniqueId || "").toLowerCase() === val ||
      String(u.email || "").toLowerCase() === val
    ) || null;
  };

  const getUserCases = async (uid) => {
    const snap = await firebase.database().ref("cases").orderByChild("assignedTo").equalTo(uid).once("value");
    const data = snap.val() || {};
    return Object.keys(data).map((id) => ({ id, ...data[id] }));
  };

  const getUsersMissingProfilePhoto = () => {
    return userDirectory
      .filter((u) => !String(u.photoURL || "").trim())
      .map((u) => ({
        uid: u.id,
        name: u.name || u.email || u.id,
        uniqueId: u.uniqueId || "",
        email: u.email || "",
      }));
  };

  const toggleTargetSelect = (uid) => {
    setSelectedTargetIds((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  };

  const addTypedTarget = () => {
    const resolved = resolveTargetUser(targetUid);
    if (!resolved) return Alert.alert("Invalid Target", "Enter valid UID / uniqueId / email.");
    if (templateId === "photo_upload") {
      const allowed = missingPhotoTargets.some((t) => t.uid === resolved.id);
      if (!allowed) return Alert.alert("Not Eligible", "This user already has profile photo uploaded.");
    }
    setSelectedTargetIds((prev) => (prev.includes(resolved.id) ? prev : [...prev, resolved.id]));
    setTemplateNotice(`Added ${resolved.name || resolved.email || resolved.id} to selected targets.`);
    setTargetUid("");
  };

  const applyTemplate = async (templateId) => {
    const needUser = ["pending_over_8", "low_completion"].includes(templateId);
    setTemplateId(templateId);
    setTemplateNotice("");
    if (needUser && targetMode !== "user") return Alert.alert("Select Target", "This template requires SINGLE UID target mode.");
    const targetUser = targetMode === "user" ? resolveTargetUser(targetUid) : null;
    if (needUser && !targetUser) {
      return Alert.alert("Invalid Target", "Enter valid UID / uniqueId / email.");
    }

    try {
      if (templateId === "photo_upload") {
        const targets = getUsersMissingProfilePhoto();
        if (targets.length === 0) {
          setMissingPhotoTargets([]);
          return Alert.alert("Rule Check", "No users found without profile photo.");
        }
        setMissingPhotoTargets(targets);
        setSelectedTargetIds([]);
        setTargetMode("user");
        setSeverity("warning");
        setMessage(`Please upload your profile photo in app immediately.`);
        setTemplateNotice(`Found ${targets.length} users without profile photo. Select one or more targets and send.`);
        return;
      }
      if (templateId === "pending_over_8") {
        const cases = await getUserCases(targetUser.id);
        const pending = cases.filter((c) => ["assigned", "audit", "open"].includes(String(c.status || "").toLowerCase())).length;
        if (pending <= 8) return Alert.alert("Rule Check", `Pending cases are ${pending}. Need more than 8.`);
        setSeverity("critical");
        setMessage(`You have ${pending} pending cases. Clear backlog immediately.`);
        setTemplateNotice("Pending > 8 critical warning prepared.");
        return;
      }
      if (templateId === "low_completion") {
        const cases = await getUserCases(targetUser.id);
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const completed = cases.filter((c) => {
          const okStatus = ["completed", "closed"].includes(String(c.status || "").toLowerCase());
          const ts = c.completedAt ? new Date(c.completedAt).getTime() : 0;
          return okStatus && ts >= thirtyDaysAgo;
        }).length;
        if (completed >= 3) return Alert.alert("Rule Check", `Completion is ${completed} in 30 days (not low).`);
        setSeverity("warning");
        setMessage("Cases completed is very low this month. Improve completion performance.");
        setTemplateNotice("Low completion warning prepared.");
        return;
      }
      if (templateId === "security_warning") {
        setSeverity("critical");
        setMessage("Security warning: suspicious activity detected. Follow security protocol.");
        setTemplateNotice("Security warning prepared.");
        return;
      }
      if (templateId === "appreciation") {
        setSeverity("appreciation");
        setMessage("Great work. Your recent performance is appreciated by the team.");
        setTemplateNotice("Appreciation message prepared.");
        return;
      }
    } catch (e) {
      Alert.alert("Template Error", e.message);
    }
  };

  const handleSendAlert = async () => {
    const text = message.trim();
    if (!text) return Alert.alert("Validation", "Enter alert message.");
    try {
      setSending(true);
      const selected = selectedTargetIds.filter(Boolean);
      if (templateId === "photo_upload" && targetMode === "user" && selected.length === 0) {
        setSending(false);
        return Alert.alert("Validation", "Select one or more users from missing-photo list.");
      }
      if (selected.length > 0) {
        await Promise.all(
          selected.map((uid) =>
            firebase.database().ref("memberAlerts").push({
              message: text,
              severity,
              templateId: templateId || null,
              active: true,
              targetType: "user",
              targetUid: uid,
              targetQuery: uid,
              createdAt: Date.now(),
              createdBy: currentUser?.email || currentUser?.uid || "dev",
            })
          )
        );
      } else if (targetMode === "user") {
        if (!targetUid.trim()) {
          setSending(false);
          return Alert.alert("Validation", "Enter target UID / uniqueId / email or pick from list.");
        }
        const targetUser = resolveTargetUser(targetUid);
        if (!targetUser) {
          setSending(false);
          return Alert.alert("Validation", "Target not found. Use UID / uniqueId / email.");
        }
        await firebase.database().ref("memberAlerts").push({
          message: text,
          severity,
          templateId: templateId || null,
          active: true,
          targetType: "user",
          targetUid: targetUser.id,
          targetQuery: targetUid.trim(),
          createdAt: Date.now(),
          createdBy: currentUser?.email || currentUser?.uid || "dev",
        });
      } else {
        await firebase.database().ref("memberAlerts").push({
          message: text,
          severity,
          templateId: templateId || null,
          active: true,
          targetType: "all",
          targetUid: null,
          targetQuery: null,
          createdAt: Date.now(),
          createdBy: currentUser?.email || currentUser?.uid || "dev",
        });
      }
      setMessage("");
      setTemplateId(null);
      setTemplateNotice("");
      setSelectedTargetIds([]);
      if (targetMode === "user") setTargetUid("");
      Alert.alert("Sent", "Alert sent.");
    } catch (e) {
      Alert.alert("Error", "Failed to send alert: " + e.message);
    } finally {
      setSending(false);
    }
  };

  const retriggerAlert = async (baseAlert) => {
    const selected = selectedTargetIds.filter(Boolean);
    if (selected.length === 0) return Alert.alert("Select Targets", "Pick one or more users from the list first.");
    try {
      setSending(true);
      await Promise.all(
        selected.map((uid) =>
          firebase.database().ref("memberAlerts").push({
            message: baseAlert.message,
            severity: baseAlert.severity || "warning",
            templateId: baseAlert.templateId || null,
            active: true,
            targetType: "user",
            targetUid: uid,
            targetQuery: uid,
            createdAt: Date.now(),
            createdBy: currentUser?.email || currentUser?.uid || "dev",
            retriggerOf: baseAlert.id,
          })
        )
      );
      Alert.alert("Retriggered", `Alert retriggered to ${selected.length} user(s).`);
    } catch (e) {
      Alert.alert("Error", "Retrigger failed: " + e.message);
    } finally {
      setSending(false);
    }
  };

  const setActive = async (id, active) => {
    try {
      await firebase.database().ref("memberAlerts/" + id).update({ active });
    } catch (e) {
      Alert.alert("Error", "Failed to update alert: " + e.message);
    }
  };

  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Alerts Broadcast</Text>
        <View style={styles.card}>
          <Text style={styles.inputLabel}>Predefined Alerts</Text>
          <View style={styles.segmentRow}>
            <TouchableOpacity style={styles.segmentBtn} onPress={() => applyTemplate("photo_upload")}><Text style={styles.segmentBtnText}>Upload Photo</Text></TouchableOpacity>
            <TouchableOpacity style={styles.segmentBtn} onPress={() => applyTemplate("pending_over_8")}><Text style={styles.segmentBtnText}>Pending &gt; 8</Text></TouchableOpacity>
            <TouchableOpacity style={styles.segmentBtn} onPress={() => applyTemplate("low_completion")}><Text style={styles.segmentBtnText}>Low Completion</Text></TouchableOpacity>
            <TouchableOpacity style={styles.segmentBtn} onPress={() => applyTemplate("security_warning")}><Text style={styles.segmentBtnText}>Security</Text></TouchableOpacity>
            <TouchableOpacity style={styles.segmentBtn} onPress={() => applyTemplate("appreciation")}><Text style={styles.segmentBtnText}>Appreciation</Text></TouchableOpacity>
          </View>
          <Text style={styles.inputLabel}>Severity</Text>
          <View style={styles.segmentRow}>
            {[{ id: "info", color: "#38bdf8" }, { id: "warning", color: "#fbbf24" }, { id: "critical", color: "#f87171" }, { id: "appreciation", color: "#22c55e" }].map((s) => (
              <TouchableOpacity key={s.id} onPress={() => setSeverity(s.id)} style={[styles.segmentBtn, severity === s.id && { borderColor: s.color, backgroundColor: s.color + "22" }]}>
                <Text style={[styles.segmentBtnText, severity === s.id && { color: s.color }]}>{s.id.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.inputLabel, { marginTop: 10 }]}>Target</Text>
          <View style={styles.segmentRow}>
            <TouchableOpacity onPress={() => setTargetMode("all")} style={[styles.segmentBtn, targetMode === "all" && styles.segmentBtnActive]}>
              <Text style={[styles.segmentBtnText, targetMode === "all" && styles.segmentBtnTextActive]}>ALL MEMBERS</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTargetMode("user")} style={[styles.segmentBtn, targetMode === "user" && styles.segmentBtnActive]}>
              <Text style={[styles.segmentBtnText, targetMode === "user" && styles.segmentBtnTextActive]}>SINGLE UID</Text>
            </TouchableOpacity>
          </View>
          {targetMode === "user" && (
            <View style={styles.targetInputRow}>
              <TextInput style={[styles.alertInput, { flex: 1, marginTop: 0 }]} placeholder="Target UID / uniqueId / email" placeholderTextColor="#64748b" value={targetUid} onChangeText={setTargetUid} />
              <TouchableOpacity style={styles.addTargetBtn} onPress={addTypedTarget}>
                <Text style={styles.addTargetBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          )}
          {templateNotice ? <Text style={styles.templateNotice}>{templateNotice}</Text> : null}
          {selectedTargetIds.length > 0 && templateId !== "photo_upload" && (
            <View style={styles.targetListWrap}>
              <ScrollView style={styles.targetListScroll} contentContainerStyle={styles.targetListContent} nestedScrollEnabled>
                {selectedTargetIds.map((uid) => {
                  const u = userDirectory.find((x) => x.id === uid) || {};
                  const selected = true;
                  return (
                    <TouchableOpacity key={uid} style={[styles.targetChip, selected && styles.targetChipActive]} onPress={() => toggleTargetSelect(uid)}>
                      <Text style={[styles.targetChipText, selected && styles.targetChipTextActive]}>
                        {u.name || u.email || uid} ({u.uniqueId || uid.slice(0, 6)})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
          {missingPhotoTargets.length > 0 && templateId === "photo_upload" && (
            <View style={styles.targetListWrap}>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 6 }}>
                <TouchableOpacity style={styles.segmentBtn} onPress={() => setSelectedTargetIds(missingPhotoTargets.map((t) => t.uid))}>
                  <Text style={styles.segmentBtnText}>Select All</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.segmentBtn} onPress={() => setSelectedTargetIds([])}>
                  <Text style={styles.segmentBtnText}>Clear</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.targetListScroll} contentContainerStyle={styles.targetListContent} nestedScrollEnabled>
                {missingPhotoTargets.map((t) => {
                  const selected = selectedTargetIds.includes(t.uid);
                  return (
                    <TouchableOpacity key={t.uid} style={[styles.targetChip, selected && styles.targetChipActive]} onPress={() => toggleTargetSelect(t.uid)}>
                      <Text style={[styles.targetChipText, selected && styles.targetChipTextActive]}>
                        {t.name} ({t.uniqueId || t.uid.slice(0, 6)})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
          <View style={styles.alertComposerWrap}>
            <TextInput style={[styles.alertInput, styles.alertTextArea]} placeholder="Write warning/alert message for member dashboard..." placeholderTextColor="#64748b" value={message} onChangeText={setMessage} multiline />
            <GradientButton colors={severity === "critical" ? ["#ef4444", "#b91c1c"] : ["#0ea5e9", "#0284c7"]} icon="send-outline" label={sending ? "Sending..." : "Send Alert"} onPress={handleSendAlert} disabled={sending} loading={sending} style={{ marginTop: 14 }} />
          </View>
        </View>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Live Alert Queue ({recentAlerts.length})</Text>
        <View style={styles.card}>
          {recentAlerts.length === 0 ? (
            <Text style={{ color: "#94a3b8" }}>No alerts sent yet.</Text>
          ) : (
            recentAlerts.map((a) => (
              <View key={a.id} style={styles.alertQueueRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.alertQueueMsg} numberOfLines={2}>{a.message}</Text>
                  <Text style={styles.alertQueueMeta}>{String(a.severity || "info").toUpperCase()} • {a.targetType === "user" ? "UID: " + a.targetUid : "ALL"} • {a.active === false ? "INACTIVE" : "ACTIVE"}</Text>
                </View>
                <TouchableOpacity onPress={() => setActive(a.id, a.active === false)} style={styles.alertQueueActionBtn}>
                  <Text style={styles.alertQueueActionText}>{a.active === false ? "Enable" : "Disable"}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => retriggerAlert(a)} style={[styles.alertQueueActionBtn, { marginLeft: 6 }]}>
                  <Text style={styles.alertQueueActionText}>Retrigger</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function StatusTab({ cases = [], users = [], currentUser }) {
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState({});

  const userMap = users.reduce((acc, u) => {
    acc[u.id] = u;
    return acc;
  }, {});

  const filtered = cases.filter((c) => {
    const s = search.trim().toLowerCase();
    if (!s) return true;
    return (
      String(c.matrixRefNo || c.RefNo || c.id || "").toLowerCase().includes(s) ||
      String(c.candidateName || "").toLowerCase().includes(s) ||
      String(c.assigneeName || c.assignedTo || "").toLowerCase().includes(s)
    );
  }).slice(0, 200);

  const updateCaseStatus = async (item, nextStatus) => {
    if (!nextStatus || nextStatus === item.status) return;
    setUpdating((prev) => ({ ...prev, [item.id]: true }));
    try {
      const nowIso = new Date().toISOString();
      const payload = {
        status: nextStatus,
        updatedAt: nowIso,
        devStatusUpdatedAt: Date.now(),
        devStatusUpdatedBy: currentUser?.uid || "dev_manual_override",
      };
      if (nextStatus === "completed") {
        payload.completedAt = item.completedAt || nowIso;
        payload.finalizedAt = Date.now();
      }
      if (nextStatus === "reverted") payload.revertedAt = Date.now();
      if (nextStatus === "audit") payload.auditAt = Date.now();
      if (nextStatus === "fired") payload.firedAt = Date.now();
      await firebase.database().ref(`cases/${item.id}`).update(payload);
    } catch (error) {
      Alert.alert("Status Update Failed", error.message);
    } finally {
      setUpdating((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  return (
    <View style={styles.flexContainer}>
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color="#94a3b8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search ref/candidate/assignee..."
          placeholderTextColor="#64748b"
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        renderItem={({ item }) => {
          const assignee = userMap[item.assignedTo];
          return (
            <View style={styles.statusCaseCard}>
              <View style={styles.statusCaseTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.statusCaseRef}>{item.matrixRefNo || item.RefNo || item.id}</Text>
                  <Text style={styles.statusCaseMeta} numberOfLines={1}>{item.candidateName || "Unknown Candidate"} • {item.city || "Unknown City"}</Text>
                  <Text style={styles.statusCaseMeta} numberOfLines={1}>Assignee: {item.assigneeName || assignee?.name || item.assignedTo || "Unassigned"}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: getStatusColor(item.status || "unknown") }]}>
                  <Text style={styles.badgeText}>{String(item.status || "unknown").toUpperCase()}</Text>
                </View>
              </View>
              <View style={styles.statusPickerWrap}>
                <Text style={styles.statusPickerLabel}>Change Status</Text>
                <Picker
                  selectedValue={String(item.status || "open").toLowerCase()}
                  onValueChange={(value) => updateCaseStatus(item, value)}
                  style={styles.statusPicker}
                  dropdownIconColor="#e2e8f0"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <Picker.Item key={s} label={s.toUpperCase()} value={s} color="#e2e8f0" />
                  ))}
                </Picker>
                {updating[item.id] && <ActivityIndicator color="#38bdf8" size="small" />}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={{ color: "#94a3b8", textAlign: "center", marginTop: 40 }}>No cases found.</Text>}
      />
    </View>
  );
}

function RolesPermissionsTab({ canManage, users = [] }) {
  const roleCounts = users.reduce((acc, u) => {
    const role = String(u.role || "unknown").toLowerCase();
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});
  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <View style={styles.card}>
        <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Roles & Permissions (Live)</Text>
        <InfoRow label="Total Users" value={String(users.length)} />
        {Object.keys(roleCounts).sort().map((role) => (
          <InfoRow key={role} label={`Role: ${role}`} value={String(roleCounts[role])} />
        ))}
        {!canManage && <Text style={{ color: "#ffbb33", marginTop: 8 }}>Read-only mode for this account.</Text>}
      </View>
    </ScrollView>
  );
}

function ContentManagementTab({ canManage, cases = [] }) {
  const uploaded = cases.filter((c) => !!c.ingestedAt).length;
  const withPhotos = cases.filter((c) => !!c.photosFolderLink).length;
  const withForms = cases.filter((c) => !!c.filledForm || !!c.filledFormLink).length;
  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <View style={styles.card}>
        <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Content Layer (Cases)</Text>
        <InfoRow label="Total Cases" value={String(cases.length)} />
        <InfoRow label="Uploaded/Ingested Cases" value={String(uploaded)} />
        <InfoRow label="Cases With Photo Folder" value={String(withPhotos)} />
        <InfoRow label="Cases With Filled Form" value={String(withForms)} />
        {!canManage && <Text style={{ color: "#ffbb33", marginTop: 8 }}>Read-only mode for this account.</Text>}
      </View>
    </ScrollView>
  );
}

function AppConfigTab({ featureFlags = {}, toggleFeatureFlag = () => {}, canManage, cases = [], users = [], currentUser }) {
  const [sendingOverdueWarning, setSendingOverdueWarning] = useState(false);
  const [lastOverdueRun, setLastOverdueRun] = useState(null);

  const sendOverdueCaseWarnings = async () => {
    if (!canManage) {
      Alert.alert("Access Denied", "Only admin/dev can trigger overdue warnings.");
      return;
    }

    const now = Date.now();
    const overdueMs = 4 * 24 * 60 * 60 * 1000;
    const userMap = users.reduce((acc, u) => {
      acc[u.id] = u;
      return acc;
    }, {});

    const overdueCases = cases
      .map((c) => {
        const status = String(c?.status || "").toLowerCase();
        if (!c?.assignedTo) return null;
        if (status === "completed" || status === "closed") return null;
        const baseTime = new Date(c.assignedAt || c.dateInitiated || c.createdAt || 0).getTime();
        if (!baseTime || Number.isNaN(baseTime)) return null;
        const ageMs = now - baseTime;
        if (ageMs <= overdueMs) return null;
        const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
        const refNo = c.matrixRefNo || c.RefNo || c.id;
        return { ...c, refNo, ageDays };
      })
      .filter(Boolean);

    if (overdueCases.length === 0) {
      Alert.alert("No Overdue Cases", "No assigned cases are older than 4 days.");
      return;
    }

    try {
      setSendingOverdueWarning(true);
      const groupedByMember = overdueCases.reduce((acc, c) => {
        if (!acc[c.assignedTo]) acc[c.assignedTo] = [];
        acc[c.assignedTo].push(c);
        return acc;
      }, {});
      const memberIds = Object.keys(groupedByMember);

      await Promise.all(
        memberIds.map((uid) => {
          const member = userMap[uid] || {};
          const memberCases = groupedByMember[uid] || [];
          const caseList = memberCases.map((c) => `${c.refNo} (${c.ageDays}d)`).join(", ");
          const message = `Day limit exceeded. Overdue cases: ${caseList}. Complete immediately to avoid being fined.`;
          return firebase.database().ref("memberAlerts").push({
            message,
            severity: "critical",
            active: true,
            targetType: "user",
            targetUid: uid,
            targetQuery: String(member.uniqueId || member.email || uid),
            overdueCaseIds: memberCases.map((c) => c.id),
            overdueCaseRefs: memberCases.map((c) => c.refNo),
            overdueCaseDays: memberCases.map((c) => c.ageDays),
            overdueCaseCount: memberCases.length,
            templateId: "overdue_case_4_days_consolidated",
            createdAt: Date.now(),
            createdBy: currentUser?.email || currentUser?.uid || "dev",
          });
        })
      );

      const impactedUsers = memberIds.length;
      setLastOverdueRun({
        at: Date.now(),
        totalAlerts: impactedUsers,
        impactedUsers,
        rows: overdueCases.slice(0, 12).map((c) => ({
          id: c.id,
          refNo: c.refNo,
          assignee: c.assigneeName || userMap[c.assignedTo]?.name || c.assignedTo,
          days: c.ageDays,
        })),
      });
      Alert.alert("Warnings Sent", `Sent ${impactedUsers} consolidated warning(s) to ${impactedUsers} member(s).`);
    } catch (e) {
      Alert.alert("Error", "Failed to send warnings: " + e.message);
    } finally {
      setSendingOverdueWarning(false);
    }
  };

  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <ModuleChecklist canManage={canManage} title="App Configuration Panel" items={[
        "Feature toggles",
        "Maintenance mode",
        "Environment config (Dev/Staging/Prod)",
        "API keys management",
        "Email/SMS + payment + third-party config",
      ]} />
      <View style={styles.card}>
        <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Live Feature Flags</Text>
        {Object.keys(featureFlags).map((key) => (
          <View key={key} style={styles.switchRow}>
            <Text style={styles.switchLabel}>{key}</Text>
            <TouchableOpacity disabled={!canManage} onPress={() => toggleFeatureFlag(key)}>
              <Ionicons name={featureFlags[key] ? "toggle" : "toggle-outline"} size={32} color={featureFlags[key] ? "#4caf50" : "#666"} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
      <View style={[styles.card, { marginTop: 12 }]}>
        <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Overdue Warning Trigger</Text>
        <Text style={{ color: "#cbd5e1", fontSize: 12, marginBottom: 10 }}>
          Sends a critical alert to members with assigned cases older than 4 days.
        </Text>
        <GradientButton
          colors={["#b91c1c", "#ef4444"]}
          icon="warning-outline"
          label={sendingOverdueWarning ? "Sending Warnings..." : "Warn Overdue Members (4+ days)"}
          onPress={sendOverdueCaseWarnings}
          disabled={!canManage || sendingOverdueWarning}
          loading={sendingOverdueWarning}
        />
        {lastOverdueRun && (
          <View style={{ marginTop: 12 }}>
            <InfoRow label="Last Run" value={new Date(lastOverdueRun.at).toLocaleString()} />
            <InfoRow label="Alerts Sent" value={String(lastOverdueRun.totalAlerts)} />
            <InfoRow label="Members Impacted" value={String(lastOverdueRun.impactedUsers)} />
            <Text style={{ color: "#94a3b8", fontSize: 12, marginTop: 8, marginBottom: 6 }}>Recent alerted cases</Text>
            {lastOverdueRun.rows.map((r) => (
              <Text key={r.id} style={{ color: "#e2e8f0", fontSize: 12, marginBottom: 4 }}>
                {r.refNo} • {r.assignee} • {r.days} days
              </Text>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function AnalyticsInsightsTab({ cases = [], users = [], tickets = [] }) {
  const statusCounts = cases.reduce((acc, c) => {
    const key = String(c.status || "unknown").toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <View style={styles.card}>
        <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Analytics Hub (Live)</Text>
        <InfoRow label="Users" value={String(users.length)} />
        <InfoRow label="Cases" value={String(cases.length)} />
        <InfoRow label="Tickets" value={String(tickets.length)} />
        {Object.keys(statusCounts).sort().map((status) => (
          <InfoRow key={status} label={`Cases: ${status}`} value={String(statusCounts[status])} />
        ))}
      </View>
    </ScrollView>
  );
}

function MonitoringTab({ logs = [], requests = [], cases = [] }) {
  const crashCount = logs.filter((l) => l.message?.toLowerCase().includes("crash")).length;
  const errReq = requests.filter((r) => r.status === "ERR" || Number(r.status) >= 400).length;
  const updatedToday = cases.filter((c) => {
    const d = new Date(c.updatedAt || c.assignedAt || c.completedAt || 0);
    const t = new Date();
    return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  }).length;
  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <View style={styles.card}>
        <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Monitoring (Live)</Text>
        <InfoRow label="Logs Captured" value={String(logs.length)} />
        <InfoRow label="Network Requests" value={String(requests.length)} />
        <InfoRow label="Request Errors" value={String(errReq)} />
        <InfoRow label="Crash-like Logs" value={String(crashCount)} />
        <InfoRow label="Cases Updated Today" value={String(updatedToday)} />
      </View>
    </ScrollView>
  );
}

function BillingSubscriptionTab({ canManage, tickets = [], cases = [], users = [] }) {
  const completed = cases.filter((c) => String(c.status || "").toLowerCase() === "completed").length;
  const closedTickets = tickets.filter((t) => String(t.status || "").toLowerCase() === "closed").length;
  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <View style={styles.card}>
        <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Billing / Ops Signals (Live)</Text>
        <InfoRow label="Total Users" value={String(users.length)} />
        <InfoRow label="Completed Cases (Billable Candidate)" value={String(completed)} />
        <InfoRow label="Closed Tickets" value={String(closedTickets)} />
        <InfoRow label="Open Tickets" value={String(Math.max(0, tickets.length - closedTickets))} />
        {!canManage && <Text style={{ color: "#ffbb33", marginTop: 8 }}>Read-only mode for this account.</Text>}
      </View>
    </ScrollView>
  );
}

function SecurityCenterTab({ canManage }) {
  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <ModuleChecklist canManage={canManage} title="Security Center" items={[
        "2FA enforcement",
        "IP whitelist/blacklist",
        "Device management",
        "Suspicious activity detection",
        "Security logs + GDPR export/delete",
      ]} />
    </ScrollView>
  );
}

function NotificationCenterTab({ alerts = [], users = [] }) {
  const active = alerts.filter((a) => a?.active !== false).length;
  const acknowledgements = alerts.reduce((n, a) => n + Object.keys(a?.ackBy || {}).length, 0);
  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <View style={styles.card}>
        <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Comms Center (Live)</Text>
        <InfoRow label="Directory Size" value={String(users.length)} />
        <InfoRow label="Alerts (Total)" value={String(alerts.length)} />
        <InfoRow label="Alerts (Active)" value={String(active)} />
        <InfoRow label="Total Acknowledgements" value={String(acknowledgements)} />
      </View>
    </ScrollView>
  );
}

function ApiIntegrationTab({ canManage, requests = [], logs = [] }) {
  const methods = requests.reduce((acc, r) => {
    const m = String(r.method || "UNKNOWN").toUpperCase();
    acc[m] = (acc[m] || 0) + 1;
    return acc;
  }, {});
  const errReq = requests.filter((r) => r.status === "ERR" || Number(r.status) >= 400).length;
  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <View style={styles.card}>
        <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>API Monitor (Live)</Text>
        <InfoRow label="Captured Requests" value={String(requests.length)} />
        <InfoRow label="Request Errors" value={String(errReq)} />
        <InfoRow label="Relevant Logs" value={String(logs.length)} />
        {Object.keys(methods).sort().map((m) => (
          <InfoRow key={m} label={`Method ${m}`} value={String(methods[m])} />
        ))}
        {!canManage && <Text style={{ color: "#ffbb33", marginTop: 8 }}>Read-only mode for this account.</Text>}
      </View>
    </ScrollView>
  );
}

function DeploymentControlTab({ canManage }) {
  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <ModuleChecklist canManage={canManage} title="Deployment & Version Control" items={[
        "Deploy new version",
        "Rollback versions",
        "View deployment history",
        "CI/CD integration",
        "Environment variable manager",
      ]} />
    </ScrollView>
  );
}

function DatabaseManagementTab({ canManage }) {
  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <ModuleChecklist canManage={canManage} title="Database Management" items={[
        "View database tables",
        "Edit records",
        "Run queries",
        "Backup database",
        "Export CSV/JSON",
      ]} />
    </ScrollView>
  );
}

function GrowthMarketingTab() {
  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <ModuleChecklist title="Growth & Marketing" items={[
        "Referral tracking",
        "Campaign management",
        "A/B testing",
        "SEO settings",
        "Affiliate tracking",
      ]} />
    </ScrollView>
  );
}

function AiAutomationTab({ canManage }) {
  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <ModuleChecklist canManage={canManage} title="AI / Automation Control" items={[
        "Prompt management",
        "Model configuration",
        "Usage tracking",
        "Cost tracking",
        "Moderation control",
      ]} />
    </ScrollView>
  );
}

function EnterpriseExtrasTab() {
  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <ModuleChecklist title="Pro-Level Dev Dashboard Extras" items={[
        "Multi-tenant support",
        "White-label control",
        "Feature flag rollout %",
        "Real-time WebSocket monitor",
        "System health graph",
        "Microservices monitor",
      ]} />
    </ScrollView>
  );
}
// --- HELPER COMPONENTS ---

const InfoRow = ({ label, value }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const GradientButton = ({ colors, icon, label, onPress, style, small, disabled, loading }) => (
  <TouchableOpacity onPress={onPress} disabled={disabled} style={[style, { opacity: disabled ? 0.7 : 1 }]}>
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: small ? 8 : 14,
        paddingHorizontal: small ? 12 : 20,
        borderRadius: 12,
        minHeight: small ? 32 : 48,
      }}
    >
      {loading ? (
        <ActivityIndicator color="#fff" size="small" style={{ marginRight: label ? 8 : 0 }} />
      ) : (
        icon && <Ionicons name={icon} size={small ? 16 : 20} color="#fff" style={{ marginRight: label ? 8 : 0 }} />
      )}
      {label && <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: small ? 12 : 14 }}>{label}</Text>}
    </LinearGradient>
  </TouchableOpacity>
);

// --- UTILS ---

const getStatusColor = (status) => {
  switch (status) {
    case 'active': return '#4caf50';
    case 'banned': return '#f44336';
    case 'suspended': return '#ff9800';
    case 'completed': return '#4caf50';
    case 'assigned': return '#ff9800';
    case 'audit': return '#2196f3';
    default: return '#9e9e9e';
  }
};

const getLogColor = (type) => {
  switch (type) {
    case 'error': return '#ff4444';
    case 'warn': return '#ffbb33';
    case 'info': return '#33b5e5';
    default: return '#ccc';
  }
};

const getMethodColor = (method) => {
  switch (method) {
    case 'GET': return '#33b5e5';
    case 'POST': return '#4caf50';
    case 'DELETE': return '#ff4444';
    case 'PUT': return '#ffbb33';
    default: return '#ccc';
  }
};

// --- STYLES ---

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a1a" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "rgba(0,0,0,0.3)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  backButton: { marginRight: 15 },
  title: { fontSize: 20, fontWeight: "bold", color: "#fff", letterSpacing: 0.5 },
  subtitle: { fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 },
  headerAction: { marginLeft: "auto" },
  
  // Tabs
  tabsContainer: {
    backgroundColor: "rgba(0,0,0,0.2)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  tabsContent: { paddingHorizontal: 10, paddingVertical: 10 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  activeTab: { backgroundColor: "#8e24aa" },
  tabText: { color: "#aaa", fontSize: 14, fontWeight: "600" },
  activeTabText: { color: "#fff" },

  // Content Area
  content: { flex: 1 },
  flexContainer: { flex: 1 },
  tabScroll: { flex: 1 },
  tabScrollContent: { padding: 20 },

  // Sections & Cards
  section: { marginBottom: 24 },
  sectionTitle: { color: "#4fc3f7", fontSize: 14, fontWeight: "bold", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 },
  card: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  
  // Info Rows
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  infoLabel: { color: "#aaa", fontSize: 15 },
  infoValue: { color: "#fff", fontSize: 15, fontWeight: "500" },

  // Switch Rows
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  switchLabel: { color: "#fff", fontSize: 16 },

  // Grid Actions
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  // User Management
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    height: 44,
  },
  searchInput: { flex: 1, color: "#fff", marginLeft: 10, fontSize: 16 },
  userCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  userHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  userAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#8e24aa",
    justifyContent: "center", alignItems: "center", marginRight: 12,
  },
  userAvatarText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  userName: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  userEmail: { color: "#aaa", fontSize: 14 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  userDetails: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  detailText: { color: "#888", fontSize: 12 },
  userActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  statusCaseCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  statusCaseTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  statusCaseRef: { color: "#e2e8f0", fontSize: 14, fontWeight: "700" },
  statusCaseMeta: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  statusPickerWrap: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 10,
  },
  statusPickerLabel: { color: "#cbd5e1", fontSize: 12, marginBottom: 4, fontWeight: "600" },
  statusPicker: {
    color: "#e2e8f0",
    backgroundColor: "rgba(15,23,42,0.7)",
    borderRadius: 8,
  },

  // Logs
  filterBar: { flexDirection: "row", padding: 10, alignItems: "center" },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.1)", marginRight: 8 },
  activeFilterChip: { backgroundColor: "#fff" },
  filterText: { color: "#aaa", fontSize: 12, fontWeight: "bold" },
  activeFilterText: { color: "#000" },
  clearButton: { marginLeft: "auto", padding: 8 },
  logItem: { backgroundColor: "rgba(0,0,0,0.2)", padding: 10, marginBottom: 8, borderRadius: 6, borderLeftWidth: 4 },
  logHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  logType: { fontSize: 10, fontWeight: "bold" },
  logTimestamp: { color: "#666", fontSize: 10 },
  logContent: { color: "#ddd", fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  // Network
  networkCard: { backgroundColor: "rgba(255,255,255,0.03)", padding: 12, marginBottom: 8, borderRadius: 8 },
  networkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  method: { fontWeight: "bold", fontSize: 12, width: 50 },
  url: { color: "#fff", fontSize: 13, flex: 1 },
  status: { fontWeight: "bold", fontSize: 13 },
  meta: { color: "#666", fontSize: 11 },

  // Tracking
  toolbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" },
  toolbarTitle: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  liveIndicator: { flexDirection: "row", alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ff4444", marginRight: 6 },
  liveText: { color: "#ff4444", fontSize: 12, fontWeight: "bold" },
  logRow: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  logTime: { color: "#aaa", fontSize: 12, width: 70 },
  logTag: { color: "#ba68c8", fontSize: 12, width: 100, fontWeight: "600" },
  logMessage: { color: "#ccc", fontSize: 12, flex: 1 },
  
  // Utils
  listItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  listItemText: { color: "#fff", fontSize: 16, marginLeft: 12, flex: 1 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.05)", marginVertical: 4 },
  linkText: { color: "#4fc3f7", fontWeight: "bold" },
  tabScroll: { flex: 1 },
  tabScrollContent: { padding: 20 },
  
  // Table Styles
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  tableHeaderText: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
  },
  tableCell: {
    color: '#fff',
    fontSize: 12,
  },
  iconBtn: {
      padding: 5,
  },

  // Sections & Cards
  section: { marginBottom: 24 },
  sectionTitle: { color: "#8e24aa", fontSize: 14, fontWeight: "bold", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 },
  card: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  
  // Info Rows
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  infoLabel: { color: "#aaa", fontSize: 15 },
  infoValue: { color: "#fff", fontSize: 15, fontWeight: "500" },

  // Switch Rows
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  switchLabel: { color: "#fff", fontSize: 16 },

  // Grid Actions
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  // User Management
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    height: 44,
  },
  searchInput: { flex: 1, color: "#fff", marginLeft: 10, fontSize: 16 },
  userCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  userHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  userAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#8e24aa",
    justifyContent: "center", alignItems: "center", marginRight: 12,
  },
  userAvatarText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  userName: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  userEmail: { color: "#aaa", fontSize: 14 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  userDetails: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.05)" },
  detailText: { color: "#888", fontSize: 12 },
  userActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },

  // Logs
  filterBar: { flexDirection: "row", padding: 10, alignItems: "center" },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.1)", marginRight: 8 },
  activeFilterChip: { backgroundColor: "#fff" },
  filterText: { color: "#aaa", fontSize: 12, fontWeight: "bold" },
  activeFilterText: { color: "#000" },
  clearButton: { marginLeft: "auto", padding: 8 },
  logItem: { backgroundColor: "rgba(0,0,0,0.2)", padding: 10, marginBottom: 8, borderRadius: 6, borderLeftWidth: 4 },
  logHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  logType: { fontSize: 10, fontWeight: "bold" },
  logTimestamp: { color: "#666", fontSize: 10 },
  logContent: { color: "#ddd", fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  // Network
  networkCard: { backgroundColor: "rgba(255,255,255,0.03)", padding: 12, marginBottom: 8, borderRadius: 8 },
  networkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  method: { fontWeight: "bold", fontSize: 12, width: 50 },
  url: { color: "#fff", fontSize: 13, flex: 1 },
  status: { fontWeight: "bold", fontSize: 13 },
  meta: { color: "#666", fontSize: 11 },

  // Tracking
  toolbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.1)" },
  toolbarTitle: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  liveIndicator: { flexDirection: "row", alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ff4444", marginRight: 6 },
  liveText: { color: "#ff4444", fontSize: 12, fontWeight: "bold" },
  logRow: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)" },
  logTime: { color: "#666", fontSize: 12, width: 70 },
  logTag: { color: "#8e24aa", fontSize: 12, width: 100, fontWeight: "600" },
  logMessage: { color: "#ccc", fontSize: 12, flex: 1 },
  
  // Utils
  listItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  listItemText: { color: "#fff", fontSize: 16, marginLeft: 12, flex: 1 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.05)", marginVertical: 4 },
    linkText: { color: "#8e24aa", fontWeight: "bold" },

  // New Dashboard Shell + Overview Styles
  dsScreen: { flex: 1, backgroundColor: "#05080f" },
  dsShellFrame: {
    flex: 1,
    flexDirection: "row",
    paddingTop: Platform.OS === "ios" ? 52 : 24,
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 12,
  },
  dsSidebar: {
    width: 230,
    borderRadius: 18,
    backgroundColor: "#060b14",
    borderWidth: 1,
    borderColor: "#182235",
    padding: 14,
  },
  dsSidebarBrand: { flexDirection: "row", alignItems: "center", marginBottom: 14, gap: 10 },
  dsBrandAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  dsBrandName: { color: "#f8fafc", fontWeight: "700", fontSize: 14 },
  dsBrandSub: { color: "#64748b", fontSize: 11, marginTop: 2 },
  dsSidebarMenu: { paddingVertical: 6, gap: 6 },
  dsSidebarItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "transparent",
  },
  dsSidebarItemActive: { backgroundColor: "#0b1220", borderWidth: 1, borderColor: "#22314d" },
  dsSidebarLabel: { color: "#64748b", fontWeight: "600", fontSize: 13 },
  dsSidebarLabelActive: { color: "#e2e8f0" },
  dsSidebarFooter: {
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#101827",
    borderWidth: 1,
    borderColor: "#2a3a5a",
  },
  dsSidebarFooterText: { color: "#fda4af", fontSize: 12, fontWeight: "700" },
  dsMainArea: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: "#050b14",
    borderWidth: 1,
    borderColor: "#1b2434",
    overflow: "hidden",
  },
  dsTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#182235",
  },
  dsBreadcrumb: { color: "#64748b", fontSize: 11, marginBottom: 4 },
  dsTopTitle: { color: "#f8fafc", fontSize: 18, fontWeight: "700" },
  dsTopActions: { flexDirection: "row", gap: 8 },
  dsTopIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#273449",
  },
  dsMobileTabsWrap: { borderBottomWidth: 1, borderBottomColor: "#182235" },
  dsMobileTabsContent: { paddingHorizontal: 10, paddingVertical: 10, gap: 8 },
  dsSidebarBadge: { marginLeft: 'auto', minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  dsSidebarBadgeCritical: { backgroundColor: '#7f1d1d', borderColor: '#ef4444' },
  dsSidebarBadgeText: { color: '#e2e8f0', fontSize: 11, fontWeight: '800' },
  dsMobileTabBadge: { marginLeft: 6, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  dsMobileTabBadgeCritical: { backgroundColor: '#7f1d1d', borderColor: '#ef4444' },
  dsMobileTabBadgeText: { color: '#e2e8f0', fontSize: 10, fontWeight: '800' },
  inputLabel: { color: '#cbd5e1', fontSize: 12, marginBottom: 6, fontWeight: '700', letterSpacing: 0.4 },
  segmentRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  segmentBtn: { borderWidth: 1, borderColor: '#334155', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(15,23,42,0.6)' },
  segmentBtnActive: { borderColor: '#38bdf8', backgroundColor: 'rgba(14,165,233,0.2)' },
  segmentBtnText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  segmentBtnTextActive: { color: '#e2e8f0' },
  templateNotice: { marginTop: 8, color: '#fbbf24', fontSize: 12, fontWeight: '700' },
  targetInputRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  addTargetBtn: {
    borderWidth: 1,
    borderColor: '#38bdf8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(14,165,233,0.2)',
  },
  addTargetBtnText: { color: '#bae6fd', fontSize: 12, fontWeight: '700' },
  targetListWrap: {
    marginTop: 10,
    maxHeight: 170,
    borderWidth: 1,
    borderColor: '#273449',
    borderRadius: 10,
    backgroundColor: 'rgba(2,6,23,0.45)',
    overflow: 'hidden',
  },
  targetListScroll: { maxHeight: 168 },
  targetListContent: { padding: 8, paddingBottom: 10 },
  targetChip: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(15,23,42,0.55)',
    marginBottom: 6,
  },
  targetChipActive: { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.2)' },
  targetChipText: { color: '#cbd5e1', fontSize: 11, fontWeight: '600' },
  targetChipTextActive: { color: '#bbf7d0' },
  alertInput: { marginTop: 10, borderWidth: 1, borderColor: '#334155', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#e2e8f0', backgroundColor: 'rgba(2,6,23,0.7)' },
  alertTextArea: { minHeight: 90, textAlignVertical: 'top' },
  alertComposerWrap: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148,163,184,0.2)',
    paddingTop: 12,
  },
  alertQueueRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.15)' },
  alertQueueMsg: { color: '#e2e8f0', fontSize: 13, fontWeight: '600' },
  alertQueueMeta: { color: '#94a3b8', fontSize: 11, marginTop: 3 },
  alertQueueActionBtn: { borderWidth: 1, borderColor: '#475569', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: 'rgba(30,41,59,0.6)' },
  alertQueueActionText: { color: '#cbd5e1', fontSize: 11, fontWeight: '700' },
  dsMobileTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#0c1320",
    borderWidth: 1,
    borderColor: "#1f2c42",
  },
  dsMobileTabActive: { backgroundColor: "#172236", borderColor: "#334666" },
  dsMobileTabText: { color: "#64748b", fontSize: 12, fontWeight: "600" },
  dsMobileTabTextActive: { color: "#e2e8f0" },
  dsContentArea: { flex: 1 },

  dsOverviewScroll: { flex: 1 },
  dsOverviewContent: { padding: 14, gap: 12 },
  dsChartFallback: {
    height: 180,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.25)",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.35)",
    marginBottom: 8,
  },
  dsChartFallbackText: { color: "#94a3b8", fontSize: 12, fontStyle: "italic" },
  dsOverviewRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  dsMetricGrid: { flex: 1.2, minWidth: 300, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  dsMetricCard: {
    width: "48%",
    minWidth: 138,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#0b1220",
    borderWidth: 1,
    borderColor: "#22314d",
  },
  dsMetricHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  dsMetricIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  dsMetricTitle: { color: "#cbd5e1", fontSize: 12, fontWeight: "600", flex: 1 },
  dsMetricValueRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  dsMetricValue: { color: "#f8fafc", fontSize: 22, fontWeight: "700" },
  dsMetricUnit: { color: "#64748b", fontSize: 11, marginBottom: 3 },
  dsMetricDeltaRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 6 },
  dsMetricDelta: { fontSize: 12, fontWeight: "600" },

  dsActivityCard: {
    flex: 1,
    minWidth: 300,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#0b1220",
    borderWidth: 1,
    borderColor: "#22314d",
  },
  dsCardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  dsCardTitle: { color: "#f8fafc", fontSize: 16, fontWeight: "700" },
  dsCardSubTitle: { color: "#94a3b8", fontSize: 12 },
  dsLegendList: { marginTop: 6, gap: 8 },
  dsLegendRow: { flexDirection: "row", alignItems: "center" },
  dsLegendDot: { width: 9, height: 9, borderRadius: 4.5, marginRight: 8 },
  dsLegendName: { color: "#cbd5e1", fontSize: 12, flex: 1 },
  dsLegendValue: { color: "#94a3b8", fontSize: 12 },

  dsChartCard: {
    flex: 1.2,
    minWidth: 300,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#0b1220",
    borderWidth: 1,
    borderColor: "#22314d",
  },
  dsBarChart: { marginLeft: -12, borderRadius: 12 },
  dsCountryCard: {
    flex: 1,
    minWidth: 280,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#0b1220",
    borderWidth: 1,
    borderColor: "#22314d",
  },
  dsCountryRow: { marginBottom: 12 },
  dsCountryLabelRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  dsCountryName: { color: "#cbd5e1", fontSize: 12 },
  dsCountryValue: { color: "#94a3b8", fontSize: 12 },
  dsCountryTrack: { height: 7, borderRadius: 5, backgroundColor: "#1e293b", overflow: "hidden" },
  dsCountryFill: { height: "100%", borderRadius: 5 },

  dsTransactionCard: {
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#0b1220",
    borderWidth: 1,
    borderColor: "#22314d",
  },
  dsTransactionHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
    paddingBottom: 8,
    marginBottom: 6,
  },
  dsTransactionHeaderText: { color: "#64748b", fontSize: 11, fontWeight: "700" },
  dsTransactionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#131c2b",
  },
  dsTransactionCell: { color: "#94a3b8", fontSize: 12, paddingRight: 6 },
  dsQuickGrid: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  dsQuickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: "#0b1220",
    borderWidth: 1,
    borderColor: "#22314d",
  },
  dsQuickBtnText: { color: "#cbd5e1", fontSize: 12, fontWeight: "700" },
});




