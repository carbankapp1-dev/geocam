// ============================================================
// WORKER: validar-codigo
// ============================================================
// Este Worker faz DUAS coisas:
//
// A) Validar código e liberar a foto (uso normal, pelo verify.html)
//    1. Recebe: o ID da foto (do QR Code) + o código digitado.
//    2. Confere na coleção "codigos_acesso" se esse código existe
//       e está marcado como ativo.
//    3. Se estiver tudo certo, busca o registro da foto e devolve
//       os dados. Se o código for inválido/inativo, recusa.
//
// B) Cadastro em lote (uso administrativo, pelo admin.html)
//    1. Recebe: uma senha de administrador + uma lista de
//       {codigo, nome}.
//    2. Se a senha bater com o segredo ADMIN_PASSWORD, cadastra
//       todos de uma vez na coleção "codigos_acesso" (já como
//       ativos). Serve tanto pra cadastrar gente nova quanto pra
//       reativar/atualizar o nome de um código que já existia.
//
// Este arquivo é colado inteiro no editor da Cloudflare (ver
// README.md). Nenhuma informação sensível (e-mail da conta de
// serviço, chave privada, senha de administrador) fica escrita
// aqui dentro — tudo isso é guardado separadamente como "segredos"
// do Worker, e lido em tempo de execução através de `env`.
// ============================================================

export default {
  async fetch(request, env) {
    // Libera o navegador a "perguntar antes" (CORS) — necessário
    // porque o verify.html chama este Worker a partir de outro
    // domínio (github.io chamando workers.dev).
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Método não permitido' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse({ error: 'Corpo da requisição inválido' }, 400);
    }

    // ---------- Rota administrativa: cadastro em lote ----------
    if (body.action === 'admin_add_batch') {
      return handleAdminAddBatch(body, env);
    }

    // ---------- Rota padrão: validar código e liberar a foto ----------
    const { id, codigo } = body;
    if (!id || !codigo) {
      return jsonResponse({ error: 'Faltando id ou código' }, 400);
    }

    try {
      // Pega um "crachá temporário" (access token) pra falar com o
      // Firestore como administrador, usando a conta de serviço.
      const accessToken = await getGoogleAccessToken(env);

      // 1) Confere se o código existe e está ativo
      const codigoDoc = await firestoreGet(
        env.FIREBASE_PROJECT_ID,
        `codigos_acesso/${codigo}`,
        accessToken
      );

      if (!codigoDoc || codigoDoc.fields?.ativo?.booleanValue !== true) {
        return jsonResponse({ error: 'Código inválido ou inativo' }, 403);
      }

      // 2) Código válido — busca o registro da foto
      const fotoDoc = await firestoreGet(
        env.FIREBASE_PROJECT_ID,
        `fotos/${id}`,
        accessToken
      );

      if (!fotoDoc) {
        return jsonResponse({ error: 'Registro de foto não encontrado' }, 404);
      }

      // Converte o formato "cru" do Firestore pra um JSON simples
      const foto = parseFirestoreFields(fotoDoc.fields);

      return jsonResponse({
        ok: true,
        acessoPor: codigoDoc.fields?.nome?.stringValue || codigo,
        foto
      });
    } catch (err) {
      return jsonResponse({ error: 'Erro interno: ' + err.message }, 500);
    }
  }
};

// ---------- Cadastro em lote (usado pela página admin.html) ----------

async function handleAdminAddBatch(body, env) {
  const { adminPassword, codigos } = body;

  if (!adminPassword || adminPassword !== env.ADMIN_PASSWORD) {
    return jsonResponse({ error: 'Senha de administrador incorreta' }, 403);
  }

  if (!Array.isArray(codigos) || codigos.length === 0) {
    return jsonResponse({ error: 'Lista de códigos vazia ou inválida' }, 400);
  }
  if (codigos.length > 400) {
    return jsonResponse({ error: 'Máximo de 400 códigos por envio' }, 400);
  }

  // Valida cada item antes de gravar qualquer coisa
  for (const item of codigos) {
    if (!item.codigo || !item.nome) {
      return jsonResponse({ error: 'Todo item precisa ter "codigo" e "nome"' }, 400);
    }
  }

  try {
    const accessToken = await getGoogleAccessToken(env);
    await firestoreBatchWrite(env.FIREBASE_PROJECT_ID, codigos, accessToken);
    return jsonResponse({ ok: true, cadastrados: codigos.length });
  } catch (err) {
    return jsonResponse({ error: 'Erro ao cadastrar: ' + err.message }, 500);
  }
}

async function firestoreBatchWrite(projectId, codigos, accessToken) {
  const base = `projects/${projectId}/databases/(default)/documents`;
  const writes = codigos.map((item) => ({
    update: {
      name: `${base}/codigos_acesso/${item.codigo.trim()}`,
      fields: {
        nome: { stringValue: item.nome.trim() },
        ativo: { booleanValue: true }
      }
    }
  }));

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ writes })
  });

  if (!res.ok) {
    throw new Error('Firestore respondeu ' + res.status + ': ' + (await res.text()));
  }
}

// ---------- Helpers de resposta ----------

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

// ---------- Firestore REST API ----------

async function firestoreGet(projectId, path, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Firestore respondeu ' + res.status);
  return res.json();
}

// Converte o formato de campos "tipados" do Firestore
// (ex: { stringValue: "abc" }) num objeto JS simples.
function parseFirestoreFields(fields) {
  const out = {};
  for (const key in fields) {
    const val = fields[key];
    if ('stringValue' in val) out[key] = val.stringValue;
    else if ('doubleValue' in val) out[key] = val.doubleValue;
    else if ('integerValue' in val) out[key] = Number(val.integerValue);
    else if ('booleanValue' in val) out[key] = val.booleanValue;
    else if ('timestampValue' in val) out[key] = val.timestampValue;
    else if ('nullValue' in val) out[key] = null;
    else out[key] = val;
  }
  return out;
}

// ---------- Autenticação Google (conta de serviço) ----------
// Implementa o fluxo "JWT Bearer" do Google usando só as APIs
// nativas do navegador/Worker (Web Crypto), sem precisar de
// nenhuma biblioteca externa.

async function getGoogleAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const encoder = new TextEncoder();
  const base64url = (str) =>
    btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const headerB64 = base64url(JSON.stringify(header));
  const claimB64 = base64url(JSON.stringify(claimSet));
  const unsigned = `${headerB64}.${claimB64}`;

  const key = await importPrivateKey(env.FIREBASE_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(unsigned)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const jwt = `${unsigned}.${signatureB64}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!tokenRes.ok) {
    throw new Error('Falha ao autenticar com o Google: ' + (await tokenRes.text()));
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

async function importPrivateKey(pem) {
  // A chave privada vem do JSON da conta de serviço no formato PEM
  // (com cabeçalho -----BEGIN PRIVATE KEY-----). Aqui ela é
  // convertida pro formato binário que o Web Crypto entende.
  const pemContents = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}
