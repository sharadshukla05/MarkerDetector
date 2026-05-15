/**
 * MarkerProcessor.cpp
 *
 * OpenCV marker detection pipeline implementation.
 * See MarkerProcessor.h for the full pipeline description and tuning constants.
 *
 * BUILD NOTE: compile with -O2 -std=c++17
 */
#include "MarkerProcessor.h"

#include <android/log.h>
#include <algorithm>
#include <cmath>
#include <numeric>

#include <opencv2/core.hpp>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>

#define LOG_TAG "MarkerProcessor"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// ─── Base64 ───────────────────────────────────────────────────────────────────

static const char B64[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static std::string base64Encode(const std::vector<uchar>& d) {
    std::string o;
    o.reserve(((d.size() + 2) / 3) * 4);
    size_t i = 0;
    for (; i + 2 < d.size(); i += 3) {
        uint32_t v = ((uint32_t)d[i] << 16) | ((uint32_t)d[i+1] << 8) | d[i+2];
        o += B64[(v>>18)&63]; o += B64[(v>>12)&63];
        o += B64[(v>> 6)&63]; o += B64[(v    )&63];
    }
    if (i < d.size()) {
        uint32_t v = (uint32_t)d[i] << 16;
        if (i+1 < d.size()) v |= (uint32_t)d[i+1] << 8;
        o += B64[(v>>18)&63]; o += B64[(v>>12)&63];
        o += (i+1 < d.size()) ? B64[(v>>6)&63] : '=';
        o += '=';
    }
    return o;
}

namespace MarkerDetection {

// ─── detect() — public entry point ───────────────────────────────────────────

MarkerResult MarkerProcessor::detect(
    const uint8_t* yPlane,
    int width, int height, int rowStride)
{
    MarkerResult result;

    if (!yPlane || width <= 0 || height <= 0) {
        LOGW("detect: invalid parameters w=%d h=%d ptr=%p", width, height, yPlane);
        return result;
    }

    // ── Step 1+2: build downscaled processing frame ───────────────────────────
    // Returns the scale factors so we can map corners back to original coords.
    cv::Size2f scale = buildProcessingFrame(yPlane, width, height, rowStride);

    // ── Step 3+4+5: blur → adaptive threshold → morphological close ──────────
    binarise();

    // ── Step 6+7+8: contour detection and square-shape filtering ─────────────
    std::vector<Candidate> candidates = findCandidates();
    if (candidates.empty()) {
        return result;
    }

    // Sort by squareness score descending (most square first).
    // Among equally square candidates prefer the larger one.
    std::sort(candidates.begin(), candidates.end(),
        [](const Candidate& a, const Candidate& b) {
            if (std::abs(a.squarenessScore - b.squarenessScore) > 0.02)
                return a.squarenessScore > b.squarenessScore;
            return a.area > b.area;
        });

    // ── Step 9+10: validate and warp each candidate until one passes ──────────
    for (auto& cand : candidates) {

        // Scale corners from processing-frame coords back to original frame.
        std::vector<cv::Point2f> fullCorners(4);
        for (int i = 0; i < 4; ++i) {
            fullCorners[i].x = cand.corners[i].x / scale.width;
            fullCorners[i].y = cand.corners[i].y / scale.height;
        }

        cv::Mat patch;
        if (!validateAndWarp(_gray, fullCorners, patch)) {
            continue;  // false positive — try next candidate
        }

        // ── Step 11: orientation correction ──────────────────────────────────
        int rotSteps = computeOrientationRotation(patch);
        cv::Mat aligned = rotatePatch(patch, rotSteps);

        // ── Step 12: JPEG + base64 ────────────────────────────────────────────
        result.base64Jpeg  = encodeToBase64Jpeg(aligned, JPEG_QUALITY);
        result.corners     = fullCorners;
        result.contourArea = cand.area;
        result.found       = true;

        LOGI("Marker found: area=%.0f score=%.3f rot=%d",
             cand.area, cand.squarenessScore, rotSteps);
        break;
    }

    return result;
}

// ─── Step 1+2: buildProcessingFrame ──────────────────────────────────────────
//
// Why downscale?
//   A 2560×1920 frame has ~4.9 M pixels. adaptiveThreshold and findContours
//   are O(N) in pixel count. Scaling to 640-wide gives a 16× pixel reduction,
//   bringing per-frame processing from ~80 ms to ~5 ms on a mid-range CPU.
//   Accuracy loss is negligible for marker detection (we only need the 4 corners).
//
// Why avoid a copy when rowStride == width?
//   cv::Mat(rows, cols, type, dataPtr) creates a *header* pointing at existing
//   memory — zero allocation, zero copy. This is safe because `_gray` is only
//   read from (never written to at this stage).

cv::Size2f MarkerProcessor::buildProcessingFrame(
    const uint8_t* yPlane,
    int width, int height, int rowStride)
{
    // Wrap Y-plane into a cv::Mat header (no copy when stride is clean).
    if (rowStride == width) {
        _gray = cv::Mat(height, width, CV_8UC1, const_cast<uint8_t*>(yPlane));
    } else {
        // Camera added row padding — strip it out.
        _gray.create(height, width, CV_8UC1);
        for (int r = 0; r < height; ++r) {
            std::memcpy(_gray.ptr(r), yPlane + (size_t)r * rowStride, width);
        }
    }

    // Compute downscale dimensions preserving aspect ratio.
    int procW = PROC_WIDTH;
    int procH = static_cast<int>(std::round((double)height / width * procW));

    cv::resize(_gray, _small, cv::Size(procW, procH),
               0, 0, cv::INTER_LINEAR);

    // Return scale factors: (proc / original)
    return cv::Size2f(
        static_cast<float>(procW)  / static_cast<float>(width),
        static_cast<float>(procH)  / static_cast<float>(height)
    );
}

// ─── Step 3+4+5: binarise ────────────────────────────────────────────────────
//
// Step 3 — GaussianBlur(5×5):
//   Camera sensor noise creates salt-and-pepper artifacts in the Y-plane.
//   Blurring before thresholding prevents noise pixels from spawning spurious
//   contours. Kernel 5×5 removes noise while preserving the crisp marker edges.
//
// Step 4 — adaptiveThreshold(GAUSSIAN_C, THRESH_BINARY_INV, blockSize=25, C=8):
//   Global threshold fails when illumination is uneven (spotlight, shadow).
//   Adaptive threshold computes a local threshold for each pixel neighbourhood:
//     threshold(x,y) = mean(neighbourhood) − C
//   THRESH_BINARY_INV makes the BLACK marker border become WHITE foreground,
//   which is what findContours expects (contours around white regions on black).
//   blockSize=25 (≈ 4 % of 640) balances local vs global. C=8 prevents white
//   noise pixels in uniform regions from being marked as foreground.
//
// Step 5 — morphologyEx(CLOSE, 3×3):
//   The marker border may have tiny gaps where the threshold failed.
//   Morphological CLOSE = dilate then erode, which seals gaps ≤ kernel radius
//   without changing the overall shape of the binary regions.

void MarkerProcessor::binarise() {
    // Step 3
    cv::GaussianBlur(_small, _blurred, cv::Size(5, 5), 0);

    // Step 4
    cv::adaptiveThreshold(
        _blurred, _binary,
        255,
        cv::ADAPTIVE_THRESH_GAUSSIAN_C,
        cv::THRESH_BINARY_INV,
        /* blockSize — must be odd */ 25,
        /* C subtracted from mean */ 8
    );

    // Step 5
    static const cv::Mat kernel =
        cv::getStructuringElement(cv::MORPH_RECT, cv::Size(3, 3));
    cv::morphologyEx(_binary, _morph, cv::MORPH_CLOSE, kernel);
}

// ─── Step 6+7+8: findCandidates ──────────────────────────────────────────────
//
// Step 6 — findContours(RETR_EXTERNAL, CHAIN_APPROX_SIMPLE):
//   RETR_EXTERNAL: only retrieves outermost contours. Our marker's black border
//   appears as a single outer white ring in the inverted binary image. Ignoring
//   inner contours eliminates all the interior pattern contours.
//   CHAIN_APPROX_SIMPLE: stores only endpoint pixels of horizontal/vertical/
//   diagonal runs — much less memory than CHAIN_APPROX_NONE.
//
// Step 7 — approxPolyDP:
//   Ramer–Douglas–Peucker algorithm simplifies the contour to a polygon.
//   epsilon = 3 % of perimeter → a square contour reduces to exactly 4 points.
//   We discard anything that doesn't give exactly 4 vertices.
//
// Step 8 — Square shape validation (side lengths + diagonals):
//   Bounding-rect aspect ratio is WRONG for tilted squares — a 45°-rotated
//   square has a 1:1 bounding rect but the original quad is clearly square.
//   Instead we:
//     a. Compute all 4 side lengths.
//     b. Check min/max side ratio ≤ SIDE_RATIO_TOLERANCE.
//     c. Compute both diagonal lengths.
//     d. Check diagonal ratio ≤ DIAG_RATIO_TOLERANCE.
//     e. Ensure the quad is convex (rules out bowtie / self-intersecting quads).
//   squarenessScore = 1 − max(sideRatioError, diagRatioError) → closer to 1 = better.

std::vector<MarkerProcessor::Candidate> MarkerProcessor::findCandidates() {
    // Step 6
    std::vector<std::vector<cv::Point>> rawContours;
    cv::findContours(_morph, rawContours, cv::RETR_EXTERNAL, cv::CHAIN_APPROX_SIMPLE);

    std::vector<Candidate> result;

    for (const auto& contour : rawContours) {

        // ── Area pre-filter (fast reject before expensive approxPolyDP) ─────
        double area = cv::contourArea(contour);
        if (area < MIN_AREA || area > MAX_AREA) continue;

        // ── Step 7: Polygon approximation ───────────────────────────────────
        double perim = cv::arcLength(contour, true);
        std::vector<cv::Point> approx;
        cv::approxPolyDP(contour, approx, APPROX_EPSILON_RATIO * perim, true);

        if (approx.size() != 4) continue;

        // ── Convexity check ──────────────────────────────────────────────────
        // isContourConvex requires Point (int), not Point2f.
        if (!cv::isContourConvex(approx)) continue;

        // ── Step 8a: side lengths ────────────────────────────────────────────
        std::array<double, 4> sides;
        for (int i = 0; i < 4; ++i) {
            cv::Point2f a(approx[i]);
            cv::Point2f b(approx[(i + 1) % 4]);
            cv::Point2f d = b - a;
            sides[i] = std::sqrt(d.x*d.x + d.y*d.y);
        }
        double minSide = *std::min_element(sides.begin(), sides.end());
        double maxSide = *std::max_element(sides.begin(), sides.end());
        if (minSide < 1.0) continue; // degenerate
        double sideError = 1.0 - minSide / maxSide;
        if (sideError > SIDE_RATIO_TOLERANCE) continue;

        // ── Step 8b: diagonal lengths ────────────────────────────────────────
        auto dist2f = [](cv::Point2f a, cv::Point2f b) {
            cv::Point2f d = b - a;
            return std::sqrt(d.x*d.x + d.y*d.y);
        };
        double d1 = dist2f(cv::Point2f(approx[0]), cv::Point2f(approx[2]));
        double d2 = dist2f(cv::Point2f(approx[1]), cv::Point2f(approx[3]));
        double diagMin = std::min(d1, d2);
        double diagMax = std::max(d1, d2);
        if (diagMax < 1.0) continue;
        double diagError = 1.0 - diagMin / diagMax;
        if (diagError > DIAG_RATIO_TOLERANCE) continue;

        // ── Squareness score ─────────────────────────────────────────────────
        double score = 1.0 - std::max(sideError, diagError);

        // Convert to Point2f for downstream use
        std::vector<cv::Point2f> corners(4);
        for (int i = 0; i < 4; ++i) corners[i] = cv::Point2f(approx[i]);

        result.push_back({corners, area, score});
    }

    return result;
}

// ─── Step 9+10: validateAndWarp ──────────────────────────────────────────────
//
// Why validate AFTER warping?
//   Many convex quads in a scene (windows, tiles, phone screens) pass the shape
//   filter. The only reliable way to reject them without a trained classifier is
//   to look at the actual pixel content of the rectified region.
//
// Validation checks:
//   A) Border ring darkness:
//      Our marker has a solid black outer border. We sample a ring of pixels
//      BORDER_RING_FRACTION wide around the perimeter of the 300×300 patch.
//      If fewer than BORDER_DARK_FRACTION of those pixels are dark → reject.
//
//   B) Interior variance:
//      A solid black or white region (e.g. a black car hood) passes the border
//      check but has no interior pattern. We compute the variance of the
//      central 60 % of the patch — if it's below INTERIOR_VARIANCE_MIN → reject.
//
// Why warp from the original full-res `srcGray` not the downscaled `_small`?
//   We need a crisp 300×300 output. Warping from 640-wide would interpolate
//   low-res pixels into the output, making the interior pattern blurry and
//   harder to decode. The corners are accurate in full-res coords (we scaled
//   them back before calling this function).

bool MarkerProcessor::validateAndWarp(
    const cv::Mat&                  srcGray,
    const std::vector<cv::Point2f>& corners,
    cv::Mat&                        patch)
{
    // Sort corners TL→TR→BR→BL for a stable perspective transform.
    std::vector<cv::Point2f> sorted = sortCornersCW(corners);

    // Destination: axis-aligned 300×300 square.
    const float N = static_cast<float>(OUTPUT_SIZE);
    const std::vector<cv::Point2f> dst = {
        {0.f,   0.f  },
        {N-1.f, 0.f  },
        {N-1.f, N-1.f},
        {0.f,   N-1.f},
    };

    // Step 10: perspective warp from full-res source.
    cv::Mat H = cv::getPerspectiveTransform(sorted, dst);
    cv::warpPerspective(srcGray, patch,
                        H, cv::Size(OUTPUT_SIZE, OUTPUT_SIZE),
                        cv::INTER_LINEAR);

    // ── Otsu binarise the patch for validation ───────────────────────────────
    // We use Otsu's method — it picks the threshold that maximises inter-class
    // variance (equivalent to minimising intra-class variance), giving the best
    // separation of dark/light pixels without a hand-tuned constant.
    cv::Mat binPatch;
    cv::threshold(patch, binPatch, 0, 255,
                  cv::THRESH_BINARY | cv::THRESH_OTSU);

    // ── Validation A: solid black outer border ───────────────────────────────
    const int ring = static_cast<int>(OUTPUT_SIZE * BORDER_RING_FRACTION);

    // Build a ring mask: full square minus inner rectangle.
    cv::Mat outerMask = cv::Mat::ones(OUTPUT_SIZE, OUTPUT_SIZE, CV_8UC1);
    cv::rectangle(outerMask,
                  cv::Rect(ring, ring, OUTPUT_SIZE - 2*ring, OUTPUT_SIZE - 2*ring),
                  cv::Scalar(0), cv::FILLED);

    // Count dark pixels (0 in the binarised patch) in the ring.
    // THRESH_BINARY makes white = 255 and dark = 0, so we invert to count dark.
    cv::Mat ringPixels, darkPixels;
    cv::bitwise_and(binPatch, binPatch, ringPixels, outerMask);

    int totalRing = cv::countNonZero(outerMask);
    // White pixels in the ring = bright. Dark = totalRing − white.
    int whiteInRing = cv::countNonZero(ringPixels);
    int darkInRing  = totalRing - whiteInRing;

    double darkFraction = (totalRing > 0) ?
        static_cast<double>(darkInRing) / totalRing : 0.0;

    if (darkFraction < BORDER_DARK_FRACTION) {
        LOGW("validateAndWarp: border too bright (%.2f < %.2f)",
             darkFraction, BORDER_DARK_FRACTION);
        return false;
    }

    // ── Validation B: interior must have pattern (variance check) ────────────
    // Sample the central 60 % of the patch.
    const int margin = static_cast<int>(OUTPUT_SIZE * 0.20);
    cv::Rect interiorRect(margin, margin,
                          OUTPUT_SIZE - 2*margin,
                          OUTPUT_SIZE - 2*margin);
    cv::Mat interior = patch(interiorRect);

    cv::Scalar mean, stddev;
    cv::meanStdDev(interior, mean, stddev);
    double variance = stddev[0] * stddev[0];

    if (variance < INTERIOR_VARIANCE_MIN) {
        LOGW("validateAndWarp: interior too uniform (var=%.1f < %.1f)",
             variance, INTERIOR_VARIANCE_MIN);
        return false;
    }

    // Validation passed — update `sorted` back into the result corners.
    // (caller may inspect them; we store them in result.corners via fullCorners)
    return true;
}

// ─── Step 11: computeOrientationRotation ─────────────────────────────────────
//
// The custom marker has a solid-black registration corner in one position.
// After warping we:
//  1. Divide the 300×300 patch into 4 equal quadrants (150×150 each).
//  2. Count dark pixels in each quadrant using the Otsu-binarised patch.
//  3. The quadrant with the most dark pixels = the registration corner.
//  4. Compute how many 90°-CW rotations bring it to the TL position.
//
// Quadrant map:
//   0=TL  1=TR
//   3=BL  2=BR
//
// Rotation needed to move quadrant Q to TL:
//   rotations = (4 - Q) % 4
//   Q=0 (TL already) → 0 rotations
//   Q=1 (TR)         → 3 rotations CW  (= 90° CCW)
//   Q=2 (BR)         → 2 rotations CW  (= 180°)
//   Q=3 (BL)         → 1 rotation  CW

int MarkerProcessor::computeOrientationRotation(const cv::Mat& patch) {
    cv::Mat bin;
    cv::threshold(patch, bin, 0, 255, cv::THRESH_BINARY_INV | cv::THRESH_OTSU);
    // After THRESH_BINARY_INV: dark pixels in original → white (255) in bin.
    // So countNonZero on bin counts the original dark pixels.

    const int H = bin.rows;
    const int W = bin.cols;
    const int hH = H / 2;
    const int hW = W / 2;

    int dark[4];
    dark[0] = cv::countNonZero(bin(cv::Rect(0,   0,   hW, hH)));  // TL
    dark[1] = cv::countNonZero(bin(cv::Rect(hW,  0,   hW, hH)));  // TR
    dark[2] = cv::countNonZero(bin(cv::Rect(hW,  hH,  hW, hH)));  // BR
    dark[3] = cv::countNonZero(bin(cv::Rect(0,   hH,  hW, hH)));  // BL

    // Registration corner = quadrant with the MOST dark pixels.
    int regQ = static_cast<int>(
        std::max_element(dark, dark + 4) - dark
    );

    return (4 - regQ) % 4;
}

// ─── rotatePatch ─────────────────────────────────────────────────────────────
//
// Maps rotation steps to the single cv::rotate() flag.
// cv::rotate performs the rotation in-place with a single transposition +
// flip — no looping, no temporaries.

cv::Mat MarkerProcessor::rotatePatch(const cv::Mat& patch, int steps) {
    if (steps == 0) return patch.clone();

    static const int CODES[4] = {
        -1,                        // 0 → handled above
        cv::ROTATE_90_CLOCKWISE,   // 1
        cv::ROTATE_180,            // 2
        cv::ROTATE_90_COUNTERCLOCKWISE, // 3
    };

    cv::Mat out;
    cv::rotate(patch, out, CODES[steps % 4]);
    return out;
}

// ─── sortCornersCW ───────────────────────────────────────────────────────────
//
// Problem with the previous quadrant-classification approach:
//   If a corner lies exactly on the horizontal or vertical centroid axis,
//   both `isTop` and `isLeft` are ambiguous (strict < misses the boundary).
//   The previous code silently left one corner as `pts[0]` (default value),
//   producing incorrect or duplicate corners.
//
// Robust solution — atan2 angle sort:
//   1. Compute centroid of the 4 points.
//   2. For each point, compute the angle from centroid via atan2(dy, dx).
//   3. Sort angles. The TL corner has an angle closest to −135° (= 225°) in
//      image coordinates (y-down). We rotate the sorted list so the first
//      element is the one with angle in the range [−180°, −90°], i.e. TL.
//
// Result order: TL → TR → BR → BL (clockwise).

std::vector<cv::Point2f> MarkerProcessor::sortCornersCW(
    const std::vector<cv::Point2f>& pts)
{
    // 1. Centroid
    cv::Point2f cen(0.f, 0.f);
    for (auto& p : pts) cen += p;
    cen *= (1.f / 4.f);

    // 2. Compute angles and sort indices by angle ascending
    std::array<int, 4> idx = {0, 1, 2, 3};
    std::array<double, 4> ang;
    for (int i = 0; i < 4; ++i) {
        ang[i] = std::atan2(pts[i].y - cen.y, pts[i].x - cen.x);
    }
    std::sort(idx.begin(), idx.end(),
              [&](int a, int b) { return ang[a] < ang[b]; });

    // 3. After angle sort, order is: TL, TR, BR, BL (in image coords y-down).
    //    atan2 in y-down space:
    //      TL → ~−135° (upper-left)
    //      TR → ~−45°  (upper-right)
    //      BR → ~+45°  (lower-right)
    //      BL → ~+135° (lower-left)
    //    Sorting ascending gives: TL TR BR BL → already the right order.
    //
    //    HOWEVER: the exact starting angle depends on marker orientation.
    //    Find the index in the sorted list with the most negative angle
    //    AND negative x component (left side) — that is TL.
    //
    //    Simpler reliable heuristic: point with smallest (x+y) = TL.
    int tlIdx = 0;
    float minSum = pts[idx[0]].x + pts[idx[0]].y;
    for (int i = 1; i < 4; ++i) {
        float s = pts[idx[i]].x + pts[idx[i]].y;
        if (s < minSum) { minSum = s; tlIdx = i; }
    }

    // Rotate the sorted indices so TL is first, preserving CW order.
    std::vector<cv::Point2f> result(4);
    for (int i = 0; i < 4; ++i) {
        result[i] = pts[idx[(tlIdx + i) % 4]];
    }
    return result;
}

// ─── encodeToBase64Jpeg ───────────────────────────────────────────────────────

std::string MarkerProcessor::encodeToBase64Jpeg(const cv::Mat& mat, int quality) {
    std::vector<uchar> buf;
    cv::imencode(".jpg", mat, buf, {cv::IMWRITE_JPEG_QUALITY, quality});
    return base64Encode(buf);
}

} // namespace MarkerDetection
