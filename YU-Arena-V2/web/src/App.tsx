import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import CreateDrop from "./components/CreateDrop";
import DropDetail from "./components/DropDetail";
import ClaimPage from "./components/ClaimPage";
import Results from "./components/Results";
import Settings from "./components/Settings";

function AppRoutes() {
  const { operator, loading, login, logout } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return <div className="app"><p className="text-muted" style={{ textAlign: "center", marginTop: 80 }}>Loading...</p></div>;
  }

  return (
    <Routes>
      <Route path="/claim/:dropId" element={<ClaimPage />} />

      <Route
        path="/login"
        element={
          operator ? (
            <Navigate to="/" replace />
          ) : (
            <Login onLogin={async (code) => { await login(code); navigate("/"); }} />
          )
        }
      />

      {!operator ? (
        <Route path="*" element={<Navigate to="/login" replace />} />
      ) : (
        <>
          <Route
            path="/"
            element={
              <Shell businessName={operator.business_name} onLogout={() => { logout(); navigate("/login"); }}>
                <Dashboard operatorId={operator.id} businessName={operator.business_name} />
              </Shell>
            }
          />
          <Route
            path="/drop/new"
            element={
              <Shell businessName={operator.business_name} onLogout={() => { logout(); navigate("/login"); }}>
                <CreateDrop />
              </Shell>
            }
          />
          <Route
            path="/drop/:id"
            element={
              <Shell businessName={operator.business_name} onLogout={() => { logout(); navigate("/login"); }}>
                <DropDetail />
              </Shell>
            }
          />
          <Route
            path="/results"
            element={
              <Shell businessName={operator.business_name} onLogout={() => { logout(); navigate("/login"); }}>
                <Results />
              </Shell>
            }
          />
          <Route
            path="/settings"
            element={
              <Shell businessName={operator.business_name} onLogout={() => { logout(); navigate("/login"); }}>
                <Settings businessName={operator.business_name} onLogout={() => { logout(); navigate("/login"); }} />
              </Shell>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  );
}

function Shell({ children }: { children: React.ReactNode; businessName: string; onLogout: () => void }) {
  return (
    <div className="app">
      <nav className="bottom-nav">
        <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
          Dashboard
        </NavLink>
        <NavLink to="/results" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
          Results
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
          Settings
        </NavLink>
      </nav>
      <div className="app-content">{children}</div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
