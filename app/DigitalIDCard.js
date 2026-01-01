import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function DigitalIDCard({ navigation, route }) {
  const { user } = route.params || {};

  return (
    <LinearGradient colors={["#4e0360", "#1a1a1a"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Digital ID Card</Text>
      </View>
      
      <View style={styles.cardContainer}>
        <LinearGradient
            colors={["#ffffff", "#f0f0f0"]}
            style={styles.idCard}
        >
            <View style={styles.cardHeader}>
                <Image source={require("../assets/logo.png")} style={styles.logo} resizeMode="contain" />
                <Text style={styles.companyName}>SPACE SOLUTIONS</Text>
            </View>
            
            <View style={styles.photoContainer}>
                 {user?.photoURL ? (
                    <Image source={{ uri: user.photoURL }} style={styles.photo} />
                 ) : (
                    <Ionicons name="person-circle-outline" size={100} color="#ccc" />
                 )}
            </View>

            <Text style={styles.name}>{user?.name || "Employee Name"}</Text>
            <Text style={styles.role}>{user?.role || "Field Executive"}</Text>

            <View style={styles.detailsContainer}>
                <Text style={styles.detailLabel}>ID No:</Text>
                <Text style={styles.detailValue}>{user?.uid ? user.uid.slice(0, 8).toUpperCase() : "SS-0000"}</Text>
            </View>
             <View style={styles.detailsContainer}>
                <Text style={styles.detailLabel}>Email:</Text>
                <Text style={styles.detailValue}>{user?.email || "email@example.com"}</Text>
            </View>
            <View style={styles.detailsContainer}>
                <Text style={styles.detailLabel}>Blood Group:</Text>
                <Text style={styles.detailValue}>{user?.bloodGroup || "N/A"}</Text>
            </View>
            <View style={styles.detailsContainer}>
                <Text style={styles.detailLabel}>Location:</Text>
                <Text style={styles.detailValue}>{user?.city || "City"} - {user?.pincode || ""}</Text>
            </View>

            <View style={styles.footer}>
                <Text style={styles.footerText}>Authorized Personnel</Text>
            </View>
        </LinearGradient>
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
  },
  backButton: { marginRight: 15 },
  title: { fontSize: 20, fontWeight: "bold", color: "#fff" },
  cardContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  idCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 15,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    width: "100%",
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 10,
  },
  logo: { width: 40, height: 40, marginRight: 10 },
  companyName: { fontSize: 18, fontWeight: "bold", color: "#333" },
  photoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#f9f9f9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
    borderWidth: 3,
    borderColor: "#4e0360",
    overflow: "hidden",
  },
  photo: { width: "100%", height: "100%" },
  name: { fontSize: 22, fontWeight: "bold", color: "#333", marginBottom: 5, textAlign: 'center' },
  role: { fontSize: 16, color: "#666", marginBottom: 20, textTransform: "uppercase", letterSpacing: 1 },
  detailsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 8,
    paddingHorizontal: 10,
  },
  detailLabel: { fontSize: 14, color: "#888", fontWeight: "600" },
  detailValue: { fontSize: 14, color: "#333", fontWeight: "bold" },
  footer: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    width: "100%",
    paddingTop: 10,
    alignItems: "center",
  },
  footerText: { fontSize: 12, color: "#4e0360", fontWeight: "bold", letterSpacing: 1 },
});