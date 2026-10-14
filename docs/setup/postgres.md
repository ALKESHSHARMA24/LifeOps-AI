# PostgreSQL Setup Guide (Local)

This guide sets up PostgreSQL on your Mac for local development. Free, no cloud account needed.

---

## Step 1 — Install PostgreSQL

The easiest way on Mac is Homebrew.

**If you don't have Homebrew:**
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**Install PostgreSQL 16:**
```bash
brew install postgresql@16
```

**Add it to your PATH** (Homebrew will print the exact command, but it's usually):
```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

---

## Step 2 — Start PostgreSQL

```bash
# Start the server (runs in background)
brew services start postgresql@16

# Verify it's running
brew services list
# You should see postgresql@16 with status "started"
```

---

## Step 3 — Create the database

```bash
# Open the PostgreSQL interactive terminal
psql postgres

# Inside psql, create the database:
CREATE DATABASE lifeops;

# Create a user (optional but cleaner than using the default):
CREATE USER lifeops_user WITH PASSWORD 'yourpassword';
GRANT ALL PRIVILEGES ON DATABASE lifeops TO lifeops_user;

# Exit psql
\q
```

---

## Step 4 — Enable pgvector extension

pgvector adds vector/embedding support to PostgreSQL. We need it for Phase 2 (RAG).  
Install it now so it's ready when we need it.

```bash
# Install pgvector via Homebrew
brew install pgvector

# Connect to your database
psql -d lifeops

# Enable the extension (one-time setup per database)
CREATE EXTENSION IF NOT EXISTS vector;

# Verify
\dx
# You should see "vector" in the list

\q
```

---

## Step 5 — Configure your connection string

Copy `.env.local.example` to `.env.local`:
```bash
cp .env.local.example .env.local
```

Edit `.env.local` and set your `DATABASE_URL`:

```
# If you created a dedicated user:
DATABASE_URL=postgresql://lifeops_user:yourpassword@localhost:5432/lifeops

# If you're using the default postgres user (Mac default has no password):
DATABASE_URL=postgresql://postgres@localhost:5432/lifeops
```

---

## Step 6 — Run database migrations

This creates all the tables from `src/db/schema.ts`.

```bash
# Install dependencies first (if you haven't)
npm install

# Generate migration files from schema
npm run db:generate

# Apply migrations to the database
npm run db:migrate
```

You should see output confirming each table was created.

---

## Step 7 — Verify everything works

```bash
# Open Drizzle Studio — a visual database browser
npm run db:studio
```

This opens a browser UI at `https://local.drizzle.studio` where you can see your tables.

---

## Step 8 — Start the app

```bash
# Generate your AUTH_SECRET
openssl rand -base64 32
# Copy the output into .env.local as AUTH_SECRET=...

# Start the development server
npm run dev
```

Visit `http://localhost:3000` — you should see the LifeOps login page.

---

## Common issues

| Problem | Fix |
|---|---|
| `psql: command not found` | Run `source ~/.zshrc` or restart terminal after Step 1 |
| `could not connect to server` | PostgreSQL isn't running — run `brew services start postgresql@16` |
| `database "lifeops" does not exist` | Run Step 3 again |
| `role "postgres" does not exist` | On Mac the default role is your system username. Try `psql -U $USER postgres` |
| Migration fails | Check `DATABASE_URL` in `.env.local` — no trailing slash, correct password |

---

## Stop PostgreSQL (when not developing)

```bash
brew services stop postgresql@16
```
