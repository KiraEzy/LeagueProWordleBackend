-- Players table (updated for worlds_players.json structure)
CREATE TABLE public.players (
	id serial4 NOT NULL,
	"name" varchar(100) NOT NULL,
	main_name varchar(100) NOT NULL,
	all_names jsonb DEFAULT '[]'::jsonb NULL,
	nationality varchar(100) NULL,
	residency varchar(100) NULL,
	birthdate date NULL,
	tournament_role varchar(50) NULL,
	team varchar(100) NULL,
	appearance int4 NULL,
	player_current_role varchar(50) NULL,
	is_retired bool DEFAULT false NULL,
	current_team varchar(100) NULL,
	current_team_region varchar(100) NULL,
	msi_appearance int4 NULL,
	worlds_appearance int4 NULL,
	CONSTRAINT players_name_key UNIQUE (name),
	CONSTRAINT players_pkey PRIMARY KEY (id)
);

-- Daily answers table
CREATE TABLE public.daily_answers (
	id serial4 NOT NULL,
	"date" date NOT NULL,
	player_id int4 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT daily_answers_date_key UNIQUE (date),
	CONSTRAINT daily_answers_pkey PRIMARY KEY (id),
	CONSTRAINT daily_answers_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id)
);

-- Users table (updated for Google auth)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    google_id VARCHAR(100) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User guesses table
CREATE TABLE public.daily_user_guesses (
	id int4 DEFAULT nextval('user_guesses_id_seq'::regclass) NOT NULL,
	user_id int4 NULL,
	session_id varchar(100) NOT NULL,
	guess_date date NOT NULL,
	player_guessed_id int4 NULL,
	attempt_number int4 NOT NULL,
	correct bool NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT user_guesses_pkey PRIMARY KEY (id),
	CONSTRAINT user_guesses_player_guessed_id_fkey FOREIGN KEY (player_guessed_id) REFERENCES public.players(id),
	CONSTRAINT user_guesses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

-- Guess feedback table (detailed feedback for each guess)
CREATE TABLE public.guess_feedback (
	id serial4 NOT NULL,
	guess_id int4 NULL,
	property_name varchar(50) NOT NULL,
	is_correct bool NOT NULL,
	is_close bool NOT NULL,
	hint text NULL,
	CONSTRAINT guess_feedback_pkey PRIMARY KEY (id),
	CONSTRAINT guess_feedback_guess_id_fkey FOREIGN KEY (guess_id) REFERENCES public.daily_user_guesses(id)
);

-- User stats table
CREATE TABLE IF NOT EXISTS user_stats (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) NULL, -- NULL for anonymous
    session_id VARCHAR(100) NOT NULL, -- To track anonymous sessions
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    max_streak INTEGER DEFAULT 0,
    guess_distribution JSONB DEFAULT '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0}'
); 