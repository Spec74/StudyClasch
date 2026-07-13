<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/3a948f87-e16a-4b08-b6e8-2da9e9581f3e

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `MONGODB_URI` and `GEMINI_API_KEY` in [.env.local](.env.local)


1. Paso 1: Encender la base de datos (Docker)

docker-compose up -d

3. Start the backend in one terminal:
   `npm run server`
4. Start the frontend in another terminal:
   `npm run dev`
