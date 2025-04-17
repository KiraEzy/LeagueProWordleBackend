/**
 * Game constants for League Pro Wordle
 */

// Multiplayer Game Settings
export const MULTIPLAYER_CONSTANTS = {
  // Round timer in seconds
  ROUND_TIMER: 60,
  
  // Best of X matches (BO3, BO5, etc.)
  BEST_OF: 3,
  
  // Maximum guesses per round
  MAX_GUESSES: 6,
  
  // Points awarded per win
  POINTS_PER_WIN: 1,
  
  // Matchmaking timeout in seconds
  MATCHMAKING_TIMEOUT: 30,
  
  // Room cleanup delay after game completes (seconds)
  ROOM_CLEANUP_DELAY: 60
};

// Daily Game Settings
export const DAILY_CONSTANTS = {
  MAX_GUESSES: 6
};

// Single Player Game Settings
export const SINGLE_PLAYER_CONSTANTS = {
  MAX_GUESSES: 6
};

export default {
  MULTIPLAYER_CONSTANTS,
  DAILY_CONSTANTS,
  SINGLE_PLAYER_CONSTANTS
}; 