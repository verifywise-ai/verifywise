// import { StrictMode } from "react";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { createRoot } from "react-dom/client";
import * as jsxRuntime from "react/jsx-runtime";
import * as MUI from "@mui/material";
import * as emotionReact from "@emotion/react";
import * as emotionStyled from "@emotion/styled";
import * as ReactRouterDOM from "react-router-dom";
import App from "./App.tsx";
import "./presentation/styles/fonts.css";
import "./index.css";
import { Provider } from "react-redux";
import { persistor, store } from "./application/redux/store.ts";
import { PersistGate } from "redux-persist/integration/react";
// import { StyledEngineProvider } from "@mui/material";
import { BrowserRouter as Router } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./application/config/queryClient";

// Expose React and related libraries as globals for plugin UI bundles
(window as any).React = React;
(window as any).ReactDOM = ReactDOM;
(window as any).jsxRuntime = jsxRuntime;
(window as any).MUI = MUI;
(window as any).emotionReact = emotionReact;
(window as any).emotionStyled = emotionStyled;
(window as any).ReactRouterDOM = ReactRouterDOM;

createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <PersistGate
      loading={
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100vh",
          }}
        >
          Loading...
        </div>
      }
      persistor={persistor}
    >
      <QueryClientProvider client={queryClient}>
        <Router>
          <App />
        </Router>
      </QueryClientProvider>
    </PersistGate>
  </Provider>,
);
