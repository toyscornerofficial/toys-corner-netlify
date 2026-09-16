const RANK_COLORS = ['#F59E0B', '#94A3B8', '#B45309']; // gold, silver, bronze for top 3
const RANK_ICONS = ['fa-trophy', 'fa-medal', 'fa-medal'];

export default function TopSellersLeaderboard({ items }) {
  const maxQty = Math.max(...items.map((i) => i.qty), 1);

  return (
    <div className="card border-0 shadow-sm h-100" style={{ borderRadius: '14px' }}>
      <div className="card-body">
        <h6 className="fw-bold mb-3">
          <i className="fa-solid fa-fire me-2" style={{ color: '#F59E0B' }} />
          Top Selling Toys
        </h6>

        {items.length === 0 ? (
          <div className="text-secondary small text-center py-4">No sales yet to rank.</div>
        ) : (
          <div className="d-flex flex-column gap-3">
            {items.map((item, i) => {
              const isTop3 = i < 3;
              const rankColor = isTop3 ? RANK_COLORS[i] : '#CBD5E1';
              const barWidth = (item.qty / maxQty) * 100;

              return (
                <div key={item.name} className="d-flex align-items-center gap-3">
                  <div
                    className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0 fw-bold"
                    style={{
                      width: 34,
                      height: 34,
                      background: isTop3 ? `${rankColor}22` : '#F1F5F9',
                      color: rankColor,
                      fontSize: isTop3 ? '0.95rem' : '0.8rem',
                    }}
                  >
                    {isTop3 ? <i className={`fa-solid ${RANK_ICONS[i]}`} /> : i + 1}
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="fw-semibold text-truncate" style={{ fontSize: '0.85rem' }}>{item.name}</span>
                      <span className="fw-bold ms-2" style={{ fontSize: '0.85rem', color: rankColor }}>{item.qty} sold</span>
                    </div>
                    <div className="rounded-pill" style={{ height: 6, background: '#F1F5F9', overflow: 'hidden' }}>
                      <div
                        className="rounded-pill h-100"
                        style={{ width: `${barWidth}%`, background: rankColor, transition: 'width 0.4s ease' }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
