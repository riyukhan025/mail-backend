import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import firebase from "../firebase";

export default function VerifyProfileScreen({ navigation }) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const usersRef = firebase.database().ref("users");
    const listener = usersRef.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data).map((key) => ({ id: key, ...data[key] }));
      setUsers(list);
    });
    return () => usersRef.off("value", listener);
  }, []);

  const toggleVerify = (user) => {
    const newStatus = !user.isVerified;
    firebase.database().ref(`users/${user.id}`).update({ isVerified: newStatus });
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.row}>
        {item.photoURL ? (
          <Image source={{ uri: item.photoURL }} style={styles.avatar} />
        ) : (
          <Ionicons name="person-circle" size={50} color="#ccc" />
        )}
        <View style={styles.info}>
          <Text style={styles.name}>{item.name || "No Name"}</Text>
          <Text style={styles.email}>{item.email}</Text>
          <Text style={styles.role}>{item.role || "Member"}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: item.isVerified ? "#28a745" : "#ffc107" }]}
        onPress={() => toggleVerify(item)}
      >
        <Text style={styles.buttonText}>{item.isVerified ? "Verified" : "Verify User"}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <LinearGradient colors={["#4e0360", "#1a1a1a"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Verify Profiles</Text>
      </View>
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>No users found.</Text>}
      />
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
  row: { flexDirection: "row", alignItems: "center", marginBottom: 15 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#eee" },
  info: { marginLeft: 15, flex: 1 },
  name: { fontSize: 18, fontWeight: "bold", color: "#fff" },
  email: { color: "#ccc", fontSize: 14 },
  role: { color: "#aaa", fontSize: 12, textTransform: "uppercase", marginTop: 2 },
  button: {
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "bold" },
  emptyText: { color: "#ccc", textAlign: "center", marginTop: 50 },
});