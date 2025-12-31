import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function MailsSentScreen({ navigation, route }) {
  const successMessage = route?.params?.successMessage;

  return (
    <LinearGradient colors={["#4e0360", "#1a1a1a"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Sent Mails</Text>
      </View>
      <View style={styles.content}>
        {successMessage ? (
          <Ionicons name="checkmark-circle-outline" size={80} color="#4caf50" style={{ marginBottom: 20 }} />
        ) : (
          <Ionicons name="mail-open-outline" size={64} color="#ccc" style={{ marginBottom: 20 }} />
        )}
        {successMessage && <Text style={styles.successText}>{successMessage}</Text>}
        <Text style={styles.text}>Sent mails history is under development.</Text>
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
});