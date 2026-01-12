import { Ionicons } from "@expo/vector-icons";
import { Query } from "appwrite";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { APPWRITE_CONFIG, databases } from "./appwrite";

export default function AllTicketsScreen({ navigation }) {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [devCommentInput, setDevCommentInput] = useState('');
    const [modalVisible, setModalVisible] = useState(false);

    useEffect(() => {
        fetchTickets();
    }, []);

    const fetchTickets = async () => {
        setLoading(true);
        try {
            const response = await databases.listDocuments(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.ticketsCollectionId,
                [Query.orderDesc("$createdAt")]
            );
            setTickets(response.documents);
        } catch (error) {
            console.error("Error fetching tickets:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateTicket = async (ticketId, updates) => {
        try {
            await databases.updateDocument(
                APPWRITE_CONFIG.databaseId,
                APPWRITE_CONFIG.ticketsCollectionId,
                ticketId,
                updates
            );
            Alert.alert("Success", `Ticket updated successfully.`);
            setModalVisible(false);
            fetchTickets(); // Refresh list
        } catch (error) {
            Alert.alert("Error", "Failed to update ticket: " + error.message);
        }
    };

    const getStatusStyle = (status) => {
        switch (status) {
            case 'open': return { color: '#ff9800', borderColor: '#ff9800' };
            case 'in-progress': return { color: '#2196f3', borderColor: '#2196f3' };
            case 'closed': return { color: '#4caf50', borderColor: '#4caf50' };
            default: return { color: '#9e9e9e', borderColor: '#9e9e9e' };
        }
    };

    const renderItem = ({ item }) => (
        <TouchableOpacity style={styles.card} onPress={() => {
            setSelectedTicket(item);
            setDevCommentInput(item.devComments || '');
            setModalVisible(true);
        }}>
            <View style={styles.cardHeader}>
                <Text style={styles.subject} numberOfLines={1}>{item.subject}</Text>
                <View style={[styles.statusBadge, { borderColor: getStatusStyle(item.status).borderColor }]}>
                    <Text style={[styles.statusText, { color: getStatusStyle(item.status).color }]}>
                        {item.status.toUpperCase()}
                    </Text>
                </View>
            </View>
            <Text style={styles.message} numberOfLines={2}>{item.message}</Text>
            <View style={styles.cardFooter}>
                <Text style={styles.date}>By: {item.userName}</Text>
                <Text style={styles.date}>{new Date(item.$createdAt).toLocaleDateString()}</Text>
            </View>
        </TouchableOpacity>
    );

    return (
        <LinearGradient colors={["#0f0c29", "#302b63", "#24243e"]} style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.title}>All Tickets</Text>
            </View>
            {loading ? (
                <ActivityIndicator color="#fff" size="large" style={{ marginTop: 50 }} />
            ) : (
                <FlatList
                    data={tickets}
                    keyExtractor={(item) => item.$id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={<Text style={styles.emptyText}>No tickets found.</Text>}
                />
            )}

            <Modal
                visible={modalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle} numberOfLines={1}>{selectedTicket?.subject}</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#333" />
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView style={styles.modalScroll} contentContainerStyle={{paddingBottom: 20}}>
                            {/* Ticket Info */}
                            <View style={styles.ticketInfoContainer}>
                                <View style={styles.ticketMetaRow}>
                                    <View style={[styles.statusBadge, { borderColor: getStatusStyle(selectedTicket?.status).borderColor, backgroundColor: getStatusStyle(selectedTicket?.status).borderColor + '15' }]}>
                                        <Text style={[styles.statusText, { color: getStatusStyle(selectedTicket?.status).color }]}>{selectedTicket?.status?.toUpperCase()}</Text>
                                    </View>
                                    <Text style={styles.modalDate}>{selectedTicket ? new Date(selectedTicket.$createdAt).toLocaleString() : ''}</Text>
                                </View>
                                
                                <Text style={styles.sectionLabel}>Description</Text>
                                <Text style={styles.modalMessage}>{selectedTicket?.message}</Text>
                                
                                <View style={styles.userInfo}>
                                    <Ionicons name="person-circle-outline" size={20} color="#666" />
                                    <Text style={styles.modalUser}>{selectedTicket?.userName}</Text>
                                </View>
                            </View>

                            <View style={styles.divider} />

                            {/* Developer Section */}
                            <Text style={styles.sectionLabel}>Developer Response</Text>
                            
                            <View style={styles.devCommentsContainer}>
                                <Text style={styles.devCommentsText}>{selectedTicket?.devComments || 'No comments yet.'}</Text>
                            </View>

                            <Text style={styles.inputLabel}>Update / Reply</Text>
                            <TextInput
                                style={styles.commentInput}
                                value={devCommentInput}
                                onChangeText={setDevCommentInput}
                                placeholder="Type your response here..."
                                placeholderTextColor="#999"
                                multiline
                            />

                            <View style={styles.actionButtonsGrid}>
                                <TouchableOpacity style={[styles.actionBtn, styles.btnSave]} onPress={() => handleUpdateTicket(selectedTicket.$id, { devComments: devCommentInput })}>
                                    <Text style={styles.btnText}>Save Note</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.actionBtn, styles.btnProgress]} onPress={() => handleUpdateTicket(selectedTicket.$id, { status: 'in-progress', devComments: devCommentInput })}>
                                    <Text style={styles.btnText}>In Progress</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.actionBtn, styles.btnClose]} onPress={() => handleUpdateTicket(selectedTicket.$id, { status: 'closed', devComments: devCommentInput })}>
                                    <Text style={styles.btnText}>Close Ticket</Text>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
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
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    subject: { fontSize: 16, fontWeight: "bold", color: "#fff", flex: 1, marginRight: 10 },
    statusBadge: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
    statusText: { fontSize: 10, fontWeight: 'bold' },
    message: { color: "#ccc", marginBottom: 10, lineHeight: 20 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
    date: { color: "#888", fontSize: 12 },
    emptyText: { color: "#ccc", textAlign: "center", marginTop: 50, fontSize: 16 },
    
    modalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.75)" },
    modalContent: { width: '90%', maxHeight: '85%', backgroundColor: '#fff', borderRadius: 15, overflow: 'hidden' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee', backgroundColor: '#f9f9f9' },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', flex: 1, marginRight: 10 },
    modalScroll: { padding: 15 },
    
    ticketInfoContainer: { marginBottom: 15 },
    ticketMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    statusBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
    statusText: { fontSize: 11, fontWeight: 'bold' },
    modalDate: { fontSize: 12, color: '#888' },
    
    sectionLabel: { fontSize: 12, fontWeight: 'bold', color: '#888', textTransform: 'uppercase', marginBottom: 5, marginTop: 10 },
    modalMessage: { fontSize: 15, color: '#333', lineHeight: 22, marginBottom: 10 },
    userInfo: { flexDirection: 'row', alignItems: 'center' },
    modalUser: { fontSize: 13, color: '#666', marginLeft: 5 },
    
    divider: { height: 1, backgroundColor: '#eee', marginVertical: 15 },
    
    devCommentsContainer: { backgroundColor: '#f0f8ff', padding: 12, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#d0e1f9' },
    devCommentsText: { color: '#333', fontSize: 14, fontStyle: 'italic' },
    
    inputLabel: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 8 },
    commentInput: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        padding: 12,
        marginBottom: 15,
        minHeight: 100,
        textAlignVertical: 'top',
        fontSize: 14,
    },
    
    actionButtonsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    actionBtn: { flexGrow: 1, paddingVertical: 12, paddingHorizontal: 15, borderRadius: 8, alignItems: 'center', minWidth: '30%' },
    btnSave: { backgroundColor: '#6c757d' },
    btnProgress: { backgroundColor: '#2196f3' },
    btnClose: { backgroundColor: '#4caf50' },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
});