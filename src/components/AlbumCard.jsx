
function AlbumCard({ title, artist, image, onClick }) {
  return (
    <div className="album-card" onClick={onClick}>
      <img src={image} alt={title} />
      <h3>{title}</h3>
      <p>{artist}</p>
    </div>
  );
}

export default AlbumCard;
