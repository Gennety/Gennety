-- CreateEnum
CREATE TYPE "CommunityVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "CommunityProfileVisibility" AS ENUM ('VISIBLE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "CommunityStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CommunityMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "CommunityMemberStatus" AS ENUM ('ACTIVE', 'REMOVED', 'BANNED');

-- CreateEnum
CREATE TYPE "CommunityInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CommunityCategory" AS ENUM ('INVESTMENTS', 'SCIENCE', 'TECHNOLOGY');

-- CreateEnum
CREATE TYPE "CommunitySpecialization" AS ENUM (
  'INVESTOR_HUB',
  'ANGEL_HUB',
  'BIOLOGISTS',
  'RESEARCHERS',
  'SCIENTISTS',
  'SPACE_RESEARCH',
  'AI_DEVELOPMENT',
  'SOLO_FOUNDERS'
);

-- CreateTable
CREATE TABLE "communities" (
  "id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "visibility" "CommunityVisibility" NOT NULL DEFAULT 'PRIVATE',
  "profile_visibility" "CommunityProfileVisibility" NOT NULL DEFAULT 'VISIBLE',
  "category" "CommunityCategory",
  "specialization" "CommunitySpecialization",
  "status" "CommunityStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "communities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_members" (
  "id" TEXT NOT NULL,
  "community_id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "role" "CommunityMemberRole" NOT NULL DEFAULT 'MEMBER',
  "status" "CommunityMemberStatus" NOT NULL DEFAULT 'ACTIVE',
  "show_on_profile" BOOLEAN NOT NULL DEFAULT true,
  "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "community_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_invites" (
  "id" TEXT NOT NULL,
  "community_id" TEXT NOT NULL,
  "inviter_owner_id" TEXT NOT NULL,
  "invitee_owner_id" TEXT,
  "invitee_email" TEXT,
  "token_hash" TEXT NOT NULL,
  "status" "CommunityInviteStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "community_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "communities_slug_key" ON "communities"("slug");

-- CreateIndex
CREATE INDEX "communities_owner_id_idx" ON "communities"("owner_id");

-- CreateIndex
CREATE INDEX "communities_visibility_status_category_idx" ON "communities"("visibility", "status", "category");

-- CreateIndex
CREATE UNIQUE INDEX "community_members_community_id_owner_id_key" ON "community_members"("community_id", "owner_id");

-- CreateIndex
CREATE INDEX "community_members_owner_id_status_show_on_profile_idx" ON "community_members"("owner_id", "status", "show_on_profile");

-- CreateIndex
CREATE INDEX "community_members_community_id_status_idx" ON "community_members"("community_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "community_invites_token_hash_key" ON "community_invites"("token_hash");

-- CreateIndex
CREATE INDEX "community_invites_community_id_status_idx" ON "community_invites"("community_id", "status");

-- CreateIndex
CREATE INDEX "community_invites_invitee_owner_id_status_idx" ON "community_invites"("invitee_owner_id", "status");

-- CreateIndex
CREATE INDEX "community_invites_invitee_email_status_idx" ON "community_invites"("invitee_email", "status");

-- CreateIndex
CREATE INDEX "community_invites_expires_at_idx" ON "community_invites"("expires_at");

-- AddForeignKey
ALTER TABLE "communities" ADD CONSTRAINT "communities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_invites" ADD CONSTRAINT "community_invites_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_invites" ADD CONSTRAINT "community_invites_inviter_owner_id_fkey" FOREIGN KEY ("inviter_owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_invites" ADD CONSTRAINT "community_invites_invitee_owner_id_fkey" FOREIGN KEY ("invitee_owner_id") REFERENCES "owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
