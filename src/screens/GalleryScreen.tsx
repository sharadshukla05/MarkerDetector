/**
 * GalleryScreen.tsx
 *
 * Displays all captured 300×300 marker images in a 4-column grid.
 * Each card shows:
 *  - The extracted marker image (base64 JPEG)
 *  - Frame index badge
 *  - Capture timestamp
 *
 * Also shows an empty state when no markers have been captured yet.
 */
import React, {useCallback} from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {useMarkerStore, MAX_MARKERS, type MarkerEntry} from '../store/MarkerStore';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const COLUMNS = 4;
const CARD_GAP = 8;
const CARD_SIZE =
  (SCREEN_WIDTH - CARD_GAP * (COLUMNS + 1)) / COLUMNS;

// ─── Sub-component: MarkerCard ────────────────────────────────────────────────

interface MarkerCardProps {
  item: MarkerEntry;
  onPress: (item: MarkerEntry) => void;
}

const MarkerCard: React.FC<MarkerCardProps> = React.memo(({item, onPress}) => {
  const time = new Date(item.capturedAt);
  const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time
    .getMinutes()
    .toString()
    .padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}`;

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({pressed}) => [styles.card, pressed && styles.cardPressed]}>
      <Image
        source={{uri: `data:image/jpeg;base64,${item.base64}`}}
        style={styles.cardImage}
        resizeMode="cover"
      />
      {/* Frame index badge */}
      <View style={styles.indexBadge}>
        <Text style={styles.indexText}>{item.frameIndex}</Text>
      </View>
      {/* Timestamp */}
      <View style={styles.timeRow}>
        <Text style={styles.timeText} numberOfLines={1}>
          {timeStr}
        </Text>
      </View>
    </Pressable>
  );
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

const GalleryScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {state, reset} = useMarkerStore();

  const handleCardPress = useCallback((item: MarkerEntry) => {
    // TODO: navigate to full-screen detail
    console.log('[Gallery] Pressed marker:', item.id);
  }, []);

  const renderItem = useCallback(
    ({item}: {item: MarkerEntry}) => (
      <MarkerCard item={item} onPress={handleCardPress} />
    ),
    [handleCardPress],
  );

  const keyExtractor = useCallback((item: MarkerEntry) => item.id, []);

  // ── Empty state ────────────────────────────────────────────────────────────
  if (state.markers.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🔲</Text>
        <Text style={styles.emptyTitle}>No Markers Yet</Text>
        <Text style={styles.emptySubtitle}>
          Go to the Camera screen and start detecting markers.{'\n'}
          Up to {MAX_MARKERS} frames will be captured.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, {paddingBottom: insets.bottom}]}>
      {/* Summary header */}
      <View style={styles.header}>
        <Text style={styles.headerCount}>
          {state.captureCount} / {MAX_MARKERS} markers captured
        </Text>
        <Pressable
          onPress={reset}
          style={({pressed}) => [
            styles.resetBtn,
            pressed && {opacity: 0.7},
          ]}>
          <Text style={styles.resetBtnText}>Clear All</Text>
        </Pressable>
      </View>

      {/* Grid */}
      <FlatList
        data={state.markers}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={COLUMNS}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0f',
    padding: 32,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#e8e8ff',
    fontSize: 22,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: '#7a7a9a',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: CARD_GAP,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e30',
  },
  headerCount: {
    color: '#c0c0e0',
    fontSize: 14,
    fontWeight: '600',
  },
  resetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#3a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#6b2a2a',
  },
  resetBtnText: {
    color: '#ff7070',
    fontSize: 13,
    fontWeight: '600',
  },
  grid: {
    padding: CARD_GAP,
    gap: CARD_GAP,
  },
  row: {
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },
  card: {
    width: CARD_SIZE,
    height: CARD_SIZE + 28,
    backgroundColor: '#14141f',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a2a40',
  },
  cardPressed: {
    transform: [{scale: 0.96}],
    opacity: 0.85,
  },
  cardImage: {
    width: CARD_SIZE,
    height: CARD_SIZE,
  },
  indexBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(124, 92, 191, 0.85)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  indexText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  timeRow: {
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  timeText: {
    color: '#7a7a9a',
    fontSize: 10,
  },
});

export default GalleryScreen;
