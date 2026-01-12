import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useContext, useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import firebase from "../firebase";
import { AuthContext } from "./AuthContext";

export default function Dashboard({ navigation }) {
  const { user, logout } = useContext(AuthContext);
  const [cases, setCases] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // Filter states
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState([]);
  const [sortField, setSortField] = useState("assignedAt");
  const [sortAsc, setSortAsc] = useState(false);

  const [loading, setLoading] = useState(true);

  // Revert modal states
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [revertReason, setRevertReason] = useState("");
  const [selectedCase, setSelectedCase] = useState(null);

  // Alert System State
  const [newCasesList, setNewCasesList] = useState([]);
  const knownCaseIds = useRef(new Set());
  const isFirstLoad = useRef(true);

  const [bribeWarningVisible, setBribeWarningVisible] = useState(false);

  useEffect(() => {
    const checkDailyWarning = async () => {
      const today = new Date().toDateString();
      const lastShown = await AsyncStorage.getItem("last_bribe_warning_date");
      if (lastShown !== today) {
        setBribeWarningVisible(true);
      }
    };
    checkDailyWarning();
  }, []);

  // Feature Flags
  const [newUI, setNewUI] = useState(false);
  const [betaFeatures, setBetaFeatures] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  useEffect(() => {
    const devRef = firebase.database().ref("dev");
    const listener = devRef.on("value", (snapshot) => {
      const flags = snapshot.val() || {};
      console.log("[Dashboard] Dev Flags Received:", flags);
      // Handle both boolean and string "true"
      setNewUI(flags.enableNewUI === true || flags.enableNewUI === "true");
      setBetaFeatures(flags.enableBetaFeatures === true || flags.enableBetaFeatures === "true");
      setMaintenanceMode(flags.maintenanceMode === true || flags.maintenanceMode === "true");
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
    const explicitShowClosed = activeFilters.some(f => f.field === 'status' && f.value === 'closed');
    if (isClosed && !explicitShowClosed) return false;

    if (activeFilters.length === 0) return true;
    return activeFilters.every((f) => {
      switch (f.field) {
        case "status":
          return computeMemberStatus(c) === f.value;
        case "client":
          return (c.client === f.value || c.company === f.value);
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

  if (maintenanceMode) {
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

  if (loading) return null;

  // Extract unique clients for filter
  const uniqueClients = [...new Set(cases.map(c => c.client || c.company).filter(Boolean))];

  const filterOptions = [
    { label: "Recent", field: "assignedAt" },
    { label: "Priority", field: "highPriority" },
    { label: "Completed", field: "completedAt" },
    { label: "Closed/Open", field: "status" },
    { label: "Pincode", field: "pincode" },
    // Add clients dynamically
    ...uniqueClients.map(c => ({ label: `Client: ${c}`, field: "client", value: c }))
  ];

  const toggleFilter = (option) => {
    const exists = activeFilters.find((f) => f.field === option.field && f.value === option.value);
    if (exists) {
      setActiveFilters(activeFilters.filter((f) => !(f.field === option.field && f.value === option.value)));
    } else {
      if (option.field === "status") {
        const current = activeFilters.find((f) => f.field === "status");
        const nextValue = current?.value === "open" ? "closed" : "open";
        const others = activeFilters.filter(f => f.field !== "status");
        setActiveFilters([...others, { ...option, value: nextValue, label: "Closed/Open" }]);
      } else if (option.field === "client") {
        // Remove other client filters to allow switching between clients easily
        const others = activeFilters.filter(f => f.field !== "client");
        setActiveFilters([...others, { ...option }]);
      } else {
        setActiveFilters([...activeFilters, { ...option }]);
      }
    }
    setFilterDropdownOpen(false);
    if (option.field !== "client") {
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
    if (hours < 12) return "Good Morning";
    if (hours < 16) return "Good Afternoon";
    return "Good Evening";
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

  return (
    <LinearGradient
      colors={newUI ? ["#141E30", "#243B55"] : ["#12c2e9", "#c471ed", "#f64f59"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      {/* Maintenance Banner */}
      {maintenanceMode && (
        <View style={styles.maintenanceBanner}>
          <Text style={styles.maintenanceText}>⚠️ MAINTENANCE MODE: ACTIONS TRACKED</Text>
        </View>
      )}

      {/* Header */}
      <View style={[styles.headerRow, maintenanceMode && { marginTop: 10 }]}>
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
        <View style={styles.profileMenu}>
          <TouchableOpacity onPress={() => navigation.navigate("Updatescreen")}>
            <Text style={styles.menuText}>Update Profile</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Hamburger Menu */}
      {menuOpen && (
        <View style={styles.menuOverlay}>
          <View style={styles.menu}>
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
              },
              {
                label: "Dashboard",
                action: () => {
                  setActiveFilters([]);
                  setSortField("assignedAt");
                  setSortAsc(false);
                },
              },
              {
                label: "Plan Your Day",
                action: () => navigation.navigate("PlanYourDayScreen"),
              },
              {
                label: "Day-wise Tracker",
                action: () => navigation.navigate("DaywiseTrackerScreen"),
              },
              {
                label: "DSR",
                action: () => navigation.navigate("DSRScreen"),
              },
              {
                label: "All Cases",
                action: () => navigation.navigate("AllCasesScreen"),
              },
              {
                label: "Raise Ticket",
                action: () => navigation.navigate("RaiseTicketScreen"),
              },
              {
                label: "My Tickets",
                action: () => navigation.navigate("MyTicketsScreen"),
              },
            ].map((item) => (
              <TouchableOpacity
                key={item.label}
                style={styles.menuItem}
                onPress={() => {
                  item.action();
                  setMenuOpen(false);
                }}
              >
                <Text style={styles.menuText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setMenuOpen(false)}
            >
              <Text style={[styles.menuText, { color: "red" }]}>Close Menu</Text>
            </TouchableOpacity>
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
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: 'green' }]}>{completedCasesCount}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#d35400' }]}>{pendingCasesCount}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
        </BlurView>
      </View>

      {/* Filter Bar */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setFilterDropdownOpen((prev) => !prev)}
        >
          <Ionicons name="funnel" size={20} color="#fff" />
          <Text style={{ color: "#fff", marginLeft: 5 }}>Filter</Text>
        </TouchableOpacity>

        {filterDropdownOpen && (
          <View style={styles.filterDropdown}>
            {filterOptions.map((f) => (
              <TouchableOpacity
                key={f.label}
                style={styles.filterOption}
                onPress={() => toggleFilter(f)}
              >
                <Text style={{ color: "#333" }}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.activeFilters}>
          {activeFilters.map((f) => (
            <View key={f.field} style={styles.filterTag}>
              <Text style={{ color: "#fff", fontSize: 12 }}>{f.label}</Text>
              <TouchableOpacity onPress={() => removeActiveFilter(f.field)}>
                <Ionicons name="close-circle" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          {activeFilters.length > 0 && (
            <TouchableOpacity onPress={toggleSortOrder} style={styles.sortArrow}>
              <Ionicons
                name={sortAsc ? "arrow-up" : "arrow-down"}
                size={16}
                color="#fff"
              />
            </TouchableOpacity>
          )}
        </View>
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
                        <Text style={styles.priorityText}>HIGH PRIORITY</Text>
                      </View>
                    )}
                    {(item.auditFeedback || (item.photosToRedo && item.photosToRedo.length > 0)) && item.status === 'assigned' && (
                        <View style={[styles.auditFailBadge, { marginLeft: 0 }]}>
                          <Text style={styles.auditFailText}>AUDIT FAIL</Text>
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
                  <Text style={styles.openButtonText}>View Details</Text>
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

      {/* Bribe Warning Modal */}
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
              Do not get or give bribe. SpaceSolutions is totally against it and will be severely punished.
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: "#c62828", paddingVertical: 8, paddingHorizontal: 25, borderRadius: 6 }}
              onPress={async () => {
                await AsyncStorage.setItem("last_bribe_warning_date", new Date().toDateString());
                setBribeWarningVisible(false);
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 14 }}>I Understand</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* New Case Alert Modal */}
      <Modal
        visible={newCasesList.length > 0 && !bribeWarningVisible}
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
          <Text style={{ color: "white" }}>Sign Out</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ marginTop: 10 }}
          onPress={() => navigation.navigate("MemberChats")}
        >
          <Text style={{ color: "#fff" }}>Chat with Admin</Text>
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
  profileMenu: { position: "absolute", top: 60, right: 20, backgroundColor: "#fff", padding: 15, borderRadius: 8, shadowColor: "#000", shadowOpacity: 0.2, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 5, zIndex: 100 },
  menuOverlay: { position: "absolute", top: 0, left: 0, bottom: 0, right: 0, backgroundColor: "rgba(0,0,0,0.5)", zIndex: 90 },
  menu: { width: "70%", backgroundColor: "#fff", paddingVertical: 50, paddingHorizontal: 20, height: Dimensions.get("window").height },
  menuItem: { paddingVertical: 15, borderBottomWidth: 1, borderColor: "#eee" },
  menuText: { fontSize: 18, fontWeight: "bold" },
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
  openButtonText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  mapButton: {
    width: 48,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  revertButton: { backgroundColor: "#FF3B30", padding: 10, borderRadius: 6, alignItems: "center", flex: 1 },
  filterBar: { flexDirection: "row", alignItems: "center", marginBottom: 10, flexWrap: "wrap" },
  filterButton: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.3)", padding: 6, borderRadius: 6 },
  filterDropdown: { position: "absolute", top: 40, backgroundColor: "#fff", borderRadius: 8, padding: 10, zIndex: 50, shadowColor: "#000", shadowOpacity: 0.2, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, elevation: 5 },
  filterOption: { paddingVertical: 8, paddingHorizontal: 10 },
  activeFilters: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginLeft: 10 },
  filterTag: { flexDirection: "row", alignItems: "center", backgroundColor: "#6a11cb", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 5, marginBottom: 5 },
  sortArrow: { marginLeft: 5 },
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
});
