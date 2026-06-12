import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Image,
    Modal,
    PanResponder,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import firebase from "../firebase";
import { APPWRITE_CONFIG, databases, Query } from "./appwrite";
import { AuthContext } from "./AuthContext";

const { width, height } = Dimensions.get("window");

export default function RewardsScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userStats, setUserStats] = useState({});
  const [selectedReward, setSelectedReward] = useState(null);
  const [showScratchModal, setShowScratchModal] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;

    const fetchRewards = async () => {
      try {
        const res = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.rewardsCollectionId,
          [Query.equal("userId", user.uid)]
        );
        const list = res.documents.map(doc => ({ id: doc.$id, ...doc }));
        setRewards(list);
      } catch (e) {
        console.log("Error loading rewards:", e);
      } finally {
      setLoading(false);
      }
    };

    fetchRewards();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    // Get user stats to check case completion count
    const userRef = firebase.database().ref(`users/${user.uid}`);
    const listener = userRef.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      setUserStats(data);
    });

    return () => userRef.off("value", listener);
  }, [user?.uid]);

  const ScratchCard = ({ reward, index, isModal = false }) => {
    const [revealed, setRevealed] = useState(reward?.revealed || false);
    const [scratchProgress, setScratchProgress] = useState(0);
    const scratchOpacity = useRef(new Animated.Value(reward?.revealed ? 0 : 1)).current;
    const scratchTouchCount = useRef(0);
    const SCRATCH_THRESHOLD = isModal ? 120 : 60;

    const cardColors = [
      { bg: "#FF9500", pattern: "#FFB74D" },
      { bg: "#4A90E2", pattern: "#64B5F6" },
      { bg: "#7C3AED", pattern: "#A78BFA" },
    ];
    const cardColor = cardColors[index % cardColors.length];

    const handleFullReveal = useCallback(async () => {
      if (revealed) return;

      try {
        await databases.updateDocument(
          APPWRITE_CONFIG.databaseId,
          APPWRITE_CONFIG.rewardsCollectionId,
          reward.id,
          { revealed: true, revealedAt: new Date().toISOString() }
        );
        
        setRevealed(true);
        scratchOpacity.setValue(0);
        setRewards(prev => prev.map(r => r.id === reward.id ? { ...r, revealed: true } : r));

        Alert.alert(
          "🎉 Reward Revealed!",
          `${reward.couponCode || ""}\n\nAmount: ₹${reward.amount || "N/A"}\n\nValid Until: ${reward.validUntil || "Check with admin"}`,
          [{ text: "Awesome!" }]
        );
      } catch (error) {
        console.log("Error revealing reward:", error);
        Alert.alert("Error", "Failed to reveal reward");
      }
    }, [revealed, reward.id, reward.couponCode, reward.amount, reward.validUntil, scratchOpacity]);

    const panResponder = useMemo(() => PanResponder.create({
      onStartShouldSetPanResponder: () => !revealed,
      onMoveShouldSetPanResponder: () => !revealed,
      onPanResponderMove: () => {
        if (revealed) return;
        
        scratchTouchCount.current += 1;
        const progress = Math.min(scratchTouchCount.current / SCRATCH_THRESHOLD, 1);
        setScratchProgress(progress);

        scratchOpacity.setValue(1 - progress);

        if (progress >= 1) {
          handleFullReveal();
        }
      }
    }), [revealed, handleFullReveal, scratchOpacity]);

    const imageSource = useMemo(() => {
      if (!reward.couponImage) return null;
      if (typeof reward.couponImage === "string") return { uri: reward.couponImage };
      if (reward.couponImage.uri) return { uri: reward.couponImage.uri };
      return null;
    }, [reward.couponImage]);

    return (
      <View style={[
        isModal ? styles.modalScratchCard : styles.scratchCard,
        { backgroundColor: "#f8fafc" }
      ]}
      >
        {/* Base Layer: Revealed Content */}
        <View style={styles.revealedContent}>
          {imageSource ? (
            <Image
              source={imageSource}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : null}
          
          {/* Text content shown if no image or in addition to image overlay */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: imageSource ? 'rgba(0,0,0,0.6)' : 'transparent', justifyContent: 'center', alignItems: 'center', zIndex: 1, padding: 20 }]}>
            <Text style={[styles.revealedTitle, !imageSource && { color: '#1e293b' }]}>🎁 You Won!</Text>
            {!!reward.couponCode && (
              <>
                <Text style={[styles.revealedLabel, !imageSource && { color: '#64748b' }]}>Code:</Text>
                <Text style={[styles.revealedValue, !imageSource && { color: '#4F46E5' }]}>{reward.couponCode}</Text>
              </>
            )}
            {!!reward.amount && (
              <>
                <Text style={[styles.revealedLabel, !imageSource && { color: '#64748b' }]}>Prize Amount:</Text>
                <Text style={[styles.revealedValue, !imageSource && { color: '#10B981' }]}>₹ {reward.amount}</Text>
              </>
            )}
            {!!reward.description && (
              <Text style={[styles.revealedDescription, !imageSource && { color: '#475569' }]}>{reward.description}</Text>
            )}
            {!!reward.validUntil && (
              <Text style={[styles.validityText, !imageSource && { color: '#94a3b8' }]}>
                Valid Until: {new Date(reward.validUntil).toLocaleDateString()}
              </Text>
            )}
          </View>
        </View>

        {/* Top Layer: Scratch Overlay */}
        {!revealed && (
          <Animated.View
            style={[
              styles.gpayOverlay,
              {
                backgroundColor: cardColor.bg,
                opacity: scratchOpacity,
              }
            ]}
            {...panResponder.panHandlers}
          >
            <View style={styles.patternGrid}>
              {Array(isModal ? 30 : 12).fill(0).map((_, i) => {
                const icons = ["gift-outline", "star-outline", "cash-outline", "happy-outline", "sparkles-outline", "trophy-outline"];
                const randomIcon = icons[Math.floor(Math.random() * icons.length)];
                return (
                  <View key={i} style={isModal ? styles.patternItemLarge : styles.patternItem}>
                    <Ionicons 
                      name={randomIcon} 
                      size={isModal ? 28 : 16} 
                      color={cardColor.pattern}
                      style={{ opacity: 0.4 }}
                    />
                  </View>
                );
              })}
            </View>
          </Animated.View>
        )}
      </View>
    );
  };

  return (
    <LinearGradient colors={["#4e0360", "#1a1a1a"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Rewards 🎁</Text>
      </View>

      {/* Stats Section */}
      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Cases Completed</Text>
          <Text style={styles.statValue}>
            {userStats?.monthlyCompletedCases || 0}/75
          </Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Rewards Earned</Text>
          <Text style={styles.statValue}>{rewards.length}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Rewards Claimed</Text>
          <Text style={styles.statValue}>
            {rewards.filter(r => r.revealed).length}
          </Text>
        </View>
      </View>

      {/* Rewards Grid */}
      {loading ? (
        <Text style={styles.loadingText}>Loading rewards...</Text>
      ) : rewards.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="gift-outline" size={60} color="#888" />
          <Text style={styles.emptyText}>No rewards yet!</Text>
          <Text style={styles.emptySubText}>
            Complete 75 cases in a month to earn a scratch card
          </Text>
        </View>
      ) : (
        <FlatList
          data={rewards}
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={styles.smallCardWrapper}
              onPress={() => {
                setSelectedReward(item);
                setShowScratchModal(true);
              }}
            >
              <View style={[
                styles.smallCard,
                {
                backgroundColor: item.revealed ? "#1e293b" : [
                  "#FF9500",
                  "#4A90E2",
                  "#7C3AED",
                ][index % 3]
                }
              ]}>
              {item.revealed && !!item.couponImage ? (
                <View style={StyleSheet.absoluteFill}>
                  <Image 
                    source={{ uri: typeof item.couponImage === 'string' ? item.couponImage : item.couponImage.uri }} 
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} />
                </View>
              ) : null}
              {item.revealed && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 0 }]} />
              )}
                <Ionicons
                  name={item.revealed ? "checkmark-circle" : "help-circle"}
                  size={32}
                  color="#fff"
                  style={{ opacity: 0.7 }}
                />
                <Text style={[styles.smallCardText, { zIndex: 1 }]} numberOfLines={2}>
                  {String(item.couponCode || item.amount || "Reward")}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.gridList}
          scrollEnabled={true}
        />
      )}

      {/* Scratch Card Modal */}
      <Modal
        visible={showScratchModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowScratchModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Close Button */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowScratchModal(false)}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>

            {/* Title */}
            <Text style={styles.modalTitle}>Scratch to Reveal!</Text>

            {/* Modal Card */}
            {selectedReward && (
              <ScratchCard reward={selectedReward} index={0} isModal={true} />
            )}

            {/* Close Hint */}
            <Text style={styles.closeHint}>Tap X to close</Text>
          </View>
        </View>
      </Modal>

      {/* Info Section */}
      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>How it works?</Text>
        <Text style={styles.infoText}>
          • Complete 75 cases in a month{"\n"}
          • Automatically eligible for a scratch card{"\n"}
          • Scratch to reveal your reward{"\n"}
          • Use code or amount before validity expires
        </Text>
      </View>
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
  headerTitle: { fontSize: 22, fontWeight: "bold", color: "#fff" },
  
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 10,
    justifyContent: "space-between",
  },
  statBox: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingVertical: 15,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  statLabel: {
    color: "#aaa",
    fontSize: 11,
    marginBottom: 5,
  },
  statValue: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },

  list: { padding: 20, paddingBottom: 30 },
  gridList: { padding: 15, paddingBottom: 30 },
  gridRow: {
    justifyContent: "space-between",
    marginBottom: 15,
    gap: 10,
  },
  smallCardWrapper: {
    flex: 1,
    maxWidth: "32%",
  },
  smallCard: {
    borderRadius: 12,
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
    aspectRatio: 1,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },
  smallCardText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContainer: {
    width: "100%",
    alignItems: "center",
    gap: 15,
  },
  closeButton: {
    position: "absolute",
    top: 40,
    right: 20,
    zIndex: 100,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 50,
    padding: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    marginTop: 40,
  },
  modalScratchCard: {
    height: 300,
    width: width * 0.85,
    borderRadius: 20,
    overflow: "hidden",
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  closeHint: {
    color: "#aaa",
    fontSize: 12,
    marginBottom: 20,
  },
  scratchCard: {
    marginBottom: 20,
    borderRadius: 20,
    overflow: "hidden",
    minHeight: 200,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  gpayOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  patternGrid: {
    width: "100%",
    height: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  patternItem: {
    width: "25%",
    height: "20%",
    justifyContent: "center",
    alignItems: "center",
  },
  patternItemLarge: {
    width: "20%",
    height: "16.67%",
    justifyContent: "center",
    alignItems: "center",
  },
  scratchableArea: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  revealedContent: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  revealedTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  revealedLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    marginTop: 8,
  },
  revealedValue: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  revealedDescription: {
    color: "#fff",
    fontSize: 13,
    textAlign: "center",
    marginTop: 10,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  validityText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    marginTop: 15,
    fontStyle: "italic",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },

  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  emptyText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 20,
  },
  emptySubText: {
    color: "#aaa",
    fontSize: 14,
    textAlign: "center",
    marginTop: 10,
  },

  infoSection: {
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 20,
    paddingVertical: 15,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: "#FFD700",
  },
  infoTitle: {
    color: "#FFD700",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
  },
  infoText: {
    color: "#ccc",
    fontSize: 12,
    lineHeight: 18,
  },

  loadingText: {
    color: "#ccc",
    textAlign: "center",
    marginTop: 50,
  },
});
