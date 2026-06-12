import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import firebase from "../firebase";
import { APPWRITE_CONFIG, databases, ID, Query } from "./appwrite";
const { width } = Dimensions.get("window");

/** 
 * Predefined reward images hosted on Cloudinary.
 * Replace the URLs below with your actual Cloudinary Secure URLs.
 */
const PREDEFINED_REWARD_IMAGES = [
  { id: 'Dominos', label: 'Dominos', url: 'https://res.cloudinary.com/dfpykheky/image/upload/v1781275623/htekwv1fncbhgro90h3k.jpg'},
  { id: 'flipkart', label: 'flipkart', url: 'https://res.cloudinary.com/dfpykheky/image/upload/v1781275623/lnqdpfq5beri8hs1qbtm.jpg'},
  { id: 'Amazon', label: 'Amazom', url: 'https://res.cloudinary.com/dfpykheky/image/upload/v1781275623/f3o8x6bifhwz4rgdbsnp.jpg'},
  { id: 'cashback', label: 'Cashback', url: 'https://res.cloudinary.com/dfpykheky/image/upload/v1781275622/it0ego15pmagohik0uw9.jpg'},
  { id: 'Makemytrip', label: 'Makemytrip', url: 'https://res.cloudinary.com/dfpykheky/image/upload/v1781275622/uaqwzifjwgl3kqhzlok6.jpg'},
  { id: 'beauty', label: 'beauty', url: 'https://res.cloudinary.com/dfpykheky/image/upload/v1781275623/rqe9twfaqk9yopvl9ou3.jpg'},
  { id: 'none', label: 'Generic Reward', url: '' }, // Default/No image option
];

export default function DevRewardsScreen({ navigation }) {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);

  // Modal states
  const [selectedUser, setSelectedUser] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTestEditModal, setShowTestEditModal] = useState(false);
  const [testCaseCount, setTestCaseCount] = useState("");
  const [rewardForm, setRewardForm] = useState({
    couponCode: "",
    amount: "",
    description: "",
    validUntil: "",
    couponImage: "" // Now stores the selected Cloudinary URL string
  });

  useEffect(() => {
    loadUsersData();
  }, []);

  useEffect(() => {
    if (searchText.trim() === "") {
      setFilteredUsers(users);
    } else {
      const filtered = users.filter(
        (user) =>
          user.name?.toLowerCase().includes(searchText.toLowerCase()) ||
          user.email?.toLowerCase().includes(searchText.toLowerCase()) ||
          user.uniqueId?.toLowerCase().includes(searchText.toLowerCase())
      );
      setFilteredUsers(filtered);
    }
  }, [searchText, users]);

  const loadUsersData = async () => {
    try {
      setLoading(true);
      const usersRef = firebase.database().ref("users");
      
      usersRef.on("value", async (snapshot) => {
        const usersData = snapshot.val() || {};
        const usersList = [];

        // For each user, check if they've completed 75 cases this month
        for (const [uid, userData] of Object.entries(usersData)) {
          const casesRef = firebase.database().ref("cases");
          const userCasesSnapshot = await casesRef
            .orderByChild("assignedTo")
            .equalTo(uid)
            .once("value");

          const userCases = userCasesSnapshot.val() || {};
          const casesList = Object.values(userCases);

          // Count completed cases this month
          const currentDate = new Date();
          const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
          const completedThisMonth = casesList.filter((c) => {
            if (!c.completedAt) return false;
            const completedDate = new Date(c.completedAt);
            return (
              completedDate >= monthStart &&
              (c.status === "completed" || c.status === "closed")
            );
          }).length;

          // Check if test case count exists (for testing)
          const testCaseCount = userData?.testMonthlyCompletedCases;
          const finalCompletedCount = testCaseCount !== undefined ? testCaseCount : completedThisMonth;

          // Get user rewards from Appwrite
          const rewardsRes = await databases.listDocuments(
            APPWRITE_CONFIG.databaseId,
            APPWRITE_CONFIG.rewardsCollectionId,
            [Query.equal("userId", uid)]
          );
          const userRewards = rewardsRes.documents.reduce((acc, doc) => ({ ...acc, [doc.$id]: doc }), {});

          usersList.push({
            uid,
            ...userData,
            monthlyCompletedCases: finalCompletedCount,
            rewardsCount: Object.keys(userRewards).length,
            totalCases: casesList.length,
            isEligible: finalCompletedCount >= 75,
            rewards: userRewards,
            isTestOverride: testCaseCount !== undefined
          });
        }

        setUsers(usersList.sort((a, b) => b.monthlyCompletedCases - a.monthlyCompletedCases));
        setLoading(false);
      });
    } catch (error) {
      console.log("Error loading users:", error);
      Alert.alert("Error", "Failed to load users data");
      setLoading(false);
    }
  };

  const handleCreateReward = async () => {
    if (!selectedUser) return;
    
    const code = (rewardForm.couponCode || "").trim();
    if (!code) {
      Alert.alert("Error", "Please enter a coupon code");
      return;
    }

    if (!rewardForm.amount && !rewardForm.couponCode) {
      Alert.alert("Error", "Please enter either amount or coupon code");
      return;
    }

    try {
      setLoading(true);
      await databases.createDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.rewardsCollectionId,
        ID.unique(),
        {
          userId: selectedUser.uid,
          couponCode: code,
          amount: rewardForm.amount ? parseFloat(rewardForm.amount) : 0,
          description: rewardForm.description || "",
          couponImage: rewardForm.couponImage || "",
          validUntil: rewardForm.validUntil || "",
          revealed: false,
          revealedAt: "",
          createdAt: new Date().toISOString(),
          createdBy: "dev"
        }
      );

      Alert.alert("Success", `Reward created for ${selectedUser.name}`);
      setRewardForm({
        couponCode: "",
        amount: "",
        description: "",
        validUntil: "",
        couponImage: ""
      });
      setShowCreateModal(false);
      setSelectedUser(null);
    } catch (error) {
      console.log("Error creating reward:", error);
      Alert.alert("Error", "Failed to create reward");
    } finally {
        setLoading(false);
    }
  };

  const handleUpdateTestCases = async () => {
    if (!selectedUser || testCaseCount === "") {
      Alert.alert("Error", "Please enter a case count");
      return;
    }

    const count = parseInt(testCaseCount);
    if (isNaN(count) || count < 0) {
      Alert.alert("Error", "Please enter a valid number");
      return;
    }

    try {
      // Save test case count to Firebase for this user
      await firebase.database()
        .ref(`users/${selectedUser.uid}/testMonthlyCompletedCases`)
        .set(count);

      Alert.alert(
        "Success",
        `Set test cases to ${count} for ${selectedUser.name}.\n\nEligibility: ${count >= 75 ? "✓ Eligible" : "Not Yet"}`
      );
      setShowTestEditModal(false);
      setTestCaseCount("");
      setSelectedUser(null);
      
      // Reload users data
      loadUsersData();
    } catch (error) {
      console.log("Error updating test cases:", error);
      Alert.alert("Error", "Failed to update test cases");
    }
  };

  const UserCard = ({ user }) => {
    const [showRewards, setShowRewards] = useState(false);

    return (
      <View style={styles.userCard}>
        <View style={styles.userHeader}>
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>
              {user.name || "Unknown"}
            </Text>
            <Text style={styles.userEmail} numberOfLines={1}>
              {user.email || user.uniqueId || "N/A"}
            </Text>
            {user.phoneNumber && (
              <View style={styles.phoneContainer}>
                <Ionicons name="call-outline" size={12} color="#60A5FA" />
                <Text style={styles.phoneNumber}>{user.phoneNumber}</Text>
              </View>
            )}
          </View>
          <View
            style={[
              styles.eligibilityBadge,
              { backgroundColor: user.isEligible ? "#10B981" : "#666" }
            ]}
          >
            <Text style={styles.eligibilityText}>
              {user.isEligible ? "✓ Eligible" : "Not Yet"}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Cases This Month</Text>
            <Text style={styles.statNumber}>{user.monthlyCompletedCases}/75</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Total Cases</Text>
            <Text style={styles.statNumber}>{user.totalCases}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Rewards</Text>
            <Text style={styles.statNumber}>{user.rewardsCount}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBarContainer}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${Math.min((user.monthlyCompletedCases / 75) * 100, 100)}%`,
                backgroundColor: user.isEligible ? "#10B981" : "#60A5FA"
              }
            ]}
          />
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => {
              setSelectedUser(user);
              setShowCreateModal(true);
            }}
            disabled={!user.isEligible}
          >
            <Ionicons name="add-circle-outline" size={20} color={user.isEligible ? "#fff" : "#999"} />
            <Text style={[styles.actionBtnText, { color: user.isEligible ? "#fff" : "#999" }]}>
              Add Reward
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => setShowRewards(!showRewards)}
          >
            <Ionicons name="list-outline" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>
              View ({user.rewardsCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "rgba(96, 165, 250, 0.3)", borderWidth: 1, borderColor: "#60A5FA" }]}
            onPress={() => {
              setSelectedUser(user);
              setTestCaseCount(String(user.monthlyCompletedCases));
              setShowTestEditModal(true);
            }}
          >
            <Ionicons name="flask-outline" size={20} color="#60A5FA" />
            <Text style={[styles.actionBtnText, { color: "#60A5FA", fontSize: 11 }]}>
              Test Edit
            </Text>
          </TouchableOpacity>
        </View>

        {user.isTestOverride && (
          <View style={styles.testOverrideWarning}>
            <Ionicons name="warning-outline" size={16} color="#FFA500" />
            <Text style={styles.testOverrideText}>Test Override Active - Cases set to {user.monthlyCompletedCases}</Text>
          </View>
        )}

        {/* Rewards list */}
        {showRewards && (
          <View style={styles.rewardsList}>
            {user.rewardsCount === 0 ? (
              <Text style={styles.noRewardsText}>No rewards yet</Text>
            ) : (
              Object.entries(user.rewards || {}).map(([rewardId, reward]) => (
                <View key={rewardId} style={styles.rewardItem}>
                  <View style={styles.rewardInfo}>
                    <Text style={styles.rewardCode}>
                      Code: {reward.couponCode || "N/A"}
                    </Text>
                    {reward.amount && (
                      <Text style={styles.rewardAmount}>₹ {reward.amount}</Text>
                    )}
                    <Text style={styles.rewardStatus}>
                      {reward.revealed ? "✓ Claimed" : "⏳ Pending"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert(
                        "Delete Reward?",
                        "Are you sure?",
                        [
                          { text: "Cancel" },
                          {
                            text: "Delete",
                            onPress: async () => {
                              try {
                                await databases.deleteDocument(
                                  APPWRITE_CONFIG.databaseId,
                                  APPWRITE_CONFIG.rewardsCollectionId,
                                  rewardId
                                );
                              } catch (error) {
                                Alert.alert("Error", "Failed to delete reward");
                              }
                            },
                            style: "destructive"
                          }
                        ]
                      );
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <LinearGradient colors={["#030712", "#08132b", "#0b1f46"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Manage Rewards 🎁</Text>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email..."
          placeholderTextColor="#666"
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#60A5FA" />
        </View>
      ) : filteredUsers.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No users found</Text>
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.uid}
          renderItem={({ item }) => <UserCard user={item} />}
          contentContainerStyle={styles.list}
        />
      )}

      {/* Create Reward Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <LinearGradient colors={["#030712", "#08132b"]} style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Create Reward for {selectedUser?.name}
              </Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Coupon Code</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., REWARD2024"
                placeholderTextColor="#666"
                value={rewardForm.couponCode}
                onChangeText={(text) =>
                  setRewardForm({ ...rewardForm, couponCode: text })
                }
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Amount (₹)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 500"
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
                value={rewardForm.amount}
                onChangeText={(text) =>
                  setRewardForm({ ...rewardForm, amount: text })
                }
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, { height: 60 }]}
                placeholder="e.g., 10% discount on services"
                placeholderTextColor="#666"
                multiline
                value={rewardForm.description}
                onChangeText={(text) =>
                  setRewardForm({ ...rewardForm, description: text })
                }
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Valid Until</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 2025-12-31"
                placeholderTextColor="#666"
                value={rewardForm.validUntil}
                onChangeText={(text) =>
                  setRewardForm({ ...rewardForm, validUntil: text })
                }
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Select Reward Type (Predefined Icon)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.predefinedRow}>
                {PREDEFINED_REWARD_IMAGES.map((item) => (
                  <TouchableOpacity 
                    key={item.id} 
                    style={[
                      styles.predefinedItem, 
                      rewardForm.couponImage === item.url && styles.predefinedItemSelected
                    ]}
                    onPress={() => setRewardForm({ ...rewardForm, couponImage: item.url })}
                  >
                    {item.url ? (
                      <Image source={{ uri: item.url }} style={styles.predefinedThumb} />
                    ) : (
                      <View style={[styles.predefinedThumb, styles.predefinedPlaceholder]}>
                         <Ionicons name="close-circle-outline" size={24} color="#666" />
                      </View>
                    )}
                    <Text 
                      style={[
                        styles.predefinedLabel, 
                        rewardForm.couponImage === item.url && styles.predefinedLabelSelected
                      ]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                    {rewardForm.couponImage === item.url && (
                      <View style={styles.checkBadge}>
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.btn, styles.cancelBtn]}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.createBtn]}
                onPress={handleCreateReward}
              >
                <Text style={[styles.btnText, { color: "#000" }]}>
                  Create Reward
                </Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </LinearGradient>
      </Modal>

      {/* Test Edit Modal */}
      <Modal visible={showTestEditModal} transparent animationType="slide">
        <LinearGradient colors={["#030712", "#08132b"]} style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Test: Edit Cases for {selectedUser?.name}
              </Text>
              <TouchableOpacity onPress={() => setShowTestEditModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.testWarningBox}>
              <Ionicons name="warning-outline" size={20} color="#FFA500" />
              <Text style={styles.testWarningText}>
                This is for testing only. You can manually set the completed cases count to test eligibility.
              </Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Completed Cases This Month</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter number (e.g., 75)"
                placeholderTextColor="#666"
                keyboardType="number-pad"
                value={testCaseCount}
                onChangeText={setTestCaseCount}
              />
              <Text style={styles.helperText}>
                Tip: Enter 75 or higher to make member eligible
              </Text>
            </View>

            <View style={styles.formGroup}>
              <View style={styles.eligibilityPreview}>
                <Text style={styles.previewLabel}>Preview:</Text>
                <View style={[
                  styles.previewBadge,
                  { 
                    backgroundColor: parseInt(testCaseCount || "0") >= 75 ? "#10B981" : "#666"
                  }
                ]}>
                  <Text style={styles.previewBadgeText}>
                    {parseInt(testCaseCount || "0") >= 75 ? "✓ Will be Eligible" : "Not Yet Eligible"}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.btn, styles.cancelBtn]}
                onPress={() => setShowTestEditModal(false)}
              >
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: "#60A5FA" }]}
                onPress={handleUpdateTestCases}
              >
                <Text style={[styles.btnText, { color: "#000" }]}>
                  Update Test Cases
                </Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </LinearGradient>
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
  headerTitle: { fontSize: 22, fontWeight: "bold", color: "#fff" },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    marginHorizontal: 20,
    marginTop: 15,
    marginBottom: 15,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  searchIcon: { marginRight: 10 },
  searchInput: {
    flex: 1,
    color: "#fff",
    paddingVertical: 10,
    fontSize: 14,
  },

  list: { padding: 15 },
  userCard: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    borderLeftWidth: 3,
    borderLeftColor: "#60A5FA",
  },
  userHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  userInfo: { flex: 1, marginRight: 10 },
  userName: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  userEmail: { color: "#aaa", fontSize: 12, marginTop: 4 },
  eligibilityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  eligibilityText: { color: "#fff", fontSize: 12, fontWeight: "bold" },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 10,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statLabel: { color: "#aaa", fontSize: 11 },
  statNumber: { color: "#60A5FA", fontSize: 16, fontWeight: "bold", marginTop: 4 },

  progressBarContainer: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 12,
  },
  progressBar: { height: "100%", borderRadius: 3 },

  actionButtons: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(96, 165, 250, 0.2)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 6,
  },
  actionBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  rewardsList: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  noRewardsText: { color: "#aaa", fontSize: 12, textAlign: "center" },
  rewardItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 6,
    marginBottom: 6,
  },
  rewardInfo: { flex: 1 },
  rewardCode: { color: "#60A5FA", fontSize: 12, fontWeight: "bold" },
  rewardAmount: { color: "#10B981", fontSize: 13, marginTop: 2 },
  rewardStatus: { color: "#aaa", fontSize: 11, marginTop: 2 },

  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: { color: "#aaa", fontSize: 16 },

  // Modal styles
  modalContainer: { flex: 1, justifyContent: "flex-end" },
  modalContent: {
    backgroundColor: "rgba(30, 41, 59, 0.95)",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },

  formGroup: { marginBottom: 15 },
  label: { color: "#ccc", fontSize: 13, marginBottom: 8, fontWeight: "600" },
  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    fontSize: 14,
  },
  predefinedRow: {
    flexDirection: 'row',
    marginTop: 5,
  },
  predefinedItem: {
    width: 80,
    marginRight: 12,
    alignItems: 'center',
    padding: 5,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  predefinedItemSelected: {
    borderColor: '#60A5FA',
    backgroundColor: 'rgba(96, 165, 250, 0.1)',
  },
  predefinedThumb: {
    width: 50,
    height: 50,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  predefinedPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  predefinedLabel: {
    color: '#aaa',
    fontSize: 10,
    marginTop: 5,
    textAlign: 'center',
  },
  predefinedLabelSelected: {
    color: '#60A5FA',
    fontWeight: 'bold',
  },
  checkBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#60A5FA',
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  imagePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(96, 165, 250, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.3)",
  },
  imagePickerText: { color: "#60A5FA", fontSize: 13 },

  buttonGroup: { flexDirection: "row", gap: 12, marginTop: 20 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelBtn: { backgroundColor: "rgba(255,255,255,0.1)" },
  createBtn: { backgroundColor: "#60A5FA" },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },

  // Test Override Styles
  testOverrideWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 165, 0, 0.1)",
    borderLeftWidth: 3,
    borderLeftColor: "#FFA500",
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
    borderRadius: 6,
  },
  testOverrideText: {
    color: "#FFA500",
    fontSize: 12,
    flex: 1,
  },

  // Test Modal Styles
  testWarningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255, 165, 0, 0.15)",
    borderWidth: 1,
    borderColor: "#FFA500",
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  testWarningText: {
    color: "#FFA500",
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },

  helperText: {
    color: "#aaa",
    fontSize: 11,
    marginTop: 6,
    fontStyle: "italic",
  },

  eligibilityPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  previewLabel: {
    color: "#ccc",
    fontSize: 13,
  },
  previewBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  previewBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },

  // Phone number styles
  phoneContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(96, 165, 250, 0.1)",
    borderRadius: 6,
  },
  phoneNumber: {
    color: "#60A5FA",
    fontSize: 13,
    fontWeight: "600",
  },
});
