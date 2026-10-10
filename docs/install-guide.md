# Install step by step

This guide is for anyone who has never set up an app like this before. It walks
through every step on **Windows** and on **Mac or Linux**, explains each term the
first time it appears, and ends with fixes for common problems. If you're
comfortable with Node.js and `.env` files, the shorter
[Getting started](getting-started.md) page has everything you need.

It takes about 15 minutes, plus however long it takes to get a model endpoint.
Steps 1 and 2 are about the AI models the app talks to, so you know what to
reuse or create before you install anything. The rest is installing and
starting the app.

## Words you'll see

| Term | What it means |
|---|---|
| **Terminal** | A window where you type commands instead of clicking. On Windows it's called PowerShell or Terminal; on a Mac it's the Terminal app. |
| **Project folder** | The `InfiniAIBook` folder you download in step 4. Every command in this guide runs inside it. |
| **Model provider** | The AI service that does the thinking: Microsoft Foundry (Azure OpenAI), OpenAI, Google Gemini, or a free model running on your own computer. You need one. |
| **Endpoint** | The web address of your model provider, such as `https://my-foundry.cognitiveservices.azure.com`. The app sends every AI request there. |
| **Microsoft Foundry resource** | The Azure resource that hosts your model **deployments** and, if you want voices, Azure AI Speech. It is an Azure AI Services resource, and the older name is "Azure OpenAI resource". Both work with this app. |
| **Deployment** | A model you switched on in your Foundry resource, under a name you choose, such as `chat` or `embeddings`. The app asks for the deployment **name**, not the model name. |
| **API key** | A long password from your model provider that lets the app use your account. Keep it private, like any password. |
| **Environment variable** | A named setting, such as `OPENAI_API_KEY`, that a program reads when it starts. You don't need to set these in Windows or macOS: this app reads them from one small text file, `.env.local`. |
| **`.env.local`** | The settings file you create in step 6. It holds your provider and API key, stays on your computer, and is never uploaded anywhere. |
| **`.data` folder** | Where the app keeps everything you make: notebooks, sources, chats, notes and generated files. It's created automatically. |

## 1. Decide what you need

Only a **chat model** is required. Every other row switches on extra features,
and the app works without it. Tick the rows you want, then set up exactly those
in step 2.

| Capability | What it powers | Needs | Required? |
|---|---|---|---|
| **Chat** | Chat with your sources, search, notes, summaries, every Studio text format (report, quiz, flashcards, mind map…) | A chat model | **Yes** |
| **Embeddings** | Smarter (semantic) search | An embedding model | Optional. Without it, search falls back to keywords. |
| **Studio script** | Better scripts for audio, video and training | A second, larger chat model | Optional. The chat model writes them otherwise. |
| **Vision** | Reading uploaded images as sources | A model that can see images | Optional. Defaults to the chat model if it can see. |
| **Transcription** | Audio and video file sources | A speech-to-text model (Whisper or `gpt-4o-transcribe`) | Optional |
| **Voice (speech)** | Audio overviews, narrated whiteboard and motion videos, voice previews | An **Azure AI Speech** resource | Optional |
| **Avatar training videos** | A lip-synced presenter | Azure AI Speech in an avatar region | Optional |
| **Images** | The "AI image" infographic style, and the pictures in whiteboard and motion videos | An image model | Optional |
| **Live discussion** | Talking to your sources out loud | A realtime voice model | Optional |
| **YouTube transcripts** | YouTube links as sources | A free [Gemini key](https://aistudio.google.com/apikey) | Optional |
| **Video rendering** | Whiteboard, motion and training videos | Python 3 on your computer (see [Whiteboard videos](whiteboard-videos.md)) | Optional |

Common choices:

- **Just chat with my sources:** chat model. Add an embedding model for better search.
- **Plus audio overviews:** add Azure AI Speech.
- **Plus videos and live discussions:** add Speech, an image model, and a realtime model, and install Python.

You can add the optional pieces later. Come back to step 2 any time.

## 2. Reuse or create your model endpoint

The app talks to a model **endpoint**. Pick the first row that fits:

| You have… | Do this |
|---|---|
| A Microsoft Foundry or Azure OpenAI resource already | [2A: Reuse it](#2a-reuse-an-existing-foundry-or-azure-openai-resource) |
| An Azure subscription but no resource | [2B: Create one](#2b-create-a-new-foundry-resource) |
| Only an OpenAI, Gemini, Anthropic or similar key | [2C: Use another provider](#2c-use-another-provider-or-a-local-model) |
| No account and no budget | [2C: Ollama](#2c-use-another-provider-or-a-local-model), a free local model |

> **Copilot Studio can't be the model.** A Copilot Studio agent is an
> application, not a model endpoint. It does not offer the chat, embedding or
> speech APIs this app calls. Use Microsoft Foundry here instead. (Copilot
> Studio can use Foundry models, but not the other way around.)

Voices and avatars come from **Azure AI Speech**, which only Azure provides.
That applies whichever provider you choose for chat. A Foundry (Azure AI
Services) resource includes Speech, so one resource can serve every capability.

### 2A. Reuse an existing Foundry or Azure OpenAI resource

1. Install the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
   and sign in: `az login`. (Prefer the portal? Every value below is on the
   resource's **Keys and Endpoint** and **Model deployments** pages.)
2. Find the resource, and note its **name**, **resource group** and **endpoint**:

   ```
   az cognitiveservices account list -o table
   ```

   Use the resource's endpoint (`https://<name>.cognitiveservices.azure.com`
   or `https://<name>.openai.azure.com`), not a Foundry *project* endpoint,
   which has `/api/projects/` in it.

3. List its deployments:

   ```
   az cognitiveservices account deployment list -n <name> -g <resource-group> --query "[].{deployment:name, model:properties.model.name}" -o table
   ```

   Match what you found against the capabilities you chose in step 1. Write
   down the **deployment name** of each one, such as the chat model and the
   embedding model. Anything missing is a model you can add in 2B, step 4,
   to the same resource.

4. Give yourself access. Ask the resource owner for **Cognitive Services OpenAI
   User**, plus **Cognitive Services Speech User** if you want voices, on that
   resource. Or, if your organization allows it, copy a key from the portal's
   **Keys and Endpoint** page and use that instead. Step 7 shows both.

### 2B. Create a new Foundry resource

Use the [Azure portal](https://portal.azure.com) (**Create a resource**, then
**Microsoft Foundry**) or the commands below. Choose **East US 2** or **Sweden
Central**: both offer realtime voice models and Speech avatars, so one region
covers every capability. You need an Azure subscription where you can create
resources.

1. Create a resource group and the resource. The name must be globally unique,
   and `--custom-domain` is required for Entra sign-in.

   ```
   az login
   az group create -n infiniaibook-rg -l eastus2
   az cognitiveservices account create -n <unique-name> -g infiniaibook-rg -l eastus2 --kind AIServices --sku S0 --custom-domain <unique-name> --yes
   ```

2. Find the version of each model you plan to deploy (model versions change):

   ```
   az cognitiveservices account list-models -n <unique-name> -g infiniaibook-rg --query "[?name=='gpt-5-mini'].{model:name, version:version}" -o table
   ```

3. **Required:** deploy a chat model. The deployment name (`chat` here) is
   yours to choose.

   ```
   az cognitiveservices account deployment create -n <unique-name> -g infiniaibook-rg --deployment-name chat --model-name gpt-5-mini --model-version <version> --model-format OpenAI --sku-name GlobalStandard --sku-capacity 50
   ```

4. **Optional:** deploy only what you ticked in step 1, the same way.

   | Capability | Model to deploy | Suggested deployment name |
   |---|---|---|
   | Embeddings | `text-embedding-3-large` | `embeddings` |
   | Transcription | `whisper` or `gpt-4o-transcribe` | `transcribe` |
   | Studio script | A larger GPT model | `studio` |
   | Images | An image model, such as `gpt-image-2.5-sunburst`, if your subscription has access | `images` |
   | Live discussion | `gpt-realtime-2.1` (or `gpt-realtime`) | `realtime` |

   Image and realtime models need access in some subscriptions. If one isn't
   listed by `list-models`, request access in the Foundry portal's model
   catalog. Or skip it, because the feature just stays off.
   
5. **Optional, for voices:** nothing to create. The same resource already
   provides Azure AI Speech. Note its **region** and its **resource ID**:

   ```
   az cognitiveservices account show -n <unique-name> -g infiniaibook-rg --query "{endpoint:properties.endpoint, id:id, region:location}" -o json
   ```

6. Give yourself access. First print your user id, then paste it into the next
   command, along with the `id` from step 5:

   ```
   az ad signed-in-user show --query id -o tsv
   az role assignment create --assignee <your-user-id> --role "Cognitive Services OpenAI User" --scope <resource-id>
   az role assignment create --assignee <your-user-id> --role "Cognitive Services Speech User" --scope <resource-id>
   ```

   The second role is only for voices. Roles can take a few minutes to take
   effect. Owner and Contributor are not enough: they don't include these data
   permissions.

Write down the **endpoint**, each **deployment name**, and, for voices, the
**region** and **resource ID**. Step 7 needs them.

### 2C. Use another provider or a local model

- **OpenAI:** create a key at <https://platform.openai.com/api-keys> (needs prepaid credit). Covers chat, embeddings and transcription.
- **Google Gemini:** create a key at <https://aistudio.google.com/apikey> (has a free tier). Covers chat and embeddings, and YouTube transcripts.
- **Anthropic, Groq, Mistral, others:** see [Named providers](configuration.md#named-providers). Chat-only providers need a second provider for embeddings, or search stays keyword-only.
- **Ollama (free, local):** install it from <https://ollama.com>, then run
  `ollama pull qwen3.5` and `ollama pull nomic-embed-text`. It's slow without a
  capable graphics card.

With these, you won't get voices, avatars or live discussion unless you also
set up Azure AI Speech (2B, steps 1 and 5) and a realtime model.

## 3. Install Node.js

InfiniAIBook runs on **Node.js version 22.13 or later**.

1. Go to <https://nodejs.org> and download the **LTS** version for your computer.
2. Run the installer and accept the defaults.
3. Check it worked: open a **new** terminal (see the next step for how) and type:

   ```
   node -v
   ```

   You should see something like `v22.14.0` or higher. If you see `v20…` or
   `'node' is not recognized`, see [Troubleshooting](#troubleshooting).

## 4. Download InfiniAIBook and open a terminal in it

**Download it.** Pick one:

- **No Git needed:** on the [repository page](https://github.com/russrimm/InfiniAIBook),
  click the green **Code** button, then **Download ZIP**. Unzip it somewhere
  easy to find, such as your Documents folder.
- **With Git:** `git clone https://github.com/russrimm/InfiniAIBook.git`

**Open a terminal in the project folder.** This matters: commands only work
when the terminal is "in" the right folder.

- **Windows:** open the `InfiniAIBook` folder in File Explorer (the one that
  contains `package.json`). Right-click an empty area inside it and choose
  **Open in Terminal**. On older Windows, click the address bar, type
  `powershell`, and press Enter.
- **Mac:** open the **Terminal** app, type `cd ` (with a space after it), drag
  the `InfiniAIBook` folder from Finder onto the Terminal window, and press
  Return.
- **Linux:** right-click inside the folder and choose **Open in Terminal**, or
  `cd` to it.

To check you're in the right place, type `dir` (Windows) or `ls` (Mac/Linux).
You should see `package.json` in the list.

## 5. Install the app's building blocks

In the same terminal, type:

```
npm install
```

This downloads the libraries the app needs into a `node_modules` folder. It
takes a few minutes the first time. Warnings are normal; only a line that
starts with `npm error` means something went wrong.

## 6. Create your settings file (`.env.local`)

You'll create a small text file named exactly **`.env.local`** (it starts with a
dot and has no `.txt` on the end) in the project folder, next to `package.json`.

**Windows.** In the terminal, type:

```
notepad .env.local
```

Notepad asks whether to create a new file. Click **Yes**. Paste in the settings
from step 7, then **File → Save** and close Notepad.

**Mac.** In the terminal, type:

```
touch .env.local
open -e .env.local
```

TextEdit opens the empty file. Paste in the settings from step 7, save and close.

**Linux.** `nano .env.local`, paste the settings, then press Ctrl+O, Enter and
Ctrl+X.

> **Can't see the file afterward?** Names that start with a dot are hidden by
> default. On Windows, in File Explorer choose **View → Show → File name
> extensions** and **Hidden items**. On a Mac, press Cmd+Shift+. in Finder.
> Make sure the file isn't named `.env.local.txt`.

### How the file works

- One setting per line, written as `NAME=value`, with no spaces around `=` and no quotes.
- A line that starts with `#` is a comment, so the app ignores it. Delete the
  `#` to turn a setting on.
- The repository includes **`.env.example`**, a long list of every optional
  setting with explanations. You don't need to copy it. Start with the few lines
  below and add more from it later if you want extra features.

## 7. Put your endpoint in `.env.local`

Paste the block for the route you took in step 2 into `.env.local`, then replace
every placeholder after `=` with the values you wrote down. Delete any optional
line for a capability you skipped. The app leaves that feature off.

### Route 2A or 2B: Microsoft Foundry (Azure OpenAI)

**Required**: the endpoint and your chat deployment.

```ini
AZURE_OPENAI_ENDPOINT=https://your-resource-name.cognitiveservices.azure.com
AZURE_OPENAI_API_VERSION=2024-10-21
AZURE_OPENAI_DEPLOYMENT=chat
```

`AZURE_OPENAI_API_VERSION` is a dated API version, not a model version, so
leave it exactly as shown.

**Sign in.** Pick one:

- **Entra ID (recommended):** add no line. Run `az login` once in a terminal,
  and the app uses that sign-in. It needs the roles from step 2.
- **A key:** add `AZURE_OPENAI_API_KEY=paste-your-key-here`, copied from the
  portal's **Keys and Endpoint** page. A key takes precedence over Entra.

**Optional**: add a line only for each capability you chose in step 1. Use
the deployment names you wrote down.

```ini
# Embeddings: smarter search
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=embeddings
# Transcription: audio and video file sources
AZURE_OPENAI_TRANSCRIPTION_DEPLOYMENT=transcribe
# Studio script: a second, larger model for audio and video scripts
AI_STUDIO_MODEL=studio
# Vision: reading uploaded images (defaults to the chat deployment)
AZURE_OPENAI_VISION_DEPLOYMENT=chat
# Images: AI-image infographics and video pictures
AZURE_OPENAI_IMAGE_DEPLOYMENT=images
# Live discussion: spoken conversation
AZURE_OPENAI_REALTIME_DEPLOYMENT=realtime
```

**Optional, for voices and avatar videos** (Azure AI Speech). Use the region and
resource ID you noted in step 2. Your account needs the **Cognitive Services
Speech User** role. Or use `AZURE_SPEECH_KEY=…` in place of the resource ID.

```ini
AZURE_SPEECH_REGION=eastus2
AZURE_SPEECH_RESOURCE_ID=/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<name>
```

For another resource per model, or a Claude deployment, see
[Configuration](configuration.md#studio-script-model).

### Route 2C: OpenAI

```ini
AI_PROVIDER=openai
OPENAI_API_KEY=sk-paste-your-key-here
```

### Route 2C: Google Gemini

```ini
AI_PROVIDER=gemini
GEMINI_API_KEY=paste-your-key-here
```

The same key also lets the app read YouTube transcripts.

### Route 2C: A free model on your own computer (Ollama)

```ini
AI_PROVIDER=ollama
```

### Other providers, and mixing them

Anthropic, Groq, Mistral and the rest follow the same pattern. See
[Configuration](configuration.md#named-providers). Embeddings and transcription
can use a different provider from chat. Voices still need the Azure Speech lines
shown above.

## 8. Start the app

In the terminal (still in the project folder), type:

```
npm run dev
```

Wait until you see a line like:

```
✓ Ready in 3.6s
```

Then open <http://localhost:3000> in your browser. Press **+ New notebook** and
follow the getting-started steps on screen. **? Help** in the top right explains
the rest.

**Keep this terminal window open** while you use the app. Closing it, or
pressing Ctrl+C in it, stops the app. To start again later, open a terminal in
the project folder and run `npm run dev`.

**After changing `.env.local`**, stop the app with Ctrl+C and run `npm run dev`
again. Settings are read only when the app starts.

## 9. Check the connection (optional)

To test your provider without opening the app:

```
npm run check:ai
```

Each check prints `PASS` or `FAIL` with a reason.

## Your data: where it lives and how to keep it

Everything you create is stored in a `.data` folder inside the project folder.

- **Back it up** by stopping the app and copying the whole `.data` folder.
- **Keep it somewhere else**, for example so a fresh download or a second copy
  of the app uses the same notebooks, by adding this line to `.env.local`:

  ```ini
  DATA_DIR=C:\Users\you\InfiniAIBook-data
  ```

  On a Mac or Linux, use a path such as `/Users/you/InfiniAIBook-data`. Move your
  existing `.data` folder's contents there first, with the app stopped. Include
  every file, including those ending in `-wal` and `-shm`.

- **Use it from every copy of the app on this computer, without editing each
  `.env.local`:** set `DATA_DIR` as a permanent environment variable for your
  account.
  - **Windows:** press Start, type **environment variables**, and open **Edit
    environment variables for your account**. Under *User variables*, click
    **New**, enter `DATA_DIR` as the name and your folder path as the value,
    then click **OK**. Or, in a terminal:
    `setx DATA_DIR "C:\Users\you\InfiniAIBook-data"`
  - **Mac:** `echo 'export DATA_DIR="$HOME/InfiniAIBook-data"' >> ~/.zshrc`
  - **Linux:** the same line, added to `~/.bashrc` instead.

  Then close and reopen **every** terminal; already-open ones don't see the
  change. A value set this way wins over the same name in `.env.local`.

- **Using it on more than one computer:** don't sync the `.data` folder with
  OneDrive, Dropbox or a network drive while the app is running on two machines
  at once. The database can be damaged. Instead, run the app on one computer and
  open it from the others. See
  [Reaching it from other devices](getting-started.md#reaching-it-from-other-devices),
  and set a password first.

## Updating to a new version

Stop the app, then:

- **If you used Git:** `git pull`, then `npm install`.
- **If you downloaded a ZIP:** download the new ZIP and unzip it to a new
  folder. Copy your `.env.local` into the new folder, then copy your `.data`
  folder too, unless you set `DATA_DIR`. Then run `npm install`.

Then start it with `npm run dev`.

## Troubleshooting

| What you see | What to do |
|---|---|
| `'node' is not recognized` or `command not found: node` | Node.js isn't installed, or the terminal was open during installation. Install it (step 3) and open a new terminal. |
| `node -v` shows a version below 22.13, or an error mentioning `node:sqlite` | Install the current LTS from <https://nodejs.org>, then open a new terminal. |
| `npm error enoent … package.json` | The terminal isn't in the project folder. Repeat step 4 and check that `dir` or `ls` lists `package.json`. |
| The app says **"No model provider is configured"** | The app didn't find your settings. Check that the file is named exactly `.env.local` (not `.env.local.txt`), sits next to `package.json`, and that the lines have no `#` in front. Then restart the app. |
| `401`, `Incorrect API key` or `Unauthorized` | The key is wrong, has a stray space, or the account has no credit. Copy the key again and restart. |
| Azure: `404` or `DeploymentNotFound` | `AZURE_OPENAI_DEPLOYMENT` must be the deployment name from Azure AI Foundry, and `AZURE_OPENAI_API_VERSION` must be `2024-10-21`, not a model version. |
| `Port 3000 is in use` | Another copy is already running. Use the address the terminal prints (such as `http://localhost:3001`), or close the other terminal. |
| My notebooks are missing | The app is reading a different `.data` folder. Check whether `DATA_DIR` is set (see [Your data](#your-data-where-it-lives-and-how-to-keep-it)), or whether you started it from another copy of the project. |
| Audio, video or voice features say they aren't set up | They need an optional service, such as Azure Speech or an image model. Add it by following steps 1, 2 and 7 again, then restart. See also [Models and what they're used for](configuration.md#models-and-what-theyre-used-for). Everything else works without them. |
| Azure: `403`, `PermissionDenied`, or "no credential" with Entra | Run `az login` again, and check you have **Cognitive Services OpenAI User** (and **Speech User** for voices) on the resource. New roles can take a few minutes. |

Still stuck? [Open an issue](https://github.com/russrimm/InfiniAIBook/issues) with
the message you see. Remove your API key from anything you paste.
