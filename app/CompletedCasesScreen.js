import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import { BlurView } from "expo-blur";
import * as FileSystem from "expo-file-system/legacy";
import { LinearGradient } from "expo-linear-gradient";
import * as Sharing from "expo-sharing";
import { createElement, useEffect, useState } from "react";
import { Alert, Dimensions, FlatList, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as XLSX from "xlsx";
import firebase from "../firebase";

const { width } = Dimensions.get("window");

export default function CompletedCasesScreen({ navigation }) {
  const [cases, setCases] = useState([]);
  const [filteredCases, setFilteredCases] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [feFilter, setFeFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState(null); // 'start' or 'end'

  useEffect(() => {
    const casesRef = firebase.database().ref("cases");
    const listener = casesRef.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data)
        .map((key) => ({ id: key, ...data[key] }))
        .filter((c) => c.status === "completed" || c.status === "closed");
      setCases(list);
    });
    return () => casesRef.off("value", listener);
  }, []);

  useEffect(() => {
    const usersRef = firebase.database().ref("users");
    usersRef.once("value").then(snapshot => {
        const data = snapshot.val() || {};
        const userList = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setUsers(userList);
    });

    const statsRef = firebase.database().ref("metadata/statistics/archivedCount");
    statsRef.on("value", s => setArchivedCount(s.val() || 0));
  }, []);

  useEffect(() => {
    let result = cases;

    if (search) {
        const lowerSearch = search.toLowerCase();
        result = result.filter(c => 
            (c.matrixRefNo || "").toLowerCase().includes(lowerSearch) ||
            (c.candidateName || "").toLowerCase().includes(lowerSearch)
        );
    }

    if (feFilter) {
        result = result.filter(c => c.assignedTo === feFilter);
    }

    if (startDate || endDate) {
        result = result.filter(c => {
            if (!c.completedAt) return false;
            const completedDate = new Date(c.completedAt);
            completedDate.setHours(0,0,0,0);
            
            if (startDate) {
                const start = new Date(startDate);
                if (!isNaN(start.getTime()) && completedDate < start) return false;
            }
            if (endDate) {
                const end = new Date(endDate);
                if (!isNaN(end.getTime()) && completedDate > end) return false;
            }
            return true;
        });
    }

    setFilteredCases(result);
  }, [cases, search, feFilter, startDate, endDate]);

  const clearFilters = () => {
      setSearch("");
      setFeFilter("");
      setStartDate("");
      setEndDate("");
  };

  const handleExport = async () => {
    if (filteredCases.length === 0) {
      Alert.alert("No Data", "No cases to export.");
      return;
    }

    try {
      const dataToExport = filteredCases.map(c => ({
        "Client": c.client || "",
        "Reference ID": c.matrixRefNo || c.id || "",
        "Check type": c.checkType || "",
        "company": c.company || "",
        "Candidate Name": c.candidateName || "",
        "Address": c.address || "",
        "ChkType": c.chkType || "",
        "Date Initiated": c.dateInitiated ? new Date(c.dateInitiated).toLocaleDateString() : "",
        "Contact Number": c.contactNumber || "",
        "Status": c.status || "",
        "Location": c.city || "",
        "Pincode": c.pincode || "",
        "fe name": c.assigneeName || "",
        "Completed date": c.completedAt ? new Date(c.completedAt).toLocaleDateString() : "",
        "coments": c.comments || ""
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "CompletedCases");
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      
      if (Platform.OS === "web") {
        const uri = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${wbout}`;
        const link = document.createElement("a");
        link.href = uri;
        link.download = `Completed_Cases_${Date.now()}.xlsx`;
        link.click();
      } else {
        const uri = FileSystem.cacheDirectory + `Completed_Cases_${Date.now()}.xlsx`;
        await FileSystem.writeAsStringAsync(uri, wbout, { encoding: FileSystem.EncodingType.Base64 });
        await Sharing.shareAsync(uri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Export Completed Cases',
          UTI: 'com.microsoft.excel.xlsx'
        });
      }
    } catch (error) {
      console.error("Export Error:", error);
      Alert.alert("Error", "Failed to export Excel file.");
    }
  };

  const handleDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
        setShowPicker(false);
    }
    
    if (selectedDate) {
        const dateStr = selectedDate.toISOString().split('T')[0];
        if (pickerMode === 'start') setStartDate(dateStr);
        if (pickerMode === 'end') setEndDate(dateStr);
    }
  };

  const showDatePicker = (mode) => {
      setPickerMode(mode);
      setShowPicker(true);
  };

  const renderItem = ({ item }) => (
    <View style={styles.cardContainer}>
      <BlurView intensity={20} tint="dark" style={styles.card}>
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={styles.refNo}>{item.matrixRefNo || item.id}</Text>
            <View style={[styles.statusBadge, { borderColor: item.status === 'completed' ? '#00e676' : '#ff9800' }]}>
              <Text style={[styles.statusText, { color: item.status === 'completed' ? '#00e676' : '#ff9800' }]}>
                {item.status.toUpperCase()}
              </Text>
            </View>
          </View>
          
          <View style={styles.infoRow}>
            <Ionicons name="person" size={12} color="#aaa" style={styles.icon} />
            <Text style={styles.infoText} numberOfLines={1}>{item.candidateName || "N/A"}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Ionicons name="business" size={12} color="#aaa" style={styles.icon} />
            <Text style={styles.infoText} numberOfLines={1}>{item.client || item.company || "Unknown"}</Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>FE: {item.assigneeName?.split(' ')[0] || "Unknown"}</Text>
            <Text style={styles.metaText}>•</Text>
            <Text style={styles.metaText}>{item.completedAt ? new Date(item.completedAt).toLocaleDateString() : "-"}</Text>
          </View>
        </View>

        <View style={styles.actionColumn}>
          <TouchableOpacity 
            style={styles.actionBtn} 
            onPress={() => navigation.navigate("CaseDetail", { caseId: item.id })}
          >
            <LinearGradient colors={['#2193b0', '#6dd5ed']} style={styles.gradientBtn}>
              <Ionicons name="eye" size={16} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionBtn} 
            onPress={() => navigation.navigate("AuditCaseScreen", { caseId: item.id, caseData: item })}
          >
            <LinearGradient colors={['#f12711', '#f5af19']} style={styles.gradientBtn}>
              <Ionicons name="create" size={16} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </BlurView>
    </View>
  );

  return (
    <LinearGradient colors={["#0f0c29", "#302b63", "#24243e"]} style={styles.container}>
      {/* Header */}
      <BlurView intensity={50} tint="dark" style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Completed Cases</Text>
        <TouchableOpacity onPress={() => setShowFilters(true)} style={styles.filterBtn}>
            <Ionicons name="options" size={24} color="#fff" />
        </TouchableOpacity>
      </BlurView>

      {/* Summary & Search Bar */}
      <View style={styles.toolbar}>
        <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#aaa" />
            <TextInput 
                style={styles.searchInput} 
                placeholder="Search Ref / Name..." 
                placeholderTextColor="#aaa"
                value={search}
                onChangeText={setSearch}
            />
            {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")}>
                    <Ionicons name="close-circle" size={16} color="#aaa" />
                </TouchableOpacity>
            )}
        </View>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
            <LinearGradient colors={['#11998e', '#38ef7d']} style={styles.exportGradient}>
                <Ionicons name="download" size={18} color="#fff" />
            </LinearGradient>
        </TouchableOpacity>
      </View>

      <View style={styles.statsBar}>
          <Text style={styles.statsText}>Total: <Text style={{color: '#fff', fontWeight: 'bold'}}>{filteredCases.length}</Text></Text>
          {archivedCount > 0 && <Text style={styles.statsText}>Archived: <Text style={{color: '#aaa'}}>{archivedCount}</Text></Text>}
      </View>

      <FlatList
        data={filteredCases}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={10}
        ListEmptyComponent={
            <View style={styles.emptyContainer}>
                <Ionicons name="file-tray-outline" size={64} color="#555" />
                <Text style={styles.emptyText}>No completed cases found.</Text>
            </View>
        }
      />

      {/* Filter Modal */}
      <Modal
        visible={showFilters}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowFilters(false)}
      >
        <View style={styles.modalOverlay}>
            <BlurView intensity={90} tint="dark" style={styles.modalContent}>
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Advanced Filters</Text>
                    <TouchableOpacity onPress={() => setShowFilters(false)}>
                        <Ionicons name="close" size={24} color="#fff" />
                    </TouchableOpacity>
                </View>

                <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Field Executive</Text>
                    <View style={styles.pickerWrapper}>
                        <Picker
                            selectedValue={feFilter}
                            onValueChange={(itemValue) => setFeFilter(itemValue)}
                            style={styles.picker}
                            dropdownIconColor="#fff"
                            itemStyle={{color: '#fff'}}
                        >
                            <Picker.Item label="All Executives" value="" color="#000" />
                            {users.map(u => <Picker.Item key={u.id} label={u.name || u.email} value={u.id} color="#000" />)}
                        </Picker>
                    </View>
                </View>

                <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Date Range (YYYY-MM-DD)</Text>
                    {Platform.OS === 'web' ? (
                        <View style={styles.dateRow}>
                            {createElement('input', {
                                type: 'date',
                                value: startDate || '',
                                onChange: (e) => setStartDate(e.target.value),
                                style: {
                                    flex: 1,
                                    backgroundColor: 'rgba(255,255,255,0.1)',
                                    borderRadius: 12,
                                    padding: 12,
                                    borderWidth: 1,
                                    borderColor: 'rgba(255,255,255,0.1)',
                                    color: '#fff',
                                    fontFamily: 'inherit',
                                    fontSize: 14,
                                    outline: 'none'
                                }
                            })}
                            <Text style={{color: '#fff', marginHorizontal: 10}}>-</Text>
                            {createElement('input', {
                                type: 'date',
                                value: endDate || '',
                                onChange: (e) => setEndDate(e.target.value),
                                style: {
                                    flex: 1,
                                    backgroundColor: 'rgba(255,255,255,0.1)',
                                    borderRadius: 12,
                                    padding: 12,
                                    borderWidth: 1,
                                    borderColor: 'rgba(255,255,255,0.1)',
                                    color: '#fff',
                                    fontFamily: 'inherit',
                                    fontSize: 14,
                                    outline: 'none'
                                }
                            })}
                        </View>
                    ) : (
                        <>
                        <View style={styles.dateRow}>
                            <TouchableOpacity onPress={() => showDatePicker('start')} style={styles.dateInput}>
                                <Text style={{color: startDate ? '#fff' : '#666'}}>{startDate || "Start Date"}</Text>
                            </TouchableOpacity>
                            <Text style={{color: '#fff', marginHorizontal: 10}}>-</Text>
                            <TouchableOpacity onPress={() => showDatePicker('end')} style={styles.dateInput}>
                                <Text style={{color: endDate ? '#fff' : '#666'}}>{endDate || "End Date"}</Text>
                            </TouchableOpacity>
                        </View>
                        {showPicker && (
                            <View>
                                {Platform.OS === 'ios' && (
                                    <View style={{flexDirection: 'row', justifyContent: 'flex-end'}}>
                                        <TouchableOpacity onPress={() => setShowPicker(false)} style={{padding: 10}}>
                                            <Text style={{color: '#fff', fontWeight: 'bold'}}>Done</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                                <DateTimePicker
                                    value={pickerMode === 'start' ? (startDate ? new Date(startDate) : new Date()) : (endDate ? new Date(endDate) : new Date())}
                                    mode="date"
                                    display="default"
                                    onChange={handleDateChange}
                                />
                            </View>
                        )}
                        </>
                    )}
                </View>

                <View style={styles.modalActions}>
                    <TouchableOpacity style={styles.clearBtn} onPress={clearFilters}>
                        <Text style={styles.clearBtnText}>Clear All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.applyBtn} onPress={() => setShowFilters(false)}>
                        <LinearGradient colors={['#4facfe', '#00f2fe']} style={styles.applyGradient}>
                            <Text style={styles.applyBtnText}>Apply Filters</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </BlurView>
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
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  backButton: { padding: 5 },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: "#fff", letterSpacing: 0.5 },
  filterBtn: { padding: 5 },
  
  toolbar: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: 'center',
      gap: 10
  },
  searchBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 44,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.05)'
  },
  searchInput: {
      flex: 1,
      color: '#fff',
      marginLeft: 8,
      fontSize: 14
  },
  exportBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      overflow: 'hidden',
      elevation: 5,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.3,
      shadowRadius: 3
  },
  exportGradient: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center'
  },

  statsBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 10
  },
  statsText: {
      color: '#aaa',
      fontSize: 12,
      fontWeight: '500'
  },

  list: { paddingHorizontal: 16, paddingBottom: 40 },
  
  cardContainer: {
      marginBottom: 12,
      borderRadius: 16,
      overflow: 'hidden',
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: {width: 0, height: 4},
      shadowOpacity: 0.2,
      shadowRadius: 5,
      backgroundColor: 'rgba(0,0,0,0.2)' // Fallback
  },
  card: {
      flexDirection: 'row',
      padding: 16,
  },
  cardContent: {
      flex: 1,
      paddingRight: 10
  },
  cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8
  },
  refNo: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 15
  },
  statusBadge: {
      borderWidth: 1,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      backgroundColor: 'rgba(0,0,0,0.2)'
  },
  statusText: {
      fontSize: 10,
      fontWeight: 'bold'
  },
  infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4
  },
  icon: { marginRight: 6, width: 14 },
  infoText: {
      color: '#ddd',
      fontSize: 13
  },
  metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 6,
      gap: 6
  },
  metaText: {
      color: '#888',
      fontSize: 11
  },

  actionColumn: {
      justifyContent: 'center',
      gap: 10,
      paddingLeft: 10,
      borderLeftWidth: 1,
      borderLeftColor: 'rgba(255,255,255,0.1)'
  },
  actionBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      overflow: 'hidden'
  },
  gradientBtn: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center'
  },

  emptyContainer: {
      alignItems: 'center',
      marginTop: 60
  },
  emptyText: {
      color: '#666',
      marginTop: 10,
      fontSize: 16
  },

  // Modal Styles
  modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.6)'
  },
  modalContent: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 40,
      overflow: 'hidden'
  },
  modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24
  },
  modalTitle: {
      color: '#fff',
      fontSize: 20,
      fontWeight: 'bold'
  },
  filterSection: {
      marginBottom: 20
  },
  filterLabel: {
      color: '#aaa',
      fontSize: 14,
      marginBottom: 8,
      fontWeight: '600'
  },
  pickerWrapper: {
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
      overflow: 'hidden'
  },
  picker: {
      color: '#fff',
      height: 50
  },
  dateRow: {
      flexDirection: 'row',
      alignItems: 'center'
  },
  dateInput: {
      flex: 1,
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
      justifyContent: 'center',
      color: '#fff' // For web TextInput
  },
  modalActions: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 10
  },
  clearBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center'
  },
  clearBtnText: {
    color: '#fff',
    fontWeight: '600'
  },
  applyBtn: {
    flex: 2,
    borderRadius: 12,
    overflow: 'hidden'
  },
  applyGradient: {
    padding: 14,
    alignItems: 'center'
  },
  applyBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16
  }
});