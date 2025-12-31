import { Ionicons } from "@expo/vector-icons";
import { Client, Databases, Query } from "appwrite";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { FlatList, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import firebase from "../firebase";

// Appwrite Configuration
const APPWRITE_ENDPOINT = "https://tor.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = "6921d1250036b4841242";
const APPWRITE_DATABASE_ID = "6921d17f0022f5f0cf10";
const APPWRITE_COLLECTION_ID = "dsr_reports";

const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT_ID);
const databases = new Databases(client);

export default function MemberDSRScreen({ navigation }) {
  const [members, setMembers] = useState([]);
  const [dailyTally, setDailyTally] = useState(0);
  const [monthlyTally, setMonthlyTally] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTallyType, setSelectedTallyType] = useState(""); // 'Daily' or 'Monthly'

  useEffect(() => {
    const usersRef = firebase.database().ref("users");
    const listener = usersRef.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data).map((key) => ({ id: key, ...data[key] }));
      setMembers(list);
    });
    return () => usersRef.off("value", listener);
  }, []);

  useEffect(() => {
    const fetchTallies = async () => {
      const now = new Date();
      const today = now.toISOString().split("T")[0];
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split("T")[0];

      try {
        // Daily Tally
        const dailyRes = await databases.listDocuments(
          APPWRITE_DATABASE_ID,
          APPWRITE_COLLECTION_ID,
          [Query.equal("date", today), Query.limit(1000)]
        );
        const dTotal = dailyRes.documents.reduce((sum, doc) => sum + (doc.completedCount || 0), 0);
        setDailyTally(dTotal);

        // Monthly Tally
        const monthlyRes = await databases.listDocuments(
          APPWRITE_DATABASE_ID,
          APPWRITE_COLLECTION_ID,
          [
            Query.greaterThanEqual("date", startOfMonth),
            Query.lessThan("date", nextMonth),
            Query.limit(1000)
          ]
        );
        const mTotal = monthlyRes.documents.reduce((sum, doc) => sum + (doc.completedCount || 0), 0);
        setMonthlyTally(mTotal);
      } catch (e) {
        console.error("Error fetching tallies:", e);
      }
    };
    fetchTallies();
  }, []);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate("MemberDSRDetailScreen", { memberId: item.id, memberName: item.name || item.email })}
    >
      <View style={styles.avatar}>
        {item.photoURL ? (
          <Image source={{ uri: item.photoURL }} style={styles.avatarImage} />
        ) : (
          <Ionicons name="person" size={24} color="#fff" />
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{item.name || item.email || "Unknown"}</Text>
        <Text style={styles.role}>{item.role || "Member"}</Text>
      </View>
      <Ionicons name="chevron-forward" size={24} color="#ccc" />
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={["#4e0360", "#1a1a1a"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Member DSR Reports</Text>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.tallyButton} onPress={() => { setSelectedTallyType("Daily"); setModalVisible(true); }}>
          <Text style={styles.tallyButtonText}>Daily Tally</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tallyButton} onPress={() => { setSelectedTallyType("Monthly"); setModalVisible(true); }}>
          <Text style={styles.tallyButtonText}>Monthly Tally</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>No members found.</Text>}
      />

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{selectedTallyType} Tally</Text>
            <Text style={styles.modalValue}>{selectedTallyType === "Daily" ? dailyTally : monthlyTally}</Text>
            <Text style={styles.modalSubtitle}>Total Cases Completed</Text>
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
  headerTitle: { fontSize: 20, fontWeight: "bold", color: "#fff" },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  tallyButton: { backgroundColor: "#facc15", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, flex: 0.48, alignItems: "center" },
  tallyButtonText: { color: "#000", fontWeight: "bold", fontSize: 14 },
  list: { padding: 20 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 15,
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: "bold", color: "#fff" },
  role: { color: "#ccc", fontSize: 14, marginTop: 2 },
  emptyText: { color: "#ccc", textAlign: "center", marginTop: 50 },
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center" },
  modalContent: { backgroundColor: "#fff", width: "80%", padding: 25, borderRadius: 15, alignItems: "center", elevation: 5 },
  modalTitle: { fontSize: 22, fontWeight: "bold", color: "#333", marginBottom: 10 },
  modalValue: { fontSize: 48, fontWeight: "bold", color: "#4e0360", marginBottom: 5 },
  modalSubtitle: { fontSize: 16, color: "#666", marginBottom: 20 },
  closeButton: { backgroundColor: "#ff4757", paddingVertical: 10, paddingHorizontal: 30, borderRadius: 8 },
  closeButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});