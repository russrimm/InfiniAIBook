# Running in Azure

InfiniAIBook can run as an Azure Container App. The Bicep templates in
[`infra/`](../infra) create everything it needs and reuse an existing Azure AI
Services account for models and voices.

## What gets created

| Resource | Purpose |
|---|---|
| Container App (2 vCPU, 4 GiB, exactly one replica) | Runs the app image, built with Python so whiteboard, motion and training videos render |
| Container Apps environment in a virtual network | Reaches storage and Key Vault through private endpoints |
| Premium Azure Files share (NFS), mounted at `/data` | The SQLite database and all generated media |
| Key Vault | App password, session secret and optional Gemini/YouTube keys |
| Container Registry (Basic) | The app image |
| User-assigned managed identity | Pulls the image, reads Key Vault secrets, and calls Azure OpenAI and Azure Speech without keys |
| Log Analytics | Container logs |

Storage and Key Vault stay private (no shared keys, no public network access),
which many organizations enforce by policy. NFS also gives SQLite proper file
locking.

> **One replica only.** SQLite allows a single writer. Do not scale the app
> out, and keep `SQLITE_JOURNAL_MODE=DELETE` on the share.

The app is public on its `*.azurecontainerapps.io` address and protected by
`INFINIAIBOOK_PASSWORD`. To limit access to your organization, add Microsoft
Entra sign-in under the container app's **Authentication** settings.

## Deploy or update

Prerequisites: the Azure CLI signed in with Owner (or Contributor plus User
Access Administrator) on the subscription, and an existing Azure AI Services
account in the same subscription with chat, embedding and (optionally) image and
realtime deployments. The templates assign the app's managed identity the
Cognitive Services OpenAI User and Speech User roles on that account.

Copy [`infra/main.parameters.example.json`](../infra/main.parameters.example.json)
to `infra/main.parameters.local.json` (git-ignored) and fill it in.
`environmentName` is the name stem for every resource, such as
`iabook-prod-a1b2`; keep it unique, at most 17 characters. Model deployment names
default to those in [`infra/main.bicep`](../infra/main.bicep); override them in the
same file if yours differ.

On the very first deploy, run step 2 without `containerImage` to create the
registry (named `cr` plus `environmentName` without hyphens), then build and
deploy again with it.

```powershell
# 1. Build the image in the registry (no local Docker needed)
$tag = "v" + (Get-Date -Format "yyyyMMddHHmm")
az acr build --registry <registry> --image "infiniaibook:$tag" --build-arg WITH_PYTHON=true --no-logs .

# 2. Deploy (reuse the same password and session secret every time)
az deployment sub create --name "iabook-$tag" --location eastus2 `
  --template-file infra/main.bicep --parameters '@infra/main.parameters.local.json' `
  --parameters deployerObjectId=$(az ad signed-in-user show --query id -o tsv) `
    appPassword=$APP_PASSWORD sessionSecret=$SESSION_SECRET `
    containerImage="<registry>.azurecr.io/infiniaibook:$tag"
```

## Deploy automatically from GitHub

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) deploys every
commit on `main` once the CI workflow passes. It builds the image in the registry,
tagged with the commit, and rolls the Container App to it. It can also be run by
hand from the Actions tab. It signs in with OpenID Connect, so no Azure secret is
stored in GitHub.

The workflow only changes the app image. Run the Bicep deployment above when
`infra/` changes, passing the `containerImage` that is currently running.

One-time setup:

```powershell
$rg = "<resource group>"; $repo = "<owner>/<repo>"
$app = az ad app create --display-name "infiniaibook-github-deploy" | ConvertFrom-Json
az ad sp create --id $app.appId | Out-Null
az ad app federated-credential create --id $app.appId --parameters (@{
  name = "github-production"; issuer = "https://token.actions.githubusercontent.com"
  subject = "repo:${repo}:environment:production"; audiences = @("api://AzureADTokenExchange")
} | ConvertTo-Json)
az role assignment create --assignee $app.appId --role Contributor `
  --scope (az group show -n $rg --query id -o tsv)
```

Then, in the repository's **Settings > Environments**, create an environment named
`production` (add required reviewers if you want an approval before each deploy),
and under **Settings > Secrets and variables > Actions > Variables** add:

| Variable | Value |
|---|---|
| `AZURE_CLIENT_ID` | The app registration's application (client) ID |
| `AZURE_TENANT_ID` | Your Microsoft Entra tenant ID |
| `AZURE_SUBSCRIPTION_ID` | The subscription that holds the resource group |
| `AZURE_RESOURCE_GROUP` | The resource group |
| `AZURE_CONTAINER_APP` | The Container App name, such as `ca-iabook-prod-a53b` |
| `AZURE_REGISTRY` | The registry name (without `.azurecr.io`) |

## Bringing an existing library

The share is reachable only from inside the virtual network, so a library is
copied in by the app's init container on first start. Build a seed image from a
copy of your `.data` folder, and pass it as `initImage`:

1. Stop the local app, or snapshot the database with
   `VACUUM INTO` so you copy a consistent single file. Switch the copy to
   `PRAGMA journal_mode = DELETE`.
2. Put the copy in a folder named `seed` next to a two-line Dockerfile:
   `FROM mcr.microsoft.com/azurelinux/base/core:3.0` and `COPY seed /seed`.
3. `az acr build --registry <registry> --image infiniaibook-seed:v1 .` from that folder.
4. Deploy with `initImage=<registry>.azurecr.io/infiniaibook-seed:v1`.

The init container copies `/seed` only when `/data` has no database yet, so
redeploys never overwrite newer data. Keep passing the same `initImage`, or the
default image, which only fixes folder ownership.
