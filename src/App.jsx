
import { useEffect, useRef, useState } from 'react';
import './App.css';

const artists = [
  { name: 'The Weeknd', imageSearch: 'The Weeknd' },
  { name: 'BIGBANG', imageSearch: 'BIGBANG Still Life' },
  { name: 'Ariana Grande', imageSearch: 'Ariana Grande' },
  { name: 'Shakira', imageSearch: 'Shakira' },
  { name: 'Taylor Swift', imageSearch: 'Taylor Swift' },
];

const FALLBACK_IMAGE =
  'https://placehold.co/600x600/302339/ffb6d9?text=Melodia';

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);

  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

function loadSaved(key) {
  try {
    const saved = localStorage.getItem(key);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function App() {
  const [search, setSearch] = useState('');
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [view, setView] = useState('home');

  const [artistImages, setArtistImages] = useState({});

  const [tracks, setTracks] = useState([]);
  const [favorites, setFavorites] = useState(() =>
    loadSaved('melodia-favorites')
  );
  const [playlists, setPlaylists] = useState(() =>
    loadSaved('melodia-playlists')
  );

  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [playlistName, setPlaylistName] = useState('');
  const [addingTrack, setAddingTrack] = useState(null);

  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const audioRef = useRef(null);
  const tracksRef = useRef([]);
  const currentTrackRef = useRef(null);
  const requestRef = useRef(0);

  const filteredArtists = artists.filter((artist) =>
    artist.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedPlaylist = playlists.find(
    (playlist) => playlist.id === selectedPlaylistId
  );

  const visibleTracks =
    view === 'library'
      ? favorites
      : view === 'playlist'
      ? selectedPlaylist?.tracks || []
      : tracks;

  // Get artist artwork directly from Apple's music catalog.
  useEffect(() => {
    let cancelled = false;

    async function loadArtistImages() {
      const results = await Promise.all(
        artists.map(async (artist) => {
          try {
            const params = new URLSearchParams({
              term: artist.imageSearch,
              country: 'SE',
              media: 'music',
              entity: 'song',
              limit: '50',
            });

            const response = await fetch(
              `https://itunes.apple.com/search?${params}`
            );

            if (!response.ok) throw new Error('Image search failed');

            const data = await response.json();

            let match;

            if (artist.name === 'BIGBANG') {
              match = data.results.find(
                (item) =>
                  item.artistName?.toLowerCase() === 'bigbang' &&
                  item.trackName?.toLowerCase().includes('still life')
              );
            } else {
              match = data.results.find(
                (item) =>
                  item.artistName?.toLowerCase() ===
                  artist.name.toLowerCase()
              );
            }

            const image = match?.artworkUrl100
              ?.replace('100x100bb', '600x600bb');

            return [artist.name, image || FALLBACK_IMAGE];
          } catch (err) {
            console.error('Could not load artist image:', err);
            return [artist.name, FALLBACK_IMAGE];
          }
        })
      );

      if (!cancelled) {
        setArtistImages(Object.fromEntries(results));
      }
    }

    loadArtistImages();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(
      'melodia-favorites',
      JSON.stringify(favorites)
    );
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem(
      'melodia-playlists',
      JSON.stringify(playlists)
    );
  }, [playlists]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    tracksRef.current = visibleTracks;
  }, [visibleTracks]);

  const isFavorite = (track) =>
    favorites.some(
      (favorite) => favorite.trackId === track.trackId
    );

  const toggleFavorite = (track) => {
    setFavorites((previous) => {
      const exists = previous.some(
        (favorite) => favorite.trackId === track.trackId
      );

      return exists
        ? previous.filter(
            (favorite) => favorite.trackId !== track.trackId
          )
        : [...previous, track];
    });
  };

  const createPlaylist = (event) => {
    event.preventDefault();

    const name = playlistName.trim();
    if (!name) return;

    const newPlaylist = {
      id: crypto.randomUUID(),
      name,
      tracks: [],
    };

    setPlaylists((previous) => [...previous, newPlaylist]);
    setPlaylistName('');
    setSelectedPlaylistId(newPlaylist.id);
    setView('playlist');
  };

  const addToPlaylist = (playlistId, track) => {
    setPlaylists((previous) =>
      previous.map((playlist) => {
        if (playlist.id !== playlistId) return playlist;

        const alreadyAdded = playlist.tracks.some(
          (song) => song.trackId === track.trackId
        );

        if (alreadyAdded) return playlist;

        return {
          ...playlist,
          tracks: [...playlist.tracks, track],
        };
      })
    );

    setAddingTrack(null);
  };

  const removeFromPlaylist = (playlistId, trackId) => {
    setPlaylists((previous) =>
      previous.map((playlist) =>
        playlist.id === playlistId
          ? {
              ...playlist,
              tracks: playlist.tracks.filter(
                (track) => track.trackId !== trackId
              ),
            }
          : playlist
      )
    );
  };

  const deletePlaylist = (playlistId) => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this playlist?'
    );

    if (!confirmed) return;

    setPlaylists((previous) =>
      previous.filter((playlist) => playlist.id !== playlistId)
    );

    setSelectedPlaylistId(null);
    setView('playlists');
  };

  const openArtist = async (artist) => {
    const requestId = ++requestRef.current;

    setView('artist');
    setSelectedArtist(artist);
    setSearch('');
    setTracks([]);
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        term: artist,
        country: 'SE',
        media: 'music',
        entity: 'song',
        attribute: 'artistTerm',
        limit: '150',
      });

      const response = await fetch(
        `https://itunes.apple.com/search?${params}`
      );

      if (!response.ok) {
        throw new Error('Music search failed');
      }

      const data = await response.json();

      if (requestId !== requestRef.current) return;

      const artistTracks = data.results
        .filter((track) => {
          const name = track.artistName?.toLowerCase() || '';
          const wanted = artist.toLowerCase();

          return (
            track.kind === 'song' &&
            (name === wanted ||
              name.startsWith(`${wanted} &`) ||
              name.startsWith(`${wanted},`) ||
              name.startsWith(`${wanted} feat.`) ||
              name.startsWith(`${wanted} featuring`))
          );
        })
        .filter((track) => track.trackId && track.trackName);

      const uniqueTracks = Array.from(
        new Map(
          artistTracks.map((track) => [track.trackId, track])
        ).values()
      );

      setTracks(uniqueTracks);

      if (uniqueTracks.length === 0) {
        setError('No songs found for this artist.');
      }
    } catch (err) {
      if (requestId !== requestRef.current) return;

      console.error(err);
      setError('Could not load songs. Please try again.');
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  };

  const playTrack = async (track) => {
    const audio = audioRef.current;
    if (!audio || !track.previewUrl) return;

    currentTrackRef.current = track;
    setCurrentTrack(track);
    setCurrentTime(0);
    setDuration(0);
    setError('');

    audio.src = track.previewUrl;

    try {
      await audio.play();
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Playback error:', err);
        setError('This preview could not be played.');
      }
    }
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentTrackRef.current) {
      const firstTrack = tracksRef.current.find(
        (track) => track.previewUrl
      );

      if (firstTrack) {
        await playTrack(firstTrack);
      }
      return;
    }

    if (audio.paused) {
      try {
        await audio.play();
      } catch (err) {
        console.error('Playback error:', err);
      }
    } else {
      audio.pause();
    }
  };

  const changeTrack = (direction) => {
    const availableTracks = tracksRef.current.filter(
      (track) => track.previewUrl
    );

    if (availableTracks.length === 0) return;

    const currentIndex = availableTracks.findIndex(
      (track) =>
        track.trackId === currentTrackRef.current?.trackId
    );

    const nextIndex =
      (currentIndex + direction + availableTracks.length) %
      availableTracks.length;

    playTrack(availableTracks[nextIndex]);
  };

  const seekTrack = (event) => {
    const time = Number(event.target.value);
    const audio = audioRef.current;

    if (audio && Number.isFinite(audio.duration)) {
      audio.currentTime = time;
      setCurrentTime(time);
    }
  };

  const changeView = (nextView) => {
    ++requestRef.current;
    setView(nextView);
    setSelectedArtist(null);
    setSearch('');
    setLoading(false);
    setError('');
    setAddingTrack(null);
  };

  const openPlaylist = (playlistId) => {
    setSelectedPlaylistId(playlistId);
    changeView('playlist');
  };

  const renderTrack = (track) => (
    <li key={track.trackId} className="track-item">
      <div
        className="track-info"
        onClick={() => playTrack(track)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            playTrack(track);
          }
        }}
      >
        <img
          src={track.artworkUrl100}
          alt={track.collectionName || track.trackName}
          className="track-cover"
        />

        <div>
          <strong>{track.trackName}</strong>
          <p>{track.artistName}</p>
        </div>
      </div>

      <div className="track-actions">
        <button
          type="button"
          className={
            isFavorite(track)
              ? 'favorite-button active'
              : 'favorite-button'
          }
          onClick={() => toggleFavorite(track)}
          title="Toggle favorite"
        >
          {isFavorite(track) ? '❤️' : '🤍'}
        </button>

        <button
          type="button"
          className="add-playlist-button"
          onClick={() =>
            setAddingTrack(
              addingTrack?.trackId === track.trackId
                ? null
                : track
            )
          }
          title="Add to playlist"
        >
          ➕
        </button>

        <button
          type="button"
          disabled={!track.previewUrl}
          onClick={() => playTrack(track)}
          aria-label={`Play ${track.trackName}`}
        >
          {track.previewUrl ? '▶' : '—'}
        </button>

        {view === 'playlist' && (
          <button
            type="button"
            className="remove-track-button"
            onClick={() =>
              removeFromPlaylist(
                selectedPlaylistId,
                track.trackId
              )
            }
            title="Remove from playlist"
          >
            🗑️
          </button>
        )}

        {track.trackViewUrl && (
          <a
            href={track.trackViewUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Apple Music ↗
          </a>
        )}
      </div>

      {addingTrack?.trackId === track.trackId && (
        <div className="playlist-picker">
          <p>Add to playlist:</p>

          {playlists.length === 0 ? (
            <p>Create a playlist first.</p>
          ) : (
            playlists.map((playlist) => (
              <button
                type="button"
                key={playlist.id}
                onClick={() =>
                  addToPlaylist(playlist.id, track)
                }
              >
                🎵 {playlist.name}
              </button>
            ))
          )}
        </div>
      )}
    </li>
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>🎵 Melodia</h2>

        <nav>
          <a href="#home" onClick={() => changeView('home')}>
            Home
          </a>

          <a href="#search" onClick={() => changeView('home')}>
            Search
          </a>

          <a
            href="#library"
            onClick={() => changeView('library')}
          >
            ❤️ Your Library
          </a>

          <a
            href="#playlists"
            onClick={() => changeView('playlists')}
          >
            🎧 Playlists
          </a>
        </nav>
      </aside>

      <main className="main-content" id="home">
        <h1>Welcome to Melodia</h1>
        <p>Discover music from your favorite artists.</p>

        {view === 'home' && (
          <>
            <input
              id="search"
              type="text"
              placeholder="Search for an artist..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <h2 className="section-title">
              Your Favorite Artists
            </h2>

            <div className="albums-container">
              {filteredArtists.map((artist) => (
                <div
                  className="album-card"
                  key={artist.name}
                  onClick={() => openArtist(artist.name)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      openArtist(artist.name);
                    }
                  }}
                >
                  <img
                    src={
                      artistImages[artist.name] ||
                      FALLBACK_IMAGE
                    }
                    alt={artist.name}
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = FALLBACK_IMAGE;
                    }}
                  />

                  <h3>{artist.name}</h3>
                  <p>View songs</p>
                </div>
              ))}
            </div>

            {filteredArtists.length === 0 && (
              <p>No artists found.</p>
            )}
          </>
        )}

        {view === 'artist' && (
          <div className="album-details">
            <button
              type="button"
              className="back-button"
              onClick={() => changeView('home')}
            >
              ← Back to artists
            </button>

            <h2>{selectedArtist}</h2>

            {loading && <p>Loading songs...</p>}
            {error && <p>{error}</p>}

            {!loading && tracks.length > 0 && (
              <>
                <p>{tracks.length} songs found.</p>
                <ul>{tracks.map(renderTrack)}</ul>
              </>
            )}
          </div>
        )}

        {view === 'library' && (
          <div className="album-details">
            <h2>❤️ Your Library</h2>
            <p>{favorites.length} saved songs</p>

            {favorites.length === 0 ? (
              <p>No favorites yet. Tap 🤍 on a song!</p>
            ) : (
              <ul>{favorites.map(renderTrack)}</ul>
            )}
          </div>
        )}

        {view === 'playlists' && (
          <div className="album-details">
            <h2>🎧 Your Playlists</h2>

            <form
              className="playlist-form"
              onSubmit={createPlaylist}
            >
              <input
                type="text"
                placeholder="Name your playlist..."
                value={playlistName}
                onChange={(event) =>
                  setPlaylistName(event.target.value)
                }
                maxLength={60}
              />

              <button type="submit">
                + Create Playlist
              </button>
            </form>

            {playlists.length === 0 ? (
              <p>No playlists yet. Create your first one!</p>
            ) : (
              <div className="playlist-grid">
                {playlists.map((playlist) => (
                  <button
                    type="button"
                    className="playlist-card"
                    key={playlist.id}
                    onClick={() => openPlaylist(playlist.id)}
                  >
                    <span>🎵</span>
                    <strong>{playlist.name}</strong>
                    <small>
                      {playlist.tracks.length} songs
                    </small>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'playlist' && selectedPlaylist && (
          <div className="album-details">
            <button
              type="button"
              className="back-button"
              onClick={() => changeView('playlists')}
            >
              ← Back to playlists
            </button>

            <div className="playlist-header">
              <div>
                <h2>🎵 {selectedPlaylist.name}</h2>
                <p>
                  {selectedPlaylist.tracks.length} songs
                </p>
              </div>

              <button
                type="button"
                className="delete-playlist-button"
                onClick={() =>
                  deletePlaylist(selectedPlaylist.id)
                }
              >
                🗑️ Delete playlist
              </button>
            </div>

            {selectedPlaylist.tracks.length === 0 ? (
              <p>
                This playlist is empty.
                Open an artist and press ➕ to add songs.
              </p>
            ) : (
              <ul>{selectedPlaylist.tracks.map(renderTrack)}</ul>
            )}
          </div>
        )}
      </main>

      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(event) =>
          setCurrentTime(event.currentTarget.currentTime)
        }
        onLoadedMetadata={(event) =>
          setDuration(event.currentTarget.duration)
        }
        onDurationChange={(event) =>
          setDuration(event.currentTarget.duration)
        }
        onEnded={() => setIsPlaying(false)}
      />

      <div className="music-player">
        <div className="player-song">
          {currentTrack?.artworkUrl100 ? (
            <img
              src={currentTrack.artworkUrl100}
              alt=""
              className="player-cover"
            />
          ) : (
            <span>🎵</span>
          )}

          <div>
            <h4>
              {currentTrack?.trackName || 'No song selected'}
            </h4>
            <p>
              {currentTrack?.artistName || 'Choose a song'}
            </p>
          </div>
        </div>

        <div className="player-center">
          <div className="player-controls">
            <button
              type="button"
              onClick={() => changeTrack(-1)}
              aria-label="Previous song"
            >
              ⏮
            </button>

            <button
              type="button"
              className="play-button"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>

            <button
              type="button"
              onClick={() => changeTrack(1)}
              aria-label="Next song"
            >
              ⏭
            </button>
          </div>

          <div className="progress-container">
            <span>{formatTime(currentTime)}</span>

            <input
              type="range"
              min="0"
              max={duration || 0}
              step="1"
              value={Math.min(currentTime, duration || 0)}
              onChange={seekTrack}
              aria-label="Song progress"
            />

            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="player-volume">
          <span>🔊</span>

          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(event) =>
              setVolume(Number(event.target.value))
            }
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
  );
}

export default App;
