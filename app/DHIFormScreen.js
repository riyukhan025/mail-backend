import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";

import { decode as atob } from "base-64";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { PDFDocument } from "pdf-lib";
import SignatureScreen from "react-native-signature-canvas";

import { useNavigation, useRoute } from "@react-navigation/native";
import { get, getDatabase, ref, update } from "firebase/database";

/* ================= ACROFIELDS (DHI) ================= */
// Note: These field names should match the AcroForm fields in your DHI PDF template.
// Using generic names similar to CES for now.
const TEXT_FIELDS = {
  caseReferenceNumber: "RefNo_Field",
  candidateName: "CandidateName_Field",
  fatherName: "FatherName_Field",
  address: "Address_Field",
  contactNumber: "Contact_Field",
  respondentName: "RespondentName_Field",
  relationship: "Relationship_Field",
  verifierName: "VerifierName_Field",
  remarks: "Remarks_Field",
};

/* ================= SIGNATURE COORDS ================= */
const SIGNATURE_COORDS = {
  respondent: { x: 150, y: 150, width: 160, height: 45 },
  verifier: { x: 360, y: 150, width: 160, height: 45 },
};

/* ================= CLOUDINARY CONFIG ================= */
const CLOUD_NAME = "dfpykheky";
const UPLOAD_PRESET = "cases_upload";

async function uploadPdfToCloudinary(pdfData, caseId) {
  const formData = new FormData();
  if (Platform.OS === 'web') {
    // Convert base64 to Blob to ensure filename is preserved in Cloudinary raw upload
    const binaryString = atob(pdfData);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    formData.append("file", blob, `DHI_${caseId}.pdf`);
  } else {
    formData.append('file', {
      uri: pdfData,
      type: 'application/pdf',
      name: `DHI_${caseId}.pdf`,
    });
  }
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', `cases/${caseId}`);
  formData.append('resource_type', 'raw');

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`, { method: 'POST', body: formData });
  const data = await response.json();
  return data.secure_url;
}

/* ================= COMPONENT ================= */
export default function DHIFormScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const db = getDatabase();
  const caseId = route.params?.caseId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [signingField, setSigningField] = useState(null);

  const [form, setForm] = useState({
    caseReferenceNumber: "",
    candidateName: "",
    fatherName: "",
    address: "",
    contactNumber: "",
    respondentName: "",
    relationship: "",
    verifierName: "",
    remarks: "",
    
    respondentSignature: "",
    verifierSignature: "",
  });

  /* ================= LOAD ================= */
  useEffect(() => {
    const loadData = (data) => {
      if (!data) return;
      setForm(prev => ({
        ...prev,
        caseReferenceNumber: data.matrixRefNo || data.caseReferenceNumber || data.RefNo || "",
        candidateName: data.candidateName || "",
        fatherName: data.fatherName || "",
        address: data.address || "",
        contactNumber: data.contactNumber || "",
        respondentName: data.respondentName || "",
        relationship: data.relationship || "",
        verifierName: data.verifierName || "",
        remarks: data.remarks || "",
        respondentSignature: data.respondentSignature || "",
        verifierSignature: data.verifierSignature || "",
      }));
    };

    if (route.params?.existingData) {
      loadData(route.params.existingData);
      setLoading(false);
    } else {
      get(ref(db, `cases/${caseId}`)).then((snap) => {
        loadData(snap.val() || {});
        setLoading(false);
      });
    }
  }, [caseId, route.params]);

  /* ================= SIGNATURE HANDLER ================= */
  const handleSignature = sig => {
    if (!sig || sig === "data:,") return;
    const clean = sig.replace("data:image/png;base64,", "");
    const field = signingField;
    setSigningField(null);
    requestAnimationFrame(() => {
      setForm(prev => ({ ...prev, [field]: clean }));
    });
  };

  const embedSignature = async (pdfDoc, base64, coords) => {
    if (!base64) return;
    const img = await pdfDoc.embedPng(
      Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    );
    pdfDoc.getPages()[0].drawImage(img, coords);
  };

  /* ================= PDF GENERATION ================= */
  const generatePdf = async () => {
    try {
      setSaving(true);
      setProgress(0.1);
      setProgressMessage("Initializing...");

      // Ensure you have DHI_Format.pdf in your assets folder
      const asset = Asset.fromModule(require("../assets/DHI_Format.pdf"));
      await asset.downloadAsync();

      setProgress(0.2);
      setProgressMessage("Reading template...");
      
      let pdfDoc;
      if (Platform.OS === 'web') {
        const res = await fetch(asset.uri);
        const blob = await res.arrayBuffer();
        pdfDoc = await PDFDocument.load(blob);
      } else {
        const base64 = await FileSystem.readAsStringAsync(asset.localUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        pdfDoc = await PDFDocument.load(
          Uint8Array.from(atob(base64), c => c.charCodeAt(0))
        );
      }
      
      const pdfForm = pdfDoc.getForm();

      setProgress(0.4);
      setProgressMessage("Filling form data...");
      
      // Fill Text Fields
      Object.entries(TEXT_FIELDS).forEach(([k, v]) => {
        try {
            if (form[k]) pdfForm.getTextField(v).setText(form[k]);
        } catch (err) {
            console.log(`Field ${v} not found in PDF`);
        }
      });

      setProgress(0.6);
      setProgressMessage("Embedding signatures...");
      await embedSignature(pdfDoc, form.respondentSignature, SIGNATURE_COORDS.respondent);
      await embedSignature(pdfDoc, form.verifierSignature, SIGNATURE_COORDS.verifier);

      // Fix for blue boxes: make all fields read-only before flattening
      pdfForm.getFields().forEach(field => field.enableReadOnly());
      pdfForm.flatten();

      setProgress(0.7);
      setProgressMessage("Saving PDF...");
      const out = await pdfDoc.saveAsBase64();
      
      let uploadInput;
      if (Platform.OS === 'web') {
        uploadInput = out;
      } else {
        const path = FileSystem.documentDirectory + `DHI_${form.caseReferenceNumber}.pdf`;
        await FileSystem.writeAsStringAsync(path, out, {
          encoding: FileSystem.EncodingType.Base64,
        });
        uploadInput = path;
      }

      setProgress(0.8);
      setProgressMessage("Uploading to Cloud...");
      const uploadUrl = await uploadPdfToCloudinary(uploadInput, form.caseReferenceNumber);

      setProgress(0.9);
      setProgressMessage("Finalizing...");
      await update(ref(db, `cases/${caseId}`), {
        formCompleted: true,
        filledForm: {
          url: uploadUrl,
          updatedAt: new Date().toISOString()
        }, ...form
      });

      setProgress(1.0);
      Alert.alert("Success", "DHI PDF generated & uploaded!");
      navigation.goBack();
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to generate PDF. Ensure DHI_Format.pdf exists in assets.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 50 }} />;

  return (
    <ScrollView style={{ padding: 16 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>DHI Verification Form</Text>
      </View>

      {Object.keys(TEXT_FIELDS).map(k => (
        <TextInput
          key={k}
          placeholder={k.replace(/([A-Z])/g, ' $1').trim()} // Format camelCase to Title Case
          style={styles.input}
          value={form[k]}
          onChangeText={v => setForm({ ...form, [k]: v })}
        />
      ))}

      {/* SIGNATURES */}
      <Text style={styles.sectionTitle}>Signatures</Text>
      <TouchableOpacity style={styles.sig} onPress={() => setSigningField("respondentSignature")}>
        {form.respondentSignature ? (
          <Image
            source={{ uri: `data:image/png;base64,${form.respondentSignature}` }}
            style={{ width: "100%", height: "100%", resizeMode: "contain" }}
          />
        ) : (
          <Text>Respondent Signature</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.sig} onPress={() => setSigningField("verifierSignature")}>
        {form.verifierSignature ? (
          <Image
            source={{ uri: `data:image/png;base64,${form.verifierSignature}` }}
            style={{ width: "100%", height: "100%", resizeMode: "contain" }}
          />
        ) : (
          <Text>Verifier Signature</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.submit} onPress={generatePdf}>
        <Text style={{ color: "#fff" }}>{saving ? "Saving..." : "Generate DHI PDF"}</Text>
      </TouchableOpacity>

      <Modal visible={!!signingField} animationType="slide">
        <View style={{ flex: 1, backgroundColor: "#fff" }}>
          <SignatureScreen
            onOK={handleSignature}
            onEnd={() => {}}
            autoClear={false}
            descriptionText="Sign above"
            clearText="Clear"
            confirmText="Save"
            webStyle={`.m-signature-pad--footer { display: flex !important; bottom: 0px; width: 100%; position: absolute; } .m-signature-pad--footer .button { background-color: #007AFF; color: #FFF; }`}
          />
          <TouchableOpacity style={styles.close} onPress={() => setSigningField(null)}>
            <Text style={{ color: "#fff" }}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* PROGRESS MODAL */}
      <Modal visible={saving} transparent animationType="fade">
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>{progressMessage}</Text>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.percentageText}>{Math.round(progress * 100)}%</Text>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

/* ================= STYLES ================= */
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backButton: { marginRight: 15 },
  headerTitle: { fontSize: 20, fontWeight: "bold", textAlign: "center", flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: "bold", marginTop: 10, marginBottom: 10 },
  input: { borderWidth: 1, borderColor: "#ccc", padding: 10, marginBottom: 12, borderRadius: 5 },
  sig: { height: 90, borderWidth: 1, marginBottom: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#e0e0e0", borderRadius: 5 },
  submit: { backgroundColor: "green", padding: 16, alignItems: "center", borderRadius: 5, marginTop: 10 },
  close: { position: "absolute", top: 40, right: 20, backgroundColor: "red", padding: 10, borderRadius: 5 },
  loadingOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingBox: {
    width: "80%",
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 10,
    alignItems: "center",
    elevation: 5,
  },
  loadingText: { marginTop: 10, fontSize: 16, fontWeight: "bold", color: "#333" },
  progressBarContainer: {
    width: "100%",
    height: 10,
    backgroundColor: "#e0e0e0",
    borderRadius: 5,
    marginTop: 15,
    overflow: "hidden",
  },
  progressBarFill: { height: "100%", backgroundColor: "#007AFF" },
  percentageText: { marginTop: 5, color: "#666", fontSize: 12 },
});