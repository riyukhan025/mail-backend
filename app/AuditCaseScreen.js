import { Ionicons } from "@expo/vector-icons";
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
  const { caseId, caseData: initialCaseData, user } = route.params || {};
  const [caseData, setCaseData] = useState(initialCaseData || {});
  
  useEffect(() => {
    const caseRef = firebase.database().ref(`cases/${caseId}`);
    const listener = caseRef.on("value", (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setCaseData((prev) => ({ ...prev, ...data }));
      }
    });
    return () => caseRef.off("value", listener);
  }, [caseId]);

  const [rectifyModalVisible, setRectifyModalVisible] = useState(false);
  const [revertModalVisible, setRevertModalVisible] = useState(false);
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  
  const [selectedRedoItems, setSelectedRedoItems] = useState([]);
  const [revertReason, setRevertReason] = useState("");
  const [isReverting, setIsReverting] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Email State
  const [selectedTo, setSelectedTo] = useState([]);
  const [selectedCc, setSelectedCc] = useState([]);
  const [availableEmails, setAvailableEmails] = useState([]);

  useEffect(() => {
      // Concatenate both fields to ensure we find the keyword regardless of which field it's in
      const clientName = ((caseData?.company || "") + " " + (caseData?.client || "")).toLowerCase();
      let emails = ["spacesolution2017@gmail.com"]; // Default fallback

      if (clientName.includes("matrix")) {
          emails = [
              "saranya.subramani@matrixbsindia.com",
              "radhika.e@matrixbsindia.com",
              "ananth.n@matrixbsindia.com",
              "prasanna.arivazhagan@matrixbsindia.com",
              "spacesolution2017@gmail.com",
              "chennaioutstation@matrixbsindia.com"
          ];
      } else if (clientName.includes("dhi")) {
          emails = [
              "Anushkj@dhiverification.com",
              "fieldverifier4@dhiverification.com",
              "dhiinsurance1@dhiverification.com",
              "hr@dhiverification.com",
              "fieldverifier1@dhiverification.com",
              "fieldverifier3@dhiverification.com",
              "spacesolution2017@gmail.com"
          ];
      } else if (clientName.includes("ces")) {
          emails = [
              "verifier1@credessentials.com",
              "spacesolution2017@gmail.com",
              "verifier2@credessentials.com"
          ];
      }

      setAvailableEmails(emails);
      if (emails.length > 0) setSelectedTo([emails[0]]);
  }, [caseData]);

  const handleDownloadAll = async () => {
    if (Platform.OS === 'web') {
        if (caseData.photosFolderLink) window.open(caseData.photosFolderLink, "_blank");
        if (caseData.filledForm?.url) {
            setTimeout(() => window.open(caseData.filledForm.url, "_blank"), 500);
        }
    } else {
        if (caseData.photosFolderLink) {
            await Linking.openURL(caseData.photosFolderLink);
        }
        if (caseData.filledForm?.url) {
            // Small delay to ensure the device handles the second intent correctly
            setTimeout(() => Linking.openURL(caseData.filledForm.url), 1000);
        }
    }
  };

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
                        subject: `Case Approved: ${caseData.matrixRefNo || caseData.RefNo || caseId}`,
                        recipient: selectedTo.join(", "),
                        RefNo: caseData.matrixRefNo || caseData.RefNo || caseId,
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
        navigation.replace("MailsSentScreen", { successMessage: "Email sent successfully!" });
    } catch (error) {
        console.error("Complete Case Error:", error);
        Alert.alert("Error", "Failed to complete case in database.");
    }
  };

  const executeSendEmail = async () => {
    setIsSending(true);
    setEmailModalVisible(false);

    const subject = `Case Approved: ${caseData.matrixRefNo || caseData.RefNo || caseId}`;
    const safeRef = (caseData.matrixRefNo || caseData.RefNo || caseId).replace(/[^a-zA-Z0-9-_]/g, '_');

    if (selectedTo.length === 0) {
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
Reference No: ${caseData.matrixRefNo || caseData.RefNo || caseId}
Candidate Name: ${caseData.candidateName || 'N/A'}
Check Type: ${caseData.chkType || 'N/A'}
City: ${caseData.city || 'N/A'} 

Thank you,
Spacesolutions Team
      `.trim();

      // --- WEB HANDLING ---
      if (Platform.OS === 'web') {
        const hasDownloaded = window.confirm("Did you download both the Report and Form PDFs?");

        if (hasDownloaded) {
             // Append links to body for web
             let webBody = emailBody + `\n\nAttachments:\n`;
             if (caseData.photosFolderLink) webBody += `Report: ${caseData.photosFolderLink}\n`;
             if (caseData.filledForm?.url) webBody += `Form: ${caseData.filledForm.url}\n`;
             
             // Construct Gmail URL (Web Browser Mail)
             const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1` +
                `&to=${encodeURIComponent(selectedTo.join(','))}` +
                `&cc=${encodeURIComponent(selectedCc.join(','))}` +
                `&su=${encodeURIComponent(subject)}` +
                `&body=${encodeURIComponent(webBody)}`;
             
             // Open Gmail in new tab
             window.open(gmailUrl, "_blank");

             // Navigate to MailsSentScreen for manual confirmation
             navigation.navigate("MailsSentScreen", { 
                 manualVerification: true,
                 caseId: caseId,
                 caseData: caseData,
                 recipient: selectedTo.join(", ")
             });
        } else {
            if (window.confirm("Click OK to download the files now.")) {
                if (caseData.photosFolderLink) window.open(caseData.photosFolderLink, "_blank");
                if (caseData.filledForm?.url) window.open(caseData.filledForm.url, "_blank");
            }
        }
        setIsSending(false);
        return;
      }

      // --- NATIVE MAIL COMPOSER IMPLEMENTATION ---
      const isAvailable = await MailComposer.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert("Error", "Mail services are not available on this device.");
        setIsSending(false);
        return;
      }

      const attachments = [];
      const downloadToCache = async (url, fileName) => {
        if (!url) return null;

        try {
          const uniqueName = `${Date.now()}_${fileName}`;
          const fileUri = FileSystem.cacheDirectory + uniqueName;

          console.log(`⬇️ Downloading ${fileName} to ${fileUri}`);
          const { uri, status } = await FileSystem.downloadAsync(url, fileUri);

          if (status !== 200) {
            console.warn(`❌ Download failed with status ${status}`);
            return null;
          }

          // Verify file exists and has size
          const info = await FileSystem.getInfoAsync(uri);
          if (!info.exists) {
             console.warn(`❌ File does not exist at ${uri}`);
             return null;
          }

          console.log(`✅ File downloaded: ${uri} (Size: ${info.size})`);

          return uri;
        } catch (e) {
          console.warn("❌ Download error:", e);
          return null;
        }
      };

      console.log("📥 Downloading PDFs for attachment...");
      if (caseData.photosFolderLink) {
        const uri = await downloadToCache(caseData.photosFolderLink, `CaseReport_${safeRef}.pdf`);
        if (uri) attachments.push(uri);
      }
      if (caseData.filledForm?.url) {
        const uri = await downloadToCache(caseData.filledForm.url, `FilledForm_${safeRef}.pdf`);
        if (uri) attachments.push(uri);
      }

      console.log(`📎 Attachments prepared (${attachments.length}):`, attachments);

      if (attachments.length === 0) {
        console.warn("No attachments downloaded. Adding links to body.");
        emailBody += `\n\nAttachments (Links):\n`;
        if (caseData.photosFolderLink) emailBody += `Report: ${caseData.photosFolderLink}\n`;
        if (caseData.filledForm?.url) emailBody += `Form: ${caseData.filledForm.url}\n`;
        
        // Alert.alert("Notice", "Could not download attachments. Links have been added to the email body instead.");
      }

      console.log("📧 Opening Mail Composer...");
      const result = await MailComposer.composeAsync({
        recipients: selectedTo,
        ccRecipients: selectedCc,
        subject: subject,
        body: emailBody,
        attachments: attachments,
      });

      console.log("📧 MailComposer result:", result);

      // Navigate to MailsSentScreen for manual confirmation (Safe Check)
      navigation.navigate("MailsSentScreen", { 
          manualVerification: true,
          caseId: caseId,
          caseData: caseData,
          recipient: selectedTo.join(", ")
      });
    } catch (error) {
      console.error("MailComposer Error:", error);
      Alert.alert("Error", "Failed to open email app: " + error.message);
    } finally {
      if (Platform.OS !== 'web') {
        setIsSending(false);
      }
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

            {(caseData.photosFolderLink && caseData.filledForm?.url) && (
              <TouchableOpacity 
                style={[styles.downloadButton, { backgroundColor: "#00897b", flex: 1 }]}
                onPress={handleDownloadAll}
              >
                <Ionicons name="layers-outline" size={20} color="#fff" />
                <Text style={styles.downloadButtonText}>Both</Text>
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
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <Text style={styles.label}>To (Select Multiple):</Text>
              <TouchableOpacity onPress={() => {
                  if (selectedTo.length === availableEmails.length) setSelectedTo([]);
                  else setSelectedTo([...availableEmails]);
              }}>
                <Text style={{ color: '#007AFF', fontSize: 14, fontWeight: 'bold' }}>
                  {selectedTo.length === availableEmails.length ? "Unselect All" : "Select All"}
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 150, marginBottom: 15 }}>
              {availableEmails.map(email => (
                <TouchableOpacity key={email} style={styles.emailOption} onPress={() => {
                   if (selectedTo.includes(email)) setSelectedTo(prev => prev.filter(e => e !== email));
                   else setSelectedTo(prev => [...prev, email]);
                }}>
                  <Ionicons name={selectedTo.includes(email) ? "checkbox" : "square-outline"} size={20} color="#007AFF" />
                  <Text style={styles.emailText}>{email}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, marginBottom: 5 }}>
              <Text style={styles.label}>CC (Select Multiple):</Text>
              <TouchableOpacity onPress={() => {
                  if (selectedCc.length === availableEmails.length) setSelectedCc([]);
                  else setSelectedCc([...availableEmails]);
              }}>
                <Text style={{ color: '#007AFF', fontSize: 14, fontWeight: 'bold' }}>
                  {selectedCc.length === availableEmails.length ? "Unselect All" : "Select All"}
                </Text>
              </TouchableOpacity>
            </View>
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
