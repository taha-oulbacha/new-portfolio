#!/usr/bin/env bash
# One-shot local setup: finds or installs MySQL, creates the database,
# writes .env, builds the tables, makes your login, and starts the server.
# Run it with:   bash setup-local.sh

cd "$(dirname "$0")" || exit 1

BOLD=$'\033[1m'; GREEN=$'\033[32m'; RED=$'\033[31m'; YEL=$'\033[33m'; OFF=$'\033[0m'
say()  { printf "%s\n" "${BOLD}$1${OFF}"; }
ok()   { printf "%s\n" "${GREEN}✓ $1${OFF}"; }
warn() { printf "%s\n" "${YEL}! $1${OFF}"; }
die()  { printf "%s\n" "${RED}✗ $1${OFF}"; exit 1; }

DB_NAME=portfolio
DB_USER=portfolio
DB_PASS=devpass
DB_PORT=3306
APP_PORT=3000

# ── 1. Node ──────────────────────────────────────────────────────────
say "1/7  Checking Node…"
command -v node >/dev/null 2>&1 || die "Node isn't installed. Get it from https://nodejs.org then run this again."
ok "Node $(node -v)"

# ── 2. Find the mysql client ─────────────────────────────────────────
say "2/7  Looking for MySQL…"
MYSQL=""
if command -v mysql >/dev/null 2>&1; then
  MYSQL="$(command -v mysql)"
else
  for dir in /usr/local/mysql/bin /opt/homebrew/bin /usr/local/bin \
             /opt/homebrew/opt/mysql/bin /usr/local/opt/mysql/bin \
             /opt/homebrew/opt/mariadb/bin /Applications/MAMP/Library/bin; do
    [ -x "$dir/mysql" ] && MYSQL="$dir/mysql" && break
  done
fi

if [ -z "$MYSQL" ]; then
  warn "MySQL isn't installed."
  if command -v brew >/dev/null 2>&1; then
    say "     Installing it with Homebrew — this takes a few minutes…"
    brew install mysql || die "brew install mysql failed. Read the message above."
    for dir in "$(brew --prefix)/bin" "$(brew --prefix)/opt/mysql/bin"; do
      [ -x "$dir/mysql" ] && MYSQL="$dir/mysql" && break
    done
  else
    die "Homebrew isn't installed either. Install it first:
    /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"
  Then run this script again."
  fi
fi
[ -n "$MYSQL" ] || die "Still can't find the mysql command after installing."
ok "Using $MYSQL"

# ── 3. Make sure the server is running ───────────────────────────────
say "3/7  Making sure MySQL is running…"
is_up() { "$MYSQL" -h 127.0.0.1 -P "$DB_PORT" -u root -e "SELECT 1" >/dev/null 2>&1 \
       || "$MYSQL" -u root -e "SELECT 1" >/dev/null 2>&1 \
       || nc -z 127.0.0.1 "$DB_PORT" >/dev/null 2>&1; }

if ! is_up; then
  if command -v brew >/dev/null 2>&1; then
    brew services start mysql >/dev/null 2>&1 || brew services start mariadb >/dev/null 2>&1
  elif [ -x /usr/local/mysql/support-files/mysql.server ]; then
    sudo /usr/local/mysql/support-files/mysql.server start
  fi
  printf "     waiting for it to come up"
  for _ in $(seq 1 30); do
    is_up && break
    printf "."; sleep 2
  done
  printf "\n"
fi
is_up || die "MySQL still isn't answering on port $DB_PORT.
  Try:  brew services restart mysql
  Then run this script again."
ok "MySQL is up"

# ── 4. Create the database and its user ──────────────────────────────
say "4/7  Creating the '$DB_NAME' database…"
SQL="CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASS';
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'127.0.0.1';
GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;"

# sudo -n never prompts: if it can't work without a password it just fails,
# so you are never asked for your Mac password by mistake.
if "$MYSQL" -u root -e "$SQL" >/dev/null 2>&1; then
  ok "Created (root needed no password)"
elif sudo -n "$MYSQL" -u root -e "$SQL" >/dev/null 2>&1; then
  ok "Created"
else
  printf "\n"
  warn "Your MySQL root account is protected by a password."
  printf "     This is the %sMySQL%s root password you chose when you installed MySQL —\n" "$BOLD" "$OFF"
  printf "     NOT your Mac login password.\n\n"
  ATTEMPTS=0
  while :; do
    printf "     MySQL root password (hidden, or press Enter to give up): "
    read -rs ROOT_PW; printf "\n"
    if [ -z "$ROOT_PW" ]; then
      die "No password given.
  If you do not know it, reset MySQL like this:
    1. Open  System Settings  >  MySQL  (bottom of the sidebar)
    2. Click  Initialize Database
    3. Type a new root password, pick 'Use Strong Password Encryption', click OK
    4. Click  Start MySQL Server
    5. Run  bash setup-local.sh  again and enter that new password
  (Initialize Database erases MySQL's contents — fine here, you have nothing in it yet.)"
    fi
    if "$MYSQL" -u root -p"$ROOT_PW" -e "$SQL" >/dev/null 2>&1; then
      ok "Created"
      break
    fi
    ATTEMPTS=$((ATTEMPTS + 1))
    warn "That password was refused. ($ATTEMPTS)"
  done
fi

# ── 5. Write .env ────────────────────────────────────────────────────
say "5/7  Writing .env…"

# Another project may already own 3000. Take the next free port rather than
# making you stop whatever is running.
port_busy() { nc -z 127.0.0.1 "$1" >/dev/null 2>&1; }
if [ -f .env ] && grep -q '^PORT=' .env; then
  APP_PORT=$(grep '^PORT=' .env | cut -d= -f2)
fi
if port_busy "$APP_PORT"; then
  for candidate in 3000 3100 3200 4000 4100 5000 5100; do
    if ! port_busy "$candidate"; then APP_PORT="$candidate"; break; fi
  done
fi
if port_busy "$APP_PORT"; then
  die "Ports 3000–5100 are all busy. Free one, then run this again."
fi
[ "$APP_PORT" = "3000" ] || warn "Port 3000 was taken — using $APP_PORT instead."
SECRET=""
[ -f .env ] && SECRET=$(grep '^JWT_SECRET=' .env | cut -d= -f2-)
if [ -z "$SECRET" ] || [ ${#SECRET} -lt 32 ]; then
  SECRET=$(openssl rand -hex 48)
fi
cat > .env <<EOF
PORT=$APP_PORT
NODE_ENV=development
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
PUBLIC_URL=http://localhost:$APP_PORT
DB_HOST=127.0.0.1
DB_PORT=$DB_PORT
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASS
DB_NAME=$DB_NAME
JWT_SECRET=$SECRET
SESSION_DAYS=7
EOF
ok ".env written (port $APP_PORT)"

# Point the site at this port too, but never clobber a real deployed URL.
if [ -f ../config.js ] && grep -q 'apiBase: "http://localhost:' ../config.js; then
  sed -i '' -E "s|apiBase: \"http://localhost:[0-9]+\"|apiBase: \"http://localhost:$APP_PORT\"|" ../config.js 2>/dev/null \
    || sed -i -E "s|apiBase: \"http://localhost:[0-9]+\"|apiBase: \"http://localhost:$APP_PORT\"|" ../config.js
  ok "config.js now points at port $APP_PORT"
fi

# ── 6. Install packages and build the tables ─────────────────────────
say "6/7  Installing packages and creating the tables…"
[ -d node_modules ] || npm install --silent || die "npm install failed."
npm run migrate --silent || die "Could not create the tables. The error above says why."
ok "Tables ready"

# ── 7. Your dashboard login ──────────────────────────────────────────
say "7/7  Your dashboard login"
printf "     Email [taha.oulbacha07@gmail.com]: "
read -r ADMIN_EMAIL
[ -z "$ADMIN_EMAIL" ] && ADMIN_EMAIL="taha.oulbacha07@gmail.com"

while :; do
  printf "     Password (at least 10 characters, hidden): "
  read -rs ADMIN_PW; printf "\n"
  [ ${#ADMIN_PW} -ge 10 ] && break
  warn "Too short — try again."
done
node src/scripts/create-admin.js "$ADMIN_EMAIL" "$ADMIN_PW" || die "Could not create the login."

printf "     Add 40 fake leads so the charts aren't empty? [y/N]: "
read -r SEED
case "$SEED" in [yY]*) npm run seed --silent && ok "Demo leads added";; esac

# Port 3000 free?
if port_busy "$APP_PORT"; then
  warn "Port $APP_PORT is busy — probably this server from an earlier run."
  printf "     Stop it and take over the port? [Y/n]: "
  read -r KILLIT
  case "$KILLIT" in
    [nN]*) die "Left it running — your dashboard is already at http://localhost:$APP_PORT/admin" ;;
    *) lsof -ti tcp:"$APP_PORT" 2>/dev/null | xargs kill 2>/dev/null; sleep 2 ;;
  esac
fi

printf "\n"
ok "Done. Starting the server…"
printf "\n"
printf "   Dashboard:  %shttp://localhost:%s/admin%s\n" "$BOLD" "$APP_PORT" "$OFF"
printf "   Sign in as: %s\n" "$ADMIN_EMAIL"
printf "\n   Leave this window open. Ctrl+C stops the server.\n"
printf "   Next time, just run:  npm start\n\n"

sleep 2
command -v open >/dev/null 2>&1 && (sleep 3; open "http://localhost:$APP_PORT/admin") &
npm start
