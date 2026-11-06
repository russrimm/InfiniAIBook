import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { kind: string; args: unknown[] }[] = [];

vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: class {
    constructor(...args: unknown[]) {
      calls.push({ kind: "default", args });
    }
  },
  ClientSecretCredential: class {
    constructor(...args: unknown[]) {
      calls.push({ kind: "secret", args });
    }
  },
}));

import { buildCredential } from "@/lib/azureCredential";

beforeEach(() => {
  calls.length = 0;
});

describe("buildCredential", () => {
  it("walks the default chain with no options when nothing is set", () => {
    buildCredential({});
    expect(calls).toEqual([{ kind: "default", args: [{}] }]);
  });

  it("selects the tenant for an az login session from AZURE_TENANT_ID alone", () => {
    buildCredential({ AZURE_TENANT_ID: "tenant-a" });
    expect(calls).toEqual([{ kind: "default", args: [{ tenantId: "tenant-a" }] }]);
  });

  it("selects the CLI account for a subscription without requiring a tenant", () => {
    buildCredential({ AZURE_SUBSCRIPTION_ID: "subscription-1" });
    expect(calls).toEqual([{ kind: "default", args: [{ subscription: "subscription-1" }] }]);
  });

  it("lets a CLI subscription select its tenant without changing managed identity selection", () => {
    buildCredential({
      AZURE_TENANT_ID: "tenant-a",
      AZURE_SUBSCRIPTION_ID: "subscription-1",
      AZURE_CLIENT_ID: "client-1",
    });
    expect(calls).toEqual([{
      kind: "default",
      args: [{ managedIdentityClientId: "client-1", subscription: "subscription-1" }],
    }]);
  });

  it("trims tenant and subscription hints from local configuration", () => {
    buildCredential({ AZURE_TENANT_ID: " tenant-a ", AZURE_SUBSCRIPTION_ID: " subscription-1 " });
    expect(calls).toEqual([{
      kind: "default",
      args: [{ subscription: "subscription-1" }],
    }]);
  });

  it("retains tenant selection when the subscription hint is blank", () => {
    buildCredential({ AZURE_TENANT_ID: " tenant-a ", AZURE_SUBSCRIPTION_ID: " " });
    expect(calls).toEqual([{ kind: "default", args: [{ tenantId: "tenant-a" }] }]);
  });

  it("treats a client id alone as a user-assigned managed identity", () => {
    buildCredential({ AZURE_CLIENT_ID: "client-1" });
    expect(calls).toEqual([{ kind: "default", args: [{ managedIdentityClientId: "client-1" }] }]);
  });

  it("passes both through when both are set without a secret", () => {
    buildCredential({ AZURE_TENANT_ID: "tenant-a", AZURE_CLIENT_ID: "client-1" });
    expect(calls).toEqual([
      { kind: "default", args: [{ managedIdentityClientId: "client-1", tenantId: "tenant-a" }] },
    ]);
  });

  it("uses a service principal when tenant, client and secret are all set", () => {
    buildCredential({
      AZURE_TENANT_ID: "tenant-a",
      AZURE_CLIENT_ID: "client-1",
      AZURE_CLIENT_SECRET: "shh",
      AZURE_SUBSCRIPTION_ID: "subscription-1",
    });
    expect(calls).toEqual([{ kind: "secret", args: ["tenant-a", "client-1", "shh"] }]);
  });

  it("ignores blank values, which an empty .env line produces", () => {
    buildCredential({
      AZURE_TENANT_ID: "  ",
      AZURE_SUBSCRIPTION_ID: "  ",
      AZURE_CLIENT_ID: "",
      AZURE_CLIENT_SECRET: "",
    });
    expect(calls).toEqual([{ kind: "default", args: [{}] }]);
  });
});
