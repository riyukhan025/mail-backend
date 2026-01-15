import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Alert, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import firebase from "../firebase";

export default function RevertedCasesScreen({ navigation }) {
  const [cases, setCases] = useState([]);
  const [members, setMembers] = useState([]);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedCaseForAssign, setSelectedCaseForAssign] = useState(null);
  const [assignTo, setAssignTo] = useState("");

  useEffect(() => {
    const casesRef = firebase.database().ref("cases");
    const casesListener = casesRef.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data)
        .map((key) => ({ id: key, ...data[key] }))
        .filter((c) => c.status === "reverted");
      setCases(list);
    });

    const membersRef = firebase.database().ref("users");
    const membersListener = membersRef.on("value", (snapshot) => {
        const data = snapshot.val() || {};
    });

    return () => {
        casesRef.off("value", casesListener);
        membersRef.off("value", membersListener);
    };
  }, []);

  const handleAssignCase = () => {
    if (!selectedCaseForAssign || !assignTo) {
      Alert.alert("Error", "Please select a case and a member.");
      return;
    }

    const member = members.find((m) => m.id === assignTo);
    if (!member) {
      Alert.alert("Error", "Member not found.");
      return;
    }

    firebase.database().ref(`cases/${selectedCaseForAssign.id}`).update({
      assigneeName: member.name,
      assignedTo: member.id,
      assigneeRole: member.role || "FE",
      status: "assigned",
      assignedAt: new Date().toISOString(),
    }).then(() => {
      Alert.alert("Success", "Case assigned successfully.");
      setAssignModalVisible(false);
      setSelectedCaseForAssign(null);
      setAssignTo("");
    }).catch(error => {
      Alert.alert("Error", "Failed to assign case: " + error.message);
    });
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.title}>{item.matrixRefNo || item.id}</Text>
      <Text style={styles.text}>Candidate: {item.candidateName || "N/A"}</Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
            setSelectedCaseForAssign(item);
            setAssignModalVisible(true);
        }}
      >
        <Text style={styles.buttonText}>Assign</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <LinearGradient colors={["#4e0360", "#1a1a1a"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reverted Cases</Text>
      </View>
      <FlatList
        data={cases}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>No reverted cases found.</Text>}
      />
      <Modal
        visible={assignModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setAssignModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Assign Case</Text>
                <Text style={styles.modalCaseRef}>{selectedCaseForAssign?.matrixRefNo}</Text>
                <Picker
                    selectedValue={assignTo}
                    onValueChange={(itemValue) => setAssignTo(itemValue)}
                    style={styles.picker}
                >
                    <Picker.Item label="Select Member..." value="" />
                    {members.map((m) => (
                        <Picker.Item key={m.id} label={`${m.name} (${m.uniqueId || 'N/A'})`} value={m.id} />
                    ))}
                </Picker>
                <View style={styles.modalButtons}>
                    <TouchableOpacity style={styles.cancelButton} onPress={() => setAssignModalVisible(false)}>
                        <Text>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.confirmButton} onPress={handleAssignCase}>
                        <Text style={styles.confirmButtonText}>Confirm</Text>
                    </TouchableOpacity>
                </View>
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
  list: { padding: 20 },
  card: { backgroundColor: "rgba(255,255,255,0.1)", padding: 15, borderRadius: 10, marginBottom: 15 },
  title: { fontSize: 18, fontWeight: "bold", color: "#fff", marginBottom: 5 },
  text: { color: "#ccc", marginBottom: 5 },
  button: { marginTop: 10, backgroundColor: "#ff9800", padding: 10, borderRadius: 5, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "bold" },
  emptyText: { color: "#ccc", textAlign: "center", marginTop: 50 },
  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  modalContent: { backgroundColor: "#fff", borderRadius: 10, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: "#333", marginBottom: 10, textAlign: 'center' },
  modalCaseRef: { fontSize: 16, color: "#666", marginBottom: 15, textAlign: 'center' },
  picker: { width: '100%', height: 50, marginBottom: 20, backgroundColor: '#f0f0f0', borderRadius: 5 },
  modalButtons: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
  cancelButton: { padding: 10, marginRight: 10 },
  confirmButton: { backgroundColor: "#28a745", paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8 },
  confirmButtonText: { color: "#fff", fontWeight: "bold" },
});