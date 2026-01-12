import { Ionicons } from "@expo/vector-icons";
import { Query } from "appwrite";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { APPWRITE_CONFIG, databases } from "./appwrite";

export default function MailRecordsScreen({ navigation }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

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
          [Query.orderDesc("sentAt")]
        );
        setRecords(response.documents);
      } catch (error) {
        console.error("Error fetching mail records:", error);
        Alert.alert("Error", "Failed to fetch records: " + error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, []);

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
    <LinearGradient colors={["#4e0360", "#1a1a1a"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mail Records</Text>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.$id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No mail records found.</Text>}
        />
      )}
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
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 20 },
  card: {
    backgroundColor: "rgba(255,255,255,0.1)",
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  subject: { fontSize: 16, fontWeight: "bold", color: "#fff", flex: 1, marginRight: 10 },
  date: { color: "#ccc", fontSize: 12 },
  text: { color: "#eee", marginBottom: 3, fontSize: 14 },
  label: { color: "#aaa", fontWeight: "bold" },
  subText: { color: "#888", fontSize: 12, marginTop: 5, textAlign: "right" },
  emptyText: { color: "#ccc", textAlign: "center", marginTop: 50 },
});