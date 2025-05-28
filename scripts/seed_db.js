import { Client } from 'pg'; // Using 'pg' client
import * as dotenv from 'dotenv';
import _path from 'node:path';
import _fs from 'node:fs';
import * as bcrypt from 'bcryptjs'; // For password hashing
import { fileURLToPath } from 'node:url';
import { parse } from 'pg-connection-string'; // To parse the DB URL

// Correctly get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = _path.dirname(__filename);

const projectRoot = _path.resolve(__dirname, '..');
dotenv.config({ path: _path.join(projectRoot, '.env.development') });

const adjectives = [
  'Active', 'Adventurous', 'Bold', 'Bright', 'Creative', 'Curious', 'Eager',
  'Free', 'Fresh', 'Fun', 'Happy', 'Inspired', 'Jolly', 'Joyful', 'Keen',
  'Lively', 'Magical', 'Playful', 'Quick', 'Radiant', 'Spirited', 'Sunny',
  'Upbeat', 'Vibrant', 'Whimsical', 'Zestful'
];
const nouns = [
  'Adventure', 'Spark', 'Quest', 'Idea', 'Journey', 'Dream', 'Muse',
  'Boost', 'Charm', 'Echo', 'Flair', 'Glimmer', 'Groove', 'Hike',
  'Jive', 'Leap', 'Mirth', 'Nudge', 'Pioneer', 'Rhythm', 'Soar',
  'Thrill', 'Venture', 'Wander', 'Zephyr', 'Bloom'
];

/**
 * @typedef {object} SeedActivityData
 * @property {string} user_id - Placeholder like "user_1_uuid"
 * @property {string} title
 * @property {string} description
 * @property {string} type
 * @property {number | null} participants_min
 * @property {number | null} participants_max
 * @property {string} cost_level // Assuming 'free', 'low', 'medium', 'high'
 * @property {number | null} duration_min
 * @property {number | null} duration_max
 */

function generateUsername() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj}_${noun}`;
}

async function main() {
  const dbUrl = process.env.SEED_DB;
  if (!dbUrl) {
    console.error('SEED_DB environment variable is not set.');
    process.exit(1);
  }

  // Parse the database URL for connection parameters
  const dbConfig = parse(dbUrl);
  const client = new Client(dbConfig);

  try {
    await client.connect();
    console.log('Connected to PostgreSQL database!');

    // --- Seed Users ---
    console.log('Seeding users...');
    const seededUsersMap = new Map(); // Maps placeholder "user_X_uuid" to actual {id, username}
    const userPlaceholders = ['user_1_uuid', 'user_2_uuid', 'user_3_uuid'];
    const userCredentials = [
      { email: 'user1@example.com', password: 'Password1!' },
      { email: 'user2@example.com', password: 'Password2!' },
      { email: 'user3@example.com', password: 'Password3!' },
    ];

    for (let i = 0; i < userCredentials.length; i++) {
      const cred = userCredentials[i];
      const placeholderId = userPlaceholders[i];

      // Check if user already exists by email
      const existingUserRes = await client.query('SELECT id, username FROM boredombusters_users WHERE email = $1', [cred.email]); // Added prefix
      let userData;

      if (existingUserRes.rows.length > 0) {
        userData = existingUserRes.rows[0];
        console.log(`User ${cred.email} already exists with ID: ${userData.id}`);
      } else {
        const hashedPassword = await bcrypt.hash(cred.password, 10);
        let username = generateUsername();

        // Basic uniqueness check for generated username
        let existingUsernameRes = await client.query('SELECT id FROM boredombusters_users WHERE username = $1', [username]); // Added prefix
        while(existingUsernameRes.rows.length > 0) {
            console.warn(`Username ${username} already exists, generating a new one...`);
            username = generateUsername();
            existingUsernameRes = await client.query('SELECT id FROM boredombusters_users WHERE username = $1', [username]); // Added prefix
        }
        
        const insertUserQuery = `
          INSERT INTO boredombusters_users (email, password_hash, username, created_at, updated_at) 
          VALUES ($1, $2, $3, NOW(), NOW()) 
          RETURNING id, username`; // Added prefix
        const newUserRes = await client.query(insertUserQuery, [cred.email, hashedPassword, username]);
        userData = newUserRes.rows[0];
        console.log(`Created user: ${cred.email} with username ${userData.username} and ID: ${userData.id}`);
      }
      seededUsersMap.set(placeholderId, { id: userData.id, username: userData.username });
    }
    console.log('Users seeded.');

    // --- Seed Activities ---
    console.log('Seeding activities...');
    const activitiesJsonPath = _path.join(projectRoot, 'scripts', 'seed_db.json');
    if (!_fs.existsSync(activitiesJsonPath)) {
        console.error(`Seed data file not found: ${activitiesJsonPath}`);
        process.exit(1);
    }
    /** @type {SeedActivityData[]} */
    const activitiesData = JSON.parse(
      _fs.readFileSync(activitiesJsonPath, 'utf-8'),
    );

    for (const activityItem of activitiesData) {
      const creatorInfo = seededUsersMap.get(activityItem.user_id);

      if (!creatorInfo) {
        console.warn(
          `Could not find a target user for placeholder_id: ${activityItem.user_id}. Skipping activity: ${activityItem.title}`,
        );
        continue;
      }

      // Check if activity with this title by this user already exists
      const existingActivityRes = await client.query(
        'SELECT id FROM boredombusters_activities WHERE title = $1 AND user_id = $2', // Added prefix
        [activityItem.title, creatorInfo.id]
      );

      if (existingActivityRes.rows.length > 0) {
        console.log(`Activity "${activityItem.title}" by user ${creatorInfo.username} already exists. Skipping.`);
        continue;
      }

      const insertActivityQuery = `
        INSERT INTO boredombusters_activities ( 
          title, description, type, participants_min, participants_max, 
          cost_level, duration_min, duration_max, user_id, contributor_name,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()
        ) RETURNING id`; // Added prefix
      
      await client.query(insertActivityQuery, [
        activityItem.title,
        activityItem.description,
        activityItem.type,
        activityItem.participants_min,
        activityItem.participants_max,
        activityItem.cost_level,
        activityItem.duration_min,
        activityItem.duration_max,
        creatorInfo.id,
        creatorInfo.username
      ]);
      console.log(`Seeded activity: "${activityItem.title}" for user ${creatorInfo.username}`);
    }
    console.log('Activities seeded.');

    console.log('Database seeding completed successfully!');
  } catch (error) {
    console.error('Error during database seeding:', error);
  } finally {
    await client.end();
    console.log('Disconnected from PostgreSQL database.');
  }
}

main().catch((error) => {
  console.error('Unhandled error in main execution:', error);
  process.exit(1);
});