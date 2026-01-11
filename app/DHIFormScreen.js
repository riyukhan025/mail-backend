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
import { PDFDocument, PDFName, StandardFonts, rgb } from "pdf-lib";
import SignatureScreen from "react-native-signature-canvas";

import { useNavigation, useRoute } from "@react-navigation/native";
import { get, getDatabase, ref, update } from "firebase/database";

/* ================= ACROFIELDS (DHI) ================= */
const TEXT_FIELDS = {
  companyName: "Multi_1",
  addressLine1: "Multi_2",
  addressLine2: "Multi_3",
  locationDetailsIfNoCompany: "Multi_4",
  officeSpace: "Multi_5",
  employeeCount: "Multi_6",
  businessNature: "Multi_7",
  respondentDetails: "Multi_8",
  verifierDetails: "Multi_9",
  emailIds: "Multi_10",
  phoneNumbers: "Multi_11",
  additionalContacts: "Multi_12",
  neighbor1: "Multi_13",
  neighbor2: "Multi_14",
  postalCheck: "Multi_15",
  courierCheck: "Multi_16",
  comments: "Multi_17",
  fieldAssistantSignatureText: "Multi_19",
  date: "Multi_19",
  time: "Multi_20"
};

const CHECKBOX_FIELDS = {
  // Is Name Board Displayed?
  nameBoardYes: "Check_1",
  nameBoardNo: "Check_2",

  // Type of Locality
  localityResidential: "Check_3",
  localityCommercial: "Check_4",

  // Does company exist?
  companyExistsYes: "Check_5",
  companyExistsNo: "Check_6",

  // Status of Verification
  statusClear: "Check_7",
  statusDiscrepant: "Check_8",
  statusUnable: "Check_9",
};

/* ================= SIGNATURE COORDS ================= */
const SIGNATURE_COORDS = {
  verifier: { x: 330, y: 95, width: 160, height: 45 },
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
    companyName: "",
    addressLine1: "",
    addressLine2: "",
    locationDetailsIfNoCompany: "",
    officeSpace: "",
    employeeCount: "",
    businessNature: "",
    respondentDetails: "",
    verifierDetails: "",
    emailIds: "",
    phoneNumbers: "",
    additionalContacts: "",
    neighbor1: "",
    neighbor2: "",
    postalCheck: "",
    courierCheck: "",
    fieldAssistantName: "",
    comments: "",
    fieldAssistantSignatureText: "",
    date: new Date().toLocaleDateString(),
    time: new Date().toLocaleTimeString(),
    
    // Checkboxes
    checkboxes: {},
    
    respondentSignature: "",
    verifierSignature: "",
  });

  /* ================= LOAD ================= */
  useEffect(() => {
    const loadData = (data) => {
      if (!data) return;
      setForm(prev => ({
        ...prev,
        companyName: data.company || data.client || "",
        addressLine1: data.address || "",
        respondentDetails: data.respondentName || "",
        phoneNumbers: data.contactNumber || "",
        fieldAssistantName: data.assigneeName || "",
        checkboxes: data.checkboxes || {},
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
    const dims = img.scaleToFit(coords.width, coords.height);
    const x = coords.x + (coords.width - dims.width) / 2;
    const y = coords.y + (coords.height - dims.height) / 2;
    pdfDoc.getPages()[0].drawImage(img, { x, y, width: dims.width, height: dims.height });
  };

  /* ================= PDF GENERATION ================= */
  const generatePdf = async () => {
    try {
      setSaving(true);
      setProgress(0.1);
      setProgressMessage("Initializing...");

      // Ensure you have DHI_Format.pdf in your assets folder
      const asset = Asset.fromModule(require("../assets/DHI_FORM.pdf"));
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

      // --- DEBUG: Log all fields found in the PDF ---
      const fields = pdfForm.getFields();
      console.log(`[DEBUG] Total Fields Found: ${fields.length}`);
      let textCount = 0;
      let checkCount = 0;
      fields.forEach(f => {
        const type = f.constructor.name;
        const name = f.getName();
        console.log(`[DEBUG] Field: ${name} (${type})`);
        if (type === 'PDFTextField') textCount++;
        if (type === 'PDFCheckBox') checkCount++;
      });
      console.log(`[DEBUG] Summary: ${textCount} TextFields, ${checkCount} Checkboxes`);
      // ----------------------------------------------

      /* FIX BLUE BOX ISSUE - Set default appearance */
      pdfForm.getFields().forEach(field => {
        try {
          field.acroField.setDefaultAppearance('/Helv 9 Tf 0 g');
        } catch (e) {}
      });

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

      // Fill Checkboxes
      Object.entries(CHECKBOX_FIELDS).forEach(([key, fieldName]) => {
        try {
          const cb = pdfForm.getCheckBox(fieldName);
          if (form.checkboxes[key]) {
            cb.check();
          } else {
            cb.uncheck();
          }
        } catch (err) {
          console.log(`Checkbox ${fieldName} error: ${err.message}`);
        }
      });

      // Manually place Field Assistant Name
      if (form.fieldAssistantName) {
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const page = pdfDoc.getPages()[0];
        page.drawText(form.fieldAssistantName, {
            x: 330,
            y: 145, // Placed above the signature
            size: 10,
            font: font,
            color: rgb(0, 0, 0),
        });
      }

      setProgress(0.6);
      setProgressMessage("Embedding signatures...");
      await embedSignature(pdfDoc, form.verifierSignature, SIGNATURE_COORDS.verifier);

      /* FIX BLUE BOX ISSUE - Update appearances and flatten */
      try {
        pdfForm.updateFieldAppearances();
      } catch (e) {
        console.log("Error updating field appearances:", e);
      }

      // Fix for blue boxes: make all fields read-only before flattening
      pdfForm.getFields().forEach(field => {
        try { field.enableReadOnly(); } catch (e) {}
      });
      pdfForm.flatten();

      // Nuclear option: Remove all annotations to ensure no blue boxes
      pdfDoc.getPages().forEach(page => {
        page.node.delete(PDFName.of('Annots'));
      });

      setProgress(0.7);
      setProgressMessage("Saving PDF...");
      
      let out;
      let uploadInput;

      if (Platform.OS === 'web') {
        // FIX: Use save() instead of saveAsBase64() on WEB to ensure AcroForm removal
        const bytes = await pdfDoc.save();
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        out = btoa(binary);
        uploadInput = out;
      } else {
        out = await pdfDoc.saveAsBase64();
        const path = FileSystem.documentDirectory + `DHI_${form.caseReferenceNumber}.pdf`;
        await FileSystem.writeAsStringAsync(path, out, {
          encoding: FileSystem.EncodingType.Base64,
        });
        uploadInput = path;
      }

      setProgress(0.8);
      setProgressMessage("Uploading to Cloud...");
      const uploadUrl = await uploadPdfToCloudinary(uploadInput, form.companyName || caseId);

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

      <Text style={styles.sectionTitle}>Company & Location</Text>
      {Object.keys(TEXT_FIELDS).map(k => (
        <View key={k} style={{ marginBottom: 10 }}>
          <Text style={styles.label}>{k.replace(/([A-Z])/g, ' $1').trim()}</Text>
          <TextInput
            placeholder={`Enter ${k}`}
            style={styles.input}
            value={form[k]}
            onChangeText={v => setForm({ ...form, [k]: v })}
          />
        </View>
      ))}

      <Text style={styles.sectionTitle}>Checklist</Text>
      {Object.keys(CHECKBOX_FIELDS).map(k => (
        <TouchableOpacity
          key={k}
          style={styles.checkboxRow}
          onPress={() =>
            setForm(f => ({
              ...f,
              checkboxes: { ...f.checkboxes, [k]: !f.checkboxes[k] }
            }))
          }
        >
          <View style={[styles.checkbox, form.checkboxes[k] && styles.checked]} />
          <Text>{k.replace(/([A-Z])/g, ' $1').trim()}</Text>
        </TouchableOpacity>
      ))}

      {/* SIGNATURES */}
      <Text style={styles.sectionTitle}>Signatures</Text>
      <TouchableOpacity style={styles.sig} onPress={() => setSigningField("verifierSignature")}>
        {form.verifierSignature ? (
          <Image
            source={{ uri: `data:image/png;base64,${form.verifierSignature}` }}
            style={{ width: "100%", height: "100%", resizeMode: "contain" }}
          />
        ) : (
          <Text>Field Assistant Signature</Text>
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
            trimWhitespace={true}
            minWidth={3}
            maxWidth={5}
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
  label: { fontSize: 12, color: "#666", marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#ccc", padding: 10, marginBottom: 12, borderRadius: 5 },
  checkboxRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  checkbox: { width: 20, height: 20, borderWidth: 1, marginRight: 10 },
  checked: { backgroundColor: "#000" },
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