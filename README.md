# Marker Detector

A high-performance React Native application for real-time marker detection using **OpenCV** and **VisionCamera v4**.

## 🚀 Features
- **Real-time Detection**: Powered by a native C++ Frame Processor for ultra-low latency.
- **OpenCV Integration**: Uses OpenCV 4.9.0 via Android Prefab for robust image processing.
- **VisionCamera v4**: Leverages the latest camera APIs for high-frame-rate capture.
- **Native Performance**: Core detection logic implemented in optimized C++.

## 🛠️ Tech Stack
- **Framework**: React Native 0.75+
- **Native Layer**: C++ (CMake), Android NDK
- **Libraries**: OpenCV, VisionCamera, Worklets-core

## 📦 Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/sharadshukla05/MarkerDetector.git
   cd MarkerDetector
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

## 🏗️ Building for Android

1. **Prerequisites**:
   - Android Studio & SDK
   - JDK 17+
   - Android NDK (3.22.1 compatible)

2. **Run the app**:
   ```bash
   npm run android
   ```

## 📂 Project Structure
- `android/app/src/main/cpp/`: Native C++ detection logic and OpenCV bridge.
- `src/screens/`: Camera and Gallery UI.
- `src/utils/`: Frame processor and plugin registration.

## 📝 Notes
This project is configured to use a short path (e.g., `C:\MD`) during build to bypass Windows path length limitations for native C++ artifacts.
