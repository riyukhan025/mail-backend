import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import firebase from "../firebase";

export default function MemberViewScreen({ navigation }) {
  const [members, setMembers] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [hoveredMemberId, setHoveredMemberId] = useState(null);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 980;

  const livePulse = useRef(new Animated.Value(0.7)).current;
  const gridShift = useRef(new Animated.Value(0)).current;
  const starTwinkle = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const membersRef = firebase.database().ref("users");
    const listener = membersRef.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data)
        .map((key) => ({ id: key, ...data[key] }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setMembers(list);
    });
    return () => membersRef.off("value", listener);
  }, []);

  const filteredMembers = members.filter(m => 
    (m.name || "").toLowerCase().includes(searchText.toLowerCase()) ||
    (m.email || "").toLowerCase().includes(searchText.toLowerCase())
  );

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(livePulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(livePulse, {
          toValue: 0.7,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    const gridLoop = Animated.loop(
      Animated.timing(gridShift, {
        toValue: 1,
        duration: 12000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const starLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(starTwinkle, {
          toValue: 0.7,
          duration: 2400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(starTwinkle, {
          toValue: 0.35,
          duration: 2400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();
    gridLoop.start();
    starLoop.start();
    return () => {
      pulseLoop.stop();
      gridLoop.stop();
      starLoop.stop();
    };
  }, [gridShift, livePulse, starTwinkle]);

  const activeCount = useMemo(
    () => members.filter((m) => String(m.status || "").toLowerCase() === "online").length,
    [members]
  );
  const missionCount = useMemo(
    () => members.filter((m) => String(m.onMission || "").toLowerCase() === "true").length || 12,
    [members]
  );

  const renderItem = ({ item }) => {
    const isOnline = String(item.status || "").toLowerCase() === "online";
    const isHovered = hoveredMemberId === item.id;

    return (
      <TouchableOpacity
        style={[
          styles.cardContainer,
          isDesktop ? styles.cardContainerDesktop : styles.cardContainerMobile,
          isHovered && styles.cardHovered,
        ]}
        activeOpacity={0.92}
        onPress={() => navigation.navigate("MemberDetailScreen", { memberId: item.id })}
        onHoverIn={() => Platform.OS === "web" && setHoveredMemberId(item.id)}
        onHoverOut={() => Platform.OS === "web" && setHoveredMemberId(null)}
      >
        <LinearGradient
          colors={["rgba(92,240,255,0.14)", "rgba(10,18,34,0.72)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.neonEdge} />
          <View style={styles.avatarContainer}>
            <View style={styles.avatarGlow}>
              {item.photoURL ? (
                <Image source={{ uri: item.photoURL }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>{(item.name || "U").charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.info}>
            <Text style={styles.name}>{item.name || "Unknown"}</Text>
            <Text style={styles.metaLine}>ID: {item.uniqueId || item.id.slice(0, 8)}</Text>
            <Text style={styles.metaLine}>ROLE: {(item.role || "member").toUpperCase()}</Text>
            <View style={styles.statusRow}>
              <Animated.View
                style={[
                  styles.statusDot,
                  { backgroundColor: isOnline ? "#43f58a" : "#8fa8bf", transform: [{ scale: livePulse }] },
                ]}
              />
              <Text style={[styles.statusText, { color: isOnline ? "#74ffb8" : "#a8b5c5" }]}>
                {isOnline ? "ONLINE" : "OFFLINE"}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.actionRail,
              Platform.OS === "web" && !isHovered ? styles.actionRailHidden : null,
            ]}
          >
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => navigation.navigate("MemberDetailScreen", { memberId: item.id })}
            >
              <Text style={styles.actionText}>VIEW</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn}>
              <Text style={styles.actionText}>PROMOTE</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn}>
              <Text style={styles.actionText}>MESSAGE</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const gridTranslate = gridShift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 34],
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#060B1A", "#0A1124", "#0B132B"]} style={StyleSheet.absoluteFill} />
      <Animated.View
        style={[
          styles.gridOverlay,
          {
            pointerEvents: "none",
            transform: [{ translateY: gridTranslate }],
            opacity: starTwinkle,
          },
        ]}
      />
      <View style={[styles.centerGlow, { pointerEvents: "none" }]} />

      <View style={styles.safeWrap}>
        <View style={styles.commandStrip}>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={22} color="#d7f2ff" />
            </TouchableOpacity>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerKicker}>UNIT_07 / SQUAD CONTROL</Text>
              <View style={styles.neonDivider} />
            </View>
            <View style={styles.liveWrap}>
              <Animated.View style={[styles.liveDot, { transform: [{ scale: livePulse }] }]} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
          <View style={styles.counterRow}>
            <Text style={styles.counterText}>ACTIVE: {members.length}</Text>
            <Text style={styles.counterText}>ONLINE: {activeCount}</Text>
            <Text style={styles.counterText}>MISSIONS: {missionCount}</Text>
          </View>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#9ed2ff" style={{ marginRight: 10 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search operators..."
            placeholderTextColor="#6f87a1"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>

        <View style={[styles.contentWrap, isDesktop ? styles.contentDesktop : styles.contentMobile]}>
          <View style={styles.leftColumn}>
            <ScrollView
              style={{ flex: 1, width: "100%", minHeight: 0 }}
              contentContainerStyle={[styles.list, { paddingBottom: 90 }]}
              nestedScrollEnabled
              scrollEventThrottle={16}
              showsVerticalScrollIndicator
            >
              {filteredMembers.length === 0 ? (
                <Text style={styles.emptyText}>No operators found.</Text>
              ) : (
                filteredMembers.map((item) => (
                  <View key={item.id}>{renderItem({ item })}</View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050911" },
  safeWrap: { flex: 1, paddingTop: 44, paddingHorizontal: 14 },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    borderTopWidth: 1,
    borderColor: "rgba(74,137,190,0.14)",
  },
  centerGlow: {
    position: "absolute",
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: "rgba(56,170,255,0.13)",
    top: "18%",
    left: "26%",
  },
  commandStrip: {
    borderWidth: 1,
    borderColor: "rgba(113,204,255,0.26)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "rgba(5,13,28,0.75)",
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(9,26,46,0.95)",
    borderWidth: 1,
    borderColor: "rgba(135,220,255,0.35)",
  },
  headerTitleWrap: { flex: 1, marginLeft: 10, marginRight: 10 },
  headerKicker: { color: "#e1f7ff", fontWeight: "700", letterSpacing: 1.2, fontSize: 13 },
  neonDivider: {
    marginTop: 7,
    height: 2,
    borderRadius: 2,
    backgroundColor: "#3fdfff",
  },
  liveWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#58ffaf" },
  liveText: { color: "#9fffd2", fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  counterRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  counterText: { color: "#b3d2ea", fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    backgroundColor: "rgba(8,23,41,0.86)",
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(104,186,255,0.24)",
  },
  searchInput: { flex: 1, color: "#d9edff", fontSize: 14 },
  contentWrap: { flex: 1, marginTop: 12, gap: 12, minHeight: 0 },
  contentDesktop: { flexDirection: "column" },
  contentMobile: { flexDirection: "column" },
  leftColumn: { flex: 1, minHeight: 0 },
  list: { paddingVertical: 4 },
  cardContainer: {
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 10,
  },
  cardContainerDesktop: { shadowColor: "#00d2ff", shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  cardContainerMobile: { shadowColor: "#001520", shadowOpacity: 0.12, shadowRadius: 3, elevation: 1 },
  cardHovered: {
    transform: [{ translateY: -2 }],
    borderWidth: 1,
    borderColor: "rgba(106,228,255,0.42)",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(100,201,255,0.2)",
    backgroundColor: "rgba(11,20,37,0.78)",
    position: "relative",
  },
  neonEdge: {
    position: "absolute",
    left: 0,
    top: 10,
    bottom: 10,
    width: 2,
    backgroundColor: "#35e8ff",
    borderRadius: 2,
  },
  avatarContainer: { marginRight: 12 },
  avatarGlow: {
    padding: 2,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(121,231,255,0.55)",
    backgroundColor: "rgba(59,161,203,0.16)",
  },
  avatarImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  avatarPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(120,201,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#eff8ff", fontSize: 17, fontWeight: "700" },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: "700", color: "#ecf8ff", marginBottom: 2, letterSpacing: 0.3 },
  metaLine: { color: "#89a7c0", fontSize: 10.5, marginBottom: 2, letterSpacing: 0.6 },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: 2, gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  actionRail: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 6,
  },
  actionRailHidden: { opacity: 0.12 },
  actionBtn: {
    minWidth: 76,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(111,220,255,0.36)",
    backgroundColor: "rgba(12,36,60,0.66)",
    alignItems: "center",
  },
  actionText: { color: "#c9efff", fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  emptyText: { color: "#9bb2c8", textAlign: "center", marginTop: 44, fontSize: 13 },
});
