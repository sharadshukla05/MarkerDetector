# React Native — keep JSI bridge classes
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# VisionCamera — keep frame processor plugin registrations
-keep class com.mrousavy.camera.** { *; }

# Worklets — keep worklet runtime
-keep class com.worklets.** { *; }

# OpenCV — keep JNI entry points
-keep class org.opencv.** { *; }

# Keep our native module class
-keep class com.markerdetector.** { *; }
