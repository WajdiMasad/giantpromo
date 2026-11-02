import http from "node:http";

const PORT = 5000;
const TARGET_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  // Forward /sage/callback?... -> http://localhost:3000/api/sage/callback?...
  const targetPath = url.startsWith("/api/") ? url : `/api${url}`;
  const location = `${TARGET_ORIGIN}${targetPath}`;
  res.writeHead(302, { Location: location });
  res.end(`Redirecting to ${location}`);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Sage OAuth Callback Bridge listening on http://localhost:${PORT}/sage/callback -> ${TARGET_ORIGIN}/api/sage/callback`);
});
