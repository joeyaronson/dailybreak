CREATE TABLE scores (
  date_key TEXT NOT NULL,
  game_version TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('daily', 'endless', 'arcade')),
  browser_id TEXT NOT NULL,
  nickname TEXT NOT NULL CHECK (length(nickname) BETWEEN 1 AND 20),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 1000000),
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (date_key, game_version, mode, browser_id)
) WITHOUT ROWID;

INSERT INTO scores (date_key, game_version, mode, browser_id, nickname, score, submitted_at)
SELECT date_key, game_version, 'daily', browser_id, nickname, score, submitted_at FROM daily_scores;

DROP TABLE daily_scores;
CREATE INDEX scores_ranking ON scores (date_key, game_version, mode, score DESC, submitted_at);
