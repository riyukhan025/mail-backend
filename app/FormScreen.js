import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
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
  respondent: { x: 150, y: 195, width: 160, height: 45 },
  fieldExecutive: { x: 360, y: 140, width: 160, height: 45 },
};

/* ================= MARITAL STATUS COORDS ================= */
// Adjust these coordinates to cover the "Divorced" text on the PDF
const MARITAL_COORDS = { x: 150, y: 375, width: 200, height: 20 };

/* ================= CLOUDINARY CONFIG ================= */
const CLOUD_NAME = "dfpykheky";
const UPLOAD_PRESET = "cases_upload";

async function uploadPdfToCloudinary(pdfUri, caseId) {
  const formData = new FormData();
  formData.append('file', {
    uri: pdfUri,
    type: 'application/pdf',
    name: `CES_${caseId}.pdf`,
  });
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', `cases/${caseId}`);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`, { method: 'POST', body: formData });
  const data = await response.json();
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

    respondentSignature: "",
    fieldExecutiveSignature: "",
  });

  /* ================= LOAD ================= */
  useEffect(() => {
    (async () => {
      const snap = await get(ref(db, `cases/${caseId}`));
      const data = snap.val() || {};
      setForm(f => ({
        ...f,
        caseReferenceNumber: data.RefNo || caseId,
        candidateName: data.candidateName || "",
        address: data.address || "",
      }));
      setLoading(false);
    })();
  }, []);

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
    pdfDoc.getPages()[0].drawImage(img, coords);
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
      const base64 = await FileSystem.readAsStringAsync(asset.localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const pdfDoc = await PDFDocument.load(
        Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      );
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

      pdfForm.flatten();

      /* ================= DRAW OVERLAY AFTER FLATTEN ================= */
      if (form.maritalStatus) {
        const page = pdfDoc.getPages()[0];
        // 1. Draw White Rectangle (Mask) over the flattened "Divorced" text
        page.drawRectangle({ x: MARITAL_COORDS.x, y: MARITAL_COORDS.y, width: MARITAL_COORDS.width, height: MARITAL_COORDS.height, color: rgb(1, 1, 1) });

        // 2. Draw New Text
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        page.drawText(form.maritalStatus, {
          x: MARITAL_COORDS.x + 2,
          y: MARITAL_COORDS.y + 4,
          size: 10,
          font,
          color: rgb(0, 0, 0),
        });
      }

      setProgress(0.7);
      setProgressMessage("Saving PDF...");
      const out = await pdfDoc.saveAsBase64();
      const path = FileSystem.documentDirectory + `CES_${form.caseReferenceNumber}.pdf`;
      await FileSystem.writeAsStringAsync(path, out, {
        encoding: FileSystem.EncodingType.Base64,
      });

      setProgress(0.8);
      setProgressMessage("Uploading to Cloud...");
      // UPLOAD TO CLOUDINARY
      const uploadUrl = await uploadPdfToCloudinary(path, form.caseReferenceNumber);

      setProgress(0.9);
      setProgressMessage("Finalizing...");
      // UPDATE FIREBASE
      await update(ref(db, `cases/${caseId}`), {
        formCompleted: true,
        filledForm: {
          url: uploadUrl,
          updatedAt: new Date().toISOString()
        }
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
    <ScrollView style={{ padding: 16 }}>
      {Object.keys(TEXT_FIELDS).map(k => (
        <TextInput
          key={k}
          placeholder={k}
          style={styles.input}
          value={form[k]}
          onChangeText={v => setForm({ ...form, [k]: v })}
        />
      ))}

      <TextInput
        placeholder="Stay From Date (DD-MM-YYYY)"
        style={styles.input}
        value={form.stayFromDate}
        onChangeText={v => setForm({ ...form, stayFromDate: v })}
      />

      <TextInput
        placeholder="Stay To Date (DD-MM-YYYY)"
        style={styles.input}
        value={form.stayToDate}
        onChangeText={v => setForm({ ...form, stayToDate: v })}
      />

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

      {/* SIGNATURES */}
      {["respondentSignature", "fieldExecutiveSignature"].map(f => (
        <TouchableOpacity key={f} style={styles.sig} onPress={() => setSigningField(f)}>
          {form[f] ? (
            <Image
              source={{ uri: `data:image/png;base64,${form[f]}` }}
              style={{ width: "100%", height: "100%", resizeMode: "contain" }}
            />
          ) : (
            <Text>Tap to Sign</Text>
          )}
        </TouchableOpacity>
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
  input: { borderWidth: 1, padding: 10, marginBottom: 12 },
  sig: { height: 90, borderWidth: 1, marginBottom: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#e0e0e0" },
  submit: { backgroundColor: "green", padding: 16, alignItems: "center" },
  group: { marginBottom: 16 },
  groupTitle: { fontWeight: "bold", marginBottom: 8 },
  radio: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  circle: { width: 18, height: 18, borderWidth: 1, marginRight: 8, borderRadius: 9 },
  checked: { backgroundColor: "black" },
  close: { position: "absolute", top: 40, right: 20, backgroundColor: "red", padding: 10 },
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
