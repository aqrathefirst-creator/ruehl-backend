module.exports = async (req, res) => {
    const { q } = req.query;
  
    if (!q) {
      return res.status(200).json({ tracks: [] });
    }
  
    try {
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(
              process.env.SPOTIFY_CLIENT_ID +
                ':' +
                process.env.SPOTIFY_CLIENT_SECRET
            ).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
  
      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;
  
      if (!accessToken) {
        return res.status(200).json({ tracks: [] });
      }
  
      const searchRes = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=10`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
  
      const data = await searchRes.json();
  
      const tracks =
        data.tracks?.items?.map((item) => ({
          spotify_id: item.id,
          title: item.name,
          artist: item.artists?.[0]?.name || '',
          preview_url: item.preview_url,
          cover_url: item.album?.images?.[0]?.url || null,
          duration: item.duration_ms,
          is_playable: !!item.preview_url,
        })) || [];
  
      return res.status(200).json({ tracks });
    } catch (e) {
      return res.status(200).json({ tracks: [] });
    }
  };