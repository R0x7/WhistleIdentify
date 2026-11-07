#!/usr/bin/env bash
# Builds the Android APK: wraps the web app with Capacitor, then runs Gradle.
#
# Requires Node 22+, JDK 21 and the Android SDK (ANDROID_HOME or ANDROID_SDK_ROOT).
# Optional env:
#   VERSION_CODE  integer that increases every build (CI uses the run number)
#   VERSION_NAME  human-readable version (default 1.0.<VERSION_CODE>)
# Output: build/whistle-identify.apk
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0.${VERSION_CODE}}"

node scripts/build-web.js

# The native project is generated from Capacitor's template rather than committed.
if [ ! -d android ]; then
  npx cap add android
fi
npx cap sync android

# The app needs the microphone. Capacitor's WebView asks for this runtime
# permission when the page calls getUserMedia, but it must be declared too.
MANIFEST=android/app/src/main/AndroidManifest.xml
for perm in RECORD_AUDIO MODIFY_AUDIO_SETTINGS; do
  if ! grep -q "android.permission.${perm}" "$MANIFEST"; then
    sed -i "s#</manifest>#    <uses-permission android:name=\"android.permission.${perm}\" />\n</manifest>#" "$MANIFEST"
  fi
done

# Sign with the repo's fixed debug key (ci/debug.keystore) so every build,
# local or CI, installs over the previous one instead of being rejected.
if ! grep -q "ci/debug.keystore" "android/app/build.gradle"; then
  sed -i '0,/^android {/s##android {\n    signingConfigs {\n        debug {\n            storeFile file("../../ci/debug.keystore")\n            storePassword "android"\n            keyAlias "androiddebugkey"\n            keyPassword "android"\n        }\n    }#' android/app/build.gradle
fi

# Stamp the version so each build installs over the previous one.
GRADLE=android/app/build.gradle
sed -i -E "s/versionCode [0-9]+/versionCode ${VERSION_CODE}/; s/versionName \"[^\"]*\"/versionName \"${VERSION_NAME}\"/" "$GRADLE"

(cd android && ./gradlew --no-daemon assembleDebug)

mkdir -p build
cp android/app/build/outputs/apk/debug/app-debug.apk build/whistle-identify.apk
echo "APK ready: build/whistle-identify.apk (version ${VERSION_NAME}, code ${VERSION_CODE})"
