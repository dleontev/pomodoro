// AI-assisted implementation with OpenAI Codex, 2026-10-18.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const app = express();
const publicDirectory = fileURLToPath(new URL('./public/', import.meta.url));

app.disable('x-powered-by');
app.use((_request, response, next) => {
  response.set({
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  });
  next();
});

app.get('/health', (_request, response) => {
  response.set('Cache-Control', 'no-store').json({ status: 'ok' });
});
app.use(express.static(publicDirectory, { dotfiles: 'deny', maxAge: 0 }));
app.use((_request, response) => {
  response.status(404).type('text').send('Page not found. Return to / for your timer.');
});
app.use((error, _request, response, _next) => {
  const status = error.status >= 400 && error.status < 500 ? error.status : 500;
  if (status === 500) console.error('Request failed:', error.message);
  response.status(status).type('text').send(status === 500 ? 'Something went wrong.' : 'Request could not be served.');
});

// Preserve string ports: App Service on Windows may supply an IIS named pipe.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = process.env.PORT || 3000;
  const server = app.listen(port, (error) => {
    if (!error) console.log(`Pomodoro listening on ${port}`);
  });
  server.on('error', (error) => {
    console.error('Unable to start Pomodoro:', error.message);
    process.exitCode = 1;
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
