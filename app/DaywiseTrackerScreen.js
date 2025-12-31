import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useContext, useEffect, useState } from "react";
import { Dimensions, FlatList, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LineChart } from "react-native-chart-kit";
import firebase from "../firebase";
import { AuthContext } from "./AuthContext";

export default function DaywiseTrackerScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const [chartData, setChartData] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({ remaining: 0, today: 0, total: 0 });
  const [selectedDate, setSelectedDate] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!user) return;

    const casesRef = firebase.database().ref("cases");
    const query = casesRef.orderByChild("assignedTo").equalTo(user.uid);

    const listener = query.on("value", (snapshot) => {
      const data = snapshot.val();
      const allCases = data ? Object.keys(data).map((key) => ({ id: key, ...data[key] })) : [];
      
      // Filter completed cases
      const completedCases = allCases.filter(c => c.completedAt);
      
      // Group by date
      const grouped = {};
      completedCases.forEach(c => {
        const date = new Date(c.completedAt).toLocaleDateString();
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(c);
      });

      // Calculate stats
      const totalCompleted = completedCases.length;
      const totalRemaining = allCases.filter(c => !c.completedAt && c.status !== 'reverted' && c.status !== 'Reverted').length;
      const todayStr = new Date().toLocaleDateString();
      const todayCount = grouped[todayStr] ? grouped[todayStr].length : 0;
      setStats({ remaining: totalRemaining, today: todayCount, total: totalCompleted });

      // Default selected date to today so the view is populated
      setSelectedDate(curr => curr || todayStr);

      // Prepare chart data (last 7 days)
      const labels = [];
      const dataPoints = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateKey = d.toLocaleDateString();
        labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
        dataPoints.push(grouped[dateKey] ? grouped[dateKey].length : 0);
      }
      setChartData({ labels, datasets: [{ data: dataPoints }] });

      // Prepare history list (descending - newest first)
      const sortedDates = Object.keys(grouped).sort((a, b) => new Date(a) - new Date(b));
      const hist = sortedDates.reverse().map(date => ({
        date,
        count: grouped[date].length,
        cases: grouped[date]
      }));
      setHistory(hist);
    });

    return () => query.off("value", listener);
  }, [user]);

  return (
    <LinearGradient colors={["#12c2e9", "#c471ed", "#f64f59"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Day-wise Tracker</Text>
      </View>
      
      <ScrollView contentContainerStyle={styles.content}>
        {chartData && (
          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>Progress Overview</Text>
            <LineChart
              data={chartData}
              width={Dimensions.get("window").width - 40}
              height={220}
              yAxisInterval={1}
              chartConfig={{
                backgroundColor: "transparent",
                backgroundGradientFrom: "#ffffff",
                backgroundGradientFromOpacity: 0.2,
                backgroundGradientTo: "#ffffff",
                backgroundGradientToOpacity: 0.2,
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                style: { borderRadius: 16 },
                propsForDots: { r: "6", strokeWidth: "2", stroke: "#ffa726" }
              }}
              bezier
              style={{ marginVertical: 8, borderRadius: 16 }}
            />
          </View>
        )}

        <TouchableOpacity style={styles.calendarButton} onPress={() => setShowCalendar(true)}>
          <Ionicons name="calendar" size={24} color="#fff" />
          <Text style={styles.calendarButtonText}>Select Date</Text>
        </TouchableOpacity>

        {selectedDate && (
          <View style={styles.selectedDateContainer}>
            <Text style={styles.selectedDateText}>
              {selectedDate}: {history.find(h => h.date === selectedDate)?.count || 0} Cases Completed
            </Text>
            <TouchableOpacity style={styles.viewDayButton} onPress={() => setShowDetails(true)}>
              <Text style={styles.viewDayButtonText}>View Cases</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Total Remaining</Text>
            <Text style={styles.statValue}>{stats.remaining}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Completed Today</Text>
            <Text style={styles.statValue}>{stats.today}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Total Completed</Text>
            <Text style={styles.statValue}>{stats.total}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Calendar Modal */}
      <Modal visible={showCalendar} transparent animationType="fade" onRequestClose={() => setShowCalendar(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Date</Text>
            <FlatList
              data={history}
              keyExtractor={(item) => item.date}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.dateOption} onPress={() => { setSelectedDate(item.date); setShowCalendar(false); }}>
                  <Text style={styles.dateOptionText}>{item.date}</Text>
                  <Text style={styles.dateOptionCount}>{item.count} cases</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>No history available</Text>}
            />
            <TouchableOpacity style={styles.closeButton} onPress={() => setShowCalendar(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Details Modal */}
      <Modal visible={showDetails} transparent animationType="slide" onRequestClose={() => setShowDetails(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Cases for {selectedDate}</Text>
            <FlatList
              data={history.find(h => h.date === selectedDate)?.cases || []}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Text style={styles.caseItem}>• {item.matrixRefNo || item.RefNo || item.id}</Text>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>No cases completed on this date.</Text>}
            />
            <TouchableOpacity style={styles.closeButton} onPress={() => setShowDetails(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
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
  content: { padding: 20 },
  chartContainer: { alignItems: "center", marginBottom: 20 },
  chartTitle: { color: "#fff", fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  calendarButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.2)", padding: 12, borderRadius: 10, marginBottom: 15 },
  calendarButtonText: { color: "#fff", fontSize: 16, fontWeight: "bold", marginLeft: 10 },
  selectedDateContainer: { alignItems: "center", marginBottom: 20, backgroundColor: "rgba(0,0,0,0.2)", padding: 10, borderRadius: 8 },
  selectedDateText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  statsContainer: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  statBox: { alignItems: "center", flex: 1 },
  statLabel: { color: "#eee", fontSize: 12, marginBottom: 5, textAlign: "center" },
  statValue: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  viewDayButton: { marginTop: 10, backgroundColor: "#facc15", paddingVertical: 8, paddingHorizontal: 20, borderRadius: 8 },
  viewDayButtonText: { color: "#000", fontWeight: "bold", fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalContent: { backgroundColor: "#fff", borderRadius: 16, padding: 20, width: "100%", maxHeight: "80%" },
  modalTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 15, textAlign: "center", color: "#333" },
  dateOption: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
  dateOptionText: { fontSize: 16, color: "#333" },
  dateOptionCount: { fontSize: 16, fontWeight: "bold", color: "#666" },
  caseItem: { fontSize: 14, color: "#333", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  closeButton: { marginTop: 15, backgroundColor: "#f64f59", padding: 12, borderRadius: 10, alignItems: "center" },
  closeButtonText: { color: "#fff", fontWeight: "bold" },
  emptyText: { color: "#666", textAlign: "center", marginTop: 20, fontSize: 16 },
});