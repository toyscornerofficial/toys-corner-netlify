export default function StatCard({ icon, label, value, color = '#4F46E5', subtext }) {
  return (
    <div className="card border-0 shadow-sm h-100" style={{ borderRadius: '14px' }}>
      <div className="card-body d-flex align-items-center gap-3">
        <div
          className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
          style={{ width: 48, height: 48, background: `${color}1A`, color }}
        >
          <i className={`fa-solid ${icon} fs-5`} />
        </div>
        {/* minWidth: 0 is required here — without it, a flex child never
            shrinks below its content size, so text-truncate silently fails
            and long labels overflow outside the card instead of ellipsizing. */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="text-secondary text-truncate" style={{ fontSize: '0.78rem' }}>{label}</div>
          <div className="fw-bold text-truncate" style={{ fontSize: '1.1rem' }}>{value}</div>
          {subtext && <div className="text-secondary text-truncate" style={{ fontSize: '0.72rem' }}>{subtext}</div>}
        </div>
      </div>
    </div>
  );
}
