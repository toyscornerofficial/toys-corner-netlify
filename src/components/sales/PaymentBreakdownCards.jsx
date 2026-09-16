import { formatCurrency } from '../../utils/dateHelpers';

const METHOD_STYLES = {
  Cash: { icon: 'fa-money-bill-wave', color: '#22C55E' },
  UPI: { icon: 'fa-mobile-screen-button', color: '#4F46E5' },
  Card: { icon: 'fa-credit-card', color: '#F59E0B' },
};

/**
 * compact: smaller single-line cards, meant to sit at the top of a page
 * without taking much vertical space (used on the Sales/POS page).
 *
 * onMethodClick + activeMethod: when provided, each card becomes clickable
 * (used to filter a list below by that payment method) and highlights
 * whichever method is currently selected.
 */
export default function PaymentBreakdownCards({
  breakdown,
  title = "Today's Payment Breakdown",
  compact = false,
  onMethodClick,
  activeMethod,
}) {
  const clickable = Boolean(onMethodClick);

  return (
    <div className="card border-0 shadow-sm" style={{ borderRadius: '14px' }}>
      <div className={compact ? 'card-body py-2 px-3' : 'card-body'}>
        {!compact && <h6 className="fw-bold mb-3">{title}</h6>}
        {compact && (
          <div className="d-flex justify-content-between align-items-center mb-2">
            <span className="fw-semibold text-secondary" style={{ fontSize: '0.78rem' }}>{title}</span>
            {clickable && activeMethod && (
              <button
                className="btn btn-sm btn-link p-0 text-decoration-none"
                style={{ fontSize: '0.72rem' }}
                onClick={() => onMethodClick(activeMethod)}
              >
                Clear filter <i className="fa-solid fa-xmark ms-1" />
              </button>
            )}
          </div>
        )}
        <div className="row g-2">
          {Object.entries(breakdown).map(([method, data]) => {
            const style = METHOD_STYLES[method] ?? { icon: 'fa-wallet', color: '#4F46E5' };
            const isActive = activeMethod === method;

            const cardInner = (
              <div
                className={`d-flex align-items-center gap-2 rounded ${compact ? 'p-2' : 'p-3 gap-3'}`}
                style={{
                  background: isActive ? `${style.color}22` : `${style.color}0D`,
                  border: `1px solid ${isActive ? style.color : `${style.color}33`}`,
                  cursor: clickable ? 'pointer' : 'default',
                  transition: 'background 0.15s ease',
                }}
              >
                <div
                  className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                  style={{
                    width: compact ? 32 : 44,
                    height: compact ? 32 : 44,
                    background: `${style.color}22`,
                    color: style.color,
                  }}
                >
                  <i className={`fa-solid ${style.icon} ${compact ? '' : 'fs-5'}`} style={compact ? { fontSize: '0.85rem' } : {}} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  {compact ? (
                    <div className="d-flex justify-content-between align-items-baseline">
                      <span className="fw-bold" style={{ color: style.color, fontSize: '0.82rem' }}>{method}</span>
                      <span className="text-secondary" style={{ fontSize: '0.72rem' }}>
                        {data.count} order{data.count === 1 ? '' : 's'}
                      </span>
                      <span className="fw-semibold" style={{ fontSize: '0.82rem' }}>{formatCurrency(data.total)}</span>
                    </div>
                  ) : (
                    <>
                      <div className="fw-bold" style={{ color: style.color }}>{method}</div>
                      <div className="d-flex justify-content-between text-secondary" style={{ fontSize: '0.8rem' }}>
                        <span>Orders:</span>
                        <span className="fw-semibold text-dark">{data.count}</span>
                      </div>
                      <div className="d-flex justify-content-between text-secondary" style={{ fontSize: '0.8rem' }}>
                        <span>Amount:</span>
                        <span className="fw-semibold text-dark">{formatCurrency(data.total)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );

            return (
              <div key={method} className="col-md-4">
                {clickable ? (
                  <button
                    type="button"
                    className="btn p-0 border-0 w-100 text-start"
                    onClick={() => onMethodClick(method)}
                    style={{ background: 'none' }}
                  >
                    {cardInner}
                  </button>
                ) : (
                  cardInner
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
