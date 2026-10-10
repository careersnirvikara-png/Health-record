// Frontend settings. This is the ONLY frontend file that differs between UAT and production.
window.APP_CONFIG = {
  // Base URL of the API. Leave '' when the pages and API are served from the same site (UAT).
  // For production use the full URL, e.g. 'https://presign-upload-worker.nirvikara.workers.dev'
  API_BASE_URL: '',

  // Client-side limits (the server enforces its own limits, see wrangler.toml [vars])
  MAX_FILE_SIZE_MB: 2,
  MAX_TOTAL_SIZE_MB: 50
};
