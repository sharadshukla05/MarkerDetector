package com.markerdetector

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry

class MarkerProcessorPackage : ReactPackage {
    init {
        // Register the Vision Camera Frame Processor Plugin
        FrameProcessorPluginRegistry.addFrameProcessorPlugin("detectMarkerFrame") { proxy, options ->
            MarkerFrameProcessorPlugin(proxy, options)
        }
    }

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return mutableListOf()
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return mutableListOf()
    }
}
