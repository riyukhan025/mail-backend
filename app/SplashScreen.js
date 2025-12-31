import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import {
    Animated,
    Dimensions,
    Easing,
    StyleSheet,
    Text,
    View
} from "react-native";

const { width, height } = Dimensions.get("window");

export default function SplashGoldCircuit() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const loaderProgress = useRef(new Animated.Value(0)).current;
  const particleAnims = useRef(
    Array.from({ length: 20 }).map(() => ({
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    // Logo entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // Single horizontal spin
    Animated.timing(rotateAnim, {
      toValue: 1,
      duration: 1500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    // Glow pulse effect
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Floating particles animation
    particleAnims.forEach((anim, i) => {
      const delay = i * 150;
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(anim.y, {
              toValue: -height,
              duration: 8000 + Math.random() * 4000,
              easing: Easing.linear,
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(anim.opacity, {
                toValue: 0.6,
                duration: 1000,
                useNativeDriver: true,
              }),
              Animated.timing(anim.opacity, {
                toValue: 0,
                duration: 2000,
                delay: 5000,
                useNativeDriver: true,
              }),
            ]),
            Animated.sequence([
              Animated.timing(anim.scale, {
                toValue: 1,
                duration: 1000,
                useNativeDriver: true,
              }),
              Animated.timing(anim.scale, {
                toValue: 0,
                duration: 1000,
                delay: 6000,
                useNativeDriver: true,
              }),
            ]),
          ]),
        ])
      ).start();
    });

    // Progress bar
    Animated.timing(loaderProgress, {
      toValue: 1,
      duration: 3000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, []);

  const logoRotateY = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  const glowScale = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.2],
  });

  const loaderWidth = loaderProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.container}>
      {/* Multi-color soft gradient background */}
      <LinearGradient
        colors={["#ffe5b4", "#ffd9a5", "#fff0d6", "#ffeac0"]}
        start={[0, 0]}
        end={[1, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Radial glow effect */}
      <Animated.View
        style={[
          styles.radialGlow,
          {
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      />

      {/* Floating particles */}
      {particleAnims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.particle,
            {
              left: (i * 47) % width,
              transform: [
                { translateY: anim.y },
                { scale: anim.scale },
              ],
              opacity: anim.opacity,
            },
          ]}
        />
      ))}

      {/* Decorative corner elements */}
      <View style={styles.cornerTopLeft} />
      <View style={styles.cornerTopRight} />
      <View style={styles.cornerBottomLeft} />
      <View style={styles.cornerBottomRight} />

      {/* Main content */}
      <Animated.View
        style={[
          styles.contentContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Logo with glow */}
        <View style={styles.logoWrapper}>
          <Animated.View
            style={[
              styles.logoGlow,
              {
                opacity: glowOpacity,
              },
            ]}
          />
          <Animated.Image
            source={require("../assets/logo.png")}
            style={[
              styles.logo,
              {
                transform: [
                  { perspective: 1000 },
                  { rotateY: logoRotateY },
                ],
              },
            ]}
            resizeMode="contain"
          />
        </View>

        {/* Decorative line above text */}
        <View style={styles.decorativeLine} />

        {/* Brand text */}
        <Text style={styles.brand}>SPACE SOLUTIONS</Text>
        <Text style={styles.subtitle}>Premium Verification • High Assurance</Text>

        {/* Decorative line below text */}
        <View style={styles.decorativeLine} />
      </Animated.View>

      {/* Progress bar */}
      <View style={styles.loaderTrack}>
        <Animated.View style={[styles.loaderFill, { width: loaderWidth }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  radialGlow: {
    position: "absolute",
    width: width * 1.2,
    height: width * 1.2,
    borderRadius: width * 0.6,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    shadowColor: "#ffd700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 100,
  },
  particle: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ffd700",
    shadowColor: "#ffd700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  cornerTopLeft: {
    position: "absolute",
    top: 40,
    left: 30,
    width: 60,
    height: 60,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: "rgba(255, 215, 0, 0.4)",
  },
  cornerTopRight: {
    position: "absolute",
    top: 40,
    right: 30,
    width: 60,
    height: 60,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: "rgba(255, 215, 0, 0.4)",
  },
  cornerBottomLeft: {
    position: "absolute",
    bottom: 40,
    left: 30,
    width: 60,
    height: 60,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: "rgba(255, 215, 0, 0.4)",
  },
  cornerBottomRight: {
    position: "absolute",
    bottom: 40,
    right: 30,
    width: 60,
    height: 60,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: "rgba(255, 215, 0, 0.4)",
  },
  contentContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrapper: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
  },
  logoGlow: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(255, 215, 0, 0.2)",
    shadowColor: "#ffd700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 40,
  },
  logo: {
    width: 180,
    height: 180,
    backfaceVisibility: "hidden",
  },
  decorativeLine: {
    width: 200,
    height: 2,
    backgroundColor: "rgba(255, 215, 0, 0.6)",
    marginVertical: 20,
    shadowColor: "#ffd700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  brand: {
    color: "#fff8dc",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 6,
    textShadowColor: "rgba(255, 215, 0, 0.5)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  subtitle: {
    color: "rgba(255, 248, 220, 0.8)",
    fontSize: 13,
    marginTop: 8,
    letterSpacing: 2.5,
    textShadowColor: "rgba(255, 215, 0, 0.3)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  loaderTrack: {
    position: "absolute",
    bottom: 80,
    width: width * 0.7,
    height: 4,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderRadius: 2,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  loaderFill: {
    height: 4,
    backgroundColor: "#ffd700",
    shadowColor: "#ffd700",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
});
