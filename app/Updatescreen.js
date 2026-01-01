import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useContext, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import firebase from "../firebase";
import { AuthContext } from "./AuthContext";

export default function Updatescreen({ navigation }) {
  const { user, login } = useContext(AuthContext);
  const [userData, setUserData] = useState(user || {});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.uid) {
      const ref = firebase.database().ref(`users/${user.uid}`);
      const listener = ref.on("value", (snapshot) => {
        if (snapshot.exists()) {
          setUserData({ ...snapshot.val(), uid: user.uid });
        }
      });
      return () => ref.off("value", listener);
    }
  }, [user]);

  const handleUpdate = async () => {
    try {
      setLoading(true);
      await firebase.database().ref(`users/${user.uid}`).update({
        name: userData.name,
        city: userData.city,
        pincode: userData.pincode,
        bloodGroup: userData.bloodGroup,
        email: userData.email,
      });
      // Update local context
      login(userData);
      Alert.alert("Success", "Profile updated successfully!");
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const renderInput = (label, field, icon) => (
    <View style={styles.inputContainer}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrapper}>
        <Ionicons name={icon} size={20} color="#ccc" style={styles.icon} />
        <TextInput
          style={styles.input}
          value={userData[field]}
          onChangeText={(text) => setUserData({ ...userData, [field]: text })}
          placeholder={label}
          placeholderTextColor="#666"
        />
      </View>
    </View>
  );

  return (
    <LinearGradient colors={["#4e0360", "#1a1a1a"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Update Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Personal Details</Text>
          
          {renderInput("Full Name", "name", "person-outline")}
          {renderInput("Email", "email", "mail-outline")}
          {renderInput("City", "city", "location-outline")}
          {renderInput("Pincode", "pincode", "map-outline")}
          {renderInput("Blood Group", "bloodGroup", "water-outline")}

          <View style={styles.infoRow}>
             <Text style={styles.infoLabel}>Unique ID:</Text>
             <Text style={styles.infoValue}>{userData.uniqueId || "N/A"}</Text>
          </View>

          <TouchableOpacity style={styles.updateButton} onPress={handleUpdate} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Update Profile</Text>}
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.idCardButton} 
            onPress={() => navigation.navigate("DigitalIDCard", { user: userData })}
          >
            <LinearGradient colors={["#00c6ff", "#0072ff"]} style={styles.gradientBtn} start={{x:0, y:0}} end={{x:1, y:0}}>
                <Ionicons name="card-outline" size={20} color="#fff" style={{marginRight: 8}} />
                <Text style={styles.idCardText}>Show Digital ID Card</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingTop: 50, paddingHorizontal: 20, paddingBottom: 20, backgroundColor: "rgba(0,0,0,0.3)" },
  backButton: { marginRight: 15 },
  title: { fontSize: 20, fontWeight: "bold", color: "#fff" },
  content: { padding: 20 },
  card: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 20, padding: 20 },
  sectionTitle: { color: "#ffd700", fontSize: 18, fontWeight: "bold", marginBottom: 20, textAlign: "center" },
  inputContainer: { marginBottom: 15 },
  label: { color: "#ccc", fontSize: 14, marginBottom: 5, marginLeft: 5 },
  inputWrapper: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 10, paddingHorizontal: 15, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  icon: { marginRight: 10 },
  input: { flex: 1, color: "#fff", paddingVertical: 12, fontSize: 16 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", padding: 15, backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 10, marginBottom: 20 },
  infoLabel: { color: "#aaa", fontSize: 16 },
  infoValue: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  updateButton: { backgroundColor: "#facc15", padding: 15, borderRadius: 10, alignItems: "center", marginBottom: 15 },
  buttonText: { color: "#000", fontWeight: "bold", fontSize: 16 },
  idCardButton: { marginTop: 10 },
  gradientBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 15, borderRadius: 10 },
  idCardText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});