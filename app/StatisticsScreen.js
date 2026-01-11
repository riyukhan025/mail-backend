import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import {
    BarChart,
    ContributionGraph,
    LineChart,
    PieChart
} from "react-native-chart-kit";
import firebase from "../firebase";

// --- CONSTANTS & CONFIG ---
const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_HEIGHT = 220;

// Simulated Pricing for "Sales Report"
const PRICING = {
  address_verification: 450,
  site_visit: 800,
  employment_check: 1200,
  criminal_check: 1500,
  default: 650
};

const TABS = ["Overview", "Sales", "Regional", "Team"];
const RANGES = ["7D", "1M", "3M", "YTD", "ALL"];

export default function StatisticsScreen({ navigation }) {
  // --- STATE ---
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("Overview");
  const [activeRange, setActiveRange] = useState("1M");
  
  // Data
  const [rawCases, setRawCases] = useState([]);
  const [users, setUsers] = useState([]);
  const [processedData, setProcessedData] = useState(null);
  
  // Admin Request State
  const [accessGranted, setAccessGranted] = useState(false);
  const [requestPending, setRequestPending] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const prevAccessGranted = useRef(false);
  const [showDownloadAlert, setShowDownloadAlert] = useState(false);

  // --- EFFECTS ---

  useEffect(() => {
    checkAccessStatus();
    const interval = setInterval(checkAccessStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (rawCases.length > 0) {
      processData(rawCases, activeRange);
    }
  }, [rawCases, activeRange, users]);

  // --- DATA FETCHING ---

  const checkAccessStatus = async () => {
    try {
      const approved = await AsyncStorage.getItem("stats_approved");
      const pending = await AsyncStorage.getItem("stats_request_pending");
      
      const isApproved = approved === "true";
      setAccessGranted(isApproved);

      if (isApproved && !prevAccessGranted.current) {
        setShowDownloadAlert(true);
      }
      prevAccessGranted.current = isApproved;
      setRequestPending(pending === "true");
      
      if (isApproved && rawCases.length === 0) fetchData();
    } catch (e) {
      console.log("Error checking access status", e);
    }
  };

  const fetchData = async () => {
    try {
      // 1. Fetch Users
      const usersSnap = await firebase.database().ref("users").once("value");
      const usersMap = usersSnap.val() || {};
      const usersList = Object.keys(usersMap).map(key => ({ id: key, ...usersMap[key] }));
      setUsers(usersList);

      // 2. Fetch Cases
      const casesSnap = await firebase.database().ref("cases").once("value");
      const casesMap = casesSnap.val() || {};
      const casesList = Object.keys(casesMap).map(key => ({ 
        id: key, 
        ...casesMap[key],
        // Normalize date for calculations
        timestamp: casesMap[key].assignedAt ? new Date(casesMap[key].assignedAt).getTime() : Date.now()
      }));
      
      setRawCases(casesList);
    } catch (e) {
      console.error("Fetch Error:", e);
      Alert.alert("Error", "Failed to load data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // --- DATA PROCESSING ENGINE ---

  const processData = (cases, range) => {
    const now = new Date();
    let startDate = new Date();

    // Filter by Range
    switch (range) {
      case "7D": startDate.setDate(now.getDate() - 7); break;
      case "1M": startDate.setMonth(now.getMonth() - 1); break;
      case "3M": startDate.setMonth(now.getMonth() - 3); break;
      case "YTD": startDate = new Date(now.getFullYear(), 0, 1); break;
      case "ALL": startDate = new Date(2000, 0, 1); break;
    }

    const filtered = cases.filter(c => c.timestamp >= startDate.getTime());

    // 1. Summary Stats
    const summary = {
      total: filtered.length,
      completed: 0,
      pending: 0,
      revenue: 0,
      potentialRevenue: 0,
      avgTat: 0
    };

    // 2. Aggregations
    const cityCounts = {};
    const statusCounts = { completed: 0, pending: 0, reverted: 0, audit: 0 };
    const memberPerformance = {};
    const dailyVolume = {};
    const dailyRevenue = {};
    const clientVolume = {};

    let totalTatMs = 0;
    let tatCount = 0;

    filtered.forEach(c => {
      // Status
      if (c.status === 'completed' || c.status === 'closed') {
        statusCounts.completed++;
        summary.completed++;
      } else if (c.status === 'reverted') {
        statusCounts.reverted++;
        summary.pending++;
      } else if (c.status === 'audit') {
        statusCounts.audit++;
        summary.pending++;
      } else {
        statusCounts.pending++;
        summary.pending++;
      }

      // Revenue (Simulated)
      const price = PRICING[c.checkType?.toLowerCase()] || PRICING.default;
      if (c.status === 'completed' || c.status === 'closed') {
        summary.revenue += price;
      } else {
        summary.potentialRevenue += price;
      }

      // City
      const city = c.city || "Unknown";
      cityCounts[city] = (cityCounts[city] || 0) + 1;

      // Client
      const client = c.client || c.company || "Unknown";
      clientVolume[client] = (clientVolume[client] || 0) + 1;

      // Member
      if (c.assignedTo) {
        memberPerformance[c.assignedTo] = (memberPerformance[c.assignedTo] || 0) + 1;
      }

      // Daily Trend
      const d = new Date(c.timestamp);
      const dateKey = `${d.getMonth() + 1}/${d.getDate()}`;
      dailyVolume[dateKey] = (dailyVolume[dateKey] || 0) + 1;
      
      if (c.status === 'completed' || c.status === 'closed') {
         dailyRevenue[dateKey] = (dailyRevenue[dateKey] || 0) + price;
      }

      // TAT
      if (c.completedAt && c.assignedAt) {
        const diff = new Date(c.completedAt) - new Date(c.assignedAt);
        if (diff > 0) {
          totalTatMs += diff;
          tatCount++;
        }
      }
    });

    summary.avgTat = tatCount > 0 ? (totalTatMs / tatCount / (1000 * 60 * 60 * 24)).toFixed(1) : "0";

    // 3. Format for Charts
    
    // Line Chart Data (Volume)
    const sortedDates = Object.keys(dailyVolume).sort((a,b) => new Date(a) - new Date(b));
    // Limit labels to prevent overcrowding
    const lineLabels = sortedDates.length > 6 ? sortedDates.filter((_, i) => i % Math.ceil(sortedDates.length / 6) === 0) : sortedDates;
    const lineData = sortedDates.map(d => dailyVolume[d]);
    
    // Revenue Line Data
    const revenueData = sortedDates.map(d => dailyRevenue[d] || 0);

    // Pie Data
    const pieData = [
      { name: "Done", count: statusCounts.completed, color: "#00C851", legendFontColor: "#ccc", legendFontSize: 10 },
      { name: "Pending", count: statusCounts.pending, color: "#ffbb33", legendFontColor: "#ccc", legendFontSize: 10 },
      { name: "Audit", count: statusCounts.audit, color: "#33b5e5", legendFontColor: "#ccc", legendFontSize: 10 },
      { name: "Reverted", count: statusCounts.reverted, color: "#ff4444", legendFontColor: "#ccc", legendFontSize: 10 },
    ];

    // Bar Data (Top 5 Cities)
    const sortedCities = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const barLabels = sortedCities.map(x => x[0].substring(0, 6));
    const barData = sortedCities.map(x => x[1]);

    // Team Data
    const teamList = Object.entries(memberPerformance)
      .map(([uid, count]) => {
        const u = users.find(user => user.id === uid);
        return {
          name: u ? (u.name || u.email) : "Unknown",
          count,
          uid
        };
      })
      .sort((a, b) => b.count - a.count);

    // Contribution Graph Data (Heatmap)
    const contributionData = Object.entries(dailyVolume).map(([dateStr, count]) => {
        // Convert M/D to YYYY-MM-DD for chart kit
        const currentYear = new Date().getFullYear();
        const [m, d] = dateStr.split('/');
        return { date: `${currentYear}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`, count };
    });

    setProcessedData({
      summary,
      lineLabels: lineLabels.length > 0 ? lineLabels : ["No Data"],
      lineData: lineData.length > 0 ? lineData : [0],
      revenueData: revenueData.length > 0 ? revenueData : [0],
      pieData,
      barLabels,
      barData,
      teamList,
      contributionData,
      clientVolume
    });
  };

  // --- ACTIONS ---

  const handleSendReport = async () => {
    if (!processedData) return;
    setSendingReport(true);

    const reportText = `
📊 *SPACE SOLUTIONS - ANALYTICS REPORT*
📅 Range: ${activeRange}
-------------------------------------
🔹 *SUMMARY*
Total Cases: ${processedData.summary.total}
Completed: ${processedData.summary.completed}
Pending: ${processedData.summary.pending}
Avg TAT: ${processedData.summary.avgTat} Days

💰 *FINANCIALS*
Est. Revenue: ₹${processedData.summary.revenue.toLocaleString()}
Pipeline: ₹${processedData.summary.potentialRevenue.toLocaleString()}

🏆 *TOP PERFORMER*
${processedData.teamList[0]?.name || "N/A"} (${processedData.teamList[0]?.count || 0} cases)

📍 *TOP REGION*
${processedData.barLabels[0] || "N/A"} (${processedData.barData[0] || 0} cases)
-------------------------------------
Generated via Admin App
    `;

    try {
      // 1. Share
      await Share.share({
        message: reportText,
        title: "Analytics Report"
      });

      Alert.alert("Success", "Report generated and ready to send.");
    } catch (e) {
      Alert.alert("Error", "Failed to share report.");
    } finally {
      setSendingReport(false);
    }
  };

  const handleRequestAccess = async () => {
    try {
      await AsyncStorage.setItem("stats_request_pending", "true");
      setRequestPending(true);
      Alert.alert("Request Sent", "Waiting for developer approval.");
    } catch (e) {
      Alert.alert("Error", "Failed to send request.");
    }
  };

  // --- RENDER HELPERS ---

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Analytics Dashboard</Text>
      <TouchableOpacity onPress={fetchData} style={styles.refreshBtn}>
        <Ionicons name="refresh" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  const renderTabs = () => (
    <View style={styles.tabContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderRangeFilter = () => (
    <View style={styles.rangeContainer}>
      {RANGES.map(r => (
        <TouchableOpacity
          key={r}
          style={[styles.rangeBtn, activeRange === r && styles.activeRangeBtn]}
          onPress={() => setActiveRange(r)}
        >
          <Text style={[styles.rangeText, activeRange === r && styles.activeRangeText]}>{r}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // --- TAB CONTENT RENDERERS ---

  const renderOverview = () => (
    <View>
      {/* Summary Cards */}
      <View style={styles.grid}>
        <StatCard label="Total Cases" value={processedData.summary.total} icon="layers" color="#4e0360" />
        <StatCard label="Completed" value={processedData.summary.completed} icon="checkmark-circle" color="#00C851" />
        <StatCard label="Pending" value={processedData.summary.pending} icon="time" color="#ffbb33" />
        <StatCard label="Avg TAT (Days)" value={processedData.summary.avgTat} icon="speedometer" color="#33b5e5" />
      </View>

      {/* Volume Chart */}
      <View style={styles.chartCard}>
        <Text style={styles.chartHeader}>Case Volume Trend</Text>
        <LineChart
          data={{
            labels: processedData.lineLabels,
            datasets: [{ data: processedData.lineData }]
          }}
          width={SCREEN_WIDTH - 60}
          height={200}
          chartConfig={chartConfig}
          bezier
          style={styles.chartStyle}
        />
      </View>

      {/* Status Pie */}
      <View style={styles.chartCard}>
        <Text style={styles.chartHeader}>Status Distribution</Text>
        <PieChart
          data={processedData.pieData}
          width={SCREEN_WIDTH - 60}
          height={200}
          chartConfig={chartConfig}
          accessor={"count"}
          backgroundColor={"transparent"}
          paddingLeft={"15"}
          absolute
        />
      </View>

      {/* Heatmap */}
      <View style={styles.chartCard}>
        <Text style={styles.chartHeader}>Activity Heatmap</Text>
        <ContributionGraph
          values={processedData.contributionData}
          endDate={new Date()}
          numDays={90}
          width={SCREEN_WIDTH - 60}
          height={200}
          chartConfig={chartConfig}
          style={styles.chartStyle}
        />
      </View>
    </View>
  );

  const renderSales = () => (
    <View>
      <View style={styles.salesSummary}>
        <Text style={styles.salesLabel}>ESTIMATED REVENUE</Text>
        <Text style={styles.salesValue}>₹{processedData.summary.revenue.toLocaleString()}</Text>
        <Text style={styles.salesSub}>+ ₹{processedData.summary.potentialRevenue.toLocaleString()} in pipeline</Text>
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.chartHeader}>Revenue Trend</Text>
        <LineChart
          data={{
            labels: processedData.lineLabels,
            datasets: [{ data: processedData.revenueData }]
          }}
          width={SCREEN_WIDTH - 60}
          height={200}
          yAxisLabel="₹"
          chartConfig={{
            ...chartConfig,
            color: (opacity = 1) => `rgba(255, 215, 0, ${opacity})`, // Gold color
          }}
          bezier
          style={styles.chartStyle}
        />
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.chartHeader}>Top Clients by Volume</Text>
        {Object.entries(processedData.clientVolume)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([client, count], index) => (
            <View key={index} style={styles.listItem}>
              <View style={styles.rankBadge}><Text style={styles.rankText}>#{index + 1}</Text></View>
              <Text style={styles.listName}>{client}</Text>
              <Text style={styles.listValue}>{count} cases</Text>
            </View>
          ))}
      </View>
    </View>
  );

  const renderRegional = () => (
    <View>
      <View style={styles.chartCard}>
        <Text style={styles.chartHeader}>Top Cities</Text>
        {processedData.barLabels.length > 0 ? (
          <BarChart
            data={{
              labels: processedData.barLabels,
              datasets: [{ data: processedData.barData }]
            }}
            width={SCREEN_WIDTH - 60}
            height={250}
            yAxisLabel=""
            chartConfig={chartConfig}
            verticalLabelRotation={30}
            style={styles.chartStyle}
          />
        ) : (
          <Text style={styles.noData}>No regional data available</Text>
        )}
      </View>
    </View>
  );

  const renderTeam = () => (
    <View>
      <View style={styles.chartCard}>
        <Text style={styles.chartHeader}>Leaderboard</Text>
        {processedData.teamList.map((member, index) => (
          <View key={member.uid} style={styles.teamRow}>
            <View style={styles.teamInfo}>
              <Text style={styles.teamRank}>#{index + 1}</Text>
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{member.name.charAt(0)}</Text>
              </View>
              <Text style={styles.teamName}>{member.name}</Text>
            </View>
            <View style={styles.teamStats}>
              <Text style={styles.teamCount}>{member.count}</Text>
              <Text style={styles.teamLabel}>Cases</Text>
            </View>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${(member.count / (processedData.teamList[0].count || 1)) * 100}%` }
                ]} 
              />
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  const renderAccessDenied = () => (
    <View style={styles.accessContainer}>
      <Ionicons name="lock-closed-outline" size={64} color="#ccc" style={{ marginBottom: 20 }} />
      <Text style={styles.accessTitle}>Statistics Locked</Text>
      <Text style={styles.accessSub}>You need developer approval to view these stats.</Text>
      
      <TouchableOpacity 
        style={[styles.requestBtn, requestPending && styles.disabledBtn]} 
        onPress={handleRequestAccess}
        disabled={requestPending}
      >
        <Text style={styles.requestBtnText}>
          {requestPending ? "Request Sent (Waiting...)" : "Request Report Access"}
        </Text>
      </TouchableOpacity>
    </View>
  );

  // --- MAIN RENDER ---

  if (loading && accessGranted) {
    return (
      <LinearGradient colors={["#200122", "#6f0000"]} style={styles.container}>
        <ActivityIndicator size="large" color="#fff" style={{ marginTop: 100 }} />
        <Text style={{ color: "#fff", textAlign: "center", marginTop: 20 }}>Crunching numbers...</Text>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#200122", "#6f0000"]} style={styles.container}>
      <Image
        source={require("../assets/logo.png")}
        style={styles.bgLogo}
        resizeMode="contain"
        pointerEvents="none"
      />
      {renderHeader()}
      
      {!accessGranted ? (
        renderAccessDenied()
      ) : (
      <ScrollView 
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        {renderRangeFilter()}
        {renderTabs()}

        {processedData ? (
          <View style={styles.tabContent}>
            {activeTab === "Overview" && renderOverview()}
            {activeTab === "Sales" && renderSales()}
            {activeTab === "Regional" && renderRegional()}
            {activeTab === "Team" && renderTeam()}
          </View>
        ) : (
          <Text style={styles.noData}>No data available for this range.</Text>
        )}

        <TouchableOpacity style={styles.sendReportBtn} onPress={handleSendReport}>
          <LinearGradient colors={["#00c6ff", "#0072ff"]} style={styles.sendReportGradient}>
            <Ionicons name="share-social" size={20} color="#fff" style={{ marginRight: 10 }} />
            <Text style={styles.sendReportText}>Generate & Share Report</Text>
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 50 }} />
      </ScrollView>
      )}

      {/* In-App Alert Modal for Report Download */}
      <Modal
        transparent={true}
        visible={showDownloadAlert}
        animationType="slide"
        onRequestClose={() => setShowDownloadAlert(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="document-text-outline" size={50} color="#4caf50" style={{ marginBottom: 10 }} />
            <Text style={styles.modalTitle}>Report Ready!</Text>
            <Text style={styles.modalText}>
              Your analytics report is ready.{"\n"}
              <Text style={{ fontSize: 12, color: '#ff4444' }}>Note: Access stays only for a day.</Text>
            </Text>
            
            <TouchableOpacity style={styles.modalDownloadBtn} onPress={() => { handleSendReport(); setShowDownloadAlert(false); }}>
              <Text style={styles.modalBtnText}>Download Report</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowDownloadAlert(false)}>
              <Text style={[styles.modalBtnText, { color: '#666' }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

// --- SUB-COMPONENTS ---

const StatCard = ({ label, value, icon, color }) => (
  <View style={styles.statCard}>
    <View style={[styles.iconBox, { backgroundColor: color }]}>
      <Ionicons name={icon} size={20} color="#fff" />
    </View>
    <View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  </View>
);

// --- STYLES ---

const chartConfig = {
  backgroundGradientFrom: "#1E2923",
  backgroundGradientFromOpacity: 0,
  backgroundGradientTo: "#08130D",
  backgroundGradientToOpacity: 0,
  color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
  strokeWidth: 2,
  barPercentage: 0.7,
  useShadowColorFromDataset: false,
  decimalPlaces: 0,
  labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  bgLogo: { position: "absolute", alignSelf: "center", top: "30%", width: 300, height: 300, opacity: 0.05 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  backButton: { marginRight: 15 },
  headerTitle: { fontSize: 20, fontWeight: "bold", color: "#fff", flex: 1 },
  refreshBtn: { padding: 5 },
  content: { padding: 20 },
  
  // Admin Alert
  adminAlertBox: { marginBottom: 20, borderRadius: 12, overflow: 'hidden', elevation: 5 },
  adminAlertGradient: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15 },
  adminAlertText: { color: "#fff", fontWeight: "bold", fontSize: 14, marginLeft: 10 },
  pulseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#fff" },

  // Filters
  rangeContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: 5 },
  rangeBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  activeRangeBtn: { backgroundColor: '#fff' },
  rangeText: { color: '#ccc', fontSize: 12, fontWeight: 'bold' },
  activeRangeText: { color: '#000' },

  // Tabs
  tabContainer: { marginBottom: 20 },
  tab: { marginRight: 15, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  activeTab: { backgroundColor: '#8e24aa', borderColor: '#8e24aa' },
  tabText: { color: '#aaa', fontWeight: '600' },
  activeTabText: { color: '#fff' },

  // Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  statCard: { width: '48%', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 15, marginBottom: 15, flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  statValue: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  statLabel: { color: '#aaa', fontSize: 11 },

  // Charts
  chartCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 15, marginBottom: 20, alignItems: 'center' },
  chartHeader: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 15, alignSelf: 'flex-start' },
  chartStyle: { borderRadius: 16, marginVertical: 8 },
  noData: { color: '#666', fontStyle: 'italic', textAlign: 'center', marginTop: 20 },

  // Sales
  salesSummary: { alignItems: 'center', marginBottom: 20, padding: 20, backgroundColor: 'rgba(255, 215, 0, 0.1)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 215, 0, 0.3)' },
  salesLabel: { color: '#ffd700', fontSize: 12, letterSpacing: 1, marginBottom: 5 },
  salesValue: { color: '#fff', fontSize: 32, fontWeight: 'bold' },
  salesSub: { color: '#aaa', fontSize: 12, marginTop: 5 },
  
  // Lists
  listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', width: '100%' },
  rankBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#444', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  rankText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  listName: { color: '#fff', flex: 1, fontSize: 14 },
  listValue: { color: '#ffd700', fontWeight: 'bold' },

  // Team
  teamRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, width: '100%', position: 'relative' },
  teamInfo: { flexDirection: 'row', alignItems: 'center', width: 120, zIndex: 2 },
  teamRank: { color: '#666', width: 25, fontSize: 12 },
  avatarPlaceholder: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#6a1b9a', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  avatarText: { color: '#fff', fontWeight: 'bold' },
  teamName: { color: '#fff', fontSize: 13, width: 80 },
  teamStats: { position: 'absolute', right: 10, alignItems: 'flex-end', zIndex: 2 },
  teamCount: { color: '#fff', fontWeight: 'bold' },
  teamLabel: { color: '#666', fontSize: 10 },
  progressBar: { position: 'absolute', left: 130, right: 60, height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3 },
  progressFill: { height: '100%', backgroundColor: '#00C851', borderRadius: 3 },

  // Button
  sendReportBtn: { marginTop: 10, borderRadius: 12, overflow: 'hidden' },
  sendReportGradient: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 16 },
  sendReportText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  // Access Denied
  accessContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  accessTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  accessSub: { color: '#ccc', textAlign: 'center', marginBottom: 30 },
  requestBtn: { backgroundColor: '#007AFF', paddingHorizontal: 30, paddingVertical: 15, borderRadius: 25 },
  disabledBtn: { backgroundColor: '#555' },
  requestBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalContent: { backgroundColor: "#fff", borderRadius: 15, padding: 25, alignItems: "center", width: '85%', elevation: 10 },
  modalTitle: { fontSize: 22, fontWeight: "bold", color: "#333", marginBottom: 10 },
  modalText: { fontSize: 16, color: "#666", textAlign: "center", marginBottom: 20, lineHeight: 22 },
  modalDownloadBtn: { backgroundColor: "#007AFF", paddingVertical: 12, paddingHorizontal: 30, borderRadius: 25, marginBottom: 10, width: '100%', alignItems: 'center' },
  modalCloseBtn: { paddingVertical: 10, paddingHorizontal: 30 },
  modalBtnText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
