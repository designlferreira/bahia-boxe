/**
 * Título de cada tela, para a aba do navegador e para o aviso de leitor de tela ao navegar (WCAG 2.4.2). Antes só a 404 tinha título próprio:
 * todas as outras diziam "Bahia Boxe", e num app de uma página só quem usa leitor de tela não ouvia que a tela tinha mudado.
 * A primeira regra que casar vale, então as mais específicas vêm antes. Endereço sem regra (a 404) devolve `null`: a própria tela decide.
 * **Tela nova = uma linha aqui.**
 */
const REGRAS: [RegExp, string][] = [
  [/^\/login$/, "Entrar"],
  [/^\/criar-conta$/, "Criar conta"],
  [/^\/confirmar-email$/, "Confirme seu e-mail"],
  [/^\/recuperar-senha$/, "Recuperar senha"],
  [/^\/auth\/reset-password$/, "Nova senha"],
  [/^\/convite\//, "Convite"],

  [/^\/app\/home$/, "Início"],
  [/^\/app\/agendar$/, "Agendar aula"],
  [/^\/app\/historico$/, "Minhas aulas"],
  [/^\/app\/aula\//, "Detalhe da aula"],
  [/^\/app\/pacotes$/, "Meu pacote"],
  [/^\/app\/minha-conta\/alterar-senha$/, "Alterar senha"],
  [/^\/app\/minha-conta\/perfil$/, "Meus dados físicos"],
  [/^\/app\/minha-conta$/, "Minha conta"],
  [/^\/app\/perfil-lutador\/questionario$/, "Questionário do Perfil de Boxe"],
  [/^\/app\/perfil-lutador\/resultado\//, "Resultado do Perfil de Boxe"],
  [/^\/app\/perfil-lutador\/historico$/, "Minha evolução"],
  [/^\/app\/perfil-lutador$/, "Perfil de Boxe"],

  [/^\/admin\/dashboard$/, "Painel"],
  [/^\/admin\/agenda$/, "Agenda"],
  [/^\/admin\/aula\//, "Detalhe da aula"],
  [/^\/admin\/alunos$/, "Alunos"],
  [/^\/admin\/alunos\/[^/]+\/perfil-lutador\/questionario$/, "Avaliar Perfil de Boxe"],
  [/^\/admin\/alunos\/[^/]+\/perfil-lutador$/, "Perfil de Boxe do aluno"],
  [/^\/admin\/alunos\/[^/]+\/recorrencia$/, "Horários fixos"],
  [/^\/admin\/alunos\/[^/]+$/, "Detalhe do aluno"],
  [/^\/admin\/historico$/, "Aulas"],
  [/^\/admin\/pacotes$/, "Modelos de pacote"],
  [/^\/admin\/solicitacoes$/, "Pedidos"],
  [/^\/admin\/disponibilidade$/, "Disponibilidade"],
  [/^\/admin\/orientacoes$/, "Orientações da aula"],
  [/^\/admin\/perfil-alunos$/, "Perfil dos alunos"],
  [/^\/admin\/configuracoes$/, "Configurações"],
  [/^\/admin\/minha-conta\/alterar-senha$/, "Alterar senha"],
  [/^\/admin\/minha-conta$/, "Minha conta"],
];

export const NOME_DO_APP = "Bahia Boxe";

export function tituloDaRota(pathname: string): string | null {
  const limpo = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  for (const [regra, titulo] of REGRAS) if (regra.test(limpo)) return titulo;
  return null;
}
