import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import firebase from "../firebase";

export default function VerifyCaseScreen({ navigation, route }) {
  const [status, setStatus] = useState("loading"); // loading | invalid | ready | error
  const [message, setMessage] = useState("Validating link...");

  const caseId = String(route?.params?.caseId || "").trim();
  const token = String(route?.params?.t || "").trim();

  const theme = useMemo(
    () => ({
      bg: ["#030712", "#08132b", "#0b1f46"],
      card: "rgba(30, 41, 59, 0.6)",
      text: "#F8FAFC",
      textSecondary: "#94A3B8",
      primary: "#60A5FA",
      error: "#F87171",
    }),
    []
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        if (!caseId || !token) {
          setStatus("invalid");
          setMessage("Invalid link. Missing case id or token.");
          return;
        }

        setStatus("loading");
        setMessage("Loading case...");

        // Ensure we have an auth uid for CaseDetailScreen writes.
        try {
          const auth = firebase.auth();
          if (!auth.currentUser) {
            await auth.signInAnonymously();
          }
        } catch (e) {
          // Continue: we can still navigate for read-only, but writes may fail.
        }

        const snap = await firebase.database().ref(`cases/${caseId}`).once("value");
        const c = snap.val();
        if (!c) {
          setStatus("invalid");
          setMessage("Case not found.");
          return;
        }

        const storedToken = String(c?.digitalVerification?.token || "").trim();
        const expiresAt = Number(c?.digitalVerification?.expiresAt || 0);
        const usedAt = c?.digitalVerification?.usedAt || null;
        const now = Date.now();

        if (!storedToken || storedToken !== token) {
          setStatus("invalid");
          setMessage("Link is invalid or has been replaced.");
          return;
        }
        if (expiresAt && expiresAt <= now) {
          setStatus("invalid");
          setMessage("Link has expired. Please request a new link.");
          return;
        }
        if (usedAt) {
          setStatus("invalid");
          setMessage("Link already used. Please request a new link.");
          return;
        }

        if (cancelled) return;
        setStatus("ready");
        setMessage("Opening case...");

        const auth = firebase.auth();
        const paramUser = {
          uid: auth?.currentUser?.uid || `candidate:${caseId}`,
          role: "member",
          name: "Candidate",
        };

        navigation.replace("CaseDetail", {
          caseId,
          role: "member",
          forceEdit: true,
          user: paramUser,
          candidateMode: true,
        });
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setMessage(String(e?.message || e));
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [caseId, token, navigation]);

  const onBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace("Auth");
  };

  return (
    <LinearGradient colors={theme.bg} style={styles.container}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.primary + "33" }]}>
        <Text style={[styles.title, { color: theme.text }]}>Digital Verification</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{message}</Text>

        {status === "loading" && <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 16 }} />}

        {status !== "loading" && (
          <TouchableOpacity onPress={onBack} style={[styles.btn, { borderColor: theme.primary }]}>
            <Text style={[styles.btnText, { color: theme.primary }]}>Back</Text>
          </TouchableOpacity>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },
  card: { width: "100%", maxWidth: 520, borderRadius: 18, padding: 20, borderWidth: 1 },
  title: { fontSize: 22, fontWeight: "900" },
  subtitle: { marginTop: 10, fontSize: 14, lineHeight: 20 },
  btn: { marginTop: 18, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, alignSelf: "flex-start" },
  btnText: { fontWeight: "800" },
});
