param managedIdentityPrincipalId string
param cognitiveAccountName string

resource cognitiveAccount 'Microsoft.CognitiveServices/accounts@2025-12-01' existing = {
  name: cognitiveAccountName
}

resource openAiUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(cognitiveAccount.id, managedIdentityPrincipalId, '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
  scope: cognitiveAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd')
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource speechUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(cognitiveAccount.id, managedIdentityPrincipalId, 'f2dc8367-1007-4938-bd23-fe263f013447')
  scope: cognitiveAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'f2dc8367-1007-4938-bd23-fe263f013447')
    principalId: managedIdentityPrincipalId
    principalType: 'ServicePrincipal'
  }
}
