/**
 * PM Dashboard Gateway - Cloudflare Worker (PRODUCTION-READY)
 * 
 * Fixes applied:
 * - UTF-8 safe base64 encoding/decoding (supports Unicode: Bürgin, etc.)
 * - Write path allowlist + path traversal protection
 * - CORS header case-insensitive handling
 * - Security hardening
 */

// ============================================================================
// CONFIGURATION (Set these in Worker Environment Variables)
// ============================================================================

// Required secrets (set via wrangler or dashboard):
// - GITHUB_TOKEN: Fine-grained PAT with Contents read/write to pm-data repo
// - GITHUB_OWNER: Your GitHub username
// - GITHUB_REPO: Repository name (e.g., "achim-pm-data")
// - PM_API_KEY: Random secret for write operations (generate with: openssl rand -hex 32)

// Optional:
// - GITHUB_BRANCH: Default "main"
// - READ_PASSWORD: If set, requires ?password=X for reads (optional)

// ============================================================================
// CORS HEADERS
// ============================================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*', // TODO: Tighten to https://steponthebridge.ch after testing
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-PM-Key, x-pm-key', // Allow both casings
  'Access-Control-Max-Age': '86400',
};

// ============================================================================
// UTF-8 BASE64 HELPERS (Fixes Unicode support)
// ============================================================================

function base64ToUint8Array(base64) {
  const binary = atob(base64.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64Utf8(base64) {
  const bytes = base64ToUint8Array(base64);
  return new TextDecoder('utf-8').decode(bytes);
}

function encodeUtf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  return uint8ArrayToBase64(bytes);
}

// ============================================================================
// PATH SECURITY
// ============================================================================

function isSafeRepoPath(path) {
  if (typeof path !== 'string') return false;
  if (path.startsWith('/')) return false;
  if (path.includes('..')) return false;

  if (path === 'index.json') return true;
  if (path.startsWith('projects/') && path.endsWith('.json')) return true;
  // if (path.startsWith('archive/') && path.endsWith('.json')) return true;

  return false;
}

// ============================================================================
// GITHUB API HELPERS
// ============================================================================

async function fetchFromGitHub(env, path) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  const branch = env.GITHUB_BRANCH || 'main';
  
  const response = await fetch(`${url}?ref=${branch}`, {
    headers: {
      'Authorization': `token ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'PM-Dashboard-Worker'
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`File not found: ${path}`);
    }
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const contentText = decodeBase64Utf8(data.content);
  const json = JSON.parse(contentText);
  
  return {
    json,
    sha: data.sha
  };
}

async function commitToGitHub(env, path, message, json, sha = null) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  const branch = env.GITHUB_BRANCH || 'main';
  
  const content = encodeUtf8ToBase64(JSON.stringify(json, null, 2));
  
  const body = { message, content, branch };
  if (sha) body.sha = sha;
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'PM-Dashboard-Worker'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GitHub commit failed: ${response.status} - ${error}`);
  }

  return await response.json();
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateProjectJSON(json) {
  const errors = [];
  if (!json.meta) errors.push('Missing required field: meta');
  if (!json.concept) errors.push('Missing required field: concept');
  if (!json.deliverables) errors.push('Missing required field: deliverables');
  if (!json.todos) errors.push('Missing required field: todos');
  if (!json.meetings) errors.push('Missing required field: meetings');
  if (!json.timeline) errors.push('Missing required field: timeline');

  if (json.meta) {
    if (!json.meta.projectId) errors.push('Missing meta.projectId');
    if (!json.meta.projectName) errors.push('Missing meta.projectName');
    if (!json.meta.status) errors.push('Missing meta.status');
    if (!json.meta.lastUpdated) errors.push('Missing meta.lastUpdated');
  }

  if (json.deliverables && !Array.isArray(json.deliverables)) errors.push('deliverables must be an array');
  if (json.todos && !Array.isArray(json.todos)) errors.push('todos must be an array');
  if (json.meetings && !Array.isArray(json.meetings)) errors.push('meetings must be an array');

  return errors;
}

function validateIndexJSON(json) {
  const errors = [];
  if (!json.lastUpdated) errors.push('Missing lastUpdated');
  if (!json.projects) errors.push('Missing projects array');
  if (json.projects && !Array.isArray(json.projects)) errors.push('projects must be an array');

  if (json.projects && Array.isArray(json.projects)) {
    json.projects.forEach((project, idx) => {
      if (!project.id) errors.push(`Project ${idx}: missing id`);
      if (!project.name) errors.push(`Project ${idx}: missing name`);
      if (!project.file) errors.push(`Project ${idx}: missing file`);
    });
  }

  return errors;
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS
    }
  });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

async function handleGetIndex(env, request) {
  try {
    if (env.READ_PASSWORD) {
      const url = new URL(request.url);
      const password = url.searchParams.get('password');
      if (password !== env.READ_PASSWORD) {
        return errorResponse('Invalid password', 401);
      }
    }

    if (env.PM_CACHE) {
      const cached = await env.PM_CACHE.get('index', { type: 'json' });
      if (cached) return jsonResponse(cached);
    }

    const { json } = await fetchFromGitHub(env, 'index.json');

    if (env.PM_CACHE) {
      await env.PM_CACHE.put('index', JSON.stringify(json), { expirationTtl: 300 });
    }

    return jsonResponse(json);
  } catch (error) {
    console.error('Error in handleGetIndex:', error);
    return errorResponse(error.message, 500);
  }
}

async function handleGetProject(env, request, projectId) {
  try {
    if (env.READ_PASSWORD) {
      const url = new URL(request.url);
      const password = url.searchParams.get('password');
      if (password !== env.READ_PASSWORD) {
        return errorResponse('Invalid password', 401);
      }
    }

    if (env.PM_CACHE) {
      const cached = await env.PM_CACHE.get(`project:${projectId}`, { type: 'json' });
      if (cached) return jsonResponse(cached);
    }

    const { json: indexData } = await fetchFromGitHub(env, 'index.json');
    const projectInfo = indexData.projects.find(p => p.id === projectId);

    if (!projectInfo) {
      return errorResponse(`Project not found: ${projectId}`, 404);
    }

    const { json } = await fetchFromGitHub(env, projectInfo.file);

    if (env.PM_CACHE) {
      await env.PM_CACHE.put(`project:${projectId}`, JSON.stringify(json), { expirationTtl: 300 });
    }

    return jsonResponse(json);
  } catch (error) {
    console.error('Error in handleGetProject:', error);
    return errorResponse(error.message, 500);
  }
}

async function handleUpdate(env, request) {
  try {
    const apiKey = request.headers.get('X-PM-Key') || request.headers.get('x-pm-key');
    if (!apiKey || apiKey !== env.PM_API_KEY) {
      return errorResponse('Invalid or missing API key', 401);
    }

    const body = await request.json();
    const { path, message, json } = body || {};

    if (!path || !message || !json) {
      return errorResponse('Missing required fields: path, message, json', 400);
    }

    if (!isSafeRepoPath(path)) {
      return errorResponse(`Path not allowed: ${path}. Only index.json and projects/*.json are writable.`, 403);
    }

    let validationErrors = [];
    if (path === 'index.json') {
      validationErrors = validateIndexJSON(json);
    } else if (path.startsWith('projects/')) {
      validationErrors = validateProjectJSON(json);
    }

    if (validationErrors.length > 0) {
      return errorResponse(`Validation failed: ${validationErrors.join(', ')}`, 400);
    }

    let currentSha = null;
    try {
      const { sha } = await fetchFromGitHub(env, path);
      currentSha = sha;
    } catch (_) {}

    const result = await commitToGitHub(env, path, message, json, currentSha);

    if (env.PM_CACHE) {
      await env.PM_CACHE.delete('index');
      if (path.startsWith('projects/')) {
        const projectId = path.replace('projects/', '').replace('.json', '');
        await env.PM_CACHE.delete(`project:${projectId}`);
      }
    }

    return jsonResponse({
      success: true,
      message: 'Update committed to GitHub',
      commit: result.commit?.sha || null,
      path
    });

  } catch (error) {
    console.error('Error in handleUpdate:', error);
    return errorResponse(error.message, 500);
  }
}

async function handleCreateProject(env, request) {
  try {
    const apiKey = request.headers.get('X-PM-Key') || request.headers.get('x-pm-key');
    if (!apiKey || apiKey !== env.PM_API_KEY) {
      return errorResponse('Invalid or missing API key', 401);
    }

    const body = await request.json();
    const { id, name, type, tags = [] } = body || {};

    if (!id || !name || !type) {
      return errorResponse('Missing required fields: id, name, type', 400);
    }

    if (id.includes('/') || id.includes('..') || id.includes('\\')) {
      return errorResponse('Invalid project ID format', 400);
    }

    const now = new Date().toISOString();
    const projectJson = {
      meta: {
        projectId: id,
        projectName: name,
        status: 'active',
        type: type,
        created: now,
        lastUpdated: now,
        tags: tags,
        enabledModules: {
          stakeholders: true,
          change: true,
          hours: false,
          budget: false,
          risks: true,
          retrospective: true
        }
      },
      concept: {
        objective: '',
        problemStatement: '',
        successCriteria: [],
        constraints: []
      },
      deliverables: [],
      todos: [],
      meetings: [],
      timeline: [],
      stats: { keyMetrics: {} },
      notes: []
    };

    const projectPath = `projects/${id}.json`;
    await commitToGitHub(env, projectPath, `[${id}] init: create new project`, projectJson);

    const { json: indexData, sha: indexSha } = await fetchFromGitHub(env, 'index.json');

    indexData.projects.push({
      id: id,
      name: name,
      status: 'active',
      type: type,
      created: now,
      lastUpdated: now,
      file: projectPath,
      keyMetric: 'New project',
      tags: tags,
      priority: 'medium',
      enabledModules: projectJson.meta.enabledModules
    });

    indexData.lastUpdated = now;

    await commitToGitHub(env, 'index.json', `[index] add: new project ${id}`, indexData, indexSha);

    if (env.PM_CACHE) {
      await env.PM_CACHE.delete('index');
      await env.PM_CACHE.delete(`project:${id}`);
    }

    return jsonResponse({
      success: true,
      message: 'Project created',
      projectId: id,
      projectPath: projectPath
    });

  } catch (error) {
    console.error('Error in handleCreateProject:', error);
    return errorResponse(error.message, 500);
  }
}

// ============================================================================
// MAIN REQUEST HANDLER
// ============================================================================

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/index' && request.method === 'GET') return handleGetIndex(env, request);

    const projectMatch = path.match(/^\/project\/([^\/]+)$/);
    if (projectMatch && request.method === 'GET') return handleGetProject(env, request, projectMatch[1]);

    if (path === '/update' && request.method === 'POST') return handleUpdate(env, request);

    if (path === '/create-project' && request.method === 'POST') return handleCreateProject(env, request);

    return errorResponse('Endpoint not found', 404);
  }
};