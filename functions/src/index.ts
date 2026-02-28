import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { exec } from 'child_process';

dotenv.config();

import authRoutes from './routes/auth';
import workspaceRoutes from './routes/workspaces';
import itemRoutes from './routes/items';
import contractRoutes from './routes/contracts';
import adminRoutes from './routes/admin';

// Run DB migrations asynchronously in the background after startup
// so the HTTP server can pass health checks immediately
if (process.env.NODE_ENV === 'production') {
  const migrationsDir = path.resolve(__dirname, '../');
  exec(
    'npx prisma migrate deploy',
    { cwd: migrationsDir, env: { ...process.env } },
    (err, stdout, stderr) => {
      if (err) {
        console.error('[STARTUP] Prisma migration failed:', stderr || err.message);
      } else {
        console.log('[STARTUP] Prisma migrations applied:', stdout.trim());
      }
    }
  );
}

const app = express();
const port = process.env.PORT || 8080;

app.use(helmet());
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'https://afm-smart-contracts-app.web.app',
      'https://afm-smart-contracts-app.firebaseapp.com'
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});



router.use('/auth', authRoutes);
router.use('/workspaces', workspaceRoutes);
router.use('/items', itemRoutes);
router.use('/contracts', contractRoutes);
router.use('/admin', adminRoutes);

app.use('/api', router);
app.use('/', router);

import { onRequest } from 'firebase-functions/v2/https';

// Export the Express app as a Firebase Cloud Function
export const api = onRequest({ memory: "512MiB" }, app);
