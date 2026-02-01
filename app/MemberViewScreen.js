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
      style={styles.cardContainer}
      activeOpacity={0.9}
      onPress={() => navigation.navigate("MemberDetailScreen", { memberId: item.id })}
    >
      <LinearGradient
        colors={["rgba(255,255,255,0.08)", "rgba(255,255,255,0.02)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.avatarContainer}>
            <View style={styles.avatarGlow}>
                {item.photoURL ? (
                    <Image source={{ uri: item.photoURL }} style={styles.avatarImage} />
                ) : (
                    <View style={styles.avatarPlaceholder}>
                        <Text style={styles.avatarText}>{(item.name || "U").charAt(0).toUpperCase()}</Text>
                    </View>
                )}
            </View>
        </View>
        <View style={styles.info}>
            <Text style={styles.name}>{item.name || "Unknown"}</Text>
            <Text style={styles.email}>{item.email}</Text>
            <View style={styles.tagsRow}>
                <View style={[styles.roleBadge, { borderColor: item.role === 'admin' ? '#ffd700' : '#00e5ff' }]}>
                    <Text style={[styles.roleText, { color: item.role === 'admin' ? '#ffd700' : '#00e5ff' }]}>{(item.role || "MEMBER").toUpperCase()}</Text>
                </View>
                {item.uniqueId && (
                    <View style={styles.idBadge}>
                        <Text style={styles.idText}>ID: {item.uniqueId}</Text>
                    </View>
                )}
            </View>
        </View>
        <Ionicons name="chevron-forward-circle-outline" size={24} color="rgba(255,255,255,0.3)" />
      </LinearGradient>
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={["#0f0c29", "#302b63", "#24243e"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Squad Directory</Text>
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
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  backButton: { marginRight: 15 },
  title: { fontSize: 22, fontWeight: "bold", color: "#fff", letterSpacing: 1 },
  list: { padding: 15 },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    marginHorizontal: 15,
    marginTop: 10,
    paddingHorizontal: 15,
    borderRadius: 25,
    height: 50,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  searchInput: { flex: 1, color: "#fff", fontSize: 16 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 10, marginBottom: 5 },
  statsText: { color: '#aaa', fontSize: 12 },
  cardContainer: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  avatarContainer: {
    marginRight: 15,
  },
  avatarGlow: {
    padding: 2,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  avatarImage: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  avatarPlaceholder: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  info: { flex: 1 },
  name: { fontSize: 17, fontWeight: "bold", color: "#fff", marginBottom: 2, letterSpacing: 0.5 },
  email: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginBottom: 6 },
  tagsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roleBadge: { 
    backgroundColor: "rgba(0,0,0,0.2)", 
    paddingHorizontal: 8, 
    paddingVertical: 3, 
    borderRadius: 6,
    borderWidth: 1,
  },
  roleText: { fontSize: 10, fontWeight: "bold", letterSpacing: 1 },
  idBadge: {
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)"
  },
  idText: { color: "#ccc", fontSize: 10, fontWeight: "600" },
  emptyText: { color: "#ccc", textAlign: "center", marginTop: 50 },
});