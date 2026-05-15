package com.markerdetector

import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy
import com.mrousavy.camera.core.FrameInvalidError
import android.media.Image
import java.nio.ByteBuffer

class MarkerFrameProcessorPlugin(proxy: VisionCameraProxy, options: Map<String, Any?>?) : FrameProcessorPlugin() {

    init {
        System.loadLibrary("MarkerDetector")
    }

    private external fun detectMarkerJNI(yBuffer: ByteBuffer, width: Int, height: Int, rowStride: Int): Map<String, Any?>?

    override fun callback(frame: Frame, arguments: Map<String, Any?>?): Any? {
        try {
            val image = frame.image
            
            // Android's Image format from camera is usually YUV_420_888
            val yPlane = image.planes[0]
            val yBuffer = yPlane.buffer
            val rowStride = yPlane.rowStride
            val width = image.width
            val height = image.height

            return detectMarkerJNI(yBuffer, width, height, rowStride)
        } catch (e: FrameInvalidError) {
            return null
        }
    }
}
