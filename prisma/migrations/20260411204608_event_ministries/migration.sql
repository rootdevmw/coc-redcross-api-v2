/*
  Warnings:

  - You are about to drop the column `ministryId` on the `event` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `event` DROP FOREIGN KEY `Event_ministryId_fkey`;

-- DropIndex
DROP INDEX `Event_ministryId_fkey` ON `event`;

-- AlterTable
ALTER TABLE `event` DROP COLUMN `ministryId`;

-- CreateTable
CREATE TABLE `EventMinistry` (
    `eventId` VARCHAR(191) NOT NULL,
    `ministryId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`eventId`, `ministryId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EventMinistry` ADD CONSTRAINT `EventMinistry_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventMinistry` ADD CONSTRAINT `EventMinistry_ministryId_fkey` FOREIGN KEY (`ministryId`) REFERENCES `Ministry`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
