import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { Animated, FlatList, Image, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import firebase from "../firebase";

export default function MemberDetailScreen({ navigation, route }) {
  const { memberId } = route.params || {};
  const [member, setMember] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("Assigned");
  const { width } = useWindowDimensions();
  const isMobile = width < 760;
  const pulseAnim = useRef(new Animated.Value(0.5)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 900, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.timing(ringAnim, {
        toValue: 1,
        duration: 10000,
        useNativeDriver: true,
      })
    ).start();
  }, [pulseAnim, ringAnim]);


  if (!member) {
    return (
      <LinearGradient colors={["#060B1A", "#0B1230", "#111734"]} style={styles.container}>
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
  const online = String(member.status || "").toLowerCase() === "online";

  const filteredCases = cases.filter((c) => {
    if (activeTab === "Assigned") return true;
    if (activeTab === "Completed") return c.status === "completed";
    if (activeTab === "Pending") return c.status === "assigned" || c.status === "audit";
    return true;
  });

  const renderHeader = () => (
    <View>
      <View style={styles.profileHeader}>
        <Animated.View
          style={[
            styles.avatarOuterRing,
            {
              transform: [
                {
                  rotate: ringAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0deg", "360deg"],
                  }),
                },
              ],
            },
          ]}
        />
        <View style={styles.avatarCore}>
          {member.photoURL ? (
            <Image source={{ uri: member.photoURL }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={48} color="#94a3b8" />
            </View>
          )}
        </View>
        <Text style={styles.name}>{member.name || "No Name"}</Text>
        <View style={styles.statusPill}>
          <Animated.View style={[styles.statusDot, { opacity: pulseAnim }]} />
          <Text style={styles.role}>STATUS: {online ? "ONLINE" : "OFFLINE"}</Text>
        </View>
      </View>

      <View style={[styles.statsContainer, isMobile && styles.statsContainerMobile]}>
        <View style={[styles.statBox, { borderColor: "rgba(34,211,238,0.45)" }]}>
          <Text style={styles.statValue}>{totalCases}</Text>
          <Text style={styles.statLabel}>SEC_LOG_VERIFIED</Text>
        </View>
        <View style={[styles.statBox, { borderColor: "rgba(96,165,250,0.45)" }]}>
          <Text style={styles.statValue}>{completedCases}</Text>
          <Text style={styles.statLabel}>DATA_SYNCED</Text>
        </View>
        <View style={[styles.statBox, { borderColor: "rgba(74,222,128,0.45)" }]}>
          <Text style={[styles.statValue, { color: "#86efac" }]}>{completedCases}</Text>
          <Text style={styles.statLabel}>TASK_COMPLETED</Text>
        </View>
        <View style={[styles.statBox, { borderColor: "rgba(251,191,36,0.45)" }]}>
          <Text style={[styles.statValue, { color: "#fcd34d" }]}>{pendingCases}</Text>
          <Text style={styles.statLabel}>PROCESS_QUEUED</Text>
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

      <Text style={styles.sectionTitle}>// Active Tasks</Text>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyPanel}>
      <Ionicons name="folder-open-outline" size={54} color="#3dd6e9" />
      <Text style={styles.emptyText}>{loading ? "Scanning database..." : "> SCANNING DATABASE... NO ACTIVE TASKS FOUND."}</Text>
    </View>
  );

  const renderCaseItem = ({ item }) => (
    <TouchableOpacity
      style={styles.caseCard}
      onPress={() => navigation.navigate("CaseDetail", { caseId: item.id, role: "admin" })}
    >
      <View style={styles.caseHeader}>
        <Text style={styles.caseRef}>{item.matrixRefNo || item.id}</Text>
        <Text style={[styles.caseStatus, { color: item.status === "completed" ? "#4ade80" : "#fbbf24" }]}>
          {item.status?.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.caseText}>CANDIDATE: {item.candidateName || "N/A"}</Text>
      <Text style={styles.caseText}>ADDRESS: {item.address || "N/A"}</Text>
      <Text style={styles.caseText}>
        ASSIGNED: {item.assignedAt ? new Date(item.assignedAt).toLocaleDateString() : "N/A"}
      </Text>
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={["#060B1A", "#0B1230", "#111734"]} style={styles.container}>
      <View style={[styles.bgOverlay, { pointerEvents: "none" }]}>
        {Array.from({ length: 56 }).map((_, idx) => (
          <View
            key={`star-${idx}`}
            style={[
              styles.star,
              {
                top: `${(idx * 17) % 100}%`,
                left: `${(idx * 29) % 100}%`,
                opacity: 0.18 + ((idx % 5) * 0.1),
              },
            ]}
          />
        ))}
        <View style={styles.grid} />
      </View>

      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#dbeafe" />
        </TouchableOpacity>
        <Text style={styles.title}>Member Activity</Text>
      </View>

      <FlatList
        data={filteredCases}
        keyExtractor={(item) => item.id}
        renderItem={renderCaseItem}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={[styles.content, isMobile && styles.contentMobile]}
        ListEmptyComponent={renderEmpty}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bgOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: "rgba(59,130,246,0.06)",
  },
  star: {
    position: "absolute",
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#e2e8f0",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 46,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerMobile: { paddingTop: 40, paddingBottom: 10 },
  backButton: {
    marginRight: 12,
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.8)",
    borderWidth: 1,
    borderColor: "rgba(103,232,249,0.35)",
  },
  title: { fontSize: 20, fontWeight: "800", color: "#e2e8f0" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  text: { color: "#94a3b8", fontSize: 15 },
  content: { paddingHorizontal: 20, paddingBottom: 80 },
  contentMobile: { paddingHorizontal: 12 },
  profileHeader: { alignItems: "center", marginBottom: 22 },
  avatarOuterRing: {
    position: "absolute",
    top: -8,
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 2,
    borderColor: "rgba(34,211,238,0.55)",
    borderStyle: "dashed",
  },
  avatarCore: {
    width: 98,
    height: 98,
    borderRadius: 49,
    borderWidth: 2,
    borderColor: "rgba(34,211,238,0.45)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.7)",
    marginBottom: 10,
  },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(148,163,184,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  name: { fontSize: 32, fontWeight: "900", color: "#34d6ff", marginTop: 8 },
  statusPill: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(34,197,94,0.16)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.4)",
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#4ade80" },
  role: { fontSize: 12, color: "#86efac", fontWeight: "700" },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  statsContainerMobile: { flexWrap: "wrap", gap: 8 },
  statBox: {
    flex: 1,
    minWidth: 120,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: "rgba(15,23,42,0.6)",
  },
  statValue: { fontSize: 34, fontWeight: "900", color: "#67e8f9", lineHeight: 38 },
  statLabel: { fontSize: 11, color: "#94a3b8", marginTop: 4, letterSpacing: 0.8 },
  sectionTitle: { fontSize: 27, fontWeight: "900", color: "#e2e8f0", marginBottom: 10 },
  caseCard: {
    backgroundColor: "rgba(15,23,42,0.56)",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#34d6ff",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.28)",
  },
  caseHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 7 },
  caseRef: { fontSize: 15, fontWeight: "800", color: "#e2e8f0" },
  caseStatus: { fontSize: 11, fontWeight: "800" },
  caseText: { color: "#a7b9cf", fontSize: 12, marginBottom: 2 },
  emptyPanel: {
    marginTop: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.22)",
    borderRadius: 12,
    minHeight: 220,
    backgroundColor: "rgba(11,23,45,0.45)",
    gap: 10,
  },
  emptyText: { color: "#94a3b8", textAlign: "center", marginTop: 4, fontWeight: "700" },
  tabContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 14,
    backgroundColor: "rgba(15,23,42,0.6)",
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.24)",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    borderRadius: 9,
  },
  activeTabButton: {
    backgroundColor: "rgba(34,211,238,0.2)",
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.65)",
  },
  tabText: { color: "#94a3b8", fontWeight: "700", fontSize: 13 },
  activeTabText: { color: "#67e8f9" },
});
