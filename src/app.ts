import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import passport from './config/passport';
import { GameController } from './controllers/game.controller';
import { HealthController } from './controllers/health.controller';
import { AuthController } from './controllers/auth.controller';
import { AdminController } from './controllers/admin.controller';
import { sessionMiddleware } from './middleware/session.middleware';
import http from 'http'; // Add HTTP import for socket.io
import { SocketService } from './services/socket.service'; // Import the socket service

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 5432;

// Create HTTP server (required for socket.io)
const server = http.createServer(app);

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Initialize Passport
app.use(passport.initialize());

// Add session middleware to track anonymous users
app.use(sessionMiddleware);

// Rate limiting middleware - Disabled since Cloudflare handles rate limiting
// const apiLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 500, // increased from 100 to 500 requests per windowMs
//   standardHeaders: true,
//   message: { error: 'Too many requests, please try again later' }
// });

// Apply rate limiter to all requests
// app.use(apiLimiter);

// Stricter rate limit for guess endpoint - Also disabled
// const guessLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 200, // increased from 50 to 200 guesses per windowMs
//   standardHeaders: true,
//   message: { error: 'Too many guesses, please try again later' }
// });

// Health Check Routes
app.get('/api/health', HealthController.getStatus);
app.get('/api/health/db', HealthController.getDatabaseStatus);

// Game Routes
app.get('/api/game/daily', GameController.getDailyGame);
app.get('/api/players', GameController.getAllPlayers);
app.post('/api/game/guess', GameController.submitGuess); // Removed guessLimiter
app.get('/api/game/stats', GameController.getUserStats);
app.get('/api/game/daily/complete', GameController.getDailyGameComplete);

// Debug routes - only available in development
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/game/debug/answer', GameController.getDebugDailyAnswer);
  console.log('Debug routes enabled');
}

// Authentication Routes
app.post('/api/auth/register', AuthController.register);

// Google Authentication Routes
app.get('/api/auth/google', AuthController.googleAuth);
app.get('/api/auth/google/callback', AuthController.googleCallback);

// Admin Routes - protected by API key
app.post('/api/admin/generate-daily-answers', AdminController.generateDailyAnswers);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Initialize Socket.io service
const socketService = new SocketService(server);

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('Available API routes:');
  console.log('- GET /api/health');
  console.log('- GET /api/health/db');
  console.log('- GET /api/game/daily');
  console.log('- GET /api/players');
  console.log('- POST /api/game/guess');
  console.log('- GET /api/game/stats');
  console.log('- GET /api/game/daily/complete');
  if (process.env.NODE_ENV !== 'production') {
    console.log('- GET /api/game/debug/answer (DEBUG)');
  }
  console.log('- POST /api/auth/register');
  console.log('- GET /api/auth/google');
  console.log('- GET /api/auth/google/callback');
  console.log('- POST /api/admin/generate-daily-answers');
  console.log('- Socket.io multiplayer service enabled');
});

export default app; 