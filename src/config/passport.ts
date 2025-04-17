import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import pool from './database';

// Configure passport to use Google OAuth
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackURL: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/auth/google/callback`
  },
  async function(accessToken, refreshToken, profile, done) {
    try {
      // Check if user exists by Google ID
      const userResult = await pool.query(
        'SELECT * FROM users WHERE google_id = $1',
        [profile.id]
      );
      
      if (userResult.rows.length > 0) {
        // User exists, return user
        return done(null, userResult.rows[0]);
      }
      
      // User doesn't exist, create new user
      const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
      const username = profile.displayName || `user_${profile.id.substr(0, 8)}`;
      
      // Insert new user
      const newUserResult = await pool.query(
        'INSERT INTO users(username, email, google_id, created_at) VALUES($1, $2, $3, NOW()) RETURNING *',
        [username, email, profile.id]
      );
      
      return done(null, newUserResult.rows[0]);
    } catch (error) {
      return done(error as Error);
    }
  }
));

// Serialize user to store in session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: number, done) => {
  try {
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    
    if (userResult.rows.length === 0) {
      return done(new Error('User not found'));
    }
    
    done(null, userResult.rows[0]);
  } catch (error) {
    done(error);
  }
});

export default passport; 