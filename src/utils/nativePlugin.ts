/**
 * nativePlugin.ts
 *
 * Registers the VisionCamera Frame Processor Plugin that bridges to the
 * native C++ OpenCV detection code (MarkerFrameProcessorPlugin.cpp).
 *
 * KEY CHANGE from previous version:
 *   The plugin handle is lazily initialized inside the worklet function
 *   rather than at module load time. This avoids a crash when the native
 *   module isn't ready yet (e.g. during Fast Refresh in dev mode).
 *
 * VisionCamera v4 plugin API:
 *   VisionCameraProxy.initFrameProcessorPlugin(name, options) → FrameProcessorPlugin
 *   plugin.call(frame, ...args) → unknown  (synchronous, worklet context)
 */
import {VisionCameraProxy, type Frame} from 'react-native-vision-camera';

const PLUGIN_NAME = 'detectMarkerFrame';

// Lazily initialized — set once on first call, null until native is ready.
let _plugin: ReturnType<typeof VisionCameraProxy.initFrameProcessorPlugin> | null =
  null;

function getPlugin() {
  if (_plugin == null) {
    _plugin = VisionCameraProxy.initFrameProcessorPlugin(PLUGIN_NAME, {});
    if (!_plugin) {
      console.warn(
        `[NativePlugin] "${PLUGIN_NAME}" not found. ` +
          'Rebuild after linking the native module.',
      );
    }
  }
  return _plugin;
}

/**
 * detectMarkerFrame
 *
 * Called synchronously on the camera thread (Worklet context).
 * Passes the raw Frame to the C++ plugin for OpenCV processing.
 *
 * Returns a plain object:
 *   { found: boolean; base64Jpeg?: string; corners?: {x,y}[] }
 */
export function detectMarkerFrame(frame: Frame): unknown {
  'worklet';
  const plugin = getPlugin();
  if (!plugin) {
    return {found: false};
  }
  return plugin.call(frame);
}
