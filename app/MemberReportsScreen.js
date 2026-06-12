import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import firebase from "../firebase";

function norm(v) {
  return String(v || "").trim().toLowerCase();
}

function userLabel(u) {
  return String(u?.name || u?.fullName || u?.displayName || u?.email || u?.id || "Member");
}

function uiAlert(title, message) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

async function uiConfirm(title, message) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.confirm(`${title}\n\n${message}`);
  }
  return await new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Continue", style: "default", onPress: () => resolve(true) },
    ]);
  });
}

export default function MemberReportsScreen({ navigation }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const ref = firebase.database().ref("users");
    const listener = ref.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data).map((key) => ({ id: key, ...data[key] }));
      list.sort((a, b) =>
        userLabel(a).localeCompare(userLabel(b), undefined, { sensitivity: "base", ignorePunctuation: true })
      );
      setUsers(list);
      setLoading(false);
    });
    return () => ref.off("value", listener);
  }, []);

  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q) return users;
    return users.filter((u) => {
      const hay = `${userLabel(u)} ${u?.email || ""} ${u?.phone || ""} ${u?.role || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, users]);

  const sendAll = async () => {
    const ok = await uiConfirm(
      "Send to all?",
      "This will generate an individual report for each member and open one separate email draft per member. Continue?"
    );
    if (!ok) return;
    if (!navigation?.navigate) {
      uiAlert("Navigation error", "navigation.navigate is not available here.");
      console.log("[MemberReports] navigation missing:", navigation);
      return;
    }
    navigation.navigate("MemberReportSendScreen", { bulk: true });
  };

  const renderItem = ({ item }) => {
    const email = String(item?.email || "").trim();
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.9}
        onPress={() => navigation?.navigate?.("MemberReportDetailScreen", { userId: item.id })}
      >
        <View style={styles.rowLeft}>
          <View style={styles.avatar}>
            <Ionicons name="person-outline" size={16} color="#93c5fd" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{userLabel(item)}</Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {email ? email : "No email saved"} {item?.role ? `• ${item.role}` : ""}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient colors={["#05080f", "#090d16", "#05080f"]} style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Member Reports</Text>
        <TouchableOpacity style={styles.sendAllBtn} onPress={sendAll} activeOpacity={0.9}>
          <Ionicons name="send-outline" size={16} color="#e2e8f0" />
          <Text style={styles.sendAllText}>Send all</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color="#94a3b8" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search member name / email / role"
          placeholderTextColor="#64748b"
          style={styles.search}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#93c5fd" />
          <Text style={styles.centerText}>Loading members…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.centerText}>No members found.</Text>
            </View>
          }
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 14, paddingTop: 12 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  title: { color: "#e2e8f0", fontSize: 18, fontWeight: "800" },
  sendAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f2a44",
    backgroundColor: "rgba(37,99,235,0.15)",
  },
  sendAllText: { color: "#e2e8f0", fontWeight: "800", fontSize: 12 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1f2a44",
    backgroundColor: "rgba(2,6,23,0.6)",
    marginBottom: 10,
  },
  search: { flex: 1, color: "#e2e8f0" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#182236",
    backgroundColor: "rgba(15,23,42,0.55)",
    marginBottom: 10,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(59,130,246,0.12)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.25)",
  },
  rowTitle: { color: "#e2e8f0", fontWeight: "900", fontSize: 14 },
  rowSub: { color: "#94a3b8", marginTop: 2, fontSize: 12 },
  center: { padding: 22, alignItems: "center" },
  centerText: { marginTop: 10, color: "#94a3b8" },
});
