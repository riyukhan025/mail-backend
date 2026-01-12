import { Ionicons } from "@expo/vector-icons";
import { ID } from "appwrite";
import { LinearGradient } from "expo-linear-gradient";
import { useContext, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { APPWRITE_CONFIG, databases } from "./appwrite";
import { AuthContext } from "./AuthContext";

export default function RaiseTicketScreen({ navigation }) {
    const { user } = useContext(AuthContext);
    const [subject, setSubject] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!subject.trim() || !message.trim()) {
            Alert.alert("Error", "Please fill in both subject and message.");
            return;
        }
        setLoading(true);
        try {
            await databases.createDocument(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.ticketsCollectionId,
                ID.unique(),
                {
                    subject,
                    message,
                    status: "open",
                    userId: user.uid,
                    userName: user.name || user.email,
                    devComments: "", // Initialize the required devComments field
                }
            );
            Alert.alert("Success", "Your ticket has been submitted. A developer will look into it shortly.", [
                { text: "OK", onPress: () => navigation.goBack() }
            ]);
        } catch (error) {
            console.error("Error raising ticket:", error);
            Alert.alert("Error", "Failed to submit ticket: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <LinearGradient colors={["#141E30", "#243B55"]} style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.title}>Raise a Ticket</Text>
            </View>
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.form}
            >
                <Text style={styles.label}>Subject</Text>
                <TextInput
                    style={styles.input}
                    value={subject}
                    onChangeText={setSubject}
                    placeholder="e.g., App is crashing on dashboard"
                    placeholderTextColor="#888"
                />

                <Text style={styles.label}>Message</Text>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    value={message}
                    onChangeText={setMessage}
                    placeholder="Please describe the issue in detail..."
                    placeholderTextColor="#888"
                    multiline
                />

                <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Submit Ticket</Text>}
                </TouchableOpacity>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingTop: 50,
        paddingHorizontal: 20,
        paddingBottom: 20,
        backgroundColor: "rgba(0,0,0,0.3)",
    },
    backButton: { marginRight: 15 },
    title: { fontSize: 20, fontWeight: "bold", color: "#fff" },
    form: { padding: 20, flex: 1 },
    label: { color: "#ccc", marginBottom: 8, fontSize: 16 },
    input: {
        backgroundColor: "rgba(255,255,255,0.1)",
        color: "#fff",
        padding: 15,
        borderRadius: 10,
        marginBottom: 20,
        fontSize: 16,
    },
    textArea: { height: 150, textAlignVertical: "top" },
    button: {
        backgroundColor: "#007AFF",
        padding: 15,
        borderRadius: 10,
        alignItems: "center",
        marginTop: 10,
    },
    buttonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});