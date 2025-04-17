import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import passport from 'passport';
import session from 'express-session';
import './config/passport';
import { GameController } from './controllers/game.controller';
import { HealthController } from './controllers/health.controller';
import { AuthController } from './controllers/auth.controller';
import { AdminController } from './controllers/admin.controller';
import { setupSocketController } from './controllers/socket.controller';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Configure session middleware 
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
});

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

// Configure CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Parse JSON request body
app.use(express.json());

// Routes
// Health Check Routes
app.get('/health', HealthController.getStatus);
app.get('/health/db', HealthController.getDatabaseStatus);

// Game Routes
app.get('/game/daily', GameController.getDailyGame);
app.get('/game/players', GameController.getAllPlayers);
app.post('/game/guess', GameController.submitGuess);
app.get('/game/stats', GameController.getUserStats);
app.get('/game/daily/complete', GameController.getDailyGameComplete);

// Debug routes - only available in development
if (process.env.NODE_ENV !== 'production') {
  app.get('/game/debug/answer', GameController.getDebugDailyAnswer);
}

// Authentication Routes
app.post('/auth/register', AuthController.register);
app.get('/auth/google', AuthController.googleAuth);
app.get('/auth/google/callback', AuthController.googleCallback);

// Admin Routes - protected by API key
app.post('/admin/generate-daily-answers', AdminController.generateDailyAnswers);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Setup socket controller
setupSocketController(io);

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 