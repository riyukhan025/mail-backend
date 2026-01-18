import { Ionicons } from "@expo/vector-icons";
import { Client, Databases, Query } from "appwrite";
import { LinearGradient } from "expo-linear-gradient"; // Import LinearGradient
import { useEffect, useState } from "react"; // Import useEffect and useState
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native"; // Import missing components
import firebase from "../firebase";
// Appwrite Configuration
const APPWRITE_ENDPOINT = "https://tor.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6921d1250036b4841242";
const APPWRITE_DATABASE_ID = "6921d17f0022f5f0cf10";
const APPWRITE_COLLECTION_ID = "dsr_reports";

const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);
const databases = new Databases(client);

export default function MemberDSRDetailScreen({ navigation, route }) {
  const { memberId, memberName } = route.params || {};
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [liveStats, setLiveStats] = useState(null);

  useEffect(() => {
    if (!memberId) return;

    const fetchDSRs = async () => {
      try {
        const response = await databases.listDocuments(
          APPWRITE_DATABASE_ID,
          APPWRITE_COLLECTION_ID,
          [
            Query.equal("userId", memberId),
            Query.orderDesc("date"),
          ]
        );
        setReports(response.documents);
        if (response.documents.length > 0) {
          setSelectedReport(response.documents[0]);
        }
      } catch (error) {
        console.error("Error fetching DSRs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDSRs();
  }, [memberId]);

  // Fetch Live Automatic DSR from Firebase
  useEffect(() => {
    if (!memberId) return;
    const casesRef = firebase.database().ref("cases");
    const query = casesRef.orderByChild("assignedTo").equalTo(memberId);

    const listener = query.on("value", (snapshot) => {
        const data = snapshot.val() || {};
        const allCases = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        
        const today = new Date();
        today.setHours(0,0,0,0);

        const assignedToday = allCases.filter(c => c.assignedAt && new Date(c.assignedAt) >= today).length;
        
        const completedTodayCases = allCases.filter(c => {
             const isCompleted = c.status === 'audit' || c.status === 'completed';
             return isCompleted && c.completedAt && new Date(c.completedAt) >= today;
        });

        const completedTotal = allCases.filter(c => c.status === 'audit' || c.status === 'completed').length;
        const remaining = allCases.filter(c => ['assigned', 'open', 'reverted'].includes(c.status)).length;

        setLiveStats({
            assignedToday,
            completedToday: completedTodayCases.length,
            completedTotal,
            remaining,
            totalCases: allCases.length,
            completedCasesList: completedTodayCases.map(c => c.matrixRefNo || c.RefNo || c.id)
        });
    });
    return () => query.off("value", listener);
  }, [memberId]);

  const handleTally = () => {
    const total = reports.reduce((sum, report) => sum + (report.completedCount || 0), 0);
    Alert.alert("Member Tally", `Total cases completed till now: ${total}`);
  };

  return (
    <LinearGradient colors={["#4e0360", "#1a1a1a"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>{memberName}'s DSR</Text>
        <TouchableOpacity style={styles.tallyButton} onPress={handleTally}>
          <Text style={styles.tallyText}>View Tally</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Live Automatic DSR Card */}
          {liveStats && (
            <View style={[styles.card, { borderColor: '#00e676', borderWidth: 1, marginBottom: 20 }]}>
                <Text style={[styles.date, { color: '#00e676', borderBottomColor: '#00e676' }]}>Live Automatic DSR (Today)</Text>
                <View style={styles.row}>
                    <Text style={styles.label}>Assigned Today:</Text>
                    <Text style={styles.value}>{liveStats.assignedToday}</Text>
                </View>
                <View style={styles.row}>
                    <Text style={styles.label}>Completed Today:</Text>
                    <Text style={styles.value}>{liveStats.completedToday}</Text>
                </View>
                <View style={styles.row}>
                    <Text style={styles.label}>Pending:</Text>
                    <Text style={styles.value}>{liveStats.remaining}</Text>
                </View>
                 <View style={styles.row}>
                    <Text style={styles.label}>Total Completed:</Text>
                    <Text style={styles.value}>{liveStats.completedTotal}</Text>
                </View>
                {liveStats.completedCasesList && liveStats.completedCasesList.length > 0 && (
                    <View style={{ marginTop: 10 }}>
                        <Text style={[styles.casesLabel, {color: '#00e676', fontSize: 14}]}>Live Completed Cases:</Text>
                        <Text style={styles.casesText}>{liveStats.completedCasesList.join(", ")}</Text>
                    </View>
                )}
            </View>
          )}

          {reports.length > 0 ? (
          <>
          <TouchableOpacity style={styles.dateButton} onPress={() => setModalVisible(true)}>
            <Ionicons name="calendar-outline" size={24} color="#fff" />
            <Text style={styles.dateButtonText}>
              {selectedReport ? new Date(selectedReport.date).toDateString() : "Select Date"}
            </Text>
          </TouchableOpacity>

          {/* DSR Card */}
          {selectedReport && (
          <View style={styles.card}>
            <Text style={styles.date}>{new Date(selectedReport.date).toDateString()}</Text>
            
            <View style={styles.row}>
              <Text style={styles.label}>Cases Assigned Today:</Text>
              <Text style={styles.value}>{selectedReport.assignedToday ?? "-"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Total Cases:</Text>
              <Text style={styles.value}>{selectedReport.totalCases ?? "-"}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Total Cases Completed Today:</Text>
              <Text style={styles.value}>{selectedReport.completedCount ?? "-"}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Total Cases Completed Till Date:</Text>
              <Text style={styles.value}>{selectedReport.completedTotal ?? "-"}</Text>
            </View>
            
            <View style={styles.row}>
              <Text style={styles.label}>Total Remaining:</Text>
              <Text style={styles.value}>{selectedReport.remainingOpenCount ?? "-"}</Text>
            </View>

            <View style={styles.divider} />

            <Text style={styles.casesLabel}>Completed Cases:</Text>
            {selectedReport.completedCases && selectedReport.completedCases !== "[]" && selectedReport.completedCases.trim().length > 0 ? (
              selectedReport.completedCases.split(",").map((refNo, index) => (
                <View key={index} style={styles.completedCaseCard}>
                  <View style={styles.iconContainer}>
                    <Ionicons name="checkmark-circle" size={28} color="#4caf50" />
                  </View>
                  <View style={styles.caseDetails}>
                    <Text style={styles.caseRefText}>{refNo.trim()}</Text>
                    <Text style={styles.caseStatusText}>Status: Completed</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.casesText}>None</Text>
            )}
            
            <Text style={styles.timestamp}>Submitted: {new Date(selectedReport.submittedAt).toLocaleTimeString()}</Text>
          </View>
          )}
          </>
          ) : (
            <Text style={styles.emptyText}>No manual DSR reports submitted.</Text>
          )}
        </ScrollView>
      )}

      {/* Date Selection Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Date</Text>
            <FlatList
              data={reports}
              keyExtractor={(item) => item.$id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setSelectedReport(item);
                    setModalVisible(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{new Date(item.date).toDateString()}</Text>
                  {item.$id === selectedReport?.$id && <Ionicons name="checkmark" size={20} color="#4caf50" />}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.closeButton} onPress={() => setModalVisible(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  backButton: { marginRight: 15 },
  title: { fontSize: 18, fontWeight: "bold", color: "#fff", flex: 1 },
  tallyButton: { backgroundColor: "#facc15", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 5 },
  tallyText: { color: "#000", fontWeight: "bold", fontSize: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: 20 },
  dateButton: {
    flexDirection: "row",
    backgroundColor: "#007AFF",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  dateButtonText: { color: "#fff", fontWeight: "bold", marginLeft: 8 },
  card: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
  },
  date: {
    color: "#ffd700",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    paddingBottom: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
    paddingBottom: 8,
  },
  label: { color: "#ccc", fontSize: 15, flex: 1 },
  value: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.2)", marginVertical: 15 },
  casesLabel: { color: "#ffd700", fontSize: 16, marginBottom: 8, fontWeight: "bold" },
  casesText: { color: "#fff", fontSize: 14, lineHeight: 20, backgroundColor: "rgba(0,0,0,0.2)", padding: 10, borderRadius: 8 },
  completedCaseCard: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    alignItems: "center",
    borderLeftWidth: 4,
    borderLeftColor: "#4caf50",
  },
  iconContainer: { marginRight: 15 },
  caseDetails: { flex: 1 },
  caseRefText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  caseStatusText: { color: "#aaa", fontSize: 12, marginTop: 2 },
  timestamp: { color: "#888", fontSize: 12, marginTop: 20, textAlign: "right" },
  emptyText: { color: "#ccc", textAlign: "center", marginTop: 50 },
  
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  modalContent: { backgroundColor: "#fff", borderRadius: 15, padding: 20, maxHeight: "80%" },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 15, textAlign: "center", color: "#333" },
  modalItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: "#eee", flexDirection: "row", justifyContent: "space-between" },
  modalItemText: { fontSize: 16, color: "#333" },
  closeButton: { marginTop: 15, backgroundColor: "#ff4757", padding: 12, borderRadius: 8, alignItems: "center" },
  closeButtonText: { color: "#fff", fontWeight: "bold" },
});
