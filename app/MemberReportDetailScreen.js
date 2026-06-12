import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import firebase from "../firebase";
import { buildMemberReportModel } from "./reports/memberReportPdf";

function label(u) {
  return String(u?.name || u?.fullName || u?.displayName || u?.email || u?.id || "Member");
}

function Pill({ title, value, accent }) {
  return (
    <View style={[styles.pill, { borderColor: accent + "40" }]}>
      <Text style={styles.pillTitle}>{title}</Text>
      <Text style={[styles.pillValue, { color: accent }]}>{value}</Text>
    </View>
  );
}

export default function MemberReportDetailScreen({ navigation, route }) {
  const userId = String(route?.params?.userId || "").trim();
  const [member, setMember] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let offUser = null;
    let offCases = null;

    const userRef = firebase.database().ref(`users/${userId}`);
    offUser = userRef.on("value", (snapshot) => {
      setMember({ id: userId, ...(snapshot.val() || {}) });
    });

    const casesRef = firebase.database().ref("cases");
    offCases = casesRef.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data).map((key) => ({ id: key, ...data[key] }));
      setCases(list);
      setLoading(false);
    });

    return () => {
      if (offUser) userRef.off("value", offUser);
      if (offCases) casesRef.off("value", offCases);
    };
  }, [userId]);

  const report = useMemo(() => {
    if (!member) return null;
    return buildMemberReportModel({ member, cases, anchorDate: new Date() });
  }, [member, cases]);

  if (!userId) {
    return (
      <LinearGradient colors={["#05080f", "#090d16", "#05080f"]} style={styles.screen}>
        <View style={styles.center}>
          <Text style={styles.centerText}>Missing member id.</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#05080f", "#090d16", "#05080f"]} style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={18} color="#e2e8f0" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{member ? label(member) : "Member"}</Text>
          <Text style={styles.sub} numberOfLines={1}>{report ? `Individual report • ${report.monthLabel}` : "Loading…"}</Text>
        </View>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation?.navigate?.("MemberReportSendScreen", { userId })}
          activeOpacity={0.9}
        >
          <Ionicons name="send-outline" size={16} color="#e2e8f0" />
          <Text style={styles.primaryBtnText}>Send</Text>
        </TouchableOpacity>
      </View>

      {loading || !report ? (
        <View style={styles.center}>
          <ActivityIndicator color="#93c5fd" />
          <Text style={styles.centerText}>Building report…</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>This month summary</Text>
            <View style={styles.pillRow}>
              <Pill title="Total" value={String(report.counts.total)} accent="#60a5fa" />
              <Pill title="Completed" value={String(report.counts.completed)} accent="#22c55e" />
              <Pill title="Pending" value={String(report.counts.pending)} accent="#f59e0b" />
            </View>
            <View style={styles.pillRow}>
              <Pill title="Reverted" value={String(report.counts.reverted)} accent="#ef4444" />
              <Pill title="Fired" value={String(report.counts.fired)} accent="#a855f7" />
              <Pill title="Completion" value={`${report.completionRate}%`} accent="#38bdf8" />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Top districts</Text>
            {(report.topDistricts.length ? report.topDistricts : [{ name: "N/A", count: 0 }]).slice(0, 10).map((d) => (
              <View key={String(d.name)} style={styles.row}>
                <Text style={styles.rowLeft} numberOfLines={1}>{d.name}</Text>
                <Text style={styles.rowRight}>{d.count ? d.count : ""}</Text>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recent cases</Text>
            {(report.recentCases.length ? report.recentCases : [{ ref: "N/A", status: "", district: "", date: "" }]).slice(0, 12).map((c, idx) => (
              <View key={`${c.ref}-${idx}`} style={styles.caseRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.caseRef} numberOfLines={1}>{c.ref}</Text>
                  <Text style={styles.caseMeta} numberOfLines={1}>
                    {c.status ? c.status : "—"} {c.district ? `• ${c.district}` : ""} {c.date ? `• ${c.date}` : ""}
                  </Text>
                </View>
                <Ionicons name="document-text-outline" size={16} color="#94a3b8" />
              </View>
            ))}
            <Text style={styles.hint}>PDF includes up to 25 recent cases.</Text>
          </View>
        </ScrollView>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 14, paddingTop: 10 },
  topbar: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1f2a44",
    backgroundColor: "rgba(2,6,23,0.6)",
  },
  title: { color: "#e2e8f0", fontWeight: "900", fontSize: 14 },
  sub: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f2a44",
    backgroundColor: "rgba(37,99,235,0.15)",
  },
  primaryBtnText: { color: "#e2e8f0", fontWeight: "900", fontSize: 12 },
  center: { padding: 24, alignItems: "center" },
  centerText: { color: "#94a3b8", marginTop: 10 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#182236",
    backgroundColor: "rgba(15,23,42,0.55)",
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: { color: "#e2e8f0", fontWeight: "900", marginBottom: 10 },
  pillRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  pill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "rgba(2,6,23,0.55)",
  },
  pillTitle: { color: "#94a3b8", fontSize: 11 },
  pillValue: { marginTop: 6, fontWeight: "900", fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  rowLeft: { color: "#e2e8f0", flex: 1, paddingRight: 10 },
  rowRight: { color: "#94a3b8", fontWeight: "800" },
  caseRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148,163,184,0.15)",
  },
  caseRef: { color: "#e2e8f0", fontWeight: "900" },
  caseMeta: { color: "#94a3b8", marginTop: 2, fontSize: 12 },
  hint: { color: "#64748b", fontSize: 11, marginTop: 10 },
});

