import express from 'express';
import { GameController } from '../controllers/game.controller';

const router = express.Router();

// Get complete daily game data
router.get('/api/daily/complete', GameController.getDailyGameComplete);
router.get('/api/daily', GameController.getDailyGame);
router.get('/api/players', GameController.getAllPlayers);
router.post('/api/guess', GameController.submitGuess);
router.get('/api/stats', GameController.getUserStats);

// Debug routes - only available in development
if (process.env.NODE_ENV !== 'production') {
  router.get('/api/debug/answer', GameController.getDebugDailyAnswer);
}

export const gameRouter = router; 