targetScope = 'subscription'

// Environment-specific values (names, AI account, who deployed) live in a
// parameters file. Copy main.parameters.example.json to
// main.parameters.local.json (git-ignored) and fill it in.

@description('Name stem for every resource, e.g. iabook-prod-a1b2. Lowercase letters, digits and hyphens; at most 17 characters so the Key Vault name fits.')
@minLength(3)
@maxLength(17)
param environmentName string

@minLength(1)
param location string

param sessionId string
param deployedBy string
param createdAt string
param deployerObjectId string

@secure()
param appPassword string

@secure()
param sessionSecret string

@secure()
param geminiApiKey string = ''

@secure()
param youtubeApiKey string = ''

param containerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
param initImage string = 'mcr.microsoft.com/azurelinux/base/core:3.0'
@description('Existing Azure AI Services (or Azure OpenAI) account the app calls for models and voices.')
param aiAccountName string

@description('Resource group of that account, in this subscription.')
param aiAccountResourceGroup string

@description('Endpoint of that account, e.g. https://<name>.services.ai.azure.com')
param azureOpenAiEndpoint string
param azureOpenAiApiVersion string = '2024-10-21'
param azureOpenAiDeployment string = 'gpt-5-mini'
param azureOpenAiEmbeddingDeployment string = 'text-embedding-3-large'
param azureOpenAiImageDeployment string = 'gpt-image-2.5-sunburst'
param azureOpenAiVisionDeployment string = 'gpt-5-mini'
param azureOpenAiRealtimeDeployment string = 'gpt-realtime-2.1'
param azureSpeechRegion string = location
param appPort int = 3000

var tags = {
  'app-onboard-skill': 'true'
  'app-onboard-session-id': sessionId
  'created-at': createdAt
  environment: environmentName
  'deployed-by': deployedBy
}

var compactName = replace(environmentName, '-', '')
var resourceGroupName = 'rg-${environmentName}'
var containerAppName = 'ca-${environmentName}'
var environmentResourceName = 'cae-${environmentName}'
var registryName = 'cr${compactName}'
var storageAccountName = 'st${compactName}'
var keyVaultName = 'kv-${environmentName}'
var logAnalyticsName = 'log-${environmentName}'
var identityName = 'id-${environmentName}'
var vnetName = 'vnet-${environmentName}'
var azureSpeechResourceId = resourceId(subscription().subscriptionId, aiAccountResourceGroup, 'Microsoft.CognitiveServices/accounts', aiAccountName)

resource rg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module logAnalytics './modules/log-analytics.bicep' = {
  name: 'log-analytics'
  scope: rg
  params: {
    name: logAnalyticsName
    location: location
    tags: tags
  }
}

module network './modules/network.bicep' = {
  name: 'network'
  scope: rg
  params: {
    vnetName: vnetName
    location: location
    tags: tags
  }
}

module keyVault './modules/key-vault.bicep' = {
  name: 'key-vault'
  scope: rg
  params: {
    name: keyVaultName
    location: location
    tags: tags
    appPassword: appPassword
    sessionSecret: sessionSecret
    geminiApiKey: geminiApiKey
    youtubeApiKey: youtubeApiKey
  }
}

module identity './modules/managed-identity.bicep' = {
  name: 'managed-identity'
  scope: rg
  params: {
    name: identityName
    location: location
    tags: tags
  }
}

module registry './modules/container-registry.bicep' = {
  name: 'container-registry'
  scope: rg
  params: {
    name: registryName
    location: location
    tags: tags
  }
}

module storage './modules/storage.bicep' = {
  name: 'storage'
  scope: rg
  params: {
    name: storageAccountName
    location: location
    tags: tags
  }
}

module storagePrivateEndpoint './modules/private-endpoint.bicep' = {
  name: 'storage-private-endpoint'
  scope: rg
  params: {
    name: 'pe-file-${environmentName}'
    location: location
    tags: tags
    subnetId: network.outputs.peSubnetId
    privateLinkServiceId: storage.outputs.id
    groupId: 'file'
    privateDnsZoneId: network.outputs.fileDnsZoneId
  }
}

module keyVaultPrivateEndpoint './modules/private-endpoint.bicep' = {
  name: 'keyvault-private-endpoint'
  scope: rg
  params: {
    name: 'pe-kv-${environmentName}'
    location: location
    tags: tags
    subnetId: network.outputs.peSubnetId
    privateLinkServiceId: keyVault.outputs.id
    groupId: 'vault'
    privateDnsZoneId: network.outputs.vaultDnsZoneId
  }
}

module environment './modules/container-app-environment.bicep' = {
  name: 'container-app-environment'
  scope: rg
  dependsOn: [
    storagePrivateEndpoint
  ]
  params: {
    infrastructureSubnetId: network.outputs.acaSubnetId
    name: environmentResourceName
    location: location
    tags: tags
    workspaceCustomerId: logAnalytics.outputs.customerId
    workspaceName: logAnalyticsName
    storageAccountName: storageAccountName
  }
}

module containerApp './modules/container-app.bicep' = {
  name: 'container-app'
  scope: rg
  dependsOn: [
    keyVaultPrivateEndpoint
    roleAssignments
  ]
  params: {
    name: containerAppName
    location: location
    tags: tags
    environmentId: environment.outputs.id
    registryLoginServer: registry.outputs.loginServer
    keyVaultName: keyVaultName
    managedIdentityId: identity.outputs.id
    managedIdentityClientId: identity.outputs.clientId
    containerImage: containerImage
    initImage: initImage
    appPort: appPort
    azureOpenAiEndpoint: azureOpenAiEndpoint
    azureOpenAiApiVersion: azureOpenAiApiVersion
    azureOpenAiDeployment: azureOpenAiDeployment
    azureOpenAiEmbeddingDeployment: azureOpenAiEmbeddingDeployment
    azureOpenAiImageDeployment: azureOpenAiImageDeployment
    azureOpenAiVisionDeployment: azureOpenAiVisionDeployment
    azureOpenAiRealtimeDeployment: azureOpenAiRealtimeDeployment
    azureSpeechRegion: azureSpeechRegion
    azureSpeechResourceId: azureSpeechResourceId
    hasGeminiApiKey: !empty(geminiApiKey)
    hasYoutubeApiKey: !empty(youtubeApiKey)
  }
}

module roleAssignments './modules/role-assignments.bicep' = {
  name: 'role-assignments'
  scope: rg
  dependsOn: [
    keyVault
    registry
    identity
  ]
  params: {
    keyVaultName: keyVaultName
    registryName: registryName
    managedIdentityPrincipalId: identity.outputs.principalId
    deployerObjectId: deployerObjectId
  }
}

module cognitiveRoleAssignments './modules/cognitive-role-assignments.bicep' = {
  name: 'cognitive-role-assignments'
  scope: resourceGroup(aiAccountResourceGroup)
  dependsOn: [
    identity
  ]
  params: {
    managedIdentityPrincipalId: identity.outputs.principalId
    cognitiveAccountName: aiAccountName
  }
}
