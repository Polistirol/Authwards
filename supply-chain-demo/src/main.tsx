import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { IotaAuthProvider } from "../../sdk";
import App from "./App";
import "./index.css";

const backendUrl = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3000";

const root = document.getElementById("root");
if (!root) throw new Error("Root element missing");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <IotaAuthProvider backendUrl={backendUrl} telegramLoginEnabled>
        <App />
      </IotaAuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
