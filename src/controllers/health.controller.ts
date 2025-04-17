import { Request, Response } from 'express';
import pool from '../config/database';

export class HealthController {
  /**
   * Simple endpoint to check if the server is running
   */
  static async getStatus(req: Request, res: Response): Promise<void> {
    try {
      res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        message: 'Server is running'
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Check if the database connection is working
   */
  static async getDatabaseStatus(req: Request, res: Response): Promise<void> {
    try {
      // Try to execute a simple query to check database connection
      const result = await pool.query('SELECT NOW()');
      
      res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        database: 'connected',
        dbTimestamp: result.rows[0].now
      });
    } catch (error: any) {
      res.status(500).json({
        status: 'online',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: error.message
      });
    }
  }
} 