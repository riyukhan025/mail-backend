import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as MailComposer from "expo-mail-composer";
import firebase from "../firebase";
import { buildMemberReportPdfBytes, uint8ToBase64Safe } from "./reports/memberReportPdf";

const LOGO_ASSET = require("../assets/logo.png");

function label(u) {
  return String(u?.name || u?.fullName || u?.displayName || u?.email || u?.id || "Member");
}

function safeEmail(v) {
  const s = String(v || "").trim();
  return s.includes("@") ? s : "";
}

function uiAlert(title, message) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export default function MemberReportSendScreen({ navigation, route }) {
  const userId = String(route?.params?.userId || "").trim();
  const bulk = route?.params?.bulk === true;

  const [users, setUsers] = useState([]);
  const [member, setMember] = useState(null);
  const [cases, setCases] = useState([]);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [webLinks, setWebLinks] = useState([]);
  const cancelRef = useRef({ canceled: false });

  useEffect(() => {
    const refObj = cancelRef.current;
    refObj.canceled = false;
    return () => {
      refObj.canceled = true;
    };
  }, []);

  useEffect(() => {
    const usersRef = firebase.database().ref("users");
    const listener = usersRef.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data).map((key) => ({ id: key, ...data[key] }));
      setUsers(list);
      if (!bulk && userId) {
        const found = list.find((u) => String(u.id) === String(userId));
        setMember(found || null);
      }
    });
    return () => usersRef.off("value", listener);
  }, [bulk, userId]);

  useEffect(() => {
    const casesRef = firebase.database().ref("cases");
    const listener = casesRef.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data).map((key) => ({ id: key, ...data[key] }));
      setCases(list);
    });
    return () => casesRef.off("value", listener);
  }, []);

  const defaults = useMemo(() => {
    const now = new Date();
    const monthLabel = now.toLocaleString(undefined, { month: "long", year: "numeric" });
    const sub = `Space Solutions - Individual Report (${monthLabel})`;
    const b =
      `Hi,\n\n` +
      `Please find your individual work report for ${monthLabel} attached.\n\n` +
      `Regards,\n` +
      `Space Solutions`;
    return { subject: sub, body: b };
  }, []);

  const logoUri = useMemo(() => {
    try {
      const resolved = Image.resolveAssetSource(LOGO_ASSET);
      return resolved?.uri || null;
    } catch {
      return null;
    }
  }, []);

  const sentKeyPrefix = useMemo(() => "member_reports_sent:", []);

  const loadSentMap = (monthKey) => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(window.localStorage.getItem(sentKeyPrefix + monthKey) || "{}") || {};
    } catch {
      return {};
    }
  };

  const markSent = (monthKey, email) => {
    if (typeof window === "undefined") return;
    const map = loadSentMap(monthKey);
    map[String(email || "").toLowerCase()] = true;
    try {
      window.localStorage.setItem(sentKeyPrefix + monthKey, JSON.stringify(map));
    } catch {}
  };

  useEffect(() => {
    setSubject((s) => (s ? s : defaults.subject));
    setBody((b) => (b ? b : defaults.body));
  }, [defaults.body, defaults.subject]);

  const resolveMembersToSend = () => {
    if (bulk) {
      const list = users
        .map((u) => ({ ...u, email: safeEmail(u?.email) }))
        .filter((u) => u.email);
      list.sort((a, b) =>
        label(a).localeCompare(label(b), undefined, { sensitivity: "base", ignorePunctuation: true })
      );
      return list;
    }
    if (!member) return [];
    const email = safeEmail(member?.email);
    if (!email) return [];
    return [{ ...member, email }];
  };

  const writePdfToCache = async (pdfBytes, filename) => {
    const pdfBase64 = uint8ToBase64Safe(pdfBytes);
    const safeName = String(filename || "IndividualReport.pdf").replace(/[^\w.\-()+\s]/g, "_");
    const fileUri = FileSystem.cacheDirectory + safeName;
    await FileSystem.writeAsStringAsync(fileUri, pdfBase64, { encoding: FileSystem.EncodingType.Base64 });
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info?.exists) throw new Error("PDF write failed.");
    return fileUri;
  };

  const downloadBlob = (blob, filename) => {
    if (typeof document === "undefined") return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch {}
    }, 2000);
  };

  const makeNameFilename = (memberName, monthKey) => {
    const base = String(memberName || "Member").trim() || "Member";
    const safe = base.replace(/[^\w\s().,+-]/g, "").replace(/\s+/g, " ").trim();
    const clipped = safe.length > 60 ? safe.slice(0, 60).trim() : safe;
    return `${clipped} (${monthKey}).pdf`;
  };

  const uniquifyFilenames = (names) => {
    const seen = new Map();
    return names.map((n) => {
      const count = (seen.get(n) || 0) + 1;
      seen.set(n, count);
      if (count === 1) return n;
      const extIdx = n.toLowerCase().lastIndexOf(".pdf");
      const base = extIdx > 0 ? n.slice(0, extIdx) : n;
      return `${base} (${count}).pdf`;
    });
  };

  const buildGmailUrl = ({ to, subject: s, body: b }) => {
    return (
      `https://mail.google.com/mail/?view=cm&fs=1` +
      `&to=${encodeURIComponent(String(to || ""))}` +
      `&su=${encodeURIComponent(String(s || ""))}` +
      `&body=${encodeURIComponent(String(b || ""))}`
    );
  };

  const onSend = async () => {
    if (busy) return;

    const recipients = resolveMembersToSend();
    if (recipients.length === 0) {
      return uiAlert("No recipients", bulk ? "No members with an email saved in Firebase (users/<uid>/email)." : "Member email is missing in Firebase (users/<uid>/email).");
    }

    setBusy(true);
    setStage("");
    setWebLinks([]);

    try {
      if (!navigation?.goBack) {
        console.log("[MemberReportSend] navigation missing:", navigation);
      }

      if (Platform.OS === "web") {
        // Web: cannot attach programmatically to Gmail without a server.
        // Workaround: generate PDFs, download a ZIP, and open Gmail drafts (user attaches PDFs manually).
        setStage(`Generating PDFs (${recipients.length})…`);
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        const getJSZip = async () => {
          const mod = await import("jszip");
          return mod?.default || mod;
        };

        const JSZip = await getJSZip();
        const zip = new JSZip();
        const links = [];
        const proposedNames = [];
        const sentMap = loadSentMap(monthKey);

        for (let i = 0; i < recipients.length; i++) {
          if (cancelRef.current.canceled) throw new Error("Canceled");
          const m = recipients[i];
          setStage(`Generating PDF (${i + 1}/${recipients.length})…`);
          const { pdfBytes, model } = await buildMemberReportPdfBytes({
            member: { ...m, __logoUri: logoUri },
            cases,
            anchorDate: now,
          });
          const filename = makeNameFilename(model.memberName || label(m), model.monthKey);
          proposedNames.push(filename);

          // Temporarily store bytes; we will add to ZIP after we ensure uniqueness.
          links.push({
            email: m.email,
            filename,
            pdfBytes,
            gmailUrl: "",
            monthKey: model.monthKey,
            sent: sentMap[String(m.email || "").toLowerCase()] === true,
          });

          const composeBody =
            `${String(body || defaults.body)}\n\n` +
            `Attachment: ${filename}\n` +
            `(Download the ZIP and attach this PDF manually.)`;

          links[links.length - 1].gmailUrl = buildGmailUrl({
            to: m.email,
            subject: String(subject || defaults.subject),
            body: composeBody,
          });
        }

        // Ensure filenames are unique inside the ZIP (avoid overwrite when names collide).
        const uniqueNames = uniquifyFilenames(proposedNames);
        for (let i = 0; i < links.length; i++) {
          links[i].filename = uniqueNames[i];
          zip.file(uniqueNames[i], links[i].pdfBytes);
          delete links[i].pdfBytes;
        }

        setStage("Preparing ZIP download…");
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, `MemberReports_${monthKey}.zip`);
        setWebLinks(links);

        uiAlert(
          "ZIP downloaded",
          "Gmail cannot auto-attach files on web without a server. The ZIP has all PDFs. Use the buttons below to open each Gmail draft, then attach the matching PDF and send."
        );

        setBusy(false);
        setStage("");
        return;
      }

      for (let i = 0; i < recipients.length; i++) {
        if (cancelRef.current.canceled) throw new Error("Canceled");
        const m = recipients[i];
        setStage(`Generating PDF (${i + 1}/${recipients.length})…`);
        const { pdfBytes, model } = await buildMemberReportPdfBytes({
          member: { ...m, __logoUri: logoUri },
          cases,
          anchorDate: new Date(),
        });
        const filename = makeNameFilename(model.memberName || label(m), model.monthKey);
        const fileUri = await writePdfToCache(pdfBytes, filename);

        setStage(`Opening email (${i + 1}/${recipients.length})…`);
        const available = await MailComposer.isAvailableAsync();
        if (!available) throw new Error("Mail services are not available on this device.");

        const result = await MailComposer.composeAsync({
          recipients: [m.email],
          subject: String(subject || defaults.subject),
          body: String(body || defaults.body),
          attachments: [fileUri],
        });
        console.log("[MemberReportSend] compose result:", result);
      }

      uiAlert(
        "Done",
        bulk
          ? `Opened ${recipients.length} separate email drafts (1 per member). Tap Send in your mail app for each.`
          : `Opened an email draft for ${recipients[0].email}. Tap Send in your mail app.`
      );
      navigation?.goBack?.();
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg !== "Canceled") uiAlert("Error", msg);
    } finally {
      setBusy(false);
      setStage("");
    }
  };

  const headerTitle = bulk ? "Send to all members" : member ? `Send to ${label(member)}` : "Send member report";
  const hint = bulk
    ? "Opens 1 separate email per member (reads `users/<uid>/email`)."
    : "Opens an email draft to the member email (`users/<uid>/email`).";

  return (
    <LinearGradient colors={["#05080f", "#090d16", "#05080f"]} style={styles.screen}>
      <View style={styles.topbar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack?.()} activeOpacity={0.85}>
          <Ionicons name="chevron-back" size={18} color="#e2e8f0" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{headerTitle}</Text>
          <Text style={styles.sub} numberOfLines={1}>{hint}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Email content</Text>
          <Text style={styles.label}>Subject</Text>
          <TextInput value={subject} onChangeText={setSubject} style={styles.input} placeholderTextColor="#64748b" />
          <Text style={[styles.label, { marginTop: 10 }]}>Body</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            style={[styles.input, { height: 130, textAlignVertical: "top" }]}
            multiline
            placeholderTextColor="#64748b"
          />
          <Text style={styles.small}>
            Attachment: auto-generated 3-page PDF (cover • summary • recent cases).
          </Text>
        </View>

        <TouchableOpacity style={styles.sendBtn} onPress={onSend} disabled={busy} activeOpacity={0.9}>
          {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={16} color="#fff" />}
          <Text style={styles.sendText}>{busy ? "Sending…" : "Send now"}</Text>
        </TouchableOpacity>

        {busy && stage ? (
          <View style={styles.stageRow}>
            <ActivityIndicator color="#93c5fd" />
            <Text style={styles.stageText}>{stage}</Text>
          </View>
        ) : null}

        {Platform.OS === "web" && webLinks.length ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Gmail drafts</Text>
            <Text style={styles.small}>
              One button per member. After Gmail opens, attach the PDF with the same filename from the downloaded ZIP.
            </Text>
            {webLinks.map((l) => (
              <TouchableOpacity
                key={`${l.email}-${l.filename}`}
                style={[styles.webRow, l.sent ? styles.webRowSent : null]}
                activeOpacity={0.9}
                disabled={l.sent}
                onPress={() => {
                  if (typeof window !== "undefined") {
                    window.open(l.gmailUrl, "_blank");
                    markSent(l.monthKey, l.email);
                    setWebLinks((prev) =>
                      prev.map((x) => (x.email === l.email && x.filename === l.filename ? { ...x, sent: true } : x))
                    );
                  }
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.webRowTitle} numberOfLines={1}>{l.email}</Text>
                  <Text style={styles.webRowSub} numberOfLines={1}>{l.filename}</Text>
                </View>
                <Ionicons name={l.sent ? "checkmark-circle-outline" : "open-outline"} size={18} color={l.sent ? "#22c55e" : "#e2e8f0"} />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </ScrollView>
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
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#182236",
    backgroundColor: "rgba(15,23,42,0.55)",
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: { color: "#e2e8f0", fontWeight: "900", marginBottom: 10 },
  label: { color: "#94a3b8", fontSize: 12, marginBottom: 6 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f2a44",
    backgroundColor: "rgba(2,6,23,0.65)",
    color: "#e2e8f0",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  small: { color: "#64748b", fontSize: 11, marginTop: 10 },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#2563eb",
  },
  sendText: { color: "#fff", fontWeight: "900" },
  stageRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, paddingHorizontal: 6 },
  stageText: { color: "#94a3b8" },
  webRow: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1f2a44",
    backgroundColor: "rgba(2,6,23,0.55)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  webRowSent: {
    borderColor: "rgba(34,197,94,0.45)",
    backgroundColor: "rgba(34,197,94,0.10)",
    opacity: 0.85,
  },
  webRowTitle: { color: "#e2e8f0", fontWeight: "900" },
  webRowSub: { color: "#94a3b8", marginTop: 2, fontSize: 12 },
});
