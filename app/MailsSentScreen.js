import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import firebase from "../firebase";
import { APPWRITE_CONFIG, databases, ID } from "./appwrite";

export default function MailsSentScreen({ navigation, route }) {
  const { successMessage, manualVerification, caseId, caseData, recipient } = route?.params || {};
  const [loading, setLoading] = useState(false);

  const handleMailSent = async () => {
    if (loading) return;
    setLoading(true);
    try {
      // 1. Update Firebase Status
      await firebase.database().ref(`cases/${caseId}`).update({
        status: "completed",
        finalizedAt: Date.now(),
        finalizedBy: "admin", // Default to admin if user not passed
      });

      // 2. Log to Appwrite
      try {
        const databaseId = APPWRITE_CONFIG?.databaseId;
        const collectionId = APPWRITE_CONFIG?.sentEmailsCollectionId;

        if (databaseId && collectionId) {
          await databases.createDocument(
            databaseId,
            collectionId,
            ID.unique(),
            {
              subject: `Case Approved: ${caseData?.RefNo || caseId}`,
              recipient: recipient || "Manual Web",
              RefNo: caseData?.RefNo || caseId,
              caseId: caseId,
              sentAt: new Date().toISOString(),
              sentBy: "admin"
            }
          );
        }
      } catch (logError) {
        console.warn("Appwrite logging failed:", logError);
      }

      Alert.alert("Success", "Case marked as completed.");
      navigation.navigate("AdminPanel"); 
    } catch (error) {
      console.error("Error completing case:", error);
      Alert.alert("Error", "Failed to update case status.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={["#4e0360", "#1a1a1a"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Sent Mails</Text>
      </View>
      <View style={styles.content}>
        {manualVerification ? (
          <View style={styles.verificationContainer}>
            <Ionicons name="help-circle-outline" size={80} color="#FFC107" style={{ marginBottom: 20 }} />
            <Text style={styles.questionText}>Did you send the email?</Text>
            <Text style={styles.subText}>Please confirm if the email was sent successfully via the web client.</Text>
            
            <TouchableOpacity style={styles.yesButton} onPress={handleMailSent} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Yes, Mail Sent</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.noButton} onPress={() => navigation.goBack()} disabled={loading}>
              <Text style={styles.btnText}>No, Mail Not Sent</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {successMessage ? (
              <Ionicons name="checkmark-circle-outline" size={80} color="#4caf50" style={{ marginBottom: 20 }} />
            ) : (
              <Ionicons name="mail-open-outline" size={64} color="#ccc" style={{ marginBottom: 20 }} />
            )}
            {successMessage && <Text style={styles.successText}>{successMessage}</Text>}
            <Text style={styles.text}>Sent mails history is under development.</Text>
          </>
        )}
      </View>
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
  content: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  text: { color: "#ccc", fontSize: 16, textAlign: "center" },
  successText: { color: "#4caf50", fontSize: 18, fontWeight: "bold", textAlign: "center", marginBottom: 10 },
  verificationContainer: { alignItems: 'center', width: '100%', paddingHorizontal: 20 },
  questionText: { color: "#fff", fontSize: 22, fontWeight: "bold", marginBottom: 10, textAlign: 'center' },
  subText: { color: "#ccc", fontSize: 14, textAlign: "center", marginBottom: 30 },
  yesButton: { backgroundColor: "#28a745", paddingVertical: 15, width: '100%', borderRadius: 10, alignItems: "center", marginBottom: 15 },
  noButton: { backgroundColor: "#dc3545", paddingVertical: 15, width: '100%', borderRadius: 10, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});