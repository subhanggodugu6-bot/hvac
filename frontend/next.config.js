/** @type {import('next').NextConfig} */
const isNextDev = process.env.NODE_ENV === 'development';

const nextConfig = {
  reactStrictMode: true,
  // Isolate `next dev` from `next build` / `next start`. Running a production
  // build while the dev server is up used to wipe `.next/static/css/app/layout.css`
  // and leave localhost:3000 as unstyled HTML (Times New Roman, TELNO DATA).
  distDir: isNextDev ? '.next-dev' : '.next',
  async rewrites() {
    if (!isNextDev) return [];
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:8000/api/:path*',
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/agents/plant control/:path*',
        destination: '/agents/plant-control/:path*',
        permanent: false,
      },
      {
        source: '/agents/plant%20control/:path*',
        destination: '/agents/plant-control/:path*',
        permanent: false,
      },
      {
        source: '/agents/energy intelligence',
        destination: '/agents/operations-maintenance',
        permanent: false,
      },
      {
        source: '/agents/energy_intelligence',
        destination: '/agents/operations-maintenance',
        permanent: false,
      },
      {
        source: '/agents/energy%20intelligence',
        destination: '/agents/operations-maintenance',
        permanent: false,
      },
      { source: '/agents/energy-intelligence', destination: '/agents/operations-maintenance', permanent: false },
      { source: '/agents/ventilation-airflow/outdoor-air', destination: '/agents/ventilation-airflow/economy-cycle', permanent: false },
      { source: '/agents/ventilation-airflow/airflow-optimization', destination: '/agents/ventilation-airflow', permanent: false },
      { source: '/agents/ventilation-airflow/airflow-balancing', destination: '/agents/ventilation-airflow', permanent: false },
      { source: '/agents/ventilation-airflow/fan-optimization', destination: '/agents/ventilation-airflow', permanent: false },
      { source: '/agents/variable-speed/variable-head-pressure-water-cooled', destination: '/agents/variable-speed/water-cooled-head-pressure', permanent: false },
      { source: '/agents/variable-speed/pump-speed', destination: '/agents/variable-speed', permanent: false },
      { source: '/agents/variable-speed/condenser-water-pump', destination: '/agents/variable-speed', permanent: false },
      { source: '/agents/variable-speed/cooling-tower-fan', destination: '/agents/variable-speed', permanent: false },
      { source: '/agents/plant-control/heating-water-reset', destination: '/agents/plant-control/temperature-reset?mode=HHW', permanent: false },
      { source: '/agents/plant-control/chilled-water-reset', destination: '/agents/plant-control/temperature-reset?mode=CHW', permanent: false },
      { source: '/agents/plant-control/condenser-water-reset', destination: '/agents/plant-control/temperature-reset?mode=CW', permanent: false },
      { source: '/agents/energy-operations/energy', destination: '/agents/operations-maintenance', permanent: false },
      { source: '/agents/energy-operations/operations', destination: '/agents/operations-maintenance', permanent: false },
      { source: '/agents/energy-operations/performance', destination: '/agents/operations-maintenance', permanent: false },
      { source: '/agents/energy-operations/savings', destination: '/agents/operations-maintenance', permanent: false },
      { source: '/agents/energy-operations/anomalies', destination: '/agents/operations-maintenance', permanent: false },
      { source: '/agents/energy-operations/coordination', destination: '/agents/operations-maintenance', permanent: false },
      { source: '/agents/energy-operations/recommendations', destination: '/agents/operations-maintenance', permanent: false },
      { source: '/agents/energy-operations/reports', destination: '/agents/operations-maintenance', permanent: false },
      { source: '/agents/operations-maintenance/energy-planning', destination: '/agents/operations-maintenance/energy-management-planning', permanent: false },
      { source: '/agents/energy-operations/opportunity-17', destination: '/agents/operations-maintenance/energy-management-planning', permanent: false },
      { source: '/agents/energy-operations/opportunity-18', destination: '/agents/operations-maintenance/training-awareness', permanent: false },
      { source: '/agents/operations-maintenance/energy-efficiency', destination: '/agents/operations-maintenance/equipment-maintenance', permanent: false },
      { source: '/agents/energy-operations/opportunity-19', destination: '/agents/operations-maintenance/equipment-maintenance', permanent: false },
      { source: '/agents/energy-operations/opportunity-20', destination: '/agents/operations-maintenance/control-software', permanent: false },
      { source: '/agents/energy-operations', destination: '/agents/operations-maintenance', permanent: false },
    ];
  },
};

module.exports = nextConfig;
