import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { VERSAO_PRIVACIDADE } from "../services/conta";
import "./Pages.css";
import "./Privacidade.css";

// Política de privacidade (LGPD). Vale logado ou não: o cadastro aponta para
// cá antes de a conta existir. Cada "quem vê" segue o que as regras do
// Firestore permitem; se uma regra mudar quem lê um dado, mude aqui também.
const DADOS = [
  {
    dado: "Nome, e-mail e celular",
    finalidade: "Criar e proteger a sua conta, recuperar a senha e avisar sobre ela.",
    quemVe: "Só você.",
  },
  {
    dado: "Placa do carro",
    finalidade: "É o seu ticket: o totem registra a entrada e a saída por ela.",
    quemVe: "Você e o totem. O estacionamento e a administração da rede veem a placa nas estadias.",
  },
  {
    dado: "Marca, modelo e cor (opcionais)",
    finalidade: "Mostrar o seu carro na confirmação do totem.",
    quemVe:
      "Você e o totem. O estacionamento e a administração da rede veem o modelo e a cor só enquanto o carro está lá.",
  },
  {
    dado: "Direito a vaga especial (opcional)",
    finalidade: "Indicar uma vaga PCD, 60+ ou de gestante para você.",
    quemVe: "Você e o totem, que lê só o tipo declarado.",
  },
  {
    dado: "Estadias",
    finalidade: "Cobrar pelo tempo, emitir o comprovante e mostrar o seu histórico.",
    quemVe: "Você, o estacionamento da estadia e a administração da rede, sem o seu nome.",
  },
  {
    dado: "Saldo e recargas",
    finalidade: "Mostrar a carteira e o extrato. A recarga é simulada, sem pagamento real.",
    quemVe: "Só você. O totem consulta o saldo para liberar a entrada.",
  },
  {
    dado: "Reserva de vaga",
    finalidade: "Segurar a vaga por 30 minutos até você chegar.",
    quemVe: "Você, o totem do estacionamento reservado e a administração da rede.",
  },
];

// Índice da página (no computador, ao lado do texto). Mesma ordem das seções.
const SECOES = [
  ["quem", "Quem cuida dos seus dados"],
  ["dados", "O que guardamos, para quê e quem vê"],
  ["sensivel", "Vaga especial é dado sensível"],
  ["base", "Por que podemos usar esses dados"],
  ["direitos", "Seus direitos, direto no app"],
  ["exclusao", "Quando você exclui a conta"],
  ["onde", "Onde os dados ficam e por quanto tempo"],
  ["aparelho", "No seu aparelho"],
  ["contato", "Dúvidas e mudanças"],
];

function dataDaVersao() {
  const [ano, mes, dia] = VERSAO_PRIVACIDADE.split("-").map(Number);
  return new Date(ano, mes - 1, dia).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function Privacidade() {
  const { user } = useAuth();
  const destinoDosDados = user ? "/configuracoes?aba=privacidade" : "/login";

  return (
    <div className="page container privacidade">
      <div className="page-header">
        <div>
          <h1>Privacidade</h1>
          <p>
            Quais dados o ParaAí guarda, para quê, quem vê e como você controla
            cada um. Versão de {dataDaVersao()}.
          </p>
        </div>
      </div>

      <div className="privacidade-grade">
        <aside className="privacidade-lado">
          <div className="card card-marcado">
            <h2>Em poucas palavras</h2>
            <ul className="privacidade-lista">
              <li>
                Guardamos só o que o estacionamento precisa: a conta, a placa, as
                estadias e a carteira simulada.
              </li>
              <li>Nada é vendido nem usado para publicidade.</li>
              <li>
                Você baixa uma cópia dos seus dados ou exclui a conta no próprio
                app, quando quiser.
              </li>
            </ul>
          </div>
          <nav className="card privacidade-indice" aria-labelledby="priv-indice">
            <h2 id="priv-indice">Nesta página</h2>
            <ol>
              {SECOES.map(([ancora, titulo]) => (
                <li key={ancora}>
                  <a href={`#${ancora}`}>{titulo}</a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="privacidade-texto">
          <section className="card" id="quem" aria-labelledby="priv-quem">
            <h2 id="priv-quem">Quem cuida dos seus dados</h2>
            <p>
              O ParaAí é um projeto acadêmico, um Trabalho de Conclusão de Curso
              que demonstra uma rede de estacionamentos atendida por totens. Os
              autores do projeto são os responsáveis pelos dados tratados aqui (os
              controladores, na Lei Geral de Proteção de Dados, a Lei nº
              13.709/2018).
            </p>
            <p>
              A recarga de saldo é simulada: o ParaAí não pede cartão, conta
              bancária nem chave Pix, e nenhum valor é cobrado de verdade.
            </p>
          </section>

          <section className="card" id="dados" aria-labelledby="priv-dados">
            <h2 id="priv-dados">O que guardamos, para quê e quem vê</h2>
            <table className="privacidade-tabela">
              <thead>
                <tr>
                  <th scope="col">Dado</th>
                  <th scope="col">Para quê</th>
                  <th scope="col">Quem vê</th>
                </tr>
              </thead>
              <tbody>
                {DADOS.map((linha) => (
                  <tr key={linha.dado}>
                    <th scope="row">{linha.dado}</th>
                    <td data-rotulo="Para quê">{linha.finalidade}</td>
                    <td data-rotulo="Quem vê">{linha.quemVe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Contas de estacionamento guardam também o cadastro do pátio (nome,
              endereço, tarifa e vagas); o nome, o endereço e a tarifa aparecem
              para os motoristas no mapa. Os autores do projeto podem acessar o
              banco de dados para manutenção e correção de erros. Não vendemos
              dados nem os repassamos a anunciantes.
            </p>
          </section>

          <section className="card" id="sensivel" aria-labelledby="priv-sensivel">
            <h2 id="priv-sensivel">Vaga especial é dado sensível</h2>
            <p>
              Deficiência e gestação são dados de saúde, que a LGPD trata como
              sensíveis. O ParaAí só guarda o tipo de vaga que você declara, com o
              seu consentimento na própria declaração, e usa essa informação apenas
              para indicar a vaga certa. Não pedimos laudo nem documento: a
              credencial é apresentada no estacionamento quando for exigida.
            </p>
            <p>
              Para retirar o consentimento, abra o Perfil, use Alterar no cartão
              Vaga especial e escolha “Não preciso”. A informação é apagada da
              conta e do carro.
            </p>
          </section>

          <section className="card" id="base" aria-labelledby="priv-base">
            <h2 id="priv-base">Por que podemos usar esses dados</h2>
            <ul className="privacidade-lista">
              <li>
                Para prestar o serviço que você pediu: conta, entrada e saída pela
                placa, cobrança, comprovante e reserva (execução de contrato,
                art. 7º, V).
              </li>
              <li>
                Para proteger a conta e a cobrança, como impedir uma nova entrada
                com pendência de saldo (legítimo interesse, art. 7º, IX).
              </li>
              <li>Vaga especial: com o seu consentimento (art. 11, I).</li>
            </ul>
          </section>

          <section className="card" id="direitos" aria-labelledby="priv-direitos">
            <h2 id="priv-direitos">Seus direitos, direto no app</h2>
            <ul className="privacidade-lista">
              <li>
                <strong>Ver e levar os seus dados:</strong> Configurações, aba
                Privacidade, “Baixar meus dados”. O arquivo vem em JSON, um formato
                aberto que outros serviços conseguem ler.
              </li>
              <li>
                <strong>Corrigir:</strong> nome e celular em Configurações; modelo,
                cor e vaga especial no Perfil.
              </li>
              <li>
                <strong>Excluir a conta:</strong> Configurações, aba Privacidade,
                “Excluir minha conta”.
              </li>
              <li>
                <strong>Saber com quem os dados são compartilhados:</strong> está
                nesta página, na coluna “Quem vê”.
              </li>
            </ul>
            <Link to={destinoDosDados} className="btn btn-outline">
              {user ? "Abrir meus dados" : "Entrar para ver meus dados"}
            </Link>
          </section>

          <section className="card" id="exclusao" aria-labelledby="priv-exclusao">
            <h2 id="priv-exclusao">Quando você exclui a conta</h2>
            <p>
              Apagamos o perfil (nome, e-mail, celular e vaga especial), o extrato
              de recargas e a reserva, e encerramos o acesso. A placa fica livre
              para outra pessoa cadastrar, sem saldo, modelo, cor ou direito a
              vaga, e quem a cadastrar não vê as suas estadias.
            </p>
            <p>
              As estadias continuam nos registros do estacionamento e da
              administração da rede, só com a placa, porque fazem parte do controle
              de entradas, saídas e faturamento deles. O saldo simulado não é
              devolvido. Com o carro estacionado ou com uma pendência, registre a
              saída ou regularize o saldo antes.
            </p>
          </section>

          <section className="card" id="onde" aria-labelledby="priv-onde">
            <h2 id="priv-onde">Onde os dados ficam e por quanto tempo</h2>
            <p>
              Os dados ficam no Firebase, serviço de nuvem do Google. A senha é
              guardada pelo serviço de login do Google: nem os autores a veem. A
              conexão é sempre criptografada, e regras de acesso testadas
              automaticamente fazem cada um ler só o que é seu: o motorista vê os
              próprios dados, o estacionamento só o próprio pátio e o totem só o
              que precisa para a entrada e a saída.
            </p>
            <p>Guardamos os dados enquanto a conta existir.</p>
          </section>

          <section className="card" id="aparelho" aria-labelledby="priv-aparelho">
            <h2 id="priv-aparelho">No seu aparelho</h2>
            <p>
              O site guarda no navegador a sessão de login e a escolha do tema
              claro ou escuro. Com o app instalado, guarda também os arquivos do
              site, para abrir mais rápido e mostrar um aviso quando estiver sem
              internet. Não usamos cookies de publicidade nem ferramentas de
              rastreamento. As fontes do site vêm do Google Fonts, então o
              navegador se conecta ao Google para baixá-las.
            </p>
          </section>

          <section className="card" id="contato" aria-labelledby="priv-contato">
            <h2 id="priv-contato">Dúvidas e mudanças</h2>
            <p>
              Pedidos que o app não resolve podem ser feitos aos autores do
              projeto. Se esta política mudar, a data da versão, no topo da
              página, muda junto.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
