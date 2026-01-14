import { Ionicons } from "@expo/vector-icons";
import { Query } from "appwrite";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { APPWRITE_CONFIG, databases } from "./appwrite";

export default function MailRecordsScreen({ navigation }) {
  const [allRecords, setAllRecords] = useState([]);
  const [filteredRecords, setFilteredRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    const fetchRecords = async () => {
      try {
        if (!APPWRITE_CONFIG?.databaseId || !APPWRITE_CONFIG?.sentEmailsCollectionId) {
          console.warn("Appwrite Config Error: Missing databaseId or sentEmailsCollectionId");
          Alert.alert("Config Error", "Missing Appwrite Database ID or Collection ID.");
          setLoading(false);
          return;
        }

        const response = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.sentEmailsCollectionId,
          [Query.orderDesc("sentAt"), Query.limit(1000)]
        );
        setAllRecords(response.documents);
        setFilteredRecords(response.documents);
      } catch (error) {
        console.error("Error fetching mail records:", error);
        Alert.alert("Error", "Failed to fetch records: " + error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      const filtered = allRecords.filter(item => 
        new Date(item.sentAt).toLocaleDateString() === selectedDate
      );
      setFilteredRecords(filtered);
    } else {
      setFilteredRecords(allRecords);
    }
  }, [selectedDate, allRecords]);

  const uniqueDates = [...new Set(allRecords.map(item => new Date(item.sentAt).toLocaleDateString()))];

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.subject}>{item.subject}</Text>
        <Text style={styles.date}>{new Date(item.sentAt).toLocaleDateString()} {new Date(item.sentAt).toLocaleTimeString()}</Text>
      </View>
      <Text style={styles.text}><Text style={styles.label}>To: </Text>{item.recipient}</Text>
      <Text style={styles.text}><Text style={styles.label}>Ref: </Text>{item.RefNo}</Text>
      <Text style={styles.subText}>Sent by: {item.sentBy}</Text>
    </View>
  );

  return (
    <LinearGradient colors={["#fdfbf7", "#e2ebf0"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mail Records</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.calendarButton}>
            <Ionicons name="calendar-outline" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      {selectedDate && (
        <View style={styles.filterContainer}>
            <Text style={styles.filterText}>Showing: {selectedDate}</Text>
            <TouchableOpacity onPress={() => setSelectedDate(null)}>
                <Text style={styles.clearFilterText}>Clear</Text>
            </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#4e0360" />
        </View>
      ) : (
        <FlatList
          data={filteredRecords}
          keyExtractor={(item) => item.$id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No mail records found.</Text>}
        />
      )}

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Select Date</Text>
                <TouchableOpacity style={styles.dateOption} onPress={() => { setSelectedDate(null); setModalVisible(false); }}>
                    <Text style={styles.dateOptionText}>All Dates</Text>
                </TouchableOpacity>
                <FlatList 
                    data={uniqueDates}
                    keyExtractor={item => item}
                    renderItem={({item}) => (
                        <TouchableOpacity style={styles.dateOption} onPress={() => { setSelectedDate(item); setModalVisible(false); }}>
                            <Text style={styles.dateOptionText}>{item}</Text>
                            {selectedDate === item && <Ionicons name="checkmark" size={20} color="#4caf50" />}
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
    backgroundColor: "rgba(255,255,255,0.5)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  backButton: { marginRight: 15 },
  headerTitle: { fontSize: 20, fontWeight: "bold", color: "#333", flex: 1 },
  calendarButton: { padding: 5 },
  filterContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.3)' },
  filterText: { color: '#333', fontWeight: '600' },
  clearFilterText: { color: '#ff4444', fontWeight: 'bold' },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 20 },
  card: {
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  subject: { fontSize: 16, fontWeight: "bold", color: "#333", flex: 1, marginRight: 10 },
  date: { color: "#666", fontSize: 12 },
  text: { color: "#444", marginBottom: 3, fontSize: 14 },
  label: { color: "#222", fontWeight: "bold" },
  subText: { color: "#888", fontSize: 12, marginTop: 5, textAlign: "right" },
  emptyText: { color: "#666", textAlign: "center", marginTop: 50 },
  
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalContent: { backgroundColor: "#fff", width: "80%", maxHeight: "70%", borderRadius: 15, padding: 20, elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#333", marginBottom: 15, textAlign: "center" },
  dateOption: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
  dateOptionText: { fontSize: 16, color: "#333" },
  closeButton: { marginTop: 15, backgroundColor: "#333", padding: 12, borderRadius: 8, alignItems: "center" },
  closeButtonText: { color: "#fff", fontWeight: "bold" },
});