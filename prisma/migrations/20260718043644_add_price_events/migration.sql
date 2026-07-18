-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicKey" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'FARMER',
    "displayName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "country" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Livestock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "animalId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "metadata" TEXT NOT NULL,
    "appraisedValueUSDC" REAL,
    "appraisalTxHash" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Livestock_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractLoanId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "livestockId" TEXT NOT NULL,
    "principalUSDC" REAL NOT NULL,
    "interestRateBps" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdOnChainAt" DATETIME,
    "repaidAt" DATETIME,
    "liquidatedAt" DATETIME,
    "lastSyncedAt" DATETIME,
    "lastEventLedger" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Loan_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Loan_livestockId_fkey" FOREIGN KEY ("livestockId") REFERENCES "Livestock" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PriceEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creditId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priceUSDC" REAL NOT NULL,
    "volume" REAL,
    "txHash" TEXT,
    "ledger" INTEGER,
    "timestamp" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_publicKey_key" ON "User"("publicKey");

-- CreateIndex
CREATE INDEX "User_publicKey_idx" ON "User"("publicKey");

-- CreateIndex
CREATE UNIQUE INDEX "Livestock_animalId_key" ON "Livestock"("animalId");

-- CreateIndex
CREATE INDEX "Livestock_ownerId_idx" ON "Livestock"("ownerId");

-- CreateIndex
CREATE INDEX "Livestock_verificationStatus_idx" ON "Livestock"("verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_contractLoanId_key" ON "Loan"("contractLoanId");

-- CreateIndex
CREATE INDEX "Loan_borrowerId_idx" ON "Loan"("borrowerId");

-- CreateIndex
CREATE INDEX "Loan_status_idx" ON "Loan"("status");

-- CreateIndex
CREATE INDEX "Loan_contractLoanId_idx" ON "Loan"("contractLoanId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_key_key" ON "IdempotencyKey"("key");

-- CreateIndex
CREATE INDEX "IdempotencyKey_key_idx" ON "IdempotencyKey"("key");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE INDEX "PriceEvent_creditId_idx" ON "PriceEvent"("creditId");

-- CreateIndex
CREATE INDEX "PriceEvent_creditId_timestamp_idx" ON "PriceEvent"("creditId", "timestamp");

-- CreateIndex
CREATE INDEX "PriceEvent_type_idx" ON "PriceEvent"("type");

-- CreateIndex
CREATE INDEX "PriceEvent_timestamp_idx" ON "PriceEvent"("timestamp");
