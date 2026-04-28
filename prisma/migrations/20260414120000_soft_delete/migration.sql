-- Soft delete columns and indexes for business tables.

ALTER TABLE `User` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `User_deletedAt_idx` ON `User`(`deletedAt`);

ALTER TABLE `Role` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `Role_deletedAt_idx` ON `Role`(`deletedAt`);

ALTER TABLE `Member` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `Member_deletedAt_idx` ON `Member`(`deletedAt`);

ALTER TABLE `Homecell` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `Homecell_deletedAt_idx` ON `Homecell`(`deletedAt`);

ALTER TABLE `Ministry` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `Ministry_deletedAt_idx` ON `Ministry`(`deletedAt`);

ALTER TABLE `ContentType` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `ContentType_deletedAt_idx` ON `ContentType`(`deletedAt`);

ALTER TABLE `Content` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `Content_deletedAt_idx` ON `Content`(`deletedAt`);

ALTER TABLE `Media` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `Media_deletedAt_idx` ON `Media`(`deletedAt`);

ALTER TABLE `Tag` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `Tag_deletedAt_idx` ON `Tag`(`deletedAt`);

ALTER TABLE `Series` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `Series_deletedAt_idx` ON `Series`(`deletedAt`);

ALTER TABLE `ScriptureRef` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `ScriptureRef_deletedAt_idx` ON `ScriptureRef`(`deletedAt`);

ALTER TABLE `Announcement` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `Announcement_deletedAt_idx` ON `Announcement`(`deletedAt`);

ALTER TABLE `EventType` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `EventType_deletedAt_idx` ON `EventType`(`deletedAt`);

ALTER TABLE `Event` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `Event_deletedAt_idx` ON `Event`(`deletedAt`);

ALTER TABLE `ProgramType` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `ProgramType_deletedAt_idx` ON `ProgramType`(`deletedAt`);

ALTER TABLE `Program` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `Program_deletedAt_idx` ON `Program`(`deletedAt`);

ALTER TABLE `ProgramItem` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `ProgramItem_deletedAt_idx` ON `ProgramItem`(`deletedAt`);

ALTER TABLE `Stream` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `Stream_deletedAt_idx` ON `Stream`(`deletedAt`);

ALTER TABLE `Platform` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `Platform_deletedAt_idx` ON `Platform`(`deletedAt`);

ALTER TABLE `Publication` ADD COLUMN `deletedAt` DATETIME(3) NULL;
CREATE INDEX `Publication_deletedAt_idx` ON `Publication`(`deletedAt`);
