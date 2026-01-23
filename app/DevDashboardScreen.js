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

const TABS = [
  { id: "overview", label: "Overview", icon: "grid-outline" },
  { id: "reconciliation", label: "Reconciliation", icon: "git-compare-outline" },
  { id: "manual_audit", label: "Manual Audit", icon: "create-outline" },
  { id: "firebase", label: "Firebase DB", icon: "server-outline" },
  { id: "cloudinary", label: "Cloudinary", icon: "cloud-circle-outline" },
  { id: "tickets", label: "Tickets", icon: "ticket-outline" },
  { id: "users", label: "Users", icon: "people-outline" },
  { id: "tracking", label: "Tracking", icon: "analytics-outline" },
  { id: "logs", label: "Logs", icon: "terminal-outline" },
  { id: "network", label: "Network", icon: "wifi-outline" },
  { id: "utils", label: "Utils", icon: "construct-outline" },
  { id: "statistics", label: "Statistics", icon: "stats-chart-outline" },
];

// --- REAL DATA INTERCEPTORS ---
const LOG_BUFFER = [];
const NETWORK_BUFFER = [];
const LISTENERS = new Set();

const notifyListeners = () => LISTENERS.forEach((l) => l());

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

  // Fetch real users when tab is active
  useEffect(() => {
    if (activeTab === "users") {
      const ref = firebase.database().ref("users");
      const listener = ref.on("value", (snapshot) => {
        const data = snapshot.val() || {};
        const list = Object.keys(data).map((key) => ({ id: key, ...data[key] }));
        setUsers(list);
      });
      return () => ref.off("value", listener);
    }
  }, [activeTab]);

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
        return <OverviewTab featureFlags={featureFlags} toggleFeatureFlag={toggleFeatureFlag} navigation={navigation} />;
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
        return <TrackingTab />;
      case "logs":
        return <LogsTab logs={logs} onClear={handleClearLogs} />;
      case "network":
        return <NetworkTab requests={networkRequests} onClear={handleClearNetwork} />;
      case "utils":
        return <UtilsTab />;
      case "statistics":
        return <StatisticsTab users={users} />;
      default:
        return <OverviewTab />;
    }
  };

  return (
    <LinearGradient colors={["#0F2027", "#203A43", "#2C5364"]} style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
            firebase.auth().signOut().then(() => { if (logout) logout(); });
        }} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Dev Dashboard</Text>
          <Text style={styles.subtitle}>{ENV_NAME} - {APP_VERSION}</Text>
        </View>
        <TouchableOpacity style={styles.headerAction} onPress={() => Alert.alert("Info", "Developer Tools v1.0")}>
          <Ionicons name="information-circle-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, activeTab === tab.id && styles.activeTab]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Ionicons
                name={tab.icon}
                size={18}
                color={activeTab === tab.id ? "#fff" : "#aaa"}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.tabText, activeTab === tab.id && styles.activeTabText]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.content}>
        {renderContent()}
      </View>
    </LinearGradient>
  );
}

// --- TAB COMPONENTS ---


function OverviewTab({ featureFlags = {}, toggleFeatureFlag = () => {}, navigation }) {
  const { logout } = useContext(AuthContext);
  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Feature Flags</Text>
        <View style={styles.card}>
          {Object.keys(featureFlags).map((key) => (
            <View key={key} style={styles.switchRow}>
              <Text style={styles.switchLabel}>{key.replace(/([A-Z])/g, ' $1').trim()}</Text>
              <TouchableOpacity onPress={() => toggleFeatureFlag(key)}>
                <Ionicons
                  name={featureFlags[key] ? "toggle" : "toggle-outline"}
                  size={32}
                  color={featureFlags[key] ? "#4caf50" : "#666"}
                />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={[styles.grid, { gap: 10 }]}>
          <GradientButton 
            colors={['#2193b0', '#6dd5ed']} 
            icon="refresh" label="Reload" 
            onPress={() => { if (Platform.OS === 'web') window.location.reload(); else Alert.alert("Info", "Use Expo reload"); }} 
            style={{ width: '31%' }}
          />
          <GradientButton 
            colors={['#ff416c', '#ff4b2b']} 
            icon="log-out" label="Logout" 
            onPress={() => firebase.auth().signOut().then(() => { if (logout) logout(); })} 
            style={{ width: '31%' }}
          />
          <GradientButton 
            colors={['#f12711', '#f5af19']} 
            icon="bug" label="Crash" 
            onPress={() => { throw new Error("Manual Crash Test"); }} 
            style={{ width: '31%' }}
          />
        </View>
      </View>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Environment</Text>
        <View style={styles.card}>
          <InfoRow label="API URL" value={API_URL} />
          <InfoRow label="Server" value={SERVER_URL} />
          <InfoRow label="App Version" value={APP_VERSION} />
        </View>
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

function TrackingTab() {
  // Real analytics stream from logs
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const updateEvents = () => {
      // Filter logs that look like events or just show all logs in a stream
      const analyticsLogs = LOG_BUFFER.filter(l => 
        l.message.toLowerCase().includes('event') || 
        l.message.toLowerCase().includes('analytics') ||
        l.message.toLowerCase().includes('track')
      ).map(l => ({ id: l.id, name: 'EVENT', params: l.message }));
      setEvents(analyticsLogs);
    };
    LISTENERS.add(updateEvents);
    updateEvents();
    return () => LISTENERS.delete(updateEvents);
  }, []);

  return (
    <View style={styles.flexContainer}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarTitle}>Live Analytics Stream</Text>
        <View style={styles.liveIndicator}>
          <View style={styles.dot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>
      <FlatList
        data={events}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <View style={styles.logRow}>
            <Text style={styles.logTime}>{new Date(parseInt(item.id)).toLocaleTimeString()}</Text>
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

                {/* Line Chart */}
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold', marginTop: 20, marginBottom: 10 }}>30-Day Trend</Text>
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

                {/* Bar Chart */}
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold', marginTop: 20, marginBottom: 10 }}>Top Performers</Text>
                {statsData.memberLabels.length > 0 ? (
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
});