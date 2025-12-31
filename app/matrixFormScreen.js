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
  matrixRefNo: "Textbox1",
  candidateName: "Textbox2",
  verificationDateTime: "Textbox3",
  candidateAddressPeriod: "Textbox4",
  respondentPeriodStay: "Textbox5",
  modeOfConfirmation: "Textbox6",
  respondentName: "Textbox7",
  respondentRelationship: "Textbox8",
  residenceStatus: "Textbox9",
  addressProofDetails: "Textbox10",

  /* ✅ Neighbour Confirmation (YES / NO / NA) */
  neighbourConfirmation: "Textbox11",

  landmark: "Textbox15",
  policeStation: "Textbox16",
  verificationComments: "Textbox17",
};

/* ✅ Nature of Location Checkboxes */
const NATURE_LOCATION_CHECK = {
  lower: "Check Box12",
  middle: "Check Box13",
  upper: "Check Box14",
};

/* ================= SIGNATURE POSITIONS ================= */
const SIGNATURE_COORDS = {
  respondent: { x: 100, y: 160, width: 180, height: 45 },
  matrixRep: { x: 360, y: 160, width: 180, height: 45 },
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

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`,
    { method: "POST", body: formData }
  );
  const data = await response.json();
  return data.secure_url;
}

/* ================= COMPONENT ================= */

export default function MatrixPVFormScreen() {
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

    /* Nature of Location */
    natureLocation: {
      lower: false,
      middle: false,
      upper: false,
    },

    respondentSignature: "",
    matrixRepSignature: "",
  });

  /* ================= LOAD DATA ================= */
  useEffect(() => {
    if (!caseId) return;
    firebase.database().ref(`cases/${caseId}`).once("value").then(snapshot => {
      const data = snapshot.val();
      if (data) {
        setForm(prev => ({
          ...prev,
          matrixRefNo: data.matrixRefNo || data.RefNo || "",
          candidateName: data.candidateName || "",
          candidateAddressPeriod: data.address || "",
        }));
      }
    });
  }, [caseId]);

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

      const asset = Asset.fromModule(
        require("../assets/Matrix_Form.pdf")
      );
      await asset.downloadAsync();

      const base64 = await FileSystem.readAsStringAsync(asset.localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const pdfDoc = await PDFDocument.load(
        Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      );

      const pdfForm = pdfDoc.getForm();

      /* TEXT FIELDS */
      Object.entries(TEXT_FIELDS).forEach(([key, acro]) => {
        if (form[key]) {
          pdfForm.getTextField(acro).setText(form[key]);
        }
      });

      /* Nature of Location */
      Object.entries(NATURE_LOCATION_CHECK).forEach(([key, acro]) => {
        try {
          const cb = pdfForm.getCheckBox(acro);
          if (form.natureLocation[key]) {
            cb.check();
          } else {
            cb.uncheck();
          }
        } catch (err) {
          console.log(`Checkbox ${acro} not found`);
        }
      });

      /* SIGNATURES */
      await embedSignature(pdfDoc, form.respondentSignature, SIGNATURE_COORDS.respondent);
      await embedSignature(pdfDoc, form.matrixRepSignature, SIGNATURE_COORDS.matrixRep);

      pdfForm.flatten();

      const out = await pdfDoc.saveAsBase64();
      const path =
        FileSystem.documentDirectory +
        `MatrixPV_${form.matrixRefNo || caseId}.pdf`;

      await FileSystem.writeAsStringAsync(path, out, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const uploadUrl = await uploadPdfToCloudinary(
        path,
        form.matrixRefNo || caseId
      );

      await firebase.database().ref(`cases/${caseId}`).update({
        formCompleted: true,
        filledForm: {
          url: uploadUrl,
          updatedAt: new Date().toISOString(),
        },
      });

      Alert.alert("Success", "Matrix PV PDF Generated & Uploaded");
      navigation.goBack();
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Matrix PDF generation failed");
    } finally {
      setSaving(false);
    }
  };

  /* ================= UI ================= */

  return (
    <ScrollView style={{ padding: 16 }}>
      <Text style={styles.headerTitle}>
        Matrix Residential Address Check
      </Text>

      {Object.keys(TEXT_FIELDS).map(k => (
        <TextInput
          key={k}
          placeholder={k === "neighbourConfirmation"
            ? "Address confirmed with Neighbours? (Yes / No / NA)"
            : k}
          style={styles.input}
          value={form[k]}
          onChangeText={v => setForm({ ...form, [k]: v })}
        />
      ))}

      <Text style={styles.title}>Nature of Location</Text>

      {Object.keys(NATURE_LOCATION_CHECK).map(k => (
        <TouchableOpacity
          key={k}
          style={styles.checkboxRow}
          onPress={() =>
            setForm(f => ({
              ...f,
              natureLocation: {
                lower: false,
                middle: false,
                upper: false,
                [k]: true,
              },
            }))
          }
        >
          <View
            style={[
              styles.checkbox,
              form.natureLocation[k] && styles.checked,
            ]}
          />
          <Text>{k.toUpperCase()}</Text>
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
  headerTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 20, textAlign: "center" },
  input: { borderWidth: 1, borderColor: "#ccc", padding: 10, marginBottom: 12, borderRadius: 5 },
  title: { fontSize: 16, fontWeight: "bold", marginTop: 10, marginBottom: 10 },
  checkboxRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  checkbox: { width: 20, height: 20, borderWidth: 1, marginRight: 10 },
  checked: { backgroundColor: "#000" },
  sig: { height: 100, borderWidth: 1, marginBottom: 20, justifyContent: "center", alignItems: "center" },
  sigImg: { width: "100%", height: "100%", resizeMode: "contain" },
  submit: { backgroundColor: "#007AFF", padding: 15, alignItems: "center", borderRadius: 5 },
  close: { backgroundColor: "#FF3B30", padding: 10, alignItems: "center", margin: 20, borderRadius: 5 },
});
