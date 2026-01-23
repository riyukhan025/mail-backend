import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { captureRef } from "react-native-view-shot";

export default function CameraGPSScreen({ navigation, route }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [hasLocationPermission, setHasLocationPermission] = useState(null);
  const [flash, setFlash] = useState("off");
  const [facing, setFacing] = useState("back");
  const cameraRef = useRef(null);
  const snapshotRef = useRef(null);

  const { onPhotosCapture, category } = route.params || {};

  const [currentLocation, setCurrentLocation] = useState(null);
  const [currentAddress, setCurrentAddress] = useState("Fetching location...");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [zoom, setZoom] = useState(0); // 👈 ZOOM
  const [previewUri, setPreviewUri] = useState(null);
  const [processing, setProcessing] = useState(false);

  /* ---------------- Permissions ---------------- */
  useEffect(() => {
    (async () => {
      if (permission && !permission.granted) {
        await requestPermission();
      }
      const locStatus = await Location.requestForegroundPermissionsAsync();
      setHasLocationPermission(locStatus.status === "granted");
    })();
  }, [permission]);

  /* ---------------- Clock ---------------- */
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  /* ---------------- GPS Tracking ---------------- */
  useEffect(() => {
    let subscription;
    const startTracking = async () => {
      if (hasLocationPermission) {
        try {
          const lastKnown = await Location.getLastKnownPositionAsync();
          if (lastKnown) handleLocationUpdate(lastKnown);

          subscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.High,
              timeInterval: 2000,
              distanceInterval: 5,
            },
            handleLocationUpdate
          );
        } catch (e) {
          setCurrentAddress("Location unavailable");
        }
      }
    };
    startTracking();
    return () => subscription && subscription.remove();
  }, [hasLocationPermission]);

  const handleLocationUpdate = async (loc) => {
    setCurrentLocation(loc);
    try {
      const [addr] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      if (addr) {
        const addressStr = [
          addr.name,
          addr.street,
          addr.city,
          addr.region,
          addr.postalCode,
        ]
          .filter(Boolean)
          .join(", ");
        setCurrentAddress(addressStr);
      }
    } catch {
      setCurrentAddress("Address unavailable");
    }
  };

  /* ---------------- Capture & Burn Logic ---------------- */
  const takePicture = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: true,
      });
      setPreviewUri(photo.uri); // Trigger render of snapshot view
    } catch (err) {
      console.error("Capture error:", err);
      setProcessing(false);
    }
  };

  useEffect(() => {
    if (previewUri) {
      const processSnapshot = async () => {
        try {
          // Wait for render - increased delay for stability
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const uri = await captureRef(snapshotRef, {
            format: "jpg",
            quality: 0.8,
            result: "tmpfile",
          });

          const finalImage = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: 1280 } }],
            { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
          );

          const newPhoto = {
            uri: finalImage.uri,
            category: category || "general",
            geotag: currentLocation
              ? {
                  latitude: currentLocation.coords.latitude,
                  longitude: currentLocation.coords.longitude,
                }
              : null,
            timestamp: currentTime.toLocaleString(),
            address: currentAddress,
          };

          if (onPhotosCapture) await onPhotosCapture([newPhoto]);
          navigation.goBack();
        } catch (e) {
          console.error("Snapshot failed:", e);
          // Fallback to raw photo if snapshot fails
          setPreviewUri(null);
          setProcessing(false);
          Alert.alert("Error", "Failed to process photo overlay. Please try again.");
        } finally {
          // setProcessing(false) is handled by navigation unmount or error reset
        }
      };
      processSnapshot();
    }
  }, [previewUri]);

  /* ---------------- UI helpers ---------------- */
  const toggleFlash = () => setFlash((f) => (f === "off" ? "on" : "off"));
  const toggleCameraFacing = () =>
    setFacing((f) => (f === "back" ? "front" : "back"));

  const handleZoom = (direction) => {
    setZoom((z) =>
      direction === "in"
        ? Math.min(z + 0.1, 1)
        : Math.max(z - 0.1, 0)
    );
  };

  if (!permission || !permission.granted)
    return <View style={styles.container}><Text style={styles.text}>Requesting permissions…</Text></View>;

  if (hasLocationPermission === false)
    return <View style={styles.container}><Text style={styles.text}>Location permission required</Text></View>;

  const renderOverlay = () => (
    <View style={styles.overlay}>
      <Text style={styles.overlayText}>{currentTime.toLocaleString()}</Text>
      <Text style={styles.overlayText}>
        {currentLocation
          ? `${currentLocation.coords.latitude.toFixed(6)}, ${currentLocation.coords.longitude.toFixed(6)}`
          : "GPS..."}
      </Text>
      <Text style={styles.overlayText}>{currentAddress}</Text>
    </View>
  );

  const renderControls = () => (
    <View style={styles.controlsContainer}>
      <TouchableOpacity style={styles.iconButton} onPress={toggleCameraFacing}>
        <Ionicons name="camera-reverse" size={28} color="white" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.iconButton} onPress={() => handleZoom("out")}>
        <Ionicons name="remove" size={28} color="white" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
        <View style={styles.captureInner} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.iconButton} onPress={() => handleZoom("in")}>
        <Ionicons name="add" size={28} color="white" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.iconButton} onPress={toggleFlash}>
        <Ionicons name={flash === "on" ? "flash" : "flash-off"} size={28} color="white" />
      </TouchableOpacity>
    </View>
  );

  /* ---------------- RENDER ---------------- */
  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        flash={flash}
        zoom={zoom}
      >
        {!previewUri && renderOverlay()}
        {!previewUri && renderControls()}
      </CameraView>

      {previewUri && (
        <View style={styles.fullScreenCapture}>
          <View style={{ flex: 1 }} ref={snapshotRef} collapsable={false}>
            <Image source={{ uri: previewUri }} style={{ flex: 1 }} />
            {renderOverlay()}
          </View>
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={{ color: "white", marginTop: 10, fontWeight: "bold" }}>Processing...</Text>
          </View>
        </View>
      )}
    </View>
  );
}

/* ---------------- STYLES ---------------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "black" },
  camera: { flex: 1 },
  text: { color: "white", marginTop: 50, textAlign: "center" },

  overlay: {
    position: "absolute",
    top: 40,
    left: 20,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.35)",
    padding: 10,
    borderRadius: 6,
  },
  overlayText: {
    color: "white",
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 3,
  },

  controlsContainer: {
    position: "absolute",
    bottom: 25,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 10,
  },

  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(255,255,255,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  captureInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "white",
  },

  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  fullScreenCapture: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "black",
    zIndex: 20,
  },
});
