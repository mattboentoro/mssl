-- Suspensions ride on the disciplinary record that caused them.
--
-- `gamesSuspended` is the ban length in fixtures and doubles as the review
-- state for a red card: NULL means nobody has decided yet, 0 means reviewed
-- with no ban, and a positive number is the ban itself. Existing rows start at
-- NULL, which correctly puts historical reds into the review queue.
ALTER TABLE "DisciplinaryAction" ADD COLUMN "gamesSuspended" INTEGER;
ALTER TABLE "DisciplinaryAction" ADD COLUMN "suspensionReason" TEXT;
