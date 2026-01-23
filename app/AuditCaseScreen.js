import { Ionicons } from "@expo/vector-icons";
import { encode as btoa } from "base-64";
import Constants from "expo-constants";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { LinearGradient } from "expo-linear-gradient";
import * as MailComposer from "expo-mail-composer";
import JSZip from "jszip";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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

const manifest = Constants.manifest;
const localIp = manifest?.debuggerHost?.split(':').shift() || "localhost";
const SERVER_URL = `http://${localIp}:3000`;

const CLOUD_NAME = "dfpykheky";
const UPLOAD_PRESET = "cases_upload";

// Safe Uint8Array -> base64 converter (chunked to avoid call-stack issues)
function uint8ToBase64Safe(u8) {
    const uint8 = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
    const CHUNK_SIZE = 0x8000; // 32KB
    let binary = "";
    for (let i = 0; i < uint8.length; i += CHUNK_SIZE) {
        const sub = uint8.subarray(i, i + CHUNK_SIZE);
        for (let j = 0; j < sub.length; j++) {
            binary += String.fromCharCode(sub[j]);
        }
    }
    return btoa(binary);
}


const PHOTO_CATEGORIES = ['selfie', 'proof', 'street', 'house', 'landmark'];

export default function AuditCaseScreen({ navigation, route }) {
  const { caseId, caseData: initialCaseData, user, manualMode } = route.params || {};
  const [caseData, setCaseData] = useState(initialCaseData || {});
  const [isUploadingManual, setIsUploadingManual] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  
  useEffect(() => {
    const caseRef = firebase.database().ref(`cases/${caseId}`);
    const listener = caseRef.on("value", (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setCaseData({ id: caseId, ...data });
      }
    });
    return () => caseRef.off("value", listener);
  }, [caseId]);

  const [rectifyModalVisible, setRectifyModalVisible] = useState(false);
  const [revertModalVisible, setRevertModalVisible] = useState(false);
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [showManualTools, setShowManualTools] = useState(false);
  const [enableManualAudit, setEnableManualAudit] = useState(false);
  
  const [isFinalizing, setIsFinalizing] = useState(false);
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

  useEffect(() => {
    const devRef = firebase.database().ref("dev/enableManualAudit");
    const listener = devRef.on("value", (snapshot) => {
      setEnableManualAudit(!!snapshot.val());
    });
    return () => devRef.off("value", listener);
  }, []);

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

  const handleDownloadZip = async () => {
    setIsFinalizing(true);
    try {
        const zip = new JSZip();
        const safeRef = (caseData.matrixRefNo || caseData.RefNo || caseId).replace(/[^a-zA-Z0-9-_]/g, '_');
        let count = 0;
        
        // Include Filled Form if available
        if (caseData.filledForm?.url) {
            try {
                let formUrl = caseData.filledForm.url;
                let extension = "pdf";

                const isCES = (caseData.client || caseData.company || "").toUpperCase().includes("CES");
                const isMaintenance = caseData.maintenanceSubmission;

                if (isCES || isMaintenance) {
                    if (formUrl.includes("cloudinary") && formUrl.toLowerCase().includes(".pdf")) {
                        formUrl = formUrl.replace(/\.pdf/i, ".jpg");
                        extension = "jpg";
                    } else if (formUrl.toLowerCase().includes(".jpg") || formUrl.toLowerCase().includes(".jpeg")) {
                        extension = "jpg";
                    }
                } else if (formUrl.toLowerCase().includes(".jpg") || formUrl.toLowerCase().includes(".jpeg")) {
                    extension = "jpg";
                }

                const formFilename = `Form_${safeRef}.${extension}`;
                if (Platform.OS === 'web') {
                    const response = await fetch(formUrl);
                    const blob = await response.blob();
                    zip.file(formFilename, blob);
                } else {
                    const tmp = FileSystem.cacheDirectory + `tmp_form_${Date.now()}.${extension}`;
                    await FileSystem.downloadAsync(formUrl, tmp);
                    const b64 = await FileSystem.readAsStringAsync(tmp, { encoding: FileSystem.EncodingType.Base64 });
                    zip.file(formFilename, b64, { base64: true });
                }
                count++;
            } catch (e) {
                console.warn("Failed to add form to zip", e);
            }
        }

        // Iterate through all photo categories and add them to the zip
        if (caseData.photosFolder) {
            for (const [category, photos] of Object.entries(caseData.photosFolder)) {
                if (Array.isArray(photos)) {
                    for (let i = 0; i < photos.length; i++) {
                        const photo = photos[i];
                        if (photo.uri) {
                            const filename = `${category}_${i + 1}.jpg`;
                            if (Platform.OS === 'web') {
                                const response = await fetch(photo.uri);
                                const blob = await response.blob();
                                zip.file(filename, blob);
                            } else {
                                // Native: Download to cache then read as base64
                                const tmp = FileSystem.cacheDirectory + `tmp_${count}.jpg`;
                                await FileSystem.downloadAsync(photo.uri, tmp);
                                const b64 = await FileSystem.readAsStringAsync(tmp, { encoding: FileSystem.EncodingType.Base64 });
                                zip.file(filename, b64, { base64: true });
                            }
                            count++;
                        }
                    }
                }
            }
        }

        if (count === 0) throw new Error("No photos or form found to zip.");

        const zipBase64 = await zip.generateAsync({ type: "base64" });

        if (Platform.OS === 'web') {
            const link = document.createElement('a');
            link.href = `data:application/zip;base64,${zipBase64}`;
            link.download = `Case_${safeRef}.zip`;
            link.click();
        } else {
            const uri = FileSystem.cacheDirectory + `Case_${safeRef}.zip`;
            await FileSystem.writeAsStringAsync(uri, zipBase64, { encoding: FileSystem.EncodingType.Base64 });
            Alert.alert("Success", `Zip saved to: ${uri}`);
        }
    } catch (e) {
        Alert.alert("Error", "Failed to download zip: " + e.message);
    } finally {
        setIsFinalizing(false);
    }
  };

  const handleFinalizeReport = async () => {
    setIsFinalizing(true);
    const originalFormUrl = caseData.filledForm?.url;
    const originalPhotosUrl = caseData.photosFolderLink;

    try {
        if (!originalFormUrl && !originalPhotosUrl) {
            Alert.alert("Error", "No documents available to merge.");
            setIsFinalizing(false);
            return;
        }

        const mergedPdf = await PDFDocument.create();
        const font = await mergedPdf.embedFont(StandardFonts.HelveticaBold);

        // --- NEW: Title Page (Page 1) ---
        const titlePage = mergedPdf.addPage();
        const { width, height } = titlePage.getSize();
        
        const titleText = "Audit Report";
        const dateText = new Date().toLocaleDateString();
        const refText = `Ref No: ${caseData.matrixRefNo || caseData.RefNo || caseId}`;

        const titleWidth = font.widthOfTextAtSize(titleText, 30);
        const dateWidth = font.widthOfTextAtSize(dateText, 18);
        const refWidth = font.widthOfTextAtSize(refText, 24);

        titlePage.drawText(titleText, {
            x: (width - titleWidth) / 2,
            y: height / 2 + 50,
            size: 30,
            font,
            color: rgb(0, 0, 0)
        });
        titlePage.drawText(dateText, {
            x: (width - dateWidth) / 2,
            y: height / 2,
            size: 18,
            font,
            color: rgb(0, 0, 0)
        });
        titlePage.drawText(refText, {
            x: (width - refWidth) / 2,
            y: height / 2 - 50,
            size: 24,
            font,
            color: rgb(0, 0, 0)
        });
        // --------------------------------
        
        if (originalFormUrl) {
            // Attempt to switch to PDF for better merging quality if it's a Cloudinary JPG
            let fetchUrl = originalFormUrl;
            if (fetchUrl.includes("cloudinary") && fetchUrl.endsWith(".jpg")) {
                fetchUrl = fetchUrl.replace(".jpg", ".pdf");
            }

            try {
                const formBytes = await fetch(fetchUrl).then(r => {
                    if (!r.ok) throw new Error("Fetch failed");
                    return r.arrayBuffer();
                });
                
                // Simple PDF signature check (%PDF)
                const header = new Uint8Array(formBytes.slice(0, 5));
                const headerStr = String.fromCharCode(...header);
                
                if (headerStr.startsWith('%PDF')) {
                    const formPdf = await PDFDocument.load(formBytes);
                    const pages = await mergedPdf.copyPages(formPdf, formPdf.getPageIndices());
                    pages.forEach(p => mergedPdf.addPage(p));
                } else {
                    // Fallback: Embed as Image (if the swap failed or it really is an image)
                    const image = await mergedPdf.embedJpg(formBytes);
                    const page = mergedPdf.addPage([image.width, image.height]);
                    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
                }
            } catch (e) {
                console.warn("Failed to merge form PDF/Image:", e);
                // Proceeding without form if it fails, or you could alert user
            }
        }

        if (originalPhotosUrl) {
            const photoBytes = await fetch(originalPhotosUrl).then(r => r.arrayBuffer());
            const photoPdf = await PDFDocument.load(photoBytes);
            
            let pagesToCopy = photoPdf.getPageIndices();
            // Skip the first page (Title Page) if it comes from the standard member flow
            // to avoid duplicate title pages (since we just added one).
            if (!caseData.manualPdfGenerated && !caseData.manualUpload && pagesToCopy.length > 0) {
                 pagesToCopy = pagesToCopy.slice(1);
            }

            const pages = await mergedPdf.copyPages(photoPdf, pagesToCopy);
            pages.forEach(p => mergedPdf.addPage(p));
        }

        const pdfBytes = await mergedPdf.save();
        const safeRef = (caseData.matrixRefNo || caseData.RefNo || caseId).replace(/[^a-zA-Z0-9-_]/g, '_');
        const publicId = `FinalReport_${safeRef}_${Date.now()}`;

        // Direct Cloudinary Upload
        const formData = new FormData();
        formData.append("upload_preset", UPLOAD_PRESET);
        formData.append("public_id", publicId);
        formData.append("folder", `cases/${safeRef}`);

        if (Platform.OS === 'web') {
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            formData.append("file", blob, `${publicId}.pdf`);
        } else {
            const pdfBase64 = uint8ToBase64Safe(pdfBytes);
            const fileUri = FileSystem.cacheDirectory + `${publicId}.pdf`;
            await FileSystem.writeAsStringAsync(fileUri, pdfBase64, { encoding: FileSystem.EncodingType.Base64 });
            formData.append("file", {
                uri: fileUri,
                type: 'application/pdf',
                name: `${publicId}.pdf`,
            });
        }

        console.log(`[FINALIZE] Uploading merged PDF to Cloudinary...`);
        const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`, {
            method: 'POST',
            body: formData
        });

        if (!uploadResponse.ok) {
            const errText = await uploadResponse.text();
            throw new Error(`Upload failed: ${uploadResponse.status} ${errText}`);
        }
        
        const uploadJson = await uploadResponse.json();
        const newPdfUrl = uploadJson?.secure_url;

        if (!newPdfUrl) throw new Error('Upload failed: No URL returned from Cloudinary.');

        console.log(`[FINALIZE] Upload successful: ${newPdfUrl}`);

        // --- DELETION LOGIC REMOVED PER REQUEST ---
        // Photos and original forms will be kept in Cloudinary.

        // Update Firebase
        await firebase.database().ref(`cases/${caseId}`).update({
            photosFolderLink: newPdfUrl, // This now holds the merged report
            photosFolder: null, // Clear individual photo links
            filledForm: null, // Clear the old form link
            mergedAt: Date.now(),
        });

        Linking.openURL(newPdfUrl);
    } catch (e) {
        console.error("Finalize Report failed:", e);
        Alert.alert("Error", "Failed to finalize report: " + e.message);
    } finally {
        setIsFinalizing(false);
    }
  };

  const handleManualPdfGeneration = async () => {
    setIsFinalizing(true);
    try {
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // Helper to sanitize text for PDF (WinAnsi encoding)
        const cleanText = (text) => {
            if (!text) return "";
            // Replace narrow no-break space (0x202F) and non-breaking space (0x00A0) with standard space
            let cleaned = String(text).replace(/[\u202F\u00A0]/g, " ");
            // Replace any other characters not supported by WinAnsi (roughly > 255) with '?'
            return cleaned.replace(/[^\x00-\xFF]/g, "?");
        };

        // 1. Embed Form if exists
        if (caseData.filledForm?.url) {
            try {
                const formBytes = await fetch(caseData.filledForm.url).then(r => r.arrayBuffer());
                const formPdf = await PDFDocument.load(formBytes);
                const pages = await pdfDoc.copyPages(formPdf, formPdf.getPageIndices());
                pages.forEach(p => pdfDoc.addPage(p));
            } catch (e) {
                console.log("Error loading form pdf", e);
                Alert.alert("Warning", "Could not load filled form PDF. Proceeding with photos only.");
            }
        }

        // 2. Embed Photos from photosFolder
        if (caseData.photosFolder) {
            let allPhotos = [];
            Object.keys(caseData.photosFolder).forEach(cat => {
                const list = caseData.photosFolder[cat];
                if (Array.isArray(list)) {
                    list.forEach(p => allPhotos.push({ ...p, category: cat }));
                }
            });

            for (const photo of allPhotos) {
                if (!photo.uri) continue;
                let page = null;
                try {
                    // --- NEW: Robust image fetching logic ---
                    let imgBytes;
                    let isPng = false;

                    const fetchBuffer = async (u, retries = 3) => {
                        for (let i = 0; i < retries; i++) {
                            try {
                                const r = await fetch(u);
                            } catch (e) {
                                console.warn(`[PDF-FETCH] Attempt ${i + 1} failed for ${u}: ${e.message}`);
                                if (i === retries - 1) throw e;
                                await new Promise(res => setTimeout(res, 1000 * (i + 1)));
                            }
                        }
                    };

                    const isSigned = photo.uri.includes("/s--");
                    let optimizedUrl = photo.uri;
                    // Only optimize if NOT signed to avoid breaking signature
                    if (!isSigned && photo.uri.includes("cloudinary.com") && photo.uri.includes("/upload/") && !photo.uri.includes("f_jpg")) {
                        optimizedUrl = photo.uri.replace("/upload/", "/upload/w_600,q_50,f_jpg/");
                    }

                    try {
                        imgBytes = await fetchBuffer(optimizedUrl);
                    } catch (e1) {
                        try {
                            imgBytes = await fetchBuffer(photo.uri);
                            isPng = photo.uri.toLowerCase().endsWith('.png');
                        } catch (e2) {
                            if (!isSigned) {
                                try {
                                    imgBytes = await fetchBuffer(photo.uri + ".jpg");
                                } catch (e3) { throw e2; }
                            } else {
                                throw e2;
                            }
                        }
                    }

                    let image;
                    try {
                        image = isPng ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes);
                    } catch (e) {
                        image = isPng ? await pdfDoc.embedJpg(imgBytes) : await pdfDoc.embedPng(imgBytes);
                    }

                    page = pdfDoc.addPage();
                    const { width, height } = page.getSize();
                    const dims = image.scaleToFit(width - 40, height - 40);
                    
                    const imageX = (width - dims.width) / 2;
                    const imageY = (height - dims.height) / 2;
                    
                    page.drawImage(image, {
                        x: imageX,
                        y: imageY,
                        width: dims.width,
                        height: dims.height,
                    });

                } catch (e) {
                    console.log("Error embedding photo", photo.uri, e);
                    // Draw error placeholder so PDF generation doesn't fail completely
                    try {
                        const errorPage = pdfDoc.addPage();
                        const { width, height } = errorPage.getSize();
                        errorPage.drawRectangle({ x: 50, y: height / 2 - 50, width: width - 100, height: 100, color: rgb(0.95, 0.95, 0.95), borderColor: rgb(1, 0, 0), borderWidth: 1 });
                        errorPage.drawText(`Error loading image: ${cleanText(photo.uri)}`, { x: 60, y: height / 2, size: 10, font, color: rgb(1, 0, 0) });
                        errorPage.drawText(`(Image source inaccessible)`, { x: 60, y: height / 2 - 15, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
                    } catch (drawErr) {
                        console.error("Failed to draw error placeholder", drawErr);
                    }
                }
            }
        }

        // 3. Save and Upload
        if (pdfDoc.getPageCount() === 0) {
             const page = pdfDoc.addPage();
             page.drawText("No content available (Form missing & Photos failed to load).", { x: 50, y: 700, size: 12, font, color: rgb(0, 0, 0) });
        }

        const pdfBytes = await pdfDoc.save();
        const safeRef = (caseData.matrixRefNo || caseData.RefNo || caseId).replace(/[^a-zA-Z0-9-_]/g, '_');
        const publicId = `ManualReport_${safeRef}_${Date.now()}`;

        const formData = new FormData();
        formData.append("upload_preset", UPLOAD_PRESET);
        formData.append("public_id", publicId);
        formData.append("folder", `cases/${safeRef}`);

        if (Platform.OS === 'web') {
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            formData.append("file", blob, `${publicId}.pdf`);
        } else {
            const pdfBase64 = uint8ToBase64Safe(pdfBytes);
            const fileUri = FileSystem.cacheDirectory + `${publicId}.pdf`;
            await FileSystem.writeAsStringAsync(fileUri, pdfBase64, { encoding: FileSystem.EncodingType.Base64 });
            formData.append("file", { uri: fileUri, type: 'application/pdf', name: `${publicId}.pdf` });
        }

        const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`, {
            method: 'POST',
            body: formData
        });

        if (!uploadResponse.ok) throw new Error("Upload failed");
        const uploadJson = await uploadResponse.json();
        
        await firebase.database().ref(`cases/${caseId}`).update({
            photosFolderLink: uploadJson.secure_url,
            filledForm: null,
            mergedAt: Date.now(),
            manualPdfGenerated: true
        });
        Alert.alert("Success", "Manual PDF generated and saved.");
    } catch (e) {
        Alert.alert("Error", "Failed to generate PDF: " + e.message);
    } finally {
        setIsFinalizing(false);
    }
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
                        subject: `Case Completed: ${caseData.matrixRefNo || caseData.RefNo || caseId}`,
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

    const subject = `Case Approved: ${caseData.matrixRefNo || caseData.RefNo || caseId || caseData.chekType}}`;
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
Check Type: ${caseData.chekType || 'N/A'}
City: ${caseData.city || 'N/A'} 

Thank you,
Spacesolutions Team
      `.trim();

      // --- WEB HANDLING ---
      if (Platform.OS === 'web') {
        const hasDownloaded = window.confirm("Did you download the Report PDF?");

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

      // If form is null, it means the report has been merged.
      if (!caseData.filledForm?.url && caseData.photosFolderLink) {
          emailBody = emailBody.replace("find the final report and the submitted verification form attached", "find the complete verification report attached");
          console.log("📧 Detected merged PDF, updating email body.");
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
        // If form is gone, this is the merged report.
        const filename = !caseData.filledForm?.url ? `FinalReport_${safeRef}.pdf` : `CaseReport_${safeRef}.pdf`;
        const uri = await downloadToCache(caseData.photosFolderLink, filename);
        if (uri) attachments.push(uri);
      }
      // This will only run if the report has not been finalized yet.
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

  const handleManualUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/*", "application/pdf"],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets ? result.assets[0] : result;
      setIsUploadingManual(true);

      const formData = new FormData();
      formData.append("file", {
        uri: file.uri,
        type: file.mimeType || "application/pdf",
        name: file.name || "manual_upload.pdf",
      });
      formData.append("upload_preset", UPLOAD_PRESET);
      const safeRef = (caseData.matrixRefNo || caseData.RefNo || caseId).replace(/[^a-zA-Z0-9-_]/g, '_');
      formData.append("folder", `cases/${safeRef}`);
      
      const isPdf = file.mimeType === "application/pdf" || (file.name && file.name.endsWith(".pdf"));
      const resourceType = isPdf ? "raw" : "image";
      formData.append("resource_type", resourceType);

      const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;

      const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.secure_url) {
        await firebase.database().ref(`cases/${caseId}`).update({
          photosFolderLink: data.secure_url,
          status: "audit",
          manualUpload: true,
          completedAt: Date.now()
        });
        Alert.alert("Success", "File uploaded. You can now approve and send.");
      } else {
        throw new Error(data.error?.message || "Upload failed");
      }
    } catch (error) {
      console.error("Manual Upload Error:", error);
      Alert.alert("Error", "Failed to upload: " + error.message);
    } finally {
      setIsUploadingManual(false);
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

          {/* Manual Tools Toggle */}
          {enableManualAudit && (
            <TouchableOpacity onPress={() => setShowManualTools(!showManualTools)} style={{alignSelf: 'flex-end', padding: 5, marginTop: 5}}>
               <Ionicons name={showManualTools ? "construct" : "construct-outline"} size={20} color="#555" />
            </TouchableOpacity>
          )}

          {showManualTools && (
              <View style={{backgroundColor: '#f0f0f0', padding: 10, borderRadius: 8, marginBottom: 10}}>
                  <Text style={{fontWeight: 'bold', marginBottom: 5, color: '#333'}}>Developer Tools</Text>
                  <TouchableOpacity 
                    style={[styles.downloadButton, { backgroundColor: "#673AB7" }]}
                    onPress={handleManualPdfGeneration}
                    disabled={isFinalizing}
                  >
                    {isFinalizing ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="document-attach" size={20} color="#fff" />}
                    <Text style={styles.downloadButtonText}>Generate Full PDF (Manual)</Text>
                  </TouchableOpacity>
              </View>
          )}

          {/* --- NEW: Maintenance / Raw Photos View --- */}
          {(caseData.maintenanceSubmission || (!caseData.photosFolderLink && caseData.photosFolder)) && (
             <View style={styles.maintenanceBox}>
                 <Text style={styles.maintenanceHeader}>⚠️ Maintenance Submission</Text>
                 <Text style={styles.maintenanceText}>Raw photos uploaded. Download zip to audit.</Text>
                 
                 {Object.entries(caseData.photosFolder || {}).map(([cat, photos]) => (
                     <View key={cat} style={{marginTop: 10}}>
                         <Text style={{fontWeight:'bold', fontSize:12, color:'#555', marginBottom:5}}>{cat.toUpperCase()}</Text>
                         <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                             {Array.isArray(photos) && photos.map((p, i) => (
                                 <TouchableOpacity key={i} onPress={() => setSelectedPhoto(p)}>
                                     <Image source={{uri: p.uri}} style={styles.auditThumb} />
                                 </TouchableOpacity>
                             ))}
                         </ScrollView>
                     </View>
                 ))}

                 <TouchableOpacity 
                    style={[styles.downloadButton, { backgroundColor: "#009688", marginTop: 15 }]}
                    onPress={handleDownloadZip}
                    disabled={isFinalizing}
                  >
                    {isFinalizing ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="download-outline" size={20} color="#fff" />}
                    <Text style={styles.downloadButtonText}>Download Assets (Zip)</Text>
                  </TouchableOpacity>
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
                <Text style={styles.downloadButtonText}>{!caseData.filledForm?.url ? "Combined PDF" : "PDF Report"}</Text>
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
                style={[styles.downloadButton, { backgroundColor: "#6200ea", flex: 1 }]}
                onPress={handleFinalizeReport}
                disabled={isFinalizing}
              >
                {isFinalizing ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="git-merge-outline" size={20} color="#fff" />}
                <Text style={styles.downloadButtonText}>{isFinalizing ? "Merging..." : "Combined PDF"}</Text>
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

          {(manualMode || !caseData.photosFolderLink) && (
            <TouchableOpacity 
              style={[styles.downloadButton, { backgroundColor: "#ff9800", marginTop: 15 }]}
              onPress={handleManualUpload}
              disabled={isUploadingManual}
            >
              {isUploadingManual ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="add-circle-outline" size={24} color="#fff" />}
              <Text style={styles.downloadButtonText}>{isUploadingManual ? "Uploading..." : "Manual Upload (Offline Case)"}</Text>
            </TouchableOpacity>
          )}

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

      {/* Photo Preview Modal */}
      <Modal visible={!!selectedPhoto} transparent={true} animationType="fade" onRequestClose={() => setSelectedPhoto(null)}>
        <View style={styles.modalOverlay}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedPhoto(null)}>
                <Ionicons name="close-circle" size={40} color="#fff" />
            </TouchableOpacity>
            {selectedPhoto && (
                <Image source={{ uri: selectedPhoto.uri }} style={{ width: '90%', height: '80%', resizeMode: 'contain' }} />
            )}
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
  maintenanceBox: { backgroundColor: '#f3e5f5', padding: 10, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: '#ce93d8' },
  maintenanceHeader: { fontWeight: 'bold', color: '#4a148c', fontSize: 14 },
  maintenanceText: { fontSize: 12, color: '#6a1b9a', marginBottom: 5 },
  auditThumb: { width: 60, height: 60, borderRadius: 6, marginRight: 8, backgroundColor: '#ddd' },
  modalClose: { position: 'absolute', top: 40, right: 20, zIndex: 10, padding: 10 },
});
