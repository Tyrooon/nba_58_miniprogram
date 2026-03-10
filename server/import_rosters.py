#!/usr/bin/env python3
import sqlite3
import csv
import datetime
import re

db = sqlite3.connect('data/nba_guess.db')
cursor = db.cursor()

# Build player name to ID mapping
player_map = {}
cursor.execute("SELECT DISTINCT player_id, player_name FROM daily_players")
for row in cursor.fetchall():
    player_map[row[1]] = row[0]
print("Found", len(player_map), "players in DB")

# Read CSV
with open('/Users/tyrone/players.csv', 'r') as f:
    reader = csv.reader(f)
    rows = list(reader)

# Clear existing rosters
cursor.execute("DELETE FROM manager_rosters")
db.commit()
print("Cleared existing rosters")

# Process each user
inserted = 0
skipped = []

for i in range(1, len(rows)):
    row = rows[i]
    user_id = int(row[0]) if row[0] else None

    if not user_id or user_id == 17:
        continue

    acquired_at = datetime.datetime.now().isoformat()

    # Regular players (columns 3-8, index 3-8 in 0-based)
    for j in range(3, 9):
        player_name = row[j] if j < len(row) else ''
        if not player_name:
            continue
        player_name = player_name.strip().strip('"')

        if player_name in player_map:
            player_id = player_map[player_name]
            is_starter = 1 if (j - 3) < 5 else 0
            try:
                cursor.execute(
                    "INSERT INTO manager_rosters (user_id, player_id, player_type, acquired_at, is_starter, is_injured, is_injury_slot) VALUES (?, ?, ?, ?, ?, 0, 0)",
                    (str(user_id), int(player_id), 'regular', acquired_at, is_starter)
                )
                inserted += 1
            except Exception as e:
                skipped.append("User {}: {} (regular) - {}".format(user_id, player_name, e))
        else:
            skipped.append("User {}: {} (regular) - Not found in DB".format(user_id, player_name))

    # Rookie players (columns R1, R2, index 9-10 in 0-based)
    for j in range(9, 11):
        player_name = row[j] if j < len(row) else ''
        if not player_name:
            continue
        player_name = player_name.strip().strip('"')

        if player_name in player_map:
            player_id = player_map[player_name]
            try:
                cursor.execute(
                    "INSERT INTO manager_rosters (user_id, player_id, player_type, acquired_at, is_starter, is_injured, is_injury_slot) VALUES (?, ?, ?, ?, 0, 0, 0)",
                    (str(user_id), int(player_id), 'rookie', acquired_at)
                )
                inserted += 1
            except Exception as e:
                skipped.append("User {}: {} (rookie) - {}".format(user_id, player_name, e))
        else:
            skipped.append("User {}: {} (rookie) - Not found in DB".format(user_id, player_name))

    # Injury player (column 11, index 11 in 0-based)
    if len(row) > 11 and row[11]:
        injury_player = row[11].strip().strip('"')
        injury_time = row[12].strip().strip('"') if len(row) > 12 and row[12] else None

        if injury_player in player_map:
            player_id = player_map[injury_player]
            try:
                cursor.execute(
                    "INSERT INTO manager_rosters (user_id, player_id, player_type, acquired_at, is_starter, is_injured, injured_since, is_injury_slot) VALUES (?, ?, ?, ?, 0, 1, ?, 1)",
                    (str(user_id), int(player_id), 'regular', acquired_at, injury_time)
                )
                inserted += 1
            except Exception as e:
                skipped.append("User {}: {} (injury) - {}".format(user_id, injury_player, e))
        else:
            skipped.append("User {}: {} (injury) - Not found in DB".format(user_id, injury_player))

db.commit()
db.close()

print("\n=== Import Summary ===")
print("Total inserted:", inserted)
print("Skipped:", len(skipped))
for s in skipped:
    print(" ", s)
