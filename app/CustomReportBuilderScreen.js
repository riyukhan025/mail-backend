import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

const sanitizeFileName = (value) => {
  const cleaned = (value || "custom_report")
    .replace(/[^a-zA-Z0-9-_ ]/g, "_")
    .trim();

  return cleaned || "custom_report";
};

const toBase64 = (bytes) => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return global.btoa ? global.btoa(binary) : binary;
};

export default function CustomReportBuilderScreen() {
  const [companyName, setCompanyName] = useState("");
  const [reportTitle, setReportTitle] = useState("Custom Report");
  const [documents, setDocuments] = useState([]);
  const [isCreating, setIsCreating] = useState(false);

  const pickDocuments = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const assets = result.assets || [result];
      const newDocs = assets.map((asset, index) => ({
        id: `${asset.uri || asset.name || "doc"}-${Date.now()}-${index}`,
        name: asset.name || `Document ${documents.length + index + 1}`,
        uri: asset.uri,
        heading: "",
      }));

      setDocuments((prev) => [...prev, ...newDocs]);
    } catch (error) {
      Alert.alert("Error", error.message || "Could not pick PDF files.");
    }
  };

  const updateHeading = (id, heading) => {
    setDocuments((prev) => prev.map((doc) => (doc.id === id ? { ...doc, heading } : doc)));
  };

  const moveDocument = (id, direction) => {
    setDocuments((prev) => {
      const index = prev.findIndex((doc) => doc.id === id);
      if (index === -1) return prev;

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;

      const updated = [...prev];
      const [item] = updated.splice(index, 1);
      updated.splice(targetIndex, 0, item);
      return updated;
    });
  };

  const removeDocument = (id) => {
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
  };

  const createCombinedPdf = async () => {
    if (!companyName.trim()) {
      Alert.alert("Required", "Please enter the company name.");
      return;
    }

    if (documents.length === 0) {
      Alert.alert("Required", "Please pick at least one PDF file.");
      return;
    }

    setIsCreating(true);

    try {
      const mergedPdf = await PDFDocument.create();
      const boldFont = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
      const regularFont = await mergedPdf.embedFont(StandardFonts.Helvetica);

      const coverPage = mergedPdf.addPage();
      const { width, height } = coverPage.getSize();
      const titleText = (reportTitle || "Custom Report").trim();
      const companyText = companyName.trim();
      const dateText = new Date().toLocaleDateString();

      const titleWidth = boldFont.widthOfTextAtSize(titleText, 24);
      const companyWidth = boldFont.widthOfTextAtSize(companyText, 20);
      const dateWidth = regularFont.widthOfTextAtSize(dateText, 14);

      coverPage.drawText(titleText, {
        x: (width - titleWidth) / 2,
        y: height / 2 + 30,
        size: 24,
        font: boldFont,
        color: rgb(0.12, 0.2, 0.33),
      });
      coverPage.drawText(companyText, {
        x: (width - companyWidth) / 2,
        y: height / 2 - 10,
        size: 20,
        font: boldFont,
        color: rgb(0.07, 0.2, 0.31),
      });
      coverPage.drawText(dateText, {
        x: (width - dateWidth) / 2,
        y: height / 2 - 50,
        size: 14,
        font: regularFont,
        color: rgb(0.35, 0.35, 0.35),
      });

      for (const doc of documents) {
        const heading = doc.heading?.trim();
        if (heading) {
          const headingPage = mergedPdf.addPage();
          const { width: headingWidth, height: headingHeight } = headingPage.getSize();
          const headingTextWidth = boldFont.widthOfTextAtSize(heading, 22);
          headingPage.drawText(heading, {
            x: (headingWidth - headingTextWidth) / 2,
            y: headingHeight / 2,
            size: 22,
            font: boldFont,
            color: rgb(0.16, 0.24, 0.35),
          });
        }

        const response = await fetch(doc.uri);
        if (!response.ok) {
          throw new Error(`Failed to read ${doc.name}`);
        }

        const sourceBytes = await response.arrayBuffer();
        const sourcePdf = await PDFDocument.load(sourceBytes);
        const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const pdfBytes = await mergedPdf.save();
      const fileName = `${sanitizeFileName(companyName)}_${Date.now()}.pdf`;

      if (Platform.OS === "web") {
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        Alert.alert("Success", "Your combined PDF has been downloaded.");
      } else {
        const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, toBase64(pdfBytes), {
          encoding: FileSystem.EncodingType.Base64,
        });
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/pdf",
          dialogTitle: "Share combined report",
        });
        Alert.alert("Success", "Your report PDF was created successfully.");
      }
    } catch (error) {
      Alert.alert("Error", error.message || "Could not create the combined report.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.headerCard}>
        <Text style={styles.title}>Create Report PDF</Text>
        <Text style={styles.subtitle}>
          Enter a company name, add your PDFs in order, and create one combined report.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Company Name</Text>
        <TextInput
          style={styles.input}
          value={companyName}
          onChangeText={setCompanyName}
          placeholder="e.g. ABC Company"
        />

        <Text style={styles.label}>Report Title</Text>
        <TextInput
          style={styles.input}
          value={reportTitle}
          onChangeText={setReportTitle}
          placeholder="e.g. Audit Report"
        />
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>Selected PDFs</Text>
          <TouchableOpacity style={styles.pickButton} onPress={pickDocuments}>
            <Text style={styles.pickButtonText}>Add PDFs</Text>
          </TouchableOpacity>
        </View>

        {documents.length === 0 ? (
          <Text style={styles.helperText}>Pick 1 or more PDF files. They will be added in the order shown below.</Text>
        ) : (
          documents.map((doc, index) => (
            <View key={doc.id} style={styles.docItem}>
              <View style={styles.docMeta}>
                <Text style={styles.docName}>{index + 1}. {doc.name}</Text>
                <Text style={styles.docHint}>Use the arrows to change order.</Text>
              </View>

              <TextInput
                style={styles.inputSmall}
                value={doc.heading}
                onChangeText={(text) => updateHeading(doc.id, text)}
                placeholder="Heading between PDFs (optional)"
              />

              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.actionButton} onPress={() => moveDocument(doc.id, "up")}>
                  <Text style={styles.actionButtonText}>↑</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionButton} onPress={() => moveDocument(doc.id, "down")}>
                  <Text style={styles.actionButtonText}>↓</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.removeButton} onPress={() => removeDocument(doc.id)}>
                  <Text style={styles.removeButtonText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      <TouchableOpacity style={styles.createButton} onPress={createCombinedPdf} disabled={isCreating}>
        {isCreating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createButtonText}>Create Combined PDF</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f4f7fb",
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  headerCard: {
    backgroundColor: "#0f172a",
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 6,
  },
  subtitle: {
    color: "#cbd5e1",
    fontSize: 13,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    backgroundColor: "#f8fafc",
  },
  inputSmall: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    backgroundColor: "#f8fafc",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  pickButton: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  pickButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  helperText: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 8,
  },
  docItem: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    backgroundColor: "#f8fafc",
  },
  docMeta: {
    marginBottom: 6,
  },
  docName: {
    fontWeight: "700",
    color: "#0f172a",
  },
  docHint: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: "row",
    marginTop: 8,
    alignItems: "center",
  },
  actionButton: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
  },
  actionButtonText: {
    color: "#0f172a",
    fontWeight: "700",
  },
  removeButton: {
    marginLeft: "auto",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#fee2e2",
  },
  removeButtonText: {
    color: "#b91c1c",
    fontWeight: "700",
  },
  createButton: {
    backgroundColor: "#0f766e",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  createButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
