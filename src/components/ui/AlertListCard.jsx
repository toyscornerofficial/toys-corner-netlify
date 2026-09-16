export default function AlertListCard({ title, icon, color, items, emptyText, renderItem, onViewAll }) {
  return (
    <div className="card border-0 shadow-sm h-100" style={{ borderRadius: '14px' }}>
      <div className="card-body">
        <div className="d-flex align-items-center gap-2 mb-3">
          <i className={`fa-solid ${icon}`} style={{ color }} />
          <h6 className="fw-bold mb-0">{title}</h6>
          {items.length > 0 && (
            <span className="badge rounded-pill" style={{ background: color }}>
              {items.length}
            </span>
          )}
          {onViewAll && items.length > 0 && (
            <button className="btn btn-sm btn-link ms-auto p-0 text-decoration-none" onClick={onViewAll}>
              View All <i className="fa-solid fa-arrow-right ms-1" style={{ fontSize: '0.7rem' }} />
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="text-secondary small">{emptyText}</div>
        ) : (
          <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
            {items.slice(0, 5).map((item, i) => (
              <li key={i} className="d-flex justify-content-between align-items-center small">
                {renderItem(item)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
