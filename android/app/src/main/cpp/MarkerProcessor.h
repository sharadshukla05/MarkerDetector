/**
 * MarkerProcessor.h
 *
 * ═══════════════════════════════════════════════════════════════════
 *  MarkerProcessor — Custom Square Marker Detection via OpenCV
 * ═══════════════════════════════════════════════════════════════════
 *
 * MARKER DESIGN CONTRACT
 * ──────────────────────
 * The detector is tuned for a specific marker layout:
 *
 *   ┌────────────────────────┐
 *   │ ██████████████████████ │  ← solid black border  (~15% of width)
 *   │ ██  ░░░░  ░░░░░░  ███ │
 *   │ ██  ░ ID PATTERN  ███ │  ← white interior with B&W data cells
 *   │ ██  ░░░░  ░░░░░░  ███ │
 *   │ ██████████████  ██████ │  ← TL corner registration mark (solid black)
 *   └────────────────────────┘
 *
 *  •  Outer border : solid black, ≥10 px thick at minimum distance
 *  •  Interior     : binary (black/white) pattern
 *  •  Registration : one corner of the border is 100 % black (used for
 *                    orientation detection — in our convention it is BL,
 *                    but the detector auto-rotates to normalise it to TL)
 *
 * PIPELINE OVERVIEW
 * ─────────────────
 *  Step 1  – Downscale   : resize to PROC_WIDTH × PROC_HEIGHT for speed
 *  Step 2  – Grayscale   : already grayscale (Y-plane from YUV_420_888)
 *  Step 3  – Blur        : GaussianBlur(5×5) — removes camera noise
 *  Step 4  – Threshold   : adaptiveThreshold(GAUSSIAN_C) — handles lighting
 *  Step 5  – Morphology  : CLOSE(3×3) — seals thin gaps in the border
 *  Step 6  – Contours    : findContours(EXTERNAL, SIMPLE)
 *  Step 7  – Quad filter : approxPolyDP → 4 vertices, convex, area range
 *  Step 8  – Square test : all 4 side lengths and both diagonals near equal
 *  Step 9  – Border test : validate solid black outer border in warped patch
 *  Step 10 – Warp        : getPerspectiveTransform + warpPerspective → 300×300
 *  Step 11 – Orient      : count dark pixels in corner quadrants → rotate
 *  Step 12 – Encode      : JPEG → base64 string
 */
#pragma once

#include <opencv2/core.hpp>
#include <opencv2/imgproc.hpp>
#include <string>
#include <vector>
#include <array>

namespace MarkerDetection {

// ═══════════════════════════════════════════════════════════════════
//  Tuning Constants
//  ─────────────────
//  Adjust these to match your physical marker and camera setup.
// ═══════════════════════════════════════════════════════════════════

/// Output patch size (pixels). Both width and height equal this.
constexpr int OUTPUT_SIZE = 300;

/// Processing resolution — frames are downscaled to this width before any
/// OpenCV work. Height is computed from the frame's aspect ratio.
/// 640 gives ~6× speedup over 2560-wide frames with minimal accuracy loss.
constexpr int PROC_WIDTH = 640;

/// Minimum contour area *in the downscaled frame* (px²).
/// At 640-wide a 70×70 marker is ~4900 px² → 4000 is a safe lower bound.
constexpr double MIN_AREA = 4000.0;

/// Maximum contour area in the downscaled frame (px²).
/// 0.5 × 640 × 480 ≈ 150 000 — prevents matching the whole frame border.
constexpr double MAX_AREA = 150'000.0;

/// approxPolyDP epsilon as a fraction of the contour perimeter.
/// 3 % gives robust 4-vertex results even on perspective-distorted squares.
constexpr double APPROX_EPSILON_RATIO = 0.03;

/// Maximum deviation of side-length ratio from 1.0 (perfect square).
/// 0.25 = sides may differ by up to 25 % (handles mild perspective).
constexpr double SIDE_RATIO_TOLERANCE = 0.25;

/// Maximum deviation of diagonal ratio from 1.0.
/// Tighter than side ratio because diagonals are less perspective-sensitive.
constexpr double DIAG_RATIO_TOLERANCE = 0.15;

/// Minimum fraction of the border ring that must be dark (black).
/// Used in validateBorder(). 0.80 = at least 80 % of border pixels are dark.
constexpr double BORDER_DARK_FRACTION = 0.80;

/// Width of the border ring sampled in validateBorder(), as a fraction of
/// the 300×300 patch size. 0.12 ≈ 36 px on each side.
constexpr double BORDER_RING_FRACTION = 0.12;

/// Minimum fraction of the interior region that must be non-uniform
/// (i.e., has both black and white pixels). Prevents matching solid shapes.
constexpr double INTERIOR_VARIANCE_MIN = 200.0; // stddev²

/// Otsu threshold is used inside the warped patch for orientation detection.
/// No magic constant needed — Otsu finds the optimal split automatically.

/// JPEG encoding quality for the base64 output.
constexpr int JPEG_QUALITY = 88;

// ═══════════════════════════════════════════════════════════════════
//  Result Type
// ═══════════════════════════════════════════════════════════════════

struct MarkerResult {
    bool        found      = false;
    std::string base64Jpeg;              // non-empty iff found == true
    /// 4 corners in the *original full-resolution* frame coordinates (TL→TR→BR→BL)
    std::vector<cv::Point2f> corners;
    /// Area of the detected contour in the *downscaled* frame (debug use)
    double      contourArea = 0.0;
};

// ═══════════════════════════════════════════════════════════════════
//  MarkerProcessor Class
// ═══════════════════════════════════════════════════════════════════

class MarkerProcessor {
public:
    MarkerProcessor()  = default;
    ~MarkerProcessor() = default;

    // Non-copyable — holds reusable cv::Mat buffers as members.
    MarkerProcessor(const MarkerProcessor&)            = delete;
    MarkerProcessor& operator=(const MarkerProcessor&) = delete;

    /**
     * Detect a custom square marker in a raw YUV_420_888 grayscale frame.
     *
     * @param yPlane    Pointer to the Y-plane (luminance) byte array.
     * @param width     Frame width  in pixels (e.g. 2560).
     * @param height    Frame height in pixels (e.g. 1920).
     * @param rowStride Bytes per row — may be > width due to camera padding.
     * @return          MarkerResult; check result.found before using other fields.
     */
    MarkerResult detect(
        const uint8_t* yPlane,
        int            width,
        int            height,
        int            rowStride
    );

private:
    // ── Reusable image buffers (avoids per-frame heap allocation) ──────────
    cv::Mat _gray;
    cv::Mat _small;
    cv::Mat _blurred;
    cv::Mat _binary;
    cv::Mat _morph;

    // ── Pipeline stage helpers ──────────────────────────────────────────────

    /**
     * Step 1 + 2: Wrap Y-plane into cv::Mat (no copy if stride == width)
     * and downscale to PROC_WIDTH for fast processing.
     * Returns the scale factors (scaleX, scaleY) used, so detected corners
     * can be up-scaled back to original frame coordinates.
     */
    cv::Size2f buildProcessingFrame(
        const uint8_t* yPlane,
        int width, int height, int rowStride
    );

    /**
     * Step 3 + 4 + 5: Blur → adaptive threshold → morphological close.
     * Writes result into _binary.
     */
    void binarise();

    /**
     * Step 6 + 7 + 8: Find contours and return all quadrilateral candidates
     * that pass area, convexity, and square-shape tests.
     *
     * Each candidate is a vector of exactly 4 Point2f corners
     * (in downscaled frame coordinates).
     */
    struct Candidate {
        std::vector<cv::Point2f> corners; // in proc-frame coords
        double area;
        double squarenessScore;           // closer to 1.0 = more square
    };
    std::vector<Candidate> findCandidates();

    /**
     * Step 9: Warp the candidate region to a 300×300 patch and validate
     * that it looks like our marker:
     *   - solid black outer border
     *   - non-uniform (patterned) interior
     * Returns false for any contour that fails validation (false positive).
     *
     * @param srcGray  Full-resolution grayscale image to warp from.
     * @param corners  4 corners in the full-resolution frame.
     * @param patch    Output: 300×300 warped patch (if validation passes).
     */
    bool validateAndWarp(
        const cv::Mat&                  srcGray,
        const std::vector<cv::Point2f>& corners,
        cv::Mat&                        patch
    );

    /**
     * Step 11: Determine orientation by counting dark pixels in each corner
     * quadrant. The quadrant with the most dark pixels is the registration
     * corner → rotate patch so that corner is always TL.
     * Returns number of 90°-CW rotations needed (0–3).
     */
    static int computeOrientationRotation(const cv::Mat& binaryPatch);

    /**
     * Apply N × 90°-CW rotations to a square Mat in a single OpenCV call.
     */
    static cv::Mat rotatePatch(const cv::Mat& patch, int rotationSteps);

    /**
     * Sort 4 points into canonical order: TL, TR, BR, BL.
     *
     * Algorithm:
     *  1. Compute centroid.
     *  2. Compute angle of each point relative to centroid (atan2).
     *  3. Sort by angle starting from top-left quadrant.
     * This is more robust than the quadrant-classification approach when
     * a corner lies exactly on the centroid axis.
     */
    static std::vector<cv::Point2f> sortCornersCW(
        const std::vector<cv::Point2f>& pts
    );

    /**
     * JPEG-encode a cv::Mat and base64-encode the result.
     */
    static std::string encodeToBase64Jpeg(const cv::Mat& mat, int quality);
};

} // namespace MarkerDetection
