import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import {
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import firebase from "../firebase";

const DEFAULT_CONFIG = {
  initialDelayMinutes: 15,
  retryDelayMinutes: 15,
  maxAttempts: 3,
  whatsappEnabled: true,
};

const formatDate = (value) => {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
};

const dedupeWorkflowByCase = (items = []) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item?.caseId || item?.id || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const NEGATIVE_KEYWORDS = [
  "fraud",
  "bribe",
  "bribery",
  "misconduct",
  "harassment",
  "unsafe",
  "bad experience",
  "not good",
  "poor service",
  "rude",
  "cheat",
  "fake",
  "pressure",
  "scam",
  "unprofessional",
  "angry",
  "complaint",
  "dissatisfied",
  "unsafe",
  "problem",
  "issue",
  "delay",
  "not satisfied",
  "very bad",
  "terrible",
  "worse",
  "disappointed",
  "refund",
  "corrupt",
  "unfair",
  "ignored",
  "late",
  "never",
  "no response",
  "ignored",
  "demand",
  "threat",
  "abuse",
];

const POSITIVE_KEYWORDS = [
  "good",
  "great",
  "excellent",
  "satisfied",
  "happy",
  "professional",
  "smooth",
  "friendly",
  "helpful",
  "safe",
  "nice",
  "thankful",
  "supportive",
  "positive",
  "fair",
  "on time",
  "respectful",
  "satisfactory",
  "fine",
  "okay",
];

const analyzeResponseText = (transcript = "", existingSummary = "") => {
  const normalizedText = String(transcript || existingSummary || "").toLowerCase();
  const detectedNegative = NEGATIVE_KEYWORDS.filter((keyword) => normalizedText.includes(keyword));
  const detectedPositive = POSITIVE_KEYWORDS.filter((keyword) => normalizedText.includes(keyword));
  const isNegative = detectedNegative.length > 0;

  let status = "Feedback received";
  let summary = existingSummary || "No immediate concerns detected in the response.";
  let aiFlags = [];

  if (!normalizedText.trim()) {
    status = "Pending response";
    summary = "No spoken response has been captured yet.";
  } else if (isNegative) {
    status = "Needs review";
    summary = `Negative sentiment detected: ${detectedNegative.slice(0, 3).join(", ")}. Manual review recommended.`;
    aiFlags = detectedNegative.slice(0, 4).map((word) => word.replace(/\b\w/g, (char) => char.toUpperCase()));
  } else if (detectedPositive.length > 0) {
    status = "Feedback received";
    summary = `Positive feedback detected: ${detectedPositive.slice(0, 3).join(", ")}.`;
    aiFlags = [];
  } else {
    status = "Pending review";
    summary = "Response captured but no strong sentiment signal was detected.";
  }

  return {
    isNegative,
    status,
    summary,
    aiFlags,
  };
};

const buildAutoTranscript = (caseItem = {}) => {
  const autoText = [
    caseItem.feedbackTranscript,
    caseItem.transcript,
    caseItem.callNotes,
    caseItem.response,
    caseItem.candidateResponse,
    caseItem.feedback,
    caseItem.responseNote,
    caseItem.notes,
    caseItem.comment,
    caseItem.adminNote,
  ].find((value) => typeof value === "string" && value.trim());

  if (autoText && autoText.trim()) {
    return autoText.trim();
  }

  return `Auto-saved follow-up response for case ${caseItem.id || "unknown"}. No candidate feedback has been submitted yet, but the workflow record is active and visible to admin review.`;
};

export default function PostCompletionFeedbackScreen({ navigation }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [dbWorkflows, setDbWorkflows] = useState([]);
  const [responseCapture, setResponseCapture] = useState({
    caseId: "",
    transcript: "",
  });
  const [filters, setFilters] = useState({
    caseId: "",
    candidate: "",
    executive: "",
    date: "",
    status: "",
  });

  useEffect(() => {
    const workflowsRef = firebase.database().ref("postCompletionFeedbackWorkflows");
    const workflowListener = workflowsRef.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data)
        .map((key) => ({ id: key, ...data[key] }))
        .filter((item) => item && item.caseId);
      setDbWorkflows(list);
    });

    return () => workflowsRef.off("value", workflowListener);
  }, []);

  useEffect(() => {
    const casesRef = firebase.database().ref("cases");
    const handleCases = async (snapshot) => {
      const data = snapshot.val() || {};
      const completedCases = Object.keys(data)
        .map((key) => ({ id: key, ...data[key] }))
        .filter((item) => String(item?.status || "").toLowerCase() === "completed");

      for (const caseItem of completedCases) {
        const workflowRef = firebase.database().ref(`postCompletionFeedbackWorkflows/${caseItem.id}`);
        const existingWorkflow = await workflowRef.once("value");

        if (existingWorkflow.exists()) {
          const existingValue = existingWorkflow.val() || {};
          const transcript = existingValue.transcript || buildAutoTranscript(caseItem);

          if (!existingValue.transcript) {
            await workflowRef.update({
              transcript,
              aiSummary: analyzeResponseText(transcript, existingValue.aiSummary || "").summary,
              aiFlags: analyzeResponseText(transcript, existingValue.aiSummary || "").aiFlags,
              status: analyzeResponseText(transcript, existingValue.aiSummary || "").isNegative ? "Needs review" : (existingValue.status || "Scheduled"),
              lastOutcome: "Auto-saved response",
              followUpPending: analyzeResponseText(transcript, existingValue.aiSummary || "").isNegative,
              updatedAt: Date.now(),
            });
          }
          continue;
        }

        const autoTranscript = buildAutoTranscript(caseItem);
        const initialAnalysis = analyzeResponseText(autoTranscript, "");

        const workflow = {
          id: caseItem.id,
          caseId: caseItem.id,
          candidateName: caseItem.candidateName || caseItem.name || `Candidate ${caseItem.id}`,
          fieldExecutive: caseItem.fieldExecutive || caseItem.assignedToName || caseItem.assignedTo || "Unassigned",
          status: initialAnalysis.isNegative ? "Needs review" : "Scheduled",
          date: formatDate(new Date()),
          callAttempts: 0,
          lastOutcome: "Auto-saved response",
          duration: "00:00",
          transcript: autoTranscript,
          aiSummary: initialAnalysis.summary,
          aiFlags: initialAnalysis.aiFlags,
          followUpPending: initialAnalysis.isNegative,
          createdAt: Date.now(),
          initialDelayMinutes: config.initialDelayMinutes,
          retryDelayMinutes: config.retryDelayMinutes,
          maxAttempts: config.maxAttempts,
          whatsappEnabled: config.whatsappEnabled,
        };

        await workflowRef.set(workflow);
      }
    };

    const caseListener = casesRef.on("value", handleCases);
    return () => casesRef.off("value", caseListener);
  }, [config.initialDelayMinutes, config.retryDelayMinutes, config.maxAttempts, config.whatsappEnabled]);

  const workflows = useMemo(() => dedupeWorkflowByCase(dbWorkflows), [dbWorkflows]);

  const filteredWorkflows = useMemo(() => {
    return workflows.filter((item) => {
      const caseMatch = !filters.caseId || item.caseId.toLowerCase().includes(filters.caseId.toLowerCase());
      const candidateMatch = !filters.candidate || item.candidateName.toLowerCase().includes(filters.candidate.toLowerCase());
      const executiveMatch = !filters.executive || item.fieldExecutive.toLowerCase().includes(filters.executive.toLowerCase());
      const dateMatch = !filters.date || item.date.includes(filters.date);
      const statusMatch = !filters.status || item.status.toLowerCase().includes(filters.status.toLowerCase());
      return caseMatch && candidateMatch && executiveMatch && dateMatch && statusMatch;
    });
  }, [filters, workflows]);

  const summary = useMemo(() => {
    const completed = workflows.length;
    const feedbackReceived = workflows.filter((item) => {
      const analysis = analyzeResponseText(item.transcript || item.aiSummary, item.aiSummary);
      return analysis.status === "Feedback received";
    }).length;
    const pendingResponses = workflows.filter((item) => {
      const analysis = analyzeResponseText(item.transcript || item.aiSummary, item.aiSummary);
      return analysis.status === "Pending response" || analysis.status === "Pending review" || analysis.status === "Scheduled";
    }).length;
    const requiresReview = workflows.filter((item) => {
      const analysis = analyzeResponseText(item.transcript || item.aiSummary, item.aiSummary);
      return analysis.isNegative || analysis.status === "Needs review";
    }).length;

    return {
      completed,
      feedbackReceived,
      pendingResponses,
      requiresReview,
    };
  }, [workflows]);

  const updateConfig = (key, value) => {
    setConfig((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const saveResponseToWorkflow = async () => {
    const caseId = String(responseCapture.caseId || "").trim();
    const transcript = String(responseCapture.transcript || "").trim();

    if (!caseId) {
      return;
    }

    const workflowRef = firebase.database().ref(`postCompletionFeedbackWorkflows/${caseId}`);
    const snapshot = await workflowRef.once("value");
    const existing = snapshot.val() || {};
    const finalTranscript = transcript || existing.transcript || buildAutoTranscript({ id: caseId, ...existing });
    const aiResult = analyzeResponseText(finalTranscript, existing.aiSummary || "");

    const updatedWorkflow = {
      ...existing,
      id: caseId,
      caseId,
      candidateName: existing.candidateName || existing.name || `Candidate ${caseId}`,
      fieldExecutive: existing.fieldExecutive || existing.assignedToName || existing.assignedTo || "Unassigned",
      transcript: finalTranscript,
      status: aiResult.isNegative ? "Needs review" : (aiResult.status || existing.status || "Feedback received"),
      aiSummary: aiResult.summary,
      aiFlags: aiResult.aiFlags,
      lastOutcome: aiResult.isNegative ? "Negative response" : "Auto-saved response",
      callAttempts: Number(existing.callAttempts || 0) + 1,
      followUpPending: aiResult.isNegative,
      date: existing.date || formatDate(new Date()),
      updatedAt: Date.now(),
    };

    await workflowRef.set(updatedWorkflow);
    setResponseCapture({ caseId: "", transcript: "" });
  };

  return (
    <LinearGradient colors={["#050b16", "#0f172a", "#1e1b4b", "#111827"]} style={styles.screen}>
      <View style={styles.phoneFrame}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.telemetryHeader}>
            <View style={styles.signalGroup}>
              <View style={styles.signalDot} />
              <View style={styles.signalDot} />
              <View style={styles.signalDot} />
            </View>
            <Text style={styles.telemetryText}>LIVE CALL AI</Text>
            <View style={styles.signalBadge}>
              <Ionicons name="radio" size={12} color="#a7f3d0" />
            </View>
          </View>

          <View style={styles.headerRow}>
            <View style={styles.titleWrap}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => navigation && navigation.goBack ? navigation.goBack() : undefined}
              >
                <Ionicons name="arrow-back" size={20} color="#e2e8f0" />
              </TouchableOpacity>
              <View>
                <Text style={styles.eyebrow}>Admin Call Monitor</Text>
                <Text style={styles.title}>Post-Completion Feedback Monitor</Text>
              </View>
            </View>
            <View style={styles.statusPill}>
              <Ionicons name="checkmark-circle" size={15} color="#22c55e" />
              <Text style={styles.statusPillText}>Workflow live</Text>
            </View>
          </View>

          <View style={styles.summaryGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Completed cases</Text>
          <Text style={styles.statValue}>{summary.completed}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Feedback received</Text>
          <Text style={styles.statValue}>{summary.feedbackReceived}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Pending responses</Text>
          <Text style={styles.statValue}>{summary.pendingResponses}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Requires review</Text>
          <Text style={styles.statValue}>{summary.requiresReview}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Workflow configuration</Text>
          <Ionicons name="settings-outline" size={18} color="#8b5cf6" />
        </View>

        <View style={styles.configGrid}>
          <View style={styles.fieldRow}>
            <Text style={styles.label}>Initial delay (mins)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={String(config.initialDelayMinutes)}
              onChangeText={(value) => updateConfig("initialDelayMinutes", Number(value || 0))}
            />
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.label}>Retry interval (mins)</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={String(config.retryDelayMinutes)}
              onChangeText={(value) => updateConfig("retryDelayMinutes", Number(value || 0))}
            />
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.label}>Max attempts</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={String(config.maxAttempts)}
              onChangeText={(value) => updateConfig("maxAttempts", Number(value || 0))}
            />
          </View>

          <View style={styles.fieldRow}>
            <Text style={styles.label}>WhatsApp follow-up</Text>
            <TouchableOpacity
              style={[styles.toggle, config.whatsappEnabled && styles.toggleActive]}
              onPress={() => updateConfig("whatsappEnabled", !config.whatsappEnabled)}
            >
              <View style={[styles.toggleKnob, config.whatsappEnabled && styles.toggleKnobActive]} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.helperText}>
          Every workflow now auto-saves its response transcript to Firebase and makes the response visible to the admin for review. Manual input is kept as a fallback override.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Capture response</Text>
        <View style={styles.filterGrid}>
          <TextInput
            style={styles.input}
            placeholder="Case ID"
            value={responseCapture.caseId}
            onChangeText={(value) => setResponseCapture((current) => ({ ...current, caseId: value }))}
          />
          <TextInput
            style={[styles.input, styles.responseInput]}
            placeholder="Type the spoken response or transcript here..."
            multiline
            numberOfLines={6}
            value={responseCapture.transcript}
            onChangeText={(value) => setResponseCapture((current) => ({ ...current, transcript: value }))}
          />
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={saveResponseToWorkflow}>
          <Text style={styles.primaryButtonText}>Save response & analyze</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Filter records</Text>
        <View style={styles.filterGrid}>
          <TextInput
            style={styles.input}
            placeholder="Case ID"
            value={filters.caseId}
            onChangeText={(value) => setFilters((current) => ({ ...current, caseId: value }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Candidate"
            value={filters.candidate}
            onChangeText={(value) => setFilters((current) => ({ ...current, candidate: value }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Field executive"
            value={filters.executive}
            onChangeText={(value) => setFilters((current) => ({ ...current, executive: value }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Date"
            value={filters.date}
            onChangeText={(value) => setFilters((current) => ({ ...current, date: value }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Status"
            value={filters.status}
            onChangeText={(value) => setFilters((current) => ({ ...current, status: value }))}
          />
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Call records</Text>
          <Text style={styles.metaText}>{filteredWorkflows.length} results</Text>
        </View>

        {filteredWorkflows.map((item) => {
          const aiResult = analyzeResponseText(item.transcript || item.aiSummary, item.aiSummary);
          const displayStatus = aiResult.isNegative ? "Needs review" : (item.status || aiResult.status);
          const displaySummary = item.aiSummary || aiResult.summary;
          const displayFlags = item.aiFlags?.length ? item.aiFlags : aiResult.aiFlags;
          const isAlert = aiResult.isNegative;

          return (
            <View
              key={item.id}
              style={[
                styles.recordCard,
                isAlert && styles.recordCardAlert,
              ]}
            >
              <View style={styles.recordHeader}>
                <View>
                  <Text style={styles.recordCaseId}>{item.caseId} · {displayStatus}</Text>
                  <Text style={styles.recordMeta}>{item.candidateName} · {item.fieldExecutive}</Text>
                </View>
                <TouchableOpacity style={[styles.actionButton, isAlert && styles.alertActionButton]}>
                  <Text style={styles.actionButtonText}>{isAlert ? "Alert" : "Review"}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.recordDetailsRow}>
                <Text style={styles.detailItem}>Attempts: {item.callAttempts}</Text>
                <Text style={styles.detailItem}>Outcome: {item.lastOutcome}</Text>
                <Text style={styles.detailItem}>Duration: {item.duration}</Text>
                <Text style={styles.detailItem}>Date: {item.date}</Text>
              </View>

              {isAlert && (
                <View style={styles.alertBanner}>
                  <Ionicons name="warning" size={14} color="#fecaca" />
                  <Text style={styles.alertBannerText}>Negative response detected — admin attention required.</Text>
                </View>
              )}

              <View style={styles.transcriptBox}>
                <Text style={styles.transcriptLabel}>AI summary</Text>
                <Text style={[styles.transcriptText, isAlert && styles.alertTranscriptText]}>{displaySummary}</Text>
              </View>

              <View style={styles.transcriptBox}>
                <Text style={styles.transcriptLabel}>Transcript excerpt</Text>
                <Text style={[styles.transcriptText, isAlert && styles.alertTranscriptText]}>{item.transcript}</Text>
              </View>

              {displayFlags.length > 0 && (
                <View style={styles.flagRow}>
                  {displayFlags.map((flag) => (
                    <View key={flag} style={[styles.flagPill, isAlert && styles.alertFlagPill]}>
                      <Text style={[styles.flagText, isAlert && styles.alertFlagText]}>{flag}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
          </View>
        </ScrollView>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#050b16",
  },
  phoneFrame: {
    flex: 1,
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "rgba(15, 23, 42, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.18)",
    shadowColor: "#38bdf8",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  content: {
    padding: 18,
    paddingBottom: 40,
  },
  telemetryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  signalGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  signalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#34d399",
    opacity: 0.9,
  },
  telemetryText: {
    color: "#a5f3fc",
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "800",
  },
  signalBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(45, 212, 191, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(45, 212, 191, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
    marginTop: 6,
  },
  titleWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 8,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(148, 163, 184, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.25)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  eyebrow: {
    color: "#7dd3fc",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#f8fafc",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(34,197,94,0.12)",
    borderColor: "rgba(34,197,94,0.5)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusPillText: {
    color: "#bbf7d0",
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 6,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 18,
  },
  statCard: {
    flexBasis: "48%",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.38)",
    borderRadius: 18,
    padding: 16,
    shadowColor: "#8b5cf6",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  statLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  statValue: {
    color: "#f8fafc",
    fontSize: 26,
    fontWeight: "800",
    marginTop: 8,
  },
  card: {
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    borderColor: "rgba(125, 211, 252, 0.28)",
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    marginBottom: 18,
    shadowColor: "#38bdf8",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    backdropFilter: "blur(10px)",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  cardTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "800",
  },
  configGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  fieldRow: {
    width: "48%",
    minWidth: 180,
    marginBottom: 10,
  },
  label: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "rgba(15, 23, 42, 0.9)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.25)",
    color: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#67e8f9",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
  },
  responseInput: {
    minHeight: 120,
    textAlignVertical: "top",
    marginTop: 12,
  },
  primaryButton: {
    backgroundColor: "#8b5cf6",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.7)",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  toggle: {
    width: 52,
    height: 30,
    borderRadius: 16,
    backgroundColor: "#334155",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  toggleActive: {
    backgroundColor: "#8b5cf6",
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#f8fafc",
    marginLeft: 0,
  },
  toggleKnobActive: {
    marginLeft: 22,
  },
  helperText: {
    marginTop: 10,
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 18,
  },
  filterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metaText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
  },
  recordCard: {
    backgroundColor: "#0b1220",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    padding: 14,
    marginBottom: 14,
  },
  recordCardAlert: {
    borderColor: "#ef4444",
    backgroundColor: "rgba(69, 10, 10, 0.42)",
    shadowColor: "#ef4444",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  recordHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  recordCaseId: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "800",
  },
  recordMeta: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 4,
  },
  actionButton: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  alertActionButton: {
    backgroundColor: "#ef4444",
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239,68,68,0.15)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.7)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  alertBannerText: {
    color: "#fecaca",
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 8,
  },
  recordDetailsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  detailItem: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "600",
  },
  transcriptBox: {
    borderRadius: 12,
    backgroundColor: "rgba(30, 41, 59, 0.9)",
    borderWidth: 1,
    borderColor: "#334155",
    padding: 12,
    marginBottom: 10,
  },
  transcriptLabel: {
    color: "#7dd3fc",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: 6,
  },
  transcriptText: {
    color: "#e2e8f0",
    fontSize: 13,
    lineHeight: 20,
  },
  alertTranscriptText: {
    color: "#fee2e2",
  },
  flagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  flagPill: {
    backgroundColor: "rgba(251,191,36,0.14)",
    borderColor: "rgba(251,191,36,0.5)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  alertFlagPill: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderColor: "rgba(239,68,68,0.7)",
  },
  flagText: {
    color: "#fcd34d",
    fontSize: 11,
    fontWeight: "700",
  },
  alertFlagText: {
    color: "#fecaca",
  },
});
