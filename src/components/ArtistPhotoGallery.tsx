// src/components/ArtistPhotoGallery.tsx
// Ported from the web artist page photo gallery + lightbox.
//
// Instagram-style 3-column square grid. Tapping a tile opens a full-screen
// viewer you can swipe through (a horizontal paged FlatList, which is the
// native equivalent of the web version's touch/arrow-key navigation).
//
// Data: GET /v1/users/{artistId}/photos → { photos: [{ photoId, photoUrl,
// position }], max } — note the wrapper object. This endpoint is public
// (SecurityConfig permits /api/v1/users/*/photos), so guests see the gallery.
//
// Every image URL goes through buildUrl (CDN normalisation) — the screen
// passes already-built URLs in, matching the rest of the app.

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  FlatList,
  Dimensions,
  StatusBar,
} from 'react-native';
import { X } from 'lucide-react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export interface ArtistPhoto {
  photoId: string;
  photoUrl: string;
  position?: number;
}

interface ArtistPhotoGalleryProps {
  photos: ArtistPhoto[];
  /** Pre-built (buildUrl'd) src for each photoId. */
  resolveUrl: (photoUrl: string) => string | null;
  artistName: string;
  themeColor: string;
  cardStyle?: object;
}

const GUTTER = 3;

const ArtistPhotoGallery: React.FC<ArtistPhotoGalleryProps> = ({
  photos,
  resolveUrl,
  artistName,
  themeColor,
  cardStyle,
}) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const listRef = useRef<FlatList<ArtistPhoto>>(null);

  const open = useCallback((i: number) => {
    setCurrentIndex(i);
    setOpenIndex(i);
  }, []);

  const close = useCallback(() => setOpenIndex(null), []);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems?.length) setCurrentIndex(viewableItems[0].index ?? 0);
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  if (!photos.length) return null;

  // Card padding is 18 on each side in the screen's card style.
  const gridWidth = SCREEN_W - 28 - 36;
  const tile = Math.floor((gridWidth - GUTTER * 2) / 3);

  return (
    <View style={[styles.card, cardStyle]}>
      <View style={styles.header}>
        <Text style={styles.heading}>Photos</Text>
        <View style={[styles.countPill, { borderColor: themeColor, backgroundColor: `${themeColor}33` }]}>
          <Text style={[styles.countText, { color: '#fff' }]}>{photos.length}</Text>
        </View>
      </View>

      <View style={styles.grid}>
        {photos.map((p, i) => {
          const uri = resolveUrl(p.photoUrl);
          if (!uri) return null;
          const isRowEnd = (i + 1) % 3 === 0;
          return (
            <TouchableOpacity
              key={p.photoId}
              activeOpacity={0.85}
              onPress={() => open(i)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Open photo ${i + 1} of ${photos.length}`}
              style={{
                width: tile,
                height: tile,
                marginRight: isRowEnd ? 0 : GUTTER,
                marginBottom: GUTTER,
              }}
            >
              <Image source={{ uri }} style={styles.tileImg} resizeMode="cover" />
            </TouchableOpacity>
          );
        })}
      </View>

      <Modal
        visible={openIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={close}
        statusBarTranslucent
        supportedOrientations={['portrait', 'landscape']}
      >
        <View style={styles.lightbox}>
          <StatusBar barStyle="light-content" />

          <TouchableOpacity
            style={styles.closeBtn}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close photo viewer"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <X size={22} color="#f2f2f4" />
          </TouchableOpacity>

          <FlatList
            ref={listRef}
            data={photos}
            keyExtractor={(p) => p.photoId}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={openIndex ?? 0}
            getItemLayout={(_, index) => ({
              length: SCREEN_W,
              offset: SCREEN_W * index,
              index,
            })}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            renderItem={({ item, index }) => {
              const uri = resolveUrl(item.photoUrl);
              return (
                <View style={styles.slide}>
                  {uri ? (
                    <Image
                      source={{ uri }}
                      style={styles.slideImg}
                      resizeMode="contain"
                      accessibilityLabel={`${artistName} photo ${index + 1}`}
                    />
                  ) : null}
                </View>
              );
            }}
          />

          <View style={styles.counterWrap} pointerEvents="none">
            <Text style={styles.counter}>
              {currentIndex + 1} / {photos.length}
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(20, 20, 24, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  heading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f2f2f4',
    marginRight: 10,
  },
  countPill: {
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: 20,
    borderWidth: 1,
  },
  countText: { fontSize: 11, fontWeight: '700' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 10,
    overflow: 'hidden',
  },
  tileImg: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  lightbox: {
    flex: 1,
    backgroundColor: 'rgba(4,4,6,0.96)',
    justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: 18,
    zIndex: 5,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  slide: {
    width: SCREEN_W,
    height: SCREEN_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideImg: {
    width: SCREEN_W,
    height: SCREEN_H * 0.78,
  },
  counterWrap: {
    position: 'absolute',
    bottom: 46,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  counter: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#a8a8b3',
  },
});

export default ArtistPhotoGallery;