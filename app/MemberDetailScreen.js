import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import firebase from "../firebase";

export default function MemberDetailScreen({ navigation, route }) {
  const { memberId } = route.params || {};
  const [member, setMember] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Assigned");

  useEffect(() => {
    if (!memberId) return;

    // Fetch member profile
    const userRef = firebase.database().ref(`users/${memberId}`);
    userRef.once("value").then((snapshot) => {
      setMember(snapshot.val());
    });

    // Fetch assigned cases
    const casesRef = firebase.database().ref("cases");
    const query = casesRef.orderByChild("assignedTo").equalTo(memberId);
    
    const listener = query.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data).map((key) => ({ id: key, ...data[key] }));
      setCases(list);
      setLoading(false);
    });

    return () => {
      query.off("value", listener);
    };
  }, [memberId]);


  if (!member) {
    return (
      <LinearGradient colors={["#4e0360", "#1a1a1a"]} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Member Details</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.text}>Member not found.</Text>
        </View>
      </LinearGradient>
    );
  }

  // Calculate stats
  const totalCases = cases.length;
  const completedCases = cases.filter(c => c.status === "completed").length;
  const pendingCases = cases.filter(c => c.status === "assigned" || c.status === "audit").length;

  const filteredCases = cases.filter((c) => {
    if (activeTab === "Assigned") return true;
    if (activeTab === "Completed") return c.status === "completed";
    if (activeTab === "Pending") return c.status === "assigned" || c.status === "audit";
    return true;
  });

  const renderHeader = () => (
    <View>
      <View style={styles.profileHeader}>
        {member.photoURL ? (
          <Image source={{ uri: member.photoURL }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={50} color="#888" />
          </View>
        )}
        <Text style={styles.name}>{member.name || "No Name"}</Text>
        <Text style={styles.role}>{member.role || "Member"}</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{totalCases}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: "#4caf50" }]}>{completedCases}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statValue, { color: "#ff9800" }]}>{pendingCases}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
      </View>

      <View style={styles.tabContainer}>
        {["Assigned", "Completed", "Pending"].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabButton, activeTab === tab && styles.activeTabButton]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>{activeTab === "Assigned" ? "All Assigned" : activeTab} Cases</Text>
    </View>
  );

  const renderCaseItem = ({ item }) => (
    <TouchableOpacity
      style={styles.caseCard}
      onPress={() => navigation.navigate("CaseDetail", { caseId: item.id, role: "admin" })}
    >
      <View style={styles.caseHeader}>
        <Text style={styles.caseRef}>{item.matrixRefNo || item.id}</Text>
        <Text style={[styles.caseStatus, { color: item.status === "completed" ? "#4caf50" : "#ff9800" }]}>
          {item.status?.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.caseText}>Candidate: {item.candidateName || "N/A"}</Text>
      <Text style={styles.caseText}>Address: {item.address || "N/A"}</Text>
      <Text style={styles.caseText}>
        Assigned: {item.assignedAt ? new Date(item.assignedAt).toLocaleDateString() : "N/A"}
      </Text>
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={["#ffffff", "#f0f8ff"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Member Activity</Text>
      </View>

      <FlatList
        data={filteredCases}
        keyExtractor={(item) => item.id}
        renderItem={renderCaseItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.content}
        ListEmptyComponent={<Text style={styles.emptyText}>No cases assigned to this member.</Text>}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  backButton: { marginRight: 15 },
  title: { fontSize: 20, fontWeight: "bold", color: "#333" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  text: { color: "#666", fontSize: 16 },
  content: { padding: 20 },
  profileHeader: { alignItems: "center", marginBottom: 20 },
  avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 10, borderWidth: 2, borderColor: "#333" },
  avatarPlaceholder: { width: 80, height: 80, borderRadius: 40, backgroundColor: "#e1e1e1", justifyContent: "center", alignItems: "center", marginBottom: 10, borderWidth: 2, borderColor: "#333" },
  name: { fontSize: 22, fontWeight: "bold", color: "#333" },
  role: { fontSize: 14, color: "#666", marginTop: 2, textTransform: "capitalize" },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 15,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  statBox: { alignItems: "center", flex: 1 },
  statValue: { fontSize: 20, fontWeight: "bold", color: "#333" },
  statLabel: { fontSize: 12, color: "#666", marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: "bold", color: "#333", marginBottom: 10 },
  caseCard: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#6a11cb",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  caseHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  caseRef: { fontSize: 16, fontWeight: "bold", color: "#333" },
  caseStatus: { fontSize: 12, fontWeight: "bold" },
  caseText: { color: "#666", fontSize: 14, marginBottom: 2 },
  emptyText: { color: "#888", textAlign: "center", marginTop: 20 },
  tabContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
    backgroundColor: "#e0e0e0",
    borderRadius: 10,
    padding: 5,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  activeTabButton: { backgroundColor: "#fff" },
  tabText: { color: "#666", fontWeight: "bold", fontSize: 14 },
  activeTabText: { color: "#333" },
});