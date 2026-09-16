import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export default function SimpleBarChart({ title, labels, values, color = '#F59E0B', horizontal = false }) {
  const data = {
    labels,
    datasets: [
      {
        label: title,
        data: values,
        backgroundColor: color,
        borderRadius: 6,
        maxBarThickness: 36,
      },
    ],
  };

  const options = {
    indexAxis: horizontal ? 'y' : 'x',
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: horizontal }, beginAtZero: true },
      y: { grid: { display: !horizontal }, beginAtZero: true },
    },
  };

  return (
    <div className="card border-0 shadow-sm h-100" style={{ borderRadius: '14px' }}>
      <div className="card-body">
        <h6 className="fw-bold mb-3">{title}</h6>
        <div style={{ height: 220 }}>
          <Bar data={data} options={options} />
        </div>
      </div>
    </div>
  );
}
