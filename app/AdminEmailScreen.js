import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
    Alert,
    NativeModules,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import firebase from "../firebase";
import { GlowButton } from "./GlowButton";

// Server URL for sending email - Use your laptop's local IP address
const scriptURL = NativeModules.SourceCode?.scriptURL;
const localIp = scriptURL ? scriptURL.split('://')[1].split(':')[0] : "localhost";
const SERVER_URL = `http://${localIp}:3000`;

export default function AdminEmailScreen({ navigation, route }) {
    const { caseData, caseId, user } = route.params;

    const [to, setTo] = useState("");
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState(null);

    // Pre-fill email fields when the component mounts
    useEffect(() => {
        if (caseData) {
            // You can customize the recipient logic here.
            // For now, let's use a placeholder or a client-specific email if available.
            const recipientEmail = "client-email@example.com"; // Placeholder
            setTo(recipientEmail);

            const emailSubject = `Case Approved: ${caseData.matrixRefNo || caseData.RefNo || caseId}`;
            setSubject(emailSubject);

            const emailBody = `
Dear Client,

This is to inform you that the verification for the following case has been completed and approved. Please find the final report and the submitted verification form attached to this email.

Case Details:
--------------------
Reference No: ${caseData.matrixRefNo || caseData.RefNo || caseId}
Candidate Name: ${caseData.candidateName || 'N/A'}
Check Type: ${caseData.chkType || 'N/A'}
City: ${caseData.city || 'N/A'} 

Thank you,
Spacesolutions Team
            `;
            setBody(emailBody.trim());
        }
    }, [caseData]);

    const handleSendEmail = async () => {
        if (!to || !subject || !body) {
            // --- FIX: Use a cross-platform alert ---
            if (Platform.OS === 'web') {
                alert("Missing Fields: Please ensure To, Subject, and Body are filled.");
            } else {
                Alert.alert(
                    "Missing Fields",
                    "Please ensure To, Subject, and Body are filled."
                );
            }
            return;
        }

        setIsSending(true);
        setError(null);

        try {
            // 1. Send the email via your server
            const requestUrl = `${SERVER_URL}/send-email`;
            console.log(`[AdminEmailScreen] Sending POST request to: ${requestUrl}`);
            console.log("[EMAIL_FLOW] 2. Calling server to send email...");
            const response = await fetch(`${SERVER_URL}/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to,
                    subject,
                    body,
                    caseId,
                    RefNo: caseData.matrixRefNo || caseData.RefNo || caseId, // Pass RefNo for logging
                    // Send an array of attachments for the server to process
                    attachments: [
                        { url: caseData.photosFolderLink, filename: `CaseReport_${caseData.matrixRefNo || caseData.RefNo || caseId}.pdf` },
                        { url: caseData.filledForm?.url, filename: `FilledForm_${caseData.matrixRefNo || caseData.RefNo || caseId}.pdf` }
                    ].filter(att => att.url) // Filter out any attachments that don't have a URL
                }),
            });

            if (!response.ok) {
                console.error("[EMAIL_FLOW] 2a. Server responded with an error.");
                const errText = await response.text();
                throw new Error(`Server responded with ${response.status}: ${errText}`);
            }

            console.log("[EMAIL_FLOW] 3. Server call successful.");

            // 2. Update the case status to "completed" in Firebase
            console.log(`[EMAIL_FLOW] 4. Updating case ${caseId} status to 'completed' in Firebase.`);
            await firebase.database().ref(`cases/${caseId}`).update({
                status: "completed",
                finalizedAt: Date.now(),
                finalizedBy: user.uid,
                filledForm: null, // Clean up the separate form file now that email is sent
            });

            console.log("[EMAIL_FLOW] 5. Firebase update successful.");

            // --- FIX: Reset loading state BEFORE showing alert and navigating ---
            console.log("[EMAIL_FLOW] 6. Setting isSending to false.");
            setIsSending(false);

            // 3. Navigate to MailsSentScreen
            navigation.replace("MailsSentScreen", { successMessage: "Email sent successfully!" });

        } catch (err) {
            console.error("[EMAIL] Failed to send email or update status:", err);
            console.log("[EMAIL_FLOW] ERROR. Caught in catch block:", err.message);
            setError(err.message);
            // --- FIX: Use a cross-platform alert ---
            const errorMessage = "An error occurred. Please try again. \n" + err.message;
            if (Platform.OS === 'web') {
                alert("Error: " + errorMessage);
            } else {
                Alert.alert("Error", errorMessage);
            }
        } finally {
            // This is still good practice, but we'll also set it earlier for responsiveness.
            console.log("[EMAIL_FLOW] FINALLY. In finally block. isSending is:", isSending);
            if (isSending) setIsSending(false);
        }
    };

    if (!caseData) {
        return (
            <LinearGradient colors={["#4e0360", "#1a1a1a"]} style={styles.container}>
                <Text style={styles.infoText}>Loading case data...</Text>
            </LinearGradient>
        );
    }

    return (
        <LinearGradient colors={["#4e0360", "#1a1a1a", "#4e0360"]} style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.title}>Send Approval Email</Text>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.label}>To:</Text>
                <TextInput
                    style={styles.input}
                    value={to}
                    onChangeText={setTo}
                    placeholder="Recipient Email"
                    keyboardType="email-address"
                    autoCapitalize="none"
                />

                <Text style={styles.label}>Subject:</Text>
                <TextInput
                    style={styles.input}
                    value={subject}
                    onChangeText={setSubject}
                    placeholder="Email Subject"
                />

                <Text style={styles.label}>Body:</Text>
                <TextInput
                    style={[styles.input, styles.bodyInput]}
                    value={body}
                    onChangeText={setBody}
                    placeholder="Email Body"
                    multiline
                />

                {error && <Text style={styles.errorText}>{error}</Text>}

                <GlowButton
                    title="Send and Complete Case"
                    onPress={handleSendEmail}
                    isLoading={isSending}
                    loadingText="Sending..."
                />
            </ScrollView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: Platform.OS === 'android' ? 40 : 50,
        paddingHorizontal: 15,
        paddingBottom: 10,
    },
    backButton: {
        padding: 5,
    },
    title: {
        color: "#fff",
        fontSize: 22,
        fontWeight: "bold",
        marginLeft: 15,
    },
    scrollContent: {
        padding: 20,
    },
    label: {
        color: "#ccc",
        fontSize: 16,
        marginBottom: 8,
    },
    input: {
        backgroundColor: "rgba(255,255,255,0.1)",
        color: "#fff",
        paddingHorizontal: 15,
        paddingVertical: 12,
        borderRadius: 8,
        fontSize: 16,
        marginBottom: 20,
    },
    bodyInput: {
        height: 300,
        textAlignVertical: 'top',
    },
    infoText: {
        flex: 1,
        textAlign: "center",
        textAlignVertical: "center",
        fontSize: 16,
        color: "#fff",
    },
    errorText: {
        color: '#ff6b6b',
        textAlign: 'center',
        marginBottom: 15,
    },
});