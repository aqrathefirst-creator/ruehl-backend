// api/itunes/resolve.js
// Resolve a fresh preview URL by iTunes track ID or by title+artist fallback.
// Used by mobile at post-render time when a stored preview URL has rotted.

function getQueryParam(query, key) {
  const v = query?.[key];
  if (v == null) return '';
  return Array.isArray(v) ? String(v[0] ?? '') : String(v);
}

async function lookupByItunesId(id) {
  try {
    const res = await fetch(
      `https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=song`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'RuehlMusicResolve/1.0',
        },
      },
    );
    if (!res.ok) return null;
    const body = await res.json();
    return Array.isArray(body.results) ? body.results[0] : null;
  } catch {
    return null;
  }
}

async function searchByTitleArtist(title, artist) {
  try {
    const term = `${title} ${artist}`.trim();
    if (!term) return null;
    const params = new URLSearchParams({
      term,
      entity: 'song',
      media: 'music',
      limit: '1',
      country: 'US',
    });
    const res = await fetch(
      `https://itunes.apple.com/search?${params.toString()}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'RuehlMusicResolve/1.0',
        },
      },
    );
    if (!res.ok) return null;
    const body = await res.json();
    return Array.isArray(body.results) ? body.results[0] : null;
  } catch {
    return null;
  }
}

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return {}; }
}

export default async function handler(req, res) {
  // Allow GET (query params) and POST (JSON body).
  let itunesId = '';
  let title = '';
  let artist = '';

  if (req.method === 'POST') {
    const body = typeof req.body === 'string'
      ? safeJsonParse(req.body)
      : req.body || {};
    itunesId = String(body.itunes_track_id || '').trim();
    title = String(body.title || '').trim();
    artist = String(body.artist || '').trim();
  } else {
    itunesId = getQueryParam(req.query, 'itunes_track_id').trim();
    title = getQueryParam(req.query, 'title').trim();
    artist = getQueryParam(req.query, 'artist').trim();
  }

  try {
    let track = null;

    if (itunesId) {
      track = await lookupByItunesId(itunesId);
    }

    if (!track && title) {
      track = await searchByTitleArtist(title, artist);
    }

    if (!track || !track.previewUrl) {
      res.status(200).json({
        preview_url: null,
        itunes_track_id: null,
        source: 'unavailable',
      });
      return;
    }

    res.status(200).json({
      preview_url: track.previewUrl,
      itunes_track_id: track.trackId != null ? String(track.trackId) : null,
      title: track.trackName || null,
      artist: track.artistName || null,
      cover_url: track.artworkUrl100 || track.artworkUrl60 || null,
      duration: track.trackTimeMillis != null ? Math.round(track.trackTimeMillis / 1000) : null,
      source: 'fresh',
    });
  } catch (err) {
    console.error('[itunes/resolve] error:', err);
    res.status(200).json({
      preview_url: null,
      itunes_track_id: null,
      source: 'error',
    });
  }
}
