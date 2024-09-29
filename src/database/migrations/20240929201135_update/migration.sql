/*
  Warnings:

  - Added the required column `created_by` to the `sessions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_by` to the `sessions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "created_by" TEXT NOT NULL,
ADD COLUMN     "updated_by" TEXT NOT NULL;
