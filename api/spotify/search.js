function getQueryParam(query, key) {
  const v = query?.[key];
  if (v == null) return '';
  return Array.isArray(v) ? String(v[0] ?? '') : String(v);
}

function basicAuthHeader(clientId, clientSecret) {
  const pair = `${clientId}:${clientSecret}`;
  const base64 =
    typeof globalThis.btoa === 'function'
      ? globalThis.btoa(pair)
      : Buffer.from(pair, 'utf8').toString('base64');
  return `Basic ${base64}`;
}

async function getDeezerPreview(title, artist) {
  try {
    const query = encodeURIComponent(`${title} ${artist}`);
    const res = await fetch(`https://api.deezer.com/search?q=${query}&limit=1`);
    const json = await res.json();
    const track = json?.data?.[0];
    if (track?.preview) return track.preview;
    return null;
  } catch {
    return null;
  }
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
    ? Math.min(10, Math.max(1, parsed))
    : 10;

  const clientId = process.env.SPOTIFY_CLIENT_ID || '';
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) {
    res.status(200).json({ tracks: [] });
    return;
  }

  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuthHeader(clientId, clientSecret),
      },
      body: 'grant_type=client_credentials',
    });

    if (!tokenRes.ok) {
      res.status(200).json({ tracks: [] });
      return;
    }

    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      res.status(200).json({ tracks: [] });
      return;
    }

    const searchParams = new URLSearchParams({
      q,
      type: 'track',
      limit: String(limit),
      market: 'US',
    });
    const searchRes = await fetch(
      `https://api.spotify.com/v1/search?${searchParams.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    const body = await searchRes.json();
    if (searchRes.ok && body.tracks?.items?.[0] != null) {
      console.log(
        'RAW SPOTIFY API RESPONSE:',
        JSON.stringify(body.tracks.items[0], null, 2),
      );
    }
    const itemsRaw = body.tracks?.items;
    if (!searchRes.ok || !itemsRaw?.length) {
      res.status(200).json({ tracks: [] });
      return;
    }

    // Tracks with preview_url first.
    const items = [...itemsRaw].sort(
      (a, b) => Number(!!b.preview_url) - Number(!!a.preview_url),
    );

    const tracks = items.map((rawTrack) => {
      console.log('RAW SPOTIFY TRACK:', rawTrack);
      console.log('PREVIEW URL:', rawTrack.preview_url);

      const mappedTrack = {
        title: rawTrack.name,
        artist: rawTrack.artists?.[0]?.name,
        cover_url: rawTrack.album?.images?.[0]?.url,
        spotify_id: rawTrack.id,
        preview_url: rawTrack.preview_url || null,
        is_playable: rawTrack.preview_url != null && rawTrack.preview_url !== '',
      };

      console.log('MAPPED TRACK:', mappedTrack);

      return mappedTrack;
    });

    const enrichedTracks = await Promise.all(
      tracks.map(async (track) => {
        if (track.preview_url) return track;
        const deezerPreview = await getDeezerPreview(track.title, track.artist);
        return {
          ...track,
          preview_url: deezerPreview || null,
          is_playable: deezerPreview != null,
        };
      }),
    );

    res.status(200).json({ tracks: enrichedTracks });
  } catch {
    res.status(200).json({ tracks: [] });
  }
}
