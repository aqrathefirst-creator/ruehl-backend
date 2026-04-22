// api/itunes/search.js
// Public, commercial-use-friendly music search via iTunes Search API.
// No credentials required. Rate limit: ~20 req/min per IP.

function getQueryParam(query, key) {
  const v = query?.[key];
  if (v == null) return '';
  return Array.isArray(v) ? String(v[0] ?? '') : String(v);
}

export default async function handler(req, res) {
  const q = getQueryParam(req.query, 'q').trim();
  if (!q) {
    res.status(200).json({ tracks: [] });
    return;
  }

  const limitRaw = getQueryParam(req.query, 'limit');
  const parsed = parseInt(limitRaw, 10);
  const limit = Number.isFinite(parsed)
    ? Math.min(25, Math.max(1, parsed))
    : 10;

  const country = (getQueryParam(req.query, 'country') || 'US').toUpperCase();

  try {
    const params = new URLSearchParams({
      term: q,
      entity: 'song',
      media: 'music',
      limit: String(limit),
      country,
    });

    const searchRes = await fetch(
      `https://itunes.apple.com/search?${params.toString()}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'RuehlMusicSearch/1.0',
        },
      },
    );

    if (!searchRes.ok) {
      res.status(200).json({ tracks: [] });
      return;
    }

    const body = await searchRes.json();
    const itemsRaw = body.results;

    if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
      res.status(200).json({ tracks: [] });
      return;
    }

    // iTunes Search returns isStreamable and previewUrl fields.
    // Tracks with a preview URL come first; anything missing one goes to the back.
    const sorted = [...itemsRaw].sort(
      (a, b) => Number(!!b.previewUrl) - Number(!!a.previewUrl),
    );

    const tracks = sorted.map((raw) => ({
      // Canonical iTunes track ID — use this for resolve calls later.
      itunes_track_id: raw.trackId != null ? String(raw.trackId) : null,
      // Keep spotify_id field name for compatibility with existing mobile code.
      // Empty string since we're no longer using Spotify.
      spotify_id: '',
      title: raw.trackName || '',
      artist: raw.artistName || '',
      cover_url: raw.artworkUrl100 || raw.artworkUrl60 || raw.artworkUrl30 || null,
      preview_url: raw.previewUrl || null,
      external_url: raw.trackViewUrl || null,
      duration: raw.trackTimeMillis != null ? Math.round(raw.trackTimeMillis / 1000) : null,
      is_playable: !!raw.previewUrl && raw.isStreamable !== false,
    }));

    res.status(200).json({ tracks });
  } catch (err) {
    console.error('[itunes/search] error:', err);
    res.status(200).json({ tracks: [] });
  }
}
