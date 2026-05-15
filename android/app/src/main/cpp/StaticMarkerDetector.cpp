#include <jni.h>
#include <opencv2/opencv.hpp>
#include <android/log.h>

#define TAG "MarkerDetector"

extern "C" {
    // Example JNI function to check if OpenCV is working
    JNIEXPORT jstring JNICALL
    Java_com_markerdetector_MainActivity_stringFromJNI(JNIEnv* env, jobject /* this */) {
        std::string hello = "OpenCV Version: " + std::string(CV_VERSION);
        return env->NewStringUTF(hello.c_str());
    }
}
