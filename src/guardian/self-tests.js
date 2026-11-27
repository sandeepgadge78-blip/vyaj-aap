// व्याज Infinity X - Automated Financial Verification Suite (src/guardian/self-tests.js)

import {
  toPaise, calcInterestPaise, daysInMonth, parseStrictDate, diffDaysStrict,
  calculateEmiBigInt, buildHistoricalTermUpdate, computeMonthInterestDetails,
  evaluateCompound, buildWalletTransaction, getIstTodayIso, getIstCurrentYm
} from "../core/ledger-v16.js";
import { createTxId, markTxProcessed, isDuplicateTx } from "../data/offline-queue.js";

export function runAllFinancialSelfTests() {
  const results = [];
  const check = (name, actual, expected) => {
    results.push({
      name,
      ok: actual === expected,
      actual: String(actual),
      expected: String(expected)
    });
  };

  // १. अर्ध्या पैशाचे Half-Up Rounding (₹1,050 × 1.13% = ₹11.87)
  check(
    "BigInt Half-Up Rounding (₹1,050 @ 1.13%)",
    calcInterestPaise({ principalPaise: toPaise(1050), rate: 1.13, ratePeriod: "monthly", months: 1 }),
    1187n
  );

  // २. शून्य फ्लोटिंग-पॉईंट त्रुटी (₹0.10 + ₹0.20 = अचूक ₹0.30)
  check("Zero Floating-Point Drift (0.1 + 0.2)", toPaise("0.1") + toPaise("0.2"), 30n);

  // ३. लीप वर्ष कॅलेंडर अचूकता
  check("Leap Year Feb 2024 (29 days)", daysInMonth(2024, 2), 29);
  check("Non-Leap Year Feb 2026 (28 days)", daysInMonth(2026, 2), 28);

  // ४. Strict Date Validator (चुकीच्या व उलट्या तारखा नाकारणे)
  check("Reject Invalid Date (2026-02-30)", parseStrictDate("2026-02-30").valid, false);
  check("Reject Non-Leap Date (2025-02-29)", parseStrictDate("2025-02-29").valid, false);
  check("Accept Leap Date (2024-02-29)", parseStrictDate("2024-02-29").valid, true);
  check("Reject Reverse Date Range", diffDaysStrict("2026-05-10", "2026-05-01").valid, false);

  // ५. तीन दर कालावधी: Yearly Actual/365 आणि Daily
  check(
    "Yearly Actual/365 (₹1,00,000 @ 12% for 73 days = ₹2,400)",
    calcInterestPaise({ principalPaise: toPaise(100000), rate: 12, ratePeriod: "yearly", days: 73 }),
    240000n
  );
  check(
    "Daily Rate (₹50,000 @ 0.1% for 10 days = ₹500)",
    calcInterestPaise({ principalPaise: toPaise(50000), rate: 0.1, ratePeriod: "daily", days: 10 }),
    50000n
  );

  // ६. BigInt Reducing व Flat EMI (शेवटची शिल्लक अचूक ० पैसे)
  const redEmi = calculateEmiBigInt({ principal: 100000, monthlyRate: 2, months: 12, type: "reducing" });
  const flatEmi = calculateEmiBigInt({ principal: 100000, monthlyRate: 2, months: 12, type: "flat" });
  check("BigInt Reducing EMI Final Balance = 0n", redEmi.schedule[redEmi.schedule.length - 1]?.balancePaise, 0n);
  check("BigInt Flat EMI Final Balance = 0n", flatEmi.schedule[flatEmi.schedule.length - 1]?.balancePaise, 0n);

  // ७. ऐतिहासिक दर लॉक (पुढील महिन्याचा दर बदलला तरी मागील महिना बदलत नाही)
  const mockB = { principal: 50000, originalPrincipal: 50000, rate: 2, ratePeriod: "monthly", interestType: "reducing", startYm: "2026-01" };
  const lockPatch = buildHistoricalTermUpdate(mockB, { effectiveYm: "2026-06", principal: 60000, rate: 3 }, "2026-05");
  const updatedB = { ...mockB, ...lockPatch };
  check("Historical Lock Preserves May 2026 (₹1,000)", computeMonthInterestDetails(updatedB, "2026-05").interestPaise, 100000n);
  check("New Rate Applies From June 2026 (₹1,800)", computeMonthInterestDetails(updatedB, "2026-06").interestPaise, 180000n);

  // ८. ऑप्ट-इन चक्रवाढ Idempotency (एका महिन्यात दुसऱ्यांदा ब्लॉक)
  const compDoneB = { principal: 50000, v18Compound: { enabled: true, lastCompoundedYm: "2026-11", history: [{ ym: "2026-11" }] } };
  check("Compound Blocks Duplicate Same Month", evaluateCompound(compDoneB, "2026-11", 500000n).eligible, false);

  // ९. स्वतंत्र अ‍ॅडव्हान्स वॉलेट Overdraft संरक्षण
  const walletOver = buildWalletTransaction({ v16AdvanceWallet: { balancePaise: "50000" } }, "apply", 600, "2026-11");
  check("Advance Wallet Blocks Overdraft", Boolean(walletOver.error), true);

  // १०. Duplicate Transaction ID Guard
  const testTx = createTxId("selftest");
  markTxProcessed(testTx);
  check("Duplicate Tx Guard Detects Repeat ID", isDuplicateTx(testTx), true);

  const passed = results.filter((r) => r.ok).length;
  return {
    allPassed: passed === results.length,
    passed,
    total: results.length,
    istDate: getIstTodayIso(),
    istYm: getIstCurrentYm(),
    results
  };
}
