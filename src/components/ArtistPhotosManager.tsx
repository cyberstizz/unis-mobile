// src/components/ArtistPhotosManager.tsx
// Ported from web `artistPhotosManager.jsx`.
//
// GET    /v1/users/{artistId}/photos            → { photos, max }
// POST   /v1/users/{artistId}/photos  (FormData) — one at a time so the server
//        cap is enforced cleanly and a single bad file doesn't sink the batch
// DELETE /v1/users/{artistId}/photos/{photoId}
//
// Web uses a hidden <input type="file" multiple>; mobile uses expo-image-picker
// with multiple selection.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlus, Trash2, AlertCircle } from 'lucide-react-native';
import axiosInstance from '../services/axiosInstance';
import buildUrl from '../utils/buildUrl';

const DEFAULT_MAX = 15; // mirrors ArtistPhotoService.MAX_PHOTOS; server is the source of truth

interface ArtistPhoto {
  photoId: string;
  photoUrl: string;
}

interface ArtistPhotosManagerProps {
  artistId?: string;
}

const ArtistPhotosManager: React.FC<ArtistPhotosManagerProps> = ({ artistId }) => {
  const [photos, setPhotos] = useState<ArtistPhoto[]>([]);
  const [max, setMax] = useState(DEFAULT_MAX);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!artistId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axiosInstance.get(`/v1/users/${artistId}/photos`);
      setPhotos(res.data?.photos || []);
      if (res.data?.max) setMax(res.data.max);
    } catch (err) {
      setError('Could not load your photos.');
    } finally {
      setLoading(false);
    }
  }, [artistId]);

  useEffect(() => { load(); }, [load]);

  const remaining = Math.max(0, max - photos.length);

  const pickAndUpload = async () => {
    setError(null);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.length) return;

    setUploading(true);

    // Upload one at a time so the server cap is enforced cleanly and a single
    // bad file doesn't sink the whole batch.
    let added = 0;
    const assets = result.assets.slice(0, remaining);
    for (const asset of assets) {
      const form = new FormData();
      const name = asset.fileName || asset.uri.split('/').pop() || 'photo.jpg';
      form.append('file', {
        uri: asset.uri,
        name,
        type: asset.mimeType || 'image/jpeg',
      } as any);
      try {
        await axiosInstance.post(`/v1/users/${artistId}/photos`, form);
        added += 1;
      } catch (err: any) {
        setError(err.response?.data?.error || 'One or more photos failed to upload.');
        break;
      }
    }

    if (result.assets.length > remaining) {
      setError(`Only ${remaining} more photo${remaining === 1 ? '' : 's'} allowed — some weren't added.`);
    }
    setUploading(false);
    if (added > 0) load();
  };

  const handleDelete = async (photoId: string) => {
    setDeletingId(photoId);
    setError(null);
    try {
      await axiosInstance.delete(`/v1/users/${artistId}/photos/${photoId}`);
      setPhotos((prev) => prev.filter((p) => p.photoId !== photoId));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not remove that photo.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.count}>
          <Text style={styles.countStrong}>{photos.length}</Text> / {max} photos
        </Text>
        {remaining > 0 && (
          <Text style={styles.hint}>Add up to {remaining} more · JPG or PNG · 10MB each</Text>
        )}
      </View>

      {!!error && (
        <View style={styles.error}>
          <AlertCircle size={15} color="#f87171" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color="#4a9eff" />
        </View>
      ) : (
        <View style={styles.grid}>
          {photos.map((photo) => {
            const url = buildUrl(photo.photoUrl);
            return (
              <View style={styles.tile} key={photo.photoId}>
                {url ? <Image source={{ uri: url }} style={styles.tileImg} /> : <View style={styles.tileImg} />}
                <TouchableOpacity
                  style={styles.del}
                  onPress={() => handleDelete(photo.photoId)}
                  disabled={deletingId === photo.photoId}
                  accessibilityLabel="Remove photo"
                >
                  {deletingId === photo.photoId
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <Trash2 size={14} color="#FFFFFF" />}
                </TouchableOpacity>
              </View>
            );
          })}

          {remaining > 0 && (
            <TouchableOpacity
              style={[styles.tile, styles.add]}
              onPress={pickAndUpload}
              disabled={uploading}
            >
              <ImagePlus size={22} color="#4a9eff" />
              <Text style={styles.addText}>{uploading ? 'Uploading…' : 'Add photos'}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {!loading && photos.length === 0 && remaining > 0 && (
        <Text style={styles.empty}>
          Add photos of your shows, your studio, your city — they'll appear on your artist page.
        </Text>
      )}
    </View>
  );
};

const TILE = '31%';

const styles = StyleSheet.create({
  head: {
    marginBottom: 12,
  },
  count: {
    color: '#AAAAAA',
    fontSize: 13,
  },
  countStrong: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  hint: {
    color: '#888888',
    fontSize: 12,
    marginTop: 2,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(248, 113, 113, 0.08)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
    marginLeft: 6,
    flex: 1,
  },
  loading: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 8,
  },
  tile: {
    width: TILE,
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  tileImg: {
    width: '100%',
    height: '100%',
  },
  del: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(74, 158, 255, 0.4)',
    backgroundColor: 'rgba(74, 158, 255, 0.05)',
  },
  addText: {
    color: '#4a9eff',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
  },
  empty: {
    color: '#888888',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
  },
});

export default ArtistPhotosManager;