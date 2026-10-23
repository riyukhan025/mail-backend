import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import firebase from "../firebase";

const STATUS_COLORS = {
  sent: "#86efac",
  failed: "#fca5a5",
  skipped: "#fcd34d",
  sending: "#93c5fd",
};

function getNotificationRows(caseItem) {
  const notifications = caseItem.whatsappNotifications || {};
  const rows = [];

  ["assignment", "completion"].forEach((type) => {
    const records = notifications[type] || {};
    Object.entries(records).forEach(([key, record]) => {
      rows.push({
        id: `${caseItem.id}-${type}-${key}`,
        caseId: caseItem.id,
        candidateName: caseItem.candidateName || caseItem.name || "Candidate",
        fieldOfficer: caseItem.assigneeName || caseItem.assignedToName || "Unassigned",
        type,
        status: record?.status || "unknown",
        detail: record?.error || record?.reason || record?.templateName || "",
        updatedAt: record?.sentAt || record?.updatedAt || record?.createdAt || null,
        recipientLastFour: record?.recipientLastFour || "",
        optedIn: caseItem.whatsappOptIn === true,
      });
    });
  });

  const status = String(caseItem.status || "").toLowerCase();
  const hasAssignment = rows.some((row) => row.type === "assignment");
  const hasCompletion = rows.some((row) => row.type === "completion");
  const addUnrecordedRow = (type) => {
    rows.push({
      id: `${caseItem.id}-${type}-unrecorded`,
      caseId: caseItem.id,
      candidateName: caseItem.candidateName || caseItem.name || "Candidate",
      fieldOfficer: caseItem.assigneeName || caseItem.assignedToName || "Unassigned",
      type,
      status: caseItem.whatsappOptIn === true ? "not_recorded" : "skipped",
      detail: caseItem.whatsappOptIn === true
        ? "No delivery record. Confirm the Firebase trigger is deployed."
        : "Candidate WhatsApp opt-in is not recorded.",
      updatedAt: null,
      recipientLastFour: "",
      optedIn: caseItem.whatsappOptIn === true,
    });
  };

  if (status === "assigned" && !hasAssignment) addUnrecordedRow("assignment");
  if (status === "completed" && !hasCompletion) addUnrecordedRow("completion");
  return rows;
}

function formatTimestamp(value) {
  if (!value) return "Not sent";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not sent" : date.toLocaleString();
}

export default function PostCompletionFeedbackScreen({ navigation }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const casesRef = firebase.database().ref("cases");
    const onValue = casesRef.on(
      "value",
      (snapshot) => {
        const data = snapshot.val() || {};
        setCases(Object.entries(data).map(([id, value]) => ({ id, ...value })));
        setLoadError("");
        setLoading(false);
      },
      (error) => {
        setLoadError(error.message || "Could not load WhatsApp delivery records.");
        setLoading(false);
      }
    );

    return () => casesRef.off("value", onValue);
  }, []);

  const rows = useMemo(
    () => cases.flatMap(getNotificationRows).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [cases]
  );
  const summary = useMemo(() => ({
    total: rows.length,
    sent: rows.filter((row) => row.status === "sent").length,
    waiting: rows.filter((row) => ["sending", "not_recorded"].includes(row.status)).length,
    attention: rows.filter((row) => ["failed", "skipped"].includes(row.status)).length,
  }), [rows]);

  return (
    <LinearGradient colors={["#050b16", "#0f172a", "#1e1b4b", "#111827"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation?.goBack?.()}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={20} color="#e2e8f0" />
          </TouchableOpacity>
          <View style={styles.heading}>
            <Text style={styles.eyebrow}>Automated case messaging</Text>
            <Text style={styles.title}>WhatsApp Monitor</Text>
          </View>
          <Ionicons name="chatbubble-ellipses" size={25} color="#86efac" />
        </View>

        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={20} color="#93c5fd" />
          <Text style={styles.noticeText}>
            This monitor shows outbound WhatsApp delivery only. Candidate replies are not collected automatically yet.
          </Text>
        </View>

        <View style={styles.summaryGrid}>
          {[
            ["Messages", summary.total],
            ["Sent", summary.sent],
            ["Waiting", summary.waiting],
            ["Needs attention", summary.attention],
          ].map(([label, value]) => (
            <View key={label} style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{label}</Text>
              <Text style={styles.summaryValue}>{value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Delivery records</Text>
          {loading && <ActivityIndicator color="#93c5fd" style={styles.loader} />}
          {!!loadError && <Text style={styles.errorText}>{loadError}</Text>}
          {!loading && !loadError && rows.length === 0 && (
            <Text style={styles.emptyText}>No assigned or completed cases with WhatsApp notification records yet.</Text>
          )}
          {rows.map((row) => {
            const color = STATUS_COLORS[row.status] || "#cbd5e1";
            return (
              <View key={row.id} style={styles.record}>
                <View style={styles.recordHeader}>
                  <View style={styles.recordHeading}>
                    <Text style={styles.candidate}>{row.candidateName}</Text>
                    <Text style={styles.caseRef}>Case {row.caseId}</Text>
                  </View>
                  <Text style={[styles.status, { color }]}>{row.status.replace("_", " ").toUpperCase()}</Text>
                </View>
                <View style={styles.messageLine}>
                  <Ionicons
                    name={row.type === "assignment" ? "person-add-outline" : "checkmark-done-outline"}
                    size={16}
                    color="#93c5fd"
                  />
                  <Text style={styles.messageType}>
                    {row.type === "assignment" ? "Assignment notice" : "Completion questionnaire"}
                  </Text>
                </View>
                <Text style={styles.detail}>Field officer: {row.fieldOfficer}</Text>
                <Text style={styles.detail}>
                  WhatsApp opt-in: {row.optedIn ? "Confirmed" : "Not recorded"}
                  {row.recipientLastFour ? ` · Number ending ${row.recipientLastFour}` : ""}
                </Text>
                <Text style={styles.detail}>Updated: {formatTimestamp(row.updatedAt)}</Text>
                {!!row.detail && <Text style={[styles.reason, row.status === "failed" && styles.errorText]}>{row.detail}</Text>}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, maxWidth: 1100, width: "100%", alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(148, 163, 184, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  heading: { flex: 1 },
  eyebrow: { color: "#7dd3fc", fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  title: { color: "#f8fafc", fontSize: 27, fontWeight: "800", marginTop: 3 },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(147, 197, 253, 0.28)",
    marginBottom: 16,
  },
  noticeText: { color: "#dbeafe", flex: 1, lineHeight: 20 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 18 },
  summaryCard: {
    flexGrow: 1,
    flexBasis: "22%",
    minWidth: 130,
    padding: 15,
    borderRadius: 14,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.2)",
  },
  summaryLabel: { color: "#94a3b8", fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  summaryValue: { color: "#f8fafc", fontSize: 25, fontWeight: "800", marginTop: 6 },
  card: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.2)",
  },
  cardTitle: { color: "#f8fafc", fontSize: 18, fontWeight: "800", marginBottom: 14 },
  loader: { margin: 20 },
  emptyText: { color: "#94a3b8", paddingVertical: 16, lineHeight: 21 },
  errorText: { color: "#fca5a5", lineHeight: 20 },
  record: {
    padding: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.18)",
    backgroundColor: "rgba(2, 6, 23, 0.4)",
    marginBottom: 12,
  },
  recordHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  recordHeading: { flex: 1 },
  candidate: { color: "#f8fafc", fontSize: 16, fontWeight: "700" },
  caseRef: { color: "#94a3b8", fontSize: 12, marginTop: 3 },
  status: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  messageLine: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12, marginBottom: 8 },
  messageType: { color: "#bfdbfe", fontWeight: "700" },
  detail: { color: "#cbd5e1", fontSize: 13, lineHeight: 20 },
  reason: { color: "#fcd34d", fontSize: 13, lineHeight: 19, marginTop: 6 },
});
