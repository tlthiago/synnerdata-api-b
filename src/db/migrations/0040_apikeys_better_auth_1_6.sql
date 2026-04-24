ALTER TABLE "apikeys" RENAME COLUMN "user_id" TO "reference_id";
ALTER INDEX "apikeys_userId_idx" RENAME TO "apikeys_referenceId_idx";
ALTER TABLE "apikeys" ADD COLUMN "config_id" text DEFAULT 'default' NOT NULL;
