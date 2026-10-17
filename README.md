# Personal Think Tank — AI reasoning prototype

A DONCO-BAYCITY app for understanding a real problem, asking one relevant question at a time, challenging assumptions, and giving provisional, evidence-aware recommendations.

## Use real AI on Windows

1. Download or clone this repository, then extract the ZIP (if applicable).
2. Install Node.js 20 or newer from https://nodejs.org.
3. Get an OpenAI API key at https://platform.openai.com/api-keys, with API billing enabled. A ChatGPT subscription is separate.
4. Double-click `START_WINDOWS.bat`, provide your API key when prompted (characters hidden). The key is kept in memory for this session and **never saved to HTML or GitHub**.
5. Your browser opens `http://127.0.0.1:8787`. Enter a problem and click **Start thinking**. The conversation should respond through the AI server.
6. Keep the black command window open during use. Press Ctrl+C to stop the server.

Mac/Linux: set `OPENAI_API_KEY` in your terminal and run `./start-mac-linux.sh`. Optional `OPENAI_MODEL` defaults to `gpt-5-mini` and can be changed in your terminal. The API has separate usage costs.

## What is—and isn't—live on GitHub Pages

GitHub Pages serves static HTML, CSS and JavaScript. It **cannot host `server.mjs`**, so visiting the public GitHub Pages site shows the clearly labeled offline guided demo. Real AI is enabled automatically only when the Node server is running locally and `/api/status` confirms it has an API key. Never paste a secret API key into a web page or commit it. To offer real AI to the public on GitHub Pages, we must later deploy an authenticated, rate-limited HTTPS backend and connect the website to it. The bundled Node server only binds to loopback and is **not** a production hosting service.

## Conversational thinking style

The AI thinking partner should act like a thoughtful, candid friend rather than a questionnaire. It should acknowledge the person's excitement or concerns, give its best provisional view when useful, weigh genuine benefits against costs, question urgency and assumptions, and offer practical compromises. Light humor is appropriate for everyday choices when the user's tone supports it; serious situations deserve a measured response. It should **not** manufacture prices, product features, crowd reactions, financial facts, or research.

A useful manual test is a three-turn shopping conversation: (1) "I can't leave the store without these two pairs of shoes." (2) "They're the last ones in my size and I love how they look." (3) "It's two different models, and financing will add $77.75 interest." The AI should respond to each newly revealed fact, give sensible tradeoffs rather than scripted questions, and explain that the supplied interest is a reported amount rather than a verified quote. It should not claim it knows the user's budget or the shoes' performance.

Note that **GitHub Pages is still an offline demo**, not the live thinking partner. Run the Windows or Mac/Linux server and configure an API key to test this style. The app cannot guarantee that every generated response will follow the intended style; test real conversations before publication.

## Thinking and privacy

- AI conversations use the OpenAI Responses API and are sent to the API through the local server. Data also remains in this browser's local storage (not encrypted), so don't enter account numbers or secrets. You can export or delete saved problems. Problems stored under a GitHub Pages web address will not automatically appear under `127.0.0.1`; use the backup export/import tools to move them.
- The AI can reason from **user-supplied information**, but the current version **does not search the internet or independently verify facts**. It should distinguish evidence from assumptions and signal uncertainty.
- Use **Give me your recommendation** for a provisional conclusion, or **Challenge an assumption** to get a critical alternative view. The app should not force nine questions when AI is connected.
- The local server sets `store: false` on Responses API requests, which controls API response storage but does not represent a promise of zero data retention.

## Developer verification

- `node --check server.mjs` checks server syntax.
- Check home, first response, follow-up, recommendation, challenge, saved work, phone layout, offline mode, missing-key error, and blocked foreign origins.
- Model replies must be verified with a configured API key. Automated tests with mocked API output only verify integration—not AI accuracy.

## Technical design

- Browser: a single `index.html` keeping original guided logic, comparison tools, saved projects, and exports.
- `server.mjs`: local Node (no dependencies) with `/api/status` and `/api/think`. Key stored only in the server process. Network origin locked to localhost.
- Server defaults to `gpt-5-mini`, configurable with `OPENAI_MODEL`.
