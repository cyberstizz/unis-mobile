const PUBLIC_R2_BASE = 'https://pub-fdce5bcbb7b14f3ead9299d58be5fbe6.r2.dev';

// Media host for relative paths. Web uses VITE_API_BASE_URL; on mobile the
// deployed backend host is fixed (same host axiosInstance/getMediaUrl use,
// WITHOUT the /api suffix since media paths are served from the root).
const API_BASE_URL = 'https://unismvp-production.up.railway.app';

/**
 * Safely encode a URL — handles spaces and special chars in filenames
 * without double-encoding URLs that are already partially encoded.
 */
function safeEncode(url: string): string {
  // Decode first to avoid double-encoding (e.g. %20 → %2520),
  // then re-encode the whole thing.
  try {
    return encodeURI(decodeURI(url));
  } catch {
    // decodeURI can throw on malformed percent sequences — just encode raw
    return encodeURI(url);
  }
}

export function buildUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;

  const cleaned = url.trim();
  if (!cleaned) return null;

  // ── Private R2 → rewrite to public CDN ──
  if (cleaned.includes('r2.cloudflarestorage.com')) {
    // Pattern 3: .../unis-media/uploads/filename.ext
    const unisBucketIndex = cleaned.indexOf('/unis-media/uploads/');
    if (unisBucketIndex !== -1) {
      const relativePath = cleaned.slice(unisBucketIndex + '/unis-media'.length);
      return safeEncode(`${PUBLIC_R2_BASE}${relativePath}`);
    }

    // Pattern 4: .../uploads/filename.ext (no unis-media prefix)
    const uploadsIndex = cleaned.indexOf('/uploads/');
    if (uploadsIndex !== -1) {
      const relativePath = cleaned.slice(uploadsIndex);
      return safeEncode(`${PUBLIC_R2_BASE}${relativePath}`);
    }

    // Fallback: unknown private R2 structure
    try {
      const urlObj = new URL(cleaned);
      return safeEncode(`${PUBLIC_R2_BASE}${urlObj.pathname}`);
    } catch {
      return safeEncode(cleaned);
    }
  }

  // ── Already a full URL (public R2 or any other CDN) → encode and pass through ──
  if (cleaned.startsWith('http')) return safeEncode(cleaned);

  // ── Relative path → prepend API base ──
  const separator = cleaned.startsWith('/') ? '' : '/';
  return safeEncode(`${API_BASE_URL}${separator}${cleaned}`);
}

export default buildUrl;