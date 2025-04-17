import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import passport from '../config/passport';
import { Session } from 'express-session';

// Extend Express Session interface
declare module 'express-session' {
  interface Session {
    anonymous_id?: string;
    user_id?: number;
    is_google_auth?: boolean;
  }
}

export class AuthController {
  // Regular register endpoint (kept for compatibility)
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const { username, email } = req.body;
      
      // Validation
      if (!username || username.length < 3) {
        res.status(400).json({ error: 'Username must be at least 3 characters long' });
        return;
      }
      
      // Check if username already exists
      const usernameCheck = await pool.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );
      
      if (usernameCheck.rows.length > 0) {
        res.status(400).json({ error: 'Username already taken' });
        return;
      }
      
      // Check if email already exists (if provided)
      if (email) {
        const emailCheck = await pool.query(
          'SELECT id FROM users WHERE email = $1',
          [email]
        );
        
        if (emailCheck.rows.length > 0) {
          res.status(400).json({ error: 'Email already registered' });
          return;
        }
      }
      
      // Create new user with no session data transfer
      const createUserResult = await pool.query(
        'INSERT INTO users(username, email, created_at) VALUES($1, $2, NOW()) RETURNING id',
        [username, email || null]
      );
      
      const userId = createUserResult.rows[0].id;
      
      // Log successful registration
      console.log(`New user registered: ${username} (ID: ${userId})`);
      
      // Generate JWT token
      const jwtSecret = process.env.SESSION_SECRET || 'default_secret_change_in_production';
      const token = jwt.sign({ userId, authType: 'regular' }, jwtSecret, { expiresIn: '30d' });
      
      // Return success response with token
      res.status(201).json({
        username,
        token,
        message: 'Registration successful'
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed: ' + error.message });
    }
  }
  
  // Google authentication route
  static googleAuth(req: Request, res: Response): void {
    passport.authenticate('google', { 
      scope: ['profile', 'email'],
      session: false 
    })(req, res);
  }
  
  // Google authentication callback
  static googleCallback(req: Request, res: Response): void {
    passport.authenticate('google', { session: false }, async (err: Error, user: any) => {
      if (err) {
        console.error('Google authentication error:', err);
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=auth_failed`);
      }
      
      if (!user) {
        console.error('No user returned from Google auth');
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=auth_failed`);
      }
      
      try {
        // Log authentication info but don't transfer data
        console.log('Google authentication successful for user:', user.username);
        console.log('Google user ID:', user.google_id);
        
        // Generate JWT token with userId and googleId
        const jwtSecret = process.env.SESSION_SECRET || 'default_secret_change_in_production';
        const token = jwt.sign({ 
          userId: user.id, 
          googleId: user.google_id,
          authType: 'google'
        }, jwtSecret, { expiresIn: '30d' });
        
        // Save authenticated user info in session
        if (req.session) {
          req.session.user_id = user.id;
          req.session.is_google_auth = true;
        }
        
        console.log(`Redirecting to frontend with token for user: ${user.username} (Google Auth)`);
        
        // Redirect to frontend with token and authentication type
        res.redirect(
          `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login/success?` + 
          `token=${token}&` + 
          `username=${encodeURIComponent(user.username)}&` + 
          `authType=google`
        );
      } catch (error) {
        console.error('Google auth callback error:', error);
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/login?error=server_error`);
      }
    })(req, res);
  }
} 