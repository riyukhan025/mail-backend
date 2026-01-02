#!/bin/bash
set -e

# Enable new architecture for react-native-reanimated and react-native-worklets
echo "newArchEnabled=true" >> "$EAS_BUILD_WORKINGDIR/android/gradle.properties"
echo "✓ Enabled newArchEnabled in gradle.properties"
