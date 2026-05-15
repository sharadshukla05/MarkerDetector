/**
 * CameraScreen.tsx
 *
 * Reusable camera screen component for live marker detection.
 *
 * Responsibilities:
 *  - Request and handle camera permission (runtime, Android M+)
 *  - Select the best high-resolution back-camera format (~2500×2500)
 *  - Render a full-screen live preview via react-native-vision-camera
 *  - Attach the marker detection frame processor
 *  - Display a detection corner overlay and capture progress HUD
 *  - Navigate to GalleryScreen when all 20 markers are collected
 *
 * VisionCamera v4 API notes used here:
 *  - `useCameraDevice('back')` — picks the default back camera
 *  - `useCameraFormat(device, filters)` — picks the best matching format
 *  - `<Camera pixelFormat="yuv" />` — delivers YUV_420_888 frames to the
 *    frame processor (required for our OpenCV Y-plane approach)
 *  - `format.videoWidth / format.videoHeight` — correct v4 property names
 */
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
} from 'react-native-vision-camera';
import {useNavigation} from '@react-navigation/native';
import type {StackNavigationProp} from '@react-navigation/stack';

import type {RootStackParamList} from '../App';
import {MAX_MARKERS, useMarkerStore} from '../store/MarkerStore';
import {useMarkerFrameProcessor} from '../utils/frameProcessor';
import type {FrameMarkerResult} from '../utils/frameProcessor';
import CaptureProgressBar from '../components/CaptureProgressBar';
import MarkerOverlay from '../components/MarkerOverlay';

type CameraNavProp = StackNavigationProp<RootStackParamList, 'Camera'>;

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Target video resolution for format selection.
 *
 * We ask VisionCamera to find the format closest to 2560×1920 (≈ 4.9 MP).
 * This sits in the 2000–3000 px range required for the OpenCV pipeline and
 * gives enough resolution for sub-pixel-accurate corner detection while
 * staying below the point where frame processing becomes too slow.
 *
 * useCameraFormat tries each filter in order, picks the format that satisfies
 * the most constraints. On devices that only support 1080p the closest format
 * will be chosen automatically.
 */
const TARGET_WIDTH = 2560;
const TARGET_HEIGHT = 1920;
const TARGET_FPS = 30;

// ─── Component ────────────────────────────────────────────────────────────────

const CameraScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<CameraNavProp>();
  const {state, addMarker, reset, startCapturing} = useMarkerStore();

  // ── Permission ──────────────────────────────────────────────────────────────
  // useCameraPermission is the v4 hook — handles both iOS and Android.
  const {hasPermission, requestPermission} = useCameraPermission();

  // On mount, immediately trigger the permission dialog.
  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Camera device & format ──────────────────────────────────────────────────
  const device = useCameraDevice('back');

  const format = useCameraFormat(device, [
    // Primary target: ~2560×1920 at 30fps
    {videoResolution: {width: TARGET_WIDTH, height: TARGET_HEIGHT}},
    {fps: TARGET_FPS},
  ]);

  // ── Detection / UI state ────────────────────────────────────────────────────
  const [isDetecting, setIsDetecting] = useState(false);
  const [corners, setCorners] = useState<
    Array<{x: number; y: number}> | undefined
  >(undefined);

  // Flash overlay on each capture
  const flashAnim = useRef(new Animated.Value(0)).current;

  const triggerFlash = useCallback(() => {
    Animated.sequence([
      Animated.timing(flashAnim, {
        toValue: 0.6,
        duration: 50,
        easing: Easing.out(Easing.linear),
        useNativeDriver: true,
      }),
      Animated.timing(flashAnim, {
        toValue: 0,
        duration: 280,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [flashAnim]);

  // ── Frame processor callback (runs on JS thread after runOnJS) ─────────────
  const onMarkerDetected = useCallback(
    (result: FrameMarkerResult) => {
      if (!result.found || !result.base64Jpeg) {
        return;
      }
      if (state.captureCount >= MAX_MARKERS) {
        return;
      }

      // Update corner overlay
      if (result.corners) {
        setCorners(result.corners);
      }

      // Persist to store
      addMarker(result.base64Jpeg);
      triggerFlash();

      // Auto-navigate when the last marker is captured
      if (state.captureCount + 1 >= MAX_MARKERS) {
        // Small delay so the user sees the final flash
        setTimeout(() => navigation.navigate('Gallery'), 700);
      }
    },
    // addMarker is now stable (no deps); state.captureCount causes an intentional
    // re-create so the check inside uses a fresh value.
    [state.captureCount, addMarker, triggerFlash, navigation],
  );

  const captureEnabled = isDetecting && state.captureCount < MAX_MARKERS;

  const frameProcessor = useMarkerFrameProcessor(
    onMarkerDetected,
    captureEnabled,
    250, // max 4 detections / second
  );

  // ── Control handlers ────────────────────────────────────────────────────────
  const handleStartPause = useCallback(() => {
    if (state.captureCount >= MAX_MARKERS) {
      // Full reset
      reset();
      setIsDetecting(false);
      setCorners(undefined);
      return;
    }
    if (isDetecting) {
      setIsDetecting(false);
    } else {
      startCapturing();
      setIsDetecting(true);
    }
  }, [isDetecting, state.captureCount, reset, startCapturing]);

  const handleViewGallery = useCallback(() => {
    navigation.navigate('Gallery');
  }, [navigation]);

  const handleOpenSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  // ── Computed flags ──────────────────────────────────────────────────────────
  const isDone = state.captureCount >= MAX_MARKERS;

  // ── Render: permission loading ──────────────────────────────────────────────
  // hasPermission is null while the dialog is open on first launch
  if (hasPermission === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#7c5cbf" />
        <Text style={styles.infoText}>Requesting camera permission…</Text>
      </View>
    );
  }

  // ── Render: permission denied ───────────────────────────────────────────────
  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionIcon}>🚫</Text>
        <Text style={styles.errorTitle}>Camera Access Denied</Text>
        <Text style={styles.errorBody}>
          MarkerDetector needs camera access to detect markers.{'\n'}
          Open Settings and enable the Camera permission.
        </Text>
        <Pressable
          onPress={handleOpenSettings}
          style={({pressed}) => [
            styles.settingsBtn,
            pressed && styles.btnPressed,
          ]}>
          <Text style={styles.settingsBtnText}>Open Settings</Text>
        </Pressable>
      </View>
    );
  }

  // ── Render: no camera device ────────────────────────────────────────────────
  if (!device) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permissionIcon}>📷</Text>
        <Text style={styles.errorTitle}>No Back Camera Found</Text>
        <Text style={styles.errorBody}>
          This device does not have a usable rear camera.
        </Text>
      </View>
    );
  }

  // ── Render: main camera view ────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* ── Live Camera Preview ─────────────────────────────────────────── */}
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        isActive={true}
        frameProcessor={frameProcessor}
        // yuv delivers YUV_420_888 — required for the C++ Y-plane pipeline
        pixelFormat="yuv"
        // Show fps counter in dev builds only
        enableFpsGraph={__DEV__}
      />

      {/* ── Corner Overlay (shown while actively scanning) ─────────────── */}
      {corners != null && captureEnabled && (
        <MarkerOverlay
          corners={corners}
          frameWidth={format?.videoWidth ?? TARGET_WIDTH}
          frameHeight={format?.videoHeight ?? TARGET_HEIGHT}
        />
      )}

      {/* ── White flash on each capture ────────────────────────────────── */}
      <Animated.View
        pointerEvents="none"
        style={[styles.flash, {opacity: flashAnim}]}
      />

      {/* ── Scanning reticle (visible when detecting, no marker found) ─── */}
      {captureEnabled && corners == null && (
        <View style={styles.reticleContainer} pointerEvents="none">
          <View style={styles.reticle}>
            <View style={[styles.reticleCorner, styles.reticleTL]} />
            <View style={[styles.reticleCorner, styles.reticleTR]} />
            <View style={[styles.reticleCorner, styles.reticleBL]} />
            <View style={[styles.reticleCorner, styles.reticleBR]} />
          </View>
          <Text style={styles.reticleHint}>
            Point at a square black-and-white marker
          </Text>
        </View>
      )}

      {/* ── Bottom HUD ──────────────────────────────────────────────────── */}
      <View style={[styles.hud, {paddingBottom: insets.bottom + 16}]}>

        {/* Progress bar */}
        <CaptureProgressBar
          current={state.captureCount}
          total={MAX_MARKERS}
        />

        {/* Status text */}
        <Text style={styles.statusText}>
          {isDone
            ? '✅  All 20 markers captured!'
            : captureEnabled
            ? `🔍  Scanning… ${state.captureCount} / ${MAX_MARKERS}`
            : `📷  Press Start to begin`}
        </Text>

        {/* Action buttons */}
        <View style={styles.buttonRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isDone ? 'Reset' : isDetecting ? 'Pause scanning' : 'Start scanning'
            }
            onPress={handleStartPause}
            style={({pressed}) => [
              styles.btn,
              isDone
                ? styles.btnReset
                : isDetecting
                ? styles.btnPause
                : styles.btnStart,
              pressed && styles.btnPressed,
            ]}>
            <Text style={styles.btnText}>
              {isDone ? 'Reset' : isDetecting ? 'Pause' : 'Start'}
            </Text>
          </Pressable>

          {state.captureCount > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View gallery with ${state.captureCount} markers`}
              onPress={handleViewGallery}
              style={({pressed}) => [
                styles.btn,
                styles.btnGallery,
                pressed && styles.btnPressed,
              ]}>
              <Text style={styles.btnText}>
                Gallery ({state.captureCount})
              </Text>
            </Pressable>
          )}
        </View>

        {/* Active format info */}
        {format != null && (
          <Text style={styles.formatText}>
            {format.videoWidth} × {format.videoHeight} @ {format.maxFps} fps
          </Text>
        )}
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const CORNER_SIZE = 20;
const CORNER_THICKNESS = 3;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },

  // ── Permission / error screens ───────────────────────────────────────────
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0f',
    paddingHorizontal: 32,
    gap: 16,
  },
  permissionIcon: {
    fontSize: 56,
    marginBottom: 4,
  },
  infoText: {
    color: '#9090b0',
    fontSize: 14,
    textAlign: 'center',
  },
  errorTitle: {
    color: '#e8e8ff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorBody: {
    color: '#7070a0',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  settingsBtn: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 13,
    backgroundColor: '#7c5cbf',
    borderRadius: 12,
  },
  settingsBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },

  // ── Camera capture flash ─────────────────────────────────────────────────
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
  },

  // ── Scanning reticle ─────────────────────────────────────────────────────
  reticleContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  reticle: {
    width: 220,
    height: 220,
    position: 'relative',
  },
  reticleCorner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  reticleTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
  },
  reticleTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
  },
  reticleBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
  },
  reticleBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
  },
  reticleHint: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    textAlign: 'center',
    letterSpacing: 0.2,
  },

  // ── Bottom HUD ───────────────────────────────────────────────────────────
  hud: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(8, 8, 14, 0.88)',
    paddingTop: 18,
    paddingHorizontal: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(124, 92, 191, 0.35)',
  },
  statusText: {
    color: '#dcdcf5',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  btn: {
    flex: 1,
    maxWidth: 200,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnStart: {
    backgroundColor: '#7c5cbf',
  },
  btnPause: {
    backgroundColor: '#9b3a3a',
  },
  btnReset: {
    backgroundColor: '#2e2e48',
    borderWidth: 1,
    borderColor: '#4e4e78',
  },
  btnGallery: {
    backgroundColor: '#1b5fa0',
  },
  btnPressed: {
    opacity: 0.72,
    transform: [{scale: 0.97}],
  },
  btnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  // ── Format info ──────────────────────────────────────────────────────────
  formatText: {
    color: 'rgba(180, 180, 210, 0.4)',
    fontSize: 11,
    textAlign: 'center',
    letterSpacing: 0.4,
    marginTop: -4,
  },
});

export default CameraScreen;
