/**
 * frameProcessor.ts
 *
 * VisionCamera v4 frame processor hook for marker detection.
 *
 * CRITICAL FIX from previous version:
 *   JavaScript `useRef` objects live on the JS heap and are NOT accessible
 *   inside Worklets (which run on a separate C++ thread). The previous code
 *   tried to read `isEnabledRef.current` and `lastDetectionTime.current`
 *   inside the worklet — this would either read stale data or crash.
 *
 *   Solution: Use Reanimated `useSharedValue` for all state that the worklet
 *   needs to read/write. Shared values live in a memory space accessible from
 *   both threads.
 *
 * THROTTLE APPROACH:
 *   `lastDetectionTs` is a SharedValue<number> holding the timestamp of the
 *   last successful detection. We compare against `performance.now()` inside
 *   the worklet (Date.now() is not available in Worklet context in some RN
 *   versions; performance.now() is always safe).
 */
import {useCallback} from 'react';
import {runOnJS, useSharedValue} from 'react-native-reanimated';
import {useFrameProcessor, type Frame} from 'react-native-vision-camera';

import {detectMarkerFrame} from './nativePlugin';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FrameMarkerResult {
  found: boolean;
  base64Jpeg?: string;
  corners?: Array<{x: number; y: number}>;
}

export type OnMarkerDetectedCallback = (result: FrameMarkerResult) => void;

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useMarkerFrameProcessor
 *
 * Returns a VisionCamera frame processor that:
 *  1. Runs on the camera thread as a Worklet on every frame.
 *  2. Throttles calls to at most one detection per `throttleMs`.
 *  3. When `enabled` is false the worklet exits immediately (zero CPU cost).
 *  4. On a successful detection, bridges the result to the JS thread via
 *     `runOnJS` and calls `onMarkerDetected`.
 *
 * @param onMarkerDetected  JS-thread callback with detection result.
 * @param enabled           Toggle processing on/off without remounting camera.
 * @param throttleMs        Min milliseconds between processed detections (default 250).
 */
export function useMarkerFrameProcessor(
  onMarkerDetected: OnMarkerDetectedCallback,
  enabled: boolean = true,
  throttleMs: number = 250,
) {
  // SharedValues: readable/writable from both JS thread and Worklet thread.
  const isEnabled = useSharedValue(enabled);
  const lastDetectionTs = useSharedValue(0);

  // Keep the shared value in sync with the JS prop each render.
  // This assignment happens on the JS thread but is safe — the worklet
  // reads it on the next frame which is always after this render.
  isEnabled.value = enabled;

  const frameProcessor = useFrameProcessor(
    (frame: Frame) => {
      'worklet';

      // Early exit when disabled — no native call, no bridge overhead.
      if (!isEnabled.value) {
        return;
      }

      // Throttle: performance.now() is worklet-safe (returns ms since app start).
      const now = performance.now();
      if (now - lastDetectionTs.value < throttleMs) {
        return;
      }

      // Synchronous call to the native C++ plugin.
      const result = detectMarkerFrame(frame) as FrameMarkerResult;

      if (result && result.found) {
        lastDetectionTs.value = now; // update throttle timestamp
        // runOnJS schedules the callback on the JS thread asynchronously.
        runOnJS(onMarkerDetected)(result);
      }
    },
    // Dependencies: the callback reference and throttle interval.
    // isEnabled and lastDetectionTs are stable shared-value references.
    [onMarkerDetected, throttleMs, isEnabled, lastDetectionTs],
  );

  return frameProcessor;
}
