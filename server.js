const express = require("express");
const path = require("path");
const xlsx = require("xlsx");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const DATA_FILE = path.join(__dirname, "dados.json");

// ==========================
// Estado em memória + controle
// ==========================

let data;
let nextPerguntaId = 1;
let nextTopicoId = 1;
let initialized = false;

// Sempre que precisarmos montar tudo do zero
function resetInMemoryData() {
  data = {
    users: [], // {code, name, role, turmaId, isPresenter, blockedPresenterCodes?}
    turmas: [
      { id: "M", name: "Manhã" }, // períodos 1+2
      { id: "T", name: "Tarde" }, // períodos 3+4
    ],
    perguntas: [], // {id, turmaId, apresentadorCode, texto, ordem}
    topicos: [],   // {id, perguntaId, turmaId, apresentadorCode, texto}
    votos: [],     // {userCode, topicoId, nota}
    estrelas: []   // {userCode, turmaId, topicoId}
  };
  nextPerguntaId = 1;
  nextTopicoId = 1;
}

// ==========================
// Persistência em arquivo
// ==========================

function saveDataToDisk() {
  try {
    const payload = {
      data,
      nextPerguntaId,
      nextTopicoId
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), "utf-8");
  } catch (err) {
    console.error("Erro ao salvar dados em disco:", err.message);
  }
}

function loadDataFromDisk() {
  try {
    if (!fs.existsSync(DATA_FILE)) return false;
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.data) return false;
    data = parsed.data;
    nextPerguntaId = parsed.nextPerguntaId || 1;
    nextTopicoId = parsed.nextTopicoId || 1;
    console.log("Dados carregados de dados.json.");
    return true;
  } catch (err) {
    console.error("Erro ao carregar dados de disco:", err.message);
    return false;
  }
}

// ==========================
// Funções auxiliares gerais
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
// Normalização + tópicos customizados
// ==========================

function normalizeName(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

// Mapa: apresentador normalizado => { numeroPergunta: [tópicos] }
const customTopicsByPresenter = {
  thaynara: {
    1: [
      "1.1.1 – Aquisição no CEU",
      "1.1.2 – Novas jornadas para o público do onboarding"
    ],
    2: ["1.2.1 – Comitê entre Backoffice Corporativo e Jurídico"],
    3: ["1.3.1 – Plataformas de teste para portais e aplicativo"]
  },
  ursula: {
    1: [
      "2.1.1 – Inserir I.A no Processo seletivo",
      "2.1.2 – Gestão de desempenho",
      "2.1.3 – Ambiente GD+",
      "2.1.4 – Desenvolvimento contínuo",
      "2.1.5 – Comunicação interna"
    ],
    2: [
      "2.2.1 – Tempo de Recrutamento e seleção",
      "2.2.2 – Retenção de talentos"
    ],
    3: ["2.3.1 – Employer branding"]
  },
  bataiel: {
    1: [
      "3.1.1 – Programa de Originação Integrado",
      "3.1.2 – Monitoramento de Mercado",
      "3.1.3 – Derivação para Intermediários",
      "3.1.4 – Expansão: Balcão e Derivativos"
    ],
    2: [
      "3.2.1 – Blindagem e Verificação de User",
      "3.2.2 – Sistematização do Loyalty"
    ],
    3: [
      "3.3.1 – ID Único de Localidade",
      "3.3.2 – Novos Players Estratégicos"
    ]
  },
  bordin: {
    1: [
      "4.1.1 – Hack comportamental/Notificações Inteligentes",
      "4.1.2 – Ambiente Corporate -> Casa do cliente",
      "4.1.3 – Cardápio mais completo possível",
      "4.1.4 – FOMO ao usuário"
    ],
    2: [
      "4.2.1 – Primeira Impressão Fatal",
      "4.2.2 – Loyalty"
    ],
    3: [
      "4.3.1 – Presença de marca mais forte",
      "4.3.2 – + Tradings Compradoras"
    ]
  },
  helen: {
    1: [
      "5.1.1 – Gameficação de incentivos em níveis",
      "5.1.2 – Programa de indicação da Grão Direto",
      "5.1.3 – Programa Coalizão",
      "5.1.4 – Mais pontos, mais tempo, mais valor agregado"
    ],
    2: [
      "5.2.1 – Risco de Passivo Financeiro",
      "5.2.2 – Risco reputacional e fraudes",
      "5.2.3 – Relacionamento com a trading",
      "5.2.4 – Programas demais, engajamento de menos"
    ],
    3: [
      "5.3.1 – Publicidade e relacionamento com o produtor",
      "5.3.2 – GrainInsights -> “Conquer do agro”"
    ]
  },
  renan: {
    1: [
      "6.1.1 – Explorar 100% do potencial do comercial biônico",
      "6.1.2 – Ser o vigia de mercado do nosso vendedor",
      "6.1.3 – Produtos da GD como alavanca para SF (e vice-versa)",
      "6.1.4 – Transformar o marketing de produto em motor de crescimento"
    ],
    2: [
      "6.2.1 – Explorar 100% do potencial do comercial biônico",
      "6.2.2 – Ser o vigia de mercado do nosso vendedor",
      "6.2.3 – Produtos da GD como alavanca para SF (e vice-versa)",
      "6.2.4 – Transformar o marketing de produto em motor de crescimento"
    ],
    3: [
      "6.3.1 – Inteligência Comercial Unificada",
      "6.3.2 – Explorar outras fontes de liquidez para os grãos",
      "6.3.3 – Ser verdadeiramente Data Driven"
    ]
  },
  mari: {
    1: [
      "7.1.1 – Compliance by design",
      "7.1.2 – Projeto “Commit no código (de conduta)”"
    ],
    2: ["7.2.1 – Comunicação"],
    3: ["7.3.1 – Expansão das parcerias"]
  },
  thiagoemario: {
    1: [
      "8.1.1 – Cenário atual",
      "8.1.2 – Score de Risco GD",
      "8.1.3 – Por que implementar isso?"
    ],
    2: ["8.2.1 – Ações para 2026"],
    3: ["8.3.1 – Programa de Incentivo à Redução de Custos com Ferramentas"]
  },
  humbertoedanyllo: {
    1: [
      "9.1.1 – Criarmos o GD Global Agro Credit",
      "9.1.2 – Buscar melhores sacados em outros setores",
      "9.1.3 – Captação agressiva de cerealistas e sacados",
      "9.1.4 – Inteligência de abordagem, processo e conversas escaláveis para envolvimento de parceiros"
    ],
    2: [
      "9.2.1 – Fundo forte, originação fraca",
      "9.2.2 – Risco de decisões abruptas"
    ],
    3: [
      "9.3.1 – Liquidez como impulso da experiência digital e do crédito",
      "9.3.2 – Narrativa institucional clara e unificada",
      "9.3.3 – Armazéns estratégicos Grão Direto"
    ]
  },
  boffeebruninha: {
    1: [
      "10.1.1 – Reforma Tributária",
      "10.1.2 – Tesouraria Estratégica",
      "10.1.3 – AgFintech"
    ],
    2: [
      "10.2.2 – Risco de Concentração da Carteira"
    ],
    3: [
      "10.3.1 – Exposição da Marca GD"
    ]
  },
  julieneeanaluiza: {
    1: [
      "11.1.1 – Plataforma de Inteligência de Marca (PIM)",
      "11.1.2 – Loyalty atuando com a lógica de \"cupons\" para engajamento",
      "11.1.3 – Embaixador Sou Brasil, Sou Agro",
      "11.1.4 – Co-branding no Agro"
    ],
    2: [
      "11.2.1 – De \"Evento Bonito\" para \"Máquina de Negócios\""
    ],
    3: [
      "11.3.1 – Implementar Calculadora de Custo de produção",
      "11.3.2 – Implementar Viés de Ancoragem de Preços",
      "11.3.3 – Criar um Programa de Sucessão Familiar"
    ]
  },
  albertleo: {
    1: [
      "12.1.1 – Integração entre canais de mídia via servidor (S2S)",
      "12.1.2 – Novo modelo de atribuição: Marketing Mix Modeling"
    ],
    2: [
      "12.2.1 – Exige engenharia, governança e ambiente de testes.",
      "12.2.2 – Experiência fluida"
    ],
    3: [
      "12.3.1 – “Barter 24H” com cotação em tempo real"
    ]
  },
  kaneko: {
    1: [
      "13.1.1 – Conhecer o Value Stream da empresa",
      "13.1.2 – Facilitar uma gestão interna"
    ],
    2: [
      "13.2.1 – Não perdermos o time da coisa"
    ],
    3: [
      "13.3.1 – Especializar pessoas",
      "13.3.2 – Zelarmos pela nossa cultura"
    ]
  },
  cici: {
    1: [
      "14.1.1 – Jornada WPP completa e com uma alta retenção",
      "14.1.2 – Mais dados para personalização"
    ],
    2: [
      "14.2.1 – Funil não orgânico (muita dependência de Twilio)",
      "14.2.2 – Teto CEU/CENG quase sendo atingido"
    ],
    3: [
      "14.3.1 – Elevar o patamar de Loyalty",
      "14.3.2 – Aumentar as “Super Transações”"
    ]
  },
  joyce: {
    1: [
      "15.1.1 – Fortalecer nossos elos",
      "15.1.2 – Decidir com menos achismo e mais dados"
    ],
    2: [
      "15.2.1 – Tolerância prolongada a baixo desempenho",
      "15.2.2 – Cenário recorrente de metas de Tech não batidas"
    ],
    3: [
      "15.3.1 – Reter talentos",
      "15.3.2 – Acompanhar as lideranças"
    ]
  },
  lacerda: {
    1: [
      "16.1.1 – Execução Forte e Rituais Consistentes",
      "16.1.2 – Inteligência Comercial (evolução do Top Picks + AIrton)",
      "16.1.3 – Transformar Riscos em Oportunidades de Crescimento",
      "16.1.4 – Avançarmos..."
    ],
    2: [
      "16.2.1 – AMAGGI – Risco de “formalização” e dependência de incentivos",
      "16.2.2 – ADM - Crescimento do pré-hedge e by-pass",
      "16.2.3 – CARGILL - Risco de “volume” apenas para atingir a meta de 1,25 Mt (Warrants)",
      "16.2.4 – LDC - Risco de termos o “carimbo” como canal exclusivamente transacional"
    ],
    3: [
      "16.3.1 – Dados",
      "16.3.2 – Backoffice + Engajamento",
      "16.3.3 – Loyalty/Marketing",
      "16.3.4 – Gestão de pessoas"
    ]
  },
  murilo: {
    1: [
      "17.1.1 – Gastaremos R$ 133.701,60 migrando nossa arquitetura de Cloud para ARM.",
      "17.1.2 – Automatização do quarterly report.",
      "17.1.3 – Novo ecossistema de Dados."
    ],
    2: [
      "17.2.1 – Vazamento de Dados por AI.",
      "17.2.2 – Modelo de negócio dos produtos de AI e custos de token."
    ],
    3: [
      "17.3.1 – Biônico como upselling para o Clicou, Fechou."
    ]
  },
  thiagomeller: {
    1: [
      "18.1.1 – Distribuirmos seguros através da plataforma",
      "18.1.2 – Estabelecermos parceria com consultoria estratégica"
    ],
    2: [
      "18.2.1 – Atrairmos o sistema cooperativo para além da venda",
      "18.2.2 – Criarmos uma solução de hedge"
    ],
    3: [
      "18.3.1 – Turbinar Grainsights + copiloto AIrton",
      "18.3.2 – Academia GD ou Parcerias com Inst. de Ensino"
    ]
  },
  aline: {
    1: [
      "19.1.1 – Modelo integrado entre CF + Barter + Backoffice",
      "19.1.2 – Preparar o Backoffice para escalar",
      "19.1.3 – Infraestrutura escalável e time conectado"
    ],
    2: [
      "19.2.1 – Projetos vendidos top-down sem envolver os stakeholders operacionais",
      "19.2.2 – Processos pouco padronizados podem gerar dificuldades de escala"
    ],
    3: [
      "19.3.1 – Fortalecer e acelerar Serviços Financeiros e Inteligência Artificial",
      "19.3.2 – Cross-sell estruturado",
      "19.3.3 – Expandir portfólio de commodities"
    ]
  },
  markimnabuco: {
    1: [
      "20.1.1 – Dados como estimulo do momento de negociar",
      "20.1.2 – AIrton como canal prioritário e unificado das comunicações com",
      "20.1.3 – Impulsionar conexões ambiente GD através do AIrton",
      "20.1.4 – Biônico como maior fonte de dados GD",
      "20.1.5 – Biônico proativo e reativo resolvendo dores reais"
    ],
    2: [
      "20.2.1 – Dependência dos modelos de IA (LLMs)",
      "20.2.2 – Má visão externas de soluções de IA",
      "20.2.3 – Jornadas conversacionais são diferente de tudo e ainda não sabemos fazer",
      "20.2.4 – Escolhas não estratégicas e prioritárias"
    ],
    3: [
      "20.3.1 – Maior interação entre IA e jornadas dos demais times",
      "20.3.2 – Unificação e centralização de dados de usuários de toda GD",
      "20.3.3 – Geração de conteúdo sobre contexto de mercado"
    ]
  },
  viniciusemmanuel: {
    1: [
      "21.1.1 – Engenharia Orientada a Hipóteses",
      "21.1.2 – Excelência na Execução (Pós-Planning)",
      "21.1.3 – Ecossistema Conectado (API First)"
    ],
    3: [
      "21.3.1 – Pessoa de produto para o time financeiro"
    ]
  },
  mazetto: {
    1: [
      "22.1.1 – Projetos de Alto Valor",
      "22.1.2 – Projetos de Alto Valor -> Gestão de Contratos",
      "22.1.3 – Escalabilidade -> ICP: empresas de porte médio"
    ],
    2: [
      "22.2.1 – Projetos de Alto Valor",
      "22.2.2 – Escalabilidade -> ICP: empresas de porte médio"
    ],
    3: [
      "22.3.1 – Barter de tudo e de todas as formas possíveis"
    ]
  },
  matheusreis: {
    1: [
      "23.1.1 – Otimizar créditos não performados",
      "23.1.2 – Aumentar capacidade comercial de produtos performados"
    ],
    2: [
      "23.2.1 – Otimizar créditos não performados",
      "23.2.2 – Aumentar capacidade comercial de produtos performados"
    ],
    3: [
      "23.3.1 – Desenvolvermos uma rede de compra e venda de HF (alho, cenoura, cebola e batata)",
      "23.3.2 – Criarmos CF de Cana de Açucar e Café"
    ]
  },
  seba: {
    1: [
      "24.1.1 – 30 novas empresas (20-50k ton ano cada uma)",
      "24.1.2 – Crescimento nas empresas de grande volume",
      "24.1.3 – Novas empresas de grande volume",
      "24.1.4 – Produto básico com custo de implementação R$0,00."
    ],
    2: [
      "24.2.1 – Necessidade de crédito para negociações se realizarem.",
      "24.2.2 – Liquidez não real dos grãos",
      "24.2.3 – Produto não escalável para 50 empresas",
      "24.2.4 – Time de Operações não escalável"
    ],
    3: [
      "24.3.1 – Criarmos um CF de Algodão e café",
      "24.3.2 – Voltar a ser obcecados pela experiência dos usuários ativos",
      "24.3.3 – Expansão territorial",
      "24.3.4 – Somos muito bons dentro de casa, mas externamente não falamos nada"
    ]
  },
  gabrielenaves: {
    1: [
      "25.1.1 – Grainsights como referência"
    ],
    2: [
      "25.2.1 – Quantidade x Qualidade"
    ],
    3: [
      "25.3.1 – Solução ERP T.E.R.R.A"
    ]
  }
};

function getCustomTopicsForPresenter(nomeApresentador, ordemPergunta) {
  const key = normalizeName(nomeApresentador);
  const mapa = customTopicsByPresenter[key];
  if (!mapa) return null;
  return mapa[ordemPergunta] || null;
}

// ==========================
// Ler PITCH.xlsx
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

      if (col0Str.toUpperCase().startsWith("PERIODO")) {
        const parts = col0Str.split(/\s+/);
        const num = parseInt(parts[1], 10);
        if (!isNaN(num)) currentPeriodo = num;
        return;
      }

      if (col0Str.toLowerCase() === "apresentador") return;

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
// Amarrar votantes -> apresentadores
// ==========================

function linkVotersToPresenters() {
  const presenters = data.users.filter(u => u.isPresenter);
  const voters = data.users.filter(u => u.role === "participant" && !u.isPresenter);

  // zera qualquer mapeamento anterior
  voters.forEach(v => {
    v.blockedPresenterCodes = [];
  });

  presenters.forEach(p => {
    const pNorm = normalizeName(p.name);
    voters.forEach(v => {
      const vNorm = normalizeName(v.name);
      if (!vNorm) return;
      // Se o nome da pessoa estiver contido no nome do apresentador (ou vice-versa), bloqueia
      if (pNorm.includes(vNorm) || vNorm.includes(pNorm)) {
        if (!Array.isArray(v.blockedPresenterCodes)) {
          v.blockedPresenterCodes = [];
        }
        if (!v.blockedPresenterCodes.includes(p.code)) {
          v.blockedPresenterCodes.push(p.code);
        }
      }
    });
  });

  console.log("Mapeamento votante -> apresentador (bloqueio de auto-voto) atualizado.");
}

// ==========================
// Popular dados pela primeira vez
// ==========================

function populateFromExcelAndStatic() {
  // Admin
  data.users.push({
    code: "100",
    name: "Elias",
    role: "admin",
    turmaId: null,
    isPresenter: false,
    blockedPresenterCodes: []
  });

  // Apresentadores a partir da planilha
  const presentersFromExcel = loadPresentersFromExcel();
  let presenterCodeCounter = 1000;

  presentersFromExcel.forEach(p => {
    const nome = p.nome || "";
    const tema = p.tema || "";
    const periodo = Number(p.periodo) || 1;

    const turmaId = (periodo === 1 || periodo === 2) ? "M" : "T";

    const code = String(presenterCodeCounter++);

    data.users.push({
      code,
      name: nome,
      role: "participant",
      turmaId,
      isPresenter: true,
      blockedPresenterCodes: [] // não usado para apresentador
    });

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

      const customTopics = getCustomTopicsForPresenter(nome, ordem);
      if (customTopics && customTopics.length > 0) {
        customTopics.forEach(tTexto => createTopico(pergunta, tTexto));
      } else {
        // fallback genérico se faltar algo no mapa
        for (let i = 1; i <= 3; i++) {
          const baseLabel = `Tópico ${ordem}.${i}`;
          const detalhe = tema ? ` – ${tema}` : ` – ${nome}`;
          createTopico(pergunta, baseLabel + detalhe);
        }
      }
    });
  });

  // Votantes fixos
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
      turmaId: null,
      isPresenter: false,
      blockedPresenterCodes: []
    });
  });

  linkVotersToPresenters();
}

// ==========================
// Inicialização
// ==========================

function initializeData() {
  if (initialized) return;

  if (loadDataFromDisk()) {
    // Garante que o campo blockedPresenterCodes exista e esteja correto
    linkVotersToPresenters();
    initialized = true;
    return;
  }

  resetInMemoryData();
  populateFromExcelAndStatic();
  saveDataToDisk();
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

// Voto em tópico
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
  const isLeader = leadersCodes.includes(String(user.code));
  const maxNota = isLeader ? 10 : 5;

  if (notaNum < 1 || notaNum > maxNota) {
    return res.status(400).json({
      ok: false,
      message: `Nota deve ser entre 1 e ${maxNota}.`
    });
  }

  const blockedList = Array.isArray(user.blockedPresenterCodes) ? user.blockedPresenterCodes : [];
  const isOwnerByMapping = blockedList.includes(topico.apresentadorCode);

  if (topico.apresentadorCode === user.code || isOwnerByMapping) {
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

  saveDataToDisk();
  res.json({ ok: true, message: "Voto registrado com sucesso." });
});

// Tópicos para estrelas
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
    const blockedList = Array.isArray(user.blockedPresenterCodes) ? user.blockedPresenterCodes : [];

    const topicosDetalhe = topicosTurma.map(t => {
      const apresentador = findUserByCode(t.apresentadorCode);
      const jaVotou = estrelasUserTurma.some(e => e.topicoId === t.id);
      const isOwnerByMapping = blockedList.includes(t.apresentadorCode);
      const proprioTopico = (t.apresentadorCode === user.code) || isOwnerByMapping;
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

    const blockedList = Array.isArray(user.blockedPresenterCodes) ? user.blockedPresenterCodes : [];
    const isOwnerByMapping = blockedList.includes(topico.apresentadorCode);

    if (topico.apresentadorCode === user.code || isOwnerByMapping) {
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

    saveDataToDisk();
    res.json({ ok: true, message: "Estrela registrada com sucesso." });
  } catch (err) {
    console.error("Erro em /api/estrelas:", err);
    res.status(500).json({ ok: false, message: "Erro ao registrar estrela." });
  }
});

// ==========================
// Rotas ADMIN
// ==========================

// Lista apresentadores
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

// Conteúdo de apresentador
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

// Salvar perguntas (mantive igual: gera tópicos fictícios)
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

  saveDataToDisk();
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
  saveDataToDisk();
  res.json({ ok: true, message: "Tópico criado com sucesso.", topico });
});

// Editar tópico
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
  saveDataToDisk();
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
  saveDataToDisk();
  res.json({ ok: true, message: "Tópico apagado com sucesso." });
});

// Relatório
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

// Export JSON completo
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

// Export Excel completo
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
// ROTA DE RESET (zera tudo)
// ==========================

app.post("/api/admin/reset", (req, res) => {
  try {
    resetInMemoryData();
    populateFromExcelAndStatic();
    saveDataToDisk();
    res.json({ ok: true, message: "Dados resetados com sucesso (perguntas, tópicos, votos e estrelas)." });
  } catch (err) {
    console.error("Erro em /api/admin/reset:", err);
    res.status(500).json({ ok: false, message: "Erro ao resetar dados." });
  }
});

// ==========================
// Rotas de páginas
// ==========================

app.get("/estrelas.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "estrelas.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
