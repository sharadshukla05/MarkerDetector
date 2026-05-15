#include <jni.h>
#include <android/log.h>
#include <string>
#include <vector>
#include "MarkerProcessor.h"

#define LOG_TAG "MarkerPluginJNI"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

static MarkerDetection::MarkerProcessor g_processor;

extern "C"
JNIEXPORT jobject JNICALL
Java_com_markerdetector_MarkerFrameProcessorPlugin_detectMarkerJNI(JNIEnv *env, jobject thiz, jobject y_buffer, jint width, jint height, jint row_stride) {
    if (!y_buffer) {
        LOGE("Y buffer is null");
        return nullptr;
    }

    uint8_t* yData = static_cast<uint8_t*>(env->GetDirectBufferAddress(y_buffer));
    if (!yData) {
        LOGE("Failed to get direct buffer address");
        return nullptr;
    }

    MarkerDetection::MarkerResult res = g_processor.detect(yData, width, height, row_stride);

    // Create a Java HashMap to return the result
    jclass hashMapClass = env->FindClass("java/util/HashMap");
    jmethodID hashMapInit = env->GetMethodID(hashMapClass, "<init>", "()V");
    jmethodID hashMapPut = env->GetMethodID(hashMapClass, "put", "(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;");
    jobject resultMap = env->NewObject(hashMapClass, hashMapInit);

    jclass booleanClass = env->FindClass("java/lang/Boolean");
    jmethodID booleanValueOf = env->GetStaticMethodID(booleanClass, "valueOf", "(Z)Ljava/lang/Boolean;");

    env->CallObjectMethod(resultMap, hashMapPut, env->NewStringUTF("found"), env->CallStaticObjectMethod(booleanClass, booleanValueOf, res.found));

    if (res.found) {
        env->CallObjectMethod(resultMap, hashMapPut, env->NewStringUTF("base64Jpeg"), env->NewStringUTF(res.base64Jpeg.c_str()));
        
        jclass arrayListClass = env->FindClass("java/util/ArrayList");
        jmethodID arrayListInit = env->GetMethodID(arrayListClass, "<init>", "(I)V");
        jmethodID arrayListAdd = env->GetMethodID(arrayListClass, "add", "(Ljava/lang/Object;)Z");
        jobject cornersList = env->NewObject(arrayListClass, arrayListInit, (jint)res.corners.size());

        jclass doubleClass = env->FindClass("java/lang/Double");
        jmethodID doubleValueOf = env->GetStaticMethodID(doubleClass, "valueOf", "(D)Ljava/lang/Double;");

        for (const auto& pt : res.corners) {
            jobject ptMap = env->NewObject(hashMapClass, hashMapInit);
            env->CallObjectMethod(ptMap, hashMapPut, env->NewStringUTF("x"), env->CallStaticObjectMethod(doubleClass, doubleValueOf, (jdouble)pt.x));
            env->CallObjectMethod(ptMap, hashMapPut, env->NewStringUTF("y"), env->CallStaticObjectMethod(doubleClass, doubleValueOf, (jdouble)pt.y));
            env->CallBooleanMethod(cornersList, arrayListAdd, ptMap);
        }

        env->CallObjectMethod(resultMap, hashMapPut, env->NewStringUTF("corners"), cornersList);
    }

    return resultMap;
}
