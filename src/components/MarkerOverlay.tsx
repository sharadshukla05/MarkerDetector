/**
 * MarkerOverlay.tsx
 *
 * GPU-accelerated overlay (Skia) that draws a pulsing green quadrilateral
 * over the four detected marker corners on the camera preview.
 *
 * Coordinate mapping:
 *   Corners arrive in camera-pixel space (0…frameWidth, 0…frameHeight).
 *   We scale them to screen pixels using the ratio of screen size to frame size.
 *   This is correct for a full-screen camera preview that fills the display.
 *
 * FIX from previous version:
 *   React hooks (useSharedValue, useEffect, useAnimatedStyle) MUST be called
 *   unconditionally. The previous code returned null before the hooks were
 *   called when `corners.length !== 4`, violating the Rules of Hooks and
 *   causing a crash on the first render after a reset.
 *   Solution: call all hooks first, then guard the render output.
 */
import React, {useEffect} from 'react';
import {Dimensions, StyleSheet} from 'react-native';
import {Canvas, Path, Skia} from '@shopify/react-native-skia';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const {width: SCREEN_W, height: SCREEN_H} = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────

interface Corner {
  x: number;
  y: number;
}

interface Props {
  corners: Corner[];
  /** Camera frame width in pixels — used to normalise corner coordinates. */
  frameWidth?: number;
  /** Camera frame height in pixels — used to normalise corner coordinates. */
  frameHeight?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

const MarkerOverlay: React.FC<Props> = ({
  corners,
  frameWidth = SCREEN_W,
  frameHeight = SCREEN_H,
}) => {
  // ── All hooks must be called before any conditional return ──────────────────
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (corners.length !== 4) {
      opacity.value = 0;
      return;
    }
    // Pulse animation: fade between 0.45 and 1.0 repeatedly
    opacity.value = withRepeat(
      withSequence(
        withTiming(1.0, {duration: 300}),
        withTiming(0.45, {duration: 500}),
        withTiming(1.0, {duration: 500}),
      ),
      -1,
      false,
    );
    return () => {
      opacity.value = 0;
    };
  }, [corners, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  // ── Guard: don't render without exactly 4 corners ──────────────────────────
  if (!corners || corners.length !== 4) {
    return null;
  }

  // ── Scale camera-space corners to screen-space ──────────────────────────────
  const scaleX = SCREEN_W / frameWidth;
  const scaleY = SCREEN_H / frameHeight;

  const scaled = corners.map(c => ({
    x: c.x * scaleX,
    y: c.y * scaleY,
  }));

  // ── Build Skia path for the quadrilateral ───────────────────────────────────
  const quadPath = Skia.Path.Make();
  quadPath.moveTo(scaled[0].x, scaled[0].y);
  quadPath.lineTo(scaled[1].x, scaled[1].y);
  quadPath.lineTo(scaled[2].x, scaled[2].y);
  quadPath.lineTo(scaled[3].x, scaled[3].y);
  quadPath.close();

  // ── Build Skia paths for corner dots ───────────────────────────────────────
  const DOT_RADIUS = 7;
  const dotPaths = scaled.map(c => {
    const dot = Skia.Path.Make();
    dot.addCircle(c.x, c.y, DOT_RADIUS);
    return dot;
  });

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, animStyle]}
      pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        {/* Quadrilateral border */}
        <Path
          path={quadPath}
          color="rgba(80, 230, 110, 0.92)"
          style="stroke"
          strokeWidth={3.5}
          strokeJoin="round"
          strokeCap="round"
        />

        {/* Corner dots */}
        {dotPaths.map((dotPath, i) => (
          <Path
            key={i}
            path={dotPath}
            color="#50e66e"
            style="fill"
          />
        ))}
      </Canvas>
    </Animated.View>
  );
};

export default MarkerOverlay;
