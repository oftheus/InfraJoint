import { PolicySection } from './privacy-policy.model';

/**
 * Contact address published for data-subject requests (LGPD art. 18).
 *
 * TODO: replace with the project's official address before going public — the
 * policy promises a reply channel, so it must reach a real inbox.
 */
export const PRIVACY_POLICY_CONTACT_EMAIL = 'sistemainfrajoint@gmail.com';

/** Machine-readable date for the `<time>` element. */
export const PRIVACY_POLICY_LAST_UPDATED_ISO = '2026-08-06';

/** Human-readable date shown to the user. */
export const PRIVACY_POLICY_LAST_UPDATED = '6 de agosto de 2026';

/**
 * Content of the privacy policy, kept as data so the page, the table of
 * contents and the anchors stay derived from a single source of truth.
 *
 * The text describes how the platform actually behaves today: authentication
 * and profile data live in Supabase, while thermographic images and CSV files
 * are processed entirely in the browser and never leave the user's device.
 */
export const PRIVACY_POLICY_SECTIONS: PolicySection[] = [
  {
    id: 'visao-geral',
    title: 'Visão geral',
    blocks: [
      {
        kind: 'paragraph',
        text: 'O InfraJoint é uma plataforma acadêmica de apoio à pesquisa em termografia aplicada à reumatologia, desenvolvida como Trabalho de Conclusão de Curso em Ciência da Computação, em colaboração entre o Instituto de Computação e a Faculdade de Medicina da Universidade Federal Fluminense (UFF).',
      },
      {
        kind: 'paragraph',
        text: 'Esta Política de Privacidade explica quais dados pessoais são tratados quando você utiliza a plataforma, com que finalidade, por quanto tempo e quais são os seus direitos. Ela segue a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD).',
      },
      {
        kind: 'paragraph',
        text: 'Ao criar uma conta e utilizar o InfraJoint, você declara ter lido e compreendido as práticas descritas neste documento.',
      },
    ],
  },
  {
    id: 'dados-coletados',
    title: 'Dados que coletamos',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Coletamos apenas os dados necessários para autenticar você, manter o seu perfil e garantir a segurança da plataforma:',
      },
      {
        kind: 'list',
        items: [
          {
            label: 'Dados de cadastro',
            text: 'nome completo, endereço de e-mail e senha. A senha é armazenada de forma criptografada (hash) pelo serviço de autenticação e nunca fica acessível à equipe do projeto.',
          },
          {
            label: 'Login com o Google',
            text: 'ao optar por entrar com a sua conta Google, recebemos apenas o nome, o e-mail e a foto pública do seu perfil. Não temos acesso à sua senha, aos seus contatos ou ao conteúdo da sua caixa de entrada.',
          },
          {
            label: 'Foto de perfil',
            text: 'imagem opcional que você pode enviar para personalizar a sua conta.',
          },
          {
            label: 'Perfil de acesso',
            text: 'um indicador de papel (usuário ou administrador) definido pela equipe do projeto e utilizado para liberar áreas administrativas.',
          },
          {
            label: 'Registros técnicos',
            text: 'data, hora e endereço IP dos eventos de autenticação, registrados automaticamente pelo provedor de infraestrutura para fins de segurança.',
          },
        ],
      },
      {
        kind: 'paragraph',
        text: 'Não utilizamos cookies de publicidade, não fazemos rastreamento comportamental e não vendemos dados pessoais a terceiros.',
      },
    ],
  },
  {
    id: 'imagens-termograficas',
    title: 'Imagens termográficas e arquivos de análise',
    blocks: [
      {
        kind: 'note',
        title: 'As imagens não saem do seu dispositivo',
        text: 'Todo o processamento das análises — leitura dos arquivos, alinhamento das imagens, segmentação da pele, cálculo das regiões de interesse e das curvas de reaquecimento — acontece localmente, dentro do seu navegador.',
      },
      {
        kind: 'paragraph',
        text: 'As imagens térmicas, as fotografias visíveis e os arquivos CSV de temperatura que você carrega no analisador não são enviados aos nossos servidores nem armazenados em nuvem pela plataforma. Eles permanecem apenas na memória do navegador durante a sessão de análise e são descartados quando você fecha ou recarrega a página.',
      },
      {
        kind: 'paragraph',
        text: 'Como consequência, resultados de análise não são preservados automaticamente: para guardar um resultado, exporte-o antes de sair da página.',
      },
      {
        kind: 'list',
        items: [
          {
            label: 'Responsabilidade do pesquisador',
            text: 'imagens de pacientes podem constituir dados pessoais sensíveis de saúde. Cabe a você, como pesquisador ou profissional de saúde, garantir a base legal adequada, o consentimento dos participantes e a anonimização dos arquivos antes de utilizá-los na plataforma.',
          },
          {
            label: 'Sem identificação de pacientes',
            text: 'a plataforma não solicita nome, documento ou qualquer outro identificador direto de pacientes para executar uma análise.',
          },
        ],
      },
    ],
  },
  {
    id: 'finalidades',
    title: 'Para que usamos os seus dados',
    blocks: [
      {
        kind: 'list',
        items: [
          {
            label: 'Autenticação e manutenção da conta',
            text: 'identificar você com segurança a cada acesso e manter a sua sessão ativa.',
          },
          {
            label: 'Personalização da experiência',
            text: 'exibir o seu nome e a sua foto na interface e lembrar as suas preferências de uso.',
          },
          {
            label: 'Controle de acesso',
            text: 'liberar ou restringir áreas da plataforma conforme o seu perfil de acesso.',
          },
          {
            label: 'Segurança',
            text: 'detectar acessos indevidos, prevenir fraudes e investigar incidentes.',
          },
          {
            label: 'Evolução da plataforma',
            text: 'compreender de forma agregada como os recursos são utilizados para orientar melhorias e a pesquisa acadêmica associada ao projeto.',
          },
        ],
      },
      {
        kind: 'paragraph',
        text: 'Não utilizamos os seus dados para decisões automatizadas que produzam efeitos jurídicos ou que afetem significativamente os seus interesses.',
      },
    ],
  },
  {
    id: 'bases-legais',
    title: 'Bases legais do tratamento',
    blocks: [
      {
        kind: 'paragraph',
        text: 'O tratamento dos seus dados pessoais se apoia nas seguintes hipóteses previstas na LGPD:',
      },
      {
        kind: 'list',
        items: [
          {
            label: 'Execução de contrato (art. 7º, V)',
            text: 'para criar e manter a sua conta e disponibilizar os recursos da plataforma.',
          },
          {
            label: 'Consentimento (art. 7º, I)',
            text: 'para dados opcionais, como a foto de perfil, e para comunicações que dependam da sua autorização.',
          },
          {
            label: 'Legítimo interesse (art. 7º, IX)',
            text: 'para garantir a segurança da plataforma e prevenir usos indevidos.',
          },
          {
            label: 'Cumprimento de obrigação legal (art. 7º, II)',
            text: 'quando a guarda ou o fornecimento de informações for exigido por lei ou por autoridade competente.',
          },
          {
            label: 'Estudos por órgão de pesquisa (art. 7º, IV e art. 11, II, “c”)',
            text: 'para a finalidade acadêmica do projeto, sempre que possível com dados anonimizados.',
          },
        ],
      },
    ],
  },
  {
    id: 'compartilhamento',
    title: 'Compartilhamento com terceiros',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Não comercializamos dados pessoais. O compartilhamento ocorre apenas com os prestadores de serviço necessários ao funcionamento da plataforma, que atuam como operadores e estão obrigados contratualmente a proteger essas informações:',
      },
      {
        kind: 'list',
        items: [
          {
            label: 'Supabase',
            text: 'autenticação, banco de dados do perfil e armazenamento das fotos de perfil.',
          },
          {
            label: 'Google',
            text: 'apenas quando você escolhe entrar com a sua conta Google, para validar a sua identidade.',
          },
          {
            label: 'Provedor de hospedagem',
            text: 'entrega da aplicação web e registros técnicos de acesso.',
          },
        ],
      },
      {
        kind: 'paragraph',
        text: 'Também poderemos compartilhar dados para cumprir ordem judicial, requisição de autoridade competente ou obrigação legal, bem como para defender os direitos do projeto e de seus usuários.',
      },
    ],
  },
  {
    id: 'armazenamento-seguranca',
    title: 'Armazenamento e segurança',
    blocks: [
      {
        kind: 'list',
        items: [
          {
            label: 'Isolamento por usuário',
            text: 'as regras de segurança do banco de dados garantem que cada pessoa só consiga ler e alterar o seu próprio perfil, e que o perfil de acesso não seja modificável pelo usuário.',
          },
          {
            label: 'Arquivos protegidos',
            text: 'as políticas de armazenamento restringem o envio e a alteração de arquivos ao respectivo dono.',
          },
          {
            label: 'Transmissão criptografada',
            text: 'toda a comunicação entre o seu navegador e os serviços da plataforma utiliza HTTPS/TLS.',
          },
          {
            label: 'Credenciais',
            text: 'senhas são armazenadas com algoritmos de hash e os tokens de sessão ficam no seu próprio navegador, sob controle do serviço de autenticação.',
          },
        ],
      },
      {
        kind: 'paragraph',
        text: 'Os provedores utilizados podem manter servidores fora do Brasil. Nesses casos, a transferência internacional de dados observa os requisitos dos arts. 33 e seguintes da LGPD.',
      },
      {
        kind: 'paragraph',
        text: 'Nenhum sistema é totalmente imune a incidentes. Caso ocorra um incidente de segurança com risco relevante aos seus direitos, comunicaremos você e a Autoridade Nacional de Proteção de Dados (ANPD), conforme o art. 48 da LGPD.',
      },
    ],
  },
  {
    id: 'retencao',
    title: 'Por quanto tempo mantemos os dados',
    blocks: [
      {
        kind: 'list',
        items: [
          {
            label: 'Dados de conta e perfil',
            text: 'mantidos enquanto a sua conta estiver ativa.',
          },
          {
            label: 'Após a exclusão da conta',
            text: 'os dados são eliminados ou anonimizados, ressalvadas as hipóteses de guarda obrigatória previstas em lei.',
          },
          {
            label: 'Registros técnicos de acesso',
            text: 'mantidos por período limitado, para fins de segurança e auditoria.',
          },
          {
            label: 'Arquivos de análise',
            text: 'não são retidos: existem apenas durante a sessão no seu navegador.',
          },
        ],
      },
    ],
  },
  {
    id: 'cookies',
    title: 'Cookies e armazenamento local',
    blocks: [
      {
        kind: 'paragraph',
        text: 'A plataforma utiliza o armazenamento local do navegador para guardar o token da sua sessão e manter você conectado entre visitas. Esse recurso é essencial ao funcionamento do login.',
      },
      {
        kind: 'paragraph',
        text: 'Não utilizamos cookies de publicidade, de perfilamento ou de redes sociais. Você pode limpar esses dados a qualquer momento pelas configurações do seu navegador — ao fazê-lo, será necessário entrar novamente.',
      },
    ],
  },
  {
    id: 'direitos',
    title: 'Os seus direitos como titular',
    blocks: [
      {
        kind: 'paragraph',
        text: 'A LGPD assegura a você, a qualquer momento e mediante requisição, os seguintes direitos:',
      },
      {
        kind: 'list',
        items: [
          { text: 'confirmar a existência de tratamento dos seus dados;' },
          { text: 'acessar os dados que mantemos sobre você;' },
          { text: 'corrigir dados incompletos, inexatos ou desatualizados;' },
          {
            text: 'solicitar a anonimização, o bloqueio ou a eliminação de dados desnecessários ou tratados em desconformidade com a lei;',
          },
          { text: 'solicitar a portabilidade dos dados a outro fornecedor de serviço;' },
          { text: 'obter informação sobre com quem os seus dados são compartilhados;' },
          { text: 'revogar o consentimento e solicitar a exclusão da sua conta;' },
          { text: 'opor-se a tratamento realizado com fundamento em outra base legal.' },
        ],
      },
      {
        kind: 'paragraph',
        text: 'Parte desses direitos pode ser exercida diretamente na plataforma: o seu nome e a sua foto de perfil podem ser atualizados na página de perfil. Para os demais pedidos, entre em contato pelo canal abaixo. Responderemos em até 15 dias, conforme o art. 19 da LGPD.',
      },
    ],
  },
  {
    id: 'menores',
    title: 'Crianças e adolescentes',
    blocks: [
      {
        kind: 'paragraph',
        text: 'O acesso à plataforma é destinado a pesquisadores e profissionais de saúde maiores de 18 anos. Não coletamos intencionalmente dados de crianças e adolescentes como usuários do sistema.',
      },
      {
        kind: 'paragraph',
        text: 'Quando a pesquisa envolver participantes menores de idade, o consentimento específico dos pais ou responsáveis e a aprovação do comitê de ética competente são responsabilidade do pesquisador, nos termos do art. 14 da LGPD.',
      },
    ],
  },
  {
    id: 'alteracoes',
    title: 'Alterações desta política',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Esta política pode ser atualizada para refletir mudanças na plataforma ou na legislação aplicável. A data da última atualização é sempre exibida no início da página.',
      },
      {
        kind: 'paragraph',
        text: 'Alterações relevantes serão comunicadas pelos canais disponíveis antes de entrarem em vigor. Recomendamos revisar este documento periodicamente.',
      },
    ],
  },
  {
    id: 'contato',
    title: 'Contato',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Para exercer os seus direitos, esclarecer dúvidas sobre esta política ou comunicar um incidente, fale com a equipe responsável pelo tratamento de dados do InfraJoint:',
      },
      {
        kind: 'contact',
        label: 'Encarregado pelo tratamento de dados',
        email: PRIVACY_POLICY_CONTACT_EMAIL,
      },
      {
        kind: 'paragraph',
        text: 'Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD), por meio dos canais oficiais do órgão.',
      },
    ],
  },
];
