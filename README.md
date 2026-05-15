# MarkerDetector 📷

A React Native Android application that detects ArUco/square markers in real-time using the device camera, powered by **OpenCV 4.9.0** via a native JNI bridge and **VisionCamera v4** frame processors.

---

## 📥 Download APK

> **Install directly on your Android phone — no setup required!**

👉 [**Download APK from Google Drive**](https://drive.google.com/drive/folders/1pIrd88L7TQAvgdnFR-MIcZ288BkmK8_D)

### Installation Steps:
1. Download `app-universal-release.apk` from the link above.
2. On your Android phone, open the downloaded file.
3. If prompted, tap **"Allow from this source"** or **"Install anyway"**.
4. Tap **Install**.
5. Open **MarkerDetector** from your app drawer.

> ⚠️ Make sure "Install from unknown sources" is enabled in your phone settings.

---

## 🚀 Features

- 📸 **Real-time camera feed** using VisionCamera v4
- 🔲 **Marker detection** using OpenCV 4.9.0 native library
- ⚡ **Native JNI bridge** (C++ → Kotlin) for high-performance frame processing
- 🎨 **Skia canvas overlay** for drawing detected marker boundaries

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.75.4 |
| Camera | react-native-vision-camera v4 |
| Computer Vision | OpenCV 4.9.0 |
| Native Bridge | C++ JNI (NDK) |
| Canvas/Drawing | @shopify/react-native-skia |
| Animations | react-native-reanimated |
| Build System | Gradle 8.8 |

---

## 🏗️ Build from Source

### Prerequisites
- Node.js 18+
- Android Studio with NDK
- JDK 17
- Android SDK (API 33+)

### Steps

```bash
# Clone the repo
git clone https://github.com/sharadshukla45/MarkerDetector.git
cd MarkerDetector

# Install dependencies
npm install

# Build Android APK
cd android
.\gradlew assembleRelease
```

The APK will be at:
```
android/app/build/outputs/apk/release/app-universal-release.apk
```

### Run in Development Mode

```bash
# Start Metro bundler
npx react-native start

# In another terminal, forward the port
adb reverse tcp:8081 tcp:8081

# Install and launch
cd android
.\gradlew installDebug
```

---

## 📁 Project Structure

```
MarkerDetector/
├── android/
│   └── app/src/main/
│       ├── cpp/
│       │   ├── CMakeLists.txt              # Native build config
│       │   └── MarkerProcessorJNI.cpp      # OpenCV JNI bridge
│       └── java/com/markerdetector/
│           ├── MarkerFrameProcessorPlugin.kt  # VisionCamera plugin
│           ├── MarkerProcessorPackage.kt      # RN package registration
│           └── MainApplication.kt
├── src/                                    # React Native JS source
└── README.md
```

---

## 🔧 Key Architecture Decisions

- **JNI Bridge over C++ Plugin**: VisionCamera v4 removed C++ frame processor support, so detection is done in Kotlin calling native C++ via JNI.
- **Single Skia Project**: Removed duplicate `@shopify_react-native-skia` project definition that caused Gradle 8.8 implicit dependency errors.
- **Bundled Release APK**: JavaScript is bundled directly into the release APK — no Metro server required.

---

## 📄 License

MIT
