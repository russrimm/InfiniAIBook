param name string
param location string
param tags object

// Premium FileStorage with an NFS 4.1 share: NFS needs no account key (key
// access is disabled by policy) and gives SQLite real POSIX locks. NFS has no
// in-transit encryption, so the share is reachable only through the private
// endpoint inside the app's virtual network.
resource storageAccount 'Microsoft.Storage/storageAccounts@2025-06-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Premium_LRS'
  }
  kind: 'FileStorage'
  properties: {
    supportsHttpsTrafficOnly: false
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    publicNetworkAccess: 'Disabled'
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
    }
  }
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2025-06-01' = {
  parent: storageAccount
  name: 'default'
}

resource dataShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2025-06-01' = {
  parent: fileService
  name: 'data'
  properties: {
    shareQuota: 100
    enabledProtocols: 'NFS'
    rootSquash: 'NoRootSquash'
  }
}

output id string = storageAccount.id
output name string = storageAccount.name
