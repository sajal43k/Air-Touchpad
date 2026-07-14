import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

interface SessionState {
  x: number;
  y: number;
  click: boolean;
  doubleClick: boolean;
  active: boolean;
  lastUpdated: number;
}

const sessions: Record<string, SessionState> = {};

const app = express();
const PORT = 3000;

app.use(express.json());

// API endpoints
app.post("/api/coords", (req, res) => {
  const session = (req.query.session as string || "default").toUpperCase();
  const { x, y, click, doubleClick, active } = req.body;
  
  sessions[session] = {
    x: typeof x === "number" ? x : 50,
    y: typeof y === "number" ? y : 50,
    click: !!click,
    doubleClick: !!doubleClick,
    active: !!active,
    lastUpdated: Date.now(),
  };
  
  res.json({ success: true, session });
});

app.get("/api/coords", (req, res) => {
  const session = (req.query.session as string || "default").toUpperCase();
  const state = sessions[session] || {
    x: 50,
    y: 50,
    click: false,
    doubleClick: false,
    active: false,
    lastUpdated: 0,
  };
  
  // Return state and reset click flags so the polling consumer only processes them once
  res.json(state);
  
  if (sessions[session]) {
    sessions[session].click = false;
    sessions[session].doubleClick = false;
  }
});

// Serve static assets in production, or mount Vite dev server in development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
