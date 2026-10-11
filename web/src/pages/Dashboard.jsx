import { useAuth } from "../context/AuthContext";
import PainelOperador from "./PainelOperador";
import PainelMotorista from "./PainelMotorista";
import PainelAdmin from "./PainelAdmin";
import PainelPedido from "./PainelPedido";

// Painel único por papel: dono de estacionamento vê a operação (faturamento,
// acessos, ocupação); motorista vê o próprio carro, saldo e pagamentos; quem
// pediu para pôr o estacionamento na rede acompanha o pedido até a aprovação,
// quando a conta vira dona e este painel troca sozinho.
export default function Dashboard() {
  const { userData } = useAuth();
  const role = userData?.role || "motorista";
  if (role === "admin") return <PainelAdmin />;
  if (role === "candidato") return <PainelPedido />;
  return role === "operador" ? <PainelOperador /> : <PainelMotorista />;
}
