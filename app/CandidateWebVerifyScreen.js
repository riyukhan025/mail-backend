import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import firebase from "../firebase";

export default function CandidateWebVerifyScreen({ caseId, token }) {
  const [loading, setLoading] = useState(true);
  const [caseData, setCaseData] = useState(null);
  const [error, setError] = useState("");

  const [consent, setConsent] = useState(false);
  const [notes, setNotes] = useState("");
  const [selfieFile, setSelfieFile] = useState(null);
  const [idFrontFile, setIdFrontFile] = useState(null);
  const [idBackFile, setIdBackFile] = useState(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canvasRef = useRef(null);
  const drawingRef = useRef({ drawing: false, lastX: 0, lastY: 0 });

  const theme = useMemo(
    () => ({
      bg: ["#030712", "#08132b", "#0b1f46"],
      card: "rgba(30, 41, 59, 0.6)",
      text: "#F8FAFC",
      textSecondary: "#94A3B8",
      primary: "#60A5FA",
      error: "#F87171",
      success: "#34D399",
    }),
    []
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        setError("");

        if (!caseId || !token) {
          setError("Invalid link. Missing case id or token.");
          return;
        }

        // Try anonymous auth so RTDB/Storage rules can allow candidate writes.
        try {
          const auth = firebase.auth();
          if (!auth.currentUser) await auth.signInAnonymously();
        } catch (e) {}

        const snap = await firebase.database().ref(`cases/${caseId}`).once("value");
        const c = snap.val();
        if (!c) {
          setError("Case not found.");
          return;
        }

        const storedToken = String(c?.digitalVerification?.token || "").trim();
        const expiresAt = Number(c?.digitalVerification?.expiresAt || 0);
        const usedAt = c?.digitalVerification?.usedAt || null;
        const now = Date.now();

        if (!storedToken || storedToken !== token) {
          setError("Link is invalid or has been replaced.");
          return;
        }
        if (expiresAt && expiresAt <= now) {
          setError("Link has expired. Please request a new link.");
          return;
        }
        if (usedAt) {
          setError("This link was already used.");
          return;
        }

        if (cancelled) return;
        setCaseData({ id: caseId, ...c });
      } catch (e) {
        if (cancelled) return;
        setError(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [caseId, token]);

  const uploadFile = async (file, name) => {
    if (!file) return null;
    const uid = firebase.auth()?.currentUser?.uid || "anon";
    const safeName = String(name || file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `digitalVerifications/${caseId}/${uid}/${Date.now()}_${safeName}`;
    const ref = firebase.storage().ref().child(path);
    const snap = await ref.put(file);
    return await snap.ref.getDownloadURL();
  };

  const uploadSignature = async () => {
    if (!signatureDataUrl) return null;
    const uid = firebase.auth()?.currentUser?.uid || "anon";
    const path = `digitalVerifications/${caseId}/${uid}/${Date.now()}_signature.png`;
    const ref = firebase.storage().ref().child(path);
    await ref.putString(signatureDataUrl, "data_url");
    return await ref.getDownloadURL();
  };

  const setupCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 640;
    const cssHeight = canvas.clientHeight || 180;

    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#F8FAFC";
  };

  useEffect(() => {
    if (Platform.OS !== "web") return;
    setupCanvas();
    const onResize = () => setupCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const getCanvasPoint = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX ?? 0) - rect.left;
    const y = (e.clientY ?? 0) - rect.top;
    return { x, y };
  };

  const onPointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasPoint(e);
    drawingRef.current.drawing = true;
    drawingRef.current.lastX = x;
    drawingRef.current.lastY = y;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const onPointerMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (!drawingRef.current.drawing) return;
    const { x, y } = getCanvasPoint(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    drawingRef.current.lastX = x;
    drawingRef.current.lastY = y;
  };

  const onPointerUp = () => {
    drawingRef.current.drawing = false;
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDataUrl("");
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      setSignatureDataUrl(canvas.toDataURL("image/png"));
    } catch (e) {
      // ignore
    }
  };

  const onSubmit = async () => {
    if (!consent) {
      if (Platform.OS === "web") alert("Please accept consent to continue.");
      else Alert.alert("Consent Required", "Please accept consent to continue.");
      return;
    }
    if (!selfieFile || !idFrontFile) {
      const msg = "Please upload at least a selfie and ID front image.";
      if (Platform.OS === "web") alert(msg);
      else Alert.alert("Missing Uploads", msg);
      return;
    }

    setSubmitting(true);
    try {
      // Re-validate token at submit time to prevent stale submissions.
      const snap = await firebase.database().ref(`cases/${caseId}`).once("value");
      const c = snap.val();
      const storedToken = String(c?.digitalVerification?.token || "").trim();
      const expiresAt = Number(c?.digitalVerification?.expiresAt || 0);
      const usedAt = c?.digitalVerification?.usedAt || null;
      const now = Date.now();

      if (!storedToken || storedToken !== token) throw new Error("Link is invalid or has been replaced.");
      if (expiresAt && expiresAt <= now) throw new Error("Link has expired.");
      if (usedAt) throw new Error("This link was already used.");

      const selfieUrl = await uploadFile(selfieFile, "selfie");
      const idFrontUrl = await uploadFile(idFrontFile, "id_front");
      const idBackUrl = await uploadFile(idBackFile, "id_back");
      const signatureUrl = await uploadSignature();

      const uid = firebase.auth()?.currentUser?.uid || `candidate:${caseId}`;

      await firebase.database().ref(`cases/${caseId}`).update({
        status: "audit",
        completedAt: now,
        closedBy: uid,
        formCompleted: true,
        digitalVerification: {
          ...(c?.digitalVerification || {}),
          usedAt: now,
          submittedAt: now,
          channel: "web",
          artifacts: {
            selfieUrl: selfieUrl || null,
            idFrontUrl: idFrontUrl || null,
            idBackUrl: idBackUrl || null,
            signatureUrl: signatureUrl || null,
          },
          notes: String(notes || "").trim() || null,
          consent: true,
        },
      });

      setSubmitting(false);
      if (Platform.OS === "web") {
        alert("Submitted successfully. You can close this tab now.");
      } else {
        Alert.alert("Submitted", "Submitted successfully. You can close this screen now.");
      }
    } catch (e) {
      const msg = String(e?.message || e);
      setSubmitting(false);
      if (Platform.OS === "web") alert("Submit failed: " + msg);
      else Alert.alert("Submit Failed", msg);
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={theme.bg} style={styles.container}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.primary + "33" }]}>
          <Text style={[styles.title, { color: theme.text }]}>Digital Verification</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Loading...</Text>
          <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 16 }} />
        </View>
      </LinearGradient>
    );
  }

  if (error) {
    return (
      <LinearGradient colors={theme.bg} style={styles.container}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.error + "55" }]}>
          <Text style={[styles.title, { color: theme.text }]}>Digital Verification</Text>
          <Text style={[styles.subtitle, { color: theme.error }]}>{error}</Text>
        </View>
      </LinearGradient>
    );
  }

  const refNo = String(caseData?.matrixRefNo || caseId);
  const candidateName = String(caseData?.candidateName || "Candidate");

  return (
    <LinearGradient colors={theme.bg} style={styles.container}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.primary + "33" }]}>
        <Text style={[styles.title, { color: theme.text }]}>Digital Verification</Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>Ref: {refNo}</Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]}>Name: {candidateName}</Text>

        <View style={{ height: 12 }} />

        <View style={styles.section}>
          <Text style={[styles.label, { color: theme.text }]}>1) Consent</Text>
          <TouchableOpacity
            onPress={() => setConsent((v) => !v)}
            style={[styles.consentBtn, { borderColor: consent ? theme.success : theme.primary }]}
          >
            <Text style={{ color: consent ? theme.success : theme.primary, fontWeight: "800" }}>
              {consent ? "CONSENT ACCEPTED" : "TAP TO ACCEPT CONSENT"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: theme.text }]}>2) Upload Photos</Text>
          {Platform.OS === "web" ? (
            <View style={{ gap: 10 }}>
              <View>
                <Text style={[styles.help, { color: theme.textSecondary }]}>Selfie (required)</Text>
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={(e) => setSelfieFile(e.target.files?.[0] || null)}
                />
              </View>
              <View>
                <Text style={[styles.help, { color: theme.textSecondary }]}>ID Front (required)</Text>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setIdFrontFile(e.target.files?.[0] || null)}
                />
              </View>
              <View>
                <Text style={[styles.help, { color: theme.textSecondary }]}>ID Back (optional)</Text>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => setIdBackFile(e.target.files?.[0] || null)}
                />
              </View>
              <Text style={[styles.help, { color: theme.textSecondary }]}>
                If the camera does not open, choose "Files" and pick a photo, or open this link in Chrome/Safari (not inside an in-app browser).
              </Text>
            </View>
          ) : (
            <Text style={[styles.help, { color: theme.textSecondary }]}>
              This flow is meant for browser use. Please open the link in a browser.
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: theme.text }]}>3) Signature (optional)</Text>
          {Platform.OS === "web" ? (
            <View style={{ marginTop: 10 }}>
              <View style={[styles.sigBox, { borderColor: theme.primary + "33" }]}>
                <canvas
                  ref={canvasRef}
                  style={{ width: "100%", height: 180, touchAction: "none" }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerUp}
                />
              </View>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <TouchableOpacity onPress={clearSignature} style={[styles.sigBtn, { borderColor: theme.primary }]}>
                  <Text style={{ color: theme.primary, fontWeight: "900" }}>CLEAR</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveSignature} style={[styles.sigBtn, { borderColor: theme.success }]}>
                  <Text style={{ color: theme.success, fontWeight: "900" }}>
                    {signatureDataUrl ? "SAVED" : "SAVE"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <Text style={[styles.help, { color: theme.textSecondary }]}>Signature capture is available on the web link.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.label, { color: theme.text }]}>4) Notes (optional)</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Any comments..."
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.primary + "33" }]}
            multiline
          />
        </View>

        <TouchableOpacity
          disabled={submitting}
          onPress={onSubmit}
          style={[
            styles.submitBtn,
            { backgroundColor: submitting ? "rgba(96,165,250,0.4)" : theme.primary },
          ]}
        >
          <Text style={{ color: "#fff", fontWeight: "900" }}>
            {submitting ? "SUBMITTING..." : "SUBMIT FOR AUDIT"}
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },
  card: { width: "100%", maxWidth: 720, borderRadius: 18, padding: 20, borderWidth: 1 },
  title: { fontSize: 22, fontWeight: "900" },
  subtitle: { marginTop: 10, fontSize: 14, lineHeight: 20 },
  meta: { marginTop: 6, fontSize: 12 },
  section: { marginTop: 14 },
  label: { fontSize: 14, fontWeight: "900" },
  help: { marginTop: 6, fontSize: 12 },
  consentBtn: { marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  input: { marginTop: 10, borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 90 },
  submitBtn: { marginTop: 18, paddingVertical: 12, borderRadius: 14, alignItems: "center" },
  sigBox: { borderWidth: 1, borderRadius: 14, overflow: "hidden", backgroundColor: "rgba(2,6,23,0.35)" },
  sigBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
});
