'use strict';

/*
 * glitcher — minimal static file server.
 *
 * All image processing happens client-side in the browser (Canvas API).
 * This server does nothing but hand out the static assets in ./public.
 * It is intentionally locked down: no body parsing, no dynamic routes, no
 * uploads — there is no attack surface for user-supplied data on the server.
 */

const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Don't advertise the framework.
app.disable('x-powered-by');

// Hardening headers. A strict Content-Security-Policy is the important one:
// it confines the page to its own origin, blocks inline script execution, and
// only permits images from same-origin, data: and blob: URLs (which is exactly
// what an in-browser image tool needs and nothing more).
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // Allow the bundled CSS file. No inline styles/scripts are used.
      "style-src 'self'",
      "script-src 'self'",
      // Imported images become data:/blob: URLs; canvas exports are blob:.
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ].join('; ')
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// Only GET/HEAD are meaningful for a static site; reject everything else early.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.set('Allow', 'GET, HEAD');
    return res.status(405).type('text/plain').send('Method Not Allowed');
  }
  next();
});

// Serve static assets. `express.static` resolves paths safely (no traversal
// outside PUBLIC_DIR) and won't serve dotfiles.
app.use(
  express.static(PUBLIC_DIR, {
    index: 'index.html',
    dotfiles: 'ignore',
    redirect: false,
    setHeaders(res) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  })
);

// Anything that wasn't a static file is a 404. No echoing of the requested
// path back to the client (avoids reflected-content surprises).
app.use((req, res) => {
  res.status(404).type('text/plain').send('Not Found');
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`glitcher running at http://localhost:${PORT}`);
});
