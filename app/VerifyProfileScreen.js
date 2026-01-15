import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import firebase from "../firebase";

export default function VerifyProfileScreen({ navigation }) {
  const [users, setUsers] = useState([]);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    const usersRef = firebase.database().ref("users");
    const listener = usersRef.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data).map((key) => ({ id: key, ...data[key] }));
      
      // Sort: Unverified first, then by createdAt (newest first)
      list.sort((a, b) => {
        const isVerifiedA = !!a.isVerified;
        const isVerifiedB = !!b.isVerified;
        
        if (isVerifiedA !== isVerifiedB) {
            return isVerifiedA ? 1 : -1; // Unverified first
        }
        return (b.createdAt || 0) - (a.createdAt || 0); // Newest first
      });
      
      setUsers(list);
    });
    return () => usersRef.off("value", listener);
  }, []);

  const toggleVerify = (user) => {
    const newStatus = !user.isVerified;
    firebase.database().ref(`users/${user.id}`).update({ isVerified: newStatus });
  };

  const filteredUsers = users.filter((u) => 
    (u.name || "").toLowerCase().includes(searchText.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(searchText.toLowerCase())
  );

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
          {item.createdAt && (
            <Text style={styles.dateText}>Joined: {new Date(item.createdAt).toLocaleDateString()}</Text>
          )}
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

      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color="#ccc" />
            <TextInput 
                style={styles.searchInput}
                placeholder="Search users..."
                placeholderTextColor="#aaa"
                value={searchText}
                onChangeText={setSearchText}
            />
        </View>
        <Text style={styles.countText}>Total: {users.length} | Showing: {filteredUsers.length}</Text>
      </View>

      <FlatList
        data={filteredUsers}
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
  searchContainer: { paddingHorizontal: 20, marginBottom: 10 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 5,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    marginLeft: 10,
    fontSize: 16,
  },
  countText: { color: "#ccc", fontSize: 12, textAlign: "right" },
  list: { paddingHorizontal: 20, paddingBottom: 20 },
  card: { backgroundColor: "rgba(255,255,255,0.1)", padding: 15, borderRadius: 10, marginBottom: 15 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 15 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#eee" },
  info: { marginLeft: 15, flex: 1 },
  name: { fontSize: 18, fontWeight: "bold", color: "#fff" },
  email: { color: "#ccc", fontSize: 14 },
  role: { color: "#aaa", fontSize: 12, textTransform: "uppercase", marginTop: 2 },
  dateText: { color: "#888", fontSize: 10, marginTop: 2 },
  button: {
    padding: 10,
    borderRadius: 5,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "bold" },
  emptyText: { color: "#ccc", textAlign: "center", marginTop: 50 },
});