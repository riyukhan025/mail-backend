import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useContext, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import firebase from "../firebase";
import { APPWRITE_CONFIG, databases } from "./appwrite";
import { AuthContext } from "./AuthContext";

export default function PlanYourDayScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const [plannedCases, setPlannedCases] = useState([]);
  const [openCases, setOpenCases] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const documentId = user?.uid; // use Firebase UID as documentId

  // Load open cases from Firebase
  useEffect(() => {
    if (!user) return;
    const casesRef = firebase.database().ref("cases");
    const query = casesRef.orderByChild("assignedTo").equalTo(user.uid);

    const listener = query.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data)
        .map((key) => ({ id: key, ...data[key] }))
        .filter((c) => c.status === "assigned" || c.status === "audit");
      setOpenCases(list);
    });
    return () => query.off("value", listener);
  }, [user]);

  // Load user's plannedCases from Appwrite
  useEffect(() => {
    if (!user) return;
    const loadPlan = async () => {
      try {
        const doc = await databases.getDocument(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.userPlansCollectionId, documentId);
        setPlannedCases(JSON.parse(doc.plannedCases || "[]"));
      } catch (error) {
        console.log("No existing plan found for user, starting fresh.", error);
      }
    };
    loadPlan();
  }, [user]);

  // Sync plannedCases with openCases to reflect status changes
  useEffect(() => {
    setPlannedCases(prev => prev.map(p => openCases.find(o => o.id === p.id) || p));
  }, [openCases]);

  const savePlan = async (newPlan) => {
    if (!user) return;
    try {
      // Try updating the document first
      await databases.updateDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.userPlansCollectionId,
        documentId,
        {
          plannedCases: JSON.stringify(newPlan),
          updatedAt: new Date().toISOString(),
        }
      );
    } catch (error) {
      // If the document doesn't exist, create it
      await databases.createDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.userPlansCollectionId,
        documentId,
        {
          plannedCases: JSON.stringify(newPlan),
          updatedAt: new Date().toISOString(),
        }
      );
    }
  };

  const handleEndDay = () => {
    const incomplete = plannedCases.filter(c => c.status !== 'audit' && c.status !== 'completed');
    if (incomplete.length > 0) {
      Alert.alert("Incomplete Cases", "These cases are incomplete. Kindly do complete it by tomorrow.");
    } else {
      if (plannedCases.length > 0) {
        Alert.alert("Good Job", "All planned cases are completed!");
      }
    }
  };

  const addToPlan = (caseItem) => {
    const newPlan = plannedCases.find((c) => c.id === caseItem.id) ? plannedCases : [...plannedCases, caseItem];
    setPlannedCases(newPlan);
    savePlan(newPlan);
    setModalVisible(false);
  };

  const removeFromPlan = (id) => {
    const newPlan = plannedCases.filter((c) => c.id !== id);
    setPlannedCases(newPlan);
    savePlan(newPlan);
  };

  return (
    <LinearGradient colors={["#FF9933", "#FFFFFF", "#138808"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Plan Your Day</Text>
        <TouchableOpacity onPress={handleEndDay} style={styles.endDayButton}>
          <Ionicons name="moon-outline" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={plannedCases}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => {
          const isComplete = item.status === 'audit' || item.status === 'completed';
          const statusColor = isComplete ? '#4cd137' : '#ff4757';
          return (
          <View style={[styles.taskItem, { borderLeftWidth: 5, borderLeftColor: statusColor }]}>
            <View style={styles.priorityBadge}>
              <Text style={styles.priorityText}>{index + 1}</Text>
            </View>
            <TouchableOpacity 
              style={styles.taskTextContainer}
              onPress={() => navigation.navigate("CaseDetail", { caseId: item.id })}
            >
              <Text style={styles.taskTitle}>{item.matrixRefNo || item.id}</Text>
              <Text style={styles.taskSub}>{item.candidateName}</Text>
              <Text style={styles.taskAddress} numberOfLines={1}>{item.address}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => removeFromPlan(item.id)}>
              <Ionicons name="trash-outline" size={24} color="#ff4757" />
            </TouchableOpacity>
          </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No cases planned. Tap "Open Cases" to add.</Text>
        }
      />

      <TouchableOpacity style={styles.bottomButton} onPress={() => setModalVisible(true)}>
        <Text style={styles.bottomButtonText}>Open Cases</Text>
        <Ionicons name="chevron-up" size={20} color="#fff" />
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Case</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={openCases}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalItem} onPress={() => addToPlan(item)}>
                  <View style={{flex: 1}}>
                    <Text style={styles.modalItemTitle}>{item.matrixRefNo || item.id}</Text>
                    <Text style={styles.modalItemSub}>{item.candidateName}</Text>
                    <Text style={styles.modalItemAddress} numberOfLines={1}>{item.address}</Text>
                  </View>
                  <Ionicons name="add-circle" size={28} color="#007AFF" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.emptyModalText}>No open cases found.</Text>}
            />
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
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  backButton: { marginRight: 15 },
  title: { fontSize: 20, fontWeight: "bold", color: "#333" },
  endDayButton: { marginLeft: 'auto' },
  listContent: { padding: 20, paddingBottom: 100 },
  taskItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    overflow: "hidden",
  },
  priorityBadge: {
    backgroundColor: "#fff",
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  priorityText: { color: "#000", fontWeight: "bold", fontSize: 16 },
  taskTextContainer: { flex: 1 },
  taskTitle: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  taskSub: { color: "#ccc", fontSize: 14 },
  taskAddress: { color: "#aaa", fontSize: 12, marginTop: 2 },
  emptyText: { color: "#333", textAlign: "center", marginTop: 40, fontSize: 16, fontWeight: "bold" },
  bottomButton: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#000080",
    padding: 20,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  bottomButtonText: { color: "#fff", fontSize: 18, fontWeight: "bold", marginRight: 10 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: "#fff", height: "50%", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15, borderBottomWidth: 1, borderBottomColor: "#eee", paddingBottom: 10 },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#333" },
  modalItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  modalItemTitle: { fontSize: 16, fontWeight: "bold", color: "#333" },
  modalItemSub: { fontSize: 14, color: "#666" },
  modalItemAddress: { fontSize: 12, color: "#888" },
  emptyModalText: { textAlign: "center", marginTop: 20, color: "#666" },
});