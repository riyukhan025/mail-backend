import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Picker } from "@react-native-picker/picker";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useContext, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View
} from "react-native";

import firebase from "../firebase";
import { AuthContext } from "./AuthContext";
import { logErrorToFirebase } from "./errorUtils";

const AnimatedBG = Animated.createAnimatedComponent(ImageBackground);

export default function AuthScreen({ navigation }) {
  const { login } = useContext(AuthContext);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const [isSignup, setIsSignup] = useState(false);
  const [webSignupStep, setWebSignupStep] = useState(0);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [gender, setGender] = useState("");

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
  const authSlider = useRef(new Animated.Value(0)).current;
  const bgScale = useRef(new Animated.Value(1)).current;
  const mobileSubmitScale = useRef(new Animated.Value(1)).current;
  const webStepAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bgScale, { toValue: 1.05, duration: 8000, useNativeDriver: true }),
        Animated.timing(bgScale, { toValue: 1, duration: 8000, useNativeDriver: true }),
      ])
    ).start();
  }, [bgScale]);

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

  useEffect(() => {
    Animated.timing(authSlider, {
      toValue: isSignup ? 1 : 0,
      duration: 500,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [isSignup, authSlider]);

  useEffect(() => {
    if (!isWeb) return;
    if (!isSignup) setWebSignupStep(0);
  }, [isSignup, isWeb]);

  useEffect(() => {
    if (!isWeb) return;
    Animated.timing(webStepAnim, {
      toValue: webSignupStep,
      duration: 240,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [isWeb, webSignupStep, webStepAnim]);

  const triggerHaptic = (type = 'impact') => {
    if (Platform.OS === 'web') return;
    if (type === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (type === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const showMessage = (txt) => {
    if (Platform.OS === "web") {
      setMessage(txt);
    } else {
      triggerHaptic('error');
      Alert.alert(txt);
    }
    setTimeout(() => setMessage(""), 3000);
  };

  const generateOtp = async (uid) => {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await firebase.database().ref(`users/${uid}/loginOtp`).set({ otp, createdAt: Date.now() });
    showMessage(`OTP: ${otp}`);
  };

  const handleLogin = async () => {
    if (!identifier || !password) return showMessage("Enter Unique ID / Email and password");
    triggerHaptic();
    try {
      setLoading(true);
      const field = /^\d{4}$/.test(identifier) ? "uniqueId" : "email";
      const snap = await firebase.database().ref("users").orderByChild(field).equalTo(identifier).once("value");
      if (!snap.exists()) return showMessage("User not found");

      const uid = Object.keys(snap.val())[0];
      const user = snap.val()[uid];
      if (user.status === "banned") return showMessage("Your access was revoked");

      if (user.password !== password) {
        try {
          await firebase.auth().signInWithEmailAndPassword(user.email, password);
          await firebase.database().ref(`users/${uid}`).update({ password });
        } catch (err) {
          return showMessage("Invalid password");
        }
      }

      setCurrentUid(uid);
      await generateOtp(uid);
      triggerHaptic('success');
      setOtpPhase(true);
    } catch (e) {
      logErrorToFirebase(e, "Login");
      showMessage("Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!name || !identifier || !password || !city || !pincode || !bloodGroup || !gender) {
      return showMessage("Please fill all fields");
    }
    triggerHaptic();
    try {
      setLoading(true);
      const userCredential = await firebase.auth().createUserWithEmailAndPassword(identifier, password);
      const uid = userCredential.user.uid;
      const uniqueId = Math.floor(1000 + Math.random() * 9000).toString();
      const userData = {
        name,
        email: identifier,
        password,
        city,
        pincode,
        bloodGroup,
        gender,
        uniqueId,
        role: "member",
        createdAt: Date.now(),
        photoURL: "",
        isVerified: false,
      };
      await firebase.database().ref(`users/${uid}`).set(userData);
      if (Platform.OS === "web") alert(`Signup Successful! Your Unique ID is ${uniqueId}`);
      else Alert.alert("Signup Successful", `Your Unique ID is ${uniqueId}`);
      setIsSignup(false);
    } catch (error) {
      logErrorToFirebase(error, "Signup");
      showMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpInput) return showMessage("Enter OTP");
    triggerHaptic();
    try {
      setLoading(true);
      const snap = await firebase.database().ref(`users/${currentUid}/loginOtp`).once("value");
      if (snap.val()?.otp !== otpInput) return showMessage("Invalid OTP");

      const userSnap = await firebase.database().ref(`users/${currentUid}`).once("value");
      const { password: pwd, loginOtp, ...clean } = userSnap.val();
      const userWithUid = { ...clean, uid: currentUid, id: currentUid };
      await AsyncStorage.setItem("dbUser", JSON.stringify(userWithUid));
      triggerHaptic('success');
      login(userWithUid);
    } catch (e) {
      logErrorToFirebase(e, "Verify OTP");
      showMessage("OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0 || !currentUid) return;
    triggerHaptic();
    try {
      setResendTimer(30);
      await generateOtp(currentUid);
    } catch (e) {
      logErrorToFirebase(e, "Resend OTP");
      showMessage("Failed to resend OTP");
    }
  };

  const handleRetrieveUniqueId = async () => {
    triggerHaptic();
    setRetrieveEmail("");
    setRetrievePassword("");
    setRetrieveModalVisible(true);
  };

  const handleMobileSubmitPressIn = () => {
    Animated.spring(mobileSubmitScale, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 28,
      bounciness: 6,
    }).start();
  };

  const handleMobileSubmitPressOut = () => {
    Animated.spring(mobileSubmitScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 10,
    }).start();
  };

  const handleWebNextSignupStep = () => {
    if (!isWeb) return;
    if (!name || !identifier || !password) return showMessage("Enter name, email and password");
    setWebSignupStep(1);
  };

  const executeRetrieve = async () => {
    if (!retrieveEmail || !retrievePassword) {
      return Platform.OS === "web" ? alert("Enter Email & Password") : Alert.alert("Error", "Enter Email & Password");
    }
    try {
      setLoading(true);
      const snap = await firebase.database().ref("users").orderByChild("email").equalTo(retrieveEmail).once("value");
      if (!snap.exists()) return Platform.OS === "web" ? alert("Email not found") : Alert.alert("Error", "Email not found");

      const uid = Object.keys(snap.val())[0];
      const user = snap.val()[uid];
      if (user.password !== retrievePassword) return Platform.OS === "web" ? alert("Invalid password") : Alert.alert("Error", "Invalid password");

      const uniqueId = user.uniqueId || "N/A";
      if (Platform.OS === "web") {
        alert(`Your Unique ID is: ${uniqueId}`);
        setRetrieveModalVisible(false);
      } else {
        Alert.alert("Unique ID Retrieved", `Your Unique ID is: ${uniqueId}`, [{ text: "OK", onPress: () => setRetrieveModalVisible(false) }]);
      }
    } catch (e) {
      logErrorToFirebase(e, "RetrieveID");
      Platform.OS === "web" ? alert("Failed") : Alert.alert("Error", "Failed to retrieve ID");
    } finally {
      setLoading(false);
    }
  };

  const ensureOAuthProfileAndLogin = async (authUser, providerName) => {
    const email = (authUser?.email || "").trim().toLowerCase();
    if (!email) throw new Error("No email found from provider");

    const usersRef = firebase.database().ref("users");
    const snap = await usersRef.orderByChild("email").equalTo(email).once("value");
    let uid;
    let profile;

    if (snap.exists()) {
      uid = Object.keys(snap.val())[0];
      profile = snap.val()[uid];
      if (profile.status === "banned") throw new Error("Your access was revoked");
      await usersRef.child(uid).update({
        name: profile.name || authUser.displayName || "User",
        photoURL: profile.photoURL || authUser.photoURL || "",
        lastLoginAt: Date.now(),
        authProvider: providerName,
      });
      const freshSnap = await usersRef.child(uid).once("value");
      profile = freshSnap.val();
    } else {
      const uniqueId = Math.floor(1000 + Math.random() * 9000).toString();
      const newProfile = {
        name: authUser.displayName || "User",
        email,
        password: "",
        city: "",
        pincode: "",
        bloodGroup: "",
        uniqueId,
        role: "member",
        createdAt: Date.now(),
        photoURL: authUser.photoURL || "",
        isVerified: true,
        authProvider: providerName,
      };
      const newUserRef = usersRef.push();
      uid = newUserRef.key;
      await newUserRef.set(newProfile);
      profile = newProfile;
    }

    const { password: pwd, loginOtp, ...clean } = profile;
    const userWithUid = { ...clean, uid, id: uid };
    await AsyncStorage.setItem("dbUser", JSON.stringify(userWithUid));
    login(userWithUid);
  };

  const handleGoogleSignIn = async () => {
    if (!isWeb) return showMessage("Google sign-in is available on web in this screen");
    try {
      setLoading(true);
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await firebase.auth().signInWithPopup(provider);
      await ensureOAuthProfileAndLogin(result.user, "google");
    } catch (e) {
      logErrorToFirebase(e, "GoogleSignIn");
      showMessage("Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLinkedInSignIn = async () => {
    if (!isWeb) return showMessage("LinkedIn sign-in is available on web in this screen");
    try {
      setLoading(true);
      const provider = new firebase.auth.OAuthProvider("linkedin.com");
      provider.addScope("r_liteprofile");
      provider.addScope("r_emailaddress");
      const result = await firebase.auth().signInWithPopup(provider);
      await ensureOAuthProfileAndLogin(result.user, "linkedin");
    } catch (e) {
      logErrorToFirebase(e, "LinkedInSignIn");
      await Linking.openURL("https://www.linkedin.com/login");
      showMessage("LinkedIn provider needs Firebase setup. Opened LinkedIn login.");
    } finally {
      setLoading(false);
    }
  };

  const theme = { background: "#1A1A2E", color: "#FFFFFF", primaryColor: "#0F3460" };
  const screenWidth = windowWidth;
  const compactWeb = isWeb && windowHeight < 820;
  const webContainerPadding = isWeb ? (compactWeb ? 12 : 18) : undefined;
  const webCardHeight = isWeb ? Math.max(0, Math.min(760, windowHeight - webContainerPadding * 2)) : undefined;
  const webCardPadding = isWeb ? (compactWeb ? 18 : 22) : undefined;
  const webLogoSize = isWeb ? (compactWeb ? 72 : 82) : undefined;
  const webLogoMarginBottom = isWeb ? (compactWeb ? 8 : 10) : undefined;
  const webCardWidth = Math.min(980, Math.max(360, screenWidth - (compactWeb ? 24 : 92)));
  const sliderWidth = isWeb
    ? Math.min(920, Math.max(320, webCardWidth - (compactWeb ? 40 : 64)))
    : screenWidth < 760
      ? Math.max(300, screenWidth - 28)
      : Math.min(980, Math.max(700, screenWidth - 180));
  const panelWidth = sliderWidth / 2;
  const formTrackTranslateX = authSlider.interpolate({ inputRange: [0, 1], outputRange: [0, -panelWidth] });
  const overlayTrackTranslateX = authSlider.interpolate({ inputRange: [0, 1], outputRange: [-panelWidth, 0] });

  const retrieveModal = (
    <Modal visible={retrieveModalVisible} transparent animationType="slide" onRequestClose={() => setRetrieveModalVisible(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Retrieve Unique ID</Text>
          <Text style={styles.modalSubtitle}>Enter your registered Email and Password</Text>
          <TextInput style={styles.modalInput} placeholder="Email" placeholderTextColor="#888" value={retrieveEmail} onChangeText={setRetrieveEmail} autoCapitalize="none" />
          <TextInput style={styles.modalInput} placeholder="Password" placeholderTextColor="#888" value={retrievePassword} onChangeText={setRetrievePassword} secureTextEntry />
          <TouchableOpacity style={styles.modalButton} onPress={executeRetrieve}>
            <Text style={styles.modalButtonText}>{loading ? "Checking..." : "Retrieve ID"}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modalCancel} onPress={() => setRetrieveModalVisible(false)}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  if (!isWeb) {
    return (
      <ImageBackground source={require("../assets/mobilelogin.jpg")} style={styles.mobileRoot} resizeMode="cover">
        <View style={styles.mobileOverlay} />
        <View style={styles.mobileAuraOne} />
        <View style={styles.mobileAuraTwo} />
        <View style={styles.mobileContainer}>
          <View style={styles.mobileLoginContainer}>
            <View style={[styles.mobileCircle, styles.mobileCircleOne, { backgroundColor: theme.primaryColor }]} />
            <BlurView intensity={72} tint="dark" style={[styles.mobileFormContainer, { borderColor: "hsla(0, 0%, 85%, 0.28)" }]}>
              <View style={styles.mobileSheen} />
              <View style={styles.mobileAccentLine} />
              <Image
                source={{ uri: "https://raw.githubusercontent.com/hicodersofficial/glassmorphism-login-form/master/assets/illustration.png" }}
                style={styles.mobileIllustration}
                resizeMode="contain"
              />
              {message ? <Text style={styles.message}>{message}</Text> : null}
              {otpPhase ? (
                <>
                  <Text style={[styles.mobileHeading, { color: theme.color }]}>VERIFY OTP</Text>
                  <TextInput
                    style={[styles.mobileInput, { color: theme.color, backgroundColor: "#9191911f" }]}
                    placeholder="ENTER OTP"
                    placeholderTextColor={theme.color}
                    value={otpInput}
                    onChangeText={setOtpInput}
                    keyboardType="number-pad"
                  />
                  <TouchableOpacity disabled={resendTimer > 0} onPress={handleResendOtp}>
                    <Text style={[styles.mobileLink, styles.opacity, resendTimer > 0 && { opacity: 0.4 }, { color: theme.color }]}>
                      {resendTimer > 0 ? `RESEND OTP (${resendTimer}s)` : "RESEND OTP"}
                    </Text>
                  </TouchableOpacity>
                  <Animated.View style={{ transform: [{ scale: mobileSubmitScale }] }}>
                    <TouchableOpacity
                      style={[styles.mobileButton, { backgroundColor: theme.primaryColor }]}
                      onPressIn={handleMobileSubmitPressIn}
                      onPressOut={handleMobileSubmitPressOut}
                      onPress={handleVerifyOtp}
                      disabled={loading}
                      activeOpacity={0.9}
                    >
                      {loading ? (
                        <ActivityIndicator color={theme.color} />
                      ) : (
                        <View style={styles.buttonContent}>
                           <Text style={[styles.mobileButtonText, { color: theme.color }]}>VERIFY OTP</Text>
                           <Ionicons name="shield-checkmark-outline" size={18} color={theme.color} style={{ marginLeft: 8 }} />
                        </View>
                      )}
                    </TouchableOpacity>
                  </Animated.View>
                </>
              ) : isSignup ? (
                <>
                  <Text style={[styles.mobileHeading, styles.opacity, { color: theme.color }]}>REGISTER</Text>
                  <TextInput style={[styles.mobileInput, { color: theme.color }]} placeholder="FULL NAME" placeholderTextColor={theme.color} value={name} onChangeText={setName} />
                  <TextInput
                    style={[styles.mobileInput, { color: theme.color }]}
                    placeholder="EMAIL"
                    placeholderTextColor={theme.color}
                    value={identifier}
                    onChangeText={setIdentifier}
                    autoCapitalize="none"
                  />
                  <TextInput
                    style={[styles.mobileInput, { color: theme.color }]}
                    placeholder="PASSWORD"
                    placeholderTextColor={theme.color}
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                  />
                  <TextInput style={[styles.mobileInput, { color: theme.color }]} placeholder="CITY" placeholderTextColor={theme.color} value={city} onChangeText={setCity} />
                  <TextInput
                    style={[styles.mobileInput, { color: theme.color }]}
                    placeholder="PINCODE"
                    placeholderTextColor={theme.color}
                    value={pincode}
                    onChangeText={setPincode}
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={[styles.mobileInput, { color: theme.color }]}
                    placeholder="BLOOD GROUP"
                    placeholderTextColor={theme.color}
                    value={bloodGroup}
                    onChangeText={setBloodGroup}
                  />
                  <View style={styles.mobilePickerWrapper}>
                    <Picker
                      selectedValue={gender}
                      onValueChange={(itemValue) => setGender(itemValue)}
                      style={styles.mobilePicker}
                    >
                      <Picker.Item label="GENDER" value="" color="#fff" />
                      <Picker.Item label="MALE" value="male" color="#000" />
                      <Picker.Item label="FEMALE" value="female" color="#000" />
                    </Picker>
                  </View>
                  <Animated.View style={{ transform: [{ scale: mobileSubmitScale }] }}>
                    <TouchableOpacity
                      style={[styles.mobileButton, { backgroundColor: theme.primaryColor }]}
                      onPressIn={handleMobileSubmitPressIn}
                      onPressOut={handleMobileSubmitPressOut}
                      onPress={handleSignup}
                      disabled={loading}
                      activeOpacity={0.9}
                    >
                      {loading ? (
                        <ActivityIndicator color={theme.color} />
                      ) : (
                        <View style={styles.buttonContent}>
                          <Text style={[styles.mobileButtonText, { color: theme.color }]}>SUBMIT</Text>
                          <Ionicons name="person-add-outline" size={18} color={theme.color} style={{ marginLeft: 8 }} />
                        </View>
                      )}
                    </TouchableOpacity>
                  </Animated.View>
                  <View style={styles.mobileLinksRow}>
                    <TouchableOpacity onPress={() => setIsSignup(false)} style={styles.mobileActionChip}>
                      <Text style={[styles.mobileLink, styles.mobileActionChipText, { color: theme.color }]}>LOGIN</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={[styles.mobileHeading, styles.opacity, { color: theme.color }]}>LOGIN</Text>
                  <TextInput
                    style={[styles.mobileInput, { color: theme.color }]}
                    placeholder="USERNAME"
                    placeholderTextColor={theme.color}
                    value={identifier}
                    onChangeText={setIdentifier}
                    autoCapitalize="none"
                  />
                  <TextInput
                    style={[styles.mobileInput, { color: theme.color }]}
                    placeholder="PASSWORD"
                    placeholderTextColor={theme.color}
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                  />
                  <Animated.View style={{ transform: [{ scale: mobileSubmitScale }] }}>
                    <TouchableOpacity
                      style={[styles.mobileButton, { backgroundColor: theme.primaryColor }]}
                      onPressIn={handleMobileSubmitPressIn}
                      onPressOut={handleMobileSubmitPressOut}
                      onPress={handleLogin}
                      disabled={loading}
                      activeOpacity={0.9}
                    >
                      {loading ? (
                        <ActivityIndicator color={theme.color} />
                      ) : (
                        <View style={styles.buttonContent}>
                          <Text style={[styles.mobileButtonText, { color: theme.color }]}>SUBMIT</Text>
                          <Ionicons name="log-in-outline" size={18} color={theme.color} style={{ marginLeft: 8 }} />
                        </View>
                      )}
                    </TouchableOpacity>
                  </Animated.View>
                  <View style={[styles.mobileLinksRow, styles.mobileLoginLinksRow]}>
                    <TouchableOpacity onPress={() => setIsSignup(true)} style={[styles.mobileLinkSlot, styles.mobileRegisterSlot]}>
                      <Text style={[styles.mobileLink, styles.mobileTopLink, { color: theme.color }]}>REGISTER</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => navigation.navigate("ForgotPassword")} style={styles.mobileLinkSlot}>
                      <Text style={[styles.mobileLink, styles.mobileTopLink, { color: theme.color }]}>FORGOT?</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={handleRetrieveUniqueId} style={styles.mobileRetrieveCenter}>
                    <Text style={[styles.mobileLink, { color: theme.color }]}>RETRIEVE ID</Text>
                  </TouchableOpacity>
                </>
              )}
            </BlurView>
            <View style={[styles.mobileCircle, styles.mobileCircleTwo, { backgroundColor: theme.primaryColor }]} />
          </View>
        </View>
        {retrieveModal}
      </ImageBackground>
    );
  }

  return (
    <View style={styles.root}>
      <AnimatedBG source={require("../assets/background.jpg")} style={[styles.background, { transform: [{ scale: bgScale }] }]} resizeMode="cover">
        <View style={styles.overlay} />
        <View style={styles.webAuraOne} />
        <View style={styles.webAuraTwo} />
        <View style={styles.webAuraThree} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.container, isWeb && { padding: webContainerPadding }, { width: "100%" }]}
        >
          <BlurView
            intensity={80}
            tint="dark"
            style={[styles.card, { width: webCardWidth }, isWeb && { padding: webCardPadding, maxHeight: webCardHeight, height: webCardHeight }]}
          >
            <Image
              source={require("../assets/logo.png")}
              style={[styles.logo, isWeb && { width: webLogoSize, height: webLogoSize, borderRadius: webLogoSize / 2, marginBottom: webLogoMarginBottom }]}
            />
            <View
              style={{
                width: "100%",
                flex: 1,
                minHeight: 0,
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              {message ? (
                <View pointerEvents="none" style={styles.webToast}>
                  <Text style={styles.webToastText}>{message}</Text>
                </View>
              ) : null}

              {otpPhase ? (
                <View style={{ width: "100%", maxWidth: 520 }}>
                  <Text style={styles.header}>Verify OTP</Text>
                  <View style={styles.inputRow}>
                    <Ionicons name="shield-checkmark-outline" size={20} color="#fff" />
                    <TextInput style={styles.input} placeholder="Enter OTP" placeholderTextColor="#ccc" value={otpInput} onChangeText={setOtpInput} keyboardType="number-pad" />
                  </View>
                  <TouchableOpacity disabled={resendTimer > 0} onPress={handleResendOtp}>
                    <Text style={[styles.resend, resendTimer > 0 && { opacity: 0.5 }]}>{resendTimer > 0 ? `Resend OTP (${resendTimer}s)` : "Resend OTP"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.button, { backgroundColor: loading ? "#166534" : "#22c55e" }]} onPress={handleVerifyOtp} disabled={loading}>
                    {loading ? <ActivityIndicator color="#fff" /> : (
                      <View style={styles.buttonContent}>
                        <Text style={styles.buttonText}>Verify OTP</Text>
                        <Ionicons name="shield-checkmark-outline" size={18} color="#000" style={{ marginLeft: 8 }} />
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.doubleSliderShell, { width: sliderWidth, flex: 1, minHeight: 0 }]}>
                  <View style={[styles.formsViewport, { width: panelWidth }]}>
                    <Animated.View style={[styles.formsTrack, { width: panelWidth * 2, transform: [{ translateX: formTrackTranslateX }] }]}>
                      <View style={[styles.formPanel, { width: panelWidth }, compactWeb && { paddingTop: 6, paddingBottom: 12, justifyContent: "center" }]}>
                        <Text style={[styles.panelTitle, compactWeb && { fontSize: 34, marginBottom: 6 }]}>Sign in</Text>
                        <Text style={[styles.panelSub, compactWeb && { marginBottom: 12 }]}>or use your account</Text>
                        <View style={[styles.socialRow, compactWeb && { marginBottom: 12 }]}>
                          <TouchableOpacity style={styles.socialBtn} onPress={() => showMessage("Facebook sign-in coming soon")}>
                            <Ionicons name="logo-facebook" size={14} color="#fff" />
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.socialBtn} onPress={handleGoogleSignIn} disabled={loading}>
                            <Ionicons name="logo-google" size={14} color="#fff" />
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.socialBtn} onPress={handleLinkedInSignIn} disabled={loading}>
                            <Ionicons name="logo-linkedin" size={14} color="#fff" />
                          </TouchableOpacity>
                        </View>
                        <View style={[styles.inputRow, compactWeb && { paddingVertical: 10, marginBottom: 8 }]}>
                          <Ionicons name="key-outline" size={20} color="#fff" />
                          <TextInput style={styles.input} placeholder="Unique ID or Email" placeholderTextColor="#ccc" value={identifier} onChangeText={setIdentifier} />
                        </View>
                        <View style={[styles.inputRow, compactWeb && { paddingVertical: 10, marginBottom: 8 }]}>
                          <Ionicons name="lock-closed-outline" size={20} color="#fff" />
                          <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#ccc" secureTextEntry={!showPassword} value={password} onChangeText={setPassword} />
                          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                            <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color="#fff" />
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity style={[styles.button, styles.authActionBtn]} onPress={handleLogin} disabled={loading}>
                          {loading ? <ActivityIndicator color="#000" /> : (
                            <View style={styles.buttonContent}>
                              <Text style={styles.buttonText}>Sign In</Text>
                              <Ionicons name="log-in-outline" size={18} color="#000" style={{ marginLeft: 8 }} />
                            </View>
                          )}
                        </TouchableOpacity>
                        <View style={styles.extraActions}>
                          <TouchableOpacity onPress={handleRetrieveUniqueId} style={styles.retrieveBtn}>
                            <Ionicons name="finger-print" size={16} color="#facc15" />
                            <Text style={styles.retrieveText}>Retrieve Unique ID</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => navigation.navigate("ForgotPassword")} style={styles.forgotBtn}>
                            <Text style={styles.forgotText}>Forgot Password?</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={[styles.formPanel, { width: panelWidth }, compactWeb && { paddingTop: 6, paddingBottom: 12, justifyContent: "center" }]}>
                        <Text style={[styles.panelTitle, compactWeb && { fontSize: 30, marginBottom: 6 }]}>Create Account</Text>
                        <Text style={[styles.panelSub, compactWeb && { marginBottom: 12 }]}>or use your email for registration</Text>
                        <View style={[styles.socialRow, compactWeb && { marginBottom: 12 }]}>
                          <TouchableOpacity style={styles.socialBtn} onPress={() => showMessage("Facebook sign-in coming soon")}>
                            <Ionicons name="logo-facebook" size={14} color="#fff" />
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.socialBtn} onPress={handleGoogleSignIn} disabled={loading}>
                            <Ionicons name="logo-google" size={14} color="#fff" />
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.socialBtn} onPress={handleLinkedInSignIn} disabled={loading}>
                            <Ionicons name="logo-linkedin" size={14} color="#fff" />
                          </TouchableOpacity>
                        </View>
                        <View style={styles.webStepDots}>
                          <View style={[styles.webStepDot, webSignupStep === 0 && styles.webStepDotActive]} />
                          <View style={[styles.webStepDot, webSignupStep === 1 && styles.webStepDotActive]} />
                        </View>

                        <View style={styles.webStepContainer}>
                          <Animated.View
                            style={[
                              styles.webStepPane,
                              {
                                opacity: webStepAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                                transform: [{ translateY: webStepAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) }],
                              },
                            ]}
                            pointerEvents={webSignupStep === 0 ? "auto" : "none"}
                          >
                            <View style={[styles.inputRow, compactWeb && { paddingVertical: 10, marginBottom: 8 }]}>
                              <Ionicons name="person-outline" size={20} color="#fff" />
                              <TextInput style={styles.input} placeholder="Full Name" placeholderTextColor="#ccc" value={name} onChangeText={setName} />
                            </View>
                          <View style={[styles.inputRow, compactWeb && { paddingVertical: 10, marginBottom: 8 }]}>
                             <Ionicons name="transgender-outline" size={20} color="#fff" />
                             <Picker
                                selectedValue={gender}
                                onValueChange={(v) => setGender(v)}
                                style={[styles.input, { color: '#fff', marginLeft: 0 }]}
                             >
                               <Picker.Item label="Select Gender" value="" color="#000" />
                               <Picker.Item label="Male" value="male" color="#000" />
                               <Picker.Item label="Female" value="female" color="#000" />
                             </Picker>
                          </View>
                            <View style={[styles.inputRow, compactWeb && { paddingVertical: 10, marginBottom: 8 }]}>
                              <Ionicons name="mail-outline" size={20} color="#fff" />
                              <TextInput style={styles.input} placeholder="Email Address" placeholderTextColor="#ccc" value={identifier} onChangeText={setIdentifier} />
                            </View>
                            <View style={[styles.inputRow, compactWeb && { paddingVertical: 10, marginBottom: 8 }]}>
                              <Ionicons name="lock-closed-outline" size={20} color="#fff" />
                              <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#ccc" secureTextEntry={!showPassword} value={password} onChangeText={setPassword} />
                              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color="#fff" />
                              </TouchableOpacity>
                            </View>
                            <TouchableOpacity style={[styles.button, styles.authActionBtn]} onPress={handleWebNextSignupStep} disabled={loading}>
                              {loading ? <ActivityIndicator color="#000" /> : (
                                <View style={styles.buttonContent}>
                                  <Text style={styles.buttonText}>Next</Text>
                                  <Ionicons name="arrow-forward-outline" size={18} color="#000" style={{ marginLeft: 8 }} />
                                </View>
                              )}
                            </TouchableOpacity>
                          </Animated.View>

                          <Animated.View
                            style={[
                              styles.webStepPane,
                              {
                                opacity: webStepAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
                                transform: [{ translateY: webStepAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
                              },
                            ]}
                            pointerEvents={webSignupStep === 1 ? "auto" : "none"}
                          >
                            <View style={styles.webTwoCol}>
                              <View style={[styles.inputRow, styles.webCol, compactWeb && { paddingVertical: 10, marginBottom: 8 }]}>
                                <Ionicons name="location-outline" size={20} color="#fff" />
                                <TextInput style={styles.input} placeholder="City" placeholderTextColor="#ccc" value={city} onChangeText={setCity} />
                              </View>
                              <View style={[styles.inputRow, styles.webCol, compactWeb && { paddingVertical: 10, marginBottom: 8 }]}>
                                <Ionicons name="map-outline" size={20} color="#fff" />
                                <TextInput style={styles.input} placeholder="Pincode" placeholderTextColor="#ccc" value={pincode} onChangeText={setPincode} keyboardType="numeric" />
                              </View>
                            </View>
                            <View style={[styles.inputRow, compactWeb && { paddingVertical: 10, marginBottom: 8 }]}>
                              <Ionicons name="water-outline" size={20} color="#fff" />
                              <TextInput style={styles.input} placeholder="Blood Group" placeholderTextColor="#ccc" value={bloodGroup} onChangeText={setBloodGroup} />
                            </View>
                            <View style={styles.webStepActions}>
                              <TouchableOpacity style={styles.webBackBtn} onPress={() => setWebSignupStep(0)} disabled={loading}>
                                <Ionicons name="arrow-back" size={16} color="#e2e8f0" />
                                <Text style={styles.webBackText}>Back</Text>
                              </TouchableOpacity>
                              <TouchableOpacity style={[styles.button, styles.authActionBtn, styles.webPrimaryBtn]} onPress={handleSignup} disabled={loading}>
                                {loading ? <ActivityIndicator color="#000" /> : (
                                  <View style={styles.buttonContent}>
                                    <Text style={styles.buttonText}>Sign Up</Text>
                                    <Ionicons name="person-add-outline" size={18} color="#000" style={{ marginLeft: 8 }} />
                                  </View>
                                )}
                              </TouchableOpacity>
                            </View>
                          </Animated.View>
                        </View>
                      </View>
                    </Animated.View>
                  </View>

                  <View style={[styles.overlayViewport, { width: panelWidth, left: panelWidth }]}>
                    <Animated.View style={[styles.overlayTrack, { width: panelWidth * 2, transform: [{ translateX: overlayTrackTranslateX }] }]}>
                      <View style={[styles.overlayPanel, { width: panelWidth }, isWeb && { justifyContent: "center", paddingTop: 0 }]}>
                        <LinearGradient pointerEvents="none" colors={["rgba(255,47,113,0.96)", "rgba(244,114,182,0.92)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.overlayGradient} />
                        <Image source={require("../assets/logo.png")} style={styles.overlayMark} />
                        <View style={styles.overlayGlowOne} />
                        <View style={styles.overlayGlowTwo} />
                        <Text style={[styles.overlayTitle, compactWeb && { fontSize: 32 }]}>Welcome Back!</Text>
                        <Text style={styles.overlayText}>To keep connected with us please login with your personal info</Text>
                        <TouchableOpacity style={styles.ghostBtn} onPress={() => setIsSignup(false)}>
                          <Text style={styles.ghostBtnText}>Sign In</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={[styles.overlayPanel, { width: panelWidth }, isWeb && { justifyContent: "center", paddingTop: 0 }]}>
                        <LinearGradient pointerEvents="none" colors={["rgba(255,47,113,0.96)", "rgba(244,114,182,0.92)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.overlayGradient} />
                        <Image source={require("../assets/logo.png")} style={styles.overlayMark} />
                        <View style={styles.overlayGlowOne} />
                        <View style={styles.overlayGlowTwo} />
                        <Text style={[styles.overlayTitle, compactWeb && { fontSize: 32 }]}>Hello, Friend!</Text>
                        <Text style={styles.overlayText}>Enter your personal details and start journey with us</Text>
                        <TouchableOpacity style={styles.ghostBtn} onPress={() => setIsSignup(true)}>
                          <Text style={styles.ghostBtnText}>Sign Up</Text>
                        </TouchableOpacity>
                      </View>
                    </Animated.View>
                  </View>
                </View>
              )}
            </View>
          </BlurView>
        </KeyboardAvoidingView>
      </AnimatedBG>

      {retrieveModal}
    </View>
  );
}

const styles = StyleSheet.create({
  mobileRoot: { flex: 1 },
  mobileOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.28)" },
  mobileAuraOne: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: "rgba(56, 189, 248, 0.18)",
    top: -50,
    left: -60,
  },
  mobileAuraTwo: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: "rgba(251, 113, 133, 0.16)",
    bottom: -45,
    right: -40,
  },
  mobileContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
  mobileLoginContainer: { position: "relative", width: "100%", maxWidth: 345 },
  mobileCircle: {
    width: 128,
    height: 128,
    borderRadius: 999,
    position: "absolute",
    opacity: 0.7,
  },
  mobileCircleOne: { top: 0, left: 0, transform: [{ translateX: -58 }, { translateY: -58 }], zIndex: -1 },
  mobileCircleTwo: { bottom: 0, right: 0, transform: [{ translateX: 58 }, { translateY: 58 }], zIndex: -1 },
  mobileFormContainer: {
    borderWidth: 1,
    borderTopLeftRadius: 34,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 34,
    paddingHorizontal: 24,
    paddingBottom: 22,
    paddingTop: 78,
    position: "relative",
    backgroundColor: "rgba(8,14,30,0.35)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 24,
    elevation: 10,
  },
  mobileIllustration: {
    position: "absolute",
    top: -48,
    right: -20,
    width: 200,
    height: 200,
    shadowColor: "#7dd3fc",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 20,
  },
  mobileHeading: {
    fontSize: 34,
    fontWeight: "700",
    textAlign: "left",
    marginBottom: 8,
    letterSpacing: 1,
    textShadowColor: "rgba(125, 211, 252, 0.95)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  mobileInput: {
    paddingHorizontal: 16,
    paddingVertical: 15,
    width: "100%",
    marginVertical: 8,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.8,
    shadowColor: "#020617",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    ...Platform.select({
      web: { outlineStyle: "none" },
      default: {},
    }),
  },
  mobileButton: {
    paddingVertical: 11,
    borderRadius: 18,
    marginTop: 6,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
  },
  mobileButtonText: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  mobileLinksRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    columnGap: 10,
  },
  mobileLoginLinksRow: {
    justifyContent: "center",
    columnGap: 14,
  },
  mobileLinkSlot: {
    flex: 1,
    alignItems: "center",
  },
  mobileRegisterSlot: {
    marginLeft: -12,
  },
  mobileRetrieveCenter: {
    marginTop: 12,
    alignSelf: "center",
  },
  mobileLink: { fontSize: 12, letterSpacing: 1 },
  mobileTopLink: { fontSize: 11, letterSpacing: 0.6 },
  mobileActionChip: {
    backgroundColor: "rgba(15, 52, 96, 0.38)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  mobileRetrieveChip: {
    minWidth: 140,
    alignItems: "center",
  },
  mobileActionChipText: {
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.28)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  root: {
    flex: 1,
    width: "100%",
    height: Platform.OS === "web" ? "100vh" : "100%",
    backgroundColor: "#000",
    ...Platform.select({
      web: { overflow: "hidden" },
      default: {},
    }),
  },
  background: {
    flex: 1,
    width: Platform.OS === "web" ? "100vw" : "100%",
    height: Platform.OS === "web" ? "100vh" : "100%",
  },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  webAuraOne: {
    position: "absolute",
    width: 380,
    height: 380,
    borderRadius: 999,
    backgroundColor: "rgba(56, 189, 248, 0.16)",
    top: -120,
    left: -90,
  },
  webAuraTwo: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: "rgba(244, 114, 182, 0.14)",
    bottom: -110,
    right: -80,
  },
  webAuraThree: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: "rgba(250, 204, 21, 0.11)",
    top: "38%",
    right: "12%",
  },
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  card: {
    borderRadius: 38,
    padding: 25,
    width: Platform.OS === "web" ? "95%" : "100%",
    maxWidth: Platform.OS === "web" ? 1120 : 860,
    maxHeight: "90%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: Platform.OS === "web" ? "rgba(7, 14, 30, 0.5)" : "rgba(7, 14, 30, 0.36)",
    shadowColor: "#050b1e",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    overflow: "hidden",
  },
  logo: {
    width: 86,
    height: 86,
    alignSelf: "center",
    marginBottom: Platform.OS === "web" ? 12 : 20,
    borderRadius: 43,
    shadowColor: "#7dd3fc",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },
  header: { fontSize: 28, fontWeight: "800", color: "#fff", textAlign: "center", marginBottom: 20, letterSpacing: 0.5 },
  message: {
    textAlign: "center",
    color: "#ff6b6b",
    marginBottom: 15,
    fontWeight: "600",
    backgroundColor: "rgba(255,0,0,0.1)",
    padding: 8,
    borderRadius: 8,
    overflow: "hidden",
  },
  webToast: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingTop: 6,
    zIndex: 20,
  },
  webToastText: {
    textAlign: "center",
    color: "#ffe4e6",
    fontWeight: "700",
    backgroundColor: "rgba(255, 0, 80, 0.22)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    overflow: "hidden",
  },
  webStepDots: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 10 },
  webStepDot: { width: 7, height: 7, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.28)" },
  webStepDotActive: { backgroundColor: "rgba(250, 204, 21, 0.92)", transform: [{ scale: 1.15 }] },
  webStepContainer: { position: "relative", width: "100%", flex: 1, minHeight: 0 },
  webStepPane: { position: "absolute", left: 0, right: 0, top: 0 },
  webTwoCol: { flexDirection: "row", gap: 10 },
  webCol: { flex: 1 },
  webStepActions: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 },
  webBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.25)",
    backgroundColor: "rgba(226,232,240,0.08)",
    ...Platform.select({
      web: { cursor: "pointer" },
      default: {},
    }),
  },
  webBackText: { color: "#e2e8f0", fontWeight: "800", fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase" },
  webPrimaryBtn: { flex: 1 },
  doubleSliderShell: {
    minHeight: 0,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 30,
    overflow: "hidden",
    alignSelf: "center",
    backgroundColor: "rgba(10, 18, 36, 0.62)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 10,
    ...Platform.select({
      web: { boxShadow: "0px 18px 60px rgba(0,0,0,0.35)" },
      default: {},
    }),
  },
  formsViewport: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    overflow: "hidden",
  },
  formsTrack: {
    height: "100%",
    flexDirection: "row",
  },
  formPanel: {
    height: "100%",
    paddingHorizontal: 18,
    paddingBottom: Platform.OS === "web" ? 12 : 18,
    paddingTop: Platform.OS === "web" ? 6 : 8,
    justifyContent: "flex-start",
  },
  panelTitle: {
    color: "#f8fafc",
    textAlign: "center",
    fontSize: Platform.OS === "web" ? 34 : 42,
    fontWeight: "800",
    marginBottom: 8,
    letterSpacing: 0.4,
    textShadowColor: "rgba(125, 211, 252, 0.65)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  panelSub: {
    color: "#cbd5e1",
    textAlign: "center",
    fontSize: Platform.OS === "web" ? 14 : 15,
    marginBottom: Platform.OS === "web" ? 14 : 16,
  },
  socialRow: { flexDirection: "row", justifyContent: "center", gap: 10, marginBottom: Platform.OS === "web" ? 14 : 18 },
  socialBtn: {
    width: Platform.OS === "web" ? 36 : 38,
    height: Platform.OS === "web" ? 36 : 38,
    borderRadius: Platform.OS === "web" ? 18 : 19,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    ...Platform.select({
      web: { cursor: "pointer" },
      default: {},
    }),
  },
  overlayViewport: {
    position: "absolute",
    top: 0,
    bottom: 0,
    overflow: "hidden",
  },
  overlayTrack: { height: "100%", flexDirection: "row" },
  overlayPanel: {
    height: "100%",
    backgroundColor: "transparent",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: Platform.OS === "web" ? 92 : 110,
    paddingHorizontal: 18,
    overflow: "hidden",
  },
  overlayGradient: { ...StyleSheet.absoluteFillObject },
  overlayGlowOne: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    top: -90,
    left: -70,
  },
  overlayGlowTwo: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    bottom: -70,
    right: -50,
  },
  overlayMark: {
    position: "absolute",
    width: 320,
    height: 320,
    opacity: 0.08,
    top: "50%",
    left: "50%",
    transform: [{ translateX: -160 }, { translateY: -160 }],
  },
  overlayTitle: {
    color: "#fff",
    fontSize: Platform.OS === "web" ? 36 : 46,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
  },
  overlayText: {
    color: "#fff",
    textAlign: "center",
    fontSize: Platform.OS === "web" ? 15 : 16,
    lineHeight: Platform.OS === "web" ? 21 : 22,
    marginBottom: Platform.OS === "web" ? 18 : 24,
    maxWidth: 320,
  },
  ghostBtn: {
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 26,
    ...Platform.select({
      web: { cursor: "pointer" },
      default: {},
    }),
  },
  ghostBtnText: { color: "#fff", fontWeight: "800", fontSize: 12, letterSpacing: 0.8 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(3,8,20,0.7)",
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: Platform.OS === "web" ? 10 : 12,
    marginBottom: Platform.OS === "web" ? 8 : 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  input: {
    flex: 1,
    color: "#fff",
    marginLeft: 10,
    fontSize: 14,
    backgroundColor: "transparent",
    ...Platform.select({
      web: { outlineStyle: "none" },
      default: {},
    }),
  },
  resend: { textAlign: "center", color: "#facc15", marginBottom: 8, fontWeight: "600" },
  button: {
    paddingVertical: Platform.OS === "web" ? 10 : 12,
    borderRadius: 14,
    marginTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
    backgroundColor: "#facc15",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    ...Platform.select({
      web: { cursor: "pointer" },
      default: {},
    }),
  },
  authActionBtn: { marginTop: 2 },
  buttonContent: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  buttonText: {
    textAlign: "center",
    fontWeight: "800",
    fontSize: 13,
    color: "#000",
    textTransform: "uppercase",
    letterSpacing: 0.85,
  },
  extraActions: { alignItems: "center", marginTop: Platform.OS === "web" ? 10 : 12, gap: 10 },
  forgotBtn: {
    marginTop: 0,
    marginBottom: 0,
    ...Platform.select({
      web: { cursor: "pointer" },
      default: {},
    }),
  },
  forgotText: { color: "#aaa", fontSize: 13 },
  retrieveBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(250, 204, 21, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(250, 204, 21, 0.3)",
    ...Platform.select({
      web: { cursor: "pointer" },
      default: {},
    }),
  },
  retrieveText: { color: "#facc15", marginLeft: 5, fontSize: 11, fontWeight: "bold" },
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
  opacity: { opacity: 0.6 },
  mobilePickerWrapper: { backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.24)", marginVertical: 8, overflow: 'hidden' },
  mobilePicker: { color: "#fff", height: 50 },
});
