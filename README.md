# NANDA KISHORE BOT

NANDA KISHORE BOT is a responsive chat app powered by Groq's GPT-OSS 120B model. It streams answers and saves searchable conversations in this browser.

## Get a Groq API key

1. Open [console.groq.com](https://console.groq.com/) and sign in or create an account.
2. Open **API Keys**, choose **Create API Key**, and copy the new key. Groq only shows the full key when it is created.
3. If you have shared a key in a message, screenshot, or public repository, revoke it from the API Keys page and create a replacement.

## Run locally

1. Copy `.env.example` to `.env.local` in the project root.
2. Open `.env.local` and replace the example value with your Groq key:

   ```dotenv
   GROQ_API_KEY=your_new_groq_api_key
   ```

3. In a terminal at the project root, run:

   ```powershell
   npm install
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

Keep the key in `.env.local`. That file is ignored by Git; do not put the key in frontend code, screenshots, or a committed file. The chat route sends requests to Groq from the server, so the key is not included in browser requests. Restart the dev server after changing the key.

## History and search

Conversation history is stored in this browser's local storage. Use the sidebar search to find words in conversation titles and messages. History is not uploaded or synced between browsers. Clearing this browser's site data removes it.

## Model

The API route uses Groq's `openai/gpt-oss-120b` model with medium reasoning effort. Change the `model` field in `src/app/api/chat/route.ts` to use another model available to your Groq account.