import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import "./styles.css";
import "./social.css";
import "./cozy.css";
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
