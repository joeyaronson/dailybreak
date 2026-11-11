CREATE TABLE daily_scores (
  date_key TEXT NOT NULL,
  game_version TEXT NOT NULL,
  browser_id TEXT NOT NULL,
  nickname TEXT NOT NULL CHECK (length(nickname) BETWEEN 1 AND 20),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 3000),
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (date_key, game_version, browser_id)
) WITHOUT ROWID;

CREATE INDEX daily_scores_ranking ON daily_scores (date_key, game_version, score DESC, submitted_at);
