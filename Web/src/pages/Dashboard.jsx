import { useAuth } from "../context/AuthContext";
import PainelOperador from "./PainelOperador";
import PainelMotorista from "./PainelMotorista";
import PainelAdmin from "./PainelAdmin";

// Painel único por papel: dono de estacionamento vê a operação (faturamento,
// acessos, ocupação); motorista vê o próprio carro, saldo e pagamentos.
export default function Dashboard() {
  const { userData } = useAuth();
  const role = userData?.role || "motorista";
  if (role === "admin") return <PainelAdmin />;
  return role === "operador" ? <PainelOperador /> : <PainelMotorista />;
}
