import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const privacyEmail = 'joaokevensantosandrade3@gmail.com';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.heading}>{title}</Text>
    {children}
  </View>;
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

function DataItem({ title, children }: { title: string; children: React.ReactNode }) {
  return <Text style={styles.listItem}>•  <Text style={styles.strong}>{title}:</Text> {children}</Text>;
}

export default function PrivacyPolicyScreen() {
  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <View style={styles.card}>
      <Text style={styles.brand}>Oficina Inteligente</Text>
      <Text accessibilityRole="header" style={styles.title}>Política de Privacidade</Text>
      <Text style={styles.meta}>Última atualização: 1º de novembro de 2026</Text>

      <Paragraph>Esta política explica quais dados pessoais podem ser tratados ao usar a Oficina Inteligente, para que servem, com quem são compartilhados e como solicitar informações ou exercer direitos. Ela se aplica à versão web e à versão instalável pelo navegador, que acessam a plataforma.</Paragraph>

      <Section title="Quem é responsável pelo serviço">
        <Paragraph>O serviço é operado por João Keven Santos Andrade, responsável pelo funcionamento da Oficina Inteligente e pelo tratamento dos dados de cadastro, acesso, suporte e segurança da plataforma.</Paragraph>
        <Paragraph>Para os dados de clientes, veículos, funcionários e fornecedores registrados por uma oficina, a oficina que decide como utilizar esses dados é, em regra, responsável por orientar o tratamento. A Oficina Inteligente fornece a plataforma para armazenar e organizar esses registros conforme as ações autorizadas pelos usuários da oficina. A definição dos papéis pode variar conforme a forma concreta de uso do serviço.</Paragraph>
        <Paragraph>Canal para assuntos de privacidade:</Paragraph>
        <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(`mailto:${privacyEmail}`); }}>
          <Text style={styles.link}>{privacyEmail}</Text>
        </Pressable>
      </Section>

      <Section title="Dados que podem ser tratados">
        <DataItem title="Contas e acesso">nome, e-mail, identificador da conta, oficina vinculada, função, permissões e registros técnicos de acesso e de ações administrativas.</DataItem>
        <DataItem title="Cadastro da oficina">nome, CNPJ, telefone, WhatsApp, e-mail, endereço, cidade, estado, nome do responsável, horário de funcionamento e logotipo.</DataItem>
        <DataItem title="Clientes e fornecedores">nome, CPF ou CNPJ, telefone, WhatsApp, e-mail, endereço, pessoa de contato e observações fornecidas pela oficina.</DataItem>
        <DataItem title="Veículos e ordens de serviço">placa, marca, modelo, ano, cor, quilometragem, combustível, chassi, reclamação, diagnóstico, serviços, peças, inspeções, notas, lembretes, garantias, fotos e anexos.</DataItem>
        <DataItem title="Autorizações">nome de quem assina, declaração exibida, valor relacionado, desenho da assinatura e data do registro.</DataItem>
        <DataItem title="Rotina da oficina">estoque, compras, pagamentos, contas a pagar e receber, valores, vencimentos, status, forma de pagamento e horas registradas.</DataItem>
        <DataItem title="Sessão no navegador">na versão web, o armazenamento local do navegador mantém a sessão de autenticação para que o usuário continue conectado.</DataItem>
        <Paragraph>Os campos de observação e os anexos podem conter informações adicionais inseridas pelos usuários. A oficina deve registrar somente o que for necessário para a prestação do serviço e evitar senhas, dados de cartão, dados bancários de acesso ou informações pessoais sem relação com a oficina.</Paragraph>
      </Section>

      <Section title="Como os dados são obtidos e usados">
        <Paragraph>Os dados são informados por administradores, proprietários e funcionários das oficinas durante o cadastro e o uso da plataforma. E-mails de convite são informados por quem convida um proprietário ou funcionário. Dados de acesso também são gerados quando a pessoa entra, altera informações ou usa recursos do sistema.</Paragraph>
        <Paragraph>Os dados são usados para criar e proteger contas; enviar convites e instruções de recuperação de senha; organizar clientes, veículos, ordens de serviço, orçamentos, estoque e financeiro; produzir relatórios; manter permissões por oficina; prestar suporte; prevenir uso indevido; e cumprir obrigações legais aplicáveis.</Paragraph>
        <Paragraph>A plataforma não vende listas de dados pessoais nem usa os dados da oficina para publicidade comportamental.</Paragraph>
      </Section>

      <Section title="Onde os dados ficam e com quem são compartilhados">
        <Paragraph>O site público é hospedado pelo GitHub Pages. Os dados de contas, registros das oficinas e arquivos enviados são processados pela Supabase, que fornece autenticação, banco de dados e armazenamento de arquivos.</Paragraph>
        <Paragraph>Quando a configuração de envio estiver concluída, o Mailjet poderá ser usado para mensagens de autenticação, como convites e recuperação de senha. Nesse envio, o Mailjet receberá o endereço do destinatário e o conteúdo necessário para entregar a mensagem. Esses provedores tratam dados conforme seus próprios contratos e políticas. A plataforma não vende dados pessoais.</Paragraph>
        <Paragraph>Os provedores podem processar dados em países diferentes do Brasil, conforme a configuração do serviço e as regras contratuais aplicáveis. Os dados também podem ser fornecidos quando isso for necessário para cumprir uma obrigação legal ou uma ordem válida de autoridade competente.</Paragraph>
      </Section>

      <Section title="Permissões, armazenamento e segurança">
        <Paragraph>O acesso aos registros é separado por oficina e limitado pelas funções e permissões configuradas para cada conta. Arquivos de ordens de serviço são mantidos em armazenamento privado e disponibilizados por links temporários aos usuários autorizados. A equipe responsável deve usar credenciais individuais e não compartilhar senhas.</Paragraph>
        <Paragraph>São adotadas medidas técnicas e organizacionais para reduzir riscos de acesso ou uso indevido. Nenhum serviço conectado à internet pode garantir segurança absoluta; em caso de suspeita de acesso indevido, a oficina deve comunicar o responsável pelo serviço pelo canal acima.</Paragraph>
      </Section>

      <Section title="Retenção e exclusão">
        <Paragraph>Os registros permanecem enquanto forem necessários para manter a conta e prestar os serviços da oficina, atender solicitações e cumprir obrigações legais. A exclusão de uma oficina é feita pelo administrador da plataforma. Para solicitar a exclusão da conta ou da oficina, use o canal de privacidade indicado nesta política. Cópias técnicas de segurança podem permanecer temporariamente nos sistemas dos provedores conforme seus ciclos de retenção.</Paragraph>
      </Section>

      <Section title="Direitos das pessoas">
        <Paragraph>Nos termos da legislação aplicável, a pessoa pode solicitar confirmação e acesso aos dados, correção de informações incompletas ou incorretas, informações sobre o uso compartilhado e, quando cabível, bloqueio, anonimização ou eliminação. Quando os dados se referirem a um cliente de uma oficina, o pedido deve ser dirigido primeiro à oficina responsável pelo cadastro. Para dados de conta, acesso ou suporte da plataforma, use o canal de privacidade indicado nesta política.</Paragraph>
      </Section>

      <Section title="Atualizações">
        <Paragraph>Esta política pode ser atualizada para refletir mudanças no aplicativo, nos provedores utilizados ou nas regras aplicáveis. A versão vigente ficará disponível nesta página, com a data da atualização.</Paragraph>
      </Section>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f3f6fa' },
  content: { width: '100%', paddingVertical: 24, paddingHorizontal: 16 },
  card: { width: '100%', maxWidth: 850, alignSelf: 'center', padding: 26, borderRadius: 18, backgroundColor: '#fff' },
  brand: { color: '#c56019', fontSize: 13, fontWeight: '800' },
  title: { marginTop: 16, color: '#10243a', fontSize: 32, fontWeight: '800' },
  meta: { marginTop: 8, marginBottom: 16, color: '#627489', fontSize: 13 },
  section: { marginTop: 22 },
  heading: { marginBottom: 8, color: '#10243a', fontSize: 19, fontWeight: '800' },
  paragraph: { marginTop: 8, color: '#172b3e', fontSize: 15, lineHeight: 24 },
  listItem: { marginTop: 8, color: '#172b3e', fontSize: 15, lineHeight: 23 },
  strong: { fontWeight: '800' },
  link: { marginTop: 4, color: '#155e92', fontSize: 15, fontWeight: '700', textDecorationLine: 'underline' },
});
