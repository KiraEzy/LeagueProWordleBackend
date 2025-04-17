import express from 'express';
import { GameController } from '../controllers/game.controller';

const router = express.Router();

// Get complete daily game data
router.get('/daily/complete', GameController.getDailyGameComplete);
router.get('/daily', GameController.getDailyGame);
router.get('/players', GameController.getAllPlayers);
router.post('/guess', GameController.submitGuess);
router.get('/stats', GameController.getUserStats);

// Debug routes - only available in development
if (process.env.NODE_ENV !== 'production') {
  router.get('/debug/answer', GameController.getDebugDailyAnswer);
}

export const gameRouter = router; 