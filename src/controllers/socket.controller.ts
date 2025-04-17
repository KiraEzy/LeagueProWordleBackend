import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { GameService } from '../services/game.service';
import pool from '../config/database';

interface Room {
  id: string;
  host: {
    id: string;
    username: string;
  };
  guest?: {
    id: string;
    username: string;
  };
  gameStarted: boolean;
  gameEnded: boolean;
  currentTurn: string | null;
  targetPlayer: any | null;
  guesses: any[];
  maxGuesses: number;
  winnerId: string | null;
}

// In-memory store for active rooms
const rooms: Record<string, Room> = {};
// Map socket IDs to user IDs
const socketToUser: Record<string, string> = {};

export const setupSocketController = (io: Server): void => {
  const gameService = new GameService();

  io.on('connection', (socket: Socket) => {
    console.log(`User connected: ${socket.id}`);

    // Identify the user
    socket.on('identify', (userId: string, username: string) => {
      console.log(`User identified: ${username} (${userId})`);
      socketToUser[socket.id] = userId;
      
      // Notify the user of all available rooms
      const availableRooms = Object.values(rooms)
        .filter(room => !room.gameStarted && !room.guest)
        .map(room => ({
          id: room.id,
          host: room.host.username
        }));
      
      socket.emit('availableRooms', availableRooms);
    });

    // Create a new room
    socket.on('createRoom', async (callback: (roomId: string) => void) => {
      const userId = socketToUser[socket.id];
      if (!userId) {
        socket.emit('error', 'User not identified');
        return;
      }

      // Get username from the database
      try {
        const result = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
        const username = result.rows[0]?.username || 'Unknown Player';
        
        const roomId = uuidv4();
        rooms[roomId] = {
          id: roomId,
          host: {
            id: userId,
            username
          },
          gameStarted: false,
          gameEnded: false,
          currentTurn: null,
          targetPlayer: null,
          guesses: [],
          maxGuesses: 6,
          winnerId: null
        };

        socket.join(roomId);
        callback(roomId);
        
        // Broadcast new room to all users
        io.emit('roomCreated', {
          id: roomId,
          host: username
        });
      } catch (error) {
        console.error('Error creating room:', error);
        socket.emit('error', 'Failed to create room');
      }
    });

    // Join a room
    socket.on('joinRoom', async (roomId: string, callback: (success: boolean, room?: Room) => void) => {
      const userId = socketToUser[socket.id];
      if (!userId) {
        socket.emit('error', 'User not identified');
        return callback(false);
      }

      const room = rooms[roomId];
      if (!room) {
        return callback(false);
      }

      if (room.gameStarted) {
        return callback(false);
      }

      if (room.host.id === userId) {
        socket.join(roomId);
        return callback(true, room);
      }

      if (room.guest) {
        return callback(false);
      }

      try {
        const result = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
        const username = result.rows[0]?.username || 'Unknown Player';
        
        room.guest = {
          id: userId,
          username
        };

        socket.join(roomId);
        callback(true, room);
        
        // Notify the room about the new guest
        io.to(roomId).emit('playerJoined', room);
        io.emit('roomUpdated', {
          id: roomId,
          available: false
        });
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('error', 'Failed to join room');
        callback(false);
      }
    });

    // Start the game
    socket.on('startGame', async (roomId: string) => {
      const userId = socketToUser[socket.id];
      const room = rooms[roomId];

      if (!room) {
        socket.emit('error', 'Room not found');
        return;
      }

      if (room.host.id !== userId) {
        socket.emit('error', 'Only the host can start the game');
        return;
      }

      if (!room.guest) {
        socket.emit('error', 'Waiting for another player to join');
        return;
      }

      if (room.gameStarted) {
        socket.emit('error', 'Game already started');
        return;
      }

      try {
        // Select a random player for the game
        const randomPlayer = await gameService.getDailyAnswer();
        room.targetPlayer = randomPlayer;
        room.gameStarted = true;
        room.currentTurn = room.host.id; // Host goes first
        
        io.to(roomId).emit('gameStarted', {
          started: true,
          currentTurn: room.currentTurn
        });
      } catch (error) {
        console.error('Error starting game:', error);
        socket.emit('error', 'Failed to start game');
      }
    });

    // Submit a guess
    socket.on('submitGuess', async (roomId: string, playerName: string) => {
      const userId = socketToUser[socket.id];
      const room = rooms[roomId];

      if (!room) {
        socket.emit('error', 'Room not found');
        return;
      }

      if (!room.gameStarted || room.gameEnded) {
        socket.emit('error', 'Game not in progress');
        return;
      }

      if (room.currentTurn !== userId) {
        socket.emit('error', 'Not your turn');
        return;
      }

      try {
        // Process the guess
        const feedback = await gameService.processGuess(null, userId, parseInt(room.targetPlayer));
        
        const guess = {
          userId,
          playerName,
          feedback
        };

        room.guesses.push(guess);
        
        // Check if the guess is correct
        const isCorrect = feedback.isCorrect;
        
        if (isCorrect) {
          // Game won
          room.gameEnded = true;
          room.winnerId = userId;
          
          io.to(roomId).emit('gameEnded', {
            winnerId: userId,
            winnerName: userId === room.host.id ? room.host.username : room.guest?.username,
            targetPlayer: room.targetPlayer
          });
        } else if (room.guesses.filter(g => g.userId === userId).length >= room.maxGuesses / 2) {
          // This player has used all their guesses
          const otherPlayerId = userId === room.host.id ? room.guest?.id : room.host.id;
          const otherPlayerGuesses = room.guesses.filter(g => g.userId === otherPlayerId).length;
          
          if (otherPlayerGuesses >= room.maxGuesses / 2) {
            // Both players have used all their guesses
            room.gameEnded = true;
            io.to(roomId).emit('gameEnded', {
              winnerId: null,
              targetPlayer: room.targetPlayer
            });
          } else {
            // Switch turns if the other player still has guesses
            room.currentTurn = otherPlayerId;
            io.to(roomId).emit('turnChanged', {
              currentTurn: room.currentTurn
            });
          }
        } else {
          // Switch turns
          room.currentTurn = userId === room.host.id ? room.guest?.id : room.host.id;
          io.to(roomId).emit('turnChanged', {
            currentTurn: room.currentTurn
          });
        }
        
        // Broadcast the guess to all players in the room
        io.to(roomId).emit('guessProcessed', {
          guess,
          guesses: room.guesses,
          currentTurn: room.currentTurn
        });
      } catch (error) {
        console.error('Error processing guess:', error);
        socket.emit('error', 'Failed to process guess');
      }
    });

    // Leave room
    socket.on('leaveRoom', (roomId: string) => {
      const userId = socketToUser[socket.id];
      const room = rooms[roomId];

      if (!room) return;

      socket.leave(roomId);

      if (room.host.id === userId) {
        // Host left, end the game and notify guest
        if (room.guest) {
          io.to(roomId).emit('hostLeft');
        }
        delete rooms[roomId];
        io.emit('roomDeleted', roomId);
      } else if (room.guest && room.guest.id === userId) {
        // Guest left
        room.guest = undefined;
        if (!room.gameStarted) {
          io.to(roomId).emit('guestLeft');
          io.emit('roomUpdated', {
            id: roomId,
            available: true
          });
        } else {
          // If game was in progress, end it
          room.gameEnded = true;
          io.to(roomId).emit('gameEnded', {
            winnerId: room.host.id,
            winnerName: room.host.username,
            reason: 'opponent_left'
          });
        }
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      const userId = socketToUser[socket.id];
      console.log(`User disconnected: ${socket.id} (${userId})`);

      if (!userId) return;

      // Check if user was in any room
      Object.keys(rooms).forEach(roomId => {
        const room = rooms[roomId];
        if (room.host.id === userId) {
          // Host disconnected, end the game and notify guest
          if (room.guest) {
            io.to(roomId).emit('hostLeft');
          }
          delete rooms[roomId];
          io.emit('roomDeleted', roomId);
        } else if (room.guest && room.guest.id === userId) {
          // Guest disconnected
          room.guest = undefined;
          if (!room.gameStarted) {
            io.to(roomId).emit('guestLeft');
            io.emit('roomUpdated', {
              id: roomId,
              available: true
            });
          } else {
            // If game was in progress, end it
            room.gameEnded = true;
            io.to(roomId).emit('gameEnded', {
              winnerId: room.host.id,
              winnerName: room.host.username,
              reason: 'opponent_disconnected'
            });
          }
        }
      });

      // Remove socket-to-user mapping
      delete socketToUser[socket.id];
    });
  });
}; 