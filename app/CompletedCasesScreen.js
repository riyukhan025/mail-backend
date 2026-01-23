import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import * as FileSystem from "expo-file-system/legacy";
import { LinearGradient } from "expo-linear-gradient";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import { Alert, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as XLSX from "xlsx";
import firebase from "../firebase";

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

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>{item.matrixRefNo || item.id}</Text>
        <Text style={styles.date}>{item.completedAt ? new Date(item.completedAt).toLocaleDateString() : "-"}</Text>
      </View>
      <Text style={styles.clientText}>{item.client || item.company || "Unknown Client"}</Text>
      <View style={styles.row}>
        <Text style={styles.subText} numberOfLines={1}>{item.candidateName || "N/A"}</Text>
        <Text style={[styles.status, { color: item.status === 'completed' ? '#4caf50' : '#aaa' }]}>{item.status.toUpperCase()}</Text>
      </View>
      <Text style={styles.feText}>Completed by: {item.assigneeName || "Unknown"}</Text>
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: "#28a745", marginRight: 5 }]}
          onPress={() => navigation.navigate("CaseDetail", { caseId: item.id })}
        >
          <Text style={styles.buttonText}>View</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: "#FF9800", marginLeft: 5 }]}
          onPress={() => navigation.navigate("AuditCaseScreen", { caseId: item.id, caseData: item })}
        >
          <Text style={styles.buttonText}>Rectify</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <LinearGradient colors={["#4e0360", "#1a1a1a"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Completed Cases</Text>
        <TouchableOpacity onPress={() => setShowFilters(!showFilters)} style={styles.filterBtn}>
            <Ionicons name={showFilters ? "close" : "search"} size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>Total: {filteredCases.length}</Text>
        <TouchableOpacity style={styles.exportButton} onPress={handleExport}>
            <Ionicons name="download-outline" size={18} color="#fff" style={{ marginRight: 5 }} />
            <Text style={styles.exportButtonText}>Export Excel</Text>
        </TouchableOpacity>
      </View>

      {showFilters && (
          <View style={styles.filterContainer}>
              <TextInput 
                  style={styles.searchInput} 
                  placeholder="Search Ref No or Candidate..." 
                  placeholderTextColor="#ccc"
                  value={search}
                  onChangeText={setSearch}
              />
              
              <View style={styles.pickerContainer}>
                  <Picker
                      selectedValue={feFilter}
                      onValueChange={(itemValue) => setFeFilter(itemValue)}
                      style={styles.picker}
                      dropdownIconColor="#fff"
                  >
                      <Picker.Item label="Filter by FE (All)" value="" color="#000" />
                      {users.map(u => <Picker.Item key={u.id} label={u.name || u.email} value={u.id} color="#000" />)}
                  </Picker>
              </View>

              <View style={styles.dateRow}>
                  <TextInput 
                      style={[styles.searchInput, { flex: 1, marginRight: 5 }]} 
                      placeholder="From Date (YYYY-MM-DD)" 
                      placeholderTextColor="#ccc"
                      value={startDate}
                      onChangeText={setStartDate}
                  />
                  <TextInput 
                      style={[styles.searchInput, { flex: 1, marginLeft: 5 }]} 
                      placeholder="To Date (YYYY-MM-DD)" 
                      placeholderTextColor="#ccc"
                      value={endDate}
                      onChangeText={setEndDate}
                  />
              </View>
              <TouchableOpacity onPress={clearFilters} style={{alignSelf: 'flex-end', padding: 5}}><Text style={{color: '#ff9800'}}>Clear Filters</Text></TouchableOpacity>
          </View>
      )}

      <FlatList
        data={filteredCases}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        initialNumToRender={50}
        maxToRenderPerBatch={50}
        windowSize={21}
        ListEmptyComponent={<Text style={styles.emptyText}>No completed cases found.</Text>}
        ListFooterComponent={
            <Text style={styles.footerText}>
                Showing {filteredCases.length} active completed cases. {archivedCount > 0 ? `(${archivedCount} archived)` : ""}
            </Text>
        }
      />
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
    justifyContent: 'space-between'
  },
  backButton: { marginRight: 15 },
  headerTitle: { fontSize: 20, fontWeight: "bold", color: "#fff" },
  list: { padding: 20 },
  card: {
    backgroundColor: "rgba(255,255,255,0.1)",
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { fontSize: 14, fontWeight: "bold", color: "#fff" },
  date: { fontSize: 11, color: "#ccc" },
  subText: { fontSize: 12, color: "#ddd", flex: 1, marginRight: 10 },
  status: { fontSize: 10, fontWeight: "bold" },
  actionRow: { flexDirection: "row", marginTop: 6 },
  button: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    alignItems: "center",
    flex: 1,
  },
  buttonText: { color: "#fff", fontWeight: "bold", fontSize: 12 },
  emptyText: { color: "#ccc", textAlign: "center", marginTop: 50 },
  filterBtn: { padding: 5 },
  filterContainer: { padding: 15, backgroundColor: "rgba(0,0,0,0.2)" },
  searchInput: {
      backgroundColor: "rgba(255,255,255,0.1)",
      color: "#fff",
      padding: 10,
      borderRadius: 8,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.1)"
  },
  pickerContainer: {
      backgroundColor: "rgba(255,255,255,0.1)",
      borderRadius: 8,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.1)",
      overflow: 'hidden'
  },
  picker: { color: "#fff", height: 50 },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { color: "#888", textAlign: "center", marginTop: 20, fontSize: 12, fontStyle: 'italic' },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.2)',
    marginBottom: 10
  },
  summaryText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  exportButton: {
    flexDirection: 'row',
    backgroundColor: '#2e7d32',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    alignItems: 'center'
  },
  exportButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  clientText: { fontSize: 12, color: "#ffd700", fontWeight: "bold", marginBottom: 2 },
  feText: { fontSize: 12, color: "#aaa", fontStyle: "italic", marginTop: 2 },
});