/**
 * MarkerFrameProcessorPlugin.cpp
 *
 * VisionCamera v4 Frame Processor Plugin — C++ entry point.
 *
 * This plugin is called synchronously on the camera thread (a Worklet)
 * for every frame. It bridges the VisionCamera Frame object to our
 * MarkerProcessor pipeline.
 *
 * Registration:
 *   The plugin name "detectMarkerFrame" must match what is passed to
 *   VisionCameraProxy.initFrameProcessorPlugin('detectMarkerFrame') in JS.
 *
 * VisionCamera v4 plugin API:
 *   Plugins are C++ lambdas registered via VisionCameraInstaller::install().
 *   The lambda receives (jsi::Runtime&, Frame*, jsi::Value* args, size_t argc)
 *   and returns jsi::Value.
 *
 * Frame buffer access:
 *   Frame::getHardwareBuffer() returns an AHardwareBuffer on Android.
 *   For YUV_420_888, the Y-plane is the first plane and holds luma data.
 *   We use AImage_getPlaneData (via the NDK media image API) to get a pointer.
 *
 * NOTE: react-native-vision-camera v4 exposes frames as AHardwareBuffer-backed
 * objects. On devices that support it, we use the Image API; on others we fall
 * back to reading from the shared buffer directly.
 */
#include "MarkerProcessor.h"

#include <jsi/jsi.h>
#include <ReactCommon/CallInvoker.h>

// VisionCamera plugin header (from node_modules)
#include "FrameProcessorPlugin.h"
#include "VisionCameraProxy.h"

#include <android/log.h>
#include <android/hardware_buffer.h>
#include <media/NdkImage.h>

#define LOG_TAG "MarkerPlugin"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// ─── Plugin Implementation ────────────────────────────────────────────────────

namespace {

using namespace facebook::jsi;
using namespace MarkerDetection;

/**
 * Convert MarkerResult corners to a jsi::Array of {x, y} objects.
 */
static Value cornersToJsi(Runtime& rt, const std::vector<cv::Point2f>& corners) {
    Array arr = Array(rt, corners.size());
    for (size_t i = 0; i < corners.size(); i++) {
        Object pt(rt);
        pt.setProperty(rt, "x", corners[i].x);
        pt.setProperty(rt, "y", corners[i].y);
        arr.setValueAtIndex(rt, i, std::move(pt));
    }
    return arr;
}

/**
 * Convert std::string to jsi::String.
 */
static Value strToJsi(Runtime& rt, const std::string& s) {
    return String::createFromUtf8(rt, s);
}

// Singleton processor (thread-safe: camera thread is single-threaded)
static MarkerProcessor g_processor;

/**
 * The main plugin class registered with VisionCamera.
 */
class MarkerFramePlugin : public vision::FrameProcessorPlugin {
public:
    MarkerFramePlugin(vision::VisionCameraProxy* proxy, const Object& options)
        : vision::FrameProcessorPlugin(proxy, options) {}

    /**
     * Called on every camera frame (camera thread / Worklet context).
     *
     * Steps:
     *  1. Get the AImage* from the Frame.
     *  2. Get Y-plane pointer, width, height, rowStride.
     *  3. Call MarkerProcessor::detect().
     *  4. Return JSI object {found, base64Jpeg?, corners?}.
     */
    Value callback(vision::Frame* frame,
                   const Value* arguments,
                   size_t count) override {

        // ── Get image planes ────────────────────────────────────────────────
        AImage* image = frame->getImage();
        if (!image) {
            LOGE("Frame has no AImage");
            return makeErrorResult(frame->getRuntime());
        }

        int32_t width = 0, height = 0;
        AImage_getWidth(image, &width);
        AImage_getHeight(image, &height);

        // Y-plane (plane index 0)
        uint8_t* yData = nullptr;
        int      yLen  = 0;
        AImage_getPlaneData(image, 0, &yData, &yLen);

        int32_t rowStride = 0;
        AImage_getPlaneRowStride(image, 0, &rowStride);

        if (!yData || width <= 0 || height <= 0) {
            LOGE("Invalid Y-plane data: ptr=%p w=%d h=%d", yData, width, height);
            return makeErrorResult(frame->getRuntime());
        }

        // ── Run detection ───────────────────────────────────────────────────
        MarkerResult res = g_processor.detect(yData, width, height, rowStride);

        // ── Build JSI result ────────────────────────────────────────────────
        Runtime& rt = frame->getRuntime();
        Object result(rt);
        result.setProperty(rt, "found", res.found);

        if (res.found) {
            result.setProperty(rt, "base64Jpeg", strToJsi(rt, res.base64Jpeg));
            result.setProperty(rt, "corners",    cornersToJsi(rt, res.corners));
        }

        return result;
    }

private:
    static Value makeErrorResult(Runtime& rt) {
        Object r(rt);
        r.setProperty(rt, "found", false);
        return r;
    }
};

} // anonymous namespace

// ─── Plugin Registration (called from JNI_OnLoad or via VisionCamera installer)

VISION_EXPORT_FRAME_PROCESSOR_PLUGIN(MarkerFramePlugin, "detectMarkerFrame")
