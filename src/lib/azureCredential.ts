import {
  ClientSecretCredential,
  DefaultAzureCredential,
  type TokenCredential,
} from "@azure/identity";

/**
 * The Microsoft Entra credential every Azure call in the app signs in with.
 *
 * - A service principal (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID` and
 *   `AZURE_CLIENT_SECRET` together) is used as is.
 * - Otherwise the standard chain runs: environment, workload identity, managed
 *   identity, then the developer's `az login`, VS Code or Azure PowerShell
 *   session.
 *
 * `AZURE_TENANT_ID` on its own selects the tenant for that chain. Without it an
 * `az login` session signs in to whichever tenant the CLI currently has
 * selected, which is the wrong one when the resource lives in another tenant
 * ("Token tenant ... does not match resource tenant"). The signed-in account
 * still needs access to the resource in that tenant.
 */
type CredentialEnv = Readonly<Record<string, string | undefined>>;

export function buildCredential(env: CredentialEnv = process.env): TokenCredential {
  const tenantId = env.AZURE_TENANT_ID?.trim() || undefined;
  const clientId = env.AZURE_CLIENT_ID?.trim() || undefined;
  const clientSecret = env.AZURE_CLIENT_SECRET?.trim() || undefined;

  if (tenantId && clientId && clientSecret) {
    return new ClientSecretCredential(tenantId, clientId, clientSecret);
  }

  return new DefaultAzureCredential({
    ...(clientId ? { managedIdentityClientId: clientId } : {}),
    ...(tenantId ? { tenantId } : {}),
  });
}
