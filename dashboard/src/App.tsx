import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { IotaAuthProvider } from "./sdk";
import Dashboard from "./pages/Dashboard";
import DemoApp from "./pages/DemoApp";
import Home from "./pages/Home";

const backendUrl = import.meta.env.VITE_BACKEND_URL as string;

function App() {
  return (
    <IotaAuthProvider backendUrl={backendUrl}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/demo" element={<DemoApp />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </IotaAuthProvider>
  );
}

export default App;
