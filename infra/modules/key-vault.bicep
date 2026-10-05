param name string
param location string
param tags object

@secure()
param appPassword string

@secure()
param sessionSecret string

@secure()
param geminiApiKey string = ''

@secure()
param youtubeApiKey string = ''

resource keyVault 'Microsoft.KeyVault/vaults@2024-11-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    // Policy keeps vaults private; the app reads secrets through a private endpoint.
    publicNetworkAccess: 'Disabled'
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
    }
  }
}

resource appPasswordSecret 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: keyVault
  name: 'infiniaibook-password'
  tags: tags
  properties: {
    value: appPassword
  }
}

resource sessionSecretSecret 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: keyVault
  name: 'infiniaibook-session-secret'
  tags: tags
  properties: {
    value: sessionSecret
  }
}

resource geminiSecret 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = if (!empty(geminiApiKey)) {
  parent: keyVault
  name: 'gemini-api-key'
  tags: tags
  properties: {
    value: geminiApiKey
  }
}

resource youtubeSecret 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = if (!empty(youtubeApiKey)) {
  parent: keyVault
  name: 'youtube-api-key'
  tags: tags
  properties: {
    value: youtubeApiKey
  }
}

output id string = keyVault.id
output name string = keyVault.name
