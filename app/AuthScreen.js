// app/AuthScreen.js

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import { useContext, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import firebase from "../firebase";
import { AuthContext } from "./AuthContext";
import { logErrorToFirebase } from "./errorUtils";

const AnimatedBG = Animated.createAnimatedComponent(ImageBackground);

export default function AuthScreen({ navigation }) {
  const { login } = useContext(AuthContext);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const [otpInput, setOtpInput] = useState("");
  const [otpPhase, setOtpPhase] = useState(false);
  const [currentUid, setCurrentUid] = useState(null);

  const [retrieveModalVisible, setRetrieveModalVisible] = useState(false);
  const [retrieveEmail, setRetrieveEmail] = useState("");
  const [retrievePassword, setRetrievePassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");

  const [resendTimer, setResendTimer] = useState(30);
  const timerRef = useRef(null);

  const bgScale = useRef(new Animated.Value(1)).current;

  /* ---------- BACKGROUND ANIMATION ---------- */
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bgScale, {
          toValue: 1.05,
          duration: 8000,
          useNativeDriver: true,
        }),
        Animated.timing(bgScale, {
          toValue: 1,
          duration: 8000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  /* ---------- OTP COUNTDOWN ---------- */
  useEffect(() => {
    if (!otpPhase) return;

    setResendTimer(30);
    timerRef.current = setInterval(() => {
      setResendTimer((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [otpPhase]);

  const showMessage = (txt) => {
    Platform.OS === "web" ? setMessage(txt) : Alert.alert(txt);
    setTimeout(() => setMessage(""), 3000);
  };

  /* ---------- GENERATE OTP ---------- */
  const generateOtp = async (uid) => {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await firebase.database().ref(`users/${uid}/loginOtp`).set({
      otp,
      createdAt: Date.now(),
    });
    showMessage(`OTP: ${otp}`);
  };

  /* ---------- LOGIN ---------- */
  const handleLogin = async () => {
    if (!identifier || !password)
      return showMessage("Enter Unique ID / Email and password");

    try {
      setLoading(true);

      const field = /^\d{4}$/.test(identifier) ? "uniqueId" : "email";

      const snap = await firebase
        .database()
        .ref("users")
        .orderByChild(field)
        .equalTo(identifier)
        .once("value");

      if (!snap.exists()) return showMessage("User not found");

      const uid = Object.keys(snap.val())[0];
      const user = snap.val()[uid];

      if (user.password !== password)
        return showMessage("Invalid password");

      setCurrentUid(uid);
      await generateOtp(uid);
      setOtpPhase(true);
    } catch (e) {
      logErrorToFirebase(e, "Login");
      showMessage("Login failed");
    } finally {
      setLoading(false);
    }
  };

  /* ---------- VERIFY OTP ---------- */
  const handleVerifyOtp = async () => {
    if (!otpInput) return showMessage("Enter OTP");

    try {
      setLoading(true);

      const snap = await firebase
        .database()
        .ref(`users/${currentUid}/loginOtp`)
        .once("value");

      if (snap.val()?.otp !== otpInput)
        return showMessage("Invalid OTP");

      const userSnap = await firebase
        .database()
        .ref(`users/${currentUid}`)
        .once("value");

      const { password, loginOtp, ...clean } = userSnap.val();
      const userWithUid = { ...clean, uid: currentUid, id: currentUid };
      await AsyncStorage.setItem("dbUser", JSON.stringify(userWithUid));

      login(userWithUid);
    } catch (e) {
      logErrorToFirebase(e, "Verify OTP");
      showMessage("OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  /* ---------- RESEND OTP ---------- */
  const handleResendOtp = async () => {
    if (resendTimer > 0 || !currentUid) return;

    try {
      setResendTimer(30);
      await generateOtp(currentUid);
    } catch (e) {
      logErrorToFirebase(e, "Resend OTP");
      showMessage("Failed to resend OTP");
    }
  };

  /* ---------- RETRIEVE UNIQUE ID ---------- */
  const handleRetrieveUniqueId = async () => {
    setRetrieveEmail("");
    setRetrievePassword("");
    setRetrieveModalVisible(true);
  };

  const executeRetrieve = async () => {
    if (!retrieveEmail || !retrievePassword) {
      return Platform.OS === "web" ? alert("Enter Email & Password") : Alert.alert("Error", "Enter Email & Password");
    }

    try {
      setLoading(true);
      const snap = await firebase
        .database()
        .ref("users")
        .orderByChild("email")
        .equalTo(retrieveEmail)
        .once("value");

      if (!snap.exists()) {
        setLoading(false);
        return Platform.OS === "web" ? alert("Email not found") : Alert.alert("Error", "Email not found");
      }

      const uid = Object.keys(snap.val())[0];
      const user = snap.val()[uid];

      if (user.password !== retrievePassword) {
        setLoading(false);
        return Platform.OS === "web" ? alert("Invalid password") : Alert.alert("Error", "Invalid password");
      }

      const uniqueId = user.uniqueId || "N/A";
      if (Platform.OS === "web") {
        alert(`Your Unique ID is: ${uniqueId}`);
        setRetrieveModalVisible(false);
      } else {
        Alert.alert("Unique ID Retrieved", `Your Unique ID is: ${uniqueId}`, [
          { text: "OK", onPress: () => setRetrieveModalVisible(false) }
        ]);
      }
    } catch (e) {
      logErrorToFirebase(e, "RetrieveID");
      Platform.OS === "web" ? alert("Failed") : Alert.alert("Error", "Failed to retrieve ID");
    } finally {
      setLoading(false);
    }
  };

  /* ---------- BUTTON ---------- */
  const buttonText = otpPhase
    ? loading
      ? "Verifying..."
      : "Verify OTP"
    : loading
    ? "Generating OTP..."
    : "Login";

  const buttonColor = otpPhase
    ? loading
      ? "#166534"
      : "#22c55e"
    : loading
    ? "#ca8a04"
    : "#facc15";

  const buttonAction = otpPhase ? handleVerifyOtp : handleLogin;

  return (
    <View style={{ flex: 1 }}>
      <AnimatedBG
        source={require("../assets/background.jpg")}
        style={[styles.background, { transform: [{ scale: bgScale }] }]}
      >
        <View style={styles.overlay} />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.container}
        >
          <BlurView intensity={70} tint="dark" style={styles.card}>
            <Image
              source={require("../assets/logo.png")}
              style={styles.logo}
            />

            <Text style={styles.header}>
              {otpPhase ? "Verify OTP" : "Login"}
            </Text>

            {message ? <Text style={styles.message}>{message}</Text> : null}

            {!otpPhase && (
              <>
                <View style={styles.inputRow}>
                  <Ionicons name="key-outline" size={20} color="#fff" />
                  <TextInput
                    style={styles.input}
                    placeholder="Unique ID or Email"
                    placeholderTextColor="#ccc"
                    value={identifier}
                    onChangeText={setIdentifier}
                  />
                </View>

                <View style={styles.inputRow}>
                  <Ionicons name="lock-closed-outline" size={20} color="#fff" />
                  <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor="#ccc"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off" : "eye"}
                      size={20}
                      color="#fff"
                    />
                  </TouchableOpacity>
                </View>

                <View style={styles.extraActions}>
                  <TouchableOpacity
                    onPress={() => navigation.navigate("ForgotPassword")}
                    style={styles.forgotBtn}
                  >
                    <Text style={styles.forgotText}>Forgot Password?</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleRetrieveUniqueId}
                    style={styles.retrieveBtn}
                  >
                    <Ionicons name="finger-print" size={16} color="#facc15" />
                    <Text style={styles.retrieveText}>
                      Retrieve Unique ID
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {otpPhase && (
              <>
                <View style={styles.inputRow}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={20}
                    color="#fff"
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter OTP"
                    placeholderTextColor="#ccc"
                    value={otpInput}
                    onChangeText={setOtpInput}
                    keyboardType="number-pad"
                  />
                </View>

                {/* 🔁 RESEND OTP */}
                <TouchableOpacity
                  disabled={resendTimer > 0}
                  onPress={handleResendOtp}
                >
                  <Text
                    style={[
                      styles.resend,
                      resendTimer > 0 && { opacity: 0.5 },
                    ]}
                  >
                    {resendTimer > 0
                      ? `Resend OTP (${resendTimer}s)`
                      : "Resend OTP"}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={[styles.button, { backgroundColor: buttonColor }]}
              onPress={buttonAction}
              disabled={loading}
            >
              <Text style={styles.buttonText}>{buttonText}</Text>
            </TouchableOpacity>
          </BlurView>
        </KeyboardAvoidingView>
      </AnimatedBG>

      {/* RETRIEVE ID MODAL */}
      <Modal
        visible={retrieveModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setRetrieveModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Retrieve Unique ID</Text>
            <Text style={styles.modalSubtitle}>Enter your registered Email and Password</Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="Email"
              placeholderTextColor="#888"
              value={retrieveEmail}
              onChangeText={setRetrieveEmail}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Password"
              placeholderTextColor="#888"
              value={retrievePassword}
              onChangeText={setRetrievePassword}
              secureTextEntry
            />

            <TouchableOpacity style={styles.modalButton} onPress={executeRetrieve}>
              <Text style={styles.modalButtonText}>{loading ? "Checking..." : "Retrieve ID"}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCancel} onPress={() => setRetrieveModalVisible(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ---------- STYLES ---------- */

const styles = StyleSheet.create({
  background: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    borderRadius: 20,
    padding: 20,
    width: "100%",
    maxWidth: 400,
  },
  logo: {
    width: 90,
    height: 90,
    alignSelf: "center",
    marginBottom: 10,
  },
  header: {
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 12,
  },
  message: {
    textAlign: "center",
    color: "#fde68a",
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    color: "#fff",
    marginLeft: 10,
    backgroundColor: "transparent",
    ...Platform.select({
      web: {
        outlineStyle: "none",
      },
      default: {},
    }),
  },
  resend: {
    textAlign: "center",
    color: "#facc15",
    marginBottom: 8,
    fontWeight: "600",
  },
  button: {
    padding: 16,
    borderRadius: 14,
    marginTop: 10,
  },
  buttonText: {
    textAlign: "center",
    fontWeight: "700",
    fontSize: 16,
    color: "#000",
  },
  extraActions: {
    alignItems: "center",
    marginBottom: 10,
  },
  forgotBtn: {
    marginBottom: 10,
  },
  forgotText: {
    color: "#ccc",
    textDecorationLine: "underline",
  },
  retrieveBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  retrieveText: {
    color: "#facc15",
    marginLeft: 5,
    fontSize: 13,
    fontWeight: "bold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#fff",
    width: "100%",
    maxWidth: 350,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
  },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: "#333", marginBottom: 5 },
  modalSubtitle: { fontSize: 14, color: "#666", marginBottom: 20, textAlign: "center" },
  modalInput: {
    width: "100%",
    backgroundColor: "#f0f0f0",
    borderRadius: 10,
    padding: 12,
    marginBottom: 15,
    color: "#333",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  modalButton: { backgroundColor: "#facc15", width: "100%", padding: 15, borderRadius: 10, alignItems: "center", marginBottom: 10 },
  modalButtonText: { color: "#000", fontWeight: "bold", fontSize: 16 },
  modalCancel: { padding: 10 },
  modalCancelText: { color: "#666", fontWeight: "600" },
});
