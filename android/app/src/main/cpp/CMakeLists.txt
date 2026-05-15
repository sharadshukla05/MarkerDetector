cmake_minimum_required(VERSION 3.22.1)
project(MarkerDetector)

set(CMAKE_CXX_STANDARD 17)

# Enable Android Prefab support for automatic OpenCV linkage
find_package(OpenCV REQUIRED CONFIG)

# Define the native library
# We use MarkerProcessorJNI.cpp as the entry point from Kotlin
add_library(
    MarkerDetector
    SHARED
    MarkerProcessorJNI.cpp
    MarkerProcessor.cpp
)

# Link OpenCV and other necessary libraries
# We no longer need VisionCamera or ReactAndroid C++ headers/libraries
# as we are calling our JNI bridge directly from Kotlin.
target_link_libraries(
    MarkerDetector
    OpenCV::opencv_java4
    log
    android
)
