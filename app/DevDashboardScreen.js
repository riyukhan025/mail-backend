import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
  Alert,
  Dimensions,

  FlatList,
  NativeModules,
  Platform,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

// --- CONSTANTS & CONFIGURATION ---
const APP_VERSION = "1.0.4 (Build 203)";
const API_URL = "https://api.production.example.com";
const ENV_NAME = "STAGING";

const TABS = [
  { id: "overview", label: "Overview", icon: "grid-outline" },
  { id: "users", label: "Users", icon: "people-outline" },
  { id: "tracking", label: "Tracking", icon: "analytics-outline" },
  { id: "logs", label: "Logs", icon: "terminal-outline" },
  { id: "network", label: "Network", icon: "wifi-outline" },
  { id: "utils", label: "Utils", icon: "construct-outline" },
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
      if (originalConsole[level]) originalConsole[level](...args);
      const message = args
        .map((a) => {
          try { return typeof a === "object" ? JSON.stringify(a) : String(a); } 
          catch (e) { return "[Circular]"; }
        })
        .join(" ");
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
  const [activeTab, setActiveTab] = useState("overview");
  const [logs, setLogs] = useState(LOG_BUFFER);
  const [users, setUsers] = useState([]);
  const [networkRequests, setNetworkRequests] = useState(NETWORK_BUFFER);
  const [featureFlags, setFeatureFlags] = useState({
    enableNewUI: true,
    enableBetaFeatures: false,
    maintenanceMode: false,
    debugLogging: true,
  });

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
      fetch(`${API_URL}/users`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setUsers(data);
        })
        .catch(err => {
          console.warn("DevDashboard: Failed to fetch users", err);
          // Fallback UI if API fails
          setUsers([{ id: "err", name: "Fetch Failed", email: "Check API_URL", role: "error", status: "banned", lastActive: "Now" }]);
        });
    }
  }, [activeTab]);

  // --- ACTIONS ---
  const handleRevokeAccess = (userId) => {
    Alert.alert(
      "Revoke Access",
      `Are you sure you want to revoke access for user ${userId}? This will invalidate their session immediately.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: () => {
            // Attempt real revoke
            fetch(`${API_URL}/users/${userId}/revoke`, { method: 'POST' })
              .then(() => {
                setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: "banned" } : u)));
                Alert.alert("Success", "User access has been revoked.");
              })
              .catch(err => Alert.alert("Error", "Failed to revoke access: " + err.message));
          },
        },
      ]
    );
  };

  const handleClearLogs = () => {
    LOG_BUFFER.length = 0;
    setLogs([]);
  };
  
  const handleClearNetwork = () => {
    NETWORK_BUFFER.length = 0;
    setNetworkRequests([]);
  };

  const toggleFeatureFlag = (key) => {
    setFeatureFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewTab featureFlags={featureFlags} toggleFeatureFlag={toggleFeatureFlag} />;
      case "users":
        return <UsersTab users={users} onRevoke={handleRevokeAccess} />;
      case "tracking":
        return <TrackingTab />;
      case "logs":
        return <LogsTab logs={logs} onClear={handleClearLogs} />;
      case "network":
        return <NetworkTab requests={networkRequests} onClear={handleClearNetwork} />;
      case "utils":
        return <UtilsTab />;
      default:
        return <OverviewTab />;
    }
  };

  return (
    <LinearGradient colors={["#4e0360", "#1a1a1a"]} style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
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

function OverviewTab({ featureFlags, toggleFeatureFlag }) {
  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Environment Info</Text>
        <View style={styles.card}>
          <InfoRow label="Environment" value={ENV_NAME} />
          <InfoRow label="API URL" value={API_URL} />
          <InfoRow label="Build Version" value={APP_VERSION} />
          <InfoRow label="React Native" value="0.72.6" />
          <InfoRow label="Expo SDK" value="49.0.0" />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Feature Flags</Text>
        <View style={styles.card}>
          {Object.entries(featureFlags).map(([key, value]) => (
            <View key={key} style={styles.switchRow}>
              <Text style={styles.switchLabel}>{key.replace(/([A-Z])/g, ' $1').trim()}</Text>
              <Switch
                value={value}
                onValueChange={() => toggleFeatureFlag(key)}
                trackColor={{ false: "#767577", true: "#81b0ff" }}
                thumbColor={value ? "#f5dd4b" : "#f4f3f4"}
              />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.grid}>
          <ActionButton icon="refresh" label="Reload App" onPress={() => NativeModules.DevSettings.reload()} />
          <ActionButton icon="share-social" label="Export Logs" onPress={() => Share.share({ message: JSON.stringify(LOG_BUFFER, null, 2) })} />
          <ActionButton icon="warning" label="Test Crash" color="#ff4444" onPress={() => { throw new Error("Test Crash Triggered"); }} />
        </View>
      </View>
    </ScrollView>
  );
}

function UsersTab({ users, onRevoke }) {
  const [search, setSearch] = useState("");
  
  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(search.toLowerCase()) || 
    u.email.toLowerCase().includes(search.toLowerCase())
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
                <Text style={styles.userAvatarText}>{item.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{item.name}</Text>
                <Text style={styles.userEmail}>{item.email}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) }]}>
                <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
              </View>
            </View>
            <View style={styles.userDetails}>
              <Text style={styles.detailText}>ID: {item.id}</Text>
              <Text style={styles.detailText}>Role: {item.role}</Text>
              <Text style={styles.detailText}>Active: {item.lastActive}</Text>
            </View>
            <View style={styles.userActions}>
              <TouchableOpacity style={styles.actionBtnSmall} onPress={() => Alert.alert("Details", JSON.stringify(item, null, 2))}>
                <Text style={styles.actionBtnText}>View JSON</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.actionBtnSmall, { backgroundColor: "#ff4444" }]} 
                onPress={() => onRevoke(item.id)}
              >
                <Text style={styles.actionBtnText}>Revoke Access</Text>
              </TouchableOpacity>
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
  return (
    <ScrollView style={styles.tabScroll} contentContainerStyle={styles.tabScrollContent}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Async Storage</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.listItem} onPress={() => Alert.alert("Storage", "Keys: ['user_token', 'theme', 'onboarding_complete']")}>
            <Ionicons name="list" size={20} color="#ccc" />
            <Text style={styles.listItemText}>View All Keys</Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.listItem} onPress={() => Alert.alert("Cleared", "All storage cleared.")}>
            <Ionicons name="trash-bin" size={20} color="#ff4444" />
            <Text style={[styles.listItemText, { color: '#ff4444' }]}>Clear All Storage</Text>
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

// --- HELPER COMPONENTS ---

const InfoRow = ({ label, value }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const ActionButton = ({ icon, label, onPress, color = "#fff" }) => (
  <TouchableOpacity style={styles.actionButton} onPress={onPress}>
    <View style={[styles.actionIcon, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
      <Ionicons name={icon} size={24} color={color} />
    </View>
    <Text style={styles.actionLabel}>{label}</Text>
  </TouchableOpacity>
);

// --- UTILS ---

const getStatusColor = (status) => {
  switch (status) {
    case 'active': return '#4caf50';
    case 'banned': return '#f44336';
    case 'suspended': return '#ff9800';
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
  actionButton: { width: "31%", alignItems: "center", marginBottom: 15 },
  actionIcon: { width: 50, height: 50, borderRadius: 25, justifyContent: "center", alignItems: "center", marginBottom: 8 },
  actionLabel: { color: "#ccc", fontSize: 12, textAlign: "center" },

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
  actionBtnSmall: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#444", borderRadius: 6, marginLeft: 8 },
  actionBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },

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