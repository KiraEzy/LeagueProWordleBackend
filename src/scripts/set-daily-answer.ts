import pool from '../config/database';
import { GameService } from '../services/game.service';

/**
 * Sets the answer for today and tomorrow's game
 * This script is designed to be run by a cron job once daily
 * Now uses the weighted appearance distribution method
 */
async function setDailyAnswer() {
  try {
    const gameService = new GameService();
    
    // Set answer for today if not exists
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    try {
      await gameService.setDailyAnswerIfNotExists(todayStr);
      console.log(`Set/confirmed answer for today (${todayStr})`);
    } catch (error) {
      console.error(`Error setting today's answer: ${error.message}`);
    }
    
    // Define the target date (tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    try {
      await gameService.setDailyAnswerIfNotExists(tomorrowStr);
      console.log(`Set/confirmed answer for tomorrow (${tomorrowStr})`);
    } catch (error) {
      console.error(`Error setting tomorrow's answer: ${error.message}`);
    }
    
    // Close the pool connection
    await pool.end();
  } catch (error) {
    console.error('Error in setDailyAnswer script:', error);
    process.exit(1);
  }
}

// Run the function
setDailyAnswer(); 