/**
 * markerDetection.ts
 *
 * Pure TypeScript helper: wraps the native OpenCV JNI module to perform
 * marker detection on a YUV camera frame.
 *
 * Pipeline:
 *  1. Receive a VisionCamera Frame (YUV_420_888) from the frame processor.
 *  2. Convert to grayscale via native OpenCV.
 *  3. Apply adaptive threshold to binarise.
 *  4. Find external contours; filter by area, aspect ratio, and 4-corner shape.
 *  5. Apply perspective transform to extract a canonical 300×300 patch.
 *  6. Auto-rotate: find the corner with the highest pixel density (black corner
 *     marker convention) and rotate accordingly.
 *  7. Return base64 JPEG string.
 *
 * The actual heavy lifting is done in the native OpenCV module
 * (android/app/src/main/cpp/MarkerProcessor.cpp).
 *
 * This file is the JS bridge — it just calls the native method.
 */
import {NativeModules} from 'react-native';

const {MarkerProcessorModule} = NativeModules;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DetectionResult {
  found: boolean;
  base64Jpeg?: string;     // 300×300 marker, already orientation-corrected
  corners?: number[][];    // [[x,y], [x,y], [x,y], [x,y]] in original frame coords
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Target size of extracted marker in pixels.
 * Native code resizes the warped patch to exactly this.
 */
export const MARKER_OUTPUT_SIZE = 300;

/**
 * Minimum contour area (in px²) to be considered a candidate marker.
 * Tune based on the expected minimum marker size in frame.
 */
export const MIN_CONTOUR_AREA = 5000;

/**
 * Maximum contour area — prevents matching the whole frame border.
 */
export const MAX_CONTOUR_AREA = 4_000_000;

/**
 * Aspect ratio tolerance for the detected quadrilateral.
 * 1.0 = perfect square; we allow ±30% due to perspective.
 */
export const ASPECT_RATIO_TOLERANCE = 0.30;

// ─── Main Detection Function ──────────────────────────────────────────────────

/**
 * Detect a custom square black-and-white marker in the given frame.
 *
 * This function is called from a VisionCamera frame processor plugin,
 * so it runs on the camera thread (not the JS thread).
 *
 * @param frameData  - Shared-memory buffer filled by the native frame plugin
 * @param width      - Frame width in pixels
 * @param height     - Frame height in pixels
 * @returns DetectionResult
 */
export async function detectMarker(
  frameData: ArrayBuffer,
  width: number,
  height: number,
): Promise<DetectionResult> {
  if (!MarkerProcessorModule) {
    console.error('[MarkerDetection] Native module not found. Is the AAR linked?');
    return {found: false};
  }

  try {
    const result: DetectionResult = await MarkerProcessorModule.detectMarker(
      frameData,
      width,
      height,
      MARKER_OUTPUT_SIZE,
      MIN_CONTOUR_AREA,
      MAX_CONTOUR_AREA,
      ASPECT_RATIO_TOLERANCE,
    );
    return result;
  } catch (err) {
    console.warn('[MarkerDetection] Native call failed:', err);
    return {found: false};
  }
}
