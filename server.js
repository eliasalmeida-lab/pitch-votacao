const express = require("express");
const path = require("path");
const xlsx = require("xlsx");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ==========================
// "Banco de dados" em memória
// ==========================

let initialized = false;

const data = {
  users: [], // {code, name, role, turmaId, isPresenter}
  turmas: [
    { id: "1", name: "Turma 1" },
    { id: "2", name: "Turma 2" },
    { id: "3", name: "Turma 3" },
    { id: "4", name: "Turma 4" },
  ],
  perguntas: [], // {id, turmaId, apresentadorCode, texto, ordem}
  topicos: [],   // {id, perguntaId, turmaId, apresentadorCode, texto}
  votos: [],     // {userCode, topicoId, nota}
  estrelas: []   // {userCode, turmaId, topicoId}
};

let nextPerguntaId = 1;
let nextTopicoId = 1;

// ==========================
// Funções auxiliares
// ==========================

function findUserByCode(code) {
  return data.users.find(u => u.code === String(code));
}

function getTurmaById(id) {
  return data.turmas.find(t => t.id === String(id));
}

function createPergunta(turmaId, apresentadorCode, texto, ordem) {
  const pergunta = {
    id: String(nextPerguntaId++),
    turmaId: String(turmaId),
    apresentadorCode: String(apresentadorCode),
    texto,
    ordem
  };
  data.perguntas.push(pergunta);
  return pergunta;
}

function createTopico(pergunta, texto) {
  const topico = {
    id: String(nextTopicoId++),
    perguntaId: pergunta.id,
    turmaId: pergunta.turmaId,
    apresentadorCode: pergunta.apresentadorCode,
    texto
  };
  data.topicos.push(topico);
  return topico;
}

function getPerguntasETopicos(apresentadorCode) {
  const perguntas = data.perguntas
    .filter(p => p.apresentadorCode === String(apresentadorCode))
    .sort((a, b) => a.ordem - b.ordem);

  const topicosPorPergunta = {};
  for (const t of data.topicos) {
    if (!perguntas.some(p => p.id === t.perguntaId)) continue;
    if (!topicosPorPergunta[t.perguntaId]) topicosPorPergunta[t.perguntaId] = [];
    topicosPorPergunta[t.perguntaId].push(t);
  }

  for (const pid in topicosPorPergunta) {
    topicosPorPergunta[pid].sort((a, b) => a.id.localeCompare(b.id));
  }

  return perguntas.map(p => ({
    ...p,
    topicos: topicosPorPergunta[p.id] || []
  }));
}

// ==========================
// Ler PITCH.xlsx e montar apresentadores + perguntas
// ==========================

function loadPresentersFromExcel() {
  try {
    const filePath = path.join(__dirname, "PITCH.xlsx");
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 }); // matriz [linha][coluna]

    const presenters = [];
    let currentPeriodo = 1;

    rows.forEach((row) => {
      const col0 = row[0]; // Apresentador / PERIODO / header
      const col1 = row[1]; // Tema
      const col2 = row[2]; // Pergunta 1
      const col3 = row[3]; // Pergunta 2
      const col4 = row[4]; // Pergunta 3

      if (!col0 || String(col0).trim() === "") return;

      const col0Str = String(col0).trim();

      // Linhas "PERIODO X"
      if (col0Str.toUpperCase().startsWith("PERIODO")) {
        const parts = col0Str.split(/\s+/);
        const num = parseInt(parts[1], 10);
        if (!isNaN(num)) currentPeriodo = num;
        return;
      }

      // Linha de header "Apresentador"
      if (col0Str.toLowerCase() === "apresentador") {
        return;
      }

      // Linha de apresentador
      const perguntas = [col2, col3, col4]
        .map(q => (q ? String(q).trim() : ""))
        .filter(q => q.length > 0)
        .slice(0, 3);

      presenters.push({
        nome: col0Str,
        tema: col1 ? String(col1).trim() : "",
        periodo: currentPeriodo || 1,
        perguntas
      });
    });

    console.log(`Carregados ${presenters.length} apresentadores do PITCH.xlsx.`);
    return presenters;
  } catch (err) {
    console.error("Erro ao ler PITCH.xlsx:", err.message);
    return [];
  }
}

// ==========================
// Rota de setup-default
// ==========================

app.post("/setup-default", (req, res) => {
  if (initialized) {
    return res.json({ ok: true, message: "Já estava inicializado. Nada foi alterado." });
  }

  // Admin
  data.users.push({
    code: "100",
    name: "Elias",
    role: "admin",
    turmaId: null,
    isPresenter: false
  });

  // Lê apresentadores + perguntas do Excel
  const presentersFromExcel = loadPresentersFromExcel();

  if (!presentersFromExcel.length) {
    return res.status(500).json({
      ok: false,
      message: "Não foi possível carregar os apresentadores a partir de PITCH.xlsx. Verifique se o arquivo está na mesma pasta do server.js."
    });
  }

  // Cria apresentadores com códigos 11, 12, 13, ...
  let codeCounter = 11;

  presentersFromExcel.forEach((p) => {
    const code = String(codeCounter++);
    const turmaId = String(p.periodo || 1);
    const name = p.nome;
    const tema = p.tema || "";

    data.users.push({
      code,
      name,
      role: "participant",
      turmaId,
      isPresenter: true
    });

    // Perguntas: usa as do Excel, se não tiver, cria genéricas
    const perguntas = (p.perguntas && p.perguntas.length
      ? p.perguntas
      : [
          `Pergunta 1 de ${name}`,
          `Pergunta 2 de ${name}`,
          `Pergunta 3 de ${name}`
        ]
    ).slice(0, 3);

    perguntas.forEach((textoPergunta, idx) => {
      const ordem = idx + 1;
      const pergunta = createPergunta(turmaId, code, textoPergunta, ordem);

      // 3 tópicos fictícios por pergunta
      for (let i = 1; i <= 3; i++) {
        const baseLabel = `Tópico ${ordem}.${i}`;
        const detalhe = tema ? ` – ${tema}` : ` – ${name}`;
        createTopico(pergunta, baseLabel + detalhe);
      }
    });
  });

  // Participantes extras (não apresentadores): 42–46
  const turmasIds = data.turmas.map(t => t.id);
  let turmaIndex = 0;
  for (let codeNum = 42; codeNum <= 46; codeNum++) {
    const code = String(codeNum);
    const turmaId = turmasIds[turmaIndex];
    turmaIndex = (turmaIndex + 1) % turmasIds.length;

    data.users.push({
      code,
      name: `Participante ${code}`,
      role: "participant",
      turmaId,
      isPresenter: false
    });
  }

  initialized = true;

  res.json({
    ok: true,
    message: "Setup inicial criado a partir do arquivo PITCH.xlsx.",
    totalUsers: data.users.length,
    apresentadores: presentersFromExcel.length,
    participantesApenas: 5
  });
});

// ==========================
// Login
// ==========================

app.post("/login", (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ ok: false, message: "Código é obrigatório." });
  }

  const user = findUserByCode(code);
  if (!user) {
    return res.status(404).json({ ok: false, message: "Código não encontrado." });
  }

  res.json({
    ok: true,
    user: {
      code: user.code,
      name: user.name,
      role: user.role,
      turmaId: user.turmaId,
      isPresenter: user.isPresenter
    }
  });
});

// ==========================
// Rotas PARTICIPANTE
// ==========================

// Turmas + apresentadores
app.get("/api/turmas-com-apresentadores", (req, res) => {
  const turmas = data.turmas.map(t => {
    const apresentadores = data.users
      .filter(u => u.role === "participant" && u.isPresenter && u.turmaId === t.id)
      .map(u => ({
        code: u.code,
        name: u.name,
        turmaId: u.turmaId
      }));

    return { ...t, apresentadores };
  });

  res.json({ ok: true, turmas });
});

// Perguntas + tópicos de um apresentador
app.get("/api/apresentador/:code/perguntas", (req, res) => {
  const { code } = req.params;
  const user = findUserByCode(code);
  if (!user || !user.isPresenter) {
    return res.status(404).json({ ok: false, message: "Apresentador não encontrado." });
  }

  const itens = getPerguntasETopicos(code);
  res.json({
    ok: true,
    apresentador: { code: user.code, name: user.name, turmaId: user.turmaId },
    perguntas: itens
  });
});

// Voto 1–5 em um tópico
app.post("/api/votos", (req, res) => {
  const { userCode, topicoId, nota } = req.body;

  if (!userCode || !topicoId || typeof nota === "undefined") {
    return res.status(400).json({ ok: false, message: "Campos obrigatórios: userCode, topicoId, nota." });
  }

  const user = findUserByCode(userCode);
  if (!user) {
    return res.status(400).json({ ok: false, message: "Usuário inválido." });
  }

  const topico = data.topicos.find(t => t.id === String(topicoId));
  if (!topico) {
    return res.status(404).json({ ok: false, message: "Tópico não encontrado." });
  }

  const notaNum = Number(nota);
  if (notaNum < 1 || notaNum > 5) {
    return res.status(400).json({ ok: false, message: "Nota deve ser entre 1 e 5." });
  }

  // Não pode votar no próprio tópico
  if (topico.apresentadorCode === user.code) {
    return res.status(403).json({ ok: false, message: "Você não pode votar nos seus próprios tópicos." });
  }

  // 1 voto por tópico por pessoa (mas pode atualizar)
  const votoExistente = data.votos.find(v => v.userCode === user.code && v.topicoId === topico.id);
  if (votoExistente) {
    votoExistente.nota = notaNum;
  } else {
    data.votos.push({
      userCode: user.code,
      topicoId: topico.id,
      nota: notaNum
    });
  }

  res.json({ ok: true, message: "Voto registrado com sucesso." });
});

// Tópicos de uma turma para votação de estrelas + status do usuário
app.get("/api/turma/:turmaId/topicos-estrelas", (req, res) => {
  const { turmaId } = req.params;
  const { userCode } = req.query;

  const user = findUserByCode(userCode);
  if (!user) {
    return res.status(400).json({ ok: false, message: "Usuário inválido." });
  }

  const turma = getTurmaById(turmaId);
  if (!turma) {
    return res.status(404).json({ ok: false, message: "Turma não encontrada." });
  }

  const topicosTurma = data.topicos.filter(t => t.turmaId === turmaId);

  const estrelasUserTurma = data.estrelas.filter(e => e.userCode === user.code && e.turmaId === turmaId);
  const usados = estrelasUserTurma.length;
  const maximo = 5;

  const topicosDetalhe = topicosTurma.map(t => {
    const apresentador = findUserByCode(t.apresentadorCode);
    const jaVotou = estrelasUserTurma.some(e => e.topicoId === t.id);
    const proprioTopico = t.apresentadorCode === user.code;
    const podeVotar = !jaVotou && !proprioTopico && usados < maximo;

    return {
      id: t.id,
      texto: t.texto,
      apresentadorNome: apresentador ? apresentador.name : "Desconhecido",
      jaVotou,
      proprioTopico,
      podeVotar
    };
  });

  res.json({
    ok: true,
    turma: { id: turma.id, name: turma.name },
    estrelas: {
      usadas,
      maximo
    },
    topicos: topicosDetalhe
  });
});

// Dar estrela
app.post("/api/estrelas", (req, res) => {
  const { userCode, turmaId, topicoId } = req.body;

  if (!userCode || !turmaId || !topicoId) {
    return res.status(400).json({ ok: false, message: "Campos obrigatórios: userCode, turmaId, topicoId." });
  }

  const user = findUserByCode(userCode);
  if (!user) {
    return res.status(400).json({ ok: false, message: "Usuário inválido." });
  }

  const turma = getTurmaById(turmaId);
  if (!turma) {
    return res.status(404).json({ ok: false, message: "Turma não encontrada." });
  }

  const topico = data.topicos.find(t => t.id === String(topicoId));
  if (!topico || topico.turmaId !== String(turmaId)) {
    return res.status(404).json({ ok: false, message: "Tópico não encontrado nesta turma." });
  }

  // Não pode votar no próprio tópico
  if (topico.apresentadorCode === user.code) {
    return res.status(403).json({ ok: false, message: "Você não pode dar estrela nos seus próprios tópicos." });
  }

  // Máximo 5 estrelas por turma por pessoa
  const estrelasUserTurma = data.estrelas.filter(e => e.userCode === user.code && e.turmaId === String(turmaId));
  if (estrelasUserTurma.length >= 5) {
    return res.status(403).json({ ok: false, message: "Você já usou todas as 5 estrelas nesta turma." });
  }

  // Apenas 1 estrela por tópico por pessoa
  const jaDeuEstrela = data.estrelas.some(e => e.userCode === user.code && e.topicoId === topico.id);
  if (jaDeuEstrela) {
    return res.status(403).json({ ok: false, message: "Você já deu estrela neste tópico." });
  }

  data.estrelas.push({
    userCode: user.code,
    turmaId: String(turmaId),
    topicoId: topico.id
  });

  res.json({ ok: true, message: "Estrela registrada com sucesso." });
});

// ==========================
// Rotas ADMIN
// ==========================

// Lista apresentadores (para selects do painel)
app.get("/api/admin/apresentadores", (req, res) => {
  const lista = data.users
    .filter(u => u.code !== "100")
    .map(u => ({
      code: u.code,
      name: u.name,
      turmaId: u.turmaId,
      isPresenter: u.isPresenter
    }));

  res.json({ ok: true, apresentadores: lista, turmas: data.turmas });
});

// Carregar perguntas & tópicos de um apresentador
app.get("/api/admin/conteudo", (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ ok: false, message: "Código do apresentador é obrigatório." });
  }

  const user = findUserByCode(code);
  if (!user) {
    return res.status(404).json({ ok: false, message: "Apresentador não encontrado." });
  }

  const perguntas = getPerguntasETopicos(code);
  res.json({
    ok: true,
    apresentador: { code: user.code, name: user.name, turmaId: user.turmaId },
    perguntas
  });
});

// Salvar perguntas (substitui as antigas e recria tópicos fictícios)
app.post("/api/admin/perguntas", (req, res) => {
  const { apresentadorCode, perguntasText } = req.body;

  const user = findUserByCode(apresentadorCode);
  if (!user) {
    return res.status(404).json({ ok: false, message: "Apresentador não encontrado." });
  }
  if (!user.turmaId) {
    return res.status(400).json({ ok: false, message: "Apresentador sem turma definida." });
  }

  const linhas = (perguntasText || "")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .slice(0, 3);

  // Apaga perguntas antigas + tópicos delas
  const perguntasAntigas = data.perguntas.filter(p => p.apresentadorCode === user.code);
  const idsPerguntasAntigas = perguntasAntigas.map(p => p.id);

  data.perguntas = data.perguntas.filter(p => p.apresentadorCode !== user.code);
  data.topicos = data.topicos.filter(t => !idsPerguntasAntigas.includes(t.perguntaId));

  // Cria novas perguntas e 3 tópicos fictícios para cada
  let ordem = 1;
  for (const texto of linhas) {
    const pergunta = createPergunta(user.turmaId, user.code, texto, ordem++);
    for (let i = 1; i <= 3; i++) {
      createTopico(pergunta, `Tópico ${pergunta.ordem}.${i} – ${user.name}`);
    }
  }

  res.json({ ok: true, message: "Perguntas e tópicos fictícios atualizados com sucesso." });
});

// Adicionar novo tópico manual em uma pergunta
app.post("/api/admin/topicos", (req, res) => {
  const { perguntaId, texto } = req.body;

  if (!perguntaId || !texto) {
    return res.status(400).json({ ok: false, message: "perguntaId e texto são obrigatórios." });
  }

  const pergunta = data.perguntas.find(p => p.id === String(perguntaId));
  if (!pergunta) {
    return res.status(404).json({ ok: false, message: "Pergunta não encontrada." });
  }

  const topico = createTopico(pergunta, texto.trim());
  res.json({ ok: true, message: "Tópico criado com sucesso.", topico });
});

// Relatório por turma (ranking)
app.get("/api/admin/relatorio", (req, res) => {
  const { turmaId } = req.query;

  if (!turmaId) {
    return res.status(400).json({ ok: false, message: "turmaId é obrigatório." });
  }

  const turma = getTurmaById(turmaId);
  if (!turma) {
    return res.status(404).json({ ok: false, message: "Turma não encontrada." });
  }

  const topicosTurma = data.topicos.filter(t => t.turmaId === String(turmaId));

  const estatisticas = topicosTurma.map(t => {
    const votosTopico = data.votos.filter(v => v.topicoId === t.id);
    const estrelasTopico = data.estrelas.filter(e => e.topicoId === t.id);

    const somaNotas = votosTopico.reduce((acc, v) => acc + v.nota, 0);
    const qtdVotos = votosTopico.length;
    const media = qtdVotos > 0 ? somaNotas / qtdVotos : 0;

    const apresentador = findUserByCode(t.apresentadorCode);

    return {
      topicoId: t.id,
      texto: t.texto,
      apresentadorNome: apresentador ? apresentador.name : "Desconhecido",
      media,
      qtdVotos,
      totalEstrelas: estrelasTopico.length
    };
  });

  const rankingNotas = [...estatisticas].sort((a, b) => b.media - a.media);
  const rankingEstrelas = [...estatisticas].sort((a, b) => b.totalEstrelas - a.totalEstrelas);

  res.json({
    ok: true,
    turma: { id: turma.id, name: turma.name },
    rankingNotas,
    rankingEstrelas
  });
});

// Exportar JSON completo
app.get("/api/admin/export-json", (req, res) => {
  const exportObj = {
    users: data.users,
    turmas: data.turmas,
    perguntas: data.perguntas,
    topicos: data.topicos,
    votos: data.votos,
    estrelas: data.estrelas
  };

  res.setHeader("Content-Disposition", 'attachment; filename="dados-votacao.json"');
  res.json(exportObj);
});

// ==========================
// Inicialização
// ==========================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log("Lembre-se de chamar POST /setup-default uma vez para preencher os dados iniciais.");
});
