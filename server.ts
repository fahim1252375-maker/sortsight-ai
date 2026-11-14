import path from 'path';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createServer as createViteServer } from 'vite';
import { config } from './server/config.ts';
import { getDb } from './server/db/database.ts';
import { seedDatabase } from './server/db/seed.ts';
import { analyticsRouter } from './server/routes/analytics.ts';
import { authRouter } from './server/routes/auth.ts';
import { detectionRouter } from './server/routes/detection.ts';
import { operationsAdminRouter } from './server/routes/operationsAdmin.ts';
import { reviewsModelsRouter } from './server/routes/reviewsModels.ts';
import { sortingRouter } from './server/routes/sorting.ts';

export function createApp() {
  const db = getDb();
  // Always seed core roles/material taxonomy; demo tenants and demo credentials are opt-in in production.
  seedDatabase(db, config.seedDemoData);

  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: false, // Allow AI Studio preview iframe
    })
  );

  app.use(
    cors({
      origin: config.nodeEnv === 'production' ? [config.appUrl] : true,
      credentials: true,
    })
  );

  app.use(
    '/api',
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      max: config.rateLimitMaxRequests,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Rate limit exceeded. Slow down API requests.' },
    })
  );

  app.use(express.json({ limit: '12mb' }));

  app.use('/api/v1', authRouter);
  app.use('/api/v1', detectionRouter);
  app.use('/api/v1', sortingRouter);
  app.use('/api/v1', analyticsRouter);
  app.use('/api/v1', reviewsModelsRouter);
  app.use('/api/v1', operationsAdminRouter);

  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  return app;
}

async function startServer() {
  const app = createApp();

  if (config.nodeEnv !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`SortSight AI full-stack server listening on http://0.0.0.0:${config.port}`);
  });
}

// Only start listening if executed directly (not imported by Vitest)
const isTestEnv = Boolean(process.env.VITEST);
if (!isTestEnv) {
  startServer().catch((err) => {
    console.error('Failed to start SortSight AI server:', err);
    process.exit(1);
  });
}
