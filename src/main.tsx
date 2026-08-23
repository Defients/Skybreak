import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { AudioProvider } from "./audio/AudioManager";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AudioProvider>
      <App />
    </AudioProvider>
  </React.StrictMode>
);
