import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

export default function SalesLineChart({ title, labels, values, color = '#4F46E5' }) {
  const data = {
    labels,
    datasets: [
      {
        label: title,
        data: values,
        borderColor: color,
        backgroundColor: `${color}22`,
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointBackgroundColor: color,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { color: '#F1F5F9' } },
      x: { grid: { display: false } },
    },
  };

  return (
    <div className="card border-0 shadow-sm h-100" style={{ borderRadius: '14px' }}>
      <div className="card-body">
        <h6 className="fw-bold mb-3">{title}</h6>
        <div style={{ height: 220 }}>
          <Line data={data} options={options} />
        </div>
      </div>
    </div>
  );
}
