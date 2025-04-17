import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

/**
 * Middleware to handle anonymous sessions
 * - Uses express-session to store anonymous ID
 * - Backwards compatible with X-Session-ID header for legacy clients
 */
export const sessionMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check for session ID in header (this is set by frontend for both anonymous and authenticated users)
    const headerSessionId = req.headers['x-session-id'] as string;
    
    // Check for auth token (Bearer token in Authorization header)
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    let userId = null;
    let googleId = null;
    let isAuthenticated = false;
    
    // If token exists, this is an authenticated request, verify it
    if (token) {
      try {
        // Verify token and extract user info
        const secret = process.env.SESSION_SECRET || 'default_jwt_secret';
        const decoded = jwt.verify(token, secret) as any;
        userId = decoded.userId;
        googleId = decoded.googleId; // This will be set if it's a Google auth
        isAuthenticated = true;
        
        // Add user info to request for controller access
        (req as any).user = { id: userId };
        console.log(`Authenticated request from user ID: ${userId}${googleId ? ' (Google auth)' : ''}`);
      } catch (tokenError) {
        console.warn('Invalid token:', tokenError.message);
        // Continue as anonymous if token is invalid
      }
    }
    
    // Initialize anonymous_id in session if not present AND not authenticated,
    // or preserve existing anonymous ID for authenticated users
    if (!req.session.anonymous_id) {
      if (isAuthenticated) {
        // For authenticated users, we'll use their provided session ID but log differently
        req.session.anonymous_id = headerSessionId || uuidv4();
        console.log(`Setting session ID for authenticated user: ${req.session.anonymous_id}`);
      } else {
        // For anonymous users, create a new ID if not provided
        req.session.anonymous_id = headerSessionId || uuidv4();
        console.log(`New anonymous ID created: ${req.session.anonymous_id}`);
      }
    } else {
      // If there's already a session ID, log appropriately based on auth status
      if (isAuthenticated) {
        console.log(`Existing session ID for authenticated user: ${req.session.anonymous_id}`);
      } else {
        console.log(`Existing anonymous ID: ${req.session.anonymous_id}`);
      }
    }
    
    // For API compatibility, also set the legacy X-Session-ID response header
    res.setHeader('X-Session-ID', req.session.anonymous_id);
    
    next();
  } catch (error) {
    console.error('Session middleware error:', error);
    next(); // Continue even if there's an error with session handling
  }
}; 