import pool from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import NodeCache from 'node-cache';
import { QueryResult } from 'pg';

// Cache for performance
const cache = new NodeCache({ stdTTL: 3600 }); // 1 hour TTL

// Custom interfaces for database rows
interface UserStatsRow {
  id: number;
  user_id: number | null;
  session_id: string;
  games_played: string;
  games_won: string;
  current_streak: string;
  max_streak: string;
  guess_distribution: string;
}

// Interfaces
interface Player {
  id: number;
  name: string;
  main_name: string;
  all_names: string[]; // JSON array of alternative names
  nationality: string;
  residency: string;
  birthdate: Date | null;
  tournament_role: string;
  team: string | null;
  appearance: number;
  player_current_role: string;
  is_retired: boolean;
  current_team: string | null;
  current_team_region: string | null;
}

interface PropertyFeedback {
  property: string;
  isCorrect: boolean;
  isClose: boolean;
  hint?: string;
}

interface GuessFeedback {
  isCorrect: boolean;
  attemptNumber: number;
  propertyFeedback: PropertyFeedback[];
}

export class GameService {
  // Get today's answer (player ID only, not exposed to client)
  async getDailyAnswer(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `daily_answer_${today}`;
    
    console.log(`getDailyAnswer: Looking for answer for date ${today}`);
    
    // Check cache first
    const cachedValue = cache.get<number>(cacheKey);
    if (cachedValue !== undefined) {
      console.log(`getDailyAnswer: Using cached value ${cachedValue}`);
      return cachedValue;
    }
    
    // Query database
    console.log(`getDailyAnswer: Cache miss, querying database for date ${today}`);
    const result = await pool.query(
      'SELECT player_id FROM daily_answers WHERE date = $1',
      [today]
    );
    
    console.log(`getDailyAnswer: Query returned ${result.rows.length} rows`);
    
    // If no answer set for today, create one using the weighted selection method
    if (result.rows.length === 0) {
      console.log(`getDailyAnswer: No answer found for ${today}, generating a new one`);
      const playerId = await this.setDailyAnswerIfNotExists(today);
      
      // Cache it
      cache.set(cacheKey, playerId);
      console.log(`getDailyAnswer: Generated new answer playerId ${playerId} for ${today}`);
      return playerId;
    }
    
    const playerId = result.rows[0].player_id;
    console.log(`getDailyAnswer: Found answer playerId ${playerId} for date ${today}`);
    
    // Cache it
    cache.set(cacheKey, playerId);
    return playerId;
  }
  
  // Get player by ID
  async getPlayerById(playerId: number): Promise<Player> {
    const cacheKey = `player_${playerId}`;
    
    // Check cache first
    const cachedPlayer = cache.get<Player>(cacheKey);
    if (cachedPlayer !== undefined) {
      return cachedPlayer;
    }
    
    const result = await pool.query(
      'SELECT * FROM players WHERE id = $1',
      [playerId]
    );
    
    if (result.rows.length === 0) {
      throw new Error(`Player with ID ${playerId} not found`);
    }
    
    const player = result.rows[0];
    cache.set(cacheKey, player);
    return player;
  }
  
  // Get list of all players (for frontend selection)
  async getAllPlayers(): Promise<Player[]> {
    const cacheKey = 'all_players';
    
    // Check cache first
    const cachedPlayers = cache.get<Player[]>(cacheKey);
    if (cachedPlayers !== undefined) {
      return cachedPlayers;
    }
    
    const result = await pool.query(
      'SELECT id, name, main_name, all_names, nationality, residency, birthdate, tournament_role, team, appearance, player_current_role, is_retired, current_team, current_team_region FROM players ORDER BY name'
    );
    
    const players = result.rows;
    cache.set(cacheKey, players);
    return players;
  }
  
  // Get attempts count for a user on a specific day
  async getUserAttemptCount(userId: number | null, sessionId: string, date: string): Promise<number> {
    // Use either user ID or session ID
    const whereClause = userId ? 'user_id = $1' : 'session_id = $1';
    const queryParams = userId ? [userId, date] : [sessionId, date];
    
    const result = await pool.query(
      `SELECT COUNT(*) as attempt_count 
       FROM daily_user_guesses 
       WHERE ${whereClause} AND guess_date = $2`,
      queryParams
    );
    
    return parseInt(result.rows[0].attempt_count);
  }
  
  // Save a guess to the database
  private async saveGuess(
    userId: number | null, 
    sessionId: string, 
    date: string, 
    playerId: number, 
    attemptNumber: number, 
    correct: boolean
  ): Promise<number> {
    const result = await pool.query(
      `INSERT INTO daily_user_guesses(
        user_id, session_id, guess_date, player_guessed_id, attempt_number, correct
      ) VALUES($1, $2, $3, $4, $5, $6) RETURNING id`,
      [userId, sessionId, date, playerId, attemptNumber, correct]
    );
    
    return result.rows[0].id;
  }
  
  // Save detailed feedback for a guess
  private async saveFeedback(guessId: number, feedbackItems: PropertyFeedback[]): Promise<void> {
    for (const item of feedbackItems) {
      await pool.query(
        `INSERT INTO guess_feedback(
          guess_id, property_name, is_correct, is_close, hint
        ) VALUES($1, $2, $3, $4, $5)`,
        [guessId, item.property, item.isCorrect, item.isClose, item.hint || null]
      );
    }
  }
  
  // Update user statistics after a completed game
  private async updateUserStats(
    userId: number | null, 
    sessionId: string, 
    won: boolean, 
    attemptNumber: number
  ): Promise<void> {
    try {
      // Check if stats exist for this user/session
      const whereClause = userId ? 'user_id = $1' : 'session_id = $1';
      
      const existingStats = await pool.query(
        `SELECT * FROM user_stats WHERE ${whereClause}`,
        userId ? [userId] : [sessionId]
      );
      
      if (existingStats.rows.length === 0) {
        // Create new stats
        const initialGuessDistribution: Record<string, number> = { 
          "1": 0, 
          "2": 0, 
          "3": 0, 
          "4": 0, 
          "5": 0, 
          "6": 0 
        };
        
        const guessDistribution = {...initialGuessDistribution};
        if (won) {
          const key = attemptNumber.toString();
          guessDistribution[key] = 1;
        }
        
        // Insert new user stats
        const insertValues = [
          userId, 
          sessionId, 
          1, // games_played
          won ? 1 : 0, // games_won
          won ? 1 : 0, // current_streak
          won ? 1 : 0, // max_streak
          JSON.stringify(guessDistribution)
        ];
        
        await pool.query(
          `INSERT INTO user_stats(
            user_id, session_id, games_played, games_won, 
            current_streak, max_streak, guess_distribution
          ) VALUES($1, $2, $3, $4, $5, $6, $7)`,
          insertValues
        );
      } else {
        // Get existing stats
        const stats = existingStats.rows[0];
        
        // Parse numeric values
        const gamesPlayed = Number(stats.games_played) + 1;
        const gamesWon = Number(stats.games_won) + (won ? 1 : 0);
        const oldStreak = Number(stats.current_streak);
        const oldMaxStreak = Number(stats.max_streak);
        
        // Update streak
        const newStreak = won ? oldStreak + 1 : 0;
        const newMaxStreak = Math.max(oldMaxStreak, newStreak);
        
        // Update guess distribution
        let guessDistribution;
        try {
          guessDistribution = JSON.parse(stats.guess_distribution);
          if (won && typeof guessDistribution === 'object') {
            const attemptKey = attemptNumber.toString();
            guessDistribution[attemptKey] = (guessDistribution[attemptKey] || 0) + 1;
          }
        } catch (e) {
          // Fallback if parsing fails
          guessDistribution = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
          if (won) {
            guessDistribution[attemptNumber.toString()] = 1;
          }
        }
        
        // Create update query with the where clause at the end
        // Fix parameter indices for the WHERE clause
        const updateQuery = `
          UPDATE user_stats SET
            games_played = $1,
            games_won = $2,
            current_streak = $3,
            max_streak = $4,
            guess_distribution = $5
          WHERE ${userId ? 'user_id = $6' : 'session_id = $6'}
        `;
        
        // Create update values
        const updateValues = [
          gamesPlayed,
          gamesWon,
          newStreak,
          newMaxStreak,
          JSON.stringify(guessDistribution),
          userId || sessionId // Last param for WHERE clause
        ];
        
        console.log('Executing stats update with query:', updateQuery);
        console.log('Update values:', updateValues);
        
        await pool.query(updateQuery, updateValues);
      }
    } catch (error) {
      console.error('Error updating user stats:', error);
      throw error;
    }
  }
  
  // Get user statistics
  async getUserStats(userId: number | null, sessionId: string): Promise<any> {
    try {
      const whereClause = userId ? 'user_id = $1' : 'session_id = $1';
      
      const result = await pool.query(
        `SELECT * FROM user_stats WHERE ${whereClause}`,
        userId ? [userId] : [sessionId]
      );
      
      if (result.rows.length === 0) {
        // Return default stats
        return {
          gamesPlayed: 0,
          gamesWon: 0,
          currentStreak: 0,
          maxStreak: 0,
          guessDistribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 },
          winPercentage: 0
        };
      }
      
      const stats = result.rows[0];
      
      // Convert numeric values
      const gamesPlayed = Number(stats.games_played);
      const gamesWon = Number(stats.games_won);
      const currentStreak = Number(stats.current_streak);
      const maxStreak = Number(stats.max_streak);
      
      // Calculate win percentage
      const winPercentage = gamesPlayed > 0 
        ? Math.round((gamesWon / gamesPlayed) * 100) 
        : 0;
      
      // Parse guess distribution
      let guessDistribution;
      try {
        guessDistribution = JSON.parse(stats.guess_distribution);
      } catch (e) {
        guessDistribution = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
      }
      
      return {
        gamesPlayed,
        gamesWon,
        currentStreak,
        maxStreak,
        guessDistribution,
        winPercentage
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      throw error;
    }
  }
  
  // Check if regions are considered "close"
  private isCloseRegion(guessedRegion: string, answerRegion: string): boolean {
    const closeRegions: Record<string, string[]> = {
      'LCK': ['LPL'],
      'LPL': ['LCK'],
      'LCS': ['LEC'],
      'LEC': ['LCS']
    };
    
    return !!closeRegions[guessedRegion]?.includes(answerRegion);
  }
  
  // Generate a game token for the frontend
  getGameToken(date: string): string {
    return crypto.createHash('md5').update(`game-${date}-${process.env.SESSION_SECRET}`).digest('hex').substring(0, 8);
  }
  
  // Process a guess and return feedback
  async processGuess(
    userId: number | null, 
    sessionId: string, 
    guessedPlayerId: number
  ): Promise<GuessFeedback> {
    // Get today's date
    const today = new Date().toISOString().split('T')[0];
    
    // Get today's answer
    const answerId = await this.getDailyAnswer();
    const answerPlayer = await this.getPlayerById(answerId);
    const guessedPlayer = await this.getPlayerById(guessedPlayerId);
    
    // Is this a correct guess?
    const isCorrect = answerId === guessedPlayerId;
    
    // Get attempt number
    const attemptCount = await this.getUserAttemptCount(userId, sessionId, today);
    const attemptNumber = attemptCount + 1;
    
    // Check if max attempts reached
    if (attemptNumber > 6) {
      throw new Error('Maximum attempts reached for today');
    }
    
    // Save guess to database
    const guessId = await this.saveGuess(
      userId, 
      sessionId, 
      today, 
      guessedPlayerId, 
      attemptNumber, 
      isCorrect
    );
    
    // Check if players share same residency (for nationality comparison)
    const shareResidency = await this.playersShareResidency(guessedPlayerId, answerId);
    
    // Generate feedback
    const propertyFeedback: PropertyFeedback[] = [
      {
        property: 'team',
        isCorrect: this.isTeamCorrect(guessedPlayer, answerPlayer),
        isClose: this.isTeamClose(guessedPlayer, answerPlayer)
      },
      {
        property: 'tournamentRole',
        isCorrect: guessedPlayer.tournament_role === answerPlayer.tournament_role,
        isClose: this.isCloseRole(guessedPlayer.tournament_role, answerPlayer.tournament_role)
      },
      {
        property: 'nationality',
        isCorrect: guessedPlayer.nationality === answerPlayer.nationality,
        isClose: shareResidency // Only close if they share residency
      },
      {
        property: 'residency',
        isCorrect: guessedPlayer.residency === answerPlayer.residency,
        isClose: this.isCloseResidency(guessedPlayer.residency, answerPlayer.residency)
      },
      {
        property: 'appearance',
        isCorrect: guessedPlayer.appearance === answerPlayer.appearance,
        isClose: Math.abs(guessedPlayer.appearance - answerPlayer.appearance) <= 2,
        hint: guessedPlayer.appearance > answerPlayer.appearance ? 'Fewer' : 'More'
      }
    ];
    
    // Save detailed feedback
    await this.saveFeedback(guessId, propertyFeedback);
    
    // If correct or maximum attempts reached, update stats
    if (isCorrect || attemptNumber >= 6) {
      await this.updateUserStats(userId, sessionId, isCorrect, attemptNumber);
    }
    
    const feedback: GuessFeedback = {
      isCorrect,
      attemptNumber,
      propertyFeedback
    };
    
    return feedback;
  }
  
  // Add new helper methods for comparing properties
  private isCloseRole(guessedRole: string, answerRole: string): boolean {
    const roleGroups = {
      'carry': ['Bot', 'Mid', 'ADC'],
      'support': ['Support', 'Jungle']
    };
    
    // Check if roles belong to the same group
    for (const [_, roles] of Object.entries(roleGroups)) {
      if (roles.includes(guessedRole) && roles.includes(answerRole)) {
        return true;
      }
    }
    
    return false;
  }
  
  private isCloseNationality(guessedNationality: string, answerNationality: string): boolean {
    // Don't consider nationalities close unless they have the same residency
    return false;
  }
  
  // Helper method to check if players share the same residency but different nationality
  private async playersShareResidency(guessedPlayerId: number, answerPlayerId: number): Promise<boolean> {
    try {
      // Get full player data for both
      const guessedPlayer = await this.getPlayerById(guessedPlayerId);
      const answerPlayer = await this.getPlayerById(answerPlayerId);
      
      // Exact nationality match is not "close", it's "correct"
      if (guessedPlayer.nationality === answerPlayer.nationality) {
        return false;
      }
      
      // Only consider it "close" if residency is the same
      const guessedResidency = guessedPlayer.residency;
      const answerResidency = answerPlayer.residency;
      
      return (
        !!guessedResidency && 
        !!answerResidency && 
        guessedResidency.toLowerCase() === answerResidency.toLowerCase()
      );
    } catch (error) {
      console.error('Error comparing player residencies:', error);
      return false;
    }
  }
  
  private isCloseResidency(guessedResidency: string, answerResidency: string): boolean {
    const closeResidencies: Record<string, string[]> = {
      'LCK': ['LPL'],
      'LPL': ['LCK'],
      'LCS': ['LEC'],
      'LEC': ['LCS'],
      'Korea': ['China'],
      'China': ['Korea'],
      'North America': ['EMEA', 'Europe'],
      'EMEA': ['North America'],
      'Europe': ['North America']
    };
    
    return !!closeResidencies[guessedResidency]?.includes(answerResidency);
  }
  
  /**
   * Sets the daily answer for a specific date if it doesn't already exist
   * Using weighted appearance distribution to favor players with more appearances
   * @param date The date to set the answer for (YYYY-MM-DD format)
   * @returns The player ID that was set as the answer
   */
  async setDailyAnswerIfNotExists(date: string): Promise<number> {
    console.log(`setDailyAnswerIfNotExists: Checking for existing answer on date ${date}`);
    
    // Check if an answer already exists for the given date
    const result = await pool.query(
      'SELECT player_id FROM daily_answers WHERE date = $1',
      [date]
    );
    
    if (result.rows.length > 0) {
      // Answer already exists, return it
      const playerId = result.rows[0].player_id;
      console.log(`setDailyAnswerIfNotExists: Found existing answer playerId ${playerId}`);
      return playerId;
    }
    
    console.log(`setDailyAnswerIfNotExists: No existing answer, selecting a player for date ${date}`);
    
    // Group players by appearance count for weighted selection
    // Get non-retired players grouped by appearance
    const lowAppearancePlayers = await pool.query(`
      SELECT id FROM players 
      WHERE is_retired = false AND appearance > 0 AND appearance <= 2
    `);
    
    const mediumAppearancePlayers = await pool.query(`
      SELECT id FROM players 
      WHERE is_retired = false AND appearance >= 3 AND appearance <= 5
    `);
    
    const highAppearancePlayers = await pool.query(`
      SELECT id FROM players 
      WHERE is_retired = false AND appearance >= 6
    `);
    
    // Default weights - same as frontend default
    const weights = {
      low: 10,    // 1-2 appearances (10%)
      medium: 30, // 3-5 appearances (30%)
      high: 60    // 6+ appearances (60%)
    };
    
    // Count players in each group
    const counts = {
      low: lowAppearancePlayers.rows.length,
      medium: mediumAppearancePlayers.rows.length,
      high: highAppearancePlayers.rows.length
    };
    
    console.log(`Player distribution: Low ${counts.low}, Medium ${counts.medium}, High ${counts.high}`);
    
    // Select which group to pick from based on weights
    const totalWeight = weights.low + weights.medium + weights.high;
    let randomWeight = Math.random() * totalWeight;
    let selectedGroup = 'high'; // Default to high appearances
    
    if (randomWeight < weights.low) {
      selectedGroup = 'low';
    } else if (randomWeight < weights.low + weights.medium) {
      selectedGroup = 'medium';
    }
    
    console.log(`setDailyAnswerIfNotExists: Random weight ${randomWeight}/${totalWeight}, selected group ${selectedGroup}`);
    
    // Check if the selected group has players
    if (counts[selectedGroup] === 0) {
      // Find a non-empty group
      const nonEmptyGroups = Object.entries(counts)
        .filter(([_, count]) => count > 0)
        .map(([group]) => group);
      
      if (nonEmptyGroups.length === 0) {
        console.log(`setDailyAnswerIfNotExists: No active players found in the database`);
        throw new Error('No active players found in the database');
      }
      
      // Pick a random non-empty group
      selectedGroup = nonEmptyGroups[Math.floor(Math.random() * nonEmptyGroups.length)];
      console.log(`setDailyAnswerIfNotExists: Selected group was empty, switched to ${selectedGroup}`);
    }
    
    // Select a player from the chosen group
    let playerRows;
    switch (selectedGroup) {
      case 'low':
        playerRows = lowAppearancePlayers.rows;
        break;
      case 'medium': 
        playerRows = mediumAppearancePlayers.rows;
        break;
      default:
        playerRows = highAppearancePlayers.rows;
    }
    
    // Select random player from the group
    const randomIndex = Math.floor(Math.random() * playerRows.length);
    const playerId = playerRows[randomIndex].id;
    
    console.log(`setDailyAnswerIfNotExists: Selected player ID ${playerId} from group ${selectedGroup} (index ${randomIndex}/${playerRows.length})`);
    
    // Insert the new answer
    await pool.query(
      'INSERT INTO daily_answers(date, player_id) VALUES($1, $2)',
      [date, playerId]
    );
    
    // Log the action
    console.log(`Set daily answer for ${date}: Player ID ${playerId} from ${selectedGroup} appearance group`);
    
    return playerId;
  }
  
  private isTeamCorrect(guessedPlayer: Player, answerPlayer: Player): boolean {
    // Both players have exactly the same team
    if (guessedPlayer.team === answerPlayer.team) {
      return true;
    }
    
    // Both players are retired
    const guessedRetired = this.isPlayerRetired(guessedPlayer);
    const answerRetired = this.isPlayerRetired(answerPlayer);
    
    if (guessedRetired && answerRetired) {
      return true;
    }
    
    return false;
  }
  
  private isTeamClose(guessedPlayer: Player, answerPlayer: Player): boolean {
    // If teams are exactly the same, it's correct, not close
    if (guessedPlayer.team === answerPlayer.team) {
      return false;
    }
    
    // If both players are retired, it's correct, not close
    const guessedRetired = this.isPlayerRetired(guessedPlayer);
    const answerRetired = this.isPlayerRetired(answerPlayer);
    if (guessedRetired && answerRetired) {
      return false;
    }
    
    // Same region - ONLY this counts as close
    if (guessedPlayer.current_team_region && 
        answerPlayer.current_team_region && 
        guessedPlayer.current_team_region === answerPlayer.current_team_region) {
      return true;
    }
    
    // No other conditions for "close" team matches
    return false;
  }

  private isPlayerRetired(player: Player): boolean {
    // A player is considered retired if:
    // 1. They have is_retired flag set to true
    // 2. Their current_team is null or empty
    // 3. Their current_team_region is null or empty
    const isRetiredStatus = player.is_retired
    const isActiveRole = ['top', 'jungle', 'mid', 'bot', 'adc', 'support'].includes(player.player_current_role.toLowerCase());
    if (isRetiredStatus || !player.current_team || !isActiveRole) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * Get a user's guesses for today's daily challenge
   * @param userId The user ID (if authenticated)
   * @param sessionId The session ID (for anonymous users)
   * @returns Array of guesses with feedback
   */
  async getTodayGuesses(userId: number | null, sessionId: string): Promise<any[]> {
    try {
      const today = new Date().toISOString().split('T')[0];
      return await this.getUserDailyGuesses(userId, sessionId, today);
    } catch (error) {
      console.error('Error getting today\'s guesses:', error);
      return [];
    }
  }

  /**
   * Get the user's guesses for a specific date
   * @param userId The user ID (if authenticated)
   * @param sessionId The session ID (for anonymous users)
   * @param date The date in YYYY-MM-DD format
   * @returns Array of guesses with feedback
   */
  async getUserDailyGuesses(userId: number | null, sessionId: string, date: string): Promise<any[]> {
    try {
      // Determine which ID to use for the query
      const whereClause = userId ? 'user_id = $1' : 'session_id = $1';
      const paramValue = userId || sessionId;
      
      console.log('getUserDailyGuesses - Parameters:');
      console.log('  userId:', userId);
      console.log('  sessionId:', sessionId);
      console.log('  date:', date);
      console.log('  whereClause:', whereClause);
      console.log('  paramValue:', paramValue);
      
      // Get the guesses for this user/session on this date
      const guessesResult = await pool.query(`
        SELECT 
          g.id, 
          g.player_guessed_id, 
          g.attempt_number, 
          g.correct, 
          p.name,
          p.tournament_role,
          p.team,
          p.nationality,
          p.residency,
          p.appearance,
          p.is_retired,
          p.current_team,
          p.current_team_region,
          p.player_current_role
        FROM 
          daily_user_guesses g
        JOIN 
          players p ON g.player_guessed_id = p.id
        WHERE 
          ${whereClause} AND g.guess_date = $2
        ORDER BY 
          g.attempt_number ASC
      `, [paramValue, date]);
      
      console.log('Guesses query result rows count:', guessesResult.rows.length);
      if (guessesResult.rows.length > 0) {
        console.log('First guess row sample:', JSON.stringify(guessesResult.rows[0]));
      }
      
      // For each guess, get the property feedback
      const guesses = await Promise.all(guessesResult.rows.map(async (guess) => {
        // Get feedback for this guess
        const feedbackResult = await pool.query(`
          SELECT 
            property_name as property, 
            is_correct, 
            is_close
          FROM 
            guess_feedback
          WHERE 
            guess_id = $1
        `, [guess.id]);
        
        console.log(`Feedback rows for guess ID ${guess.id}:`, feedbackResult.rows.length);
        
        // Convert to the format expected by the frontend
        const hints = {
          team: 'incorrect',
          role: 'incorrect',
          nationality: 'incorrect',
          worldAppearances: 'incorrect'
        };
        
        // Map property names from the database to the frontend names
        const propertyMap = {
          'team': 'team',
          'tournamentRole': 'role',
          'nationality': 'nationality',
          'appearance': 'worldAppearances'
        };
        
        // Process each property feedback
        feedbackResult.rows.forEach(feedback => {
          const frontendProperty = propertyMap[feedback.property];
          if (frontendProperty) {
            if (feedback.is_correct) {
              hints[frontendProperty] = 'correct';
            } else if (feedback.is_close) {
              hints[frontendProperty] = 'close';
            }
          }
        });
        
        // Format team display the same way the frontend does
        let formattedTeam = "Retired";
        
        // Handle isRetired which could be a string "0"/"1" from JSON or boolean from API
        const isRetired = 
          typeof guess.is_retired === 'string' 
            ? guess.is_retired === "1" 
            : Boolean(guess.is_retired);
        
        // Handle player current role field naming differences
        const currentRole = (guess.player_current_role || '').toLowerCase();
        
        // Check if current role is one of the valid playing positions with case-insensitive comparison
        const isActiveRole = ['top', 'jungle', 'mid', 'bot', 'adc', 'support'].includes(currentRole);
        
        // If player is retired or has no team or doesn't have an active playing role
        if (isRetired || !guess.current_team || !isActiveRole) {
          formattedTeam = "Retired";
        } else {
          // Otherwise use their current team
          formattedTeam = guess.current_team || guess.team || "Unknown";
        }
        
        // Return a complete structure with all necessary information
        return {
          id: guess.id,
          playerId: guess.player_guessed_id,
          playerName: guess.name,
          name: guess.name,
          correct: guess.correct,
          // Frontend-compatible structure
          hints: {
            team: hints.team,
            role: hints.role,
            nationality: hints.nationality,
            worldAppearances: hints.worldAppearances
          },
          // Detailed properties for the controller
          team: {
            value: formattedTeam,
            correct: hints.team === 'correct',
            close: hints.team === 'close'
          },
          role: {
            value: guess.tournament_role || 'Unknown',
            correct: hints.role === 'correct',
            close: hints.role === 'close'
          },
          nationality: {
            value: guess.nationality || 'Unknown',
            correct: hints.nationality === 'correct',
            close: hints.nationality === 'close'
          },
          appearances: {
            value: guess.appearance || 0,
            correct: hints.worldAppearances === 'correct',
            close: hints.worldAppearances === 'close'
          },
          // Empty fallback values for any other fields the controller might expect
          position: {
            value: '',
            correct: false,
            close: false
          },
          region: {
            value: guess.residency || '',
            correct: false,
            close: false
          },
          championships: {
            value: 0,
            correct: false,
            close: false
          }
        };
      }));
      
      return guesses;
    } catch (error) {
      console.error('Error getting user daily guesses:', error);
      return [];
    }
  }
} 