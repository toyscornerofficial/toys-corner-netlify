export default function Pagination({ page, pageSize, totalCount, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalCount);

  if (totalCount === 0) return null;

  return (
    <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 pt-3">
      <div className="text-secondary small">
        Showing {startItem}–{endItem} of {totalCount}
      </div>
      <div className="d-flex align-items-center gap-2">
        <button
          className="btn btn-sm btn-light"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <i className="fa-solid fa-chevron-left" />
        </button>
        <span className="small text-secondary">
          Page {page} of {totalPages}
        </span>
        <button
          className="btn btn-sm btn-light"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <i className="fa-solid fa-chevron-right" />
        </button>
      </div>
    </div>
  );
}
