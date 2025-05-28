-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop dependent types/tables first if they exist and you want a clean slate (optional, use with caution)
-- DROP TABLE IF EXISTS boredombusters_activities CASCADE;
-- DROP TABLE IF EXISTS boredombusters_users CASCADE;
-- DROP TYPE IF EXISTS boredombusters_cost_level_enum CASCADE;

-- Create ENUM type for CostLevel
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'boredombusters_cost_level_enum') THEN
        CREATE TYPE boredombusters_cost_level_enum AS ENUM ('free', 'low', 'medium', 'high');
    END IF;
END$$;

-- Create Users Table
CREATE TABLE IF NOT EXISTS boredombusters_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    username VARCHAR(100) UNIQUE,
    current_hashed_refresh_token TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create Indexes for Users Table
CREATE UNIQUE INDEX IF NOT EXISTS idx_boredombusters_users_email ON boredombusters_users(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_boredombusters_users_username ON boredombusters_users(username) WHERE username IS NOT NULL; -- Index only non-null usernames

-- Create Activities Table
CREATE TABLE IF NOT EXISTS boredombusters_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    type VARCHAR(100) NOT NULL, -- e.g., educational, recreational, social, diy, charity, cooking, relaxation, music, sport, other
    participants_min INT,
    participants_max INT,
    cost_level boredombusters_cost_level_enum DEFAULT 'free' NOT NULL,
    duration_min INT, -- Duration in minutes
    duration_max INT, -- Duration in minutes
    contributor_name VARCHAR(255), -- Name of the user who submitted it, can be derived or explicitly set
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_user
        FOREIGN KEY(user_id)
        REFERENCES boredombusters_users(id)
        ON DELETE CASCADE
);

-- Create Index for Activities Table type
CREATE INDEX IF NOT EXISTS idx_boredombusters_activities_type ON boredombusters_activities(type);

-- Optional: Add comments to tables and columns if desired for more context in pgAdmin or other tools
COMMENT ON COLUMN boredombusters_activities.type IS 'e.g., educational, recreational, social, diy, charity, cooking, relaxation, music, sport, other';
COMMENT ON COLUMN boredombusters_activities.duration_min IS 'Duration in minutes';
COMMENT ON COLUMN boredombusters_activities.duration_max IS 'Duration in minutes';
COMMENT ON COLUMN boredombusters_activities.contributor_name IS 'Name of the user who submitted it, can be derived or explicitly set';

-- Function to automatically update 'updated_at' timestamp (if not handled by TypeORM's @UpdateDateColumn behavior directly by the DB)
-- PostgreSQL versions 10+ handle this with `onUpdate: 'CURRENT_TIMESTAMP'` in TypeORM,
-- but if you need a trigger for older versions or more explicit control:
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to users table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'set_timestamp_users' AND tgrelid = 'boredombusters_users'::regclass
    ) THEN
        CREATE TRIGGER set_timestamp_users
        BEFORE UPDATE ON boredombusters_users
        FOR EACH ROW
        EXECUTE FUNCTION trigger_set_timestamp();
    END IF;
END$$;

-- Apply the trigger to activities table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'set_timestamp_activities' AND tgrelid = 'boredombusters_activities'::regclass
    ) THEN
        CREATE TRIGGER set_timestamp_activities
        BEFORE UPDATE ON boredombusters_activities
        FOR EACH ROW
        EXECUTE FUNCTION trigger_set_timestamp();
    END IF;
END$$;

-- Note on `updated_at` trigger:
-- TypeORM's `@UpdateDateColumn` with `onUpdate: 'CURRENT_TIMESTAMP'` usually relies on database capabilities.
-- For PostgreSQL, this specific `onUpdate` behavior for `DEFAULT CURRENT_TIMESTAMP` is for inserts, not updates.
-- The trigger above ensures `updated_at` is modified on every update. If your TypeORM setup handles this
-- at the application level or through a different DB mechanism, the trigger might be redundant but harmless.
-- Your entity has `onUpdate: 'CURRENT_TIMESTAMP'`, which TypeORM translates. The trigger is a DB-level guarantee.
