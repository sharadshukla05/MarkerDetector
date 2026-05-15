/**
 * CaptureProgressBar.tsx
 *
 * Animated progress bar that fills as markers are captured.
 * Shows individual tick marks for each of the 20 slots.
 */
import React, {useEffect} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

interface Props {
  current: number;
  total: number;
}

const CaptureProgressBar: React.FC<Props> = ({current, total}) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(current / total, {duration: 300});
  }, [current, total, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const pct = Math.round((current / total) * 100);

  return (
    <View style={styles.container}>
      {/* Bar */}
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]} />

        {/* Tick marks */}
        {Array.from({length: total - 1}).map((_, i) => (
          <View
            key={i}
            style={[
              styles.tick,
              {left: `${((i + 1) / total) * 100}%`},
            ]}
          />
        ))}
      </View>

      {/* Label */}
      <Text style={styles.label}>{pct}%</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  track: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    height: '100%',
    backgroundColor: '#7c5cbf',
    borderRadius: 4,
  },
  tick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  label: {
    color: '#c0c0e0',
    fontSize: 12,
    fontWeight: '700',
    width: 36,
    textAlign: 'right',
  },
});

export default CaptureProgressBar;
