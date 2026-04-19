import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Protected } from "./Protected";
import { AuthBar } from "./components/AuthBar";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { ProjectPage } from "./pages/ProjectPage";
import { Settings } from "./pages/Settings";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <Protected>
              <AuthBar />
              <Home />
            </Protected>
          }
        />
        <Route
          path="/projects/:id"
          element={
            <Protected>
              <AuthBar />
              <ProjectPage />
            </Protected>
          }
        />
        <Route
          path="/settings"
          element={
            <Protected>
              <AuthBar />
              <Settings />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
