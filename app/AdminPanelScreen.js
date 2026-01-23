import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Picker } from "@react-native-picker/picker";
import { BlurView } from "expo-blur";
import * as DocumentPicker from "expo-document-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useContext, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as XLSX from "xlsx";
import firebase from "../firebase";
import { AuthContext } from "./AuthContext";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const SCREEN_WIDTH = Dimensions.get("window").width;
const MENU_WIDTH = SCREEN_WIDTH * 0.75;

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
  const [assignDropdownVisible, setAssignDropdownVisible] = useState(false);
  const [assignTo, setAssignTo] = useState("");
  const [headerFilters, setHeaderFilters] = useState({});
  const [showHeaderFilters, setShowHeaderFilters] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [pendingUploadData, setPendingUploadData] = useState(null);
  const [isLightTheme, setIsLightTheme] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);

  // Alert System State
  const [auditAlert, setAuditAlert] = useState(null);
  const knownCaseStatuses = useRef(new Map());
  const isFirstLoad = useRef(true);

  // Feature Flags
  const [newUI, setNewUI] = useState(false);
  const [betaFeatures, setBetaFeatures] = useState(false);
  const [maintenanceModeAdmin, setMaintenanceModeAdmin] = useState(false);

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

  // Animation for Menu
  const slideAnim = useRef(new Animated.Value(-MENU_WIDTH)).current;

  useEffect(() => {
    if (menuOpen) {
      slideAnim.setValue(-MENU_WIDTH);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [menuOpen]);

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
    Animated.timing(slideAnim, {
      toValue: -MENU_WIDTH,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setMenuOpen(false));
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
      const timer = setTimeout(() => {
        setAuditAlert(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [auditAlert]);

  const uniqueCities = [...new Set(cases.map(c => c.city).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const sortedMembers = [...members].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  // Counters
  const assignedTL = cases.length + archivedCount;
  const reverted = cases.filter((c) => c.status === "reverted").length;
  const assignedFE = cases.filter((c) => c.status === "assigned").length;
  const audited = cases.filter((c) => c.status === "audit").length;
  const completed = cases.filter((c) => c.status === "completed").length + archivedCount;

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
    const matchesCity = cityFilter ? c.city === cityFilter : true;
    let matchesDate = true;
    if (fromDate) matchesDate = matchesDate && new Date(c.dateInitiated) >= fromDate;
    if (toDate) matchesDate = matchesDate && new Date(c.dateInitiated) <= toDate;
    return matchesSearch && matchesStatus && matchesRefNo && matchesVerification && matchesCity && matchesDate;
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
      else if (key === "dateInitiated") val = c.dateInitiated ? new Date(c.dateInitiated).toLocaleDateString() : "";
      return (val || "").toString().toLowerCase().includes(filterVal);
    });
  });

  const toggleSelectCase = (id) => {
    setSelectedCases((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
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
    setAssignDropdownVisible(false);
    setAssignTo("");
    if (Platform.OS === "web") alert("Success: Cases assigned successfully!");
    else Alert.alert("Success", "Cases assigned successfully!");
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

  const processExcelData = async (jsonData, mode) => {
    let addedCount = 0;
    let duplicateCount = 0;

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

      await firebase.database().ref(`cases`).push(caseData);
      addedCount++;
    }
    if (Platform.OS === "web") alert(`Upload Complete\nAdded: ${addedCount}\nSkipped (Exact Duplicates): ${duplicateCount}`);
    else Alert.alert("Upload Complete", `Added: ${addedCount}\nSkipped (Exact Duplicates): ${duplicateCount}`);
  };

  const uploadExcel = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      let fileUri;
      if (!result.canceled && result.assets?.length > 0) fileUri = result.assets[0].uri;
      else if (result.type === "success") fileUri = result.uri;
      else return;

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

      if (Platform.OS === "web") {
        setPendingUploadData(jsonData);
        setUploadModalVisible(true);
      } else {
        Alert.alert(
          "Upload Mode",
          "Choose how to process these cases:",
          [
            {
              text: "Manual",
              onPress: () => processExcelData(jsonData, "manual"),
            },
            {
              text: "Automate",
              onPress: () => processExcelData(jsonData, "automate"),
            },
            { text: "Cancel", style: "cancel" },
          ]
        );
      }
    } catch (err) {
      console.error("Error in uploadExcel:", err);
      if (Platform.OS === "web") alert("Error: Failed to upload Excel file");
      else Alert.alert("Error", "Failed to upload Excel file");
    }
  };

  const columnWidths = {
    number: 40,
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
    assigneeName: 100,
    assigneeRole: 80,
    completedAt: 100,
    comments: 150,
    dateInitiated: 100,
    revert: 60,
    manualAudit: 60,
  };

  const renderCase = ({ item, index }) => {
    const isSelected = selectedCases.includes(item.id);

    return (
      <View style={[styles.caseRow, index % 2 === 1 && styles.caseRowOdd, isLightTheme && { backgroundColor: index % 2 === 1 ? "rgba(0,0,0,0.05)" : "transparent", borderColor: "rgba(0,0,0,0.1)" }]}>
        {Object.keys(columnWidths).map((key) => {
          let value = "";
          let component = null;
          switch (key) {
            case "number":
              value = index + 1;
              break;
            case "select":
              value = isSelected ? "☑️" : "⬜️";
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
              value = item.dateInitiated ? new Date(item.dateInitiated).toLocaleDateString() : "-";
              break;
            case "revert":
              value = "Revert";
              break;
          }

          if (key === "revert") {
            component = (
              <TouchableOpacity
                key={key}
                style={{ width: columnWidths[key], justifyContent: "center", alignItems: "center" }}
                onPress={() => handleRevert(item.id)}
              >
                <Ionicons name="refresh-circle" size={24} color="#ffbb33" />
              </TouchableOpacity>
            );
          } else if (key === "manualAudit") {
            component = (
              <TouchableOpacity
                key={key}
                style={{ width: columnWidths[key], justifyContent: "center", alignItems: "center" }}
                onPress={() => navigation.navigate("AuditCaseScreen", { caseId: item.id, caseData: item, manualMode: true })}
              >
                <Ionicons name="cloud-upload" size={24} color="#2196f3" />
              </TouchableOpacity>
            );
          } else if (key === "status") {
             const statusColor = 
                (item.status === "completed" || item.status === "audit") ? "#00C851" : 
                item.status === "assigned" ? "#FFC107" : 
                (item.status === "reverted" || item.status === "fired") ? "#ff4444" : 
                "#bdbdbd";
             
             if (item.status === "audit") {
               component = (
                  <TouchableOpacity 
                    key={key} 
                    style={{ width: columnWidths[key], justifyContent: 'center', paddingRight: 5 }}
                    onPress={() => navigation.navigate("AuditCaseScreen", { caseId: item.id, caseData: item })}
                  >
                      <View style={{ backgroundColor: statusColor + '33', borderRadius: 4, paddingVertical: 2, paddingHorizontal: 6, borderWidth: 1, borderColor: statusColor }}>
                          <Text style={{ color: statusColor, fontSize: 10, fontWeight: 'bold', textAlign: 'center' }}>
                              {value.toUpperCase()}
                          </Text>
                      </View>
                  </TouchableOpacity>
               );
             } else {
               component = (
                  <View key={key} style={{ width: columnWidths[key], justifyContent: 'center', paddingRight: 5 }}>
                      <View style={{ backgroundColor: statusColor + '33', borderRadius: 4, paddingVertical: 2, paddingHorizontal: 6, borderWidth: 1, borderColor: statusColor }}>
                          <Text style={{ color: statusColor, fontSize: 10, fontWeight: 'bold', textAlign: 'center' }}>
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
              style={[styles.cell, { width: columnWidths[key] }, isLightTheme && { color: "#333" }]}
              numberOfLines={2}
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
    <LinearGradient colors={isLightTheme ? ["#8cacf1", "#acd1fb", "#8ee2fa"] : ["#0f0c29", "#302b63", "#24243e"]} style={{ flex: 1 }}>{/* Hamburger Menu Overlay */}
      {/* Hamburger Menu Overlay */}
      {menuOpen && (
        <View style={styles.menuOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={closeMenu} activeOpacity={1} />
          <Animated.View style={[styles.menu, { transform: [{ translateX: slideAnim }] }]}>
            {/* Modern Header */}
            <LinearGradient colors={["#4e0360", "#c471ed"]} style={styles.menuHeader}>
                <View style={styles.menuUserAvatar}>
                    <Text style={styles.menuUserInitials}>{(user?.name || user?.email || "A").charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{flex: 1}}>
                    <Text style={styles.menuUserName} numberOfLines={1}>{user?.name || "Admin"}</Text>
                    <Text style={styles.menuUserEmail} numberOfLines={1}>{user?.email}</Text>
                </View>
            </LinearGradient>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 10 }}>
                {[
                    { label: "Member View", icon: "people-outline", screen: "MemberViewScreen" },
                    { label: "Completed Cases", icon: "checkmark-done-circle-outline", screen: "CompletedCases" },
                    { label: "Reverted Cases", icon: "refresh-circle-outline", screen: "RevertedCasesScreen" },
                    { label: "Verify Profile", icon: "shield-checkmark-outline", screen: "VerifyProfileScreen" },
                    { label: "Member DSR", icon: "document-text-outline", screen: "MemberDSRScreen" },
                    { label: "Mail Records", icon: "mail-outline", screen: "MailRecordsScreen" },
                    { label: "Statistics", icon: "stats-chart-outline", screen: "StatisticsScreen" },
                    { label: "Support Tickets", icon: "ticket-outline", screen: "AllTicketsScreen" },
                ].map((item, index) => (
                    <TouchableOpacity key={index} style={styles.menuItem} onPress={() => { closeMenu(); navigation.navigate(item.screen); }}>
                        <Ionicons name={item.icon} size={22} color="#555" style={{ marginRight: 15 }} />
                        <Text style={styles.menuText}>{item.label}</Text>
                    </TouchableOpacity>
                ))}

                <TouchableOpacity style={styles.menuItem} onPress={() => { 
                    closeMenu(); 
                    firebase.auth().signOut().then(() => {
                      logout(); // This updates App.js state and switches to AuthStack
                    }).catch((error) => {
                      if (Platform.OS === 'web') alert("Error: Failed to log off: " + error.message);
                      else Alert.alert("Error", "Failed to log off: " + error.message);
                    });
                }}>
                    <Ionicons name="log-out-outline" size={22} color="#ff4444" style={{ marginRight: 15 }} />
                    <Text style={[styles.menuText, { color: "#ff4444" }]}>Log Off</Text>
                </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </View>
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

      {/* Fixed Top Section */}
      <View style={{ paddingHorizontal: 10, paddingTop: maintenanceModeAdmin ? 10 : (Platform.OS === 'android' ? 40 : 50), paddingBottom: 5 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={openMenu} style={styles.iconButton}>
            <Ionicons name="menu" size={32} color={isLightTheme ? "#333" : "#fff"} />
          </TouchableOpacity>

          <View style={styles.logoContainer}>
            <Image source={require("../assets/logo.png")} style={styles.logo} resizeMode="contain" />
            <View>
              <Text style={[styles.title, isLightTheme && { color: "#333" }]}>SpaceSolutions Admin</Text>
            </View>
          </View>

          <TouchableOpacity onPress={() => setIsLightTheme(!isLightTheme)} style={styles.iconButton}>
            <Ionicons name={isLightTheme ? "color-palette" : "color-palette-outline"} size={28} color={isLightTheme ? "#333" : "#fff"} />
          </TouchableOpacity>
        </View>

        {/* Counters */}
        <View style={styles.counterRow}>
          {[
            { label: "Total", value: assignedTL, color: isLightTheme ? "#004d40" : "#33b5e5" },
            { label: "Reverted", value: reverted, color: isLightTheme ? "#b71c1c" : "#ff4444" },
            { label: "Assigned", value: assignedFE, color: isLightTheme ? "#01579b" : "#0099CC" },
            { label: "Audit", value: audited, color: isLightTheme ? "#bf360c" : "#FF8800" },
            { label: "Done", value: completed, color: isLightTheme ? "#1b5e20" : "#00C851" },
          ].map((c, idx) => (
            <BlurView intensity={isLightTheme ? 80 : 40} tint={isLightTheme ? "light" : "dark"} key={idx} style={[styles.counterBox, { borderLeftColor: c.color }]}>
              <Text style={[styles.counterValue, { color: c.color }]}>{c.value}</Text>
              <Text style={[styles.counterLabel, { color: isLightTheme ? "#000" : "#ddd" }]}>{c.label}</Text>
            </BlurView>
          ))}
        </View>

        {/* Beta Heavy Features: Smart Actions Toolbar */}
        {betaFeatures && (
          <View style={styles.betaToolbar}>
            <Text style={styles.betaLabel}>ADVANCED TOOLS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 10 }}>
              <TouchableOpacity style={styles.betaButton}>
                <Ionicons name="analytics" size={14} color="#fff" />
                <Text style={styles.betaButtonText}>AI Analysis</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.betaButton}>
                <Ionicons name="download" size={14} color="#fff" />
                <Text style={styles.betaButtonText}>Bulk Export</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* Upload & Assign */}
        <View style={styles.uploadAssignRow}>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: "#2e7d32" }]} onPress={uploadExcel}>
            <Ionicons name="cloud-upload-outline" size={16} color="#fff" style={{ marginRight: 5 }} />
            <Text style={styles.filterButtonText}>Upload Excel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: "#f9a825" }]}
            onPress={() => {
              if (selectedCases.length === 0) {
                if (Platform.OS === "web") return alert("Error: Select at least one case first.");
                return Alert.alert("Error", "Select at least one case first.");
              }
              setAssignDropdownVisible((prev) => !prev);
            }}
          >
            <Ionicons name="person-add-outline" size={16} color="#fff" style={{ marginRight: 5 }} />
            <Text style={styles.filterButtonText}>Assign</Text>
          </TouchableOpacity>
        </View>

        {assignDropdownVisible && (
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
            <Picker
              selectedValue={assignTo}
              onValueChange={setAssignTo}
              style={[styles.assignPicker, { width: 140, marginRight: 6 }]}
            >
              <Picker.Item label="Select Member" value="" />
              {sortedMembers.map((m) => (
                <Picker.Item key={m.id} label={`${m.name} (${m.uniqueId || "N/A"})`} value={m.id} />
              ))}
            </Picker>
            {assignTo !== "" && (
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: "#0099CC", marginLeft: 5 }]} onPress={assignCases}>
                <Text style={styles.filterButtonText}>Confirm</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Search Filters */}
        <View style={styles.searchFilter}>
          <View style={[styles.searchContainer, { backgroundColor: isLightTheme ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.1)" }]}>
             <Ionicons name="search" size={16} color={isLightTheme ? "#333" : "#aaa"} style={{ marginRight: 5 }} />
             <TextInput
                placeholder="Search Name..."
                placeholderTextColor={isLightTheme ? "#333" : "#ccc"}
                value={searchText}
                onChangeText={setSearchText}
                style={[styles.searchInput, { color: isLightTheme ? "#000" : "#fff" }]}
             />
          </View>
          <View style={[styles.searchContainer, { backgroundColor: isLightTheme ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.1)" }]}>
             <Ionicons name="qr-code-outline" size={16} color={isLightTheme ? "#333" : "#aaa"} style={{ marginRight: 5 }} />
             <TextInput
                placeholder="Ref No..."
                placeholderTextColor={isLightTheme ? "#333" : "#ccc"}
                value={refNoFilter}
                onChangeText={setRefNoFilter}
                style={[styles.searchInput, { color: isLightTheme ? "#000" : "#fff" }]}
             />
          </View>
          
          <View style={[styles.pickerContainer, { backgroundColor: isLightTheme ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.9)" }]}>
              <Picker selectedValue={statusFilter} onValueChange={setStatusFilter} style={styles.picker} dropdownIconColor="#333">
                <Picker.Item label="Status: All" value="" style={{fontSize: 12, color: '#000'}} />
                <Picker.Item label="Assigned" value="assigned" style={{fontSize: 12, color: '#000'}} />
                <Picker.Item label="Audit" value="audit" style={{fontSize: 12, color: '#000'}} />
                <Picker.Item label="Fired" value="fired" style={{fontSize: 12, color: '#000'}} />
              </Picker>
          </View>

          <View style={[styles.pickerContainer, { backgroundColor: isLightTheme ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.9)" }]}>
              <Picker selectedValue={cityFilter} onValueChange={setCityFilter} style={styles.picker} dropdownIconColor="#333">
                <Picker.Item label="City: All" value="" style={{fontSize: 12, color: '#000'}} />
                {uniqueCities.map(city => <Picker.Item key={city} label={city} value={city} style={{fontSize: 12, color: '#000'}} />)}
              </Picker>
          </View>

          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: "#455A64" }]}
            onPress={() => setShowHeaderFilters(!showHeaderFilters)}
          >
            <Ionicons name="filter" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: "#c62828" }]}
            onPress={() => {
              setSearchText("");
              setRefNoFilter("");
              setStatusFilter("");
              setVerificationFilter("");
              setCityFilter("");
              setFromDate(null);
              setToDate(null);
              setHeaderFilters({});
            }}
          >
            <Ionicons name="refresh" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Table Section - Takes remaining space */}
      <View style={{ flex: 1, paddingHorizontal: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={{ flexGrow: 1 }}>
          <View style={{ width: Object.values(columnWidths).reduce((a, b) => a + b, 0), flex: 1 }}>
            <View style={[styles.tableHeader, isLightTheme && { backgroundColor: "rgba(255,255,255,0.5)", borderColor: "rgba(255,255,255,0.2)" }]}>
              {Object.keys(columnWidths).map((key) => (
                <Text
                  key={key}
                  style={[
                    styles.cell,
                    styles.headerCell,
                    { width: columnWidths[key] },
                    key === "revert" ? { textAlign: "center" } : null,
                    isLightTheme && { color: "#000", fontWeight: "800" }
                  ]}
                >
                  {key === "number" ? "#" : key}
                </Text>
              ))}
            </View>
            {showHeaderFilters && (
              <View style={[styles.tableHeader, { backgroundColor: isLightTheme ? "#d0d0d0" : "#2a2a40", borderTopWidth: 0 }]}>
                {Object.keys(columnWidths).map((key) => {
                  if (["number", "select", "revert"].includes(key)) {
                    return <View key={key} style={{ width: columnWidths[key] }} />;
                  }
                  return (
                    <TextInput
                      key={key}
                      style={{
                        width: columnWidths[key],
                        backgroundColor: isLightTheme ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.1)",
                        color: isLightTheme ? "#333" : "#fff",
                        borderWidth: 1,
                        borderColor: isLightTheme ? "rgba(0,0,0,0.1)" : "#444",
                        fontSize: 11,
                        paddingHorizontal: 5,
                        height: 30,
                        borderRadius: 4,
                        marginRight: 2,
                      }}
                      placeholder="..."
                      placeholderTextColor={isLightTheme ? "#666" : "#777"}
                      value={headerFilters[key] || ""}
                      onChangeText={(text) => setHeaderFilters((prev) => ({ ...prev, [key]: text }))}
                    />
                  );
                })}
              </View>
            )}
            <FlatList
              style={{ flex: 1 }}
              data={fullyFilteredCases}
              renderItem={renderCase}
              initialNumToRender={1000}
              maxToRenderPerBatch={400}
              windowSize={70}
              keyExtractor={(item) => item.id}
              removeClippedSubviews={false}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingBottom: 10 }}
            />
          </View>
        </ScrollView>
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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  iconButton: {
    padding: 5,
  },
  logoContainer: {
    alignItems: "center",
  },
  logo: {
    width: 40,
    height: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  counterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  counterBox: {
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 10,
    borderRadius: 8,
    width: "18%",
    alignItems: "center",
    borderLeftWidth: 3,
    overflow: "hidden",
  },
  counterLabel: {
    fontSize: 10,
    color: "#aaa",
    marginTop: 2,
    textAlign: "center",
    textTransform: "uppercase",
  },
  counterValue: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
  },
  uploadAssignRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    elevation: 3,
  },
  filterButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 12,
  },
  assignPicker: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 6,
    marginVertical: 6,
    height: 40,
  },
  searchFilter: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    flexWrap: "wrap",
    gap: 8,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 20,
    paddingHorizontal: 10,
    height: 36,
    flex: 1,
    minWidth: 120,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    fontSize: 12,
    paddingVertical: 0,
  },
  pickerContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    height: 36,
    justifyContent: "center",
    flex: 1,
    minWidth: 120,
    overflow: "hidden",
  },
  picker: {
    color: "#333",
    height: 36,
    width: "100%",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#2a2a40",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#444",
    alignItems: "center",
  },
  headerCell: {
    fontWeight: "bold",
    color: "#fff",
    textAlign: "left",
    paddingHorizontal: 4,
    fontSize: 12,
  },
  caseRow: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
  },
  caseRowOdd: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  cell: {
    paddingHorizontal: 4,
    fontSize: 11,
    color: "#ccc",
    textAlign: "left",
  },
  menuOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 100,
  },
  menu: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: MENU_WIDTH,
    backgroundColor: "#fff",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
  },
  menuHeader: { padding: 20, paddingTop: 50, flexDirection: "row", alignItems: "center" },
  menuUserAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#fff", justifyContent: "center", alignItems: "center", marginRight: 15 },
  menuUserInitials: { fontSize: 20, fontWeight: "bold", color: "#4e0360" },
  menuUserName: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  menuUserEmail: { color: "rgba(255,255,255,0.8)", fontSize: 12 },
  menuItem: {
    flexDirection: "row", alignItems: "center", paddingVertical: 15, paddingHorizontal: 20
  },
  menuText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  webModalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 200,
    justifyContent: "center",
    alignItems: "center",
  },
  webModalContent: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 10,
    width: 300,
    alignItems: "center",
    elevation: 5,
  },
  webModalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  webModalText: {
    marginBottom: 20,
    textAlign: "center",
  },
  webModalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  webModalButton: {
    padding: 10,
    borderRadius: 5,
    flex: 1,
    marginHorizontal: 5,
    alignItems: "center",
  },
  webModalButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  toastContainer: {
    position: 'absolute',
    top: 90,
    left: 20,
    right: 20,
    zIndex: 2000,
    alignItems: 'center',
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 10,
    elevation: 10,
    width: '100%',
  },
  toastTitle: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 2,
  },
  toastText: {
    color: '#fff',
    fontSize: 14,
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
  betaToolbar: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  betaLabel: {
    color: "#aaa",
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 5,
    marginLeft: 5,
  },
  betaButton: {
    flexDirection: "row",
    backgroundColor: "#4a148c",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 15,
    alignItems: "center",
    gap: 5,
  },
  betaButtonText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "bold",
  },
});
