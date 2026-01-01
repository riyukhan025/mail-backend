import { Ionicons } from "@expo/vector-icons";
import { encode as btoa } from 'base-64';
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import { LinearGradient } from "expo-linear-gradient";
import * as MailComposer from "expo-mail-composer";
import { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import firebase from "../firebase";
import { APPWRITE_CONFIG, databases, ID } from "./appwrite";

const PHOTO_CATEGORIES = ['selfie', 'proof', 'street', 'house', 'landmark'];

export default function AuditCaseScreen({ navigation, route }) {
  const { caseId, caseData, user } = route.params || {};
  
  const [rectifyModalVisible, setRectifyModalVisible] = useState(false);
  const [revertModalVisible, setRevertModalVisible] = useState(false);
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  
  const [selectedRedoItems, setSelectedRedoItems] = useState([]);
  const [revertReason, setRevertReason] = useState("");
  const [isReverting, setIsReverting] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Email State
  const [selectedTo, setSelectedTo] = useState("");
  const [selectedCc, setSelectedCc] = useState([]);
  const [availableEmails, setAvailableEmails] = useState([
      "riyu7379@gmail.com", 
      "client@example.com"
  ]);

  useEffect(() => {
      if (availableEmails.length > 0) setSelectedTo(availableEmails[0]);
  }, []);

  const handleApprove = () => {
    setEmailModalVisible(true);
  };

  const completeCase = async () => {
    try {
        await firebase.database().ref(`cases/${caseId}`).update({
            status: "completed",
            finalizedAt: Date.now(),
            finalizedBy: user?.uid || "admin",
        });

        // Record in Appwrite
        try {
            const databaseId = APPWRITE_CONFIG?.databaseId;
            const collectionId = APPWRITE_CONFIG?.sentEmailsCollectionId;

            if (databaseId && collectionId) {
                await databases.createDocument(
                    databaseId,
                    collectionId,
                    ID.unique(),
                    {
                        subject: `Case Approved: ${caseData.RefNo || caseId}`,
                        recipient: selectedTo,
                        RefNo: caseData.RefNo || caseId,
                        caseId: caseId,
                        sentAt: new Date().toISOString(),
                        sentBy: user?.uid || "admin"
                    }
                );
                console.log("✅ Email log saved to Appwrite 'Sent Emails' collection.");
            } else {
                console.warn("⚠️ Skipping Appwrite log: Missing databaseId or sentEmailsCollectionId in app/appwrite.js");
            }
        } catch (error) {
            console.error("Failed to save email record to Appwrite:", error);
        }

        Alert.alert("Success", "Case approved. Please ensure the email was sent from your mail app.");
        navigation.navigate("MailsSentScreen", { successMessage: "Email sent successfully!" });
    } catch (error) {
        console.error("Complete Case Error:", error);
        Alert.alert("Error", "Failed to complete case in database.");
    }
  };

  const executeSendEmail = async () => {
    setIsSending(true);
    setEmailModalVisible(false);

    if (!selectedTo) {
        Alert.alert("Error", "Please select a recipient email.");
        setIsSending(false);
        return;
    }

    try {
      let emailBody = `
Dear Client,

This is to inform you that the verification for the following case has been completed and approved. Please find the final report and the submitted verification form attached to this email.

Case Details:
--------------------
Reference No: ${caseData.RefNo || caseId}
Candidate Name: ${caseData.candidateName || 'N/A'}
Check Type: ${caseData.chkType || 'N/A'}
City: ${caseData.city || 'N/A'} 

Thank you,
Spacesolutions Team
      `.trim();

      // --- ATTEMPT 1: GMAIL API (Background Send - Works on Web & Native) ---
      try {
        // Helper to get env vars from various sources (process.env, EXPO_PUBLIC_, or app.config.js extra)
        // Note: Accessing EXPO_PUBLIC_ variables explicitly is required for the bundler to inline them.
        const GMAIL_CLIENT_ID = process.env.EXPO_PUBLIC_GMAIL_CLIENT_ID || 
                                Constants.expoConfig?.extra?.GMAIL_CLIENT_ID || 
                                Constants.manifest?.extra?.GMAIL_CLIENT_ID;
        const GMAIL_CLIENT_SECRET = process.env.EXPO_PUBLIC_GMAIL_CLIENT_SECRET || 
                                    Constants.expoConfig?.extra?.GMAIL_CLIENT_SECRET || 
                                    Constants.manifest?.extra?.GMAIL_CLIENT_SECRET;
        const GMAIL_REFRESH_TOKEN = process.env.EXPO_PUBLIC_GMAIL_REFRESH_TOKEN || 
                                    Constants.expoConfig?.extra?.GMAIL_REFRESH_TOKEN || 
                                    Constants.manifest?.extra?.GMAIL_REFRESH_TOKEN;

        console.log(`[Gmail API] Credentials Check: ID=${!!GMAIL_CLIENT_ID}, Secret=${!!GMAIL_CLIENT_SECRET}, Token=${!!GMAIL_REFRESH_TOKEN}`);

        if (GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN) {
            console.log("🔄 Refreshing Gmail OAuth token...");
            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: GMAIL_CLIENT_ID,
                client_secret: GMAIL_CLIENT_SECRET,
                refresh_token: GMAIL_REFRESH_TOKEN,
                grant_type: 'refresh_token',
              }).toString(),
            });

            const tokenData = await tokenRes.json();
            if (!tokenData.access_token) {
              throw new Error("Failed to refresh Gmail token: " + (tokenData.error || "Unknown error"));
            }

            console.log("✅ Gmail token refreshed successfully");

            // Fetch Attachments as Base64
            const attachments = [];
            const fetchAsBase64 = async (url, filename) => {
              try {
                console.log(`📥 Fetching attachment: ${filename}`);
                const resp = await fetch(url);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const blob = await resp.blob();
                return new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve({ filename, data: reader.result.split(',')[1] });
                  reader.onerror = reject;
                  reader.readAsDataURL(blob);
                });
              } catch (e) {
                console.warn(`⚠️ Failed to fetch ${filename}:`, e.message);
                return null;
              }
            };

            if (caseData.photosFolderLink) {
              const att = await fetchAsBase64(caseData.photosFolderLink, `CaseReport_${caseData.RefNo || caseId}.pdf`);
              if (att) attachments.push(att);
            }
            if (caseData.filledForm?.url) {
              const att = await fetchAsBase64(caseData.filledForm.url, `FilledForm_${caseData.RefNo || caseId}.pdf`);
              if (att) attachments.push(att);
            }

            // Construct MIME Message
            const boundary = "foo_bar_baz";
            let rawMessage = [
              `MIME-Version: 1.0`,
              `To: ${selectedTo}`,
              selectedCc.length > 0 ? `Cc: ${selectedCc.join(', ')}` : null,
              `Subject: Case Approved: ${caseData.RefNo || caseId}`,
              `Content-Type: multipart/mixed; boundary="${boundary}"`,
              "",
              `--${boundary}`,
              `Content-Type: text/plain; charset="UTF-8"`,
              `Content-Transfer-Encoding: 8bit`,
              "",
              emailBody,
              ""
            ].filter(Boolean).join("\r\n");

            attachments.forEach(att => {
              rawMessage += `\r\n--${boundary}\r\n`;
              rawMessage += `Content-Type: application/pdf; name="${att.filename}"\r\n`;
              rawMessage += `Content-Disposition: attachment; filename="${att.filename}"\r\n`;
              rawMessage += `Content-Transfer-Encoding: base64\r\n\r\n`;
              rawMessage += att.data + `\r\n`;
            });

            rawMessage += `\r\n--${boundary}--`;

            // Send via Gmail API
            console.log("📧 Sending email via Gmail API...");
            // Ensure UTF-8 characters are handled correctly in Base64
            const raw = btoa(unescape(encodeURIComponent(rawMessage))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            
            const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ raw }),
            });

            if (!sendRes.ok) {
              const errData = await sendRes.json();
              throw new Error("Gmail API Error: " + (errData.error?.message || sendRes.statusText));
            }

            console.log("✅ Email sent successfully via Gmail API");
            await completeCase();
            setIsSending(false);
            return;
        } else {
            throw new Error("Gmail credentials missing. Ensure EXPO_PUBLIC_GMAIL_CLIENT_ID etc. are set in .env");
        }
      } catch (apiError) {
        console.warn("⚠️ Gmail API failed, falling back to native/web mailer:", apiError.message);
        // Fall through to existing logic
      }

        if (Platform.OS === "web") {
          // --- WEB FALLBACK (Gmail Web Compose) ---
          const subject = `Case Approved: ${caseData.RefNo || caseId}`;
          const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(selectedTo)}&cc=${encodeURIComponent(selectedCc.join(','))}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
          Linking.openURL(gmailUrl);
          setIsSending(false);
          return;
        } else {
          // --- NATIVE IMPLEMENTATION (MAIL COMPOSER) ---
        const isAvailable = await MailComposer.isAvailableAsync();
        if (!isAvailable) {
          Alert.alert("Error", "Mail services are not available on this device.");
          setIsSending(false);
          return;
        }

        const attachments = [];
        const downloadToCache = async (url, fileName) => {
          if (!url) return null;
          const fileUri = FileSystem.cacheDirectory + fileName;
          try {
            const { uri } = await FileSystem.downloadAsync(url, fileUri);
            return uri;
          } catch (e) {
            console.error("Download error:", e);
            return null;
          }
        };

        const safeRef = (caseData.RefNo || caseId).replace(/[^a-zA-Z0-9-_]/g, '_');

        if (caseData.photosFolderLink) {
          const uri = await downloadToCache(caseData.photosFolderLink, `CaseReport_${safeRef}.pdf`);
          if (uri) attachments.push(uri);
        }
        if (caseData.filledForm?.url) {
          const uri = await downloadToCache(caseData.filledForm.url, `FilledForm_${safeRef}.pdf`);
          if (uri) attachments.push(uri);
        }

        const result = await MailComposer.composeAsync({
          recipients: [selectedTo],
          ccRecipients: selectedCc,
          subject: `Case Approved: ${caseData.RefNo || caseId}`,
          body: emailBody,
          attachments: attachments,
        });

        if (result.status === 'sent') {
          await completeCase();
        } else if (result.status === 'undetermined' && Platform.OS === 'android') {
          Alert.alert(
            "Email Confirmation",
            "The email app was opened. Did you press 'Send' and see the email leave your outbox?",
            [
              { text: "No, I cancelled", style: "cancel" },
              { text: "Yes, I sent it", onPress: completeCase },
            ]
          );
        }
        }
    } catch (error) {
      console.error("Email Error:", error);
      Alert.alert("Error", "Failed to process email: " + error.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleRectify = () => {
    setRectifyModalVisible(true);
  };

  const toggleRedoItem = (item) => {
    if (selectedRedoItems.includes(item)) {
      setSelectedRedoItems(prev => prev.filter(i => i !== item));
    } else {
      setSelectedRedoItems(prev => [...prev, item]);
    }
  };

  const handleRevert = async () => {
    if (!revertReason.trim() && selectedRedoItems.length === 0) {
      Alert.alert("Error", "Please enter a reason or select items to redo.");
      return;
    }

    setIsReverting(true);
    try {
      let finalFeedback = revertReason.trim();
      if (!finalFeedback && selectedRedoItems.length > 0) {
        const labels = selectedRedoItems.map(i => i === 'form' ? 'Form' : i.charAt(0).toUpperCase() + i.slice(1));
        finalFeedback = "Redo required: " + labels.join(", ");
      }

      const updates = {
        status: "assigned",
        auditFeedback: finalFeedback,
        photosToRedo: selectedRedoItems.filter(i => i !== 'form'),
        completedAt: null, // Clear completion time so it doesn't show as done
      };

      if (selectedRedoItems.includes('form')) {
        updates.formCompleted = false;
        updates.filledForm = null; // Remove filled form so they have to redo
      }

      // Remove photos from photosFolder for selected categories so member can retake them
      selectedRedoItems.forEach(item => {
        if (item !== 'form') {
          updates[`photosFolder/${item}`] = null;
        }
      });

      await firebase.database().ref(`cases/${caseId}`).update(updates);

      Alert.alert("Success", "Case reverted successfully.");
      navigation.goBack();
    } catch (error) {
      console.error("Revert Error:", error);
      Alert.alert("Error", "Failed to revert case.");
    } finally {
      setIsReverting(false);
      setRevertModalVisible(false);
    }
  };

  return (
    <LinearGradient
      colors={["#FF0099", "#493240", "#00DBDE"]}
      style={styles.container}
    >
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Ionicons name="arrow-back" size={28} color="#fff" />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.scrollCenterContainer}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Audit Case</Text>
          
          <View style={styles.detailRow}>
            <Text style={styles.label}>Ref No:</Text>
            <Text style={styles.value}>{caseData.matrixRefNo || caseId}</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.label}>Candidate:</Text>
            <Text style={styles.value}>{caseData.candidateName}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.label}>Submitted:</Text>
            <Text style={styles.value}>
              {caseData.completedAt ? new Date(caseData.completedAt).toLocaleString() : "N/A"}
            </Text>
          </View>

          {caseData.auditFeedback && (
            <View style={styles.feedbackBox}>
              <Text style={styles.feedbackTitle}>Previous Failure Reason:</Text>
              <Text style={styles.feedbackText}>{caseData.auditFeedback}</Text>
            </View>
          )}

          <View style={styles.divider} />

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 15 }}>
            {caseData.photosFolderLink && (
              <TouchableOpacity 
                style={[styles.downloadButton, { flex: 1 }]}
                onPress={() => Linking.openURL(caseData.photosFolderLink)}
              >
                <Ionicons name="cloud-download-outline" size={20} color="#fff" />
                <Text style={styles.downloadButtonText}>PDF Report</Text>
              </TouchableOpacity>
            )}

            {caseData.filledForm?.url && (
              <TouchableOpacity 
                style={[styles.downloadButton, { backgroundColor: "#6c757d", flex: 1 }]}
                onPress={() => Linking.openURL(caseData.filledForm.url)}
              >
                <Ionicons name="document-text-outline" size={20} color="#fff" />
                <Text style={styles.downloadButtonText}>Filled Form</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.approveButton, isSending && { opacity: 0.7 }]} onPress={handleApprove} disabled={isSending}>
              <Text style={styles.actionText}>{isSending ? "Processing..." : "Approve & Send"}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.failButton} onPress={() => setRevertModalVisible(true)}>
              <Text style={styles.actionText}>Fail Audit</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            style={[styles.downloadButton, { backgroundColor: "#FF9800", marginTop: 15 }]}
            onPress={handleRectify}
          >
            <Ionicons name="create-outline" size={20} color="#fff" />
            <Text style={styles.downloadButtonText}>Rectify / Edit Case</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={rectifyModalVisible} transparent animationType="fade" onRequestClose={() => setRectifyModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rectify Case</Text>
            <Text style={styles.modalSubtitle}>What would you like to edit?</Text>
            
            <TouchableOpacity 
              style={[styles.rectifyOptionButton, { backgroundColor: "#4a148c" }]}
              onPress={() => {
                setRectifyModalVisible(false);
                const rawCompany = caseData?.company;
                const rawClient = caseData?.client;
                const isMatrix = (rawCompany || "").toLowerCase().trim() === "matrix" || 
                                 (rawClient || "").toLowerCase().trim() === "matrix";
                const isDHI = (rawCompany || "").toLowerCase().trim() === "dhi" ||
                                 (rawClient || "").toLowerCase().trim() === "dhi";

                if (isMatrix) {
                  navigation.navigate("MatrixFormScreen", { caseId, company: "Matrix", editMode: true, existingData: caseData });
                } else if (isDHI) {
                  navigation.navigate("DHIFormScreen", { caseId, company: "DHI", editMode: true, existingData: caseData });
                } else {
                  navigation.navigate("FormScreen", { caseId, company: caseData.company || caseData.client, editMode: true, existingData: caseData });
                }
              }}
            >
              <Ionicons name="document-text" size={20} color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.rectifyOptionText}>Edit Form</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.rectifyOptionButton, { backgroundColor: "#0277bd" }]}
              onPress={() => {
                setRectifyModalVisible(false);
                navigation.navigate("CaseDetail", { caseId, role: "admin", forceEdit: true, user });
              }}
            >
              <Ionicons name="images" size={20} color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.rectifyOptionText}>Edit Photos</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.rectifyOptionButton, { backgroundColor: "#616161", marginTop: 10 }]}
              onPress={() => setRectifyModalVisible(false)}
            >
              <Text style={styles.rectifyOptionText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={revertModalVisible} transparent animationType="slide" onRequestClose={() => setRevertModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Fail Audit</Text>
            <Text style={styles.modalSubtitle}>Select items to be removed/redone:</Text>
            
            <View style={styles.chipContainer}>
              <TouchableOpacity 
                style={[styles.chip, selectedRedoItems.includes('form') && styles.chipSelected]}
                onPress={() => toggleRedoItem('form')}
              >
                <Text style={[styles.chipText, selectedRedoItems.includes('form') && styles.chipTextSelected]}>Form</Text>
              </TouchableOpacity>
              {PHOTO_CATEGORIES.map(cat => (
                <TouchableOpacity 
                  key={cat}
                  style={[styles.chip, selectedRedoItems.includes(cat) && styles.chipSelected]}
                  onPress={() => toggleRedoItem(cat)}
                >
                  <Text style={[styles.chipText, selectedRedoItems.includes(cat) && styles.chipTextSelected]}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Enter reason for failure..."
              placeholderTextColor="#888"
              value={revertReason}
              onChangeText={setRevertReason}
              multiline
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setRevertModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButton} onPress={handleRevert} disabled={isReverting}>
                <Text style={styles.confirmButtonText}>{isReverting ? "Processing..." : "Confirm Revert"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* --- EMAIL SELECTION MODAL --- */}
      <Modal visible={emailModalVisible} transparent animationType="slide" onRequestClose={() => setEmailModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Recipients</Text>
            
            <Text style={styles.label}>To (Select One):</Text>
            <ScrollView style={{ maxHeight: 150, marginBottom: 15 }}>
              {availableEmails.map(email => (
                <TouchableOpacity key={email} style={styles.emailOption} onPress={() => setSelectedTo(email)}>
                  <Ionicons name={selectedTo === email ? "radio-button-on" : "radio-button-off"} size={20} color="#007AFF" />
                  <Text style={styles.emailText}>{email}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>CC (Select Multiple):</Text>
            <ScrollView style={{ maxHeight: 150 }}>
              {availableEmails.map(email => (
                <TouchableOpacity key={email} style={styles.emailOption} onPress={() => {
                   if (selectedCc.includes(email)) setSelectedCc(prev => prev.filter(e => e !== email));
                   else setSelectedCc(prev => [...prev, email]);
                }}>
                  <Ionicons name={selectedCc.includes(email) ? "checkbox" : "square-outline"} size={20} color="#007AFF" />
                  <Text style={styles.emailText}>{email}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setEmailModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButton} onPress={executeSendEmail}>
                <Text style={styles.confirmButtonText}>Send Email</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backButton: { position: "absolute", top: 50, left: 20, zIndex: 10, padding: 10, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 20 },
  scrollCenterContainer: { flexGrow: 1, justifyContent: "center", padding: 20, paddingTop: 100 },
  card: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 20,
    padding: 25,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  cardTitle: { fontSize: 24, fontWeight: "bold", color: "#333", textAlign: "center", marginBottom: 20 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  label: { color: "#666", fontSize: 14, fontWeight: "600" },
  value: { color: "#333", fontSize: 14, fontWeight: "bold", maxWidth: '60%', textAlign: 'right' },
  feedbackBox: { backgroundColor: "#ffebee", padding: 10, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: "#ffcdd2" },
  feedbackTitle: { color: "#c62828", fontWeight: "bold", fontSize: 12 },
  feedbackText: { color: "#b71c1c", fontSize: 13 },
  divider: { height: 1, backgroundColor: "#eee", marginVertical: 20 },
  downloadButton: {
    flexDirection: "row",
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  downloadButtonText: { color: "#fff", fontWeight: "bold", marginLeft: 8, fontSize: 12 },
  actionRow: { flexDirection: "row", marginTop: 10, gap: 15 },
  approveButton: { flex: 1, backgroundColor: "#28a745", paddingVertical: 15, borderRadius: 10, alignItems: "center" },
  failButton: { flex: 1, backgroundColor: "#dc3545", paddingVertical: 15, borderRadius: 10, alignItems: "center" },
  actionText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", padding: 20 },
  modalContent: { backgroundColor: "#fff", borderRadius: 10, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: "#333", marginBottom: 10 },
  modalSubtitle: { color: "#666", marginBottom: 15 },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#ddd' },
  chipSelected: { backgroundColor: '#dc3545', borderColor: '#dc3545' },
  chipText: { color: '#333', fontSize: 12 },
  chipTextSelected: { color: '#fff', fontWeight: 'bold' },
  input: { backgroundColor: "#f0f0f0", borderRadius: 8, padding: 10, height: 100, textAlignVertical: "top", marginBottom: 20 },
  modalButtons: { flexDirection: "row", justifyContent: "flex-end" },
  cancelButton: { padding: 10, marginRight: 10 },
  cancelButtonText: { color: "#666", fontWeight: "bold" },
  confirmButton: { backgroundColor: "#f44336", padding: 10, borderRadius: 8 },
  confirmButtonText: { color: "#fff", fontWeight: "bold" },
  rectifyOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    width: '100%',
  },
  rectifyOptionText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  emailOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  emailText: { marginLeft: 10, fontSize: 14, color: '#333' },
});
