import { Ionicons } from "@expo/vector-icons";
import { ID, Query } from "appwrite";
import { LinearGradient } from "expo-linear-gradient";
import { useContext, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import firebase from "../firebase";
import { APPWRITE_CONFIG, databases } from "./appwrite";
import { AuthContext } from "./AuthContext";

export default function DSRScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const [stats, setStats] = useState({
    assignedToday: 0,
    totalCases: 0,
    completedToday: 0,
    completedTotal: 0,
    remaining: 0,
    completedCasesList: [],
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  useEffect(() => {
    if (!user) return;

    const casesRef = firebase.database().ref("cases");
    const query = casesRef.orderByChild("assignedTo").equalTo(user.uid);

    const listener = query.on("value", (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setStats({
          assignedToday: 0,
          totalCases: 0,
          completedToday: 0,
          completedTotal: 0,
          remaining: 0,
          completedCasesList: [],
        });
        setLoading(false);
        return;
      }

      const allCases = Object.keys(data).map((key) => ({ id: key, ...data[key] }));
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 1. Cases assigned today
      const assignedToday = allCases.filter((c) => {
        if (!c.assignedAt) return false;
        const d = new Date(c.assignedAt);
        return d >= today;
      }).length;

      // 2. Total cases
      const totalCases = allCases.length;

      // 3. Total cases completed today
      const completedTodayCases = allCases.filter((c) => {
        const isCompletedStatus = c.status === "audit" || c.status === "completed";
        if (!isCompletedStatus) return false;
        if (!c.completedAt) return false;
        const d = new Date(c.completedAt);
        return d >= today;
      });
      const completedToday = completedTodayCases.length;

      // 4. Total cases completed till date
      const completedTotal = allCases.filter(
        (c) => c.status === "audit" || c.status === "completed"
      ).length;

      // 5. Total remaining
      const remaining = allCases.filter(
        (c) => c.status === "assigned" || c.status === "open" || c.status === "reverted"
      ).length;

      setStats({
        assignedToday,
        totalCases,
        completedToday,
        completedTotal,
        remaining,
        completedCasesList: completedTodayCases.map((c) => ({
          id: c.id,
          RefNo: c.matrixRefNo || ""
        })),
      });
      setLoading(false);
    });

    // Check if DSR is already submitted for today
    const checkSubmission = async () => {
      const today = new Date().toISOString().split("T")[0];
      try {
        const res = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.dsrCollectionId,
          [
            Query.equal("userId", user.uid),
            Query.equal("date", today)
          ]
        );
        if (res.documents.length > 0) {
          setAlreadySubmitted(true);
        }
      } catch (e) {
        console.error("Error checking DSR submission:", e);
      }
    };
    checkSubmission();

    return () => query.off("value", listener);
  }, [user]);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      const now = new Date();
      const dsrData = {
        userId: user.uid,
        date: now.toISOString().split("T")[0],
        completedCount: stats.completedToday,
        assignedToday: stats.assignedToday,
        totalCases: stats.totalCases,
        completedTotal: stats.completedTotal,
        remainingOpenCount: stats.remaining,
        attachmentFileId: null,
        completedCases: stats.completedCasesList.map((c) => c.RefNo).join(", "),
        submittedAt: now.toISOString(),
      };

      await databases.createDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.dsrCollectionId,
        ID.unique(),
        dsrData
      );

      Alert.alert("Success", "DSR submitted successfully!");
      navigation.goBack();
    } catch (error) {
      console.error("DSR Submit Error:", error);
      Alert.alert("Error", "Failed to submit DSR.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LinearGradient colors={["#4e0360", "#1a1a1a"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Daily Status Report (DSR)</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.dateText}>{new Date().toDateString()}</Text>

          <View style={styles.row}>
            <Text style={styles.label}>Cases Assigned Today:</Text>
            <Text style={styles.value}>{stats.assignedToday}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Total Cases:</Text>
            <Text style={styles.value}>{stats.totalCases}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Total Cases Completed Today:</Text>
            <Text style={styles.value}>{stats.completedToday}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Total Cases Completed Till Date:</Text>
            <Text style={styles.value}>{stats.completedTotal}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Total Remaining:</Text>
            <Text style={styles.value}>{stats.remaining}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, submitting && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={submitting || loading || alreadySubmitted}
        >
          <Text style={styles.submitText}>
            {alreadySubmitted
              ? "DSR Already Submitted Today"
              : submitting
              ? "Submitting..."
              : "Submit DSR"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
  title: { fontSize: 20, fontWeight: "bold", color: "#fff" },
  content: { padding: 20 },
  card: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 15,
    padding: 20,
    marginBottom: 30,
  },
  dateText: {
    color: "#ffd700",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
    paddingBottom: 10,
  },
  label: {
    color: "#ccc",
    fontSize: 16,
    flex: 1,
  },
  value: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  submitButton: {
    backgroundColor: "#007AFF",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
  },
  submitText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
});