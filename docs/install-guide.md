# Install step by step

This guide is for anyone who has never set up an app like this before. It walks
through every step on **Windows** and on **Mac or Linux**, explains each term the
first time it appears, and ends with fixes for common problems. If you're
comfortable with Node.js and `.env` files, the shorter
[Getting started](getting-started.md) page has everything you need.

It takes about 15 minutes, plus however long it takes to get an AI key.

## Words you'll see

| Term | What it means |
|---|---|
| **Terminal** | A window where you type commands instead of clicking. On Windows it's called PowerShell or Terminal; on a Mac it's the Terminal app. |
| **Project folder** | The `InfiniAIBook` folder you download in step 2. Every command in this guide runs inside it. |
| **Model provider** | The AI service that does the thinking: OpenAI, Google Gemini, Azure OpenAI, or a free model running on your own computer. You need one. |
| **API key** | A long password from your model provider that lets the app use your account. Keep it private, like any password. |
| **Environment variable** | A named setting, such as `OPENAI_API_KEY`, that a program reads when it starts. You don't need to set these in Windows or macOS: this app reads them from one small text file, `.env.local`. |
| **`.env.local`** | The settings file you create in step 4. It holds your provider and API key, stays on your computer, and is never uploaded anywhere. |
| **`.data` folder** | Where the app keeps everything you make: notebooks, sources, chats, notes and generated files. It's created automatically. |

## 1. Install Node.js

InfiniAIBook runs on **Node.js version 22.13 or later**.

1. Go to <https://nodejs.org> and download the **LTS** version for your computer.
2. Run the installer and accept the defaults.
3. Check it worked: open a **new** terminal (see the next step for how) and type:

   ```
   node -v
   ```

   You should see something like `v22.14.0` or higher. If you see `v20…` or
   `'node' is not recognized`, see [Troubleshooting](#troubleshooting).

## 2. Download InfiniAIBook and open a terminal in it

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

## 3. Install the app's building blocks

In the same terminal, type:

```
npm install
```

This downloads the libraries the app needs into a `node_modules` folder. It
takes a few minutes the first time. Warnings are normal; only a line that
starts with `npm error` means something went wrong.

## 4. Create your settings file (`.env.local`)

You'll create a small text file named exactly **`.env.local`** (it starts with a
dot and has no `.txt` on the end) in the project folder, next to `package.json`.

**Windows.** In the terminal, type:

```
notepad .env.local
```

Notepad asks whether to create a new file. Click **Yes**. Paste in the settings
from step 5, then **File → Save** and close Notepad.

**Mac.** In the terminal, type:

```
touch .env.local
open -e .env.local
```

TextEdit opens the empty file. Paste in the settings from step 5, save and close.

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

## 5. Choose a model provider

Pick **one** option, and paste its lines into `.env.local`. Replace the
placeholder after `=` with your own value.

### Option A: OpenAI (simplest)

1. Create an API key at <https://platform.openai.com/api-keys>. You need a
   small amount of prepaid credit on the account.
2. Put this in `.env.local`:

   ```ini
   AI_PROVIDER=openai
   OPENAI_API_KEY=sk-paste-your-key-here
   ```

### Option B: Google Gemini (has a free tier)

1. Create a key at <https://aistudio.google.com/apikey>.
2. Put this in `.env.local`:

   ```ini
   AI_PROVIDER=gemini
   GEMINI_API_KEY=paste-your-key-here
   ```

The same key also lets the app read YouTube transcripts.

### Option C: Azure OpenAI (for work or school Azure accounts)

You need an Azure OpenAI resource with two **deployments**: one chat model and
one embedding model. A deployment name is the name *you* gave the model in
Azure AI Foundry, which isn't always the same as the model's name.

```ini
AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com
AZURE_OPENAI_API_VERSION=2024-10-21
AZURE_OPENAI_DEPLOYMENT=your-chat-deployment-name
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=your-embedding-deployment-name
AZURE_OPENAI_API_KEY=paste-your-key-here
```

Find the endpoint and key in the Azure portal under your resource's **Keys and
Endpoint** page. Leave `AZURE_OPENAI_API_VERSION` exactly as shown; it's a dated
API version, not a model version. If your organization doesn't allow keys,
leave out the `AZURE_OPENAI_API_KEY` line and sign in instead. See
[Authentication](configuration.md#authentication-microsoft-entra-id).

### Option D: A free model on your own computer (Ollama)

No account or key, but answers are slow without a capable graphics card.

1. Install Ollama from <https://ollama.com>.
2. In a terminal, download a chat model and an embedding model:

   ```
   ollama pull qwen3.5
   ollama pull nomic-embed-text
   ```

3. Put this in `.env.local`:

   ```ini
   AI_PROVIDER=ollama
   ```

Other providers, such as Anthropic, Groq and Mistral, are listed in
[Configuration](configuration.md#named-providers).

## 6. Start the app

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

## 7. Check the connection (optional)

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
| `'node' is not recognized` or `command not found: node` | Node.js isn't installed, or the terminal was open during installation. Install it (step 1) and open a new terminal. |
| `node -v` shows a version below 22.13, or an error mentioning `node:sqlite` | Install the current LTS from <https://nodejs.org>, then open a new terminal. |
| `npm error enoent … package.json` | The terminal isn't in the project folder. Repeat step 2 and check that `dir` or `ls` lists `package.json`. |
| The app says **"No model provider is configured"** | The app didn't find your settings. Check that the file is named exactly `.env.local` (not `.env.local.txt`), sits next to `package.json`, and that the lines have no `#` in front. Then restart the app. |
| `401`, `Incorrect API key` or `Unauthorized` | The key is wrong, has a stray space, or the account has no credit. Copy the key again and restart. |
| Azure: `404` or `DeploymentNotFound` | `AZURE_OPENAI_DEPLOYMENT` must be the deployment name from Azure AI Foundry, and `AZURE_OPENAI_API_VERSION` must be `2024-10-21`, not a model version. |
| `Port 3000 is in use` | Another copy is already running. Use the address the terminal prints (such as `http://localhost:3001`), or close the other terminal. |
| My notebooks are missing | The app is reading a different `.data` folder. Check whether `DATA_DIR` is set (see [Your data](#your-data-where-it-lives-and-how-to-keep-it)), or whether you started it from another copy of the project. |
| Audio, video or voice features say they aren't set up | They need extra services, such as Azure Speech or an image model. See [Models and what they're used for](configuration.md#models-and-what-theyre-used-for). Everything else works without them. |

Still stuck? [Open an issue](https://github.com/russrimm/InfiniAIBook/issues) with
the message you see. Remove your API key from anything you paste.
