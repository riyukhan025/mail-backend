import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
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

  const renderItem = (item) => (
    <BlurView intensity={20} tint="dark" style={styles.card}>
      <View style={styles.row}>
        <View style={styles.avatarContainer}>
            {item.photoURL ? (
            <Image source={{ uri: item.photoURL }} style={styles.avatar} />
            ) : (
            <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{(item.name || "U").charAt(0).toUpperCase()}</Text>
            </View>
            )}
            {item.isVerified && (
                <View style={styles.verifiedBadge}>
                    <Ionicons name="checkmark" size={10} color="#fff" />
                </View>
            )}
        </View>
        <View style={styles.info}>
          <Text style={styles.name}>{item.name || "No Name"}</Text>
          <Text style={styles.email}>{item.email}</Text>
          <View style={styles.roleContainer}>
            <Text style={styles.role}>{item.role || "Member"}</Text>
            {item.uniqueId && <Text style={styles.uniqueId}> • {item.uniqueId}</Text>}
          </View>
        </View>
      </View>
      
      <View style={styles.divider} />

      <View style={styles.footerRow}>
          <Text style={styles.dateText}>Joined: {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "N/A"}</Text>
          <TouchableOpacity
            style={[styles.actionButton, { borderColor: item.isVerified ? "#00f260" : "#f09819", backgroundColor: item.isVerified ? "rgba(0, 242, 96, 0.1)" : "rgba(240, 152, 25, 0.1)" }]}
            onPress={() => toggleVerify(item)}
          >
            <Text style={[styles.actionButtonText, { color: item.isVerified ? "#00f260" : "#f09819" }]}>
                {item.isVerified ? "VERIFIED" : "VERIFY NOW"}
            </Text>
          </TouchableOpacity>
      </View>
    </BlurView>
  );

  return (
    <LinearGradient colors={["#0F2027", "#203A43", "#2C5364"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { textShadowColor: '#00c6ff', textShadowRadius: 15 }]}>Verify Profiles</Text>
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

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator>
        {filteredUsers.length === 0 ? (
          <Text style={styles.emptyText}>No users found.</Text>
        ) : (
          filteredUsers.map((item) => <View key={item.id}>{renderItem(item)}</View>)
        )}
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
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  backButton: { marginRight: 15 },
  headerTitle: { fontSize: 22, fontWeight: "bold", color: "#fff", letterSpacing: 1 },
  searchContainer: { paddingHorizontal: 20, marginBottom: 10 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 25,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    marginLeft: 10,
    fontSize: 16,
  },
  countText: { color: "#ccc", fontSize: 12, textAlign: "right" },
  list: { paddingHorizontal: 20, paddingBottom: 20 },
  card: { 
    borderRadius: 16, 
    marginBottom: 12, 
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: "rgba(0, 198, 255, 0.3)",
    padding: 16
  },
  row: { flexDirection: "row", alignItems: "center" },
  avatarContainer: { position: 'relative' },
  avatar: { width: 50, height: 50, borderRadius: 25, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  avatarPlaceholder: { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  avatarText: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  verifiedBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#00f260', width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#000' },
  info: { marginLeft: 15, flex: 1 },
  name: { fontSize: 16, fontWeight: "bold", color: "#fff", letterSpacing: 0.5 },
  email: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginBottom: 4 },
  roleContainer: { flexDirection: 'row', alignItems: 'center' },
  role: { color: "#00c6ff", fontSize: 11, fontWeight: "bold", textTransform: "uppercase" },
  uniqueId: { color: "#aaa", fontSize: 11 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.05)", marginVertical: 12 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateText: { color: "#666", fontSize: 11 },
  actionButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  actionButtonText: { fontSize: 10, fontWeight: "bold", letterSpacing: 1 },
  emptyText: { color: "#ccc", textAlign: "center", marginTop: 50 },
});
