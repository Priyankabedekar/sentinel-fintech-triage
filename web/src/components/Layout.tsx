import { Outlet, Link, useLocation } from "react-router-dom";
import { BarChart3, AlertCircle, Home, Upload } from "lucide-react";
import "../styles/Layout.css";

export default function Layout() {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="layout">
      <a href="#main-content" className="skip-to-main">
        Skip to main content
      </a>

      <nav className="nav" role="navigation" aria-label="Main navigation">
        <div className="nav-container">
          <div className="nav-brand">
            <Home className="nav-icon" aria-hidden="true" />
            <h1 className="nav-title">Zeta Sentinel</h1>
          </div>

          <ul className="nav-links" role="menubar">
            <li role="none">
              <Link
                to="/"
                className={`nav-link ${isActive("/") ? "nav-link-active" : ""}`}
                role="menuitem"
              >
                <BarChart3 size={20} aria-hidden="true" />
                <span>Dashboard</span>
              </Link>
            </li>
            <li role="none">
              <Link
                to="/alerts"
                className={`nav-link ${
                  isActive("/alerts") ? "nav-link-active" : ""
                }`}
                role="menuitem"
              >
                <AlertCircle size={20} aria-hidden="true" />
                <span>Alerts</span>
              </Link>
            </li>
            <li role="none">
              <Link
                to="/ingest"
                className={`nav-link ${
                  isActive("/ingest") ? "nav-link-active" : ""
                }`}
                role="menuitem"
              >
                <Upload size={20} aria-hidden="true" />
                <span>Ingest</span>
              </Link>
            </li>
          </ul>
        </div>
      </nav>

      <main id="main-content" className="main-content" role="main">
        <Outlet />
      </main>
    </div>
  );
}
