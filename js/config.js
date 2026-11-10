/* Production API requests stay on the website domain; Vercel forwards them to Render.
   Local development uses the FastAPI server on port 8000. */
const HARVESTV_CONFIG = {
  apiBaseUrl: typeof location !== 'undefined' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    ? 'http://127.0.0.1:8000' : '',
  // Development only: serve clearly-labelled demo environmental data instead of calling the backend.
  useMockEnvironment: false
};
