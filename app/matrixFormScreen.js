import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
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
import { PDFDocument, PDFName } from "pdf-lib";
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
    respondent: { x: 305, y: 240, width: 160, height: 30 },
    matrixRep: { x: 305, y: 215, width: 160, height: 28 },
  };

/* ================= CLOUDINARY CONFIG ================= */
const CLOUD_NAME = "dfpykheky";
const UPLOAD_PRESET = "cases_upload";

async function uploadPdfToCloudinary(pdfData, identifier) {
  const formData = new FormData();
  const timestamp = Date.now();
  
  if (Platform.OS === 'web') {
    // Convert base64 to Blob to ensure filename is preserved in Cloudinary raw upload
    const binaryString = atob(pdfData);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    formData.append("file", blob, `Matrix_${identifier}_${timestamp}.pdf`);
  } else {
    formData.append("file", {
      uri: pdfData,
      type: "application/pdf",
      name: `Matrix_${identifier}_${timestamp}.pdf`,
    });
  }

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
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
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
      setLoading(false);
    } else {
      firebase.database().ref(`cases/${caseId}`).once("value").then(snapshot => {
        loadData(snapshot.val());
        setLoading(false);
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
    const dims = png.scaleToFit(coords.width, coords.height);
    const x = coords.x + (coords.width - dims.width) / 2;
    const y = coords.y + (coords.height - dims.height) / 2;
    pdfDoc.getPages()[0].drawImage(png, { x, y, width: dims.width, height: dims.height });
  };

  /* ================= PDF GENERATION ================= */

  const generatePdf = async () => {
    try {
      setSaving(true);
      setProgress(0.1);
      setProgressMessage("Initializing...");
      console.log("Starting PDF generation...");

      const asset = Asset.fromModule(
        require("../assets/Matrix_Form.pdf")
      );
      console.log("Downloading asset...");
      await asset.downloadAsync();

      setProgress(0.2);
      setProgressMessage("Reading template...");
      console.log("Reading asset...");
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

      /* FIX MATRIX BLUE BOX ISSUE - Set default appearance */
      pdfForm.getFields().forEach(field => {
        try {
          field.acroField.setDefaultAppearance('/Helv 9 Tf 0 g');
        } catch (e) {}
      });

      setProgress(0.4);
      setProgressMessage("Filling form data...");
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
      setProgress(0.6);
      setProgressMessage("Embedding signatures...");
      console.log("Embedding signatures...");
      await embedSignature(pdfDoc, form.respondentSignature, SIGNATURE_COORDS.respondent);
      await embedSignature(pdfDoc, form.matrixRepSignature, SIGNATURE_COORDS.matrixRep);

      /* FIX MATRIX BLUE BOX ISSUE - Update appearances and flatten */
      try {
        pdfForm.updateFieldAppearances();
      } catch (e) {
        console.log("Error updating field appearances:", e);
      }

      // Fix for blue boxes: make all fields read-only before flattening
      pdfForm.getFields().forEach(field => {
        try {
          field.enableReadOnly();
        } catch (e) {
          console.log("Field read-only error (ignored):", e);
        }
      });

      console.log("Flattening PDF...");
      pdfForm.flatten();

      // Nuclear option: Remove all annotations to ensure no blue boxes
      pdfDoc.getPages().forEach(page => {
        page.node.delete(PDFName.of('Annots'));
      });

      setProgress(0.7);
      setProgressMessage("Saving PDF...");
      console.log("Saving PDF...");
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
        const path = FileSystem.documentDirectory + `MatrixPV_${form.matrixRefNo || caseId}.pdf`;
        await FileSystem.writeAsStringAsync(path, out, {
          encoding: FileSystem.EncodingType.Base64,
        });
        uploadInput = path;
      }

      setProgress(0.8);
      setProgressMessage("Uploading to Cloud...");
      console.log("Uploading PDF...");
      const uploadUrl = await uploadPdfToCloudinary(
        uploadInput,
        form.matrixRefNo || caseId
      );

      setProgress(0.9);
      setProgressMessage("Finalizing...");
      console.log("Updating Firebase...");
      await firebase.database().ref(`cases/${caseId}`).update({
        formCompleted: true,
        filledForm: {
          url: uploadUrl,
          updatedAt: new Date().toISOString(),
        },
        ...form
      });

      setProgress(1.0);
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

  if (loading) return <ActivityIndicator style={{ marginTop: 50 }} size="large" color="#007AFF" />;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
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

        // 1. Verification Date Time (Clock Button)
        if (k === "verificationDateTime") {
          return (
            <View key={k} style={styles.fieldContainer}>
              <Text style={styles.label}>{label}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={[styles.textInput, { flex: 1 }]}
                  value={form[k]}
                  onChangeText={v => setForm({ ...form, [k]: v })}
                  placeholder="DD/MM/YYYY HH:mm"
                />
                <TouchableOpacity onPress={() => {
                  const now = new Date();
                  const str = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
                  setForm({ ...form, [k]: str });
                }} style={{ padding: 10 }}>
                  <Ionicons name="time-outline" size={24} color="#007AFF" />
                </TouchableOpacity>
              </View>
            </View>
          );
        }

        // 2. Respondent Period Stay (Number + Years)
        if (k === "respondentPeriodStay") {
          return (
            <View key={k} style={styles.fieldContainer}>
              <Text style={styles.label}>{label}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={[styles.textInput, { flex: 1 }]}
                  keyboardType="numeric"
                  value={form[k] ? form[k].replace(" Years", "") : ""}
                  onChangeText={v => setForm({ ...form, [k]: v ? v + " Years" : "" })}
                  placeholder="Enter number"
                />
                <Text style={{ marginLeft: 10, fontWeight: 'bold' }}>Years</Text>
              </View>
            </View>
          );
        }

        // 3. Residence Status (Dropdown)
        if (k === "residenceStatus") {
          return (
            <View key={k} style={styles.fieldContainer}>
              <Text style={styles.label}>{label}</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={form[k]}
                  onValueChange={(v) => setForm({ ...form, [k]: v })}
                  style={styles.picker}
                >
                  <Picker.Item label="Select Status..." value="" />
                  <Picker.Item label="Owned" value="Owned" />
                  <Picker.Item label="Rented" value="Rented" />
                  <Picker.Item label="PG" value="PG" />
                  <Picker.Item label="Hostel" value="Hostel" />
                  <Picker.Item label="Relative" value="Relative" />
                  <Picker.Item label="Other" value="Other" />
                </Picker>
              </View>
            </View>
          );
        }

        // 4. Address Proof Details (Dropdown + Other)
        if (k === "addressProofDetails") {
          const proofOptions = ["Ration Card", "Gas Bill", "Aadhar Card", "PAN Card", "GST", "Other"];
          const currentVal = form[k];
          const isCustom = currentVal && !proofOptions.includes(currentVal) && currentVal !== "Other";
          const pickerVal = isCustom ? "Other" : currentVal;

          return (
            <View key={k} style={styles.fieldContainer}>
              <Text style={styles.label}>{label}</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={pickerVal}
                  onValueChange={(v) => {
                    if (v === "Other") setForm({ ...form, [k]: "Other" });
                    else setForm({ ...form, [k]: v });
                  }}
                  style={styles.picker}
                >
                  <Picker.Item label="Select Proof..." value="" />
                  {proofOptions.map(o => <Picker.Item key={o} label={o} value={o} />)}
                </Picker>
              </View>
              {(pickerVal === "Other") && (
                <TextInput
                  placeholder="Enter Other Proof Details"
                  style={[styles.textInput, { marginTop: 10 }]}
                  value={isCustom ? currentVal : ""}
                  onChangeText={v => setForm({ ...form, [k]: v })}
                />
              )}
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
      {[
        { key: "respondentSignature", label: "Matrix Representative Signature" },
        { key: "matrixRepSignature", label: "Respondent Signature" }
      ].map(item => (
        <View key={item.key} style={{ marginBottom: 12 }}>
          <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>{item.label}</Text>
          <TouchableOpacity style={styles.sig} onPress={() => setSigningField(item.key)}>
            {form[item.key] ? (
              <Image
                source={{ uri: `data:image/png;base64,${form[item.key]}` }}
                style={styles.sigImg}
              />
            ) : (
              <Text>Tap to Sign</Text>
            )}
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity style={styles.submit} onPress={generatePdf}>
        <Text style={{ color: "#fff" }}>{saving ? "Saving..." : "Generate Matrix PDF"}</Text>
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
            trimWhitespace={true}
            minWidth={3}
            maxWidth={5}
            webStyle={`.m-signature-pad--footer { display: flex !important; bottom: 0px; width: 100%; position: absolute; } .m-signature-pad--body { margin-bottom: 60px; } .m-signature-pad--footer .button { background-color: #007AFF; color: #FFF; }`}
          />
          <TouchableOpacity
            style={styles.close}
            onPress={() => setSigningField(null)}
          >
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
  pickerContainer: { borderWidth: 1, borderColor: '#ccc', borderRadius: 5, backgroundColor: '#fff', overflow: 'hidden' },
  picker: { height: 50, width: '100%' },
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
