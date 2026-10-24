/*
  Warnings:

  - You are about to alter the column `A` on the `_eventtomedia` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to alter the column `B` on the `_eventtomedia` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `content` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `content` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to alter the column `typeId` on the `content` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to alter the column `authorId` on the `content` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to alter the column `seriesId` on the `content` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `contenttag` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `contentId` on the `contenttag` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to alter the column `tagId` on the `contenttag` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `contenttype` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `contenttype` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `event` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `event` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to alter the column `typeId` on the `event` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `eventministry` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `eventId` on the `eventministry` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to alter the column `ministryId` on the `eventministry` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `eventtype` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `eventtype` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `homecell` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `homecell` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to alter the column `leaderId` on the `homecell` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to alter the column `overseerId` on the `homecell` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `media` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `contentId` on the `media` table. All the data in the column will be lost.
  - You are about to alter the column `id` on the `media` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `member` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `member` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to alter the column `userId` on the `member` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to alter the column `homecellId` on the `member` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `memberministry` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `memberId` on the `memberministry` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to alter the column `ministryId` on the `memberministry` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `ministry` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `ministry` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to alter the column `leaderId` on the `ministry` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to alter the column `overseerId` on the `ministry` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `program` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `program` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to alter the column `typeId` on the `program` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to alter the column `homecellId` on the `program` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `programitem` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `programitem` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to alter the column `programId` on the `programitem` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to alter the column `responsibleId` on the `programitem` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `programtype` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `programtype` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `publication` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `publication` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `role` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `role` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `scriptureref` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `scriptureref` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to alter the column `contentId` on the `scriptureref` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `series` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `series` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `stream` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `platform` on the `stream` table. All the data in the column will be lost.
  - You are about to drop the column `url` on the `stream` table. All the data in the column will be lost.
  - You are about to alter the column `id` on the `stream` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `tag` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `tag` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `user` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `user` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - The primary key for the `userrole` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `userId` on the `userrole` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to alter the column `roleId` on the `userrole` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `BigInt`.
  - You are about to drop the `announcement` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `announcementtarget` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[slug]` on the table `Content` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slug]` on the table `Homecell` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[url]` on the table `Media` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slug]` on the table `Program` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slug]` on the table `Stream` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `slug` to the `Content` table without a default value. This is not possible if the table is not empty.
  - Made the column `slug` on table `event` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `slug` to the `Homecell` table without a default value. This is not possible if the table is not empty.
  - Added the required column `prefix` to the `Member` table without a default value. This is not possible if the table is not empty.
  - Made the column `slug` on table `ministry` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `slug` to the `Program` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slug` to the `Stream` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `_eventtomedia` DROP FOREIGN KEY `_EventToMedia_A_fkey`;

-- DropForeignKey
ALTER TABLE `_eventtomedia` DROP FOREIGN KEY `_EventToMedia_B_fkey`;

-- DropForeignKey
ALTER TABLE `announcementtarget` DROP FOREIGN KEY `AnnouncementTarget_announcementId_fkey`;

-- DropForeignKey
ALTER TABLE `content` DROP FOREIGN KEY `Content_authorId_fkey`;

-- DropForeignKey
ALTER TABLE `content` DROP FOREIGN KEY `Content_seriesId_fkey`;

-- DropForeignKey
ALTER TABLE `content` DROP FOREIGN KEY `Content_typeId_fkey`;

-- DropForeignKey
ALTER TABLE `contenttag` DROP FOREIGN KEY `ContentTag_contentId_fkey`;

-- DropForeignKey
ALTER TABLE `contenttag` DROP FOREIGN KEY `ContentTag_tagId_fkey`;

-- DropForeignKey
ALTER TABLE `event` DROP FOREIGN KEY `Event_typeId_fkey`;

-- DropForeignKey
ALTER TABLE `eventministry` DROP FOREIGN KEY `EventMinistry_eventId_fkey`;

-- DropForeignKey
ALTER TABLE `eventministry` DROP FOREIGN KEY `EventMinistry_ministryId_fkey`;

-- DropForeignKey
ALTER TABLE `homecell` DROP FOREIGN KEY `Homecell_leaderId_fkey`;

-- DropForeignKey
ALTER TABLE `homecell` DROP FOREIGN KEY `Homecell_overseerId_fkey`;

-- DropForeignKey
ALTER TABLE `media` DROP FOREIGN KEY `Media_contentId_fkey`;

-- DropForeignKey
ALTER TABLE `member` DROP FOREIGN KEY `Member_homecellId_fkey`;

-- DropForeignKey
ALTER TABLE `member` DROP FOREIGN KEY `Member_userId_fkey`;

-- DropForeignKey
ALTER TABLE `memberministry` DROP FOREIGN KEY `MemberMinistry_memberId_fkey`;

-- DropForeignKey
ALTER TABLE `memberministry` DROP FOREIGN KEY `MemberMinistry_ministryId_fkey`;

-- DropForeignKey
ALTER TABLE `ministry` DROP FOREIGN KEY `Ministry_leaderId_fkey`;

-- DropForeignKey
ALTER TABLE `ministry` DROP FOREIGN KEY `Ministry_overseerId_fkey`;

-- DropForeignKey
ALTER TABLE `program` DROP FOREIGN KEY `Program_homecellId_fkey`;

-- DropForeignKey
ALTER TABLE `program` DROP FOREIGN KEY `Program_typeId_fkey`;

-- DropForeignKey
ALTER TABLE `programitem` DROP FOREIGN KEY `ProgramItem_programId_fkey`;

-- DropForeignKey
ALTER TABLE `programitem` DROP FOREIGN KEY `ProgramItem_responsibleId_fkey`;

-- DropForeignKey
ALTER TABLE `scriptureref` DROP FOREIGN KEY `ScriptureRef_contentId_fkey`;

-- DropForeignKey
ALTER TABLE `userrole` DROP FOREIGN KEY `UserRole_roleId_fkey`;

-- DropForeignKey
ALTER TABLE `userrole` DROP FOREIGN KEY `UserRole_userId_fkey`;

-- DropIndex
DROP INDEX `Content_authorId_fkey` ON `content`;

-- DropIndex
DROP INDEX `Content_seriesId_fkey` ON `content`;

-- DropIndex
DROP INDEX `ContentTag_tagId_fkey` ON `contenttag`;

-- DropIndex
DROP INDEX `Event_typeId_fkey` ON `event`;

-- DropIndex
DROP INDEX `EventMinistry_ministryId_fkey` ON `eventministry`;

-- DropIndex
DROP INDEX `Homecell_leaderId_fkey` ON `homecell`;

-- DropIndex
DROP INDEX `Homecell_overseerId_fkey` ON `homecell`;

-- DropIndex
DROP INDEX `Media_contentId_fkey` ON `media`;

-- DropIndex
DROP INDEX `Member_homecellId_fkey` ON `member`;

-- DropIndex
DROP INDEX `MemberMinistry_ministryId_fkey` ON `memberministry`;

-- DropIndex
DROP INDEX `Ministry_leaderId_fkey` ON `ministry`;

-- DropIndex
DROP INDEX `Ministry_overseerId_fkey` ON `ministry`;

-- DropIndex
DROP INDEX `Program_homecellId_fkey` ON `program`;

-- DropIndex
DROP INDEX `Program_typeId_fkey` ON `program`;

-- DropIndex
DROP INDEX `ProgramItem_responsibleId_fkey` ON `programitem`;

-- DropIndex
DROP INDEX `ScriptureRef_contentId_fkey` ON `scriptureref`;

-- DropIndex
DROP INDEX `UserRole_roleId_fkey` ON `userrole`;

-- AlterTable
ALTER TABLE `_eventtomedia` MODIFY `A` BIGINT NOT NULL,
    MODIFY `B` BIGINT NOT NULL;

-- AlterTable
ALTER TABLE `content` DROP PRIMARY KEY,
    ADD COLUMN `slug` VARCHAR(191) NOT NULL,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    MODIFY `body` LONGTEXT NOT NULL,
    MODIFY `typeId` BIGINT NOT NULL,
    MODIFY `authorId` BIGINT NULL,
    MODIFY `seriesId` BIGINT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `contenttag` DROP PRIMARY KEY,
    MODIFY `contentId` BIGINT NOT NULL,
    MODIFY `tagId` BIGINT NOT NULL,
    ADD PRIMARY KEY (`contentId`, `tagId`);

-- AlterTable
ALTER TABLE `contenttype` DROP PRIMARY KEY,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `event` DROP PRIMARY KEY,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    MODIFY `slug` VARCHAR(191) NOT NULL,
    MODIFY `typeId` BIGINT NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `eventministry` DROP PRIMARY KEY,
    MODIFY `eventId` BIGINT NOT NULL,
    MODIFY `ministryId` BIGINT NOT NULL,
    ADD PRIMARY KEY (`eventId`, `ministryId`);

-- AlterTable
ALTER TABLE `eventtype` DROP PRIMARY KEY,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `homecell` DROP PRIMARY KEY,
    ADD COLUMN `slug` VARCHAR(191) NOT NULL,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    MODIFY `leaderId` BIGINT NULL,
    MODIFY `overseerId` BIGINT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `media` DROP PRIMARY KEY,
    DROP COLUMN `contentId`,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `member` DROP PRIMARY KEY,
    ADD COLUMN `baptized` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `prefix` VARCHAR(191) NOT NULL,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    MODIFY `userId` BIGINT NULL,
    MODIFY `homecellId` BIGINT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `memberministry` DROP PRIMARY KEY,
    MODIFY `memberId` BIGINT NOT NULL,
    MODIFY `ministryId` BIGINT NOT NULL,
    ADD PRIMARY KEY (`memberId`, `ministryId`);

-- AlterTable
ALTER TABLE `ministry` DROP PRIMARY KEY,
    ADD COLUMN `purpose` VARCHAR(191) NOT NULL DEFAULT 'Serving together with purpose and unity.',
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    MODIFY `description` TEXT NULL,
    MODIFY `leaderId` BIGINT NULL,
    MODIFY `slug` VARCHAR(191) NOT NULL,
    MODIFY `overseerId` BIGINT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `program` DROP PRIMARY KEY,
    ADD COLUMN `location` VARCHAR(191) NULL,
    ADD COLUMN `slug` VARCHAR(191) NOT NULL,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    MODIFY `typeId` BIGINT NOT NULL,
    MODIFY `homecellId` BIGINT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `programitem` DROP PRIMARY KEY,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    MODIFY `programId` BIGINT NOT NULL,
    MODIFY `description` TEXT NULL,
    MODIFY `responsibleId` BIGINT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `programtype` DROP PRIMARY KEY,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `publication` DROP PRIMARY KEY,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    MODIFY `description` TEXT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `role` DROP PRIMARY KEY,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `scriptureref` DROP PRIMARY KEY,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    MODIFY `contentId` BIGINT NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `series` DROP PRIMARY KEY,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    MODIFY `description` TEXT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `stream` DROP PRIMARY KEY,
    DROP COLUMN `platform`,
    DROP COLUMN `url`,
    ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `endsAt` DATETIME(3) NULL,
    ADD COLUMN `slug` VARCHAR(191) NOT NULL,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `tag` DROP PRIMARY KEY,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `user` DROP PRIMARY KEY,
    MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `userrole` DROP PRIMARY KEY,
    MODIFY `userId` BIGINT NOT NULL,
    MODIFY `roleId` BIGINT NOT NULL,
    ADD PRIMARY KEY (`userId`, `roleId`);

-- DropTable
DROP TABLE `announcement`;

-- DropTable
DROP TABLE `announcementtarget`;

-- CreateTable
CREATE TABLE `MemberBio` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `memberId` BIGINT NOT NULL,
    `bio` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MemberBio_memberId_key`(`memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContentMedia` (
    `contentId` BIGINT NOT NULL,
    `mediaId` BIGINT NOT NULL,

    PRIMARY KEY (`contentId`, `mediaId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventMedia` (
    `eventId` BIGINT NOT NULL,
    `mediaId` BIGINT NOT NULL,

    PRIMARY KEY (`eventId`, `mediaId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramTemplate` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `typeId` BIGINT NOT NULL,
    `homecellId` BIGINT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    INDEX `ProgramTemplate_homecellId_idx`(`homecellId`),
    INDEX `ProgramTemplate_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProgramTemplateItem` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `templateId` BIGINT NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `time` VARCHAR(191) NULL,
    `sequence` INTEGER NOT NULL,
    `responsibleId` BIGINT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `ProgramTemplateItem_templateId_sequence_idx`(`templateId`, `sequence`),
    INDEX `ProgramTemplateItem_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Platform` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Platform_name_key`(`name`),
    INDEX `Platform_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StreamPlatform` (
    `streamId` BIGINT NOT NULL,
    `platformId` BIGINT NOT NULL,

    PRIMARY KEY (`streamId`, `platformId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `userId` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `Session_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PasswordResetToken` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PasswordResetToken_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PrayerRequest` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `requestType` VARCHAR(191) NULL,
    `prayerFor` VARCHAR(191) NOT NULL,
    `request` TEXT NOT NULL,
    `isUrgent` BOOLEAN NOT NULL DEFAULT false,
    `shareWithElders` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'REVIEWED', 'PRAYED_FOR') NOT NULL DEFAULT 'PENDING',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PrayerWarrior` (
    `userId` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PrayerWarrior_userId_idx`(`userId`),
    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Visitor` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `visitDate` DATETIME(3) NOT NULL,
    `groupSize` VARCHAR(191) NOT NULL,
    `isChurchOfChrist` VARCHAR(191) NULL,
    `language` VARCHAR(191) NULL,
    `hasSpecialNeeds` BOOLEAN NOT NULL DEFAULT false,
    `specialNeedsDetails` VARCHAR(191) NULL,
    `message` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'COMPLETED') NOT NULL DEFAULT 'PENDING',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttentionAction` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `type` ENUM('PRAYER_REQUEST', 'VISITOR') NOT NULL,
    `referenceId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `performedById` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AttentionAction_referenceId_type_idx`(`referenceId`, `type`),
    INDEX `AttentionAction_performedById_idx`(`performedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `description` VARCHAR(191) NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Content_slug_key` ON `Content`(`slug`);

-- CreateIndex
CREATE UNIQUE INDEX `Homecell_slug_key` ON `Homecell`(`slug`);

-- CreateIndex
CREATE UNIQUE INDEX `Media_url_key` ON `Media`(`url`);

-- CreateIndex
CREATE UNIQUE INDEX `Program_slug_key` ON `Program`(`slug`);

-- CreateIndex
CREATE UNIQUE INDEX `Stream_slug_key` ON `Stream`(`slug`);

-- CreateIndex
CREATE INDEX `Stream_deletedAt_idx` ON `Stream`(`deletedAt`);

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Member` ADD CONSTRAINT `Member_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Member` ADD CONSTRAINT `Member_homecellId_fkey` FOREIGN KEY (`homecellId`) REFERENCES `Homecell`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MemberMinistry` ADD CONSTRAINT `MemberMinistry_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MemberMinistry` ADD CONSTRAINT `MemberMinistry_ministryId_fkey` FOREIGN KEY (`ministryId`) REFERENCES `Ministry`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Homecell` ADD CONSTRAINT `Homecell_leaderId_fkey` FOREIGN KEY (`leaderId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Homecell` ADD CONSTRAINT `Homecell_overseerId_fkey` FOREIGN KEY (`overseerId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MemberBio` ADD CONSTRAINT `MemberBio_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ministry` ADD CONSTRAINT `Ministry_leaderId_fkey` FOREIGN KEY (`leaderId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ministry` ADD CONSTRAINT `Ministry_overseerId_fkey` FOREIGN KEY (`overseerId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Content` ADD CONSTRAINT `Content_typeId_fkey` FOREIGN KEY (`typeId`) REFERENCES `ContentType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Content` ADD CONSTRAINT `Content_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Content` ADD CONSTRAINT `Content_seriesId_fkey` FOREIGN KEY (`seriesId`) REFERENCES `Series`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentMedia` ADD CONSTRAINT `ContentMedia_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentMedia` ADD CONSTRAINT `ContentMedia_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `Media`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventMedia` ADD CONSTRAINT `EventMedia_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventMedia` ADD CONSTRAINT `EventMedia_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `Media`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentTag` ADD CONSTRAINT `ContentTag_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContentTag` ADD CONSTRAINT `ContentTag_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `Tag`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ScriptureRef` ADD CONSTRAINT `ScriptureRef_contentId_fkey` FOREIGN KEY (`contentId`) REFERENCES `Content`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Event` ADD CONSTRAINT `Event_typeId_fkey` FOREIGN KEY (`typeId`) REFERENCES `EventType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventMinistry` ADD CONSTRAINT `EventMinistry_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventMinistry` ADD CONSTRAINT `EventMinistry_ministryId_fkey` FOREIGN KEY (`ministryId`) REFERENCES `Ministry`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Program` ADD CONSTRAINT `Program_typeId_fkey` FOREIGN KEY (`typeId`) REFERENCES `ProgramType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Program` ADD CONSTRAINT `Program_homecellId_fkey` FOREIGN KEY (`homecellId`) REFERENCES `Homecell`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramItem` ADD CONSTRAINT `ProgramItem_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramItem` ADD CONSTRAINT `ProgramItem_responsibleId_fkey` FOREIGN KEY (`responsibleId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramTemplate` ADD CONSTRAINT `ProgramTemplate_typeId_fkey` FOREIGN KEY (`typeId`) REFERENCES `ProgramType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramTemplate` ADD CONSTRAINT `ProgramTemplate_homecellId_fkey` FOREIGN KEY (`homecellId`) REFERENCES `Homecell`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramTemplateItem` ADD CONSTRAINT `ProgramTemplateItem_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `ProgramTemplate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProgramTemplateItem` ADD CONSTRAINT `ProgramTemplateItem_responsibleId_fkey` FOREIGN KEY (`responsibleId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StreamPlatform` ADD CONSTRAINT `StreamPlatform_streamId_fkey` FOREIGN KEY (`streamId`) REFERENCES `Stream`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StreamPlatform` ADD CONSTRAINT `StreamPlatform_platformId_fkey` FOREIGN KEY (`platformId`) REFERENCES `Platform`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PrayerWarrior` ADD CONSTRAINT `PrayerWarrior_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttentionAction` ADD CONSTRAINT `AttentionAction_performedById_fkey` FOREIGN KEY (`performedById`) REFERENCES `Member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_EventToMedia` ADD CONSTRAINT `_EventToMedia_A_fkey` FOREIGN KEY (`A`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_EventToMedia` ADD CONSTRAINT `_EventToMedia_B_fkey` FOREIGN KEY (`B`) REFERENCES `Media`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
