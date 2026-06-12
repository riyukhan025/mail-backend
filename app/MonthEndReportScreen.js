import { Ionicons } from "@expo/vector-icons";
import { decode as atob, encode as btoa } from "base-64";
import * as FileSystem from "expo-file-system/legacy";
import { LinearGradient } from "expo-linear-gradient";
import * as MailComposer from "expo-mail-composer";
import { PDFDocument } from "pdf-lib";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { BarChart, PieChart } from "react-native-chart-kit";
import ViewShot from "react-native-view-shot";
import firebase from "../firebase";
import { AuthContext } from "./AuthContext";

// Safe Uint8Array -> base64 converter (chunked to avoid call-stack issues)
function uint8ToBase64Safe(u8) {
  const uint8 = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
  const CHUNK_SIZE = 0x8000; // 32KB
  let binary = "";
  for (let i = 0; i < uint8.length; i += CHUNK_SIZE) {
    const sub = uint8.subarray(i, i + CHUNK_SIZE);
    for (let j = 0; j < sub.length; j++) binary += String.fromCharCode(sub[j]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64) {
  const clean = String(base64 || "").includes(",") ? String(base64).split(",").pop() : String(base64 || "");
  const binaryString = atob(clean);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const A4_RATIO = A4_HEIGHT / A4_WIDTH;

const normalizeStatus = (value) => String(value || "").trim().toLowerCase();
const isCompleted = (status) => ["completed", "closed"].includes(status);
const isPending = (status) => ["pending", "open", "assigned"].includes(status);

const getCaseTimestamp = (c) => {
  const v = c?.completedAt || c?.assignedAt || c?.updatedAt || c?.dateInitiated || c?.createdAt || null;
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
};

function GradientButton({ label, onPress, icon, loading, disabled, colors = ["#2563eb", "#38bdf8"] }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled || loading} activeOpacity={0.9} style={{ opacity: disabled ? 0.6 : 1 }}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btn}>
        {loading ? (
          <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
        ) : (
          icon && <Ionicons name={icon} size={18} color="#fff" style={{ marginRight: 8 }} />
        )}
        <Text style={styles.btnText}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function MetricPill({ label, value, color }) {
  return (
    <View style={[styles.metricPill, { borderColor: color + "55" }]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

export default function MonthEndReportScreen({ navigation, embedded = false, cases: casesProp, users: usersProp }) {
  const { user } = useContext(AuthContext);
  const [anchorDate] = useState(() => new Date());
  const [localCases, setLocalCases] = useState([]);
  const [localUsers, setLocalUsers] = useState([]);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");

  const page1Ref = useRef(null);
  const page2Ref = useRef(null);
  const page3Ref = useRef(null);
  const page4Ref = useRef(null);
  const page1WebRef = useRef(null);
  const page2WebRef = useRef(null);
  const page3WebRef = useRef(null);
  const page4WebRef = useRef(null);

  useEffect(() => {
    if (Array.isArray(casesProp)) return;
    const ref = firebase.database().ref("cases");
    const listener = ref.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data).map((key) => ({ id: key, ...data[key] }));
      setLocalCases(list);
    });
    return () => ref.off("value", listener);
  }, [casesProp]);

  useEffect(() => {
    if (Array.isArray(usersProp)) return;
    const ref = firebase.database().ref("users");
    const listener = ref.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data).map((key) => ({ id: key, ...data[key] }));
      setLocalUsers(list);
    });
    return () => ref.off("value", listener);
  }, [usersProp]);

  const cases = Array.isArray(casesProp) ? casesProp : localCases;
  const users = Array.isArray(usersProp) ? usersProp : localUsers;

  const report = useMemo(() => {
    const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const monthEnd = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1);
    const prevStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1);
    const prevEnd = monthStart;

    const monthLabel = anchorDate.toLocaleString(undefined, { month: "long", year: "numeric" });
    const monthKey = `${anchorDate.getFullYear()}-${String(anchorDate.getMonth() + 1).padStart(2, "0")}`;

    const inRange = (d, start, end) => d && d >= start && d < end;
    const monthCases = cases.filter((c) => inRange(getCaseTimestamp(c), monthStart, monthEnd));
    const prevCases = cases.filter((c) => inRange(getCaseTimestamp(c), prevStart, prevEnd));

    const countStatuses = (list) => {
      const out = { completed: 0, pending: 0, reverted: 0, fired: 0, other: 0, total: list.length };
      for (const c of list) {
        const st = normalizeStatus(c?.status);
        if (isCompleted(st)) out.completed++;
        else if (isPending(st)) out.pending++;
        else if (st === "reverted") out.reverted++;
        else if (st === "fired") out.fired++;
        else out.other++;
      }
      return out;
    };

    const thisCounts = countStatuses(monthCases);
    const prevCounts = countStatuses(prevCases);
    const completionRate = thisCounts.total === 0 ? 0 : Math.round((thisCounts.completed / thisCounts.total) * 100);
    const growth = prevCounts.total === 0 ? 100 : Math.round(((thisCounts.total - prevCounts.total) / prevCounts.total) * 100);

    const completedThisMonth = monthCases.filter((c) => isCompleted(normalizeStatus(c?.status)));
    const perf = {};
    for (const c of completedThisMonth) {
      const uid = String(c?.assignedTo || "").trim();
      if (!uid) continue;
      perf[uid] = (perf[uid] || 0) + 1;
    }
    let topUid = null;
    let topCompleted = 0;
    for (const [uid, count] of Object.entries(perf)) {
      if (count > topCompleted) {
        topCompleted = count;
        topUid = uid;
      }
    }

    const topUser = topUid ? users.find((u) => String(u?.id) === String(topUid)) : null;
    const topName = topUser?.name || topUser?.fullName || topUser?.email || (topUid ? `User ${topUid}` : "N/A");
    const topPhoto = topUser?.photoURL || topUser?.photoUrl || topUser?.avatar || null;

    const topUserCases = topUid ? monthCases.filter((c) => String(c?.assignedTo || "") === String(topUid)) : [];
    const districtCounts = {};
    for (const c of topUserCases) {
      const d = String(c?.district || c?.city || c?.state || "").trim();
      if (!d) continue;
      districtCounts[d] = (districtCounts[d] || 0) + 1;
    }
    const topDistricts = Object.entries(districtCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name]) => name);

    const activeUsers30d = users.filter((u) => {
      const seen = u?.lastSeen ? new Date(u.lastSeen) : null;
      const ts = seen && Number.isFinite(seen.getTime()) ? seen.getTime() : 0;
      return ts && Date.now() - ts < 30 * 24 * 60 * 60 * 1000;
    }).length;

    return {
      monthLabel,
      monthKey,
      generatedAt: anchorDate,
      thisCounts,
      prevCounts,
      completionRate,
      growth,
      top: {
        uid: topUid,
        completed: topCompleted,
        name: topName,
        photo: topPhoto,
        districts: topDistricts,
        totalCases: topUserCases.length,
      },
      activeUsers30d,
    };
  }, [anchorDate, cases, users]);

  const preview = useMemo(() => {
    const screenWidth = Dimensions.get("window").width;
    const width = Math.min(screenWidth - 32, 430);
    const height = Math.round(width * A4_RATIO);
    return { width, height, innerWidth: width - 28 };
  }, []);

  const pieData = useMemo(() => {
    const c = report.thisCounts;
    const rows = [
      { name: "Completed", population: c.completed, color: "#22c55e" },
      { name: "Pending", population: c.pending, color: "#f59e0b" },
      { name: "Reverted", population: c.reverted, color: "#ef4444" },
      { name: "Fired", population: c.fired, color: "#a855f7" },
    ];
    const other = c.other;
    if (other > 0) rows.push({ name: "Other", population: other, color: "#64748b" });
    return rows.map((r) => ({ ...r, legendFontColor: "#0f172a", legendFontSize: 11 }));
  }, [report.thisCounts]);

  const barData = useMemo(
    () => ({
      labels: ["Prev", "This"],
      datasets: [{ data: [report.prevCounts.completed, report.thisCounts.completed] }],
    }),
    [report.prevCounts.completed, report.thisCounts.completed]
  );

  const chartConfig = useMemo(
    () => ({
      backgroundGradientFrom: "#ffffff",
      backgroundGradientTo: "#ffffff",
      decimalPlaces: 0,
      color: (opacity = 1) => `rgba(37,99,235,${opacity})`,
      labelColor: () => "#0f172a",
      propsForDots: { r: "0" },
      barPercentage: 0.5,
    }),
    []
  );

  const ensureReadyDelay = async () => new Promise((r) => setTimeout(r, 250));

  const notify = (title, message) => {
    if (Platform.OS === "web") {
      alert(`${title}\n\n${message}`);
      return;
    }
    Alert.alert(title, message);
  };

  const buildPdfBytes = async () => {
    if (Platform.OS === "web") {
      const getHtml2Canvas = async () => {
        const mod = await import("html2canvas");
        return mod?.default || mod;
      };

      const captureWebElementAsPngDataUrl = async (el, label) => {
        if (!el) throw new Error(`Capture ref missing (${label})`);
        setStage(`Capturing ${label}...`);
        await ensureReadyDelay();
        const html2canvas = await getHtml2Canvas();
        const canvas = await html2canvas(el, {
          backgroundColor: "#ffffff",
          useCORS: true,
          allowTaint: true,
          scale: 2,
          logging: false,
        });
        return canvas.toDataURL("image/png");
      };

      const p1 = await captureWebElementAsPngDataUrl(page1WebRef.current, "Page 1/4");
      const p2 = await captureWebElementAsPngDataUrl(page2WebRef.current, "Page 2/4");
      const p3 = await captureWebElementAsPngDataUrl(page3WebRef.current, "Page 3/4");
      const p4 = await captureWebElementAsPngDataUrl(page4WebRef.current, "Page 4/4");

      setStage("Building PDF...");
      const pdfDoc = await PDFDocument.create();

      const addImagePage = async (dataUrl) => {
        const bytes = base64ToUint8Array(dataUrl);
        const img = await pdfDoc.embedPng(bytes);
        const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
        const dims = img.scaleToFit(A4_WIDTH, A4_HEIGHT);
        page.drawImage(img, {
          x: (A4_WIDTH - dims.width) / 2,
          y: (A4_HEIGHT - dims.height) / 2,
          width: dims.width,
          height: dims.height,
        });
      };

      await addImagePage(p1);
      await addImagePage(p2);
      await addImagePage(p3);
      await addImagePage(p4);

      return await pdfDoc.save();
    }

    // Mobile/native: Build PDF from ViewShot captures.

    const capture = async (ref, label) => {
      if (!ref?.current?.capture) throw new Error(`Capture ref missing (${label})`);
      setStage(`Capturing ${label}...`);
      await ensureReadyDelay();
      const b64 = await ref.current.capture();
      if (!b64) throw new Error(`Capture failed (${label})`);
      return b64;
    };

    const p1 = await capture(page1Ref, "Page 1/4");
    const p2 = await capture(page2Ref, "Page 2/4");
    const p3 = await capture(page3Ref, "Page 3/4");
    const p4 = await capture(page4Ref, "Page 4/4");

    setStage("Building PDF...");
    const pdfDoc = await PDFDocument.create();

    const addImagePage = async (b64) => {
      const bytes = base64ToUint8Array(b64);
      const img = await pdfDoc.embedPng(bytes);
      const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
      const dims = img.scaleToFit(A4_WIDTH, A4_HEIGHT);
      page.drawImage(img, {
        x: (A4_WIDTH - dims.width) / 2,
        y: (A4_HEIGHT - dims.height) / 2,
        width: dims.width,
        height: dims.height,
      });
    };

    await addImagePage(p1);
    await addImagePage(p2);
    await addImagePage(p3);
    await addImagePage(p4);

    return await pdfDoc.save();
  };

  const generatePdfAttachment = async () => {
    const pdfBytes = await buildPdfBytes();
    const filename = `SpaceSolutions_MonthEnd_${report.monthKey}_${Date.now()}.pdf`;

    if (Platform.OS === "web") {
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      return { filename, url };
    }

    const pdfBase64 = uint8ToBase64Safe(pdfBytes);
    const fileUri = FileSystem.cacheDirectory + filename;
    await FileSystem.writeAsStringAsync(fileUri, pdfBase64, { encoding: FileSystem.EncodingType.Base64 });
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info?.exists) throw new Error("PDF write failed.");
    return { fileUri, filename };
  };

  const handleSend = async () => {
    if (busy) return;
    const recipients = String(to || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (recipients.length === 0) return notify("Missing email", "Enter at least one recipient email (comma separated).");

    setBusy(true);
    setStage("");
    try {
      const subject = `Space Solutions - Month End Report (${report.monthLabel})`;
      const body =
        `Hi,\n\n` +
        `Please find the Space Solutions month end report for ${report.monthLabel}.\n\n` +
        `Regards,\n` +
        `${user?.name || "Space Solutions"}`;

      if (Platform.OS === "web") {
        const { filename, url } = await generatePdfAttachment();
        setStage("Downloading PDF...");

        if (typeof document !== "undefined") {
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }

        setStage("Opening Gmail draft...");
        if (typeof window !== "undefined") {
          const gmailUrl =
            `https://mail.google.com/mail/?view=cm&fs=1` +
            `&to=${encodeURIComponent(recipients.join(","))}` +
            `&su=${encodeURIComponent(subject)}` +
            `&body=${encodeURIComponent(body + `\n\nPDF generated: ${filename}\n(Attach the downloaded file.)`)}`;
          window.open(gmailUrl, "_blank");
        }

        notify("PDF Generated", "PDF downloaded. Gmail draft opened — attach the PDF file and send.");
        try {
          URL.revokeObjectURL(url);
        } catch {}
        return;
      }

      const { fileUri } = await generatePdfAttachment();
      setStage("Opening email...");

      const available = await MailComposer.isAvailableAsync();
      if (!available) {
        return notify("Mail not available", "Mail services are not available on this device.");
      }

      await MailComposer.composeAsync({
        recipients,
        subject,
        body,
        attachments: [fileUri],
      });
    } catch (e) {
      const msg = String(e?.message || e);
      notify("Error", msg);
    } finally {
      setBusy(false);
      setStage("");
    }
  };

  const CoverPage = () => (
    <LinearGradient colors={["#0ea5e9", "#6366f1", "#ec4899"]} style={styles.pageFill}>
      <View style={styles.pagePadding}>
        <View style={styles.coverTopRow}>
          <View style={styles.brandMark}>
            <Ionicons name="planet-outline" size={22} color="#0f172a" />
          </View>
          <Text style={styles.coverBrand}>Space Solutions</Text>
        </View>

        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text style={styles.coverTitle}>Month End Report</Text>
          <Text style={styles.coverSubtitle}>{report.monthLabel}</Text>
          <View style={styles.coverDivider} />
          <Text style={styles.coverMeta}>Generated: {report.generatedAt.toLocaleString()}</Text>
        </View>

        <View style={styles.coverFooter}>
          <Text style={styles.coverFooterText}>Operational KPIs • Performance • Team Highlights</Text>
        </View>
      </View>
    </LinearGradient>
  );

  const ChartsPage = () => (
    <LinearGradient colors={["#ffffff", "#f1f5f9"]} style={styles.pageFill}>
      <View style={styles.pagePadding}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitleDark}>Performance Overview</Text>
          <Text style={styles.pageSubDark}>This month vs previous month</Text>
        </View>

        <View style={styles.pillRow}>
          <MetricPill label="Total Cases" value={String(report.thisCounts.total)} color="#2563eb" />
          <MetricPill label="Completed" value={String(report.thisCounts.completed)} color="#22c55e" />
          <MetricPill label="Pending" value={String(report.thisCounts.pending)} color="#f59e0b" />
          <MetricPill label="Completion" value={`${report.completionRate}%`} color="#0ea5e9" />
        </View>

        <View style={styles.chartBlock}>
          <Text style={styles.blockTitleDark}>Status Split (Pie)</Text>
          <PieChart
            data={pieData}
            width={preview.innerWidth}
            height={170}
            chartConfig={chartConfig}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="10"
            absolute
            hasLegend
          />
        </View>

        <View style={[styles.chartBlock, { marginTop: 10 }]}>
          <Text style={styles.blockTitleDark}>Completed Cases (Bar)</Text>
          <BarChart
            data={barData}
            width={preview.innerWidth}
            height={200}
            chartConfig={chartConfig}
            fromZero
            showValuesOnTopOfBars
            withInnerLines
            yAxisLabel=""
            yAxisSuffix=""
            style={{ borderRadius: 12 }}
          />
        </View>

        <View style={styles.noteBox}>
          <Ionicons name="sparkles-outline" size={16} color="#2563eb" />
          <Text style={styles.noteText}>
            Growth: <Text style={{ fontWeight: "800" }}>{report.growth}%</Text> • Previous month total:{" "}
            <Text style={{ fontWeight: "800" }}>{report.prevCounts.total}</Text>
          </Text>
        </View>
      </View>
    </LinearGradient>
  );

  const TopPerformerPage = () => (
    <LinearGradient colors={["#0b1220", "#111b33"]} style={styles.pageFill}>
      <View style={styles.pagePadding}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitleLight}>Top Performer</Text>
          <Text style={styles.pageSubLight}>Based on completed cases this month</Text>
        </View>

        <View style={styles.performerCard}>
          <View style={styles.performerRow}>
            {report.top.photo ? (
              <Image source={{ uri: report.top.photo }} style={styles.performerAvatar} />
            ) : (
              <View style={[styles.performerAvatar, styles.performerAvatarFallback]}>
                <Ionicons name="person-outline" size={34} color="#94a3b8" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.performerName} numberOfLines={1}>{report.top.name}</Text>
              <Text style={styles.performerMeta}>
                Completed this month: <Text style={{ fontWeight: "800", color: "#86efac" }}>{report.top.completed}</Text>
              </Text>
              <Text style={styles.performerMeta}>
                Total handled: <Text style={{ fontWeight: "800" }}>{report.top.totalCases}</Text>
              </Text>
            </View>
          </View>

          <View style={styles.districtBox}>
            <Text style={styles.districtTitle}>Districts Covered</Text>
            <View style={styles.districtRow}>
              {(report.top.districts.length ? report.top.districts : ["N/A"]).map((d) => (
                <View key={d} style={styles.districtChip}>
                  <Text style={styles.districtChipText} numberOfLines={1}>{d}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.lightRow}>
          <View style={[styles.lightCard, { borderColor: "rgba(34,197,94,0.35)" }]}>
            <Text style={styles.lightCardLabel}>Completed</Text>
            <Text style={[styles.lightCardValue, { color: "#22c55e" }]}>{report.thisCounts.completed}</Text>
          </View>
          <View style={[styles.lightCard, { borderColor: "rgba(245,158,11,0.35)" }]}>
            <Text style={styles.lightCardLabel}>Pending</Text>
            <Text style={[styles.lightCardValue, { color: "#f59e0b" }]}>{report.thisCounts.pending}</Text>
          </View>
          <View style={[styles.lightCard, { borderColor: "rgba(239,68,68,0.35)" }]}>
            <Text style={styles.lightCardLabel}>Reverted</Text>
            <Text style={[styles.lightCardValue, { color: "#ef4444" }]}>{report.thisCounts.reverted}</Text>
          </View>
          <View style={[styles.lightCard, { borderColor: "rgba(168,85,247,0.35)" }]}>
            <Text style={styles.lightCardLabel}>Fired</Text>
            <Text style={[styles.lightCardValue, { color: "#a855f7" }]}>{report.thisCounts.fired}</Text>
          </View>
        </View>

        <View style={styles.quoteBox}>
          <Text style={styles.quoteText}>
            “Consistency beats intensity. Great work from the field team — keep the momentum.”
          </Text>
        </View>
      </View>
    </LinearGradient>
  );

  const CompanyPage = () => (
    <LinearGradient colors={["#0ea5e9", "#22c55e"]} style={styles.pageFill}>
      <View style={styles.pagePadding}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitleLight}>Innovation & Company Stats</Text>
          <Text style={styles.pageSubLight}>Highlights for {report.monthLabel}</Text>
        </View>

        <View style={styles.companyGrid}>
          <View style={styles.companyCard}>
            <Ionicons name="briefcase-outline" size={18} color="#0f172a" />
            <Text style={styles.companyCardLabel}>Total Cases</Text>
            <Text style={styles.companyCardValue}>{report.thisCounts.total}</Text>
          </View>
          <View style={styles.companyCard}>
            <Ionicons name="checkmark-done-outline" size={18} color="#0f172a" />
            <Text style={styles.companyCardLabel}>Completion Rate</Text>
            <Text style={styles.companyCardValue}>{report.completionRate}%</Text>
          </View>
          <View style={styles.companyCard}>
            <Ionicons name="people-outline" size={18} color="#0f172a" />
            <Text style={styles.companyCardLabel}>Active Users (30d)</Text>
            <Text style={styles.companyCardValue}>{report.activeUsers30d}</Text>
          </View>
          <View style={styles.companyCard}>
            <Ionicons name="trending-up-outline" size={18} color="#0f172a" />
            <Text style={styles.companyCardLabel}>MoM Growth</Text>
            <Text style={styles.companyCardValue}>{report.growth}%</Text>
          </View>
        </View>

        <View style={styles.initiativesCard}>
          <Text style={styles.initiativesTitle}>This Month’s Focus</Text>
          <View style={styles.initiativeRow}>
            <Ionicons name="flash-outline" size={16} color="#0f172a" />
            <Text style={styles.initiativeText}>Faster turnaround on pending backlog with smart routing.</Text>
          </View>
          <View style={styles.initiativeRow}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#0f172a" />
            <Text style={styles.initiativeText}>Quality checks tightened to reduce reversals.</Text>
          </View>
          <View style={styles.initiativeRow}>
            <Ionicons name="bulb-outline" size={16} color="#0f172a" />
            <Text style={styles.initiativeText}>Pilot “city heatmap” insights for coverage planning.</Text>
          </View>
        </View>

        <View style={styles.footerStamp}>
          <Text style={styles.footerStampText}>Space Solutions • {report.monthLabel}</Text>
        </View>
      </View>
    </LinearGradient>
  );

  return (
    <LinearGradient colors={["#020617", "#0b1220"]} style={styles.container}>
      {!embedded && (
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#e2e8f0" />
          </TouchableOpacity>
          <Text style={styles.title}>Month End PDF</Text>
          <View style={{ width: 36 }} />
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Email Report</Text>
          <Text style={styles.cardHint}>Enter recipients and tap “Generate & Email PDF”.</Text>
          {Platform.OS === "web" ? (
            <Text style={styles.cardHint}>Downloads the PDF and opens Gmail with subject/body filled. Attach the PDF manually.</Text>
          ) : null}
          <TextInput
            value={to}
            onChangeText={setTo}
            placeholder="example@domain.com, other@domain.com"
            placeholderTextColor="#64748b"
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <GradientButton
            label={busy ? (stage || "Working...") : Platform.OS === "web" ? "Download & Open Email" : "Generate & Email PDF"}
            icon="mail-outline"
            onPress={handleSend}
            loading={busy}
            disabled={busy}
            colors={["#22c55e", "#16a34a"]}
          />

          {stage ? <Text style={styles.stageText}>{stage}</Text> : null}
        </View>

        <Text style={styles.sectionTitle}>Preview (4 pages)</Text>

        <View style={{ gap: 14, alignItems: "center" }}>
          {Platform.OS === "web" ? (
            <>
              <View ref={page1WebRef} style={[styles.viewShot, { width: preview.width, height: preview.height }]}>
                <CoverPage />
              </View>
              <View ref={page2WebRef} style={[styles.viewShot, { width: preview.width, height: preview.height }]}>
                <ChartsPage />
              </View>
              <View ref={page3WebRef} style={[styles.viewShot, { width: preview.width, height: preview.height }]}>
                <TopPerformerPage />
              </View>
              <View ref={page4WebRef} style={[styles.viewShot, { width: preview.width, height: preview.height }]}>
                <CompanyPage />
              </View>
            </>
          ) : (
            <>
              <ViewShot ref={page1Ref} options={{ format: "png", quality: 1, result: "base64" }} style={[styles.viewShot, { width: preview.width, height: preview.height }]}>
                <CoverPage />
              </ViewShot>
              <ViewShot ref={page2Ref} options={{ format: "png", quality: 1, result: "base64" }} style={[styles.viewShot, { width: preview.width, height: preview.height }]}>
                <ChartsPage />
              </ViewShot>
              <ViewShot ref={page3Ref} options={{ format: "png", quality: 1, result: "base64" }} style={[styles.viewShot, { width: preview.width, height: preview.height }]}>
                <TopPerformerPage />
              </ViewShot>
              <ViewShot ref={page4Ref} options={{ format: "png", quality: 1, result: "base64" }} style={[styles.viewShot, { width: preview.width, height: preview.height }]}>
                <CompanyPage />
              </ViewShot>
            </>
          )}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 42,
    paddingBottom: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.16)",
  },
  title: { color: "#e2e8f0", fontSize: 16, fontWeight: "800" },
  content: { padding: 14, paddingBottom: 40 },
  card: {
    backgroundColor: "rgba(15,23,42,0.7)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.16)",
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  cardTitle: { color: "#f8fafc", fontSize: 15, fontWeight: "800" },
  cardHint: { color: "#94a3b8", fontSize: 12, marginTop: 6, marginBottom: 10 },
  input: {
    backgroundColor: "rgba(2,6,23,0.65)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.16)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#e2e8f0",
    marginBottom: 12,
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  stageText: { color: "#94a3b8", fontSize: 11, marginTop: 10 },
  sectionTitle: { color: "#e2e8f0", fontSize: 13, fontWeight: "800", marginBottom: 10 },
  viewShot: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
  },

  pageFill: { flex: 1 },
  pagePadding: { flex: 1, padding: 14 },
  pageHeader: { marginBottom: 10 },
  pageTitleLight: { color: "#f8fafc", fontSize: 18, fontWeight: "900" },
  pageSubLight: { color: "rgba(226,232,240,0.85)", fontSize: 12, marginTop: 2 },
  pageTitleDark: { color: "#0f172a", fontSize: 18, fontWeight: "900" },
  pageSubDark: { color: "#334155", fontSize: 12, marginTop: 2 },

  coverTopRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.78)",
    alignItems: "center",
    justifyContent: "center",
  },
  coverBrand: { color: "#0f172a", fontWeight: "900", fontSize: 16, letterSpacing: 0.5 },
  coverTitle: { color: "#0f172a", fontWeight: "900", fontSize: 30, marginTop: 18 },
  coverSubtitle: { color: "rgba(15,23,42,0.85)", fontWeight: "800", fontSize: 16, marginTop: 6 },
  coverDivider: { height: 3, width: 62, backgroundColor: "rgba(15,23,42,0.75)", borderRadius: 2, marginTop: 14 },
  coverMeta: { color: "rgba(15,23,42,0.8)", fontSize: 12, marginTop: 10, fontWeight: "700" },
  coverFooter: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.12)",
  },
  coverFooterText: { color: "rgba(15,23,42,0.85)", fontWeight: "800", fontSize: 11, textAlign: "center" },

  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  metricPill: {
    flexGrow: 1,
    minWidth: 96,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
  },
  metricLabel: { color: "#334155", fontSize: 10, fontWeight: "800" },
  metricValue: { marginTop: 4, fontSize: 16, fontWeight: "900" },
  chartBlock: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
  },
  blockTitleDark: { color: "#0f172a", fontSize: 12, fontWeight: "900", marginBottom: 6 },
  noteBox: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    backgroundColor: "rgba(37,99,235,0.10)",
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.18)",
  },
  noteText: { color: "#0f172a", fontSize: 11, fontWeight: "700", flex: 1 },

  performerCard: {
    borderRadius: 16,
    padding: 12,
    backgroundColor: "rgba(2,6,23,0.55)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
  },
  performerRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  performerAvatar: { width: 58, height: 58, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)" },
  performerAvatarFallback: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(148,163,184,0.20)" },
  performerName: { color: "#f8fafc", fontSize: 16, fontWeight: "900" },
  performerMeta: { color: "#cbd5e1", fontSize: 12, marginTop: 2 },
  districtBox: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(148,163,184,0.16)" },
  districtTitle: { color: "#94a3b8", fontSize: 11, fontWeight: "900", marginBottom: 6 },
  districtRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  districtChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(59,130,246,0.15)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.25)",
    maxWidth: 150,
  },
  districtChipText: { color: "#dbeafe", fontSize: 11, fontWeight: "800" },
  lightRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  lightCard: {
    flexGrow: 1,
    minWidth: 100,
    padding: 10,
    borderRadius: 14,
    backgroundColor: "rgba(2,6,23,0.45)",
    borderWidth: 1,
  },
  lightCardLabel: { color: "#94a3b8", fontSize: 10, fontWeight: "900" },
  lightCardValue: { marginTop: 6, fontSize: 18, fontWeight: "900" },
  quoteBox: {
    marginTop: 10,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.14)",
  },
  quoteText: { color: "#e2e8f0", fontSize: 12, fontWeight: "700", lineHeight: 17 },

  companyGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  companyCard: {
    width: "48%",
    borderRadius: 16,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.75)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.12)",
  },
  companyCardLabel: { color: "rgba(15,23,42,0.72)", fontSize: 10, fontWeight: "900", marginTop: 8 },
  companyCardValue: { color: "#0f172a", fontSize: 22, fontWeight: "900", marginTop: 4 },
  initiativesCard: {
    marginTop: 12,
    borderRadius: 18,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.12)",
  },
  initiativesTitle: { color: "#0f172a", fontSize: 13, fontWeight: "900", marginBottom: 10 },
  initiativeRow: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 8 },
  initiativeText: { color: "rgba(15,23,42,0.82)", fontSize: 11, fontWeight: "800", flex: 1 },
  footerStamp: { marginTop: 12, padding: 12, borderRadius: 16, backgroundColor: "rgba(15,23,42,0.18)" },
  footerStampText: { color: "rgba(15,23,42,0.9)", fontSize: 11, fontWeight: "900", textAlign: "center" },
});
