import cors from 'cors';
import express from 'express';
import { DEFAULT_SERVER_PORT } from './config.js';
import { initializeSchema } from './db.js';
import authRoutes from './routes/authRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { startCollector } from './services/collector.js';

initializeSchema();
startCollector();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

app.listen(DEFAULT_SERVER_PORT, () => {
  console.log(`WiFi Monitor API running on port ${DEFAULT_SERVER_PORT}`);
});
