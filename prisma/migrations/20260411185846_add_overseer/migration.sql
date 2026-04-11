-- AlterTable
ALTER TABLE `homecell` ADD COLUMN `overseerId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `ministry` ADD COLUMN `overseerId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Homecell` ADD CONSTRAINT `Homecell_overseerId_fkey` FOREIGN KEY (`overseerId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ministry` ADD CONSTRAINT `Ministry_overseerId_fkey` FOREIGN KEY (`overseerId`) REFERENCES `Member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
