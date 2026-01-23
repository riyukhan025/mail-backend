import { Ionicons } from "@expo/vector-icons";
import { decode as atob, encode as btoa } from "base-64";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { useContext, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    BackHandler,
    Image,
    ImageBackground,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import firebase from "../firebase";
import { AuthContext } from "./AuthContext";

// Cloudinary configuration
const CLOUD_NAME = "dfpykheky";
const UPLOAD_PRESET = "cases_upload";

// Server URL for zipping
const manifest = Constants.manifest;
const localIp = manifest?.debuggerHost?.split(':').shift() || "localhost";
const SERVER_URL = `http://${localIp}:3000`;
console.log(`[Network] Server URL set to: ${SERVER_URL}`);

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

// --- NEW: Photo Requirements Checklist ---
const PHOTO_REQUIREMENTS = [
    { id: 'house', label: 'House/Building View', max: 2 },
    { id: 'selfie', label: 'Selfie with House', max: 1 },
    { id: 'proof', label: 'ID Proof', max: 2 },
    { id: 'landmark', label: 'Nearest Landmark', max: 1 },
];

// --- NEW: Optional Photo Categories ---
const OPTIONAL_PHOTO_CATEGORIES = [
    { id: 'other', label: 'Other', max: 2 },
];

const TRANSLATIONS = {
  en: {
    caseDetails: "Case Details",
    actionRequired: "Action Required",
    photoChecklist: "Photo Checklist",
    galleryView: "Gallery View",
    fillEditForm: "Fill/Edit Form",
    viewForm: "View Form",
    closeCase: "Close Case",
    updateCase: "Update Case",
    downloadReport: "Download Report",
    addOptional: "Add Optional Category",
    chooseCompany: "Choose Company",
    cancel: "Cancel",
    add: "Add",
    delete: "Delete",
    initiated: "Initiated",
    assignedTo: "Assigned To",
    house: "House/Building View",
    selfie: "Selfie with House",
    proof: "ID Proof",
    landmark: "Nearest Landmark",
    other: "Other"
  },
  ta: {
    caseDetails: "வழக்கு விவரங்கள்",
    actionRequired: "நடவடிக்கை தேவை",
    photoChecklist: "புகைப்பட பட்டியல்",
    galleryView: "கேலரி",
    fillEditForm: "படிவம் நிரப்ப/திருத்த",
    viewForm: "படிவம் பார்",
    closeCase: "வழக்கை மூடு",
    updateCase: "வழக்கை புதுப்பி",
    downloadReport: "அறிக்கை பதிவிறக்கம்",
    addOptional: "கூடுதல் வகை சேர்",
    chooseCompany: "நிறுவனத்தை தேர்வு செய்",
    cancel: "ரத்து",
    add: "சேர்",
    delete: "நீக்கு",
    initiated: "தொடங்கப்பட்டது",
    assignedTo: "ஒதுக்கப்பட்டது",
    house: "வீடு/கட்டிடம்",
    selfie: "வீட்டின் முன் செல்ஃபி",
    proof: "அடையாள அட்டை",
    landmark: "அருகில் உள்ள அடையாளம்",
    other: "மற்றவை"
  }
};

export default function CaseDetailScreen({ navigation, route }) {
    // Correctly destructure params, especially for the photo data that changes.
    console.log('--- [CaseDetailScreen] RENDER ---');
    console.log('[CaseDetailScreen] Current route.params:', JSON.stringify(route.params, null, 2));

    const { user: contextUser, language } = useContext(AuthContext);
    const { caseId, role: roleParam, forceClose = false, forceEdit = false, user: paramUser } = route.params;
    const user = paramUser || contextUser;
    const newPhoto = route.params?.newPhoto;
    const photoCategory = route.params?.category;

    const [caseData, setCaseData] = useState(null);
    const [status, setStatus] = useState("open");
    const role = user?.role || roleParam || "member"; // Get role directly from user prop
    const [assignedEmail, setAssignedEmail] = useState("Unassigned");
    // --- MODIFIED: Photos state is now an object keyed by category ---
    const [photos, setPhotos] = useState({
        house: [],
        selfie: [],
        proof: [],
        landmark: [],
        other: [],
    });
    const [activePhotoCategory, setActivePhotoCategory] = useState(null); // To know which category to add photo to
    const [selectedPhoto, setSelectedPhoto] = useState(null);
    const [cameraVisible, setCameraVisible] = useState(false);
    const [hasLocationPermission, setHasLocationPermission] = useState(false);
    const [detailsModalVisible, setDetailsModalVisible] = useState(false);
    const [authChecked, setAuthChecked] = useState(false);
    const [formCompleted, setFormCompleted] = useState(false);
    const cameraRef = useRef(null); // Keep for other potential uses, though not for capture here
    const [isClosing, setIsClosing] = useState(false);
    const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);

    const [maintenanceModeMember, setMaintenanceModeMember] = useState(false);
    const [maintenanceCamera, setMaintenanceCamera] = useState(false);

    const [optionalCategories, setOptionalCategories] = useState([]);
    const [addPhotoModalVisible, setAddPhotoModalVisible] = useState(false);
    console.log("🚀 Component mounted, caseId:", caseId, "roleParam:", roleParam);
    
    const [uploadProgress, setUploadProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState("");
    const [showProgressModal, setShowProgressModal] = useState(false);

    const t = (key) => TRANSLATIONS[language]?.[key] || TRANSLATIONS['en'][key] || key;

    const displayStatus = role === "member" && status === "assigned" ? "open" : status;
    console.log(`[RENDER] status=${status}, role=${role}, displayStatus=${displayStatus}`);
    // --- NEW: Calculate total photos and if all requirements are met ---
    
    const isAuditFail = (caseData?.auditFeedback || (caseData?.photosToRedo && caseData?.photosToRedo.length > 0)) && displayStatus === 'open';

    // Robust check for "RA Associates"
    const cleanString = (str) => (str || "").toLowerCase().replace(/[\s.-]/g, '');
    const companyName = cleanString(caseData?.company);
    const clientName = cleanString(caseData?.client);
    const isRAAssociates = companyName.includes("raassociates") || clientName.includes("raassociates");

    // --- NEW: Explicit check for Close Button visibility ---
    const shouldShowCloseButton = () => {
        if (displayStatus !== 'open' && !forceEdit) return false;
        if (forceClose) return true;
        // For RA Associates, only photos are needed
        if (isRAAssociates) return allRequirementsMet;
        // For all other companies, photos AND form are needed
        return allRequirementsMet && formCompleted;
    };

    // Listen for Maintenance Mode
    useEffect(() => {
        const devRef = firebase.database().ref("dev/maintenanceModeMember");
        const listener = devRef.on("value", (snapshot) => {
            const val = snapshot.val() || {};
            setMaintenanceModeMember(val.maintenanceModeMember === true || val.maintenanceModeMember === "true");
            setMaintenanceCamera(val.maintenanceCamera === true || val.maintenanceCamera === "true");
        });
        return () => devRef.off("value", listener);
    }, []);

    const checkMaintenance = () => {
        if (maintenanceModeMember) {
            Alert.alert("Maintenance Mode", "This action is currently disabled due to system maintenance.Do this case and submit in Manual");
            return true;
        }
        return false;
    };

    // If user object is passed, we are authenticated.
    useEffect(() => {
        if (user) {
            setAuthChecked(true);
        }
    }, [user]);

    // --- NEW: Listen for photos from CameraGPSScreen via route params (local state, not Firebase yet) ---
    useEffect(() => {
        console.log('[CaseDetailScreen] newPhotos useEffect triggered');
        console.log('[CaseDetailScreen] route.params?.newPhotos:', route.params?.newPhotos);
        
        if (!route.params?.newPhotos) {
            console.log('[CaseDetailScreen] No newPhotos in params, returning');
            return;
        }
        
        console.log('[CaseDetailScreen] Received new photos from CameraGPSScreen:', route.params.newPhotos);
        
        const newPhotosArray = route.params.newPhotos;
        if (!Array.isArray(newPhotosArray) || newPhotosArray.length === 0) {
            console.log('[CaseDetailScreen] newPhotosArray is empty or not an array');
            return;
        }
        
        setPhotos(prevPhotos => {
            const updated = { ...prevPhotos };
            for (const photo of newPhotosArray) {
                const cat = photo.category;
                if (!updated[cat]) updated[cat] = [];
                updated[cat].push(photo);
            }
            console.log('[CaseDetailScreen] ✅ Photos state updated:', updated);
            return updated;
        });

        // Clear params to prevent re-adding
        navigation.setParams({ newPhotos: null });
    }, [route.params?.newPhotos, navigation]);

    // Fetch case data using a real-time listener
    useEffect(() => {
        if (!caseId || !authChecked) return;
        console.log("📥 Setting up case data listener for caseId:", caseId);
        
        const caseRef = firebase.database().ref(`cases/${caseId}`);
        const listener = caseRef.on('value', async (snapshot) => {
            const data = snapshot.val();
            console.log("📄 Case data received:", data);
            if (!data) return;
            
            setCaseData(data);
            setStatus(data.status || "open");
            console.log(`[FIREBASE-LISTENER] Status updated to: ${data.status}`);
            console.log(`[BUTTON-CHECK] displayStatus will be: ${role === "member" && data.status === "assigned" ? "open" : data.status}`);

            if (data.assignedTo) {
                try {
                    const userSnap = await firebase.database().ref(`users/${data.assignedTo}`).once("value");
                    console.log("👤 Assigned user data:", userSnap.val());
                    setAssignedEmail(userSnap.val()?.name || userSnap.val()?.email || "Unassigned");
                } catch (err) {
                    console.error("Error fetching assigned user:", err);
                }
            }

            // Sync photos from Firebase (Server Authority)
            setPhotos(prevPhotos => {
                const updated = { ...prevPhotos };

                // 1. Clear photosToRedo categories immediately so UI reflects removal
                if (data.photosToRedo && Array.isArray(data.photosToRedo)) {
                    data.photosToRedo.forEach(cat => {
                        updated[cat] = [];
                    });
                }

                // 2. Load existing photos from photosFolder
                if (data.photosFolder && typeof data.photosFolder === 'object') {
                    for (const category in data.photosFolder) {
                        const photoArray = data.photosFolder[category];
                        if (Array.isArray(photoArray) && photoArray.length > 0) {
                            updated[category] = photoArray;
                        }
                    }
                }
                return updated;
            });
        });

        return () => {
            console.log("🧹 Cleaning up case listener");
            caseRef.off('value', listener);
        };
    }, [caseId, authChecked]);

    // Request permissions
    useEffect(() => {
        (async () => {
        })();
    }, []);

    // Hardware back button
    useEffect(() => {
        const backAction = () => {
            if (navigation.canGoBack()) {
                navigation.goBack();
                console.log("↩️ Navigating back in stack");
            } else { // If it's the first screen in the stack
                // Replace the current screen with the appropriate dashboard to prevent stacking
                role === "admin" ? navigation.replace("AdminPanel") : navigation.replace("Dashboard");
                console.log("🏠 No back history, replacing with dashboard for role:", role);
            }
            return true;
        };
        const backHandler = BackHandler.addEventListener("hardwareBackPress", backAction);
        return () => backHandler.remove();
    }, [role]);

    // Form completed listener (NEW)
    useEffect(() => {
        if (!caseId) return;
        const formRef = firebase.database().ref(`cases/${caseId}/formCompleted`);
        const listener = formRef.on("value", (snapshot) => {
            const completed = snapshot.val() === true;
            console.log("📝 Form completed status:", completed);
            setFormCompleted(completed);
        });
        return () => formRef.off("value", listener);
    }, [caseId]);

    // --- NEW: Calculate total photos and if all requirements are met ---
    const isCES = (caseData?.client || caseData?.company || "").toUpperCase().includes("CES");
    const isCESNo = isCES && caseData?.cesType === "No";

    let currentRequirements = PHOTO_REQUIREMENTS;
    if (isCESNo) {
        currentRequirements = [
            { id: 'landmark', label: 'Landmark', min: 6, max: 100 }
        ];
    }

    const totalPhotosTaken = Object.values(photos).reduce((sum, arr) => sum + arr.length, 0);
    const allRequirementsMet = currentRequirements.every(req => {
        const count = photos[req.id]?.length || 0;
        return count >= (req.min || req.max);
    });

    // --- NEW: Flatten photos from all categories for display or upload ---
    const allDisplayedCategories = [...currentRequirements, ...(isCESNo ? [] : optionalCategories)];
    const allPhotosFlat = allDisplayedCategories.map(cat => photos[cat.id] || []).flat();

    // --- NEW: Delete photo function ---
    const deletePhoto = (category, index) => {
        Alert.alert(
            "Delete Photo",
            "Are you sure you want to delete this photo?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        const currentList = photos[category] || [];
                        const updatedList = [...currentList];
                        const removed = updatedList.splice(index, 1)[0];

                        // Optimistic update (Update UI immediately)
                        setPhotos(prev => ({ ...prev, [category]: updatedList }));

                        // Update Firebase (Persist deletion)
                        try {
                            await firebase.database().ref(`cases/${caseId}/photosFolder/${category}`).set(updatedList);
                            
                            // Optional: Cleanup Cloudinary file to save space
                            if (removed?.uri?.includes("cloudinary")) {
                                fetch(`${SERVER_URL}/cloudinary/destroy-from-url`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ url: removed.uri, resource_type: 'image' }),
                                }).catch(e => console.warn("Cloudinary delete failed", e));
                            }
                        } catch (e) {
                            console.error("Delete sync failed:", e);
                            Alert.alert("Error", "Failed to sync deletion with server.");
                        }
                    }
                }
            ]
        );
    };

    // --- NEW: Helper to download remote image to temp file for migration ---
    const downloadToTemp = async (uri) => {
        try {
            const filename = `migrated_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
            const fileUri = FileSystem.cacheDirectory + filename;
            const { uri: localUri } = await FileSystem.downloadAsync(uri, fileUri);
            return localUri;
        } catch (e) {
            console.warn("Download temp failed", e);
            return null;
        }
    };

    // --- NEW: Helper to upload single image to Cloudinary ---
    const uploadImageToCloudinary = async (photoObj, category, index) => {
        try {
            const uri = photoObj.uri || photoObj; // Handle object or string
            const formData = new FormData();
            // Add random component to filename to prevent overwriting on retries
            formData.append("file", { uri: uri, type: "image/jpeg", name: `${category}_${Date.now()}_${Math.floor(Math.random() * 10000)}_${index}.jpg` });
            formData.append("upload_preset", UPLOAD_PRESET);
            const rawRefNo = caseData.matrixRefNo || caseData.RefNo || caseId;
            const safeRefNo = rawRefNo.replace(/[^a-zA-Z0-9-_]/g, '_');
            formData.append("folder", `cases/${safeRefNo}`);
            console.log(`[UPLOAD-SINGLE] Target Folder: cases/${safeRefNo} (Ref: ${rawRefNo})`);

            // --- NEW: Attach Metadata (Context) to Cloudinary ---
            if (typeof photoObj === 'object') {
                const contextParts = [];
                if (photoObj.geotag) {
                    contextParts.push(`lat=${photoObj.geotag.latitude}`);
                    contextParts.push(`lng=${photoObj.geotag.longitude}`);
                }
                if (photoObj.address) {
                    // Replace pipes with commas to avoid breaking context format
                    contextParts.push(`address=${photoObj.address.replace(/\|/g, ',')}`);
                }
                if (photoObj.timestamp) {
                    contextParts.push(`timestamp=${photoObj.timestamp}`);
                }
                if (contextParts.length > 0) {
                    formData.append("context", contextParts.join("|"));
                }
            }

            const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
                method: "POST",
                body: formData,
            });

            const data = await response.json();
            if (data.secure_url) {
                return data.secure_url;
            } else {
                throw new Error(data.error?.message || "Upload failed");
            }
        } catch (error) {
            console.error("Cloudinary upload error:", error);
            return null;
        }
    };

    // Pick image
    const pickImage = async (category) => {
        if (!category) return Alert.alert("Error", "Photo category not specified.");

        console.log(`📁 Picking image for category: ${category}`);
        try {
            if (Platform.OS === "web") {
                Alert.alert("Gallery upload not supported on web.");
                console.log("❌ Gallery not supported on web");
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsMultipleSelection: true,
                quality: 1, // Use quality: 1 to prevent compression
            });
            console.log("📸 ImagePicker result:", result);
            if (!result.canceled) {
                const newPhotoAssets = result.assets || [result];
                const compressedPhotos = [];

                setIsUploadingPhotos(true);
                // --- NEW: Compress gallery images before adding them ---
                for (const asset of newPhotoAssets) {
                    console.log(`[OPTIMIZATION] Compressing gallery image: ${asset.uri}`);
                    const manipulatedImage = await ImageManipulator.manipulateAsync(
                        asset.uri,
                        [{ resize: { width: 800 } }],
                        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
                    );
                    compressedPhotos.push({ uri: manipulatedImage.uri });
                }

                // --- NEW: Immediate Upload to Cloudinary & Firebase Update ---
                const currentCategoryPhotos = photos[category] || [];
                const newUploadedPhotos = [];

                for (let i = 0; i < compressedPhotos.length; i++) {
                    const localUri = compressedPhotos[i].uri;
                    // Create temp object to pass to upload function
                    const tempPhoto = {
                        uri: localUri,
                        address: "Gallery Upload",
                        timestamp: new Date().toLocaleString()
                    };
                    const cloudUrl = await uploadImageToCloudinary(tempPhoto, category, i);
                    
                    if (cloudUrl) {
                        newUploadedPhotos.push({
                            uri: cloudUrl,
                            timestamp: new Date().toLocaleString(),
                            geotag: null, // Gallery images might not have geotag extracted here easily without Exif
                            address: "Gallery Upload",
                            category: category,
                            id: `${Date.now()}-${Math.random()}`
                        });
                    }
                }

                if (newUploadedPhotos.length > 0) {
                    const updatedList = [...currentCategoryPhotos, ...newUploadedPhotos];
                    await firebase.database().ref(`cases/${caseId}/photosFolder/${category}`).set(updatedList);
                    console.log(`[UPLOAD] Saved ${newUploadedPhotos.length} photos to Firebase for ${category}`);
                } else {
                    Alert.alert("Upload Failed", "Could not upload photos to server.");
                }
                setIsUploadingPhotos(false);
            }
        } catch (error) {
            console.log("❌ Image pick error:", error);
            setIsUploadingPhotos(false);
        }
    };

    const showPhotoOptions = (category) => {
        if (checkMaintenance()) return;

        const options = [
            {
                text: "Take Photo with GPS",
                onPress: () => openCamera(category),
            },
        ];

        if (maintenanceCamera) {
            options.push({
                text: "Import from Gallery",
                onPress: () => pickImage(category),
            });
        }

        options.push({ text: "Cancel", style: "cancel" });

        Alert.alert(
            "Add Photo",
            "How would you like to add a photo?",
            options
        );
    };
    const openCamera = (category) => {
        // --- MODIFIED: Navigate to the dedicated GPS Camera Screen with callback ---
        navigation.navigate("CameraGPSScreen", {
            caseId,
            category,
            onPhotosCapture: (newPhotos) => {
                console.log('[CaseDetailScreen] Received photos from callback with local URIs:', newPhotos);

                // 1. Immediately update local state to show photos with local URIs
                setPhotos(prevPhotos => {
                    const updated = { ...prevPhotos };
                    for (const photo of newPhotos) {
                        const cat = photo.category;
                        if (!updated[cat]) updated[cat] = [];
                        updated[cat].push({ ...photo, id: `local-${Date.now()}-${Math.random()}` });
                    }
                    console.log('[CaseDetailScreen] ✅ Photos state updated for immediate display.');
                    return updated;
                });

                // 2. Start background upload and Firebase update process
                (async () => {
                    setIsUploadingPhotos(true); // Show a non-blocking loading indicator
                    try {
                        const photosByCat = {};
                        newPhotos.forEach(p => {
                            if (!photosByCat[p.category]) photosByCat[p.category] = [];
                            photosByCat[p.category].push(p);
                        });

                        for (const cat in photosByCat) {
                            const currentFirebaseList = (await firebase.database().ref(`cases/${caseId}/photosFolder/${cat}`).once('value')).val() || [];
                            
                            const uploadedPhotos = [];
                            for (let i = 0; i < photosByCat[cat].length; i++) {
                                const p = photosByCat[cat][i];
                                const cloudUrl = await uploadImageToCloudinary(p, cat, i);
                                if (cloudUrl) {
                                    uploadedPhotos.push({ ...p, uri: cloudUrl, id: `${Date.now()}-${Math.random()}` });
                                }
                            }

                            if (uploadedPhotos.length > 0) {
                                const finalList = [...currentFirebaseList, ...uploadedPhotos];
                                await firebase.database().ref(`cases/${caseId}/photosFolder/${cat}`).set(finalList);
                                console.log(`[UPLOAD] Synced ${uploadedPhotos.length} new photos to Firebase for category ${cat}.`);
                            }
                        }
                    } catch (error) {
                        console.error("[UPLOAD] Background upload failed:", error);
                        Alert.alert("Upload Failed", "Some photos could not be uploaded. Please try again.");
                    } finally {
                        setIsUploadingPhotos(false);
                    }
                })();
            }
        });
    };
    // Take photo with camera + geotag
    const takePhoto = async () => {
    };

    // Close Case
// Close Case
const handleCloseCase = async () => {
    console.log("🔒 Closing case...");
    setIsClosing(true);

    if (!formCompleted && !isRAAssociates) {
        Alert.alert("Error", "Please fill in the form before closing the case.");
        setIsClosing(false);
        return;
    }

    if (!allRequirementsMet) {
        Alert.alert("Error", "Please complete the photo checklist before closing the case.");
        setIsClosing(false);
        return;
    }

    // --- FIX: Use the user object passed via route params ---
    // This avoids race conditions with firebase.auth().currentUser
    if (user && user.uid) {
        console.log("✅ Using authenticated user from route params. UID:", user.uid);
        await uploadAndCloseCase(user);
    } else {
        console.error("❌ No user object found in route params. Cannot close case.");
        Alert.alert("Authentication Error", "User session not found. Please go back and try again.");
        setIsClosing(false); // Stop the loading indicator
    }
};

// ✅ Helper function to handle upload + database update
    const uploadAndCloseCase = async (user) => {
    try {
        setShowProgressModal(true);
        setUploadProgress(0);
        setProgressMessage("Preparing submission...");

        // Calculate total operations for progress bar
        let totalOps = 2; // 1 for PDF Upload + 1 for Firebase Update
        for (const cat in photos) {
            totalOps += photos[cat].filter(p => !p.uri.startsWith("http")).length;
        }
        for (const category of currentRequirements) {
            totalOps += (photos[category.id] || []).length;
        }
        let currentOp = 0;
        const tick = (msg) => {
            currentOp++;
            setUploadProgress(currentOp / totalOps);
            if (msg) setProgressMessage(msg);
        };

        console.log("📤 Uploading photos to Cloudinary...");
        console.log("📋 Current photos in state:", photos);
        const uploadedPhotos = [];

        // --- NEW: Unified Folder Name based on Matrix Ref No ---
        const rawRefNo = caseData.matrixRefNo || caseData.RefNo || caseId;
        const safeRefNo = rawRefNo.replace(/[^a-zA-Z0-9-_]/g, '_');
        const targetFolder = `cases/${safeRefNo}`;

        // --- MODIFIED: Upload photos category by category ---
        const uploadedPhotosByCategory = { ...photos };

        // --- NEW: If admin marked categories to redo, delete their existing Cloudinary images before re-upload ---
        try {
            const redoCategories = caseData?.photosToRedo || [];
            if (Array.isArray(redoCategories) && redoCategories.length > 0) {
                console.log('[CLEANUP] Detected photosToRedo from admin:', redoCategories);
                for (const cat of redoCategories) {
                    const existing = caseData?.photosFolder?.[cat] || [];
                    for (const p of existing) {
                        if (p && p.uri && p.uri.startsWith('http')) {
                            try {
                                console.log('[CLEANUP] Deleting Cloudinary image for category', cat, p.uri);
                                const resp = await fetch(`${SERVER_URL}/cloudinary/destroy-from-url`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ url: p.uri, resource_type: 'image' }),
                                });
                                const json = await resp.json();
                                console.log('[CLEANUP] Cloudinary image delete response:', json);
                            } catch (delErr) {
                                console.warn('[CLEANUP] Failed to delete image at', p.uri, delErr);
                            }
                        }
                    }
                    // Ensure local uploadedPhotosByCategory removes stale entries for that category
                    uploadedPhotosByCategory[cat] = uploadedPhotosByCategory[cat] || [];
                }
                // Also delete previous PDF if present
                if (caseData?.photosFolderLink) {
                    try {
                        console.log('[CLEANUP] Deleting previous PDF at', caseData.photosFolderLink);
                        const pdfResp = await fetch(`${SERVER_URL}/cloudinary/destroy-from-url`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: caseData.photosFolderLink, resource_type: 'raw' }),
                        });
                        const pdfJson = await pdfResp.json();
                        console.log('[CLEANUP] Cloudinary PDF delete response:', pdfJson);
                    } catch (pdfDelErr) {
                        console.warn('[CLEANUP] Failed to delete old PDF:', pdfDelErr);
                    }
                }
            }
        } catch (cleanupErr) {
            console.warn('[CLEANUP] Error during pre-upload cleanup:', cleanupErr);
        }

        for (const category of Object.keys(photos)) {
            for (let i = 0; i < photos[category].length; i++) {
                const photo = photos[category][i];
                
                const isRemote = photo.uri.startsWith("http");
                // Check if already in correct folder to avoid re-uploading
                // We check if the URL contains the target folder path
                const isInCorrectFolder = isRemote && photo.uri.includes(targetFolder);

                if (isRemote && isInCorrectFolder) continue; // Already uploaded and in correct folder

                console.log(`[UPLOAD] Processing photo ${i} in ${category}. Remote: ${isRemote}, CorrectFolder: ${isInCorrectFolder}`);

                const formData = new FormData();
                if (isRemote) {
                    // Migration: Download -> Upload (Reliable for private images)
                    console.log(`[MIGRATION] Moving photo ${i} from ${photo.uri} to ${targetFolder}`);
                    const localTemp = await downloadToTemp(photo.uri);
                    if (localTemp) {
                         formData.append("file", { uri: localTemp, type: "image/jpeg", name: `migrated_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg` });
                    } else {
                         // Fallback to URL copy (might fail if private)
                         formData.append("file", photo.uri);
                    }
                } else {
                    // Upload local file
                    formData.append("file", { uri: photo.uri, type: "image/jpeg", name: `${category}_${Date.now()}_${i}.jpg` });
                }
                formData.append("upload_preset", UPLOAD_PRESET);
                formData.append("folder", targetFolder); // Unified folder

                // --- NEW: Attach Metadata (Context) during bulk upload ---
                const contextParts = [];
                if (photo.geotag) {
                    contextParts.push(`lat=${photo.geotag.latitude}`);
                    contextParts.push(`lng=${photo.geotag.longitude}`);
                }
                if (photo.address) {
                    contextParts.push(`address=${photo.address.replace(/\|/g, ',')}`);
                }
                if (photo.timestamp) {
                    contextParts.push(`timestamp=${photo.timestamp}`);
                }
                if (contextParts.length > 0) {
                    formData.append("context", contextParts.join("|"));
                }

                const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
                    method: "POST",
                    body: formData,
                });

                const data = await response.json();
                uploadedPhotosByCategory[category][i] = { ...photo, uri: data.secure_url };
                console.log(`[UPLOAD] Category: ${category}, Index: ${i}, New URL: ${data.secure_url}`);
                tick(`Uploading photos (${Math.round((currentOp/totalOps)*100)}%)...`);
            }
        }

        // --- MODIFIED: Save the structured photo object to Firebase ---
        // Sanitize photos BEFORE PDF generation to ensure timestamps/addresses are present
        const photoUrls = {};
        for (const category in uploadedPhotosByCategory) {
            photoUrls[category] = uploadedPhotosByCategory[category]
                .filter(photo => photo && photo.uri) // Filter out invalid photos
                .map(photo => ({
                    uri: photo.uri || '',
                    timestamp: photo.timestamp || new Date().toLocaleString(),
                    geotag: photo.geotag || null,
                    address: photo.address || 'Location unavailable',
                    category: photo.category || category,
                    id: photo.id || `${Date.now()}-${Math.random()}`,
                }));
        }
        console.log("💾 Prepared sanitized photos for PDF & Firebase:", photoUrls);

        const isCESClient = (caseData?.client || caseData?.company || "").toUpperCase().includes("CES");

        // --- NEW: Conditional logic for maintenance camera mode OR CES Client ---
        if (maintenanceCamera || isCESClient) {
            console.log(`[SUBMISSION] Submitting raw assets. Maintenance: ${maintenanceCamera}, CES: ${isCESClient}`);
            tick("Finalizing Case...");

            // Save sanitized photos to Firebase
            await firebase.database().ref(`cases/${caseId}/photosFolder`).set(photoUrls);
            
            // Update case status to 'audit'
            await firebase.database().ref(`cases/${caseId}`).update({
                status: "audit",
                completedAt: Date.now(),
                closedBy: user.uid,
                maintenanceSubmission: true, // Flag for admin to identify (or just rely on null link)
                photosFolderLink: null, // Ensure no old PDF link remains
            });

            // Remove any photosToRedo marker
            try {
                await firebase.database().ref(`cases/${caseId}/photosToRedo`).remove();
            } catch (e) {
                console.warn('[DB-UPDATE] Failed to clear photosToRedo:', e);
            }

            console.log("🔒 Case successfully submitted for audit (Raw/JPG Mode)!");
            setShowProgressModal(false);
            
            Alert.alert("Success", "Case submitted for audit.", [
                {
                    text: "OK", 
                    onPress: () => navigation.goBack()
                }
            ]);
            return; // Exit the function here
        }

        // --- NEW: Generate PDF on the client ---
        console.log('[PDF-LOG] 🚀 Starting PDF generation...');
        console.log('[PDF-LOG] Input photo object keys:', Object.keys(photoUrls || {}));

        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // --- NEW: Title Page (Page 1) ---
        const titlePage = pdfDoc.addPage();
        const { width: tWidth, height: tHeight } = titlePage.getSize();

        const titleText = "Audit Report";
        const dateText = new Date().toLocaleDateString();
        const refText = `Ref No: ${rawRefNo}`;

        const titleWidth = font.widthOfTextAtSize(titleText, 30);
        const dateWidth = font.widthOfTextAtSize(dateText, 18);
        const refWidth = font.widthOfTextAtSize(refText, 24);
        
        titlePage.drawText(titleText, {
            x: (tWidth - titleWidth) / 2,
            y: tHeight / 2 + 50,
            size: 30,
            font,
            color: rgb(0, 0, 0)
        });
        titlePage.drawText(dateText, {
            x: (tWidth - dateWidth) / 2,
            y: tHeight / 2,
            size: 18,
            font,
            color: rgb(0, 0, 0)
        });
        titlePage.drawText(refText, {
            x: (tWidth - refWidth) / 2,
            y: tHeight / 2 - 50,
            size: 24,
            font,
            color: rgb(0, 0, 0)
        });
        // --------------------------------

        let page;

        // Subsequent pages: Photos
        console.log('[PDF-LOG] ⚙️ Preparing to add photos...');
        let totalPhotosAdded = 0;

        for (const category of currentRequirements) {
            const photosInCategory = photoUrls[category.id] || [];
            if (photosInCategory.length === 0) continue;

            console.log(`[PDF-LOG] --- Processing Category: ${category.id} (${photosInCategory.length} photos) ---`);

            // Add a new page for each new category
            page = pdfDoc.addPage();
            let y = page.getHeight() - 50;
            
            // Draw category heading
            page.drawText(category.label, { x: 50, y, font, size: 18, color: rgb(0, 0, 0) });
            y -= 40; // Leave space for heading

            for (let i = 0; i < photosInCategory.length; i++) {
                const photo = photosInCategory[i];
                totalPhotosAdded++;
                console.log(`[PDF-LOG]   - Adding photo ${i + 1}/${photosInCategory.length} (Total: ${totalPhotosAdded}). URI: ${photo.uri}`);
                tick(`Generating Report (${Math.round((currentOp/totalOps)*100)}%)...`);

                try {
                    let imgBytes;
                    let isPng = false;

                    // Helper to fetch buffer with retry logic for network resilience
                    const fetchBuffer = async (u, retries = 3) => {
                        // Force HTTPS
                        let url = u;
                        if (url && url.startsWith("http://")) url = url.replace("http://", "https://");

                        for (let i = 0; i < retries; i++) {
                            try {
                                const r = await fetch(url);
                                if (!r.ok) throw new Error(`Status ${r.status}`);
                                return await r.arrayBuffer();
                            } catch (e) {
                                console.warn(`[PDF-FETCH] Attempt ${i + 1} failed for ${url}: ${e.message}`);
                                if (i === retries - 1) {
                                    // Fallback: Try FileSystem download (better for large files/Android)
                                    try {
                                        const fileUri = FileSystem.cacheDirectory + `temp_pdf_${Date.now()}.jpg`;
                                        const dl = await FileSystem.downloadAsync(url, fileUri);
                                        if (dl.status !== 200) throw new Error(`FS Status ${dl.status}`);
                                        const b64 = await FileSystem.readAsStringAsync(dl.uri, { encoding: FileSystem.EncodingType.Base64 });
                                        const binaryString = atob(b64);
                                        const bytes = new Uint8Array(binaryString.length);
                                        for (let k = 0; k < binaryString.length; k++) bytes[k] = binaryString.charCodeAt(k);
                                        return bytes;
                                    } catch (fsErr) { throw e; }
                                }
                                await new Promise(res => setTimeout(res, 1000 * (i + 1))); // Exponential backoff
                            }
                        }
                    };

                    // 1. Try Optimized (Fastest & Best for PDF)
                    let optimizedUrl = photo.uri;
                    // Check if URL is signed (contains /s--) to avoid breaking signature with transformations
                    const isSigned = photo.uri.includes("/s--");
                    if (!isSigned && photo.uri.includes("cloudinary.com") && photo.uri.includes("/upload/") && !photo.uri.includes("f_jpg")) {
                        optimizedUrl = photo.uri.replace("/upload/", "/upload/w_600,q_50,f_jpg/");
                    }

                    try {
                        imgBytes = await fetchBuffer(optimizedUrl);
                        isPng = false; 
                    } catch (e1) {
                        // 2. Try Original
                        try {
                            imgBytes = await fetchBuffer(photo.uri);
                            isPng = photo.uri.toLowerCase().endsWith('.png');
                        } catch (e2) {
                            // 3. Try appending .jpg (Fix for missing extension)
                            if (!isSigned) {
                                imgBytes = await fetchBuffer(photo.uri + ".jpg");
                                isPng = false;
                            } else {
                                throw e2;
                            }
                        }
                    }

                    let image;
                    try {
                        if (imgBytes) {
                            image = isPng ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes);
                        } else {
                            throw new Error("No image data fetched");
                        }
                    } catch (embedErr) {
                        // If embedding failed, try the other format just in case extension was wrong
                        try {
                            image = isPng ? await pdfDoc.embedJpg(imgBytes) : await pdfDoc.embedPng(imgBytes);
                        } catch (finalErr) {
                            console.error(`[PDF-LOG] Final embed failed for ${photo.uri}`);
                            throw finalErr;
                        }
                    }

                    // Reduce max height to leave space for heading and metadata
                    const dims = image.scaleToFit(page.getWidth() - 100, 300);

                    // --- PAGE BREAK CHECK: Prevent Overlap ---
                    if (y - dims.height < 200) { // Increased margin to prevent overlap
                        page = pdfDoc.addPage();
                        y = page.getHeight() - 50;
                    }

                    const imageX = 50;
                    const imageY = y - dims.height;
                    page.drawImage(image, { x: imageX, y: imageY, width: dims.width, height: dims.height });

                    // Update y-position for the next element
                    y = imageY - 20; // Reduced padding since overlay is gone

                } catch (imgErr) {
                    console.error(`[PDF-LOG] ❌ FAILED to embed image ${photo.uri}:`, imgErr);
                    // REMOVED: Error placeholder drawing. 
                    // If image fails, we simply skip drawing it in the PDF to avoid error messages appearing in the report.
                }
            }
        }

        console.log(`[PDF-LOG] ✅ Total photos processed for PDF: ${totalPhotosAdded}`);
        const pdfBytes = await pdfDoc.save();
        console.log("[PDF-LOG] 💾 PDF generated, size:", pdfBytes.length, "bytes.");

        // --- FIX: Explicitly delete the old PDF before uploading a new one ---
        if (caseData.photosFolderLink) {
            console.log('[PDF-CLEANUP] Deleting old PDF before new upload:', caseData.photosFolderLink);
            try {
                await fetch(`${SERVER_URL}/cloudinary/destroy-from-url`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: caseData.photosFolderLink, resource_type: 'raw' }),
                });
                console.log('[PDF-CLEANUP] ✅ Old PDF deletion request sent.');
            } catch (pdfDelErr) {
                console.warn('[PDF-CLEANUP] ⚠️ Failed to delete old PDF, proceeding with upload anyway:', pdfDelErr);
            }
        }

        // --- Upload generated PDF to Cloudinary (with retry logic) ---
        console.log('[PDF-LOG] ☁️ Uploading PDF to Cloudinary...');
        tick("Uploading PDF Report...");
        const pdfBase64 = uint8ToBase64Safe(pdfBytes);
        const uniquePdfPublicId = `CaseReport_${safeRefNo}_${Date.now()}`;
        let finalPdfUrl = null;
        let uploadSuccess = false;

        // Try server-side upload first (more reliable with API keys)
        const uploadViaServer = async (retries = 3) => {
            for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                    console.log(`[PDF-UPLOAD] Attempt ${attempt}/${retries} via server at ${SERVER_URL}/cloudinary/upload-pdf`);
                    const pdfResp = await Promise.race([
                        fetch(`${SERVER_URL}/cloudinary/upload-pdf`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ base64: pdfBase64, public_id: uniquePdfPublicId, folder: `cases/${safeRefNo}` }),
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Server upload timeout')), 30000))
                    ]);
                    
                    if (!pdfResp.ok) {
                        console.warn(`[PDF-UPLOAD] Server returned status ${pdfResp.status}`);
                        throw new Error(`Server error: ${pdfResp.status}`);
                    }
                    
                    const pdfJson = await pdfResp.json();
                    console.log('[PDF-UPLOAD] Server response:', pdfJson);
                    
                    if (pdfJson && pdfJson.result && pdfJson.result.secure_url) {
                        console.log('[PDF-LOG] ✅ Server upload successful:', pdfJson.result.secure_url);
                        return pdfJson.result.secure_url;
                    }
                    throw new Error('Invalid response: ' + JSON.stringify(pdfJson));
                } catch (err) {
                    console.warn(`[PDF-UPLOAD] Attempt ${attempt} failed: ${err.message}`);
                    if (attempt < retries) {
                        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
                        console.log(`[PDF-UPLOAD] Retrying in ${delay}ms...`);
                        await new Promise(r => setTimeout(r, delay));
                    }
                }
            }
            console.warn('[PDF-UPLOAD] All server attempts exhausted');
            return null;
        };

        // Fallback: direct client-side upload to Cloudinary (uses upload preset)
        const uploadViaClientDirect = async () => {
            try {
                console.log('[PDF-UPLOAD] Attempting direct client-side upload to Cloudinary...');
                console.log('[PDF-UPLOAD] Cloud name:', CLOUD_NAME, 'Upload preset:', UPLOAD_PRESET);
                
                const formData = new FormData();
                formData.append('file', {
                    uri: `data:application/pdf;base64,${pdfBase64}`,
                    type: 'application/pdf',
                    name: `${uniquePdfPublicId}.pdf`
                });
                formData.append('upload_preset', UPLOAD_PRESET);
                formData.append('folder', `cases/${safeRefNo}`);
                formData.append('public_id', uniquePdfPublicId);
                formData.append('resource_type', 'raw');

                const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`;
                console.log('[PDF-UPLOAD] Uploading to:', uploadUrl);
                
                const resp = await Promise.race([
                    fetch(uploadUrl, {
                        method: 'POST',
                        body: formData,
                    }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Direct upload timeout')), 30000))
                ]);
                
                if (!resp.ok) {
                    const text = await resp.text();
                    console.error('[PDF-UPLOAD] Server error:', resp.status, text);
                    throw new Error(`Cloudinary error: ${resp.status} ${text}`);
                }
                
                const json = await resp.json();
                console.log('[PDF-UPLOAD] Cloudinary response:', JSON.stringify(json, null, 2));
                
                if (json.secure_url) {
                    console.log('[PDF-UPLOAD] ✅ Direct upload successful:', json.secure_url);
                    return json.secure_url;
                }
                
                if (json.error) {
                    throw new Error(`Cloudinary error: ${json.error.message}`);
                }
                
                throw new Error('No secure_url in response: ' + JSON.stringify(json));
            } catch (err) {
                console.error('[PDF-UPLOAD] Direct upload error:', err.message, err.stack);
                return null;
            }
        };

        // Execute upload strategy: try server first, fallback to direct
        try {
            finalPdfUrl = await uploadViaServer(3);
            if (!finalPdfUrl) {
                console.log('[PDF-UPLOAD] Server upload failed, trying direct Cloudinary upload...');
                finalPdfUrl = await uploadViaClientDirect();
            }
            if (!finalPdfUrl) {
                throw new Error('All PDF upload methods failed');
            }
            uploadSuccess = true;
            console.log('[PDF-LOG] 🎉 PDF generation and upload complete. URL:', finalPdfUrl);
        } catch (err) {
            console.error('[PDF-LOG] 💥 PDF upload failed, proceeding with partial submission:', err);
            Alert.alert("PDF Warning", "The PDF report could not be generated due to network issues. The case will be submitted with photos only.");
        }

        // --- FINAL: Update Firebase with the correct PDF link ---
        console.log('[DB-UPDATE] Saving final data to Firebase...');
        tick("Finalizing Case...");
        console.log('[DB-UPDATE] Photo URLs object:', photoUrls);
        
        // Save sanitized photos to Firebase
        await firebase.database().ref(`cases/${caseId}/photosFolder`).set(photoUrls);
        await firebase.database().ref(`cases/${caseId}`).update({
            photosFolderLink: finalPdfUrl || null, // Handle null if PDF failed
            status: "audit", // Always go to audit for submission
            completedAt: Date.now(),
            closedBy: user.uid,
            pdfGenerationFailed: !finalPdfUrl // Flag for admin
        });
        // Remove any photosToRedo marker now that we've regenerated files
        try {
            await firebase.database().ref(`cases/${caseId}/photosToRedo`).remove();
            console.log('[DB-UPDATE] photosToRedo cleared from Firebase.');
        } catch (e) {
            console.warn('[DB-UPDATE] Failed to clear photosToRedo:', e);
        }
        console.log('[DB-UPDATE] ✅ Firebase updated with final PDF link and photos.');

        setPhotos(uploadedPhotosByCategory);
        setStatus("audit");

        console.log("🔒 Case successfully submitted to audit!");
        setShowProgressModal(false);
        
        Alert.alert("Success", "Case marked as submitted for audit!", [
            {
                text: "View PDF Report",
                onPress: () => Linking.openURL(finalPdfUrl),
            },
            {
                text: "OK", 
                onPress: () => {
                    // Force refresh by navigating away and back
                    console.log('[REFRESH] Forcing UI refresh after submission');
                    // This will trigger the Firebase listener to update all state
                }
            }
        ]);
    } catch (error) {
        console.log("❌ Error closing case:", error);
        console.log("❌ Error stack:", error.stack);
        console.log("❌ Error message:", error.message);
        Alert.alert("Error", "Failed to submit: " + (error.message || JSON.stringify(error)));
        setShowProgressModal(false);
    } finally {
        setIsClosing(false);
        // Modal is closed in success/catch blocks
    }
};

    // --- NEW: Add an optional category to the view ---
    const addOptionalCategory = (category) => {
        if (checkMaintenance()) return;

        if (!optionalCategories.some(c => c.id === category.id)) {
            setOptionalCategories(prev => [...prev, category]);
        }
        setAddPhotoModalVisible(false);
    };

    // --- NEW: WhatsApp Query Handler ---
    const handleQuery = () => {
        const adminPhoneNumber = "919962873989"; // Country code + number
        const text = `Client: ${caseData.client || caseData.company || ''}\nRef No: ${caseData.RefNo || caseId}\nQuery: `;
        const url = `whatsapp://send?phone=${adminPhoneNumber}&text=${encodeURIComponent(text)}`;
        Linking.openURL(url).catch(() => {
             // Fallback for web or if WhatsApp is not installed
             Linking.openURL(`https://wa.me/${adminPhoneNumber}?text=${encodeURIComponent(text)}`);
        });
    };



    if (!authChecked || !caseData) {
        console.log("⏳ Waiting for auth or case data...");
        return (
            <LinearGradient colors={["#4e0360", "#1a1a1a", "#4e0360"]} style={styles.container}>
                <Text style={styles.infoText}>Loading case data...</Text>
            </LinearGradient>
        );
    }

    console.log("✅ Rendering CaseDetailScreen with status:", displayStatus);

    return (
        <LinearGradient colors={["#0f0c29", "#302b63", "#24243e"]} style={styles.container}>
            <Image
                source={require("../assets/logo.png")}
                style={styles.bgLogo}
                resizeMode="contain"
                pointerEvents="none"
            />
            
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => {
                        console.log("🔙 Back button pressed");
                        if (navigation.canGoBack()) navigation.goBack();
                        else role === "admin" ? navigation.replace("AdminPanel") : navigation.replace("Dashboard");
                    }}
                    style={styles.iconButton}
                >
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t("caseDetails")}</Text>
                <TouchableOpacity onPress={handleQuery} style={styles.iconButton}>
                    <Ionicons name="help-circle-outline" size={24} color="#fff" />
                </TouchableOpacity>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Case Info Card */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <View style={{ flex: 1, paddingRight: 110 }}>
                            <Text style={styles.caseRef}>{caseData.matrixRefNo || caseData.RefNo || caseId}</Text>
                            <Text style={styles.companyName}>{caseData.company || "Unknown Company"}</Text>
                        </View>
                        <View style={[styles.statusBadge, { position: 'absolute', top: 0, right: 0, backgroundColor: isAuditFail ? '#ff4444' : (displayStatus === 'completed' ? '#4caf50' : '#ff9800') }]}>
                            <Text style={styles.statusText}>{isAuditFail ? "AUDIT FAIL" : displayStatus.toUpperCase()}</Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.infoRow}>
                        <Ionicons name="location-outline" size={18} color="#aaa" style={styles.infoIcon} />
                        <Text style={styles.infoText}>{caseData.address || "No address provided"}</Text>
                    </View>
                    
                    <View style={styles.infoRow}>
                         <Ionicons name="map-outline" size={18} color="#aaa" style={styles.infoIcon} />
                         <Text style={styles.infoText}>{caseData.city || caseData.state ? `${caseData.city || ''}, ${caseData.state || ''}` : "Location N/A"} - {caseData.pincode || ""}</Text>
                    </View>

                    <View style={styles.infoRow}>
                        <Ionicons name="call-outline" size={18} color="#aaa" style={styles.infoIcon} />
                        <Text style={styles.infoText}>{caseData.contactNumber || "No contact"}</Text>
                        {caseData.contactNumber && (
                            <TouchableOpacity onPress={() => Linking.openURL(`tel:${caseData.contactNumber}`)} style={styles.callButton}>
                                <Text style={styles.callButtonText}>Call</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <View style={styles.metaContainer}>
                        <View style={styles.metaItem}>
                            <Text style={styles.metaLabel}>{t("initiated")}</Text>
                            <Text style={styles.metaValue}>{caseData.dateInitiated ? new Date(caseData.dateInitiated).toLocaleDateString() : "-"}</Text>
                        </View>
                        <View style={styles.metaItem}>
                            <Text style={styles.metaLabel}>{t("assignedTo")}</Text>
                            <Text style={styles.metaValue}>{assignedEmail.split('@')[0]}</Text>
                        </View>
                    </View>

                    {displayStatus === "closed" && caseData.photosFolderLink && (
                        <TouchableOpacity
                            style={styles.downloadButton}
                            onPress={() => Linking.openURL(caseData.photosFolderLink)}
                        >
                            <Ionicons name="cloud-download-outline" size={20} color="#fff" />
                            <Text style={styles.downloadText}>{t("downloadReport")}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Audit Feedback */}
                {caseData.auditFeedback && displayStatus === 'open' && (
                  <View style={styles.feedbackCard}>
                    <View style={styles.feedbackHeader}>
                        <Ionicons name="warning" size={20} color="#ffd700" />
                        <Text style={styles.feedbackTitle}>{t("actionRequired")}</Text>
                    </View>
                    <Text style={styles.feedbackText}>{caseData.auditFeedback}</Text>
                  </View>
                )}

                {/* Photo Checklist */}
                <Text style={styles.sectionHeader}>{t("photoChecklist")}</Text>
                
                {allDisplayedCategories.map((req) => {
                    const taken = photos[req.id]?.length || 0;
                    const target = req.min || req.max;
                    const isComplete = taken >= target;
                    // For CES No, we allow more than min, so we don't hide add button based on max unless it's reached
                    const showAddButton = (displayStatus === "open" || forceEdit) && taken < req.max;
                    
                    return (
                        <View key={req.id} style={styles.checklistCard}>
                            <View style={styles.checklistHeader}>
                                <View style={styles.checklistInfo}>
                                    <Text style={styles.checklistTitle}>{language === 'ta' ? t(req.id) : req.label}</Text>
                                    <Text style={[styles.checklistCount, isComplete ? styles.textSuccess : styles.textWarning]}>
                                        {taken} / {req.min ? `${req.min}+` : req.max}
                                    </Text>
                                </View>
                                {showAddButton && (
                                    <View>
                                        <TouchableOpacity style={styles.cameraButton} onPress={() => showPhotoOptions(req.id)}>
                                            <Ionicons name="camera" size={20} color="#fff" />
                                            <Text style={styles.cameraButtonText}>{t("add")}</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>

                            {isUploadingPhotos && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                                    <ActivityIndicator size="small" color="#fff" />
                                    <Text style={{ color: '#ccc', marginLeft: 8, fontSize: 12 }}>Uploading photos...</Text>
                                </View>
                            )}
                            
                            {photos[req.id]?.length > 0 ? (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
                                    {photos[req.id].map((photo, index) => (
                                        <View key={index} style={styles.photoContainer}>
                                            <TouchableOpacity onPress={() => setSelectedPhoto(photo)}>
                                                <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
                                            </TouchableOpacity>
                                            {(displayStatus === "open" || forceEdit) && (
                                                <TouchableOpacity style={styles.deleteButton} onPress={() => deletePhoto(req.id, index)}>
                                                    <Ionicons name="close-circle" size={24} color="#ff4444" />
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    ))}
                                </ScrollView>
                            ) : (
                                <Text style={styles.emptyPhotoText}>No photos yet</Text>
                            )}
                        </View>
                    );
                })}

                {/* Add Optional Photos */}
                {(displayStatus === 'open' || forceEdit) && !isCESNo && (
                    <TouchableOpacity style={styles.addOptionalButton} onPress={() => {
                        if (checkMaintenance()) return;
                        setAddPhotoModalVisible(true);
                    }}>
                        <LinearGradient colors={["#2193b0", "#6dd5ed"]} style={styles.gradientButton} start={{x:0, y:0}} end={{x:1, y:0}}>
                            <Ionicons name="add-circle-outline" size={24} color="#fff" />
                            <Text style={styles.gradientButtonText}>{t("addOptional")}</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                )}

                {/* All Photos Grid */}
                {allPhotosFlat.length > 0 && (
                    <>
                        <Text style={styles.sectionHeader}>{t("galleryView")}</Text>
                        <View style={styles.gridContainer}>
                            {allPhotosFlat.map((photo, index) => (
                                <TouchableOpacity key={index} onPress={() => setSelectedPhoto(photo)} style={styles.gridItem}>
                                    <Image source={{ uri: photo.uri }} style={styles.gridImage} />
                                </TouchableOpacity>
                            ))}
                        </View>
                    </>
                )}
            </ScrollView>

            {/* Fullscreen Photo Modal */}
            <Modal visible={!!selectedPhoto} transparent={true} animationType="fade">
                <View style={styles.modalContainer}>
                    <TouchableOpacity style={styles.modalClose} onPress={() => setSelectedPhoto(null)}>
                        <Text style={styles.modalCloseText}>✕</Text>
                    </TouchableOpacity>
                    {selectedPhoto && (
                        <ImageBackground source={{ uri: selectedPhoto.uri }} style={styles.fullscreenPhoto}>
                            <View style={styles.fullscreenOverlay}>
                                {selectedPhoto.geotag && (
                                    <Text style={styles.overlayText}>
                                        📍 {selectedPhoto.geotag.latitude.toFixed(4)}, {selectedPhoto.geotag.longitude.toFixed(4)}
                                    </Text>
                                )}
                                {selectedPhoto.timestamp && <Text style={styles.overlayText}>🕒 {selectedPhoto.timestamp}</Text>}
                                {selectedPhoto.address && <Text style={styles.overlayText}>🏠 {selectedPhoto.address}</Text>}
                            </View>
                        </ImageBackground>
                    )}
                </View>
            </Modal>

            {/* ----- Company Selection Modal ----- */}
            <Modal visible={detailsModalVisible} transparent={true} animationType="slide">
                <View style={styles.detailsModal}>
                    <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 20, color: "#fff", textAlign: "center" }}>
                        {t("chooseCompany")}
                    </Text>

                    {["CES", "Matrix", "DHI"].map((company) => (
                        <TouchableOpacity
                            key={company}
                            style={[styles.actionButton, { marginVertical: 8, backgroundColor: "#6a1b9a" }]}
                            onPress={() => {
                                setDetailsModalVisible(false);
                                // Navigate to FormScreen with selected company
                                if (company === "Matrix") {
                                    navigation.navigate("MatrixFormScreen", { company, caseId });
                                } else if (company === "DHI") {
                                    navigation.navigate("DHIFormScreen", { company, caseId });
                                } else {
                                    navigation.navigate("FormScreen", { company, caseId });
                                }
                            }}
                        >
                            <Text style={styles.buttonText}>{company}</Text>
                        </TouchableOpacity>
                    ))}

                    {/* Cancel Button */}
                    <TouchableOpacity
                        style={[styles.actionButton, { marginTop: 20, backgroundColor: "#aaa" }]}
                        onPress={() => setDetailsModalVisible(false)}
                    >
                        <Text style={styles.buttonText}>{t("cancel")}</Text>
                    </TouchableOpacity>
                </View>
            </Modal>

            {/* --- NEW: Add Optional Photo Category Modal --- */}
            <Modal visible={addPhotoModalVisible} transparent={true} animationType="slide">
                <View style={styles.detailsModal}>
                    <Text style={styles.modalTitle}>{t("addOptional")}</Text>
                    {OPTIONAL_PHOTO_CATEGORIES.map((cat) => (
                        <TouchableOpacity
                            key={cat.id}
                            style={[styles.actionButton, { marginVertical: 8, backgroundColor: "#6a1b9a" }]}
                            onPress={() => addOptionalCategory(cat)}
                        >
                            <Text style={styles.buttonText}>{language === 'ta' ? t(cat.id) : cat.label}</Text>
                        </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                        style={[styles.actionButton, { marginTop: 20, backgroundColor: "#aaa" }]}
                        onPress={() => setAddPhotoModalVisible(false)}
                    >
                        <Text style={styles.buttonText}>{t("cancel")}</Text>
                    </TouchableOpacity>
                </View>
            </Modal>

            {/* Bottom buttons, only shown if camera is not visible */}
            {!cameraVisible && (
                <View style={styles.bottomContainer}>
                    {(role === "member" || forceEdit) && (
                        <>
                        <TouchableOpacity
                            style={styles.bottomBtn}
                            onPress={() => {
                                if (checkMaintenance()) return;
                                if (!forceEdit && formCompleted && caseData?.filledForm?.url) {
                                    Linking.openURL(caseData.filledForm.url);
                                } else {
                                    const rawCompany = caseData?.company;
                                    const rawClient = caseData?.client;
                                    const isMatrix = (rawCompany || "").toLowerCase().trim() === "matrix" || 
                                                     (rawClient || "").toLowerCase().trim() === "matrix";
                                    const isDHI = (rawCompany || "").toLowerCase().trim() === "dhi" || 
                                                     (rawClient || "").toLowerCase().trim() === "dhi";

                                    console.log("[CaseDetailScreen] Redirect Debug:");
                                    console.log(" - caseData.company:", rawCompany);
                                    console.log(" - caseData.client:", rawClient);
                                    console.log(" - Is Matrix detected:", isMatrix);
                                    console.log(" - Is DHI detected:", isDHI);

                                    if (isMatrix) {
                                        console.log(" -> Navigating to MatrixFormScreen");
                                        navigation.navigate("MatrixFormScreen", { caseId, company: "Matrix" });
                                    } else if (isDHI) {
                                        console.log(" -> Navigating to DHIFormScreen");
                                        navigation.navigate("DHIFormScreen", { caseId, company: "DHI" });
                                    } else {
                                        console.log(" -> Navigating to FormScreen (Default)");
                                        navigation.navigate("FormScreen", { caseId, company: caseData?.company || caseData?.client });
                                    }
                                }
                            }}
                        >
                            <LinearGradient colors={["#4776E6", "#8E54E9"]} style={styles.bottomBtnGradient}>
                                <Ionicons name="document-text-outline" size={20} color="#fff" />
                                <Text style={styles.bottomBtnText}>{formCompleted && !forceEdit ? t("viewForm") : t("fillEditForm")}</Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        {shouldShowCloseButton() && (
                             <TouchableOpacity style={styles.bottomBtn} onPress={handleCloseCase} disabled={isClosing}>
                                <LinearGradient colors={["#11998e", "#38ef7d"]} style={styles.bottomBtnGradient}>
                                    {isClosing ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />}
                                    <Text style={styles.bottomBtnText}>{isClosing ? "Updating..." : (forceEdit ? t("updateCase") : t("closeCase"))}</Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        )}
                        </>
                    )}
                </View>
            )}

            {/* Progress Modal */}
            <Modal visible={showProgressModal} transparent={true} animationType="fade">
                <View style={styles.loadingOverlay}>
                    <View style={styles.loadingBox}>
                        <Text style={styles.loadingText}>{progressMessage}</Text>
                        <View style={styles.progressBarContainer}>
                            <View style={[styles.progressBarFill, { width: `${Math.min(uploadProgress * 100, 100)}%` }]} />
                        </View>
                        <Text style={styles.percentageText}>{Math.round(Math.min(uploadProgress * 100, 100))}%</Text>
                    </View>
                </View>
            </Modal>
        </LinearGradient>
    );
}

// ---- Styles unchanged ----
const styles = StyleSheet.create({
    container: { flex: 1 },
    bgLogo: { position: "absolute", alignSelf: "center", top: "30%", width: 300, height: 300, opacity: 0.05 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 50, paddingBottom: 15, zIndex: 10 },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
    iconButton: { padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 },
    scrollContent: { padding: 20, paddingBottom: 120 },
    
    // Case Card
    card: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 20 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    caseRef: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 },
    companyName: { fontSize: 14, color: '#aaa', fontWeight: '600' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    statusText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 15 },
    
    infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    infoIcon: { marginRight: 10, width: 20 },
    infoText: { color: '#eee', fontSize: 14, flex: 1, lineHeight: 20 },
    callButton: { backgroundColor: '#0ea5e9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginLeft: 10 },
    callButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
    
    metaContainer: { flexDirection: 'row', marginTop: 10, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 12 },
    metaItem: { flex: 1 },
    metaLabel: { color: '#888', fontSize: 11, marginBottom: 4, textTransform: 'uppercase' },
    metaValue: { color: '#fff', fontSize: 14, fontWeight: '600' },
    
    downloadButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#4e0360', padding: 12, borderRadius: 12, marginTop: 15 },
    downloadText: { color: '#fff', fontWeight: 'bold', marginLeft: 8 },

    // Feedback
    feedbackCard: { backgroundColor: 'rgba(255, 193, 7, 0.15)', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255, 193, 7, 0.3)' },
    feedbackHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    feedbackTitle: { color: '#ffd700', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
    feedbackText: { color: '#ffe082', fontSize: 14, lineHeight: 20 },

    // Checklist
    sectionHeader: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 15, marginTop: 10 },
    checklistCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 15, marginBottom: 15 },
    checklistHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    checklistInfo: { flex: 1 },
    checklistTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 4 },
    checklistCount: { fontSize: 12, fontWeight: 'bold' },
    textSuccess: { color: '#4caf50' },
    textWarning: { color: '#ff9800' },
    cameraButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2563eb', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    cameraButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold', marginLeft: 6 },
    photoScroll: { marginTop: 5 },
    photoContainer: { position: 'relative', marginRight: 10 },
    photoThumb: { width: 70, height: 70, borderRadius: 10, backgroundColor: '#333' },
    deleteButton: {
        position: 'absolute',
        top: -8,
        right: -8,
        backgroundColor: '#fff',
        borderRadius: 12,
    },
    emptyPhotoText: { color: '#666', fontSize: 12, fontStyle: 'italic' },

    // Optional Button
    addOptionalButton: { marginBottom: 20 },
    gradientButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, borderRadius: 16 },
    gradientButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },

    // Grid
    gridContainer: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
    gridItem: { width: '33.33%', padding: 5 },
    gridImage: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: '#333' },

    // Bottom Actions
    bottomContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: 'rgba(15, 12, 41, 0.9)', borderTopLeftRadius: 24, borderTopRightRadius: 24, flexDirection: 'row', gap: 15 },
    bottomBtn: { flex: 1 },
    bottomBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 16 },
    bottomBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14, marginLeft: 8 },

    // Modals & Overlays
    overlay: { backgroundColor: "rgba(0,0,0,0.6)", padding: 4, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
    overlayText: { color: "#fff", fontSize: 11 },
    modalContainer: { flex: 1, backgroundColor: "#000" },
    fullscreenPhoto: { width: "100%", height: "100%", justifyContent: "flex-end" },
    fullscreenOverlay: { backgroundColor: "rgba(0,0,0,0.6)", padding: 10 },
    modalClose: { position: "absolute", top: 40, right: 20, zIndex: 10 },
    modalCloseText: { fontSize: 28, color: "#ff5e62" },
    actionButton: { borderRadius: 12, padding: 14, alignItems: "center" },
    buttonText: { color: "#fff", fontWeight: "700" },
    infoText: { flex: 1, textAlign: "center", textAlignVertical: "center", fontSize: 16, color: "#fff" },
    detailsModal: { flex: 1, justifyContent: "center", margin: 20, backgroundColor: "#222", borderRadius: 12, padding: 20 },
    modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 20, color: "#fff", textAlign: "center" },
    
    // Progress Modal Styles
    loadingOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.7)",
        justifyContent: "center",
        alignItems: "center",
    },
    loadingBox: {
        width: "80%",
        backgroundColor: "#fff",
        padding: 25,
        borderRadius: 15,
        alignItems: "center",
        elevation: 10,
    },
    loadingText: { marginBottom: 15, fontSize: 16, fontWeight: "bold", color: "#333", textAlign: 'center' },
    progressBarContainer: {
        width: "100%",
        height: 12,
        backgroundColor: "#e0e0e0",
        borderRadius: 6,
        overflow: "hidden",
    },
    progressBarFill: { height: "100%", backgroundColor: "#4caf50" },
    percentageText: { marginTop: 10, color: "#666", fontSize: 14, fontWeight: 'bold' },
});
