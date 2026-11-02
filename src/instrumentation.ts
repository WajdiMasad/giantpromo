export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NODE_ENV !== "production"
  ) {
    const http = await import("node:http");
    const targetOrigin =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const server = http.createServer((req, res) => {
      const url = req.url || "/";
      const targetPath = url.startsWith("/api/") ? url : `/api${url}`;
      const location = `${targetOrigin}${targetPath}`;
      res.writeHead(302, { Location: location });
      res.end(`Redirecting to ${location}`);
    });

    server.on("error", () => {
      // Port 5000 already bound by bridge script or another instance; ignore
    });

    server.listen(5000, "127.0.0.1");
  }
}
