-- Keep existing scores while bringing old display names within the new limit.
UPDATE scores SET nickname = substr(nickname, 1, 10) WHERE length(nickname) > 10;

CREATE TRIGGER scores_nickname_insert
BEFORE INSERT ON scores
WHEN length(NEW.nickname) NOT BETWEEN 1 AND 10
BEGIN
  SELECT RAISE(ABORT, 'Nickname must be 1-10 characters.');
END;

CREATE TRIGGER scores_nickname_update
BEFORE UPDATE OF nickname ON scores
WHEN length(NEW.nickname) NOT BETWEEN 1 AND 10
BEGIN
  SELECT RAISE(ABORT, 'Nickname must be 1-10 characters.');
END;
