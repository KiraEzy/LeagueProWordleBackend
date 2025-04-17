import { Request, Response } from 'express';
import { GameService } from '../services/game.service';
import crypto from 'crypto';
import { Session } from 'express-session';
import { v4 as uuidv4 } from 'uuid';

// Extended request type for express-session
interface SessionRequest extends Request {
  session: {
    anonymous_id?: string;
  } & Session;
}

export class GameController {
  // Get daily game metadata (not the actual answer)
  static async getDailyGame(req: Request, res: Response): Promise<void> {
    try {
      const gameService = new GameService();
      
      // Create a date for today
      const today = new Date().toISOString().split('T')[0];
      
      // Generate a game token (used by frontend to validate the game session)
      const gameToken = gameService.getGameToken(today);
      
      // Return game metadata (not the actual answer)
      const gameInfo = {
        date: today,
        gameId: gameToken,
        maxAttempts: 6
      };
      
      res.json(gameInfo);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
  
  // Submit a guess
  static async submitGuess(req: Request, res: Response): Promise<void> {
    try {
      const { playerId } = req.body;
      
      if (!playerId || typeof playerId !== 'number') {
        res.status(400).json({ error: 'Invalid player ID' });
        return;
      }
      
      // Get session ID from the session
      const sessionId = (req.session as any)?.anonymous_id;
      console.log('Using session ID for guess:', sessionId);
      
      if (!sessionId) {
        res.status(400).json({ error: 'No session ID found' });
        return;
      }
      
      // Get user ID if authenticated
      const userId = (req as any).user?.id || null;
      
      const gameService = new GameService();
      const feedback = await gameService.processGuess(userId, sessionId, playerId);
      
      res.json(feedback);
    } catch (error: any) {
      // Determine the appropriate status code
      const statusCode = error.message.includes('Maximum attempts') ? 400 : 500;
      res.status(statusCode).json({ error: error.message });
    }
  }
  
  // Get user stats
  static async getUserStats(req: Request, res: Response): Promise<void> {
    try {
      // Get user ID from auth middleware
      const userId = (req as any).user?.id || null;
      
      // Get session ID from the session
      const sessionId = (req.session as any)?.anonymous_id;
      console.log('Using session ID for stats:', sessionId);
      
      if (!sessionId) {
        res.status(400).json({ error: 'No session ID found' });
        return;
      }
      
      const gameService = new GameService();
      const stats = await gameService.getUserStats(userId, sessionId);
      
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
  
  // Get all players (for the frontend dropdown)
  static async getAllPlayers(req: Request, res: Response): Promise<void> {
    try {
      const gameService = new GameService();
      const players = await gameService.getAllPlayers();
      
      res.json(players);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
  
  // DEVELOPMENT ONLY: Get today's answer for debugging
  static async getDebugDailyAnswer(req: Request, res: Response): Promise<void> {
    try {
      // Only allow in development environment
      if (process.env.NODE_ENV === 'production') {
        res.status(403).json({ error: 'Debug endpoints are not available in production' });
        return;
      }
      
      const gameService = new GameService();
      
      // Get the answer player ID
      const answerId = await gameService.getDailyAnswer();
      
      // Get the full player details
      const player = await gameService.getPlayerById(answerId);
      
      res.json({
        status: 'debug',
        message: 'DEBUG MODE - Today\'s answer',
        player: player
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get complete daily game data including previous guesses and stats for the current session/user
   * @param req Express request
   * @param res Express response
   */
  static async getDailyGameComplete(req: Request, res: Response): Promise<void> {
    try {
      // Get session ID and user ID
      console.log('getDailyGameComplete - START');
      console.log('Request headers:', req.headers);
      console.log('Request session:', req.session);
      
      let sessionId = req.headers['x-session-id'] as string;
      const userId = (req as any).user?.id;
      
      console.log('Initial sessionId:', sessionId);
      console.log('UserId:', userId);
      
      // If logged in as authenticated user, we should prioritize user ID over session ID
      if (userId) {
        console.log('Using authenticated user ID for data retrieval:', userId);
      } else if (sessionId) {
        console.log('Using anonymous session ID for data retrieval:', sessionId);
      } else {
        console.log('No session ID or user ID provided, will create a new anonymous session');
      }
      
      // If session ID not in header, try from session object
      if (!sessionId && req.session?.anonymous_id) {
        sessionId = req.session.anonymous_id;
        console.log('Using sessionId from session:', sessionId);
      }
      
      // If still no session ID and no user ID, create a new session ID
      if (!sessionId && !userId) {
        sessionId = uuidv4();
        console.log('Created new sessionId:', sessionId);
        
        // Store in session if available
        if (req.session) {
          req.session.anonymous_id = sessionId;
        }
        
        // Send back in header for future requests
        res.setHeader('X-Session-ID', sessionId);
      }
      
      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0];
      
      const gameService = new GameService();
      
      // Get basic game information
      const gameInfo = {
        date: today,
        gameId: gameService.getGameToken(today),
        maxAttempts: 6
      };
      
      // Ensure today's answer exists
      try {
        await gameService.getDailyAnswer();
      } catch (error) {
        await gameService.setDailyAnswerIfNotExists(today);
      }
      
      // Get user data
      const stats = await gameService.getUserStats(userId, sessionId);
      const userGuesses = await gameService.getTodayGuesses(userId, sessionId);
      const attemptCount = await gameService.getUserAttemptCount(userId, sessionId, today);
      
      // Determine game status
      let gameStatus = 'playing';
      let alreadyPlayed = false;
      
      if (userGuesses.length > 0) {
        const hasWon = userGuesses.some(guess => guess.correct);
        
        if (hasWon) {
          gameStatus = 'won';
          alreadyPlayed = true;
        } else if (attemptCount >= 6) {
          gameStatus = 'lost';
          alreadyPlayed = true;
        }
      }
      
      // Convert to frontend format - the objects from getUserDailyGuesses already have the right structure
      const cleanGuesses = userGuesses.map(guess => {
        // Log the guess structure to help with debugging
        console.log(`Processing guess for player: ${guess.name}, structure:`, 
          Object.keys(guess).filter(k => typeof guess[k] !== 'function'));
        
        if (!guess.name) {
          console.error('Invalid guess structure - missing name:', guess);
        }
        
        // Include both frontend-friendly fields and controller-specific fields
        const cleanGuess = {
          id: guess.id,
          playerId: guess.playerId,
          playerName: guess.playerName || guess.name,
          name: guess.name, // Important field for frontend
          correct: guess.correct,
          // Include the hints object for frontend rendering
          hints: guess.hints || {
            team: 'incorrect',
            role: 'incorrect',
            nationality: 'incorrect',
            worldAppearances: 'incorrect'
          },
          // Include these objects for consistent structure
          team: guess.team,
          role: guess.role,
          position: guess.position,
          nationality: guess.nationality,
          appearances: guess.appearances,
          region: guess.region,
          championships: guess.championships
        };
        
        console.log('Cleaned guess:', cleanGuess);
        return cleanGuess;
      });
      
      // Create the response with only plain data objects
      const responseData = {
        gameInfo,
        stats: {
          gamesPlayed: stats.gamesPlayed || 0,
          gamesWon: stats.gamesWon || 0,
          currentStreak: stats.currentStreak || 0,
          maxStreak: stats.maxStreak || 0,
          winPercentage: stats.winPercentage || 0,
          guessDistribution: stats.guessDistribution || {}
        },
        guesses: cleanGuesses,
        attemptCount,
        gameStatus,
        alreadyPlayed,
        maxGuesses: 6,
        remainingGuesses: Math.max(0, 6 - attemptCount)
      };
      
      res.json(responseData);
    } catch (error) {
      console.error('Error getting complete daily game data:', error);
      res.status(500).json({ error: 'Failed to get daily game data' });
    }
  }
} 