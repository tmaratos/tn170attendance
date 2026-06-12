import { getInitials } from '../data/mockData';

export default function SearchMember({
  query,
  onQueryChange,
  results,
  onSelect,
  selectedId,
  popularSearches = [],
  hideResults = false,
  showScanCard = true,
  compact = false,
}) {
  return (
    <div>
      <div className="search-box">
        <span className="search-icon" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
        <input
          type="text"
          className="search-input"
          placeholder="Search name or CAPID..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          autoFocus={!compact}
        />
      </div>

      {popularSearches.length > 0 && (
        <div className="popular-searches">
          <div className="popular-searches-label">Popular Searches</div>
          <div className="popular-tags">
            {popularSearches.map((term) => (
              <button
                key={term}
                type="button"
                className="popular-tag"
                onClick={() => onQueryChange(term)}
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}

      {showScanCard && (
        <button type="button" className="scan-card-btn">
          <span aria-hidden="true">|||</span> SCAN CARD
        </button>
      )}

      {!hideResults && results.length > 0 && (
        <div className="member-results">
          {results.map((member) => (
            <div
              key={member.id}
              className={`member-result ${selectedId === member.id ? 'selected' : ''}`}
              onClick={() => onSelect(member)}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(member)}
              role="button"
              tabIndex={0}
            >
              <div className="avatar">{getInitials(member.name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="member-result-name">{member.name}</div>
                <div className="member-result-meta">
                  {member.grade} <span aria-hidden="true">&bull;</span> CAPID: {member.capid}
                </div>
              </div>
              {selectedId === member.id && <span aria-hidden="true">OK</span>}
            </div>
          ))}
        </div>
      )}

      {query && !hideResults && results.length === 0 && (
        <div className="empty-state" style={{ color: 'rgba(255,255,255,0.5)', padding: '12px 0' }}>
          No members found
        </div>
      )}
    </div>
  );
}
