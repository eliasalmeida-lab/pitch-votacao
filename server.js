const express = require("express");
const path = require("path");
const fs = require("fs");
const xlsx = require("xlsx");

const app = express();
const PORT = process.env.PORT || 3000;

const DB_FILE = path.join(__dirname, "db.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ==========================
// "Banco de dados" em memória
// ==========================

let initialized = false;

const data = {
  users: [],   // {code, name, role, turmaId, isPresenter}
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
// Config fixo dos presenters / perguntas / tópicos
// ==========================

const presentersConfig = [
  {
    nome: "Thaynara",
    periodo: 1,
    perguntas: [
      {
        texto: "Como fazer os resultados (qualidade) de sua área TRIPLICAREM?",
        topicos: [
          "Aquisição no CEU",
          "Novas jornadas para o público do onboarding",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "Comitê entre Backoffice Corporativo e Jurídico",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Plataformas de teste para portais e aplicativo",
        ]
      },
    ]
  },
  {
    nome: "Ursula",
    periodo: 1,
    perguntas: [
      {
        texto: "Como TRIPLICAR nossa densidade de talento e performance dos times?",
        topicos: [
          "Inserir I.A no Processo seletivo",
          "Gestão de desempenho",
          "Ambiente GD+",
          "Desenvolvimento contínuo",
          "Comunicação interna",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "Tempo de Recrutamento e seleção",
          "Retenção de talentos",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Employer branding",
        ]
      },
    ]
  },
  {
    nome: "Bataiel",
    periodo: 1,
    perguntas: [
      {
        texto: "Como fazer os resultados de sua área TRIPLICAREM?",
        topicos: [
          "Programa de Originação Integrado",
          "Monitoramento de Mercado",
          "Derivação para Intermediários",
          "Expansão: Balcão e Derivativos",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "Blindagem e Verificação de User",
          "Sistematização do Loyalty",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "ID Único de Localidade",
          "Novos Players Estratégicos",
        ]
      },
    ]
  },
  {
    nome: "Bordin",
    periodo: 1,
    perguntas: [
      {
        texto: "Como fazer os resultados de sua área TRIPLICAREM?",
        topicos: [
          "Hack comportamental / Notificações Inteligentes",
          "Ambiente Corporate → Casa do cliente",
          "Cardápio mais completo possível",
          "FOMO ao usuário",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "Primeira Impressão Fatal",
          "Loyalty",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Presença de marca mais forte",
          "+ Tradings Compradoras",
        ]
      },
    ]
  },
  {
    nome: "Helen",
    periodo: 1,
    perguntas: [
      {
        texto: "Como fazer os resultados de sua área TRIPLICAREM?",
        topicos: [
          "Gameficação de incentivos em níveis",
          "Programa de indicação da Grão Direto",
          "Programa Coalizão",
          "Mais pontos, mais tempo, mais valor agregado",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "Risco de Passivo Financeiro",
          "Risco reputacional e fraudes",
          "Relacionamento com a trading",
          "Programas demais, engajamento de menos",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Publicidade e relacionamento com o produtor",
          "GrainInsights → “Conquer do agro”",
        ]
      },
    ]
  },
  {
    nome: "Renan",
    periodo: 2,
    perguntas: [
      {
        texto: "Quais as prioridades de produto e como faremos para TRIPLICAR os resultados destas prioridades?",
        topicos: [
          "Explorar 100% do potencial do comercial biônico",
          "Ser o vigia de mercado do nosso vendedor",
          "Produtos da GD como alavanca para SF (e vice-versa)",
          "Transformar o marketing de produto em motor de crescimento",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "Explorar 100% do potencial do comercial biônico",
          "Ser o vigia de mercado do nosso vendedor",
          "Produtos da GD como alavanca para SF (e vice-versa)",
          "Transformar o marketing de produto em motor de crescimento",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Inteligência Comercial Unificada",
          "Explorar outras fontes de liquidez para os grãos",
          "Ser verdadeiramente Data Driven",
        ]
      },
    ]
  },
  {
    nome: "Mari",
    periodo: 2,
    perguntas: [
      {
        texto: "Quais os times prioritários ou temas para COMPLIANCE e como faremos para estarmos preparados para triplicar resultados?",
        topicos: [
          "Compliance by design",
          "Projeto “Commit no código (de conduta)”",
        ]
      },
      {
        texto: "O que não pode faltar em 2026?",
        topicos: [
          "Comunicação",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Expansão das parcerias",
        ]
      },
    ]
  },
  {
    nome: "Thiago",
    periodo: 2,
    perguntas: [
      {
        texto: "Quais os times prioritários ou temas para SEGURANÇA e como faremos para estarmos preparados para triplicar resultados?",
        topicos: [
          "Cenário atual",
          "Score de Risco GD",
          "Por que implementar isso?",
        ]
      },
      {
        texto: "O que não pode faltar em 2026?",
        topicos: [
          "Ações para 2026",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Programa de Incentivo à Redução de Custos com Ferramentas",
        ]
      },
    ]
  },
  {
    nome: "Humberto",
    periodo: 2,
    perguntas: [
      {
        texto: "Como fazer os resultados de sua área QUINTUPLICAREM?",
        topicos: [
          "Criarmos o GD Global Agro Credit",
          "Buscar melhores sacados em outros setores",
          "Captação agressiva de cerealistas e sacados",
          "Inteligência de abordagem, processo e conversas escaláveis para envolvimento de parceiros",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "Fundo forte, originação fraca",
          "Risco de decisões abruptas",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Liquidez como impulso da experiência digital e do crédito",
          "Narrativa institucional clara e unificada",
          "Armazéns estratégicos Grão Direto",
        ]
      },
    ]
  },
  {
    nome: "Boffe",
    periodo: 2,
    perguntas: [
      {
        texto: "Quais os times prioritários ou temas para CONTROLADORIA e FINANCEIRO e como faremos para TRIPLICAR os resultados destes times/temas?",
        topicos: [
          "Reforma Tributária",
          "Tesouraria Estratégica",
          "AgFintech",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "Risco de Concentração da Carteira",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Exposição da Marca GD",
        ]
      },
    ]
  },
  {
    nome: "Juliene",
    periodo: 2,
    perguntas: [
      {
        texto: "Branding: Quais os times prioritários para triplicar os resultados via Branding e o que fazer neles?",
        topicos: [
          "Plataforma de Inteligência de Marca (PIM)",
          "Loyalty atuando com a lógica de \"cupons\" para engajamento",
          "Embaixador Sou Brasil, Sou Agro",
          "Co-branding no Agro",
        ]
      },
      {
        texto: "Eventos: Como fazer os resultados de sua área TRIPLICAREM?",
        topicos: [
          "De \"Evento Bonito\" para \"Máquina de Negócios\"",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Implementar Calculadora de Custo de produção",
          "Implementar Viés de Ancoragem de Preços",
          "Criar um Programa de Sucessão Familiar",
        ]
      },
    ]
  },
  {
    nome: "Albert (Léo)",
    periodo: 2,
    perguntas: [
      {
        texto: "Quais os times prioritários ou temas para MARKETING e como faremos para TRIPLICAR os resultados destes times/temas?",
        topicos: [
          "Integração entre canais de mídia via servidor (S2S)",
          "Novo modelo de atribuição: Marketing Mix Modeling",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "Exige engenharia, governança e ambiente de testes",
          "Experiência fluida",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "“Barter 24H” com cotação em tempo real",
        ]
      },
    ]
  },
  {
    nome: "Kaneko",
    periodo: 3,
    perguntas: [
      {
        texto: "Quais os times prioritários ou temas para PERFORMANCE e como faremos para TRIPLICAR os resultados destes times/temas?",
        topicos: [
          "Conhecer o Value Stream da empresa",
          "Facilitar uma gestão interna",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "Não perdermos o time da coisa",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Especializar pessoas",
          "Zelarmos pela nossa cultura",
        ]
      },
    ]
  },
  {
    nome: "Cici",
    periodo: 3,
    perguntas: [
      {
        texto: "Como fazer os resultados de sua área TRIPLICAREM?",
        topicos: [
          "Jornada WPP completa e com uma alta retenção",
          "Mais dados para personalização",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "Funil não orgânico (muita dependência de Twilio)",
          "Teto CEU/CENG quase sendo atingido",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Elevar o patamar de Loyalty",
          "Aumentar as “Super Transações”",
        ]
      },
    ]
  },
  {
    nome: "Joyce",
    periodo: 3,
    perguntas: [
      {
        texto: "Como TRIPLICAR nossa densidade de talento e performance dos times?",
        topicos: [
          "Fortalecer nossos elos",
          "Decidir com menos achismo e mais dados",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "Tolerância prolongada a baixo desempenho",
          "Cenário recorrente de metas de Tech não batidas",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Reter talentos",
          "Acompanhar as lideranças",
        ]
      },
    ]
  },
  {
    nome: "Lacerda",
    periodo: 3,
    perguntas: [
      {
        texto: "Como fazer os resultados de sua área TRIPLICAREM?",
        topicos: [
          "Execução Forte e Rituais Consistentes",
          "Inteligência Comercial (evolução do Top Picks + AIrton)",
          "Transformar Riscos em Oportunidades de Crescimento",
          "Avançarmos...",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "AMAGGI – Risco de “formalização” e dependência de incentivos",
          "ADM – Crescimento do pré-hedge e by-pass",
          "CARGILL – Risco de “volume” apenas para atingir a meta de 1,25 Mt (Warrants)",
          "LDC – Risco de termos o “carimbo” como canal exclusivamente transacional",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Dados",
          "Backoffice + Engajamento",
          "Loyalty/Marketing",
          "Gestão de pessoas",
        ]
      },
    ]
  },
  {
    nome: "Murilo",
    periodo: 3,
    perguntas: [
      {
        texto: "Como fazer a eficiência e impacto da sua área TRIPLICAREM?",
        topicos: [
          "Gastaremos R$ 133.701,60 migrando nossa arquitetura de Cloud para ARM",
          "Automatização do quarterly report",
          "Novo ecossistema de Dados",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "Vazamento de Dados por AI",
          "Modelo de negócio dos produtos de AI e custos de token",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Biônico como upselling para o Clicou, Fechou",
        ]
      },
    ]
  },
  {
    nome: "Thiago Meller",
    periodo: 3,
    perguntas: [
      {
        texto: "Como fazer os resultados de sua área TRIPLICAREM?",
        topicos: [
          "Distribuirmos seguros através da plataforma",
          "Estabelecermos parceria com consultoria estratégica",
        ]
      },
      {
        texto: "O que não pode faltar em 2026?",
        topicos: [
          "Atrairmos o sistema cooperativo para além da venda",
          "Criarmos uma solução de hedge",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Turbinar Grainsights + copiloto AIrton",
          "Academia GD ou Parcerias com Instituições de Ensino",
        ]
      },
    ]
  },
  {
    nome: "Aline",
    periodo: 3,
    perguntas: [
      {
        texto: "Quais os times prioritários ou temas para PROJETOS e como faremos para estarmos preparados para triplicar resultados?",
        topicos: [
          "Modelo integrado entre CF + Barter + Backoffice",
          "Preparar o Backoffice para escalar",
          "Infraestrutura escalável e time conectado",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "Projetos vendidos top-down sem envolver os stakeholders operacionais",
          "Processos pouco padronizados podem gerar dificuldades de escala",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Fortalecer e acelerar Serviços Financeiros e Inteligência Artificial",
          "Cross-sell estruturado",
          "Expandir portfólio de commodities",
        ]
      },
    ]
  },
  {
    nome: "Markim",
    periodo: 3,
    perguntas: [
      {
        texto: "Como fazer os resultados de sua área MULTIPLICAR POR 10X?",
        topicos: [
          "Dados como estimulo do momento de negociar",
          "AIrton como canal prioritário e unificado das comunicações",
          "Impulsionar conexões ambiente GD através do AIrton",
          "Biônico como maior fonte de dados GD",
          "Biônico proativo e reativo resolvendo dores reais",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "Dependência dos modelos de IA (LLMs)",
          "Má visão externas de soluções de IA",
          "Jornadas conversacionais são diferente de tudo e ainda não sabemos fazer",
          "Escolhas não estratégicas e prioritárias",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Maior interação entre IA e jornadas dos demais times",
          "Unificação e centralização de dados de usuários de toda GD",
          "Geração de conteúdo sobre contexto de mercado",
        ]
      },
    ]
  },
  {
    nome: "Vinícius Emmanuel",
    periodo: 4,
    perguntas: [
      {
        texto: "Como fazer a eficiência e impacto da sua área TRIPLICAREM?",
        topicos: [
          "Engenharia Orientada a Hipóteses",
          "Excelência na Execução (Pós-Planning)",
          "Ecossistema Conectado (API First)",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "Pessoa de produto para o time financeiro",
        ]
      },
      {
        texto: "Pergunta 3 – (sem tópicos definidos)",
        topicos: [
        ]
      },
    ]
  },
  {
    nome: "Mazetto",
    periodo: 4,
    perguntas: [
      {
        texto: "Como fazer os resultados de sua área TRIPLICAREM?",
        topicos: [
          "Projetos de Alto Valor",
          "Projetos de Alto Valor → Gestão de Contratos",
          "Escalabilidade → ICP: empresas de porte médio",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "Projetos de Alto Valor",
          "Escalabilidade → ICP: empresas de porte médio",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Barter de tudo e de todas as formas possíveis",
        ]
      },
    ]
  },
  {
    nome: "Matheus Reis",
    periodo: 4,
    perguntas: [
      {
        texto: "Como fazer os resultados de sua área QUINTUPLICAREM?",
        topicos: [
          "Otimizar créditos não performados",
          "Aumentar capacidade comercial de produtos performados",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "Otimizar créditos não performados",
          "Aumentar capacidade comercial de produtos performados",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Desenvolvermos uma rede de compra e venda de HF (alho, cenoura, cebola e batata)",
          "Criarmos CF de Cana de Açúcar e Café",
        ]
      },
    ]
  },
  {
    nome: "Sebá",
    periodo: 4,
    perguntas: [
      {
        texto: "Como fazer os resultados de sua área QUINTUPLICAREM?",
        topicos: [
          "30 novas empresas (20–50k ton ano cada uma)",
          "Crescimento nas empresas de grande volume",
          "Novas empresas de grande volume",
          "Produto básico com custo de implementação R$0,00",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "Necessidade de crédito para negociações se realizarem",
          "Liquidez não real dos grãos",
          "Produto não escalável para 50 empresas",
          "Time de Operações não escalável",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Criarmos um CF de Algodão e café",
          "Voltar a ser obcecados pela experiência dos usuários ativos",
          "Expansão territorial",
          "Somos muito bons dentro de casa, mas externamente não falamos nada",
        ]
      },
    ]
  },
  {
    nome: "Gabriel",
    periodo: 4,
    perguntas: [
      {
        texto: "Como fazer os resultados de sua área TRIPLICAREM?",
        topicos: [
          "Grainsights como referência",
        ]
      },
      {
        texto: "Quais riscos temos que ficar atentos?",
        topicos: [
          "Quantidade x Qualidade",
        ]
      },
      {
        texto: "O que a Grão precisa fazer fora de sua área para TRIPLICARMOS?",
        topicos: [
          "Solução ERP T.E.R.R.A",
        ]
      },
    ]
  },
];

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
// Helpers para salvamento em arquivo
// ==========================

function loadDataFromFile() {
  try {
    if (!fs.existsSync(DB_FILE)) return null;
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const obj = JSON.parse(raw);
    if (obj && obj.data) {
      return obj;
    }
  } catch (err) {
    console.error("Erro ao carregar db.json:", err.message);
  }
  return null;
}

function saveDataToFile() {
  try {
    const exportObj = {
      data,
      nextPerguntaId,
      nextTopicoId
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(exportObj, null, 2), "utf8");
  } catch (err) {
    console.error("Erro ao salvar db.json:", err.message);
  }
}

// ==========================
// Helpers para comparação de pessoa (bloquear auto-voto)
// ==========================

function normalizeName(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isSamePersonByName(userA, userB) {
  if (!userA || !userB) return false;
  return normalizeName(userA.name) === normalizeName(userB.name);
}

// ==========================
// Inicializar dados na subida do servidor
// ==========================

function initializeData() {
  if (initialized) return;
  console.log("Inicializando dados...");

  const loaded = loadDataFromFile();
  if (loaded) {
    // Carrega do db.json
    Object.assign(data, loaded.data);
    nextPerguntaId = loaded.nextPerguntaId || 1;
    nextTopicoId = loaded.nextTopicoId || 1;
    initialized = true;
    console.log("Dados carregados do db.json.");
    console.log("Usuários totais:", data.users.length);
    return;
  }

  // Sem arquivo: monta tudo do zero
  data.users = [];
  data.perguntas = [];
  data.topicos = [];
  data.votos = [];
  data.estrelas = [];

  // Admin
  data.users.push({
    code: "100",
    name: "Elias",
    role: "admin",
    turmaId: null,
    isPresenter: false
  });

  // 1) Apresentadores a partir do presentersConfig
  let presenterCodeCounter = 1000;

  presentersConfig.forEach(p => {
    const periodo = Number(p.periodo) || 1;
    const turmaId = (periodo === 1 || periodo === 2) ? "M" : "T";
    const code = String(presenterCodeCounter++);

    data.users.push({
      code,
      name: p.nome,          // IMPORTANTE: nome igual ao votante (pra bater no isSamePersonByName)
      role: "participant",
      turmaId,
      isPresenter: true
    });

    (p.perguntas || []).forEach((perg, idx) => {
      const ordem = idx + 1;
      const pergunta = createPergunta(turmaId, code, perg.texto, ordem);
      (perg.topicos || []).forEach(ttexto => {
        if (ttexto && String(ttexto).trim().length > 0) {
          createTopico(pergunta, String(ttexto).trim());
        }
      });
    });
  });

  // 2) Códigos fixos de quem vota (1–38)
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
      isPresenter: false
    });
  });

  saveDataToFile();

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

  // Regra de não votar nos próprios tópicos (mesmo com códigos diferentes)
  const apresentador = findUserByCode(topico.apresentadorCode);
  const isSameCode = topico.apresentadorCode === user.code;
  const isSameName = apresentador && isSamePersonByName(user, apresentador);

  if (isSameCode || isSameName) {
    return res.status(403).json({
      ok: false,
      message: "Você não pode votar nos seus próprios tópicos."
    });
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

  saveDataToFile();

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

      const proprioTopico =
        apresentador && isSamePersonByName(user, apresentador);

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

    const apresentador = findUserByCode(topico.apresentadorCode);
    const isSameCode = topico.apresentadorCode === user.code;
    const isSameName = apresentador && isSamePersonByName(user, apresentador);

    if (isSameCode || isSameName) {
      return res.status(403).json({
        ok: false,
        message: "Você não pode dar estrela nos seus próprios tópicos."
      });
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

    saveDataToFile();

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

// Salvar perguntas (substitui as atuais de um apresentador)
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

  saveDataToFile();

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

  saveDataToFile();

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

  saveDataToFile();

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

  saveDataToFile();

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
// Rota para RESET de testes (apaga votos + estrelas)
// ==========================

app.post("/api/admin/reset-votos", (req, res) => {
  data.votos = [];
  data.estrelas = [];
  saveDataToFile();
  res.json({
    ok: true,
    message: "Todos os votos e estrelas foram apagados com sucesso (reset de testes)."
  });
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
