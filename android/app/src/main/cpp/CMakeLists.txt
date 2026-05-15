cmake_minimum_required(VERSION 3.22.1)
project(MarkerDetector)

set(CMAKE_CXX_STANDARD 17)

# Enable Android Prefab support for automatic OpenCV linkage
find_package(opencv_java4 REQUIRED CONFIG)

# Define the native library
add_library(
    MarkerDetector
    SHARED
    MarkerFrameProcessorPlugin.cpp
    MarkerProcessor.cpp
)

# Link OpenCV and other necessary libraries
target_link_libraries(
    MarkerDetector
    opencv_java4
    log
    android
    jnigraphics
)
