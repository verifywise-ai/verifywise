import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline } from "@mui/material";
import AITrustCentrePublic from "./presentation/pages/AITrustCentrePublic/index";
import { Provider } from "react-redux";
import { store, persistor } from "./application/redux/store";
import { PersistGate } from "redux-persist/integration/react";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <CssBaseline />
        <AITrustCentrePublic />
      </PersistGate>
    </Provider>
  </React.StrictMode>,
);
