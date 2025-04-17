import fs from 'fs';
import path from 'path';
import pool from '../config/database';

/**
 * Initialize the database by running the schema.sql script
 */
async function initializeDatabase() {
  try {
    // Read schema.sql file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Execute the SQL commands
    await pool.query(schema);
    console.log('Database schema initialized successfully');

    // Close the pool connection
    await pool.end();
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

// Run the initialization
initializeDatabase(); 