param name string
param location string
param tags object
param workspaceCustomerId string
param workspaceName string
param storageAccountName string
param infrastructureSubnetId string

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2025-02-01' existing = {
  name: workspaceName
}

resource environment 'Microsoft.App/managedEnvironments@2025-07-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    vnetConfiguration: {
      infrastructureSubnetId: infrastructureSubnetId
      internal: false
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspaceCustomerId
        sharedKey: logAnalyticsWorkspace.listKeys().primarySharedKey
      }
    }
  }
}

resource environmentStorage 'Microsoft.App/managedEnvironments/storages@2025-07-01' = {
  parent: environment
  name: 'data'
  properties: {
    nfsAzureFile: {
      server: '${storageAccountName}.file.${az.environment().suffixes.storage}'
      shareName: '/${storageAccountName}/data'
      accessMode: 'ReadWrite'
    }
  }
}

output id string = environment.id
