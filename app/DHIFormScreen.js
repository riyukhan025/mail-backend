import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
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
import WebSignaturePad from "./WebSignaturePad";

import { useNavigation, useRoute } from "@react-navigation/native";
import { get, getDatabase, ref, update } from "firebase/database";

const RELATIONSHIP_OPTIONS = [
  "Self",
  "Father",
  "Mother",
  "Husband",
  "Wife",
  "Son",
  "Daughter",
  "Brother",
  "Sister",
  "Father-in-law",
  "Mother-in-law",
  "Brother-in-law",
  "Sister-in-law",
  "Uncle",
  "Aunt",
  "Grandfather",
  "Grandmother",
  "Neighbour",
  "Other",
];

/* ================= ACROFIELDS (DHI RESIDENCE) ================= */
const DHI_FIELD_LAYOUT = [
  {
    section: "Case Details",
    fields: [
      { key: "caseReferenceNumber", label: "Case Ref. No.", pdfName: "text_14v1i", type: "text" },
      { key: "dateOfInitiation", label: "Date of Initiation", pdfName: "text_26y6i", type: "text" },
      { key: "candidateName", label: "Candidate's Name", pdfName: "text_35y0m", type: "text" },
      { key: "candidateAddressPhone", label: "Address & Phone Number Given by Candidate", pdfName: "textarea_42g1b", type: "text" },
      { key: "periodOfStayFrom", label: "Period of Stay - From (DD/MM/YY)", pdfName: "text_379r6c", type: "text" },
      { key: "periodOfStayTo", label: "Period of Stay - To (DD/MM/YY)", pdfName: "text_380n0r", type: "text" },
    ],
  },
  {
    section: "Nature of Residence",
    fields: [
      { key: "ownHouse", label: "Own House", pdfName: "checkbox_52e5p", type: "checkbox" },
      { key: "rental", label: "Rental", pdfName: "checkbox_67h2x", type: "checkbox" },
      { key: "payingGuest", label: "Paying Guest (PG)", pdfName: "checkbox_72v7u", type: "checkbox" },
      { key: "hostel", label: "Hostel", pdfName: "checkbox_85i9c", type: "checkbox" },
      { key: "otherResidence", label: "Others", pdfName: "checkbox_95f0i", type: "checkbox" },
    ],
  },
  {
    section: "Identity Proof Provided",
    fields: [
      { key: "aadhaar", label: "Aadhaar Card", pdfName: "checkbox_109p8s", type: "checkbox" },
      { key: "passport", label: "Passport", pdfName: "checkbox_110f3d", type: "checkbox" },
      { key: "drivingLicense", label: "Driving License", pdfName: "checkbox_129l0i", type: "checkbox" },
      { key: "powerBill", label: "Power Bill", pdfName: "checkbox_138h9k", type: "checkbox" },
      { key: "waterBill", label: "Water Bill", pdfName: "checkbox_140n6v", type: "checkbox" },
      { key: "phoneBill", label: "Phone Bill", pdfName: "checkbox_154x7s", type: "checkbox" },
      { key: "bankStatement", label: "Bank Statement", pdfName: "checkbox_164h5x", type: "checkbox" },
      { key: "creditCardStatement", label: "Credit Card Statement", pdfName: "checkbox_178v5e", type: "checkbox" },
      { key: "electionCard", label: "Election Card", pdfName: "checkbox_188y0c", type: "checkbox" },
      { key: "otherIdentityProof", label: "Other", pdfName: "checkbox_199v8c", type: "checkbox" },
      { key: "identityProofOther", label: "Other Identity Proof (Specify)", pdfName: "text_350q5s", type: "text" },
    ],
  },
  {
    section: "Verified By",
    fields: [
      { key: "candidate", label: "Candidate", pdfName: "checkbox_209y8e", type: "checkbox" },
      { key: "familyMember", label: "Family Member", pdfName: "checkbox_214i6h", type: "checkbox" },
      { key: "neighbour", label: "Neighbour", pdfName: "checkbox_229t0s", type: "checkbox" },
      { key: "landlord", label: "Landlord", pdfName: "checkbox_230s1m", type: "checkbox" },
      { key: "otherVerifier", label: "Other", pdfName: "checkbox_249y1r", type: "checkbox" },
      { key: "verifiedByOther", label: "Other Verifier (Specify)", pdfName: "text_367i0d", type: "text" },
    ],
  },
  {
    section: "Respondent",
    fields: [
      { key: "respondentName", label: "Respondent's Name", pdfName: "text_290v3b", type: "text" },
      { key: "respondentRelationship", label: "Relationship with Candidate", pdfName: "text_303l8t", type: "select" },
    ],
  },
  {
    section: "Verification Details",
    fields: [
      { key: "modeOfVerification", label: "Mode of Verification", type: "manualText" },
    ],
  },
  {
    section: "Internal Use Only",
    fields: [
      { key: "fieldAssistantName", label: "Field Assistant's Name", type: "manualText" },
      { key: "statusClear", label: "Clear / Green", pdfName: "checkbox_260s5m", type: "checkbox" },
      { key: "statusDiscrepant", label: "Discrepant / Red", pdfName: "checkbox_272o1f", type: "checkbox" },
      { key: "statusUnable", label: "Unable to Verify / Orange", pdfName: "checkbox_281q1e", type: "checkbox" },
      { key: "comments", label: "Field Assistant's Comments", type: "manualText" },
      { key: "date", label: "Date", pdfName: "text_321g9z", type: "text" },
      { key: "time", label: "Time", pdfName: "text_335h2z", type: "text" },
    ]
  },
];

const TEXT_FIELDS = Object.fromEntries(
  DHI_FIELD_LAYOUT.flatMap(section =>
    section.fields
      .filter(field => field.pdfName && (field.type === "text" || field.type === "select"))
      .map(field => [field.key, field.pdfName])
  )
);

const CHECKBOX_FIELDS = Object.fromEntries(
  DHI_FIELD_LAYOUT.flatMap(section =>
    section.fields
      .filter(field => field.type === "checkbox")
      .map(field => [field.key, field.pdfName])
  )
);

/* ================= SIGNATURE COORDS ================= */
const SIGNATURE_COORDS = {
  verifier: { x: 151, y: 181, width: 157, height: 31 },
};

/* ================= CLOUDINARY CONFIG ================= */
const CLOUD_NAME = "dfpykheky";
const UPLOAD_PRESET = "cases_upload";

const normalizeBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["true", "yes", "y", "1", "checked", "selected"].includes(normalized);
  }
  return Boolean(value);
};

const hydrateFormFromData = (source = {}) => {
  const now = new Date();
  const address = source.address || source.addressLine1 || "";
  const phone = source.contactNumber || source.phoneNumbers || "";
  const nextForm = {
    caseReferenceNumber: String(source.matrixRefNo || source.RefNo || source.caseReferenceNumber || ""),
    dateOfInitiation: String(source.dateOfInitiation || source.date || now.toLocaleDateString()),
    candidateName: String(source.candidateName || source.applicantName || ""),
    candidateAddressPhone: String(source.candidateAddressPhone || [address, phone].filter(Boolean).join(", ")),
    periodOfStayFrom: String(source.periodOfStayFrom || ""),
    periodOfStayTo: String(source.periodOfStayTo || ""),
    identityProofOther: String(source.identityProofOther || ""),
    verifiedByOther: String(source.verifiedByOther || ""),
    respondentName: String(source.respondentName || ""),
    respondentRelationship: String(source.respondentRelationship || ""),
    fieldAssistantName: String(source.assigneeName || source.fieldAssistantName || ""),
    modeOfVerification: String(
      source.modeOfVerification || source.verificationMode || "Manual/physical"
    ),
    comments: String(source.comments || ""),
    date: String(source.verificationDate || source.date || now.toLocaleDateString()),
    time: String(source.verificationTime || source.time || now.toLocaleTimeString()),
    checkboxes: {},
    verifierSignature: String(source.verifierSignature || ""),
  };

  const checkboxSource = source.checkboxes || source.dhiForm?.checkboxes || {};
  Object.keys(CHECKBOX_FIELDS).forEach((key) => {
    const aliases = {
      statusClear: "clear",
      statusDiscrepant: "discrepant",
      statusUnable: "unableToVerify",
    };
    nextForm.checkboxes[key] = normalizeBoolean(
      checkboxSource[key] ?? checkboxSource[aliases[key]]
    );
  });

  return nextForm;
};

async function uploadPdfToCloudinary(pdfData, caseId) {
  const formData = new FormData();
  const publicId = `DHI_${caseId}_${Date.now()}`;

  if (Platform.OS === 'web') {
    // Convert base64 to Blob to ensure filename is preserved in Cloudinary raw upload
    const binaryString = atob(pdfData);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    formData.append("file", blob, `${publicId}.pdf`);
  } else {
    formData.append('file', {
      uri: pdfData,
      type: 'application/pdf',
      name: `${publicId}.pdf`,
    });
  }
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', `cases/${caseId}`);
  formData.append('public_id', publicId);
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
  const [relationshipPickerVisible, setRelationshipPickerVisible] = useState(false);
  const canGoBack = useRef(false);

  const [form, setForm] = useState({
    caseReferenceNumber: "",
    dateOfInitiation: new Date().toLocaleDateString(),
    candidateName: "",
    candidateAddressPhone: "",
    periodOfStayFrom: "",
    periodOfStayTo: "",
    identityProofOther: "",
    verifiedByOther: "",
    respondentName: "",
    respondentRelationship: "",
    fieldAssistantName: "",
    modeOfVerification: "Manual/physical",
    comments: "",
    date: new Date().toLocaleDateString(),
    time: new Date().toLocaleTimeString(),
    checkboxes: {},
    verifierSignature: "",
  });

  /* ================= LOAD ================= */
  useEffect(() => {
    const loadData = (data) => {
      if (!data) return;
      const hydrated = hydrateFormFromData(data);
      setForm(prev => ({ ...prev, ...hydrated }));
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
  }, [caseId, route.params?.existingData, db]);

  /* ================= BACK HANDLER ================= */
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (canGoBack.current) {
        return;
      }
      e.preventDefault();
      if (Platform.OS === 'web') {
          if (confirm('Discard changes? You have unsaved changes. Are you sure to discard them and leave the screen?')) {
              canGoBack.current = true;
              navigation.dispatch(e.data.action);
          }
      } else {
          Alert.alert(
            'Discard changes?',
            'You have unsaved changes. Are you sure to discard them and leave the screen?',
            [
              { text: "Don't leave", style: 'cancel', onPress: () => {} },
              {
                text: 'Discard',
                style: 'destructive',
                onPress: () => {
                  canGoBack.current = true;
                  navigation.dispatch(e.data.action);
                },
              },
            ]
          );
      }
    });
    return unsubscribe;
  }, [navigation]);

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

      const asset = Asset.fromModule(require("../assets/DHI Residence Template.pdf"));
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
      
      Object.entries(TEXT_FIELDS).forEach(([key, fieldName]) => {
        pdfForm.getTextField(fieldName).setText(form[key] || "");
      });

      Object.entries(CHECKBOX_FIELDS).forEach(([key, fieldName]) => {
        const checkbox = pdfForm.getCheckBox(fieldName);
        if (form.checkboxes[key]) checkbox.check();
        else checkbox.uncheck();
      });
      const selectedCheckboxes = Object.entries(CHECKBOX_FIELDS)
        .filter(([key]) => form.checkboxes[key])
        .map(([, fieldName]) =>
          pdfForm.getCheckBox(fieldName).acroField.getWidgets()[0].getRectangle()
        );

      setProgress(0.6);
      setProgressMessage("Embedding signatures...");
      await embedSignature(pdfDoc, form.verifierSignature, SIGNATURE_COORDS.verifier);

      pdfForm.updateFieldAppearances();
      const page = pdfDoc.getPages()[0];
      const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      if (form.fieldAssistantName) {
        page.drawText(form.fieldAssistantName, {
          x: 155,
          y: 278,
          size: 10,
          font,
          color: rgb(0, 0, 0),
        });
      }
      if (form.modeOfVerification) {
        page.drawText(form.modeOfVerification, {
          x: 442,
          y: 295,
          size: 10,
          font,
          color: rgb(0, 0, 0),
        });
      }
      page.drawRectangle({
        x: 151,
        y: 215,
        width: 430,
        height: 25,
        color: rgb(1, 1, 1),
      });
      if (form.comments.trim()) {
        page.drawText(form.comments.trim(), {
          x: 155,
          y: 229,
          size: 9,
          font,
          color: rgb(0, 0, 0),
          maxWidth: 422,
          lineHeight: 11,
        });
      }

      const signatureField = pdfForm.getField("signature_314b4u");
      const signatureWidget = signatureField.acroField.getWidgets()[0];
      const appearanceField = pdfForm.getTextField("text_14v1i");
      const appearanceWidget = appearanceField.acroField.getWidgets()[0];
      signatureWidget.setNormalAppearance(appearanceWidget.getNormalAppearance());
      pdfForm.removeField(signatureField);

      pdfForm.getFields().forEach(field => field.enableReadOnly());
      pdfForm.flatten();
      selectedCheckboxes.forEach(({ x, y, width, height }) => {
        page.drawLine({
          start: { x: x + width * 0.2, y: y + height * 0.52 },
          end: { x: x + width * 0.43, y: y + height * 0.28 },
          thickness: 1.2,
          color: rgb(0, 0, 0),
        });
        page.drawLine({
          start: { x: x + width * 0.43, y: y + height * 0.28 },
          end: { x: x + width * 0.82, y: y + height * 0.78 },
          thickness: 1.2,
          color: rgb(0, 0, 0),
        });
      });

      pdfDoc.getPages().forEach(page => {
        page.node.delete(PDFName.of('Annots'));
      });

      setProgress(0.7);
      setProgressMessage("Saving PDF...");
      
      const rawRefNo = form.caseReferenceNumber || caseId;
      const safeRefNo = rawRefNo.replace(/[^a-zA-Z0-9-_]/g, '_');

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
        const path = FileSystem.documentDirectory + `DHI_${safeRefNo}.pdf`;
        await FileSystem.writeAsStringAsync(path, out, {
          encoding: FileSystem.EncodingType.Base64,
        });
        uploadInput = path;
      }

      setProgress(0.8);
      setProgressMessage("Uploading to Cloud...");
      const uploadUrl = await uploadPdfToCloudinary(uploadInput, safeRefNo);

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
      canGoBack.current = true;
      navigation.goBack();
    } catch (e) {
      console.error(e);
      Alert.alert("Error", `Failed to generate DHI residence PDF: ${e.message}`);
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
        <Text style={styles.headerTitle}>DHI Verification Form</Text>
      </View>

      {DHI_FIELD_LAYOUT.map((section) => (
        <View key={section.section} style={{ marginBottom: 18 }}>
          <Text style={styles.sectionTitle}>{section.section}</Text>

          {section.fields.map((field) => {
            if (field.type === "checkbox") {
              return (
                <TouchableOpacity
                  key={field.key}
                  style={styles.checkboxRow}
                  onPress={() =>
                    setForm((current) => ({
                      ...current,
                      checkboxes: { ...current.checkboxes, [field.key]: !current.checkboxes[field.key] }
                    }))
                  }
                >
                  <View style={[styles.checkbox, form.checkboxes[field.key] && styles.checked]} />
                  <Text>{field.label}</Text>
                </TouchableOpacity>
              );
            }

            if (field.key === "respondentRelationship") {
              const currentRelationship = String(form.respondentRelationship || "");
              const isCustomRelationship =
                currentRelationship !== "" &&
                !RELATIONSHIP_OPTIONS.includes(currentRelationship);

              return (
                <View key={field.key} style={{ marginBottom: 10 }}>
                  <Text style={styles.label}>{field.label}</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`${field.label}: ${isCustomRelationship ? currentRelationship : currentRelationship || "Select relationship"}`}
                    style={styles.dropdown}
                    onPress={() => setRelationshipPickerVisible(true)}
                  >
                    <Text style={currentRelationship ? styles.dropdownValue : styles.dropdownPlaceholder}>
                      {isCustomRelationship ? currentRelationship : currentRelationship || "Select relationship..."}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color="#555" />
                  </TouchableOpacity>
                  {(currentRelationship === "Other" || isCustomRelationship) && (
                    <TextInput
                      placeholder="Enter relationship"
                      style={styles.input}
                      value={isCustomRelationship ? currentRelationship : ""}
                      onChangeText={(value) =>
                        setForm((current) => ({
                          ...current,
                          respondentRelationship: value,
                        }))
                      }
                    />
                  )}
                </View>
              );
            }

            if (field.key === "modeOfVerification") {
              return (
                <View key={field.key} style={{ marginBottom: 10 }}>
                  <Text style={styles.label}>{field.label}</Text>
                  <TextInput
                    accessibilityLabel={field.label}
                    placeholder="Enter mode of verification"
                    style={styles.input}
                    value={String(form.modeOfVerification || "Manual/physical")}
                    onChangeText={(value) =>
                      setForm((current) => ({
                        ...current,
                        modeOfVerification: value,
                      }))
                    }
                  />
                </View>
              );
            }

            return (
              <View key={field.key} style={{ marginBottom: 10 }}>
                <Text style={styles.label}>{field.label}</Text>
                <TextInput
                  placeholder={
                    field.key === "periodOfStayFrom" || field.key === "periodOfStayTo"
                      ? "DD/MM/YY"
                      : `Enter ${field.label}`
                  }
                  multiline={field.key === "comments" || field.key === "candidateAddressPhone"}
                  style={[
                    styles.input,
                    (field.key === "comments" || field.key === "candidateAddressPhone") && styles.multilineInput,
                  ]}
                  value={String(form[field.key] ?? "")}
                  onChangeText={(value) => setForm((current) => ({ ...current, [field.key]: value }))}
                />
              </View>
            );
          })}
        </View>
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

      <Modal
        visible={relationshipPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRelationshipPickerVisible(false)}
      >
        <View style={styles.dropdownOverlay}>
          <View style={styles.dropdownMenu}>
            <Text style={styles.dropdownTitle}>Relationship with Candidate</Text>
            <ScrollView>
              {RELATIONSHIP_OPTIONS.map((relationship) => (
                <TouchableOpacity
                  key={relationship}
                  style={styles.dropdownOption}
                  onPress={() => {
                    setForm((current) => ({
                      ...current,
                      respondentRelationship: relationship,
                    }));
                    setRelationshipPickerVisible(false);
                  }}
                >
                  <Text style={styles.dropdownOptionText}>{relationship}</Text>
                  {form.respondentRelationship === relationship && (
                    <Ionicons name="checkmark" size={20} color="#007AFF" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.dropdownCancel}
              onPress={() => setRelationshipPickerVisible(false)}
            >
              <Text style={styles.dropdownCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!signingField} animationType="slide">
        <View style={{ flex: 1, backgroundColor: "#fff" }}>
          {Platform.OS === "web" ? (
            <WebSignaturePad onOK={handleSignature} onCancel={() => setSigningField(null)} />
          ) : (
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
              webStyle={`.m-signature-pad--footer { display: flex !important; bottom: 60px; width: 100%; position: absolute; } .m-signature-pad--body { margin-bottom: 100px; } .m-signature-pad--footer .button { background-color: #007AFF; color: #FFF; }`}
            />
          )}
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
  multilineInput: { minHeight: 72, textAlignVertical: "top" },
  dropdown: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    marginBottom: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
  },
  dropdownValue: { color: "#222", fontSize: 16 },
  dropdownPlaceholder: { color: "#777", fontSize: 16 },
  dropdownOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  dropdownMenu: {
    maxHeight: "80%",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 16,
  },
  dropdownTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  dropdownOption: {
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownOptionText: { color: "#222", fontSize: 16 },
  dropdownCancel: { alignItems: "center", paddingTop: 14 },
  dropdownCancelText: { color: "#007AFF", fontWeight: "600" },
  checkboxRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  checkbox: { width: 20, height: 20, borderWidth: 1, marginRight: 10 },
  checked: { backgroundColor: "#000" },
  sig: { height: 90, borderWidth: 1, marginBottom: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#e0e0e0", borderRadius: 5 },
  submit: { backgroundColor: "green", padding: 16, alignItems: "center", borderRadius: 5, marginTop: 10 },
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
