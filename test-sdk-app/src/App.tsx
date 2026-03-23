import type { ReactElement } from "react";

import { IotaAuthProvider } from "../../sdk";

import DevPanel from "./DevPanel";

const BACKEND_URL = "http://localhost:3000";

export default function App(): ReactElement {
  return (
    <IotaAuthProvider backendUrl={BACKEND_URL}>
      <DevPanel backendUrl={BACKEND_URL} />
    </IotaAuthProvider>
  );
}
