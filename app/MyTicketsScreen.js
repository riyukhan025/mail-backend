import { Ionicons } from "@expo/vector-icons";
import { Query } from "appwrite";
import { LinearGradient } from "expo-linear-gradient";
import { useContext, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { APPWRITE_CONFIG, databases } from "./appwrite";
import { AuthContext } from "./AuthContext";

export default function MyTicketsScreen({ navigation }) {
    const { user } = useContext(AuthContext);
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.uid) return;
        const fetchTickets = async () => {
            setLoading(true);
            try {
                const response = await databases.listDocuments(
                    APPWRITE_CONFIG.databaseId,
                    APPWRITE_CONFIG.ticketsCollectionId,
                    [
                        Query.equal("userId", user.uid),
                        Query.orderDesc("$createdAt")
                    ]
                );
                setTickets(response.documents);
            } catch (error) {
                console.error("Error fetching tickets:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchTickets();
    }, [user]);

    const getStatusStyle = (status) => {
        switch (status) {
            case 'open': return { color: '#ff9800', borderColor: '#ff9800' };
            case 'in-progress': return { color: '#2196f3', borderColor: '#2196f3' };
            case 'closed': return { color: '#4caf50', borderColor: '#4caf50' };
            default: return { color: '#9e9e9e', borderColor: '#9e9e9e' };
        }
    };

    const renderItem = ({ item }) => (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <Text style={styles.subject} numberOfLines={1}>{item.subject}</Text>
                <View style={[styles.statusBadge, { borderColor: getStatusStyle(item.status).borderColor }]}>
                    <Text style={[styles.statusText, { color: getStatusStyle(item.status).color }]}>
                        {item.status.toUpperCase()}
                    </Text>
                </View>
            </View>
            <Text style={styles.message} numberOfLines={2}>{item.message}</Text>
            <Text style={styles.date}>
                Raised on: {new Date(item.$createdAt).toLocaleDateString()}
            </Text>
        </View>
    );

    return (
        <LinearGradient colors={["#141E30", "#243B55"]} style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.title}>My Tickets</Text>
            </View>
            {loading ? (
                <ActivityIndicator color="#fff" size="large" style={{ marginTop: 50 }} />
            ) : (
                <FlatList
                    data={tickets}
                    keyExtractor={(item) => item.$id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={<Text style={styles.emptyText}>You have not raised any tickets.</Text>}
                />
            )}
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
    list: { padding: 20 },
    card: {
        backgroundColor: "rgba(255,255,255,0.1)",
        padding: 15,
        borderRadius: 10,
        marginBottom: 15,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    subject: { fontSize: 16, fontWeight: "bold", color: "#fff", flex: 1, marginRight: 10 },
    statusBadge: {
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    statusText: {
        fontSize: 10,
        fontWeight: 'bold',
    },
    message: { color: "#ccc", marginBottom: 10, lineHeight: 20 },
    date: { color: "#888", fontSize: 12, textAlign: 'right' },
    emptyText: { color: "#ccc", textAlign: "center", marginTop: 50, fontSize: 16 },
});