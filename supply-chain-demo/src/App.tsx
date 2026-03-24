import { Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./components/ProtectedRoute";
import { Landing } from "./pages/Landing";
import { ShipmentDetail } from "./pages/ShipmentDetail";
import { Shipments } from "./pages/Shipments";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/shipments"
        element={
          <ProtectedRoute>
            <Shipments />
          </ProtectedRoute>
        }
      />
      <Route
        path="/shipment/:id"
        element={
          <ProtectedRoute>
            <ShipmentDetail />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
