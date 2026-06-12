import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import ViewShot from "react-native-view-shot";

export default function CameraGPSScreen({ navigation, route }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [hasLocationPermission, setHasLocationPermission] = useState(null);
  const [flash, setFlash] = useState("off");
  const [facing, setFacing] = useState("back");
  const cameraRef = useRef(null);
  const snapshotRef = useRef(null);
  const captureMetaRef = useRef({ time: null, location: null, address: null });
  const isCapturingRef = useRef(false);

  const { category, caseId } = route.params || {};

  const [currentLocation, setCurrentLocation] = useState(null);
  const [currentAddress, setCurrentAddress] = useState("Fetching location...");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [zoom, setZoom] = useState(0); // 👈 ZOOM
  const [previewUri, setPreviewUri] = useState(null);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isLayoutReady, setIsLayoutReady] = useState(false);
  const [processing, setProcessing] = useState(false);

  /* ---------------- Permissions ---------------- */
  useEffect(() => {
    (async () => {
      if (permission && permission.canAskAgain === false) return;
      if (!permission?.granted) await requestPermission();
    })();
  }, [permission?.granted, permission?.canAskAgain, requestPermission]);

  useEffect(() => {
    (async () => {
      try {
        const locStatus = await Location.requestForegroundPermissionsAsync();
        setHasLocationPermission(locStatus.status === "granted");
      } catch {
        setHasLocationPermission(false);
      }
    })();
  }, []);

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
    if (processing || isCapturingRef.current) { // Check both processing state and ref
      console.log("Capture already in progress or processing, ignoring.");
      return;
    }
    if (!cameraRef.current) {
      Alert.alert("Error", "Camera not ready. Please wait.");
      return;
    }
    setProcessing(true); // Show processing overlay immediately
    console.log("[CameraGPSScreen] Starting picture capture...");
    try {
      setIsImageLoaded(false);
      setIsLayoutReady(false);
      captureMetaRef.current = {
        time: new Date(),
        location: currentLocation,
        address: currentAddress,
      };
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
    if (previewUri && isImageLoaded && isLayoutReady && !isCapturingRef.current) {
      const processSnapshot = async () => {
        try {
          isCapturingRef.current = true;
          
          // Small delay to ensure the native layer has finished rendering the image pixels
          await new Promise((resolve) => setTimeout(resolve, 150));

          const viewShot = snapshotRef.current;
          if (!viewShot?.capture) throw new Error("Snapshot view is not ready");

          const uri = await viewShot.capture();

          const finalImage = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: 1024 } }],
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
          );

          const meta = captureMetaRef.current || {};
          const capturedTime = meta.time ? meta.time : new Date();
          const capturedLocation = meta.location || null;
          const capturedAddress = meta.address || "Address unavailable";

          const newPhoto = {
            uri: finalImage.uri,
            category: category || "general",
            geotag: capturedLocation
              ? {
                  latitude: capturedLocation.coords.latitude,
                  longitude: capturedLocation.coords.longitude,
                }
              : null,
            timestamp: capturedTime.toLocaleString(),
            address: capturedAddress,
          };
          console.log("[CameraGPSScreen] Photo object prepared:", newPhoto);

          // Return photos via serializable params (avoid functions in navigation state)
          console.log("[CameraGPSScreen] Navigating back to CaseDetail...");
          navigation.navigate({
            name: "CaseDetail",
            params: { caseId, newPhotos: [newPhoto] },
            merge: true,
          });
        } catch (e) {
          console.error("Snapshot failed:", e);
          // Fallback to raw photo if snapshot fails
          setPreviewUri(null);
          Alert.alert("Error", "Failed to process photo overlay. Please try again.");
        } finally {
          console.log("[CameraGPPScreen] Resetting processing states.");
          isCapturingRef.current = false; // Always reset this ref
          setProcessing(false); // Always hide processing overlay
        }
      };
      processSnapshot();
    }
  }, [previewUri, isImageLoaded, isLayoutReady, category, caseId, navigation]);

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

  if (!permission)
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Loading camera permissions…</Text>
      </View>
    );

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Ionicons name="camera-outline" size={56} color="#fff" style={{ marginTop: 50, opacity: 0.9 }} />
        <Text style={styles.text}>Camera permission is required</Text>
        <TouchableOpacity
          style={[styles.permissionButton, { backgroundColor: "rgba(96,165,250,0.25)", borderColor: "rgba(96,165,250,0.8)" }]}
          onPress={async () => {
            try {
              await requestPermission();
            } catch {}
          }}
        >
          <Text style={styles.permissionButtonText}>Grant Camera Access</Text>
        </TouchableOpacity>
        {permission.canAskAgain === false && (
          <TouchableOpacity
            style={[styles.permissionButton, { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.35)" }]}
            onPress={async () => {
              try {
                if (Platform.OS !== "web") await Linking.openSettings();
              } catch {}
            }}
          >
            <Text style={styles.permissionButtonText}>Open Settings</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={{ marginTop: 16, padding: 8 }} onPress={() => navigation.goBack()}>
          <Text style={{ color: "rgba(255,255,255,0.85)" }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (hasLocationPermission === false)
    return (
      <View style={styles.container}>
        <Ionicons name="location-outline" size={56} color="#fff" style={{ marginTop: 50, opacity: 0.9 }} />
        <Text style={styles.text}>Location permission required</Text>
        <TouchableOpacity
          style={[styles.permissionButton, { backgroundColor: "rgba(96,165,250,0.25)", borderColor: "rgba(96,165,250,0.8)" }]}
          onPress={async () => {
            try {
              const locStatus = await Location.requestForegroundPermissionsAsync();
              setHasLocationPermission(locStatus.status === "granted");
            } catch {}
          }}
        >
          <Text style={styles.permissionButtonText}>Grant Location Access</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 16, padding: 8 }} onPress={() => navigation.goBack()}>
          <Text style={{ color: "rgba(255,255,255,0.85)" }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );

  const renderOverlay = () => (
    (() => {
      const meta = previewUri ? captureMetaRef.current : null;
      const overlayTime = meta?.time ? meta.time : currentTime;
      const overlayLocation = meta?.location ? meta.location : currentLocation;
      const overlayAddress = meta?.address ? meta.address : currentAddress;

      return (
    <View style={styles.overlay}>
      <Text style={styles.overlayText}>{overlayTime.toLocaleString()}</Text>
      <Text style={styles.overlayText}>
        {overlayLocation
          ? `${overlayLocation.coords.latitude.toFixed(6)}, ${overlayLocation.coords.longitude.toFixed(6)}`
          : "GPS..."}
      </Text>
      <Text style={styles.overlayText}>{overlayAddress}</Text>
    </View>
      );
    })()
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
          <ViewShot
            ref={snapshotRef}
            style={{ flex: 1 }}
            options={{ format: "jpg", quality: 0.7, result: "tmpfile" }}
            onLayout={() => {
              setIsLayoutReady(true);
            }}
          >
            <Image source={{ uri: previewUri }} style={{ flex: 1 }} onLoad={() => {
              console.log("[CameraGPSScreen] Image loaded into ViewShot.");
              setIsImageLoaded(true);
            }} />
            {renderOverlay()}
          </ViewShot>
          {processing && ( // Only show processing overlay if processing is true
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={{ color: "white", marginTop: 10, fontWeight: "bold" }}>Processing...</Text>
            </View>
          )}
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
  permissionButton: {
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
  },
  permissionButtonText: { color: "#fff", fontWeight: "800" },

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
