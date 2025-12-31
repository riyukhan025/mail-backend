import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function CameraGPSScreen({ navigation, route }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [hasLocationPermission, setHasLocationPermission] = useState(null);
  const [flash, setFlash] = useState("off");
  const cameraRef = useRef(null);
  const { onPhotosCapture, category } = route.params || {};
  const [currentLocation, setCurrentLocation] = useState(null);
  const [currentAddress, setCurrentAddress] = useState("Fetching location...");
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    (async () => {
      if (permission && !permission.granted) {
        await requestPermission();
      }
      const locStatus = await Location.requestForegroundPermissionsAsync();
      setHasLocationPermission(locStatus.status === "granted");
    })();
  }, [permission]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let subscription;
    const startTracking = async () => {
      if (hasLocationPermission) {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          handleLocationUpdate(loc);
          subscription = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 10 },
            (location) => handleLocationUpdate(location)
          );
        } catch (e) {
          console.log("Location error:", e);
          setCurrentAddress("Location unavailable");
        }
      }
    };
    startTracking();
    return () => { if (subscription) subscription.remove(); };
  }, [hasLocationPermission]);

  const handleLocationUpdate = async (loc) => {
    setCurrentLocation(loc);
    try {
      const [addr] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude
      });
      if (addr) {
        const addressStr = [addr.name, addr.street, addr.city, addr.region, addr.postalCode].filter(Boolean).join(", ");
        setCurrentAddress(addressStr);
      }
    } catch (e) {
      console.log("Geocode error:", e);
    }
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync();
        let location = currentLocation;
        if (!location) {
           try { location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); } catch(e){}
        }
        
        const newPhoto = {
          uri: photo.uri,
          category: category || "general",
          geotag: location ? {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          } : null,
          timestamp: currentTime.toLocaleString(),
          address: currentAddress,
        };

        if (onPhotosCapture) {
          onPhotosCapture([newPhoto]);
        }
        navigation.goBack();
      } catch (error) {
        console.error("Error taking picture:", error);
      }
    }
  };

  const toggleFlash = () => {
    setFlash((current) => (current === "off" ? "on" : "off"));
  };

  if (!permission || !permission.granted) return <View style={styles.container}><Text style={styles.text}>Requesting permissions...</Text></View>;
  if (hasLocationPermission === false) return <View style={styles.container}><Text style={styles.text}>Location permission required</Text></View>;

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} ref={cameraRef} facing="back" flash={flash}>
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>{currentTime.toLocaleString()}</Text>
          <Text style={styles.overlayText}>
            {currentLocation ? `${currentLocation.coords.latitude.toFixed(5)}, ${currentLocation.coords.longitude.toFixed(5)}` : "GPS..."}
          </Text>
          <Text style={styles.overlayText}>{currentAddress}</Text>
        </View>
        <View style={styles.controlsContainer}>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()}>
             <Ionicons name="close" size={30} color="white" />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
            <View style={styles.captureInner} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconButton} onPress={toggleFlash}>
            <Ionicons name={flash === "on" ? "flash" : "flash-off"} size={30} color="white" />
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  camera: { flex: 1 },
  text: { color: 'white', marginTop: 50, textAlign: 'center' },
  overlay: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 15,
    borderRadius: 10,
  },
  overlayText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
    textShadowColor: 'black',
    textShadowRadius: 2,
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'white',
  },
  iconButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  }
});