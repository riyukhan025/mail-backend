import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { useContext, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import firebase from "../firebase";
import { APPWRITE_CONFIG, databases } from "./appwrite";
import { AuthContext } from "./AuthContext";

export default function PlanYourDayScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const webviewRef = useRef(null);
  const [plannedCases, setPlannedCases] = useState([]);
  const [openCases, setOpenCases] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const documentId = user?.uid; // use Firebase UID as documentId

  // Load open cases from Firebase
  useEffect(() => {
    if (!user) return;
    const casesRef = firebase.database().ref("cases");
    const query = casesRef.orderByChild("assignedTo").equalTo(user.uid);

    const listener = query.on("value", (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.keys(data)
        .map((key) => ({ id: key, ...data[key] }))
        .filter((c) => c.status === "assigned" || c.status === "audit");
      setOpenCases(list);
    });
    return () => query.off("value", listener);
  }, [user]);

  // Load user's plannedCases from Appwrite
  useEffect(() => {
    if (!user) return;
    const loadPlan = async () => {
      try {
        const doc = await databases.getDocument(APPWRITE_CONFIG.databaseId, APPWRITE_CONFIG.userPlansCollectionId, documentId);
        setPlannedCases(JSON.parse(doc.plannedCases || "[]"));
      } catch (error) {
        console.log("No existing plan found for user, starting fresh.", error);
      }
    };
    loadPlan();
  }, [user]);

  // Real-time GPS Tracking
  useEffect(() => {
    let subscription;
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        
        // Start watching position for real-time movement
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 2000,
            distanceInterval: 5,
          },
          (location) => {
            setUserLocation(location);
            // Send location update to WebView without reloading
            if (webviewRef.current) {
              webviewRef.current.injectJavaScript(`if(window.updateUserLocation) window.updateUserLocation(${location.coords.latitude}, ${location.coords.longitude}, ${isNavigating});`);
            }
          }
        );
      } catch (e) {}
    })();
    return () => subscription && subscription.remove();
  }, [isNavigating]);

  // Sync plannedCases with openCases to reflect status changes
  useEffect(() => {
    setPlannedCases(prev => prev.map(p => openCases.find(o => o.id === p.id) || p));
  }, [openCases]);

  const savePlan = async (newPlan) => {
    if (!user) return;
    try {
      // Try updating the document first
      await databases.updateDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.userPlansCollectionId,
        documentId,
        {
          plannedCases: JSON.stringify(newPlan),
          updatedAt: new Date().toISOString(),
        }
      );
    } catch (error) {
      // If the document doesn't exist, create it
      await databases.createDocument(
        APPWRITE_CONFIG.databaseId,
        APPWRITE_CONFIG.userPlansCollectionId,
        documentId,
        {
          plannedCases: JSON.stringify(newPlan),
          updatedAt: new Date().toISOString(),
        }
      );
    }
  };

  const handleEndDay = () => {
    const incomplete = plannedCases.filter(c => c.status !== 'audit' && c.status !== 'completed');
    if (incomplete.length > 0) {
      Alert.alert("Incomplete Cases", "These cases are incomplete. Kindly do complete it by tomorrow.");
    } else {
      if (plannedCases.length > 0) {
        Alert.alert("Good Job", "All planned cases are completed!");
      }
    }
  };

  const addToPlan = (caseItem) => {
    const newPlan = plannedCases.find((c) => c.id === caseItem.id) ? plannedCases : [...plannedCases, caseItem];
    setPlannedCases(newPlan);
    savePlan(newPlan);
    setModalVisible(false);
  };

  const removeFromPlan = (id) => {
    const newPlan = plannedCases.filter((c) => c.id !== id);
    setPlannedCases(newPlan);
    savePlan(newPlan);
  };

  const getMapHtml = () => {
    // Serialize cases safely for injection into WebView
    const markersJson = JSON.stringify(plannedCases.map(c => ({
      id: c.id,
      title: c.matrixRefNo || c.id,
      fullAddr: `${c.address || ''}, ${c.city || ''}, ${c.pincode || ''}`.trim(),
      fallbackAddr: `${c.city || ''} ${c.pincode || ''}`.trim(),
      pincode: c.pincode || ""
    })));

    const center = userLocation 
      ? `[${userLocation.coords.latitude}, ${userLocation.coords.longitude}]`
      : `[20.5937, 78.9629]`; // Default to India center

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet-routing-machine@latest/dist/leaflet-routing-machine.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <script src="https://unpkg.com/leaflet-routing-machine@latest/dist/leaflet-routing-machine.js"></script>
        <style>
          body { margin: 0; padding: 0; }
          #map { height: 100vh; width: 100vw; }
          .popup-content { font-family: sans-serif; padding: 5px; min-width: 150px; }
          .popup-title { font-weight: bold; color: #d32f2f; margin-bottom: 8px; display: block; font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
          .popup-actions { display: flex; gap: 8px; margin-top: 10px; }
          .popup-btn { 
            flex: 1; padding: 8px; border: none; border-radius: 4px; 
            color: white; font-weight: bold; font-size: 11px; cursor: pointer;
          }
          .btn-view { background: #007AFF; }
          .btn-remove { background: #ff4757; }
          .leaflet-tooltip { 
            font-weight: bold; color: #fff; background: #d32f2f; 
            border: 1px solid #b71c1c; border-radius: 4px; padding: 2px 6px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            font-size: 10px;
          }
          /* Navigation Directions Styling */
          .leaflet-routing-container { 
            display: ${isNavigating ? 'block' : 'none'}; 
            background: white; 
            position: fixed; 
            bottom: 10px; 
            left: 10px; 
            right: 10px; 
            max-height: 180px; 
            overflow-y: auto; 
            border-radius: 12px; 
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            font-family: sans-serif;
            z-index: 1000;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          const map = L.map('map', { zoomControl: false }).setView(${center}, ${userLocation ? 13 : 5});
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OSM'
          }).addTo(map);
          L.control.zoom({ position: 'topright' }).addTo(map);

          const redIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
          });

          const userPos = ${!!userLocation ? center : 'null'};
          let userMarker = userPos ? L.marker(userPos).addTo(map).bindPopup("<b>Your Location</b>") : null;

          const cases = ${markersJson};
          const waypoints = [];
          if (userPos) waypoints.push(L.latLng(userPos[0], userPos[1]));

          window.updateUserLocation = (lat, lon, follow) => {
            const newPos = L.latLng(lat, lon);
            if (userMarker) userMarker.setLatLng(newPos);
            if (follow) map.panTo(newPos);
            
            if (routingControl) {
              const wps = routingControl.getWaypoints();
              wps[0] = L.routing.waypoint(newPos);
              routingControl.setWaypoints(wps);
            }
          };

          const bounds = L.latLngBounds(userPos ? [userPos] : []);

          async function geocode(query) {
             if (!query || query.length < 3) return null;
             try {
                const response = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(query));
                const data = await response.json();
                return (data && data.length > 0) ? data[0] : null;
             } catch (e) { return null; }
          }

          let routingControl;
          async function processCases() {
            for (let i = 0; i < cases.length; i++) {
              const c = cases[i];
              let result = await geocode(c.fullAddr);
              
              // Fallback 1: Try City + Pincode
              if (!result) result = await geocode(c.fallbackAddr);
              // Fallback 2: Try just Pincode
              if (!result && c.pincode) result = await geocode(c.pincode);
                
              if (result) {
                  const lat = parseFloat(result.lat);
                  const lon = parseFloat(result.lon);
                  const latLng = L.latLng(lat, lon);
                  
                  waypoints.push(latLng);
                  bounds.extend(latLng);

                  const marker = L.marker(latLng, { icon: redIcon }).addTo(map);
                  
                  const popupHtml = \`
                    <div class="popup-content">
                      <span class="popup-title">REF: \${c.title}</span>
                      <span style="font-size:12px; color:#666;">\${c.fullAddr}</span>
                      <div class="popup-actions">
                        <button class="popup-btn btn-view" onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type: 'VIEW', id: '\${c.id}'}))">VIEW</button>
                        <button class="popup-btn btn-remove" onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type: 'REMOVE', id: '\${c.id}'}))">REMOVE</button>
                      </div>
                    </div>
                  \`;
                  marker.bindPopup(popupHtml);
                  marker.bindTooltip(c.title, { permanent: true, direction: 'top', offset: [0, -40] });
                }

              // Delay to respect OSM Nominatim rate limits (1 request per second)
              if (i < cases.length - 1) await new Promise(resolve => setTimeout(resolve, 1100));
            }

            if (waypoints.length > 1) {
              routingControl = L.Routing.control({
                waypoints: waypoints,
                routeWhileDragging: false,
                addWaypoints: false,
                draggableWaypoints: false,
                fitSelectedRoutes: true,
                showAlternatives: false,
                lineOptions: {
                  styles: [{ color: '#007AFF', opacity: 0.7, weight: 6 }]
                },
                createMarker: function() { return null; }
              }).addTo(map);
            }
            
            if (bounds.isValid()) {
              map.fitBounds(bounds, { padding: [50, 50] });
            }
          }

          processCases();
        </script>
      </body>
      </html>
    `;
  };

  return (
    <LinearGradient colors={["#FF9933", "#FFFFFF", "#138808"]} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Field Dispatch Map</Text>
        <TouchableOpacity onPress={handleEndDay} style={styles.endDayButton}>
          <Ionicons name="moon-outline" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      <View style={styles.mapContainer}>
        <WebView 
          ref={webviewRef}
          originWhitelist={['*']}
          source={{ html: getMapHtml() }} 
          style={styles.map}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          onMessage={(event) => {
            try {
              const msg = JSON.parse(event.nativeEvent.data);
              if (msg.type === 'VIEW') navigation.navigate("CaseDetail", { caseId: msg.id });
              if (msg.type === 'REMOVE') removeFromPlan(msg.id);
            } catch (e) {}
          }}
        />
        <View style={styles.mapOverlayHint}>
            <Text style={styles.mapOverlayText}>
              {plannedCases.length} Target Locations
            </Text>
        </View>
      </View>

      {plannedCases.length > 0 && (
        <TouchableOpacity 
          style={[styles.navToggleButton, isNavigating && { backgroundColor: '#ff4757' }]} 
          onPress={() => setIsNavigating(!isNavigating)}
        >
          <Ionicons name={isNavigating ? "stop-circle" : "navigate"} size={24} color="#fff" />
          <Text style={styles.navToggleText}>{isNavigating ? "Stop Navigation" : "Start Trip"}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.bottomButton} onPress={() => setModalVisible(true)}>
        <Text style={styles.bottomButtonText}>Schedule Work</Text>
        <Ionicons name="chevron-up" size={20} color="#fff" />
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Case</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={openCases}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalItem} onPress={() => addToPlan(item)}>
                  <View style={{flex: 1}}>
                    <Text style={styles.modalItemTitle}>{item.matrixRefNo || item.id}</Text>
                    <Text style={styles.modalItemSub}>{item.candidateName}</Text>
                    <Text style={styles.modalItemAddress} numberOfLines={1}>{item.address}</Text>
                  </View>
                  <Ionicons name="add-circle" size={28} color="#007AFF" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.emptyModalText}>No open cases found.</Text>}
            />
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
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  backButton: { marginRight: 15 },
  title: { fontSize: 20, fontWeight: "bold", color: "#333" },
  endDayButton: { marginLeft: 'auto' },
  
  listContent: { padding: 20, paddingBottom: 100 },
  taskItem: {
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    overflow: "hidden",
  },
  priorityBadge: {
    backgroundColor: "#fff",
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  priorityText: { color: "#000", fontWeight: "bold", fontSize: 16 },
  taskTextContainer: { flex: 1 },
  taskTitle: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  taskSub: { color: "#ccc", fontSize: 14 },
  taskAddress: { color: "#aaa", fontSize: 12, marginTop: 2 },
  emptyText: { color: "#333", textAlign: "center", marginTop: 40, fontSize: 16, fontWeight: "bold" },
  bottomButton: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#000080",
    padding: 20,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  bottomButtonText: { color: "#fff", fontSize: 18, fontWeight: "bold", marginRight: 10 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalContent: { backgroundColor: "#fff", height: "50%", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15, borderBottomWidth: 1, borderBottomColor: "#eee", paddingBottom: 10 },
  modalTitle: { fontSize: 18, fontWeight: "bold", color: "#333" },
  modalItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  modalItemTitle: { fontSize: 16, fontWeight: "bold", color: "#333" },
  modalItemSub: { fontSize: 14, color: "#666" },
  modalItemAddress: { fontSize: 12, color: "#888" },
  emptyModalText: { textAlign: "center", marginTop: 20, color: "#666" },

  mapContainer: {
    flex: 1,
    backgroundColor: '#eee',
  },
  map: {
    flex: 1,
  },
  mapOverlayHint: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  mapOverlayText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  navToggleButton: {
    position: 'absolute',
    top: 120,
    right: 20,
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 25,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  navToggleText: { color: '#fff', fontWeight: 'bold', marginLeft: 8 },
});