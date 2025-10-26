import { Outlet, Link } from 'react-router-dom';
import { BarChart3,AlertCircle } from 'lucide-react';

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <h1 className="text-xl font-bold text-gray-900">Zeta Sentinel</h1>
              <div className="flex gap-4">
                <Link
                  to="/"
                  className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded"
                >
                  <BarChart3 size={20} />
                  Dashboard
                </Link>
                <Link
                  to="/alerts"
                  className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded"
                >
                  <AlertCircle size={20} />
                  Alerts
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <Outlet />
    </div>
  );
}