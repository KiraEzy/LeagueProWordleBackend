#!/usr/bin/env python3
import json
import os
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Database connection parameters from environment variables
DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_PORT = os.getenv("POSTGRES_PORT", "5432")
DB_NAME = os.getenv("POSTGRES_DB", "leaguewordle")
DB_USER = os.getenv("POSTGRES_USER", "postgres")
DB_PASS = os.getenv("POSTGRES_PASSWORD", "yourpassword")

def connect_to_db():
    """Connect to the PostgreSQL database"""
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASS
        )
        return conn
    except Exception as e:
        print(f"Error connecting to the database: {e}")
        exit(1)

def process_player_data(player):
    """Process a player object to ensure it has all required fields"""
    # Define default values
    defaults = {
        "team": "Unknown",
        "role": "Unknown",
        "region": "Unknown",
        "active": True,
        "year_started": 2010,
        "nationality": "Unknown",
        "image_url": None
    }
    
    # Merge with defaults for any missing fields
    for key, value in defaults.items():
        if key not in player or player[key] is None:
            player[key] = value
    
    return player

def import_players(json_file_path):
    """Import players from JSON file to PostgreSQL database"""
    try:
        # Read JSON file
        with open(json_file_path, 'r', encoding='utf-8') as file:
            data = json.load(file)
        
        # Connect to database
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Check if the players table exists
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'players'
            );
        """)
        table_exists = cursor.fetchone()[0]
        
        if not table_exists:
            print("The 'players' table does not exist. Please run the init-db script first.")
            conn.close()
            return
        
        # Prepare player data for insertion
        players_to_insert = []
        
        # Handle different JSON structures
        if isinstance(data, list):
            # JSON is an array of players
            player_list = data
        elif isinstance(data, dict) and "players" in data:
            # JSON has a "players" property
            player_list = data["players"]
        elif isinstance(data, dict):
            # JSON is a dictionary of player objects
            player_list = list(data.values())
        else:
            print("Unsupported JSON format. Please provide a list of players or an object with a 'players' array.")
            conn.close()
            return
        
        # Process each player
        for player in player_list:
            processed_player = process_player_data(player)
            
            # Extract fields in the correct order
            player_tuple = (
                processed_player.get("name"),
                processed_player.get("team"),
                processed_player.get("role"),
                processed_player.get("region"),
                processed_player.get("active"),
                processed_player.get("year_started"),
                processed_player.get("nationality"),
                processed_player.get("image_url")
            )
            
            players_to_insert.append(player_tuple)
        
        # Skip if no players to insert
        if not players_to_insert:
            print("No players found in the JSON file.")
            conn.close()
            return
        
        # Insert players in batches
        execute_values(
            cursor,
            """
            INSERT INTO players 
                (name, team, role, region, active, year_started, nationality, image_url)
            VALUES %s
            ON CONFLICT (name) DO UPDATE SET
                team = EXCLUDED.team,
                role = EXCLUDED.role,
                region = EXCLUDED.region,
                active = EXCLUDED.active,
                year_started = EXCLUDED.year_started,
                nationality = EXCLUDED.nationality,
                image_url = EXCLUDED.image_url
            """,
            players_to_insert
        )
        
        # Commit changes and close connection
        conn.commit()
        print(f"Successfully imported {len(players_to_insert)} players.")
        
        # Close connection
        cursor.close()
        conn.close()
        
    except json.JSONDecodeError:
        print("Error: Invalid JSON file.")
    except Exception as e:
        print(f"Error importing players: {e}")

def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Import player data from JSON to PostgreSQL')
    parser.add_argument('json_file', help='Path to the JSON file containing player data')
    
    args = parser.parse_args()
    import_players(args.json_file)

if __name__ == "__main__":
    main() 