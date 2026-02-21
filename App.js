import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, Platform, StyleSheet, View } from "react-native";
import "react-native-gesture-handler";

import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AuthContext } from "./app/AuthContext";
import firebase from "./firebase";

/* ---------------- Screens ---------------- */
import AdminEmailScreen from "./app/AdminEmailScreen";
import AdminPanelScreen from "./app/AdminPanelScreen";
import AllCasesScreen from "./app/AllCasesScreen";
import AllTicketsScreen from "./app/AllTicketsScreen";
import AuditCaseScreen from "./app/AuditCaseScreen";
import AuthScreen from "./app/AuthScreen";
import CameraGPSScreen from "./app/CameraGPSScreen";
import CaseDetailScreen from "./app/CaseDetailScreen";
import ChatDetailScreen from "./app/ChatDetailScreen";
import ChatsScreen from "./app/ChatsScreen";
import CompletedCasesScreen from "./app/CompletedCasesScreen";
import Dashboard from "./app/Dashboard";
import DaywiseTrackerScreen from "./app/DaywiseTrackerScreen";
import DevDashboardScreen from "./app/DevDashboardScreen";
import DHIFormScreen from "./app/DHIFormScreen";
import DigitalIDCard from "./app/DigitalIDCard";
import DSRScreen from "./app/DSRScreen";
import ForgotPasswordScreen from "./app/ForgotPasswordScreen";
import FormScreen from "./app/FormScreen";
import MailRecordsScreen from "./app/MailRecordsScreen";
import MailsSentScreen from "./app/MailsSentScreen";
import MatrixFormScreen from "./app/matrixFormScreen";
import MemberChatScreen from "./app/MemberChatScreen";
import MemberDetailScreen from "./app/MemberDetailScreen";
import MemberDSRDetailScreen from "./app/MemberDSRDetailScreen";
import MemberDSRScreen from "./app/MemberDSRScreen";
import MemberViewScreen from "./app/MemberViewScreen";
import MyTicketsScreen from "./app/MyTicketsScreen";
import PlanYourDayScreen from "./app/PlanYourDayScreen";
import RaiseTicketScreen from "./app/RaiseTicketScreen";
import RevertedCasesScreen from "./app/RevertedCasesScreen";
import SplashScreen from "./app/SplashScreen";
import StatisticsScreen from "./app/StatisticsScreen";
import TeamDSRScreen from "./app/TeamDSRScreen";
import Updatescreen from "./app/Updatescreen";
import VerifyProfileScreen from "./app/VerifyProfileScreen";

/* ---------------- Stack ---------------- */
const Stack = createNativeStackNavigator();
const INACTIVITY_LIMIT_MS = 60 * 60 * 1000; // 1 hour
const ENABLE_INACTIVITY_TIMEOUT = Platform.OS !== "web";

/* ---------------- Auth Stack ---------------- */
function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Auth">
        {(props) => <AuthScreen {...props} />}
      </Stack.Screen>
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
      />
    </Stack.Navigator>
  );
}

/* ---------------- Admin Stack ---------------- */
function AdminStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="AdminPanel"
        component={AdminPanelScreen}
      />
      <Stack.Screen name="AuditCaseScreen" component={AuditCaseScreen} />
      <Stack.Screen name="CaseDetail" component={CaseDetailScreen} />
      <Stack.Screen name="MemberViewScreen" component={MemberViewScreen} />
      <Stack.Screen name="MemberDetailScreen" component={MemberDetailScreen} />
      <Stack.Screen name="CompletedCases" component={CompletedCasesScreen} />
      <Stack.Screen name="ChatsScreen" component={ChatsScreen} />
      <Stack.Screen name="ChatDetailScreen" component={ChatDetailScreen} />
      <Stack.Screen name="VerifyProfileScreen" component={VerifyProfileScreen} />
      <Stack.Screen name="RevertedCasesScreen" component={RevertedCasesScreen} />
      <Stack.Screen name="FormScreen" component={FormScreen} />
      <Stack.Screen name="MatrixFormScreen" component={MatrixFormScreen} />
      <Stack.Screen name="DHIFormScreen" component={DHIFormScreen} />
      <Stack.Screen name="TeamDSRScreen" component={TeamDSRScreen} />
      <Stack.Screen name="DevDashboardScreen" component={DevDashboardScreen} />
      <Stack.Screen
        name="MemberDSRDetailScreen"
        component={MemberDSRDetailScreen}
      />
      <Stack.Screen name="MemberDSRScreen" component={MemberDSRScreen} />
      <Stack.Screen
        name="AdminEmailScreen"
        component={AdminEmailScreen}
      />
      <Stack.Screen name="MailsSentScreen" component={MailsSentScreen} />
      <Stack.Screen name="MailRecordsScreen" component={MailRecordsScreen} />
      <Stack.Screen name="StatisticsScreen" component={StatisticsScreen} />
      <Stack.Screen name="AllTicketsScreen" component={AllTicketsScreen} />
      <Stack.Screen name="RaiseTicketScreen" component={RaiseTicketScreen} />
    </Stack.Navigator>
  );
}

/* ---------------- Dev Stack ---------------- */
function DevStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DevDashboardScreen" component={DevDashboardScreen} />
      <Stack.Screen name="AllTicketsScreen" component={AllTicketsScreen} />
      <Stack.Screen name="AuditCaseScreen" component={AuditCaseScreen} />
    </Stack.Navigator>
  );
}

/* ---------------- Member / Dev Stack ---------------- */
function MemberStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="Dashboard"
        component={Dashboard}
      />
      <Stack.Screen name="MemberChats" component={MemberChatScreen} />
      <Stack.Screen name="ChatDetailScreen" component={ChatDetailScreen} />
      <Stack.Screen name="CaseDetail" component={CaseDetailScreen} />
      <Stack.Screen name="PlanYourDayScreen" component={PlanYourDayScreen} />
      <Stack.Screen
        name="DaywiseTrackerScreen"
        component={DaywiseTrackerScreen}
      />
      <Stack.Screen name="DSRScreen" component={DSRScreen} />
      <Stack.Screen name="AllCasesScreen" component={AllCasesScreen} />
      <Stack.Screen name="FormScreen" component={FormScreen} />
      <Stack.Screen name="MatrixFormScreen" component={MatrixFormScreen} />
      <Stack.Screen name="DHIFormScreen" component={DHIFormScreen} />
      <Stack.Screen name="CameraGPSScreen" component={CameraGPSScreen} />
      <Stack.Screen name="Updatescreen" component={Updatescreen} />
      <Stack.Screen name="DigitalIDCard" component={DigitalIDCard} />
      <Stack.Screen name="CompletedCases" component={CompletedCasesScreen} />
      <Stack.Screen name="RevertedCasesScreen" component={RevertedCasesScreen} />
      <Stack.Screen name="TeamDSRScreen" component={TeamDSRScreen} />
      <Stack.Screen
        name="RaiseTicketScreen" component={RaiseTicketScreen} />
      <Stack.Screen name="MyTicketsScreen" component={MyTicketsScreen} /><Stack.Screen
        name="VerifyProfileScreen"
        component={VerifyProfileScreen}
      />
    </Stack.Navigator>
  );
}

/* ---------------- App Content ---------------- */
function AppContent() {
  const [dbUser, setDbUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [language, setLanguage] = useState("en");
  const inactivityTimerRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  const performLogout = useCallback(async () => {
    try {
      await AsyncStorage.removeItem("dbUser");
    } catch (e) {
      console.log("Failed to clear stored user during logout", e);
    }

    try {
      const auth = firebase.auth();
      if (auth?.currentUser) await auth.signOut();
    } catch (e) {
      console.log("Firebase signout failed during inactivity logout", e);
    }

    setDbUser(null);
  }, []);

  const clearInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const resetInactivityTimer = useCallback(() => {
    if (!dbUser || !ENABLE_INACTIVITY_TIMEOUT) return;
    clearInactivityTimer();

    inactivityTimerRef.current = setTimeout(() => {
      Alert.alert("Session Timeout", "Logged out after 1 hour of inactivity.");
      performLogout();
    }, INACTIVITY_LIMIT_MS);
  }, [clearInactivityTimer, dbUser, performLogout]);

  const onUserInteraction = useCallback(() => {
    resetInactivityTimer();
    return false;
  }, [resetInactivityTimer]);

  useEffect(() => {
    const restoreUser = async () => {
      try {
        const savedUser = await AsyncStorage.getItem("dbUser");
        if (savedUser) {
          setDbUser(JSON.parse(savedUser));
        }
        const savedLang = await AsyncStorage.getItem("appLanguage");
        if (savedLang) {
          setLanguage(savedLang);
        }
      } catch (e) {
        console.error("Failed to restore user session", e);
      } finally {
        setReady(true);
      }
    };
    restoreUser();
  }, []);

  useEffect(() => {
    if (!ENABLE_INACTIVITY_TIMEOUT) return;
    if (!dbUser) {
      clearInactivityTimer();
      return;
    }
    resetInactivityTimer();
    return clearInactivityTimer;
  }, [dbUser, resetInactivityTimer, clearInactivityTimer]);

  useEffect(() => {
    if (!ENABLE_INACTIVITY_TIMEOUT) return;
    const sub = AppState.addEventListener("change", (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === "active" && /inactive|background/.test(prevState)) {
        resetInactivityTimer();
      } else if (/inactive|background/.test(nextState)) {
        clearInactivityTimer();
      }
    });

    return () => sub.remove();
  }, [clearInactivityTimer, resetInactivityTimer]);

  const authContext = useMemo(() => ({
    user: dbUser,
    login: async (userData) => {
      setDbUser(userData);
      await AsyncStorage.setItem("dbUser", JSON.stringify(userData));
    },
    logout: performLogout,
    language,
    setLanguage: async (lang) => {
      setLanguage(lang);
      await AsyncStorage.setItem("appLanguage", lang);
    },
  }), [dbUser, language, performLogout]);

  if (!ready) return <SplashScreen />;

  return (
    <AuthContext.Provider value={authContext}>
      <View
        style={{ flex: 1 }}
        onStartShouldSetResponderCapture={onUserInteraction}
        onMoveShouldSetResponderCapture={onUserInteraction}
      >
        <NavigationContainer onStateChange={resetInactivityTimer}>
          {!dbUser ? (
            <AuthStack />
          ) : dbUser.role === "admin" ? (
            <AdminStack />
          ) : dbUser.role === "dev" ? (
            <DevStack />
          ) : (
            <MemberStack />
          )}
        </NavigationContainer>
      </View>
    </AuthContext.Provider>
  );
}

/* ---------------- Entry ---------------- */
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppContent />
    </GestureHandlerRootView>
  );
}

/* ---------------- Styles ---------------- */
const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
