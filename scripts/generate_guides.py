from pathlib import Path
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'output' / 'guide-assets'
OUT = ROOT / 'output' / 'pdf'
W, H = 960, 540
NAVY = HexColor('#10243a')
INK = HexColor('#182a3e')
ORANGE = HexColor('#e97824')
MUTED = HexColor('#64758a')
PALE = HexColor('#f3f6f9')
BORDER = HexColor('#e1e8ef')
pdfmetrics.registerFont(TTFont('Segoe', r'C:\Windows\Fonts\segoeui.ttf'))
pdfmetrics.registerFont(TTFont('Segoe-Bold', r'C:\Windows\Fonts\segoeuib.ttf'))

style_title = ParagraphStyle('title', fontName='Segoe-Bold', fontSize=28, leading=34, textColor=INK)
style_sub = ParagraphStyle('sub', fontName='Segoe', fontSize=12, leading=18, textColor=MUTED)
style_card_title = ParagraphStyle('cardtitle', fontName='Segoe-Bold', fontSize=14, leading=18, textColor=INK)
style_body = ParagraphStyle('body', fontName='Segoe', fontSize=11, leading=16, textColor=INK)
style_step_body = ParagraphStyle('stepbody', fontName='Segoe', fontSize=10, leading=14, textColor=INK)
style_small = ParagraphStyle('small', fontName='Segoe', fontSize=9, leading=13, textColor=MUTED)
style_white = ParagraphStyle('white', fontName='Segoe', fontSize=13, leading=19, textColor=white)

# Make role-focused image crops from the generated photo triptychs.
def crop(src, index, name):
    im = Image.open(src).convert('RGB')
    width, height = im.size
    left = round(index * width / 3)
    right = round((index + 1) * width / 3)
    path = ASSETS / name
    im.crop((left, 0, right, height)).save(path, quality=92)
    return path

photos = {
    'owner': crop(ASSETS / 'workshop-triptych.png', 0, 'owner.jpg'),
    'mechanic': crop(ASSETS / 'workshop-triptych.png', 1, 'mechanic.jpg'),
    'stock': crop(ASSETS / 'workshop-triptych.png', 2, 'stock.jpg'),
    'commercial': crop(ASSETS / 'business-triptych.png', 0, 'commercial.jpg'),
    'finance': crop(ASSETS / 'business-triptych.png', 1, 'finance.jpg'),
    'reports': crop(ASSETS / 'business-triptych.png', 2, 'reports.jpg'),
    'admin': ASSETS / 'admin.png',
}

# Each guide has distinct role-specific steps; screens are described as implemented navigation, not fabricated screenshots.
guides = [
  dict(file='01-administrador-da-plataforma.pdf', role='ADMINISTRADOR DA PLATAFORMA', title='Administrar oficinas com segurança', photo='admin', caption='Imagem ilustrativa: gestão da plataforma em ambiente administrativo.',
       intro='A área /admin é exclusiva para a conta que foi provisionada como administrador geral. O cadastro público não concede essa função.',
       flow=[('1. Entrar na administração','Entre com a conta admin provisionada e abra Administração. Se o menu não aparecer, essa conta ainda não tem o acesso geral.'),('2. Criar oficina','Preencha nome da oficina, nome e e-mail do proprietário. Clique Criar e enviar convite e confirme a mensagem de sucesso.'),('3. Localizar e conferir','Pesquise pelo nome da oficina. Revise status, data de criação e usuários vinculados antes de alterar qualquer acesso.'),('4. Bloquear ou reativar','Abra as ações da oficina, escolha Bloquear ou Reativar e confirme. Confira o novo status; os registros permanecem guardados.')],
       detail=[('Indicadores reais','O topo mostra oficinas totais, ativas e bloqueadas, usuários vinculados e eventos de auditoria do dia.'),('Convites','A função Edge envia o convite e cria o vínculo de proprietário. O administrador não define nem consulta a senha do usuário.'),('Cuidados','A primeira conta admin precisa ser provisionada por procedimento seguro no SQL Editor. Nunca coloque SUPABASE_SERVICE_ROLE_KEY no app.')],
       note='Precisa de projeto Supabase, variáveis seguras e função Edge publicada; sem isso a tela não consegue enviar convites.'),
  dict(file='02-proprietario-da-oficina.pdf', role='PROPRIETÁRIO / GESTOR', title='Configurar e acompanhar sua oficina', photo='owner', caption='Imagem ilustrativa: proprietário acompanhando a operação da oficina.',
       intro='O proprietário trabalha somente nos dados da própria oficina. As permissões são verificadas no banco, além de controlar quais módulos aparecem para cada funcionário.',
       flow=[('1. Aceitar convite e entrar','Abra o convite por e-mail, aceite-o e defina sua senha. Entre no app e confira no cabeçalho se a oficina selecionada é a sua.'),('2. Configurar oficina','Abra Configurações, preencha nome, CNPJ, endereço e contatos; envie o logotipo e toque Salvar. Confira os dados gravados.'),('3. Convidar funcionários','Abra Funcionários, convide pelo e-mail e escolha permissões de visualização, criação, edição e exclusão para cada módulo.'),('4. Acompanhar resultados','Abra Relatórios, selecione o período e toque Atualizar produtividade. Confira OS, minutos e comissão estimada; na web, exporte CSV.')],
       detail=[('Gestão e segurança','Defina permissões individuais. Funcionários não recebem o papel de administrador geral; os dados ficam isolados por oficina.'),('Equipe e comissão','Configure o percentual sobre mão de obra e consulte minutos e comissão estimada nos relatórios. Não há pagamento automático.'),('Rotina integrada','A entrega da OS gera uma conta a receber; compras recebidas atualizam estoque e conta a pagar. Revise pendências e alertas ao fechar o dia.')],
       note='Configure Supabase e convites antes de começar. O proprietário envia o logotipo em Configurações; PDFs são impressos na web. Backups de produção ainda dependem de configuração.'),
  dict(file='03-mecanico-e-ordens-de-servico.pdf', role='MECÂNICO / TÉCNICO', title='Registrar diagnóstico e execução', photo='mechanic', caption='Imagem ilustrativa: inspeção técnica de veículo na oficina.',
       intro='Use seu login individual. A lista de módulos e as ações disponíveis dependem das permissões concedidas pelo proprietário.',
       flow=[('1. Abrir ou criar uma OS','Em Ordens de Serviço, escolha cliente e veículo; informe quilometragem e reclamação. Salve e anote o número automático da ordem.'),('2. Fazer checklist e inspeção','Abra a OS, marque cada item como adequado, atenção ou avaria; no laudo, use bom, atenção, crítico ou não inspecionado.'),('3. Registrar o trabalho','Informe diagnóstico, adicione mão de obra e peças, inclua observações e fotos. Para medir tempo, toque Iniciar e depois Encerrar.'),('4. Finalizar e entregar','Atualize o status conforme o serviço. Registre autorização de entrega assinada antes de marcar Entregue e emitir o comprovante.')],
       detail=[('Checklist e laudo','A OS recebe itens de checklist de entrada e inspeção. Itens não avaliados permanecem como não inspecionados.'),('Notas, autorização e tempo','Registre diagnóstico, aceite desenhado do cliente e use Iniciar/Encerrar para registrar os minutos trabalhados.'),('Estoque seguro','Remover peça ou cancelar OS estorna o saldo; reabrir aplica a baixa novamente. Saldo insuficiente impede a operação.')],
       note='Comissão é estimada, sem pagamento automático. A assinatura é um aceite operacional, não certificado. No Windows, envie fotos pela web/PWA. O comprovante exige autorização Entrega.'),
  dict(file='04-area-comercial-clientes-e-orcamentos.pdf', role='ÁREA COMERCIAL', title='Atender clientes e acompanhar orçamentos', photo='commercial', caption='Imagem ilustrativa: consultoria de serviço com cliente e veículo.',
       intro='A área comercial organiza o histórico do cliente, os veículos e as propostas que alimentam as ordens de serviço.',
       flow=[('1. Localizar ou cadastrar cliente','Abra Clientes e pesquise por nome ou CPF/CNPJ. Se não existir, toque Novo, preencha contato e endereço e salve.'),('2. Vincular o veículo','Abra Veículos, toque Novo, selecione o cliente e informe placa, marca, modelo, ano e quilometragem; salve e confira o vínculo.'),('3. Criar e revisar orçamento','Abra Orçamentos, escolha cliente e veículo, adicione serviços/peças, defina validade e desconto; confira o total antes de salvar.'),('4. Registrar a resposta','Abra o orçamento e marque Aprovado ou Rejeitado. Para aprovado, registre a autorização do cliente e use Converter em OS.')],
       detail=[('Pesquisar e consultar','Use nome, documento, placa ou número da OS para localizar o atendimento; o histórico fica relacionado ao veículo.'),('Pós-venda','Cadastre lembretes por data ou quilometragem e garantias vinculadas a uma OS concluída/entregue.'),('Transparência','A autorização pode ser assinada no painel da OS; a aprovação do orçamento fica registrada separadamente. O registro desenhado não é certificado.')],
       note='O orçamento pode ser impresso/salvo como PDF na web; no app nativo, é compartilhado como texto. Envio direto por WhatsApp/e-mail ainda não está integrado.'),
  dict(file='05-estoque-fornecedores-e-compras.pdf', role='ESTOQUE E COMPRAS', title='Controlar peças da entrada à OS', photo='stock', caption='Imagem ilustrativa: conferência de peças e itens de estoque.',
       intro='Cadastre catálogo, saldo mínimo e custos. Compras aguardam recebimento; o estoque só muda quando a compra é recebida.',
       flow=[('1. Cadastrar ou localizar peça','Abra Estoque e pesquise por nome/código. Se faltar, toque Novo, informe descrição, custo, preço e mínimo e salve.'),('2. Cadastrar fornecedor','Abra Fornecedores e compras, toque Novo fornecedor, preencha contato e salve; pesquise-o para confirmar o cadastro.'),('3. Registrar pedido de compra','Crie uma compra, escolha fornecedor e adicione cada peça, quantidade e custo unitário; informe vencimento e salve como pendente.'),('4. Conferir e receber','Quando a mercadoria chegar, abra Recebimentos pendentes, confira itens e quantidades e toque Receber. Revise saldo e conta a pagar.')],
       detail=[('Movimentação manual','Use entrada ou saída para ajustes identificados. Cada movimento gera histórico auditável e saída não pode deixar saldo negativo.'),('Baixa pela OS','Peças vinculadas a uma OS baixam uma única vez. Cancelamento/remover item estorna; reabertura repõe o consumo.'),('Alertas','O painel e o relatório atual apontam produtos em ou abaixo do mínimo cadastrado.')],
       note='O recebimento atualiza saldo e custo. O pagamento ao fornecedor pode ser estornado com motivo e histórico; isso não cancela a compra nem altera o estoque.'),
  dict(file='06-financeiro-contas-a-pagar-e-receber.pdf', role='ÁREA FINANCEIRA', title='Acompanhar o caixa operacional', photo='finance', caption='Imagem ilustrativa: conferência financeira em uma oficina.',
       intro='Os totais distinguem valores pendentes dos pagamentos efetivamente realizados. Orçamentos pendentes não contam como receita recebida.',
       flow=[('1. Conferir o painel','Abra Painel e revise valores a receber, vencidos, recebidos e despesas pagas. Abra Financeiro para ver cada lançamento.'),('2. Registrar receita','Em Financeiro, crie Conta a receber, selecione cliente, valor e vencimento e salve; confira a OS vinculada, se houver.'),('3. Registrar e liquidar despesa','Crie despesa com categoria, valor e vencimento. Marque Paga somente depois de confirmar que o pagamento ocorreu.'),('4. Revisar compra e estorno','Abra contas a pagar e confirme o pagamento real. Se precisar estornar, escolha Estornar pagamento e informe o motivo.')],
       detail=[('Filtrar e revisar','Use Relatórios por período. Recebimentos/despesas pagos e contas pendentes são apresentados separadamente.'),('Auditoria e comprovantes','Liquidações e estornos guardam autor, data original e motivo. O recibo pode ser impresso na web ou compartilhado como texto.'),('Interpretação','Resultado é visão operacional de caixa recebido menos despesas pagas; não substitui conciliação, contabilidade ou cálculo fiscal.')],
       note='Estornar pagamento ao fornecedor não cancela a compra nem reverte estoque. Não há integração bancária ou emissão fiscal; mantenha cópias de segurança no Supabase.'),
  dict(file='07-pos-venda-garantias-e-lembretes.pdf', role='PÓS-VENDA', title='Programar o próximo atendimento', photo='commercial', caption='Imagem ilustrativa: relacionamento com cliente no pós-atendimento.',
       intro='Use o cadastro de lembretes e garantias para acompanhar revisões e condições ligadas a serviços realizados.',
       flow=[('1. Localizar o veículo','Abra Pós-venda, pesquise pela placa ou cliente e selecione o veículo correto antes de criar um registro.'),('2. Criar lembrete','Toque Novo lembrete, informe manutenção e data ou quilometragem prevista, escreva observações e salve.'),('3. Cadastrar garantia','Toque Nova garantia, selecione OS concluída/entregue, informe serviço, prazo e condições e salve.'),('4. Acompanhar pendências','Volte à lista de Pós-venda e revise lembretes próximos e garantias vigentes/vencidas; contate o cliente manualmente.')],
       detail=[('Exemplos','Troca de óleo, filtros, correia, pneus ou revisão periódica. Use apenas datas e quilometragens acordadas com o cliente.'),('Histórico','Registros ficam vinculados ao veículo/oficina e respeitam o isolamento por oficina. Gere o documento de histórico na web para imprimir/salvar como PDF; nos apps nativos, compartilhe os dados em texto.'),('Comunicação','O sistema armazena a programação, mas ainda não dispara WhatsApp, SMS ou e-mail automaticamente.')],
       note='Notificações automáticas futuras não estão simuladas; a equipe precisa consultar a lista no sistema.'),
  dict(file='08-relatorios-e-indicadores.pdf', role='RELATÓRIOS E INDICADORES', title='Usar os números com contexto', photo='reports', caption='Imagem ilustrativa: análise de indicadores da oficina.',
       intro='Os relatórios partem dos registros salvos e respeitam as permissões por módulo. Cadastros e posição do estoque representam o estado atual.',
       flow=[('1. Definir o período','Abra Relatórios, informe De e Até em AAAA-MM-DD e toque Atualizar para carregar os dados do intervalo.'),('2. Conferir ordens e vendas','Revise OS abertas/entregues, valores entregues e orçamentos criados/aprovados; confirme o período exibido.'),('3. Revisar equipe e alertas','Confira estoque baixo, compras, garantias e lembretes. Para produtividade, escolha datas e toque Atualizar produtividade.'),('4. Exportar ou imprimir','Na web, toque Exportar resumo CSV e abra o arquivo baixado. Use Imprimir/Salvar PDF para guardar o relatório.')],
       detail=[('Financeiro','Recebimentos e despesas são filtrados pela data de liquidação; contas pendentes são exibidas separadamente.'),('Equipe','O proprietário atualiza a produtividade por período: OS entregues, valor de mão de obra, minutos registrados e comissão estimada conforme o percentual configurado.'),('Formato','A versão web imprime/salva o relatório como PDF e exporta CSV. No Android/iOS o resumo é compartilhado como texto; exportação CSV nativa do Windows não está integrada.')],
       note='Interprete lucro/resultado como estimativa operacional, não como demonstrativo contábil ou fiscal.'),
]

def para(c, text, style, x, top, width, max_height=None):
    p = Paragraph(text, style)
    aw, ah = p.wrap(width, 1000)
    if max_height is not None and ah > max_height:
        raise ValueError(f'Paragraph too tall ({ah}>{max_height}): {text[:80]}')
    p.drawOn(c, x, top - ah)
    return ah

def footer(c, page, role):
    c.setFillColor(MUTED); c.setFont('Segoe', 8)
    c.drawString(36, 18, 'OFICINA INTELIGENTE  |  GUIA DE USO')
    c.drawRightString(W-36, 18, f'{role}  ·  {page}/3')

def image_panel(c, path, caption):
    x, y, w, h = 630, 0, 330, H
    c.drawImage(str(path), x, y, width=w, height=h, preserveAspectRatio=True, anchor='c', mask='auto')
    c.setFillColor(Color(0.04,0.09,0.15,alpha=0.83)); c.rect(x, 0, w, 66, fill=1, stroke=0)
    para(c, caption, ParagraphStyle('cap', fontName='Segoe', fontSize=9, leading=12, textColor=white), x+18, 51, w-36, 40)

def build(g):
    path = OUT / g['file']
    c = canvas.Canvas(str(path), pagesize=(W,H))
    c.setTitle(f"Oficina Inteligente - {g['role']}")
    c.setAuthor('Oficina Inteligente')
    photo = photos[g['photo']]
    # Slide 1: photographic title slide.
    c.drawImage(str(photo), 0, 0, width=W, height=H, preserveAspectRatio=False, mask='auto')
    c.setFillColor(Color(0.03,0.07,0.12,alpha=0.82)); c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(ORANGE); c.roundRect(52, H-84, 210, 28, 14, fill=1, stroke=0)
    c.setFillColor(white); c.setFont('Segoe-Bold',10); c.drawCentredString(157,H-75,'GUIA RÁPIDO · 2026')
    para(c, g['role'], ParagraphStyle('role',fontName='Segoe-Bold',fontSize=12,leading=16,textColor=HexColor('#ffb273')),52,H-120,560,42)
    para(c,g['title'],ParagraphStyle('cover',fontName='Segoe-Bold',fontSize=34,leading=40,textColor=white),52,H-160,570,124)
    para(c,g['intro'],style_white,54,230,550,78)
    c.setFillColor(Color(0.03,0.07,0.12,alpha=0.75)); c.roundRect(52,40,560,46,10,fill=1,stroke=0)
    para(c,g['caption'],ParagraphStyle('covercap',fontName='Segoe',fontSize=8,leading=11,textColor=white),68,72,525,30)
    c.setFillColor(white); c.setFont('Segoe',9); c.drawRightString(W-40,20,'Oficina Inteligente  ·  1/3')
    c.showPage()
    # Slide 2: four numbered steps and photographic side panel.
    c.setFillColor(white); c.rect(0,0,W,H,fill=1,stroke=0); image_panel(c,photo,g['caption'])
    c.setFillColor(ORANGE); c.roundRect(36,H-61,80,21,10,fill=1,stroke=0)
    c.setFillColor(white); c.setFont('Segoe-Bold',8); c.drawCentredString(76,H-54,'PASSO A PASSO')
    para(c,'Passo a passo',style_title,36,H-83,540,44)
    para(c,g['intro'],style_sub,36,H-126,545,48)
    y=H-194
    for title, body in g['flow']:
        c.setFillColor(PALE); c.roundRect(36,y-62,548,70,10,fill=1,stroke=0)
        c.setFillColor(ORANGE); c.circle(57,y-27,11,fill=1,stroke=0)
        c.setFillColor(white); c.setFont('Segoe-Bold',9); c.drawCentredString(57,y-30,title.split('.')[0])
        para(c,title.split('. ',1)[1],style_card_title,78,y-12,490,24)
        para(c,body,style_step_body,78,y-36,490,42)
        y-=78
    footer(c,2,g['role']); c.showPage()
    # Slide 3: operational notes and limits.
    c.setFillColor(white); c.rect(0,0,W,H,fill=1,stroke=0); image_panel(c,photo,g['caption'])
    c.setFillColor(ORANGE); c.roundRect(36,H-61,145,21,10,fill=1,stroke=0)
    c.setFillColor(white); c.setFont('Segoe-Bold',8); c.drawCentredString(108,H-54,'USO RESPONSÁVEL')
    para(c,'Pontos importantes',style_title,36,H-83,540,44)
    y=H-150
    for title, body in g['detail']:
        c.setFillColor(PALE); c.roundRect(36,y-72,548,78,10,fill=1,stroke=0)
        para(c,title,style_card_title,54,y-14,510,23)
        para(c,body,style_body,54,y-39,510,42)
        y-=89
    c.setFillColor(HexColor('#fff4e9')); c.roundRect(36,32,548,65,10,fill=1,stroke=0)
    para(c,'<b>Limite atual:</b> '+g['note'],ParagraphStyle('note',fontName='Segoe',fontSize=9,leading=13,textColor=HexColor('#7b4a20')),52,81,516,42)
    footer(c,3,g['role']); c.showPage(); c.save()

for guide in guides:
    build(guide)
print(f'Generated {len(guides)} guides in {OUT}')



