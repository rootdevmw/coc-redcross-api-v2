/*
  Warnings:

  - You are about to drop the column `order` on the `programitem` table. All the data in the column will be lost.
  - Added the required column `sequence` to the `ProgramItem` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `programitem` DROP FOREIGN KEY `ProgramItem_programId_fkey`;

-- DropIndex
DROP INDEX `ProgramItem_programId_order_idx` ON `programitem`;

-- AlterTable
ALTER TABLE `programitem` DROP COLUMN `order`,
    ADD COLUMN `sequence` INTEGER NOT NULL,
    MODIFY `time` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `ProgramItem_programId_sequence_idx` ON `ProgramItem`(`programId`, `sequence`);

-- AddForeignKey
ALTER TABLE `ProgramItem` ADD CONSTRAINT `ProgramItem_programId_fkey` FOREIGN KEY (`programId`) REFERENCES `Program`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
