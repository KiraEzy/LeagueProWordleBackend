#!/usr/bin/env python3
import json
import os
import datetime
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

def process_player_data(player_key, player_data):
    """Process a player from the worlds_players.json format"""
    # Convert birthdate to proper date format or None if invalid
    birthdate = None
    if 'birthdate' in player_data and player_data['birthdate']:
        try:
            birthdate = datetime.datetime.strptime(player_data['birthdate'], '%Y-%m-%d').date()
        except ValueError:
            pass  # Keep as None if format is invalid
    
    # Convert isRetired string to boolean
    is_retired = False
    if 'isRetired' in player_data:
        is_retired = player_data['isRetired'] == "1"
    
    # Handle all_names as a JSON array
    all_names = []
    if 'allNames' in player_data and isinstance(player_data['allNames'], list):
        all_names = player_data['allNames']
    
    # Process the player dictionary
    processed_player = {
        "name": player_key,  # Use the key as the unique name
        "main_name": player_data.get("mainName", player_key),
        "all_names": json.dumps(all_names),
        "nationality": player_data.get("nationality"),
        "residency": player_data.get("Residency"),
        "birthdate": birthdate,
        "tournament_role": player_data.get("tournament_role"),
        "team": player_data.get("team"),
        "appearance": player_data.get("appearance"),
        "player_current_role": player_data.get("current_role"),
        "is_retired": is_retired,
        "current_team": player_data.get("current_team"),
        "current_team_region": player_data.get("current_team_region")
    }
    
    return processed_player

def import_worlds_players(json_file_path):
    """Import players from worlds_players.json to PostgreSQL database"""
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
        
        # Process each player from the worlds_players.json format
        for player_key, player_data in data.items():
            processed_player = process_player_data(player_key, player_data)
            
            # Extract fields in the correct order
            player_tuple = (
                processed_player["name"],
                processed_player["main_name"],
                processed_player["all_names"],
                processed_player["nationality"],
                processed_player["residency"],
                processed_player["birthdate"],
                processed_player["tournament_role"],
                processed_player["team"],
                processed_player["appearance"],
                processed_player["player_current_role"],
                processed_player["is_retired"],
                processed_player["current_team"],
                processed_player["current_team_region"]
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
                (name, main_name, all_names, nationality, residency, birthdate, 
                tournament_role, team, appearance, player_current_role, is_retired, 
                current_team, current_team_region)
            VALUES %s
            ON CONFLICT (name) DO UPDATE SET
                main_name = EXCLUDED.main_name,
                all_names = EXCLUDED.all_names,
                nationality = EXCLUDED.nationality,
                residency = EXCLUDED.residency,
                birthdate = EXCLUDED.birthdate,
                tournament_role = EXCLUDED.tournament_role,
                team = EXCLUDED.team,
                appearance = EXCLUDED.appearance,
                player_current_role = EXCLUDED.player_current_role,
                is_retired = EXCLUDED.is_retired,
                current_team = EXCLUDED.current_team,
                current_team_region = EXCLUDED.current_team_region
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
    
    parser = argparse.ArgumentParser(description='Import Worlds player data from JSON to PostgreSQL')
    parser.add_argument('json_file', help='Path to the worlds_players.json file')
    
    args = parser.parse_args()
    import_worlds_players(args.json_file)

if __name__ == "__main__":
    main() 