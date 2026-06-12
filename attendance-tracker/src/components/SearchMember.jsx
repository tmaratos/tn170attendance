import { getInitials } from '../data/mockData';

export default function SearchMember({
  query,
  onQueryChange,
  results,
  onSelect,
  selectedId,
  popularSearches = [],
}) {
  return (
    <div>
      <div className="search-box">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          className="search-input"
          placeholder="Search name, CAPID, or grade..."
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          autoFocus
        />
      </div>

      {popularSearches.length > 0 && (
        <div className="popular-searches">
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginRight: 8 }}>
            Popular:
          </span>
          {popularSearches.map((term) => (
            <button
              key={term}
              className="popular-tag"
              onClick={() => onQueryChange(term)}
            >
              {term}
            </button>
          ))}
        </div>
      )}

      {results.length > 0 && (
        <div className="member-results">
          {results.map((member) => (
            <div
              key={member.id}
              className={`member-result ${selectedId === member.id ? 'selected' : ''}`}
              onClick={() => onSelect(member)}
            >
              <div className="avatar">{getInitials(member.name)}</div>
              <div>
                <div className="member-result-name">{member.name}</div>
                <div className="member-result-meta">
                  {member.grade} • CAPID {member.capid} • {member.role}
                </div>
              </div>
              {selectedId === member.id && <span>✓</span>}
            </div>
          ))}
        </div>
      )}

      {query && results.length === 0 && (
        <div className="empty-state" style={{ color: 'rgba(255,255,255,0.5)' }}>
          No members found matching &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  );
}
