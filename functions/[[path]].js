export async function onRequest({ request, env, next }) {
  return handle(request, env, next);
}

// Settings come from wrangler.toml [vars]; these are only fallbacks.
let MAX_FILE_SIZE = 200 * 1024 * 1024;
let MAX_TOTAL_SIZE = 50 * 1024 * 1024;
let ALLOWED_ORIGINS = ['*'];

function loadConfig(env) {
  const mb = (value, fallbackBytes) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n * 1024 * 1024 : fallbackBytes;
  };
  MAX_FILE_SIZE = mb(env.MAX_FILE_SIZE_MB, 200 * 1024 * 1024);
  MAX_TOTAL_SIZE = mb(env.MAX_TOTAL_SIZE_MB, 50 * 1024 * 1024);
  ALLOWED_ORIGINS = (env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
}

async function handle(request, env, next) {
  loadConfig(env);
  const UPLOADS = env.UPLOADS;
  const url = new URL(request.url);
  
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request)
    });
  }

  if (request.method === 'POST' && url.pathname === '/upload') {
    try {
      const form = await request.formData();
      const file = form.get('file');
      const name = form.get('name') || '';
      const email = form.get('email') || '';
      const description = form.get('description') || '';
      
      if (!file) return jsonResponse({ error: 'file required' }, 400, request);
      if (!email) return jsonResponse({ error: 'email required' }, 400, request);
      if (!description) return jsonResponse({ error: 'description required' }, 400, request);

      if (file.size > MAX_FILE_SIZE) {
        return jsonResponse({ error: `File size exceeds ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)} MB limit. Your file is ${(file.size / 1024 / 1024).toFixed(2)} MB` }, 400, request);
      }

      const list = await UPLOADS.list({ prefix: `uploads/${email}/` });
      let totalSize = 0;
      for (const obj of list.objects) {
        totalSize += obj.size;
      }

      if (totalSize + file.size > MAX_TOTAL_SIZE) {
        const usedMB = (totalSize / 1024 / 1024).toFixed(2);
        const fileMB = (file.size / 1024 / 1024).toFixed(2);
        const availableMB = ((MAX_TOTAL_SIZE - totalSize) / 1024 / 1024).toFixed(2);
        return jsonResponse({ 
          error: `Storage quota exceeded. Used: ${usedMB} MB / ${(MAX_TOTAL_SIZE / 1024 / 1024).toFixed(0)} MB. File size: ${fileMB} MB. Available: ${availableMB} MB` 
        }, 400, request);
      }

      const filename = file.name || `file-${Date.now()}`;
      const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `uploads/${email}/${Date.now()}-${safe}`;

      const putOptions = {
        httpMetadata: {
          contentType: file.type || 'application/octet-stream'
        },
        customMetadata: {
          description: description,
          uploader: email,
          name: name
        }
      };

      await UPLOADS.put(key, file.stream(), putOptions);

      return jsonResponse({ key, message: 'uploaded', description: description }, 200, request);
    } catch (err) {
      return jsonResponse({ error: String(err) }, 500, request);
    }
  }

  if (request.method === 'GET' && url.pathname === '/list') {
    const email = url.searchParams.get('email');
    if (!email) return jsonResponse({ error: 'email query param required' }, 400, request);        

    try {
      const list = await UPLOADS.list({ prefix: `uploads/${email}/` });

      const filesWithMeta = await Promise.all(list.objects.map(async (obj) => {
        let desc = '';
        let contentType = 'application/octet-stream';
        
        try {
          const meta = await UPLOADS.head(obj.key);
          if (meta && meta.customMetadata) {
            desc = meta.customMetadata.description || '';
          }
          if (meta && meta.httpMetadata && meta.httpMetadata.contentType) {
            contentType = meta.httpMetadata.contentType;
          }
        } catch (err) {
          console.error('Error getting metadata for', obj.key, ':', err);
        }

        return {
          key: obj.key,
          size: obj.size,
          uploaded: obj.uploaded,
          url: `/object/${encodeURIComponent(obj.key)}`,
          description: desc,
          contentType: contentType
        };
      }));

      filesWithMeta.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));
      
      const totalUsed = filesWithMeta.reduce((sum, f) => sum + f.size, 0);
      const percentUsed = ((totalUsed / MAX_TOTAL_SIZE) * 100).toFixed(1);

      return jsonResponse({ 
        files: filesWithMeta,
        storage: {
          used: totalUsed,
          max: MAX_TOTAL_SIZE,
          percentUsed: parseFloat(percentUsed)
        }
      }, 200, request);
    } catch (err) {
      return jsonResponse({ error: String(err) }, 500, request);
    }
  }

  if (request.method === 'DELETE' && url.pathname === '/delete') {
    const key = url.searchParams.get('key');
    const email = url.searchParams.get('email');
    if (!key || !email) return jsonResponse({ error: 'key and email required' }, 400, request);

    try {
      if (!key.includes(`uploads/${email}/`)) {
        return jsonResponse({ error: 'Unauthorized: file does not belong to this user' }, 403, request);
      }
      await UPLOADS.delete(key);
      return jsonResponse({ message: 'File deleted successfully' }, 200, request);
    } catch (err) {
      return jsonResponse({ error: String(err) }, 500, request);
    }
  }

  if (request.method === 'GET' && url.pathname.startsWith('/object/')) {
    const key = decodeURIComponent(url.pathname.replace('/object/', ''));
    try {
      const obj = await UPLOADS.get(key);
      if (!obj) return new Response('Not found', { status: 404 });
      const headers = new Headers();
      if (obj.httpMetadata && obj.httpMetadata.contentType) headers.set('Content-Type', obj.httpMetadata.contentType);
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(obj.body, { status: 200, headers });
    } catch (err) {
      return new Response('Error: ' + String(err), { status: 500 });
    }
  }

  return next();
}

function jsonResponse(obj, status = 200, request = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (request) Object.assign(headers, corsHeaders(request));
  return new Response(JSON.stringify(obj), { status, headers });
}

function corsHeaders(request) {
  const requestOrigin = request.headers.get('Origin');
  let origin;
  if (ALLOWED_ORIGINS.includes('*')) {
    origin = requestOrigin || '*';
  } else {
    origin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '3600'
  };
}
