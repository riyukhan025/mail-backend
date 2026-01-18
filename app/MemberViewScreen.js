import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import firebase from "../firebase";

export default function MemberViewScreen({ navigation }) {
  const [members, setMembers] = useState([]);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    const membersRef = firebase.database().ref("users");
    const listener = membersRef.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data)
        .map((key) => ({ id: key, ...data[key] }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setMembers(list);
    });
    return () => membersRef.off("value", listener);
  }, []);

  const filteredMembers = members.filter(m => 
    (m.name || "").toLowerCase().includes(searchText.toLowerCase()) ||
    (m.email || "").toLowerCase().includes(searchText.toLowerCase())
  );

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate("MemberDetailScreen", { memberId: item.id })}
    >
      <View style={styles.avatarContainer}>
        {item.photoURL ? (
            <Image source={{ uri: item.photoURL }} style={styles.avatarImage} />
        ) : (
            <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{(item.name || "U").charAt(0).toUpperCase()}</Text>
            </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{item.name || "Unknown"}</Text>
        <Text style={styles.email}>{item.email}</Text>
        <View style={styles.roleBadge}>
            <Text style={styles.roleText}>{item.role || "Member"}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#ccc" />
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={["#4e0360", "#1a1a1a"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Members Directory</Text>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#ccc" style={{marginRight: 10}}/>
        <TextInput 
            style={styles.searchInput}
            placeholder="Search members..."
            placeholderTextColor="#aaa"
            value={searchText}
            onChangeText={setSearchText}
        />
      </View>
      
      <View style={styles.statsRow}>
        <Text style={styles.statsText}>Total: {members.length}</Text>
        <Text style={styles.statsText}>Showing: {filteredMembers.length}</Text>
      </View>

      <FlatList
        style={{ flex: 1, width: "100%" }}
        data={filteredMembers}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingBottom: 100 }]}
        initialNumToRender={25}
        removeClippedSubviews={false}
        ListEmptyComponent={<Text style={styles.emptyText}>No members found.</Text>}
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
  title: { fontSize: 20, fontWeight: "bold", color: "#fff" },
  list: { padding: 15 },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    marginHorizontal: 15,
    marginTop: 10,
    paddingHorizontal: 15,
    borderRadius: 10,
    height: 50,
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 10, marginBottom: 5 },
  statsText: { color: '#aaa', fontSize: 12 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  avatarContainer: {
    marginRight: 15,
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "#fff",
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#6a1b9a",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  avatarText: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: "bold", color: "#fff", marginBottom: 2 },
  email: { color: "#ccc", fontSize: 12, marginBottom: 4 },
  roleBadge: { backgroundColor: "rgba(255,255,255,0.1)", alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  roleText: { color: "#ffd700", fontSize: 10, fontWeight: "bold", textTransform: "uppercase" },
  emptyText: { color: "#ccc", textAlign: "center", marginTop: 50 },
});