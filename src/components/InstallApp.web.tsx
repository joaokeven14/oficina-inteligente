import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type BrowserKind = 'ios-safari' | 'ios-other' | 'android' | 'edge' | 'chrome' | 'mac-safari' | 'other';

function browserKind(): BrowserKind {
  const agent = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(agent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(agent) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|OPiOS|GSA|DuckDuckGo/.test(agent);
  if (ios) return safari ? 'ios-safari' : 'ios-other';
  if (/Android/.test(agent)) return 'android';
  if (/Edg\//.test(agent)) return 'edge';
  if (/Chrome|Chromium/.test(agent)) return 'chrome';
  if (safari && /Mac/.test(agent)) return 'mac-safari';
  return 'other';
}

function isAppWindow() {
  return ['standalone', 'minimal-ui', 'fullscreen'].some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches)
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function instructions(kind: BrowserKind): { title: string; steps: string[] } {
  // Labels follow the official Apple, Chrome and Microsoft browser help pages.
  if (kind === 'ios-safari') return {
    title: 'Instalar no iPhone ou iPad',
    steps: [
      'No Safari, toque em Compartilhar (quadrado com uma seta para cima). Em alguns layouts, essa opção fica dentro do menu da página.',
      'Escolha Adicionar à Tela de Início. Se a opção não aparecer, role a lista e procure em Editar Ações.',
      'Se aparecer Abrir como App Web, deixe essa opção ativada. Toque em Adicionar.',
      'Abra Oficina Inteligente pelo novo ícone na tela inicial e entre com sua conta.',
    ],
  };
  if (kind === 'ios-other') return {
    title: 'Continue pelo Safari',
    steps: [
      'Copie o endereço abaixo e abra-o no Safari do iPhone ou iPad.',
      'No Safari, abra Compartilhar e escolha Adicionar à Tela de Início.',
      'Se aparecer Abrir como App Web, ative-a e toque em Adicionar. Depois, abra o aplicativo pelo ícone criado.',
    ],
  };
  if (kind === 'android') return {
    title: 'Instalar no Android',
    steps: [
      'Abra este endereço no Google Chrome.',
      'No menu de três pontos do navegador, escolha Adicionar à tela inicial ou Instalar app.',
      'Confirme a instalação e abra Oficina Inteligente pelo ícone criado no aparelho.',
    ],
  };
  if (kind === 'edge') return {
    title: 'Instalar no computador',
    steps: [
      'Clique no ícone de instalação à direita da barra de endereço, quando ele aparecer.',
      'Como alternativa, abra o menu de três pontos do Edge, depois Mais ferramentas, Aplicativos e Instalar este site como um aplicativo.',
      'Confirme Instalar. Depois, abra Oficina Inteligente pelo menu Iniciar ou pelo atalho criado.',
    ],
  };
  if (kind === 'chrome') return {
    title: 'Instalar no computador',
    steps: [
      'Clique no ícone Instalar à direita da barra de endereço, quando ele aparecer.',
      'Como alternativa, abra o menu de três pontos do Chrome, depois Transmitir, salvar e compartilhar e Instalar esta página como um app.',
      'Confirme a instalação. Depois, abra Oficina Inteligente pelo atalho ou pelo menu de aplicativos do computador.',
    ],
  };
  if (kind === 'mac-safari') return {
    title: 'Instalar no Mac',
    steps: [
      'No menu Arquivo do Safari, escolha Adicionar ao Dock, se essa opção estiver disponível.',
      'Confira o nome Oficina Inteligente e clique em Adicionar.',
      'Abra o aplicativo pelo ícone criado no Dock.',
    ],
  };
  return {
    title: 'Instalar Oficina Inteligente',
    steps: [
      'Abra este endereço no Google Chrome ou Microsoft Edge do computador, ou no Chrome do Android.',
      'No menu do navegador, procure Instalar app ou Adicionar à tela inicial e confirme.',
      'No iPhone ou iPad, use o Safari e a opção Compartilhar, depois Adicionar à Tela de Início.',
    ],
  };
}

const button: CSSProperties = {
  border: 0, borderRadius: 8, padding: '9px 14px', minHeight: 40,
  font: '600 13px system-ui, sans-serif', cursor: 'pointer',
};

/** Web-only installation controls. No account data is required to install. */
export default function InstallApp() {
  const [installed, setInstalled] = useState(isAppWindow);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [prompting, setPrompting] = useState(false);
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const kind = browserKind();
  const guide = instructions(kind);
  const address = `${window.location.origin}/`;

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const syncInstalled = () => setInstalled(isAppWindow());
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      dialog.current?.close();
    };
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('pageshow', syncInstalled);
    media.addEventListener('change', syncInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('pageshow', syncInstalled);
      media.removeEventListener('change', syncInstalled);
    };
  }, []);

  const openGuide = () => {
    setMessage('');
    dialog.current?.showModal();
  };
  const install = async () => {
    if (!installPrompt) { openGuide(); return; }
    setPrompting(true);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === 'dismissed') openGuide();
    } catch {
      setInstallPrompt(null);
      openGuide();
    } finally { setPrompting(false); }
  };
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setMessage('Endereço copiado. Abra o Safari e cole na barra de endereço.');
    } catch { setMessage('Selecione o endereço abaixo e copie para abrir no Safari.'); }
  };

  if (installed || !window.isSecureContext) return null;

  return <>
    <style>{`
      .oi-install-dialog::backdrop { background: rgba(10, 24, 40, .65); }
      .oi-install-button:focus-visible { outline: 3px solid #e97824; outline-offset: 3px; }
      .oi-install-button:disabled { opacity: .6; cursor: wait; }
      @media (max-width: 480px) { .oi-install-caption { display: none; } }
    `}</style>
    <aside aria-label="Instalação do aplicativo" style={{ background: '#fff5ed', borderBottom: '1px solid #f4d9c4', color: '#10243a', fontFamily: 'system-ui, sans-serif', flexShrink: 0 }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, lineHeight: 1.4 }}>
          <strong>Oficina Inteligente no seu aparelho</strong>
          <span className="oi-install-caption" style={{ display: 'block', color: '#64758a', fontSize: 11 }}>Abra pelo ícone na tela inicial ou no computador.</span>
        </div>
        <button className="oi-install-button" type="button" disabled={prompting} onClick={() => { install(); }} style={{ ...button, color: '#fff', background: '#10243a', whiteSpace: 'nowrap' }}>
          {prompting ? 'Aguarde…' : installPrompt ? 'Instalar app' : 'Como instalar'}
        </button>
      </div>
    </aside>
    <dialog className="oi-install-dialog" ref={dialog} aria-labelledby="oi-install-title" onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }} style={{ width: 'min(520px, calc(100vw - 32px))', boxSizing: 'border-box', maxHeight: 'calc(100dvh - 32px)', padding: 24, border: 0, borderRadius: 16, color: '#10243a', background: '#fff', boxShadow: '0 20px 70px rgba(10,24,40,.25)', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
        <h2 id="oi-install-title" style={{ fontSize: 21, lineHeight: 1.3, margin: 0 }}>{guide.title}</h2>
        <button className="oi-install-button" type="button" aria-label="Fechar instruções de instalação" onClick={() => dialog.current?.close()} style={{ ...button, background: '#eef3f8', color: '#10243a', padding: '8px 12px' }}>Fechar</button>
      </div>
      <ol style={{ paddingLeft: 23, margin: '22px 0 16px', fontSize: 14, lineHeight: 1.6 }}>
        {guide.steps.map((step) => <li key={step} style={{ marginBottom: 12, paddingLeft: 4 }}>{step}</li>)}
      </ol>
      {kind === 'ios-other' ? <div style={{ padding: 12, background: '#f3f6f9', borderRadius: 10 }}>
        <label htmlFor="oi-install-address" style={{ display: 'block', fontSize: 12, marginBottom: 7 }}>Endereço do aplicativo</label>
        <input id="oi-install-address" readOnly value={address} onFocus={(event) => event.currentTarget.select()} style={{ boxSizing: 'border-box', width: '100%', padding: 10, border: '1px solid #dce3eb', borderRadius: 7, color: '#10243a', background: '#fff', fontSize: 13 }} />
        <button className="oi-install-button" type="button" onClick={() => { copyAddress(); }} style={{ ...button, color: '#fff', background: '#10243a', marginTop: 10 }}>Copiar endereço</button>
      </div> : null}
      {message ? <p role="status" style={{ color: '#315a80', fontSize: 13, lineHeight: 1.5 }}>{message}</p> : null}
      <p style={{ padding: 12, margin: '18px 0 0', color: '#64758a', background: '#f3f6f9', borderRadius: 10, fontSize: 12, lineHeight: 1.6 }}>A instalação cria um acesso no seu aparelho. Para entrar, consultar ou salvar os dados da oficina, mantenha conexão com a internet.</p>
    </dialog>
  </>;
}
