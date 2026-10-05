param name string
param location string
param tags object
param environmentId string
param registryLoginServer string
param keyVaultName string
param managedIdentityId string
param managedIdentityClientId string
param containerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
param appPort int = 3000
param azureOpenAiEndpoint string
param azureOpenAiApiVersion string
param azureOpenAiDeployment string
param azureOpenAiEmbeddingDeployment string
param azureOpenAiImageDeployment string
param azureOpenAiVisionDeployment string
param azureOpenAiRealtimeDeployment string
param azureSpeechRegion string
param azureSpeechResourceId string
param hasGeminiApiKey bool
param hasYoutubeApiKey bool
@description('Init container image: prepares /data for the app user and, on first run only, copies in a seed library.')
param initImage string = 'mcr.microsoft.com/azurelinux/base/core:3.0'

var placeholderImage = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
var isPlaceholder = containerImage == placeholderImage
var effectivePort = isPlaceholder ? 80 : appPort
var plainEnv = [
  { name: 'AZURE_CLIENT_ID', value: managedIdentityClientId }
  { name: 'AZURE_OPENAI_ENDPOINT', value: azureOpenAiEndpoint }
  { name: 'AZURE_OPENAI_API_VERSION', value: azureOpenAiApiVersion }
  { name: 'AZURE_OPENAI_DEPLOYMENT', value: azureOpenAiDeployment }
  { name: 'AZURE_OPENAI_EMBEDDING_DEPLOYMENT', value: azureOpenAiEmbeddingDeployment }
  { name: 'AZURE_OPENAI_IMAGE_DEPLOYMENT', value: azureOpenAiImageDeployment }
  { name: 'AZURE_OPENAI_VISION_DEPLOYMENT', value: azureOpenAiVisionDeployment }
  { name: 'AZURE_OPENAI_REALTIME_DEPLOYMENT', value: azureOpenAiRealtimeDeployment }
  { name: 'AZURE_SPEECH_REGION', value: azureSpeechRegion }
  { name: 'AZURE_SPEECH_RESOURCE_ID', value: azureSpeechResourceId }
  { name: 'DATA_DIR', value: '/data' }
  { name: 'HOSTNAME', value: '0.0.0.0' }
  { name: 'NODE_ENV', value: 'production' }
  { name: 'PORT', value: string(effectivePort) }
  { name: 'PYTHON_BIN', value: 'python3' }
  { name: 'SQLITE_JOURNAL_MODE', value: 'DELETE' }
  { name: 'TRUST_PROXY', value: 'true' }
]
var secretEnv = concat(
  [
    { name: 'INFINIAIBOOK_PASSWORD', secretRef: 'app-password' }
    { name: 'INFINIAIBOOK_SESSION_SECRET', secretRef: 'session-secret' }
  ],
  hasGeminiApiKey ? [
    { name: 'GEMINI_API_KEY', secretRef: 'gemini-api-key' }
  ] : [],
  hasYoutubeApiKey ? [
    { name: 'YOUTUBE_API_KEY', secretRef: 'youtube-api-key' }
  ] : []
)

resource containerApp 'Microsoft.App/containerApps@2025-07-01' = {
  name: name
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentityId}': {}
    }
  }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      ingress: {
        external: true
        targetPort: effectivePort
        transport: 'auto'
        allowInsecure: false
      }
      registries: isPlaceholder ? [] : [
        {
          server: registryLoginServer
          identity: managedIdentityId
        }
      ]
      secrets: isPlaceholder ? [] : concat(
        [
          {
            name: 'app-password'
            #disable-next-line no-hardcoded-env-urls
            keyVaultUrl: 'https://${keyVaultName}.vault.azure.net/secrets/infiniaibook-password'
            identity: managedIdentityId
          }
          {
            name: 'session-secret'
            #disable-next-line no-hardcoded-env-urls
            keyVaultUrl: 'https://${keyVaultName}.vault.azure.net/secrets/infiniaibook-session-secret'
            identity: managedIdentityId
          }
        ],
        hasGeminiApiKey ? [
          {
            name: 'gemini-api-key'
            #disable-next-line no-hardcoded-env-urls
            keyVaultUrl: 'https://${keyVaultName}.vault.azure.net/secrets/gemini-api-key'
            identity: managedIdentityId
          }
        ] : [],
        hasYoutubeApiKey ? [
          {
            name: 'youtube-api-key'
            #disable-next-line no-hardcoded-env-urls
            keyVaultUrl: 'https://${keyVaultName}.vault.azure.net/secrets/youtube-api-key'
            identity: managedIdentityId
          }
        ] : []
      )
    }
    template: {
      // The NFS share root belongs to root; the app runs as uid 1000. When the
      // init image carries a /seed library and /data has no database yet, it
      // is copied in once.
      initContainers: isPlaceholder ? [] : [
        {
          name: 'prepare-data'
          image: initImage
          command: [
            'sh'
            '-c'
            'if [ -d /seed ] && [ ! -f /data/infiniaibook.db ]; then cp -a /seed/. /data/; fi; chown -R 1000:1000 /data'
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          volumeMounts: [
            {
              volumeName: 'data'
              mountPath: '/data'
            }
          ]
        }
      ]
      containers: [
        {
          name: 'infiniaibook'
          image: containerImage
          resources: {
            cpu: json('2.0')
            memory: '4Gi'
          }
          env: isPlaceholder ? plainEnv : concat(plainEnv, secretEnv)
          volumeMounts: [
            {
              volumeName: 'data'
              mountPath: '/data'
            }
          ]
          probes: isPlaceholder ? [] : [
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/auth/status'
                port: appPort
              }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/auth/status'
                port: appPort
              }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
      volumes: [
        {
          name: 'data'
          storageType: 'NfsAzureFile'
          storageName: 'data'
        }
      ]
    }
  }
}

output id string = containerApp.id
