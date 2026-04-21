import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";

export default function HomeTab() {
  return (
    <LinearGradient colors={["#030712", "#08132b", "#0b1f46"]} style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>SpaceSolutions</Text>
        <Text style={styles.subtitle}>Open a verification link to begin.</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },
  card: {
    width: "100%",
    maxWidth: 560,
    padding: 22,
    borderRadius: 18,
    backgroundColor: "rgba(30, 41, 59, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.25)",
  },
  title: { color: "#F8FAFC", fontSize: 26, fontWeight: "900" },
  subtitle: { marginTop: 10, color: "#94A3B8", fontSize: 14, lineHeight: 20 },
});

