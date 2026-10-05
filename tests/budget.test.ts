import { afterEach, describe, expect, it } from "vitest";
import { BudgetExceededError, budgetStatus, cloudSpendLikely, dailyBudgetCents, reserve } from "@/lib/budget";

afterEach(() => {
  delete process.env.DAILY_BUDGET_USD;
  delete process.env.AI_PROVIDER;
  delete process.env.AI_BASE_URL;
  delete process.env.AZURE_OPENAI_ENDPOINT;
  delete process.env.OPENAI_API_KEY;
  delete process.env.AZURE_SPEECH_REGION;
});

describe("dailyBudgetCents", () => {
  it("is off for a local endpoint unless a ceiling is set", () => {
    process.env.AI_BASE_URL = "http://127.0.0.1:8080/v1";
    process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com";
    expect(cloudSpendLikely()).toBe(false);
    expect(dailyBudgetCents()).toBeNull();
  });

  it("defaults to $25 for a cloud endpoint", () => {
    process.env.AZURE_OPENAI_ENDPOINT = "https://example.openai.azure.com";
    expect(dailyBudgetCents()).toBe(2500);
  });

  it("treats 0 as off", () => {
    process.env.DAILY_BUDGET_USD = "0";
    process.env.OPENAI_API_KEY = "sk-test";
    expect(dailyBudgetCents()).toBeNull();
  });
});

describe("reserve", () => {
  it("stops once today's ceiling is reached", () => {
    process.env.DAILY_BUDGET_USD = "0.05";
    reserve("chat", 3);
    reserve("chat", 2);
    expect(budgetStatus().remainingCents).toBe(0);
    expect(() => reserve("chat", 1)).toThrow(BudgetExceededError);
  });
});
