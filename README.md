## Usage Guide

### Install Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer Mode**
3. Click **"Load unpacked"** and select `dist` folder
4. The extension will appear in your toolbar

### Apply AI API Key

- Gemini:
  - Go to [Google AI Studio](https://aistudio.google.com/)
  - Click the "Get API Key" button at the left bottom corner of the left sidebar menu
  - Click the "Create API Key" button at the top right corner of the page
  - Follow the instructions to create a new API key
- GPT / OpenAI:
  - Use an OpenAI key or any OpenAI-compatible service key
- Copy the API key and paste it in the extension popup page

### Configure AI Provider, Model and API Base URL

- The popup supports `Gemini` and `GPT / OpenAI`.
- You can type any provider-compatible model name manually.
- `API Base URL` is optional.
  - Gemini: leave it empty to use the official Gemini endpoint.
  - GPT / OpenAI: leave it empty to use `https://api.openai.com/v1`.
- GPT / OpenAI currently supports only the OpenAI `chat/completions` protocol.
- If you use a custom endpoint, it must be provider-compatible and start with `http://` or `https://`.
- For GPT / OpenAI, enter only the base URL, for example:
  - `http://127.0.0.1:8000/v1`
  - `https://your-proxy.example.com/v1`
- Do not enter the full `.../chat/completions` endpoint URL.
- The custom endpoint must allow browser-side CORS requests from the Bilibili page. Otherwise the request will fail before reaching the model service.

### Verify the Custom API Base URL Works

1. Open the extension popup and fill in:
   - a provider
   - a valid API key
   - a valid provider-compatible model name
   - a custom `API Base URL` such as `http://127.0.0.1:8000/v1`
2. Click `Save`, then refresh the Bilibili video page.
3. Open Chrome DevTools on the video page and check:
   - `Network`: filter by your custom domain and confirm the AI request is sent to the custom base URL
   - `Network`: confirm the actual request path ends with `/chat/completions`
   - `Network`: confirm the response status is `200` or another successful `2xx`
   - `Console`: confirm there is no request going to the wrong provider endpoint
4. If the endpoint is not OpenAI-compatible, does not support `chat/completions`, or CORS is not enabled, the extension should show the existing AI service failure message.

## Development Guide

### Install dependencies

```bash
npm install
```

### Run development build

```bash
npm run dev
```

- This watches source files and rebuilds the `dist` directory.
- After each rebuild, open `chrome://extensions/` and click the refresh button on the unpacked extension.

### Build production package

```bash
npm run build
```

- The output folder is `dist`.
- To use it in Chrome, open `chrome://extensions/`, enable Developer Mode, click `Load unpacked`, and select `dist`.

### Run tests

```bash
npm run test:ai
npm run test:dom
```
