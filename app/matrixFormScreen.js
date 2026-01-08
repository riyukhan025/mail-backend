import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Modal,
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
import firebase from "../firebase";

/* ================= ACROFIELDS ================= */

const TEXT_FIELDS = {
  candidateName: "Multi_1",
  verificationDateTime: "Multi_2",
  candidateAddressPeriod: "Multi_3",
  respondentPeriodStay: "Multi_4",
  modeOfConfirmation: "Multi_5",
  respondentName: "Multi_6",
  respondentRelationship: "Multi_7",
  residenceStatus: "Multi_8",
  addressProofDetails: "Multi_9",
  neighbourConfirmation: "Multi_10",
  landmark: "Multi_11",
  policeStation: "Multi_12",
  verificationComments: "Multi_13",
  matrixRepNameDate: "Multi_14",
  matrixRefNo: "Multi_16",
};

/* ✅ Address Proof Checkboxes */
const CHECKBOX_FIELDS = {
  Lowerclass: "Check_1",
  middleclass: "Check_2",
  upperclass: "Check_3",
};

/* ================= SIGNATURE POSITIONS ================= */
const SIGNATURE_COORDS = {
  respondent: { x: 190, y: 240, width: 180, height: 45 },
  matrixRep: { x: 190, y: 195, width: 180, height: 45 },
};

/* ================= CLOUDINARY CONFIG ================= */
const CLOUD_NAME = "dfpykheky";
const UPLOAD_PRESET = "cases_upload";

async function uploadPdfToCloudinary(pdfUri, identifier) {
  const formData = new FormData();
  formData.append("file", {
    uri: pdfUri,
    type: "application/pdf",
    name: `Matrix_${identifier}.pdf`,
  });
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", `cases/${identifier}`);
  // Fix: Explicitly set resource_type to 'raw' for PDFs to avoid timeouts/errors on large files
  formData.append("resource_type", "raw");

  console.log("Uploading PDF to Cloudinary...");
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`,
    { method: "POST", body: formData }
  );
  const data = await response.json();
  if (data.error) {
    console.error("Cloudinary Error:", data.error);
    throw new Error(data.error.message || "Cloudinary upload failed");
  }
  return data.secure_url;
}

/* ================= COMPONENT ================= */

export default function MatrixFormScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { caseId } = route.params || {};

  const [saving, setSaving] = useState(false);
  const [signingField, setSigningField] = useState(null);

  const [form, setForm] = useState({
    matrixRefNo: "",
    candidateName: "",
    verificationDateTime: "",
    candidateAddressPeriod: "",
    respondentPeriodStay: "",
    modeOfConfirmation: "",
    respondentName: "",
    respondentRelationship: "",
    residenceStatus: "",
    addressProofDetails: "",

    /* ✅ NEW */
    neighbourConfirmation: "",

    landmark: "",
    policeStation: "",
    verificationComments: "",
    matrixRepNameDate: "",

    natureLocation: "",
    addressProof: {
      gasBill: false,
      rationCard: false,
      voterId: false,
    },

    respondentSignature: "",
    matrixRepSignature: "",
  });

  /* ================= LOAD DATA ================= */
  useEffect(() => {
    if (!caseId) return;

    const loadData = (data) => {
      if (!data) return;
        setForm(prev => ({
          ...prev,
          matrixRefNo: data.matrixRefNo || data.RefNo || "",
          candidateName: data.candidateName || "",
          verificationDateTime: data.verificationDateTime || "",
          candidateAddressPeriod: data.candidateAddressPeriod || data.address || "",
          respondentPeriodStay: data.respondentPeriodStay || "",
          modeOfConfirmation: data.modeOfConfirmation || "",
          respondentName: data.respondentName || "",
          respondentRelationship: data.respondentRelationship || "",
          residenceStatus: data.residenceStatus || "",
          addressProofDetails: data.addressProofDetails || "",
          neighbourConfirmation: data.neighbourConfirmation || "",
          landmark: data.landmark || "",
          policeStation: data.policeStation || "",
          verificationComments: data.verificationComments || "",
          matrixRepNameDate: data.matrixRepNameDate || "",
          natureLocation: data.natureLocation || "",
          addressProof: data.addressProof || prev.addressProof,
          respondentSignature: data.respondentSignature || "",
          matrixRepSignature: data.matrixRepSignature || "",
        }));
    };

    if (route.params?.existingData) {
      loadData(route.params.existingData);
    } else {
      firebase.database().ref(`cases/${caseId}`).once("value").then(snapshot => {
        loadData(snapshot.val());
      });
    }
  }, [caseId, route.params]);

  /* ================= SIGNATURE HANDLER ================= */

  const handleSignature = sig => {
    if (!sig || sig === "data:,") return;
    const clean = sig.replace("data:image/png;base64,", "");
    setForm(f => ({ ...f, [signingField]: clean }));
    setSigningField(null);
  };

  const embedSignature = async (pdfDoc, base64, coords) => {
    if (!base64) return;
    const png = await pdfDoc.embedPng(
      Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    );
    pdfDoc.getPages()[0].drawImage(png, coords);
  };

  /* ================= PDF GENERATION ================= */

  const generatePdf = async () => {
    try {
      setSaving(true);
      console.log("Starting PDF generation...");

      const asset = Asset.fromModule(
        require("../assets/Matrix_Form.pdf")
      );
      console.log("Downloading asset...");
      await asset.downloadAsync();

      console.log("Reading asset...");
      const base64 = await FileSystem.readAsStringAsync(asset.localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log("Loading PDF document...");
      const pdfDoc = await PDFDocument.load(
        Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      );

      const pdfForm = pdfDoc.getForm();

      console.log("Filling form fields...");
      /* TEXT FIELDS */
      Object.entries(TEXT_FIELDS).forEach(([key, acro]) => {
        if (form[key]) {
          pdfForm.getTextField(acro).setText(form[key]);
        }
      });

      /* CHECKBOXES */
      Object.entries(CHECKBOX_FIELDS).forEach(([key, acro]) => {
        try {
          const cb = pdfForm.getCheckBox(acro);
          if (form.addressProof[key]) {
            cb.check();
          } else {
            cb.uncheck();
          }
        } catch (err) {
          console.log(`Checkbox ${acro} not found: ${err.message}`);
        }
      });

      /* SIGNATURES */
      console.log("Embedding signatures...");
      await embedSignature(pdfDoc, form.respondentSignature, SIGNATURE_COORDS.respondent);
      await embedSignature(pdfDoc, form.matrixRepSignature, SIGNATURE_COORDS.matrixRep);

      console.log("Flattening PDF...");
      pdfForm.flatten();

      console.log("Saving PDF...");
      const out = await pdfDoc.saveAsBase64();
      const path =
        FileSystem.documentDirectory +
        `MatrixPV_${form.matrixRefNo || caseId}.pdf`;

      await FileSystem.writeAsStringAsync(path, out, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log("Uploading PDF...");
      const uploadUrl = await uploadPdfToCloudinary(
        path,
        form.matrixRefNo || caseId
      );

      console.log("Updating Firebase...");
      await firebase.database().ref(`cases/${caseId}`).update({
        formCompleted: true,
        filledForm: {
          url: uploadUrl,
          updatedAt: new Date().toISOString(),
        },
        ...form
      });

      Alert.alert("Success", "Matrix PV PDF Generated & Uploaded");
      navigation.goBack();
    } catch (e) {
      console.error("PDF Generation Error:", e);
      Alert.alert("Error", "Matrix PDF generation failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  /* ================= UI ================= */

  return (
    <ScrollView style={{ padding: 16 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          Matrix Residential Address Check
        </Text>
      </View>

      {Object.keys(TEXT_FIELDS).map(k => {
        const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

        if (k === 'verificationDateTime') {
          return (
            <View key={k} style={styles.fieldContainer}>
              <Text style={styles.label}>{label}</Text>
              <View style={styles.inputRow}>
                <TextInput
                  placeholder={label}
                  style={styles.input}
                  value={form[k]}
                  onChangeText={v => setForm({ ...form, [k]: v })}
                />
                <TouchableOpacity onPress={() => {
                  const now = new Date();
                  const dateTimeStr = `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
                  setForm({ ...form, verificationDateTime: dateTimeStr });
                }}>
                  <Ionicons name="time-outline" size={24} color="black" style={styles.icon} />
                </TouchableOpacity>
              </View>
            </View>
          );
        }
        return (
          <View key={k} style={styles.fieldContainer}>
            <Text style={styles.label}>{label}</Text>
            <TextInput
              placeholder={k === "neighbourConfirmation" ? "Address confirmed with Neighbours? (Yes / No / NA)" : `Enter ${label}`}
              style={styles.textInput}
              value={form[k]}
              onChangeText={v => setForm({ ...form, [k]: v })}
            />
          </View>
        );
      })}

      <Text style={styles.title}>Address Proof Verified</Text>
      {Object.keys(CHECKBOX_FIELDS).map(k => (
        <TouchableOpacity
          key={k}
          style={styles.checkboxRow}
          onPress={() =>
            setForm(f => ({
              ...f,
              addressProof: { ...f.addressProof, [k]: !f.addressProof[k] }
            }))
          }
        >
          <View
            style={[
              styles.checkbox,
              form.addressProof[k] && styles.checked,
            ]}
          />
          <Text>
            {k === 'voterId' 
              ? 'Voter ID / Other' 
              : k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
            }
          </Text>
        </TouchableOpacity>
      ))}

      {/* SIGNATURES */}
      <TouchableOpacity
        style={styles.sig}
        onPress={() => setSigningField("respondentSignature")}
      >
        {form.respondentSignature ? (
          <Image
            source={{ uri: `data:image/png;base64,${form.respondentSignature}` }}
            style={styles.sigImg}
          />
        ) : (
          <Text>Tap to Sign (Respondent)</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.sig}
        onPress={() => setSigningField("matrixRepSignature")}
      >
        {form.matrixRepSignature ? (
          <Image
            source={{ uri: `data:image/png;base64,${form.matrixRepSignature}` }}
            style={styles.sigImg}
          />
        ) : (
          <Text>Tap to Sign (Matrix Representative)</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.submit} onPress={generatePdf}>
        <Text style={{ color: "#fff" }}>
          {saving ? "Generating..." : "Generate Matrix PDF"}
        </Text>
      </TouchableOpacity>

      <Modal visible={!!signingField} animationType="slide">
        <View style={{ flex: 1 }}>
          <SignatureScreen
            onOK={handleSignature}
            onEnd={() => {}}
            autoClear={false}
            descriptionText="Sign above"
            clearText="Clear"
            confirmText="Save"
            webStyle={`.m-signature-pad--footer { display: flex !important; bottom: 0px; width: 100%; position: absolute; } .m-signature-pad--footer .button { background-color: #007AFF; color: #FFF; }`}
          />
          <TouchableOpacity
            style={styles.close}
            onPress={() => setSigningField(null)}
          >
            <Text style={{ color: "#fff" }}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backButton: { marginRight: 15 },
  headerTitle: { fontSize: 20, fontWeight: "bold", textAlign: "center", flex: 1 },
  fieldContainer: { marginBottom: 15 },
  label: { fontSize: 14, fontWeight: "bold", color: "#333", marginBottom: 5 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ccc', borderRadius: 5, backgroundColor: '#fff' },
  input: { flex: 1, padding: 10 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 5, padding: 10, backgroundColor: "#fff", fontSize: 16 },
  icon: { paddingHorizontal: 10 },

  title: { fontSize: 16, fontWeight: "bold", marginTop: 10, marginBottom: 10 },
  checkboxRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  checkbox: { width: 20, height: 20, borderWidth: 1, marginRight: 10 },
  checked: { backgroundColor: "#000" },
  radioBtn: { padding: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 5 },
  radioBtnSelected: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  radioText: { color: '#000' },
  radioTextSelected: { color: '#fff' },
  sig: { height: 100, borderWidth: 1, marginBottom: 20, justifyContent: "center", alignItems: "center" },
  sigImg: { width: "100%", height: "100%", resizeMode: "contain" },
  submit: { backgroundColor: "#007AFF", padding: 15, alignItems: "center", borderRadius: 5 },
  close: { backgroundColor: "#FF3B30", padding: 10, alignItems: "center", margin: 20, borderRadius: 5 },
});
