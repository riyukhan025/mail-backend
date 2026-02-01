import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Alert, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import firebase from "../firebase";

export default function RevertedCasesScreen({ navigation }) {
  const [cases, setCases] = useState([]);
  const [members, setMembers] = useState([]);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedCaseForAssign, setSelectedCaseForAssign] = useState(null);
  const [assignTo, setAssignTo] = useState("");
  const [search, setSearch] = useState("");
  const [pincodeFilter, setPincodeFilter] = useState("");

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
        const list = Object.keys(data)
          .map((key) => ({ id: key, ...data[key] }))
          .filter(m => m.role !== 'admin' && m.role !== 'dev');
        setMembers(list);
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
      setAssignModalVisible(false);
      setSelectedCaseForAssign(null);
      setAssignTo("");
      setTimeout(() => {
          Alert.alert("Success", "Case assigned successfully.");
      }, 100);
    }).catch(error => {
      Alert.alert("Error", "Failed to assign case: " + error.message);
    });
  };

  const filteredCases = cases.filter(c => {
      const s = search.toLowerCase();
      const matchesSearch = (c.matrixRefNo || c.id || "").toLowerCase().includes(s) || 
                            (c.candidateName || "").toLowerCase().includes(s);
      const matchesPincode = pincodeFilter ? String(c.pincode || "").includes(pincodeFilter) : true;
      return matchesSearch && matchesPincode;
  });

  const renderItem = ({ item }) => (
    <BlurView intensity={20} tint="dark" style={styles.card}>
      <View style={styles.cardRow}>
        <View style={{flex: 1}}>
            <Text style={styles.title}>{item.matrixRefNo || item.id}</Text>
            <Text style={styles.candidate}>{item.candidateName || "N/A"}</Text>
        </View>
        <View style={{alignItems: 'flex-end'}}>
            <View style={styles.clientBadge}>
                <Text style={styles.clientText}>{(item.client || item.company || "Unknown").toUpperCase()}</Text>
            </View>
            <View style={styles.pincodeContainer}>
                <Ionicons name="navigate-outline" size={10} color="#ccc" />
                <Text style={styles.pincode}>{item.pincode || "No Pin"}</Text>
            </View>
        </View>
      </View>
      
      <View style={styles.divider} />
      
      <View style={styles.cardRow}>
          <View style={{flex: 1, flexDirection: 'row', alignItems: 'center'}}>
             <Ionicons name="location-outline" size={12} color="#666" style={{marginRight: 4}} />
             <Text style={styles.address} numberOfLines={1}>{item.address || "No Address"}</Text>
          </View>
          <TouchableOpacity
            style={styles.assignBtn}
            onPress={() => {
                setSelectedCaseForAssign(item);
                setAssignModalVisible(true);
            }}
          >
            <Text style={styles.assignBtnText}>RE-ASSIGN</Text>
            <Ionicons name="arrow-forward" size={10} color="#000" />
          </TouchableOpacity>
      </View>
    </BlurView>
  );

  return (
    <LinearGradient colors={["#0f0c29", "#302b63", "#24243e"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { textShadowColor: '#ff9800', textShadowRadius: 10 }]}>Reverted Cases</Text>
      </View>

      <View style={styles.filterContainer}>
          <View style={styles.searchBox}>
              <Ionicons name="search" size={16} color="#ccc" />
              <TextInput 
                  style={styles.input} 
                  placeholder="Search Ref/Name" 
                  placeholderTextColor="#aaa"
                  value={search}
                  onChangeText={setSearch}
              />
          </View>
          <View style={[styles.searchBox, { marginLeft: 10, flex: 0.5 }]}>
              <Ionicons name="location-outline" size={16} color="#ccc" />
              <TextInput 
                  style={styles.input} 
                  placeholder="Pincode" 
                  placeholderTextColor="#aaa"
                  value={pincodeFilter}
                  onChangeText={setPincodeFilter}
                  keyboardType="numeric"
              />
          </View>
      </View>

      <FlatList
        data={filteredCases}
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
  card: { 
    backgroundColor: "rgba(255,255,255,0.05)", 
    padding: 12, 
    borderRadius: 12, 
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    shadowColor: "#7b2cbf",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 14, fontWeight: "bold", color: "#4cc9f0", letterSpacing: 0.5 },
  candidate: { fontSize: 12, color: "#fff", marginTop: 2 },
  clientBadge: { backgroundColor: "rgba(247, 37, 133, 0.15)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginBottom: 4, borderWidth: 1, borderColor: "rgba(247, 37, 133, 0.3)" },
  clientText: { color: "#f72585", fontSize: 9, fontWeight: "bold" },
  pincodeContainer: { flexDirection: 'row', alignItems: 'center' },
  pincode: { fontSize: 10, color: "#ccc", marginLeft: 3 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.05)", marginVertical: 8 },
  address: { color: "#888", fontSize: 11, flex: 1, marginRight: 10 },
  assignBtn: { backgroundColor: "#4361ee", flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, shadowColor: "#4361ee", shadowOpacity: 0.4, shadowRadius: 5 },
  assignBtnText: { color: "#fff", fontSize: 10, fontWeight: "bold", marginRight: 4 },
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
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  input: {
    flex: 1,
    color: '#fff',
    marginLeft: 5,
    fontSize: 12
  },
});