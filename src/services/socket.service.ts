import { Server as SocketServer } from 'socket.io';
import { Server } from 'http';
import { MULTIPLAYER_CONSTANTS } from '../config/constants';
import { GameService } from './game.service';

// Interface for player in matchmaking queue
interface QueuedPlayer {
  socketId: string;
  userId?: number;
  username: string;
  joinedAt: number;
}

// Interface for room data
interface GameRoom {
  roomId: string;
  players: {
    [socketId: string]: {
      userId?: number;
      username: string;
      socketId: string;
      score: number;
      guesses: any[];
      ready: boolean;
    };
  };
  currentRound: number;
  totalRounds: number;
  answerId: number;
  answerPlayer: any;
  state: 'waiting' | 'playing' | 'completed';
  startTime?: number;
  endTime?: number;
  timer?: NodeJS.Timeout;
  roundEndTime?: number;
}

export class SocketService {
  private io: SocketServer;
  private matchmakingQueue: QueuedPlayer[] = [];
  private gameRooms: { [roomId: string]: GameRoom } = {};
  private gameService: GameService;

  constructor(server: Server) {
    this.io = new SocketServer(server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true
      }
    });
    this.gameService = new GameService();
    this.init();
    console.log('Socket.io server initialized');
  }

  private init(): void {
    this.io.on('connection', (socket) => {
      console.log(`New socket connection: ${socket.id}`);

      // Join matchmaking queue
      socket.on('joinQueue', async (data: { userId?: number; username: string }) => {
        console.log(`User ${data.username} joined matchmaking queue`);
        
        // Remove any existing entries for this user
        this.matchmakingQueue = this.matchmakingQueue.filter(p => 
          p.socketId !== socket.id && (data.userId ? p.userId !== data.userId : true)
        );
        
        // Add to queue
        this.matchmakingQueue.push({
          socketId: socket.id,
          userId: data.userId,
          username: data.username,
          joinedAt: Date.now()
        });
        
        // Try to make a match
        this.tryCreateMatch();
      });

      // Leave matchmaking queue
      socket.on('leaveQueue', () => {
        console.log(`Socket ${socket.id} left matchmaking queue`);
        this.matchmakingQueue = this.matchmakingQueue.filter(p => p.socketId !== socket.id);
      });

      // Player ready in game room
      socket.on('playerReady', (data: { roomId: string }) => {
        const room = this.gameRooms[data.roomId];
        if (room && room.players[socket.id]) {
          room.players[socket.id].ready = true;
          
          // Check if all players are ready
          const allReady = Object.values(room.players).every(p => p.ready);
          if (allReady) {
            this.startGameRound(data.roomId);
          }
        }
      });

      // Submit guess in multiplayer game
      socket.on('submitGuess', async (data: { roomId: string; playerId: number }) => {
        try {
          const room = this.gameRooms[data.roomId];
          if (!room || room.state !== 'playing') return;
          
          const player = room.players[socket.id];
          if (!player) return;
          
          // Process the guess
          const feedback = await this.gameService.processGuess(
            player.userId || null,
            socket.id,
            data.playerId
          );
          
          // Add to player's guesses
          const guess = {
            playerId: data.playerId,
            isCorrect: feedback.isCorrect,
            feedback: feedback.propertyFeedback
          };
          player.guesses.push(guess);
          
          // Broadcast to all players in the room
          this.io.to(data.roomId).emit('playerGuessed', {
            playerId: data.playerId,
            socketId: socket.id,
            username: player.username,
            feedback: feedback.propertyFeedback,
            correct: feedback.isCorrect
          });
          
          // Check win condition
          if (feedback.isCorrect) {
            player.score += MULTIPLAYER_CONSTANTS.POINTS_PER_WIN;
            this.endRound(data.roomId, socket.id);
          } else if (player.guesses.length >= MULTIPLAYER_CONSTANTS.MAX_GUESSES) {
            // Max guesses reached for this player
            this.io.to(data.roomId).emit('playerMaxGuesses', {
              socketId: socket.id,
              username: player.username
            });
            
            // Check if all players have reached max guesses
            const allMaxGuesses = Object.values(room.players).every(p => 
              p.guesses.length >= MULTIPLAYER_CONSTANTS.MAX_GUESSES
            );
            
            if (allMaxGuesses) {
              this.endRound(data.roomId);
            }
          }
        } catch (error) {
          console.error('Error processing multiplayer guess:', error);
          socket.emit('error', { message: 'Failed to process guess' });
        }
      });

      // Disconnect
      socket.on('disconnect', () => {
        console.log(`Socket ${socket.id} disconnected`);
        
        // Remove from queue
        this.matchmakingQueue = this.matchmakingQueue.filter(p => p.socketId !== socket.id);
        
        // Handle disconnection from game rooms
        for (const roomId in this.gameRooms) {
          const room = this.gameRooms[roomId];
          if (room.players[socket.id]) {
            // Notify other players
            this.io.to(roomId).emit('playerDisconnected', {
              socketId: socket.id,
              username: room.players[socket.id].username
            });
            
            // End the game if in progress
            if (room.state === 'playing') {
              // Give the win to the other player
              for (const pid in room.players) {
                if (pid !== socket.id) {
                  room.players[pid].score += MULTIPLAYER_CONSTANTS.POINTS_PER_WIN;
                }
              }
              this.endRound(roomId);
            }
            
            // Remove player from room
            delete room.players[socket.id];
            
            // If no players left, clean up the room
            if (Object.keys(room.players).length === 0) {
              this.cleanupRoom(roomId);
            }
          }
        }
      });
    });
    
    // Run matchmaking every few seconds to match any players who have been waiting
    setInterval(() => {
      this.matchOldestPlayers();
    }, 5000);
  }

  private async tryCreateMatch(): Promise<void> {
    if (this.matchmakingQueue.length >= 2) {
      // Take the first two players in queue
      const player1 = this.matchmakingQueue.shift()!;
      const player2 = this.matchmakingQueue.shift()!;
      
      await this.createGameRoom(player1, player2);
    }
  }

  private async matchOldestPlayers(): Promise<void> {
    if (this.matchmakingQueue.length >= 2) {
      // Sort by join time and match the oldest players
      this.matchmakingQueue.sort((a, b) => a.joinedAt - b.joinedAt);
      
      const player1 = this.matchmakingQueue.shift()!;
      const player2 = this.matchmakingQueue.shift()!;
      
      await this.createGameRoom(player1, player2);
    }
  }

  private async createGameRoom(player1: QueuedPlayer, player2: QueuedPlayer): Promise<void> {
    try {
      const roomId = `game-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      
      // Get a random player for the first round answer
      const gameService = new GameService();
      const today = new Date().toISOString().split('T')[0];
      
      // Generate a new answer player
      await gameService.setDailyAnswerIfNotExists(today);
      const answerId = await gameService.getDailyAnswer();
      const answerPlayer = await gameService.getPlayerById(answerId);
      
      // Create the game room
      this.gameRooms[roomId] = {
        roomId,
        players: {
          [player1.socketId]: {
            userId: player1.userId,
            username: player1.username,
            socketId: player1.socketId,
            score: 0,
            guesses: [],
            ready: false
          },
          [player2.socketId]: {
            userId: player2.userId,
            username: player2.username,
            socketId: player2.socketId,
            score: 0,
            guesses: [],
            ready: false
          }
        },
        currentRound: 1,
        totalRounds: MULTIPLAYER_CONSTANTS.BEST_OF,
        answerId,
        answerPlayer,
        state: 'waiting'
      };
      
      // Add sockets to room
      this.io.sockets.sockets.get(player1.socketId)?.join(roomId);
      this.io.sockets.sockets.get(player2.socketId)?.join(roomId);
      
      // Notify players
      this.io.to(roomId).emit('matchFound', {
        roomId,
        players: [
          { socketId: player1.socketId, username: player1.username },
          { socketId: player2.socketId, username: player2.username }
        ],
        totalRounds: MULTIPLAYER_CONSTANTS.BEST_OF,
        maxGuesses: MULTIPLAYER_CONSTANTS.MAX_GUESSES,
        roundTimer: MULTIPLAYER_CONSTANTS.ROUND_TIMER
      });
      
      console.log(`Created game room ${roomId} with players ${player1.username} and ${player2.username}`);
    } catch (error) {
      console.error('Error creating game room:', error);
      
      // Re-add players to queue if room creation fails
      this.matchmakingQueue.push(player1, player2);
    }
  }

  private startGameRound(roomId: string): void {
    const room = this.gameRooms[roomId];
    if (!room) return;
    
    // Reset player state for new round
    for (const socketId in room.players) {
      room.players[socketId].guesses = [];
      room.players[socketId].ready = true;
    }
    
    // Set game state to playing
    room.state = 'playing';
    room.startTime = Date.now();
    room.roundEndTime = Date.now() + (MULTIPLAYER_CONSTANTS.ROUND_TIMER * 1000);
    
    // Start round timer
    this.io.to(roomId).emit('roundStart', {
      round: room.currentRound,
      totalRounds: room.totalRounds,
      endTime: room.roundEndTime,
      playerInfo: Object.values(room.players).map(p => ({
        socketId: p.socketId,
        username: p.username,
        score: p.score
      }))
    });
    
    // Create timer for round end
    room.timer = setTimeout(() => {
      this.endRound(roomId);
    }, MULTIPLAYER_CONSTANTS.ROUND_TIMER * 1000);
  }

  private async endRound(roomId: string, winnerSocketId?: string): Promise<void> {
    const room = this.gameRooms[roomId];
    if (!room || room.state !== 'playing') return;
    
    // Clear any existing timer
    if (room.timer) {
      clearTimeout(room.timer);
      room.timer = undefined;
    }
    
    // If we have a winner, award points
    if (winnerSocketId && room.players[winnerSocketId]) {
      const winner = room.players[winnerSocketId];
      console.log(`Player ${winner.username} won round ${room.currentRound} in room ${roomId}`);
    } else {
      console.log(`Round ${room.currentRound} in room ${roomId} ended with no winner`);
    }
    
    // Reveal the answer to all players
    this.io.to(roomId).emit('roundEnd', {
      round: room.currentRound,
      totalRounds: room.totalRounds,
      winnerSocketId,
      winnerUsername: winnerSocketId ? room.players[winnerSocketId].username : null,
      answer: {
        id: room.answerId,
        name: room.answerPlayer.name,
        team: room.answerPlayer.current_team || 'Retired',
        tournament_role: room.answerPlayer.tournament_role,
        nationality: room.answerPlayer.nationality,
        appearance: room.answerPlayer.appearance
      },
      scores: Object.values(room.players).map(p => ({
        socketId: p.socketId,
        username: p.username,
        score: p.score
      }))
    });
    
    // Update game state
    room.state = 'waiting';
    room.currentRound++;
    
    // Check if the match is complete
    const maxScore = Math.ceil(room.totalRounds / 2); // BO3 requires 2 wins, BO5 requires 3 wins
    const matchComplete = Object.values(room.players).some(p => p.score >= maxScore) ||
                         room.currentRound > room.totalRounds;
    
    if (matchComplete) {
      // Find the winner
      let winner = null;
      let highestScore = 0;
      
      for (const socketId in room.players) {
        const player = room.players[socketId];
        if (player.score > highestScore) {
          highestScore = player.score;
          winner = player;
        }
      }
      
      // Notify match end
      this.io.to(roomId).emit('matchEnd', {
        winnerSocketId: winner?.socketId,
        winnerUsername: winner?.username,
        scores: Object.values(room.players).map(p => ({
          socketId: p.socketId,
          username: p.username,
          score: p.score
        }))
      });
      
      // Schedule room cleanup
      setTimeout(() => {
        this.cleanupRoom(roomId);
      }, MULTIPLAYER_CONSTANTS.ROOM_CLEANUP_DELAY * 1000);
    } else {
      // Prepare next round with a new answer
      try {
        const gameService = new GameService();
        const today = new Date().toISOString().split('T')[0];
        
        // Generate a new answer player
        await gameService.setDailyAnswerIfNotExists(today);
        room.answerId = await gameService.getDailyAnswer();
        room.answerPlayer = await gameService.getPlayerById(room.answerId);
        
        // Wait for players to be ready for next round
        this.io.to(roomId).emit('waitingForNextRound', {
          nextRound: room.currentRound,
          totalRounds: room.totalRounds
        });
      } catch (error) {
        console.error('Error preparing next round:', error);
        this.io.to(roomId).emit('error', { message: 'Failed to prepare next round' });
      }
    }
  }

  private cleanupRoom(roomId: string): void {
    const room = this.gameRooms[roomId];
    if (!room) return;
    
    // Clear any timers
    if (room.timer) {
      clearTimeout(room.timer);
    }
    
    // Remove all sockets from the room
    this.io.in(roomId).socketsLeave(roomId);
    
    // Delete the room
    delete this.gameRooms[roomId];
    console.log(`Cleaned up room ${roomId}`);
  }
} 