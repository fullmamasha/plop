import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";

/** Serves the field-test page at /test as well as /test.html. */
function prettyTestUrl(): Plugin {
  return {
    name: "plop-pretty-test-url",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/test" || req.url === "/test/") req.url = "/test.html";
        next();
      });
    },
  };
}

/**
 * The dev gallery and field test only. The extension itself is built by
 * `scripts/build.mjs`, which needs two passes that this file cannot express.
 */
export default defineConfig({
  plugins: [preact(), prettyTestUrl()],
  build: {
    outDir: "dist-pages",
    rollupOptions: { input: { gallery: "index.html", test: "test.html" } },
  },
});
