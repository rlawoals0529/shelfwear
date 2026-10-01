export interface ShelfMapEntry {
  id: string;
  label: string;
}

export default function ShelfMap({ entries }: { entries: readonly ShelfMapEntry[] }) {
  return (
    <nav className="shelf-map-nav" aria-label="Jump around this shelf">
      <a className="shelf-map-home" href="#shelfwear-top" aria-label="Back to the top of Shelfwear">
        <span className="shelf-map-arrow" aria-hidden="true">↑</span>
        <span>
          <small>On this page</small>
          <b>Shelf map</b>
        </span>
      </a>
      <div className="shelf-map-track">
        {entries.map((entry, index) => (
          <a className="shelf-map-link" href={`#${entry.id}`} key={entry.id}>
            <small>{String(index + 1).padStart(2, "0")}</small>
            <span>{entry.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
