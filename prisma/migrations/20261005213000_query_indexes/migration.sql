-- DropIndex
DROP INDEX "DisciplinaryAction_seasonId_idx";

-- DropIndex
DROP INDEX "Match_seasonId_idx";

-- DropIndex
DROP INDEX "ScoreAppeal_status_idx";

-- CreateIndex
CREATE INDEX "AuditLog_entity_createdAt_idx" ON "AuditLog"("entity", "createdAt");

-- CreateIndex
CREATE INDEX "CaptainResultProposal_status_createdAt_idx" ON "CaptainResultProposal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DisciplinaryAction_seasonId_createdAt_id_idx" ON "DisciplinaryAction"("seasonId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "DisciplinaryAction_seasonId_teamId_createdAt_id_idx" ON "DisciplinaryAction"("seasonId", "teamId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Match_seasonId_kickoffAt_id_idx" ON "Match"("seasonId", "kickoffAt", "id");

-- CreateIndex
CREATE INDEX "Match_seasonId_divisionId_kickoffAt_id_idx" ON "Match"("seasonId", "divisionId", "kickoffAt", "id");

-- CreateIndex
CREATE INDEX "Match_homeTeamId_kickoffAt_idx" ON "Match"("homeTeamId", "kickoffAt");

-- CreateIndex
CREATE INDEX "Match_awayTeamId_kickoffAt_idx" ON "Match"("awayTeamId", "kickoffAt");

-- CreateIndex
CREATE INDEX "RescheduleRequest_status_createdAt_idx" ON "RescheduleRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ScoreAppeal_status_createdAt_idx" ON "ScoreAppeal"("status", "createdAt");
