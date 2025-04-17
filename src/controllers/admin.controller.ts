import { Request, Response } from 'express';
import { GameService } from '../services/game.service';
import crypto from 'crypto';

/**
 * Controller for administrative functions
 */
export class AdminController {
  /**
   * Generates daily answers for today and tomorrow
   * Protected by API key for security
   */
  static async generateDailyAnswers(req: Request, res: Response): Promise<void> {
    try {
      // Check for API key in header
      const apiKey = req.header('X-API-Key');
      
      if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
        res.status(401).json({ error: 'Unauthorized access' });
        return;
      }
      
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      const gameService = new GameService();
      
      const result = {
        today: false,
        tomorrow: false,
        message: ''
      };
      
      // Try to set today's answer if not exists
      try {
        await gameService.setDailyAnswerIfNotExists(today);
        result.today = true;
      } catch (error) {
        result.message += `Error setting today's answer: ${error.message}. `;
      }
      
      // Try to set tomorrow's answer if not exists
      try {
        await gameService.setDailyAnswerIfNotExists(tomorrowStr);
        result.tomorrow = true;
      } catch (error) {
        result.message += `Error setting tomorrow's answer: ${error.message}.`;
      }
      
      if (result.today && result.tomorrow) {
        res.status(200).json({ 
          success: true,
          message: 'Daily answers generated successfully',
          details: result
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Partial failure in generating daily answers',
          details: result
        });
      }
    } catch (error) {
      console.error('Error in admin generateDailyAnswers:', error);
      res.status(500).json({ error: error.message });
    }
  }
} 