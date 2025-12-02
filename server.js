const express = require("express");
const path = require("path");
const xlsx = require("xlsx");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ==========================
// "Banco de dados" em memória
// ==========================

let initialized = false;

const data = {
  users: [], // {code, name, role, turmaId, isPresenter}
  // Agora só 2 turmas visíveis: Manhã (períodos 1+2) e Tarde (3+4)
  turmas: [
    { id: "M", name: "Manhã" },
    { id: "T", name: "Tarde" },
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
// Ler PITCH.xlsx (grupos/apresentadores)
// ==========================

function loadPresentersFromExcel() {
  try {
    const filePath = path.join(__dirname, "PITCH.xlsx");
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    const presenters = [];
    let currentPeriodo = 1;

    rows.forEach((row) => {
      const col0 = row[0];
      const col1 = row[1];
      const col2 = row[2];
      const col3 = row[3];
      const col4 = row[4];

      if (!col0 || String(col0).trim() === "") return;

      const col0Str = String(col0).trim();

      // Linhas tipo "PERIODO 1", "PERIODO 2"...
      if (col0Str.toUpperCase().startsWith("PERIODO")) {
        const parts = col0Str.split(/\s+/);
        const num = parseInt(parts[1], 10);
        if (!isNaN(num)) currentPeriodo = num;
        return;
      }

      // Cabeçalho da tabela
      if (col0Str.toLowerCase() === "apresentador") {
        return;
      }

      const perguntas = [col2, col3, col4]
        .map(q => (q ? String(q).trim() : ""))
        .filter(q => q.length > 0)
        .slice(0, 3);

      presenters.push({
        nome: col0Str,                                      // pode ser "Thiago e Mario", etc.
        tema: col1 ? String(col1).trim() : "",
        periodo: currentPeriodo || 1,                       // 1,2,3,4
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
// Inicializar dados na subida do servidor
// ==========================

function initializeData() {
  if (initialized) return;
  console.log("Inicializando dados...");

  // Admin
  data.users.push({
    code: "100",
    name: "Elias",
    role: "admin",
    turmaId: null,
    isPresenter: false
  });

  // 1) Carregar apresentadores (grupos) da PITCH.xlsx
  const presentersFromExcel = loadPresentersFromExcel();

  let presenterCodeCounter = 1000; // códigos internos só para apresentadores

  presentersFromExcel.forEach(p => {
    const nome = p.nome || "";
    const tema = p.tema || "";
    const periodo = Number(p.periodo) || 1;

    // Mapear período 1/2 → Manhã (M), 3/4 → Tarde (T)
    const turmaId =
      periodo === 1 || periodo === 2
        ? "M"
        : "T";

    // criar usuário interno para o apresentador (grupo)
    const code = String(presenterCodeCounter++);

    data.users.push({
      code,
      name: nome,          // ex.: "Thiago e Mario", "Equipe Tal", etc.
      role: "participant", // continua participant
      turmaId,
      isPresenter: true
    });

    // Perguntas (da planilha ou genéricas)
    const perguntas = (p.perguntas && p.perguntas.length
      ? p.perguntas
      : [
          `Pergunta 1 de ${nome}`,
          `Pergunta 2 de ${nome}`,
          `Pergunta 3 de ${nome}`
        ]
    ).slice(0, 3);

    perguntas.forEach((textoPergunta, idx) => {
      const ordem = idx + 1;
      const pergunta = createPergunta(turmaId, code, textoPergunta, ordem);

      // Tópicos fictícios iniciais
      for (let i = 1; i <= 3; i++) {
        const baseLabel = `Tópico ${ordem}.${i}`;
        const detalhe = tema ? ` – ${tema}` : ` – ${nome}`;
        createTopico(pergunta, baseLabel + detalhe);
      }
    });
  });

  // 2) Códigos fixos de quem vota (1–38) – os que você mandou
  const voters = [
    { code: "1",  name: "Alexandre" },
    { code: "2",  name: "Gabi" },
    { code: "3",  name: "Cadelca" },
    { code: "4",  name: "Léo" },
    { code: "5",  name: "Pedro" },
    { code: "6",  name: "Fred" },
    { code: "7",  name: "Adrielle" },
    { code: "8",  name: "Thaynara" },
    { code: "9",  name: "Ursula" },
    { code: "10", name: "Bataiel" },
    { code: "11", name: "Bordin" },
    { code: "12", name: "Helen" },
    { code: "13", name: "Renan" },
    { code: "14", name: "Mari" },
    { code: "15", name: "Thiago" },
    { code: "16", name: "Mario" },
    { code: "17", name: "Humberto" },
    { code: "18", name: "Danyllo" },
    { code: "19", name: "Boffe" },
    { code: "20", name: "Bruninha" },
    { code: "21", name: "Juliene" },
    { code: "22", name: "Ana Luiza" },
    { code: "23", name: "Albert (Léo)" },
    { code: "24", name: "Kaneko" },
    { code: "25", name: "Cici" },
    { code: "26", name: "Joyce" },
    { code: "27", name: "Lacerda" },
    { code: "28", name: "Murilo" },
    { code: "29", name: "Thiago Meller" },
    { code: "30", name: "Aline" },
    { code: "31", name: "Markim" },
    { code: "32", name: "Nabuco" },
    { code: "33", name: "Vinícius Emmanuel" },
    { code: "34", name: "Mazetto" },
    { code: "35", name: "Matheus Reis" },
    { code: "36", name: "Sebá" },
    { code: "37", name: "Gabriel" },
    { code: "38", name: "Naves" },
  ];

  voters.forEach(v => {
    data.users.push({
      code: v.code,
      name: v.name,
      role: "participant",
      turmaId: null,     // não precisa amarrar turma, ele pode votar em Manhã ou Tarde
      isPresenter: false // esses são apenas votantes (mesmo que apresentem na vida real)
    });
  });

  initialized = true;
  console.log("Inicialização concluída. Usuários totais:", data.users.length);
}

initializeData();

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

// Turmas + apresentadores (Manhã/Tarde)
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

// Voto em um tópico (1–5 ou 1–10 para líderes)
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
  const leadersCodes = ["1", "2", "3", "4", "5", "6"];
  const isLeader = leadersCodes.includes(user.code);
  const maxNota = isLeader ? 10 : 5;

  if (notaNum < 1 || notaNum > maxNota) {
    return res.status(400).json({
      ok: false,
      message: `Nota deve ser entre 1 e ${maxNota}.`
    });
  }

  // Regra antiga de não votar no próprio tópico (aqui só funciona se o código do votante = código interno do apresentador)
  if (topico.apresentadorCode === user.code) {
    return res.status(403).json({ ok: false, message: "Você não pode votar nos seus próprios tópicos." });
  }

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

// Tópicos da turma para estrelas (Manhã/Tarde já vem de topico.turmaId)
app.get("/api/turma/:turmaId/topicos-estrelas", (req, res) => {
  try {
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

    const topicosTurma = data.topicos.filter(t => t.turmaId === String(turmaId));
    const estrelasUserTurma = data.estrelas.filter(e => e.userCode === user.code && e.turmaId === String(turmaId));

    const usadas = estrelasUserTurma.length;
    const maximo = 5;

    const topicosDetalhe = topicosTurma.map(t => {
      const apresentador = findUserByCode(t.apresentadorCode);
      const jaVotou = estrelasUserTurma.some(e => e.topicoId === t.id);
      const proprioTopico = t.apresentadorCode === user.code;
      const podeVotar = !jaVotou && !proprioTopico && usadas < maximo;

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
      estrelas: { usadas, maximo },
      topicos: topicosDetalhe
    });
  } catch (err) {
    console.error("Erro em /api/turma/:turmaId/topicos-estrelas:", err);
    res.status(500).json({ ok: false, message: "Erro ao carregar tópicos para estrelas." });
  }
});

// Dar estrela
app.post("/api/estrelas", (req, res) => {
  try {
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

    if (topico.apresentadorCode === user.code) {
      return res.status(403).json({ ok: false, message: "Você não pode dar estrela nos seus próprios tópicos." });
    }

    const estrelasUserTurma = data.estrelas.filter(e => e.userCode === user.code && e.turmaId === String(turmaId));
    if (estrelasUserTurma.length >= 5) {
      return res.status(403).json({ ok: false, message: "Você já usou todas as 5 estrelas nesta turma." });
    }

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
  } catch (err) {
    console.error("Erro em /api/estrelas:", err);
    res.status(500).json({ ok: false, message: "Erro ao registrar estrela." });
  }
});

// ==========================
// Rotas ADMIN
// ==========================

// Lista apresentadores (só quem é presenter de verdade)
app.get("/api/admin/apresentadores", (req, res) => {
  const lista = data.users
    .filter(u => u.code !== "100" && u.isPresenter)
    .map(u => ({
      code: u.code,
      name: u.name,
      turmaId: u.turmaId,
      isPresenter: u.isPresenter
    }));

  res.json({ ok: true, apresentadores: lista, turmas: data.turmas });
});

// Conteúdo de um apresentador
app.get("/api/admin/conteudo", (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ ok: false, message: "Código do apresentador é obrigatório." });
  }

  const user = findUserByCode(code);
  if (!user || !user.isPresenter) {
    return res.status(404).json({ ok: false, message: "Apresentador não encontrado." });
  }

  const perguntas = getPerguntasETopicos(code);
  res.json({
    ok: true,
    apresentador: { code: user.code, name: user.name, turmaId: user.turmaId },
    perguntas
  });
});

// Salvar perguntas
app.post("/api/admin/perguntas", (req, res) => {
  const { apresentadorCode, perguntasText } = req.body;

  const user = findUserByCode(apresentadorCode);
  if (!user || !user.isPresenter) {
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

  const perguntasAntigas = data.perguntas.filter(p => p.apresentadorCode === user.code);
  const idsPerguntasAntigas = perguntasAntigas.map(p => p.id);

  data.perguntas = data.perguntas.filter(p => p.apresentadorCode !== user.code);
  data.topicos = data.topicos.filter(t => !idsPerguntasAntigas.includes(t.perguntaId));

  let ordem = 1;
  for (const texto of linhas) {
    const pergunta = createPergunta(user.turmaId, user.code, texto, ordem++);
    for (let i = 1; i <= 3; i++) {
      createTopico(pergunta, `Tópico ${pergunta.ordem}.${i} – ${user.name}`);
    }
  }

  res.json({ ok: true, message: "Perguntas e tópicos fictícios atualizados com sucesso." });
});

// Adicionar tópico
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

// Editar tópico existente
app.put("/api/admin/topicos/:id", (req, res) => {
  const { id } = req.params;
  const { texto } = req.body;

  if (!texto) {
    return res.status(400).json({ ok: false, message: "Texto é obrigatório." });
  }

  const topico = data.topicos.find(t => t.id === String(id));
  if (!topico) {
    return res.status(404).json({ ok: false, message: "Tópico não encontrado." });
  }

  topico.texto = texto.trim();
  res.json({ ok: true, message: "Tópico atualizado com sucesso.", topico });
});

// Apagar tópico
app.delete("/api/admin/topicos/:id", (req, res) => {
  const { id } = req.params;
  const indice = data.topicos.findIndex(t => t.id === String(id));
  if (indice === -1) {
    return res.status(404).json({ ok: false, message: "Tópico não encontrado." });
  }
  data.topicos.splice(indice, 1);
  res.json({ ok: true, message: "Tópico apagado com sucesso." });
});

// Relatório por turma (Manhã/Tarde) com votos detalhados
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

    const votosDetalhados = votosTopico.map(v => {
      const u = findUserByCode(v.userCode);
      return {
        userCode: v.userCode,
        userName: u ? u.name : "Desconhecido",
        nota: v.nota
      };
    });

    return {
      topicoId: t.id,
      texto: t.texto,
      apresentadorNome: apresentador ? apresentador.name : "Desconhecido",
      media,
      qtdVotos,
      totalEstrelas: estrelasTopico.length,
      votosDetalhados
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

// Exportar Excel com todas as turmas
app.get("/api/admin/export-excel-completo", (req, res) => {
  try {
    const wb = xlsx.utils.book_new();

    // Sheet 1: Resumo por tópico
    const resumoRows = [];
    data.topicos.forEach(t => {
      const turma = getTurmaById(t.turmaId);
      const apresentador = findUserByCode(t.apresentadorCode);
      const votosTopico = data.votos.filter(v => v.topicoId === t.id);
      const estrelasTopico = data.estrelas.filter(e => e.topicoId === t.id);

      const somaNotas = votosTopico.reduce((acc, v) => acc + v.nota, 0);
      const qtdVotos = votosTopico.length;
      const media = qtdVotos > 0 ? somaNotas / qtdVotos : 0;

      resumoRows.push({
        Turma: turma ? turma.name : "",
        TopicoId: t.id,
        Topico: t.texto,
        Apresentador: apresentador ? apresentador.name : "",
        MediaNotas: media,
        QtdeVotos: qtdVotos,
        TotalEstrelas: estrelasTopico.length
      });
    });
    const wsResumo = xlsx.utils.json_to_sheet(resumoRows);
    xlsx.utils.book_append_sheet(wb, wsResumo, "ResumoTopicos");

    // Sheet 2: Votos detalhados
    const votosRows = [];
    data.votos.forEach(v => {
      const topico = data.topicos.find(t => t.id === v.topicoId);
      if (!topico) return;
      const turma = getTurmaById(topico.turmaId);
      const apresentador = findUserByCode(topico.apresentadorCode);
      const votante = findUserByCode(v.userCode);
      votosRows.push({
        Turma: turma ? turma.name : "",
        TopicoId: topico.id,
        Topico: topico.texto,
        Apresentador: apresentador ? apresentador.name : "",
        VotanteCodigo: v.userCode,
        VotanteNome: votante ? votante.name : "",
        Nota: v.nota
      });
    });
    const wsVotos = xlsx.utils.json_to_sheet(votosRows);
    xlsx.utils.book_append_sheet(wb, wsVotos, "VotosDetalhados");

    // Sheet 3: Estrelas detalhadas
    const estrelasRows = [];
    data.estrelas.forEach(e => {
      const topico = data.topicos.find(t => t.id === e.topicoId);
      if (!topico) return;
      const turma = getTurmaById(topico.turmaId);
      const apresentador = findUserByCode(topico.apresentadorCode);
      const votante = findUserByCode(e.userCode);
      estrelasRows.push({
        Turma: turma ? turma.name : "",
        TopicoId: topico.id,
        Topico: topico.texto,
        Apresentador: apresentador ? apresentador.name : "",
        VotanteCodigo: e.userCode,
        VotanteNome: votante ? votante.name : ""
      });
    });
    const wsEstrelas = xlsx.utils.json_to_sheet(estrelasRows);
    xlsx.utils.book_append_sheet(wb, wsEstrelas, "EstrelasDetalhadas");

    const buffer = xlsx.write(wb, { bookType: "xlsx", type: "buffer" });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="relatorio-votacao-completo.xlsx"'
    );
    res.send(buffer);
  } catch (err) {
    console.error("Erro em /api/admin/export-excel-completo:", err);
    res.status(500).json({ ok: false, message: "Erro ao exportar Excel." });
  }
});

// ==========================
// Rotas de páginas
// ==========================

// Página de estrelas
app.get("/estrelas.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "estrelas.html"));
});

// Página principal
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
