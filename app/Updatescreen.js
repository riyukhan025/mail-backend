import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { useContext, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import firebase from "../firebase";
import { AuthContext } from "./AuthContext";

const CLOUD_NAME = "dfpykheky";
const UPLOAD_PRESET = "cases_upload";

export default function Updatescreen({ navigation }) {
  const { user, login } = useContext(AuthContext);
  const [userData, setUserData] = useState(user || {});
  const [originalData, setOriginalData] = useState(user || {});
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState(null);

  useEffect(() => {
    if (user?.uid) {
      const ref = firebase.database().ref(`users/${user.uid}`);
      const listener = ref.on("value", (snapshot) => {
        if (snapshot.exists()) {
          const data = { ...snapshot.val(), uid: user.uid };
          setUserData(data);
          setOriginalData(data);
        }
      });
      return () => ref.off("value", listener);
    }
  }, [user]);

  const hasChanges = JSON.stringify(userData) !== JSON.stringify(originalData) || image !== null;

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const handleUpdate = async () => {
    try {
      setLoading(true);
      let photoURL = userData.photoURL;

      if (image) {
        const formData = new FormData();
        formData.append("file", {
          uri: image,
          type: "image/jpeg",
          name: `profile_${user.uid}.jpg`,
        });
        formData.append("upload_preset", UPLOAD_PRESET);
        formData.append("folder", "members");

        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.secure_url) photoURL = data.secure_url;
      }

      const updates = {
        name: userData.name,
        city: userData.city,
        pincode: userData.pincode,
        bloodGroup: userData.bloodGroup,
        email: userData.email,
        photoURL: photoURL || userData.photoURL || ""
      };

      await firebase.database().ref(`users/${user.uid}`).update(updates);
      // Update local context
      login({ ...userData, ...updates });
      Alert.alert("Success", "Profile updated successfully!");
      setImage(null);
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
          <View style={styles.profileContainer}>
            <TouchableOpacity onPress={pickImage} style={styles.avatarWrapper}>
              {image || userData.photoURL ? (
                <Image source={{ uri: image || userData.photoURL }} style={styles.profileImage} />
              ) : (
                <View style={styles.placeholderImage}>
                  <Ionicons name="person" size={40} color="#ccc" />
                </View>
              )}
              <View style={styles.editIconBadge}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text style={styles.changePhotoText}>Tap to change photo</Text>
          </View>

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

          <TouchableOpacity 
            style={[styles.updateButton, !hasChanges && styles.disabledButton]} 
            onPress={handleUpdate} 
            disabled={loading || !hasChanges}
          >
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
  profileContainer: { alignItems: 'center', marginBottom: 20 },
  avatarWrapper: { position: 'relative' },
  profileImage: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: '#facc15' },
  placeholderImage: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#facc15' },
  editIconBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#007AFF', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  changePhotoText: { color: '#aaa', fontSize: 12, marginTop: 8 },
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
  disabledButton: { backgroundColor: "#555", opacity: 0.7 },
  buttonText: { color: "#000", fontWeight: "bold", fontSize: 16 },
  idCardButton: { marginTop: 10 },
  gradientBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 15, borderRadius: 10 },
  idCardText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});