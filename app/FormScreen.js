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
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import SignatureScreen from "react-native-signature-canvas";

import { useNavigation, useRoute } from "@react-navigation/native";
import { get, getDatabase, ref, update } from "firebase/database";

/* ================= ACROFIELDS ================= */
const TEXT_FIELDS = {
  caseReferenceNumber: "Text-JM7eGiSQlK",
  candidateName: "Text-3IJtUHL9te",
  fatherName: "Text-mLkeL_HVnb",
  address: "Text-YmUPMvWsRg",
  contactNumber: "Text-PqKLQjykrn",
  detailsVerified: "Text-ktvG_z3JGc",
  respondentName: "Text-dYn35TmOEI",
  relationship: "Text-rU9ZE6LTAt",
  fieldExecutiveName: "Text-BLCsHGbXf5",
};
const DATE_FIELDS = {
  stayFromDate: "Date-2sbhVQkXzE",
  stayToDate: "Date-bpnWj8ltjv",
};

const CHECKBOX = {
  addressType: {
    current: "CheckBox-Z8-bpQ1Egz",
    permanent: "CheckBox-rpoxYzXGRo",
    former: "CheckBox-nsotXNKCZ1",
  },
  residenceType: {
    owned: "CheckBox-wxwceQ6ZRH",
    rented: "CheckBox-VTkgdp6KQy",
    hostel: "CheckBox-E-mcQ2R8M0",
    relative: "CheckBox-T7jjsYPL7P",
    other: "CheckBox-D32TZEnaUR",
  },
  locationType: {
    rural: "CheckBox-xi6GRRNwWy",
    semiUrban: "CheckBox-GWjiZTn8Hs",
    urban: "CheckBox-0rxNr3PeFM",
  },
  siteVisit: {
    yes: "CheckBox-CmdlioTtfs",
    no: "CheckBox-3J3s18SEG3",
  },
  verificationStatus: {
    verified: "CheckBox-9sGwxoSyaV",
    discrepancy: "CheckBox-6cy_YWyeTj",
    insufficient: "CheckBox-zJNo68C-TG",
    unable: "CheckBox-u__w8DBaJC",
  },
};

const MARITAL_STATUS = "Dropdown-m2CY7O4n-W";

/* ================= SIGNATURE COORDS ================= */
const SIGNATURE_COORDS = {
  respondent: { x: 175, y: 200, width: 90, height: 25 },
  fieldExecutive: { x: 398, y: 158, width: 90, height: 25 },
};

/* ================= MARITAL STATUS COORDS ================= */
// Adjust these coordinates to cover the "Divorced" text on the PDF
const MARITAL_COORDS = { x: 192, y: 429, width: 140, height: 14 };

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
    formData.append("file", blob, `CES_${caseId}.pdf`);
  } else {
    formData.append('file', {
      uri: pdfData,
      type: 'application/pdf',
      name: `CES_${caseId}.pdf`,
    });
  }
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', `cases/${caseId}`);
  formData.append('resource_type', 'raw');

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`, { method: 'POST', body: formData });
  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || "Cloudinary upload failed");
  }

  return data.secure_url;
}
/* ================= RADIO UI ================= */
const RadioGroup = ({ title, value, onChange, options }) => (
  <View style={styles.group}>
    <Text style={styles.groupTitle}>{title}</Text>
    {options.map(o => (
      <TouchableOpacity
        key={o.value}
        style={styles.radio}
        onPress={() => onChange(o.value)}
      >
        <View style={[styles.circle, value === o.value && styles.checked]} />
        <Text>{o.label}</Text>
      </TouchableOpacity>
    ))}
  </View>
);

/* ================= COMPONENT ================= */
export default function CESFormScreen() {
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
    detailsVerified: "",
    respondentName: "",
    relationship: "",
    fieldExecutiveName: "",
    stayFromDate: "",
    stayToDate: "",

    addressType: "",
    maritalStatus: "",
    residenceType: "",
    locationType: "",
    siteVisit: "",
    verificationStatus: "",

    remarks: "",
    respondentSignature: "",
    fieldExecutiveSignature: "",
  });

  const formatDate = (text) => {
    if (text === "Present") return text;
    const cleaned = text.replace(/[^0-9]/g, "");
    let formatted = cleaned;
    if (cleaned.length > 2) {
      formatted = cleaned.slice(0, 2) + "/" + cleaned.slice(2);
    }
    if (cleaned.length > 4) {
      formatted = formatted.slice(0, 5) + "/" + cleaned.slice(4, 8);
    }
    return formatted;
  };

  /* ================= LOAD ================= */
  useEffect(() => {
    const loadData = (data) => {
      if (!data) return;
      setForm(prev => ({
        ...prev,
        caseReferenceNumber: String(data.matrixRefNo || data.caseReferenceNumber || data.RefNo || ""),
        candidateName: String(data.candidateName || ""),
        fatherName: String(data.fatherName || ""),
        address: String(data.address || ""),
        contactNumber: String(data.contactNumber || ""),
        detailsVerified: String(data.detailsVerified || ""),
        respondentName: String(data.respondentName || ""),
        relationship: String(data.relationship || ""),
        fieldExecutiveName: String(data.fieldExecutiveName || ""),
        stayFromDate: String(data.stayFromDate || ""),
        stayToDate: String(data.stayToDate || ""),
        addressType: String(data.addressType || ""),
        maritalStatus: String(data.maritalStatus || ""),
        residenceType: String(data.residenceType || ""),
        locationType: String(data.locationType || ""),
        siteVisit: String(data.siteVisit || ""),
        verificationStatus: String(data.verificationStatus || ""),
        remarks: String(data.remarks || ""),
        respondentSignature: String(data.respondentSignature || ""),
        fieldExecutiveSignature: String(data.fieldExecutiveSignature || ""),
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

  /* ================= SIGNATURE FIX (IMPORTANT) ================= */
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

  /* ================= PDF ================= */
  const generatePdf = async () => {
    try {
      setSaving(true);
      setProgress(0.1);
      setProgressMessage("Initializing...");

      const asset = Asset.fromModule(require("../assets/CES_Format.pdf"));
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
      Object.entries(TEXT_FIELDS).forEach(([k, v]) => {
        if (form[k]) pdfForm.getTextField(v).setText(form[k]);
      });

      Object.entries(DATE_FIELDS).forEach(([k, v]) => {
        if (form[k]) pdfForm.getTextField(v).setText(form[k]);
      });

      Object.entries(CHECKBOX).forEach(([group, map]) => {
        if (form[group]) pdfForm.getCheckBox(map[form[group]]).check();
      });

      setProgress(0.6);
      setProgressMessage("Embedding signatures...");
      await embedSignature(pdfDoc, form.respondentSignature, SIGNATURE_COORDS.respondent);
      await embedSignature(pdfDoc, form.fieldExecutiveSignature, SIGNATURE_COORDS.fieldExecutive);

      // Fix for blue boxes: make all fields read-only before flattening
      pdfForm.getFields().forEach(field => field.enableReadOnly());
      pdfForm.flatten();

      /* ================= DRAW OVERLAY AFTER FLATTEN ================= */
      const page = pdfDoc.getPages()[0];
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      if (form.maritalStatus) {
        // 1. Draw White Rectangle (Mask) over the flattened "Divorced" text
        page.drawRectangle({ x: MARITAL_COORDS.x, y: MARITAL_COORDS.y, width: MARITAL_COORDS.width, height: MARITAL_COORDS.height, color: rgb(1, 1, 1) });

        // 2. Draw New Text
        page.drawText(form.maritalStatus, {
          x: MARITAL_COORDS.x + 2,
          y: MARITAL_COORDS.y + 4,
          size: 10,
          font,
          color: rgb(0, 0, 0),
        });
      }

      if (form.remarks) {
        page.drawText(form.remarks, {
          x: 335,
          y: 135,
          size: 10,
          font,
          color: rgb(0, 0, 0),
        });
      }

      setProgress(0.7);
      setProgressMessage("Saving PDF...");
      const out = await pdfDoc.saveAsBase64();
      
      let uploadInput;
      if (Platform.OS === 'web') {
        uploadInput = out;
      } else {
        const path = FileSystem.documentDirectory + `CES_${form.caseReferenceNumber}.pdf`;
        await FileSystem.writeAsStringAsync(path, out, {
          encoding: FileSystem.EncodingType.Base64,
        });
        uploadInput = path;
      }

      setProgress(0.8);
      setProgressMessage("Uploading to Cloud...");
      // UPLOAD TO CLOUDINARY
      const uploadUrl = await uploadPdfToCloudinary(uploadInput, form.caseReferenceNumber);

      if (!uploadUrl) throw new Error("Upload failed: No URL returned");

      setProgress(0.9);
      setProgressMessage("Finalizing...");
      // UPDATE FIREBASE
      await update(ref(db, `cases/${caseId}`), {
        formCompleted: true,
        filledForm: {
          url: uploadUrl,
          updatedAt: new Date().toISOString()
        },
        ...form
      });

      setProgress(1.0);
      Alert.alert("Success", "CES PDF generated & uploaded!");
      navigation.goBack();
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to generate PDF");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 50 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>CES Form</Text>
      </View>

      {Object.keys(TEXT_FIELDS).filter(k => k !== 'detailsVerified').map(k => (
        <View key={k} style={styles.inputRow}>
          <TextInput
            placeholder={k}
            style={styles.input}
            value={form[k]}
            onChangeText={v => setForm({ ...form, [k]: v })}
          />
        </View>
      ))}

      <RadioGroup title="Details Verified (ID Proof)" value={form.detailsVerified}
        onChange={v => setForm({ ...form, detailsVerified: v })}
        options={[
          { label: "Gas Bill", value: "Gas Bill" },
          { label: "Aadhar Card", value: "Aadhar Card" },
          { label: "PAN Card", value: "PAN Card" },
          { label: "Ration Card", value: "Ration Card" },
          { label: "GST Certificate", value: "GST Certificate" },
          { label: "Voter ID", value: "Voter ID" },
          { label: "Driving License", value: "Driving License" },
        ]}
      />

      <View style={styles.inputRow}>
        <TextInput
          placeholder="Stay From Date (DD/MM/YYYY)"
          style={styles.input}
          value={form.stayFromDate}
          onChangeText={v => setForm({ ...form, stayFromDate: formatDate(v) })}
          keyboardType="numeric"
          maxLength={10}
        />
      </View>

      <View style={styles.inputRow}>
        <TextInput
          placeholder="Stay To Date (DD/MM/YYYY)"
          style={styles.input}
          value={form.stayToDate}
          onChangeText={v => setForm({ ...form, stayToDate: formatDate(v) })}
          keyboardType={form.stayToDate === "Present" ? "default" : "numeric"}
          maxLength={10}
        />
        <TouchableOpacity onPress={() => setForm({ ...form, stayToDate: "Present" })} style={{ paddingHorizontal: 10 }}>
          <Text style={{ color: "#007AFF", fontWeight: "bold", fontSize: 12 }}>Present</Text>
        </TouchableOpacity>
      </View>

      <RadioGroup title="Type of Address" value={form.addressType}
        onChange={v => setForm({ ...form, addressType: v })}
        options={[
          { label: "Current", value: "current" },
          { label: "Permanent", value: "permanent" },
          { label: "Former", value: "former" },
        ]}
      />

      <RadioGroup title="Residence Type" value={form.residenceType}
        onChange={v => setForm({ ...form, residenceType: v })}
        options={[
          { label: "Owned", value: "owned" },
          { label: "Rented", value: "rented" },
          { label: "Hostel", value: "hostel" },
          { label: "Relative", value: "relative" },
          { label: "Other", value: "other" },
        ]}
      />

      <TextInput
        placeholder="Marital Status"
        style={styles.input}
        value={form.maritalStatus}
        onChangeText={v => setForm({ ...form, maritalStatus: v })}
      />

      <RadioGroup title="Nature of Location" value={form.locationType}
        onChange={v => setForm({ ...form, locationType: v })}
        options={[
          { label: "Rural", value: "rural" },
          { label: "Semi Urban", value: "semiUrban" },
          { label: "Urban", value: "urban" },
        ]}
      />

      <RadioGroup title="Site Visit Photographs Taken" value={form.siteVisit}
        onChange={v => setForm({ ...form, siteVisit: v })}
        options={[
          { label: "Yes", value: "yes" },
          { label: "No", value: "no" },
        ]}
      />

      <RadioGroup title="Status of Verification" value={form.verificationStatus}
        onChange={v => setForm({ ...form, verificationStatus: v })}
        options={[
          { label: "Verified", value: "verified" },
          { label: "Discrepancy", value: "discrepancy" },
          { label: "Insufficient", value: "insufficient" },
          { label: "Unable", value: "unable" },
        ]}
      />

      <View style={styles.inputRow}>
        <TextInput
          placeholder="Remarks"
          style={styles.input}
          value={form.remarks}
          onChangeText={v => setForm({ ...form, remarks: v })}
        />
      </View>

      {/* SIGNATURES */}
      {[
        { key: "respondentSignature", label: "Respondent Signature" },
        { key: "fieldExecutiveSignature", label: "Field Executive Signature" }
      ].map(item => (
        <View key={item.key} style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>{item.label}</Text>
          <TouchableOpacity style={styles.sig} onPress={() => setSigningField(item.key)}>
            {form[item.key] ? (
              <Image
                source={{ uri: `data:image/png;base64,${form[item.key]}` }}
                style={{ width: "100%", height: "100%", resizeMode: "contain" }}
              />
            ) : (
              <Text>Tap to Sign</Text>
            )}
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity style={styles.submit} onPress={generatePdf}>
        <Text style={{ color: "#fff" }}>{saving ? "Saving..." : "Generate PDF"}</Text>
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
            webStyle={`.m-signature-pad--footer { display: flex !important; bottom: 0px; width: 100%; position: absolute; } .m-signature-pad--body { margin-bottom: 60px; } .m-signature-pad--footer .button { background-color: #007AFF; color: #FFF; }`}
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
  headerTitle: { fontSize: 20, fontWeight: "bold" },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ccc', borderRadius: 5, marginBottom: 12 },
  input: { flex: 1, padding: 10 },
  icon: { paddingHorizontal: 10 },

  sig: { height: 90, borderWidth: 1, marginBottom: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#e0e0e0" },
  submit: { backgroundColor: "green", padding: 16, alignItems: "center" },
  group: { marginBottom: 16 },
  groupTitle: { fontWeight: "bold", marginBottom: 8 },
  radio: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  circle: { width: 18, height: 18, borderWidth: 1, marginRight: 8, borderRadius: 9 },
  checked: { backgroundColor: "black" },
  close: { position: "absolute", top: 50, left: 20, backgroundColor: "red", padding: 10, borderRadius: 5, zIndex: 100 },
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
