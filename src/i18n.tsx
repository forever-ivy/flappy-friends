import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { GAME_TITLE } from './game/assets';

export type Locale = 'en' | 'pt' | 'es' | 'ko';

const STORAGE_KEY = 'hyunlix-locale';

export const LOCALE_OPTIONS: readonly { value: Locale; label: string }[] = [
    { value: 'en', label: 'English' },
    { value: 'pt', label: 'Português' },
    { value: 'es', label: 'Español' },
    { value: 'ko', label: '한국어' },
];

export interface CharacterCopy {
    name: string;
    tagline: string;
}

interface Dictionary {
    languageLabel: string;
    metaDescription: string;
    bootLoading: string;
    bootErrorTitle: string;
    bootErrorHint: string;
    bootRetry: string;
    accountNav: string;
    muteOn: string;
    muteOff: string;
    openLeaderboard: string;
    signOut: string;
    signIn: string;
    startMenu: string;
    gameTitleWords: readonly string[];
    gameSubtitle: string;
    leaveMessage: string;
    chooseCharacter: string;
    chooseCharacterNamed: (name: string) => string;
    startGame: string;
    tapToJumpHint: string;
    saveProgressEyebrow: string;
    signInTitle: string;
    authHint: string;
    username: string;
    password: string;
    signInBusy: string;
    signInSubmit: string;
    authErrorTaken: string;
    authErrorGeneric: string;
    leaderboardEyebrow: string;
    leaderboardTitle: string;
    tabBest: string;
    tabTotal: string;
    leaderboardLoading: string;
    leaderboardUnavailable: string;
    leaderboardEmpty: string;
    myRank: (rank: number) => string;
    noteEyebrow: string;
    noteTitle: string;
    noteLabel: string;
    notePlaceholder: string;
    nicknameLabel: string;
    nicknamePlaceholder: string;
    noteErrorEmpty: string;
    noteErrorSend: string;
    noteSending: string;
    noteSubmit: string;
    close: string;
    loginToSave: string;
    registerGuideHint: string;
    reviveEyebrow: string;
    reviveTitle: string;
    reviveScore: (score: number) => string;
    reviveHint: string;
    reviveAccept: string;
    reviveSharing: string;
    reviveDecline: string;
    reviveSuccess: string;
    pickCharacter: string;
    playAgain: string;
    shareGame: string;
    shareScore: string;
    shareCopied: string;
    shareFailed: string;
    shareGameTitle: string;
    shareScoreTitle: string;
    shareGameText: string;
    shareScoreText: (score: number, characterName: string, hit143: boolean) => string;
    shareAction: string;
    shareSave: string;
    shareCaption: string;
    shareGenerating: string;
    shareSaved: string;
    countdownSequence: readonly string[];
    defaultMessages: readonly { text: string; author: string }[];
    characters: Record<string, CharacterCopy>;
}

const EN: Dictionary = {
    languageLabel: 'Language',
    metaDescription: 'Play Hyunjin × Felix (Hyunlix): a cute Stray Kids fan flying game with duo mode, leaderboards and a 143 easter egg. Free in your browser — EN/PT/ES/KO.',
    bootLoading: 'Loading…',
    bootErrorTitle: 'Load failed or network is slow',
    bootErrorHint: 'Tap retry. If it keeps failing, try a newer browser.',
    bootRetry: 'Retry',
    accountNav: 'Account and rankings',
    muteOn: 'Unmute',
    muteOff: 'Mute',
    openLeaderboard: 'Open leaderboard',
    signOut: 'Sign out',
    signIn: 'Sign in',
    startMenu: 'Start game',
    gameTitleWords: ['Hyunjin', '×', 'Felix'],
    gameSubtitle: 'Hyunlix',
    leaveMessage: 'Message',
    chooseCharacter: 'Choose character',
    chooseCharacterNamed: (name) => `Choose ${name}`,
    startGame: 'Start game',
    tapToJumpHint: 'Tap to jump',
    saveProgressEyebrow: 'Save progress',
    signInTitle: 'Sign in / Sign up',
    authHint: 'First time? Choose a username and password to create an account. Use the same ones later to sign back in.',
    username: 'Username',
    password: 'Password',
    signInBusy: 'Please wait…',
    signInSubmit: 'Sign in / Sign up',
    authErrorTaken: 'That username is taken or the password is wrong.',
    authErrorGeneric: 'Sign-in failed. Please try again.',
    leaderboardEyebrow: 'Global ranks',
    leaderboardTitle: 'Leaderboard',
    tabBest: 'Best score',
    tabTotal: 'Total score',
    noteEyebrow: 'Danmaku board',
    noteTitle: 'Leave a message',
    noteLabel: 'Message',
    notePlaceholder: 'You got this!',
    nicknameLabel: 'Nickname (optional)',
    nicknamePlaceholder: 'Passerby',
    noteErrorEmpty: 'Write a message between 1 and 32 characters.',
    noteErrorSend: 'Send failed. Please try again.',
    noteSending: 'Sending…',
    noteSubmit: 'Send danmaku',
    close: 'Close',
    loginToSave: 'Sign up to save',
    registerGuideHint: 'Save your score & join the leaderboard',
    reviveEyebrow: 'Second chance',
    reviveTitle: 'Share to revive!',
    reviveScore: (score) => `Score ${score} saved`,
    reviveHint: 'Share Hyunlix to a friend and keep flying right where you fell.',
    reviveAccept: 'Share & revive',
    reviveSharing: 'Sharing…',
    reviveDecline: 'No thanks',
    reviveSuccess: 'Revived! Keep flying ♡',
    pickCharacter: 'Character select',
    playAgain: 'Play again',
    shareGame: 'Share game',
    shareScore: 'Share score',
    shareCopied: 'Copied! Paste it anywhere ♡',
    shareFailed: 'Share failed. Please try again.',
    shareGameTitle: 'Hyunjin × Felix',
    shareScoreTitle: 'My Hyunlix score',
    shareGameText: 'Play Hyunjin × Felix — a cute Hyunlix fan flying game ♡',
    shareScoreText: (score, characterName, hit143) => (
        hit143
            ? `I scored ${score} as ${characterName} in Hyunjin × Felix ♡\nTriggered the 143 easter egg!\nCan you beat me?`
            : `I scored ${score} as ${characterName} in Hyunjin × Felix ♡\nCan you beat me?`
    ),
    shareAction: 'Share',
    shareSave: 'Save',
    shareCaption: 'Copy caption',
    shareGenerating: 'Creating card…',
    shareSaved: 'Saved ♡',
    countdownSequence: ['3', '2', '1', 'GO!'],
    leaderboardLoading: 'Loading…',
    leaderboardUnavailable: 'Leaderboard unavailable',
    leaderboardEmpty: 'No scores yet',
    myRank: (rank) => `My rank #${rank}`,
    defaultMessages: [
        { text: 'Welcome to Hyunlix ♡', author: 'STAY' },
        { text: 'Fly high together!', author: 'Passerby' },
        { text: 'You got this!', author: 'Felix' },
        { text: 'Watch the pastel pillars', author: 'Hyunjin' },
        { text: 'Tap Message to say hi ✿', author: 'Hyunlix' },
    ],
    characters: {
        snow: { name: 'Hyunjin', tagline: 'Dancing through the sky' },
        stripe: { name: 'Felix', tagline: 'Stay with me, fly high' },
        duo: { name: 'Hyunlix', tagline: 'Side by side, just us two' },
    },
};

const PT: Dictionary = {
    languageLabel: 'Idioma',
    metaDescription: 'Jogue Hyunjin × Felix (Hyunlix): um fofo jogo fan de Stray Kids com modo duo, ranking, danmaku e easter egg 143. Grátis no navegador — EN/PT/ES/KO.',
    bootLoading: 'Carregando…',
    bootErrorTitle: 'Falha ao carregar ou rede lenta',
    bootErrorHint: 'Toque em tentar de novo. Se continuar falhando, use um navegador mais recente.',
    bootRetry: 'Tentar de novo',
    accountNav: 'Conta e ranking',
    muteOn: 'Ativar som',
    muteOff: 'Silenciar',
    openLeaderboard: 'Abrir ranking',
    signOut: 'Sair',
    signIn: 'Entrar',
    startMenu: 'Iniciar jogo',
    gameTitleWords: ['Hyunjin', '×', 'Felix'],
    gameSubtitle: 'Hyunlix',
    leaveMessage: 'Mensagem',
    chooseCharacter: 'Escolher personagem',
    chooseCharacterNamed: (name) => `Escolher ${name}`,
    startGame: 'Iniciar jogo',
    tapToJumpHint: 'Toque para pular',
    saveProgressEyebrow: 'Salvar progresso',
    signInTitle: 'Entrar / Criar conta',
    authHint: 'Primeira vez? Escolha um usuário e senha para criar a conta. Use os mesmos depois para entrar de novo.',
    username: 'Usuário',
    password: 'Senha',
    signInBusy: 'Aguarde…',
    signInSubmit: 'Entrar / Criar conta',
    authErrorTaken: 'Esse usuário já existe ou a senha está errada.',
    authErrorGeneric: 'Falha ao entrar. Tente de novo.',
    leaderboardEyebrow: 'Ranking global',
    leaderboardTitle: 'Ranking',
    tabBest: 'Melhor pontuação',
    tabTotal: 'Pontuação total',
    noteEyebrow: 'Painel danmaku',
    noteTitle: 'Deixe uma mensagem',
    noteLabel: 'Mensagem',
    notePlaceholder: 'Você consegue!',
    nicknameLabel: 'Apelido (opcional)',
    nicknamePlaceholder: 'Visitante',
    noteErrorEmpty: 'Escreva uma mensagem de 1 a 32 caracteres.',
    noteErrorSend: 'Falha ao enviar. Tente de novo.',
    noteSending: 'Enviando…',
    noteSubmit: 'Enviar danmaku',
    close: 'Fechar',
    loginToSave: 'Criar conta para salvar',
    registerGuideHint: 'Salve sua pontuação e entre no ranking',
    reviveEyebrow: 'Segunda chance',
    reviveTitle: 'Compartilhe para reviver!',
    reviveScore: (score) => `${score} pontos salvos`,
    reviveHint: 'Compartilhe o Hyunlix com alguém e continue voando de onde caiu.',
    reviveAccept: 'Compartilhar e reviver',
    reviveSharing: 'Compartilhando…',
    reviveDecline: 'Agora não',
    reviveSuccess: 'Reviveu! Continue voando ♡',
    pickCharacter: 'Escolher personagem',
    playAgain: 'Jogar de novo',
    shareGame: 'Compartilhar jogo',
    shareScore: 'Compartilhar pontuação',
    shareCopied: 'Copiado! Cole onde quiser ♡',
    shareFailed: 'Falha ao compartilhar. Tente de novo.',
    shareGameTitle: 'Hyunjin × Felix',
    shareScoreTitle: 'Minha pontuação Hyunlix',
    shareGameText: 'Jogue Hyunjin × Felix — um fofo jogo fan Hyunlix ♡',
    shareScoreText: (score, characterName, hit143) => (
        hit143
            ? `Fiz ${score} com ${characterName} em Hyunjin × Felix ♡\nAtivei o easter egg 143!\nConsegue me superar?`
            : `Fiz ${score} com ${characterName} em Hyunjin × Felix ♡\nConsegue me superar?`
    ),
    shareAction: 'Compartilhar',
    shareSave: 'Salvar',
    shareCaption: 'Copiar texto',
    shareGenerating: 'Criando card…',
    shareSaved: 'Salvo ♡',
    countdownSequence: ['3', '2', '1', 'VAI!'],
    leaderboardLoading: 'Carregando…',
    leaderboardUnavailable: 'Ranking indisponível',
    leaderboardEmpty: 'Ninguém no ranking ainda',
    myRank: (rank) => `Meu rank #${rank}`,
    defaultMessages: [
        { text: 'Bem-vindo ao Hyunlix ♡', author: 'STAY' },
        { text: 'Voem juntos!', author: 'Visitante' },
        { text: 'Você consegue!', author: 'Felix' },
        { text: 'Cuidado com os pilares pastel', author: 'Hyunjin' },
        { text: 'Toque em Mensagem para dizer oi ✿', author: 'Hyunlix' },
    ],
    characters: {
        snow: { name: 'Hyunjin', tagline: 'Dançando pelo céu' },
        stripe: { name: 'Felix', tagline: 'Fica comigo, voa alto' },
        duo: { name: 'Hyunlix', tagline: 'Lado a lado, só nós dois' },
    },
};

const ES: Dictionary = {
    languageLabel: 'Idioma',
    metaDescription: 'Juega Hyunjin × Felix (Hyunlix): un lindo juego fan de Stray Kids con modo dúo, ranking, danmaku y easter egg 143. Gratis en el navegador — EN/PT/ES/KO.',
    bootLoading: 'Cargando…',
    bootErrorTitle: 'Error al cargar o red lenta',
    bootErrorHint: 'Toca reintentar. Si sigue fallando, prueba un navegador más reciente.',
    bootRetry: 'Reintentar',
    accountNav: 'Cuenta y ranking',
    muteOn: 'Activar sonido',
    muteOff: 'Silenciar',
    openLeaderboard: 'Abrir ranking',
    signOut: 'Salir',
    signIn: 'Iniciar sesión',
    startMenu: 'Iniciar juego',
    gameTitleWords: ['Hyunjin', '×', 'Felix'],
    gameSubtitle: 'Hyunlix',
    leaveMessage: 'Mensaje',
    chooseCharacter: 'Elegir personaje',
    chooseCharacterNamed: (name) => `Elegir ${name}`,
    startGame: 'Iniciar juego',
    tapToJumpHint: 'Toca para saltar',
    saveProgressEyebrow: 'Guardar progreso',
    signInTitle: 'Iniciar sesión / Registrarse',
    authHint: '¿Primera vez? Elige usuario y contraseña para crear la cuenta. Usa los mismos después para volver a entrar.',
    username: 'Usuario',
    password: 'Contraseña',
    signInBusy: 'Espera…',
    signInSubmit: 'Entrar / Registrarse',
    authErrorTaken: 'Ese usuario ya existe o la contraseña es incorrecta.',
    authErrorGeneric: 'Error al iniciar sesión. Inténtalo de nuevo.',
    leaderboardEyebrow: 'Ranking global',
    leaderboardTitle: 'Ranking',
    tabBest: 'Mejor puntuación',
    tabTotal: 'Puntuación total',
    noteEyebrow: 'Tablero danmaku',
    noteTitle: 'Deja un mensaje',
    noteLabel: 'Mensaje',
    notePlaceholder: '¡Tú puedes!',
    nicknameLabel: 'Apodo (opcional)',
    nicknamePlaceholder: 'Visitante',
    noteErrorEmpty: 'Escribe un mensaje de 1 a 32 caracteres.',
    noteErrorSend: 'Error al enviar. Inténtalo de nuevo.',
    noteSending: 'Enviando…',
    noteSubmit: 'Enviar danmaku',
    close: 'Cerrar',
    loginToSave: 'Regístrate para guardar',
    registerGuideHint: 'Guarda tu puntuación y súbete al ranking',
    reviveEyebrow: 'Segunda oportunidad',
    reviveTitle: '¡Comparte para revivir!',
    reviveScore: (score) => `${score} puntos guardados`,
    reviveHint: 'Comparte Hyunlix con alguien y sigue volando justo donde caíste.',
    reviveAccept: 'Compartir y revivir',
    reviveSharing: 'Compartiendo…',
    reviveDecline: 'Ahora no',
    reviveSuccess: '¡Reviviste! Sigue volando ♡',
    pickCharacter: 'Elegir personaje',
    playAgain: 'Jugar de nuevo',
    shareGame: 'Compartir juego',
    shareScore: 'Compartir puntuación',
    shareCopied: '¡Copiado! Pégalo donde quieras ♡',
    shareFailed: 'Error al compartir. Inténtalo de nuevo.',
    shareGameTitle: 'Hyunjin × Felix',
    shareScoreTitle: 'Mi puntuación Hyunlix',
    shareGameText: 'Juega Hyunjin × Felix — un lindo juego fan Hyunlix ♡',
    shareScoreText: (score, characterName, hit143) => (
        hit143
            ? `Saqué ${score} con ${characterName} en Hyunjin × Felix ♡\n¡Activé el easter egg 143!\n¿Puedes superarme?`
            : `Saqué ${score} con ${characterName} en Hyunjin × Felix ♡\n¿Puedes superarme?`
    ),
    shareAction: 'Compartir',
    shareSave: 'Guardar',
    shareCaption: 'Copiar texto',
    shareGenerating: 'Creando tarjeta…',
    shareSaved: 'Guardado ♡',
    countdownSequence: ['3', '2', '1', '¡YA!'],
    leaderboardLoading: 'Cargando…',
    leaderboardUnavailable: 'Ranking no disponible',
    leaderboardEmpty: 'Aún no hay puntuaciones',
    myRank: (rank) => `Mi puesto #${rank}`,
    defaultMessages: [
        { text: 'Bienvenido a Hyunlix ♡', author: 'STAY' },
        { text: '¡Volemos juntos!', author: 'Visitante' },
        { text: '¡Tú puedes!', author: 'Felix' },
        { text: 'Cuidado con los pilares pastel', author: 'Hyunjin' },
        { text: 'Toca Mensaje para saludar ✿', author: 'Hyunlix' },
    ],
    characters: {
        snow: { name: 'Hyunjin', tagline: 'Bailando por el cielo' },
        stripe: { name: 'Felix', tagline: 'Quédate conmigo, vuela alto' },
        duo: { name: 'Hyunlix', tagline: 'Juntos, solo nosotros dos' },
    },
};

const KO: Dictionary = {
    languageLabel: '언어',
    metaDescription: 'Hyunjin × Felix (Hyunlix)를 플레이하세요: Hyunjin, Felix, 듀오 모드, 랭킹, danmaku, 143 이스터에그가 있는 귀여운 스트레이키즈 팬 비행 게임. 브라우저에서 무료 — EN/PT/ES/KO.',
    bootLoading: '로딩 중…',
    bootErrorTitle: '불러오기 실패 또는 네트워크가 느립니다',
    bootErrorHint: '다시 시도해 주세요. 계속 실패하면 최신 브라우저를 사용해 보세요.',
    bootRetry: '다시 시도',
    accountNav: '계정 및 랭킹',
    muteOn: '소리 켜기',
    muteOff: '음소거',
    openLeaderboard: '랭킹 열기',
    signOut: '로그아웃',
    signIn: '로그인',
    startMenu: '게임 시작',
    gameTitleWords: ['Hyunjin', '×', 'Felix'],
    gameSubtitle: 'Hyunlix',
    leaveMessage: '메시지',
    chooseCharacter: '캐릭터 선택',
    chooseCharacterNamed: (name) => `${name} 선택`,
    startGame: '게임 시작',
    tapToJumpHint: '탭해서 점프',
    saveProgressEyebrow: '진행 저장',
    signInTitle: '로그인 / 가입',
    authHint: '처음인가요? 아이디와 비밀번호를 정하면 계정이 만들어져요. 다음에 같은 정보로 다시 로그인하세요.',
    username: '사용자 이름',
    password: '비밀번호',
    signInBusy: '잠시만…',
    signInSubmit: '로그인 / 가입',
    authErrorTaken: '이미 사용 중인 이름이거나 비밀번호가 틀렸습니다.',
    authErrorGeneric: '로그인에 실패했습니다. 다시 시도해 주세요.',
    leaderboardEyebrow: '글로벌 랭킹',
    leaderboardTitle: '랭킹',
    tabBest: '최고 점수',
    tabTotal: '누적 점수',
    noteEyebrow: 'Danmaku 게시판',
    noteTitle: '메시지 남기기',
    noteLabel: '메시지',
    notePlaceholder: '할 수 있어!',
    nicknameLabel: '닉네임 (선택)',
    nicknamePlaceholder: '지나가는 사람',
    noteErrorEmpty: '1~32자 메시지를 입력해 주세요.',
    noteErrorSend: '전송에 실패했습니다. 다시 시도해 주세요.',
    noteSending: '전송 중…',
    noteSubmit: 'Danmaku 보내기',
    close: '닫기',
    loginToSave: '가입해서 점수 저장',
    registerGuideHint: '점수를 저장하고 랭킹에 올라가요',
    reviveEyebrow: '두 번째 기회',
    reviveTitle: '공유하고 부활!',
    reviveScore: (score) => `${score}점을 지켰어요`,
    reviveHint: 'Hyunlix를 친구에게 공유하면 넘어진 바로 그 자리에서 다시 날아갈 수 있어요.',
    reviveAccept: '공유하고 부활',
    reviveSharing: '공유 중…',
    reviveDecline: '다음에 할게요',
    reviveSuccess: '부활! 계속 날아가요 ♡',
    pickCharacter: '캐릭터 선택',
    playAgain: '다시 하기',
    shareGame: '게임 공유',
    shareScore: '점수 공유',
    shareCopied: '복사됨! 어디에든 붙여넣기 ♡',
    shareFailed: '공유에 실패했어요. 다시 시도해 주세요.',
    shareGameTitle: 'Hyunjin × Felix',
    shareScoreTitle: '내 Hyunlix 점수',
    shareGameText: 'Hyunjin × Felix — 귀여운 Hyunlix 팬 비행 게임을 플레이해 봐 ♡',
    shareScoreText: (score, characterName, hit143) => (
        hit143
            ? `Hyunjin × Felix에서 ${characterName}(으)로 ${score}점 ♡\n143 이스터에그 발동!\n나보다 잘할 수 있어?`
            : `Hyunjin × Felix에서 ${characterName}(으)로 ${score}점 ♡\n나보다 잘할 수 있어?`
    ),
    shareAction: '공유',
    shareSave: '저장',
    shareCaption: '문구 복사',
    shareGenerating: '카드 만드는 중…',
    shareSaved: '저장됨 ♡',
    countdownSequence: ['3', '2', '1', '출발!'],
    leaderboardLoading: '로딩 중…',
    leaderboardUnavailable: '랭킹을 불러올 수 없습니다',
    leaderboardEmpty: '아직 기록이 없습니다',
    myRank: (rank) => `내 순위 #${rank}`,
    defaultMessages: [
        { text: 'Hyunlix에 온 걸 환영해 ♡', author: 'STAY' },
        { text: '함께 높이 날아요!', author: '지나가는 사람' },
        { text: '할 수 있어!', author: 'Felix' },
        { text: '파스텔 기둥 조심해', author: 'Hyunjin' },
        { text: '메시지를 눌러 인사해 ✿', author: 'Hyunlix' },
    ],
    characters: {
        snow: { name: 'Hyunjin', tagline: '하늘을 춤추듯 날아' },
        stripe: { name: 'Felix', tagline: '함께 있어, 높이 날자' },
        duo: { name: 'Hyunlix', tagline: '나란히, 우리 둘만' },
    },
};

const DICTIONARIES: Record<Locale, Dictionary> = { en: EN, pt: PT, es: ES, ko: KO };

function localeToHtmlLang(locale: Locale): string {
    if (locale === 'pt') return 'pt-BR';
    if (locale === 'es') return 'es';
    if (locale === 'ko') return 'ko';
    return 'en';
}

function readStoredLocale(): Locale {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'en' || stored === 'pt' || stored === 'es' || stored === 'ko') return stored;
    } catch {
        // ignore
    }
    return 'en';
}

interface I18nContextValue {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: Dictionary;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());
    const setLocale = useCallback((next: Locale) => {
        setLocaleState(next);
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // ignore
        }
        document.documentElement.lang = localeToHtmlLang(next);
    }, []);

    const value = useMemo<I18nContextValue>(() => ({
        locale,
        setLocale,
        t: DICTIONARIES[locale],
    }), [locale, setLocale]);

    useEffect(() => {
        const dict = DICTIONARIES[locale];
        const pageTitle = `${GAME_TITLE} | Hyunlix Fan Flying Game — Play Free`;
        document.documentElement.lang = localeToHtmlLang(locale);
        document.title = pageTitle;

        const setMeta = (selector: string, attr: string, value: string) => {
            const el = document.querySelector(selector);
            if (el) el.setAttribute(attr, value);
        };
        setMeta('meta[name="description"]', 'content', dict.metaDescription);
        setMeta('meta[property="og:title"]', 'content', `${GAME_TITLE} | Hyunlix Fan Flying Game`);
        setMeta('meta[property="og:description"]', 'content', dict.metaDescription);
        setMeta('meta[name="twitter:title"]', 'content', `${GAME_TITLE} | Hyunlix Fan Flying Game`);
        setMeta('meta[name="twitter:description"]', 'content', dict.metaDescription);

        const ogLocale = locale === 'pt' ? 'pt_BR'
            : locale === 'es' ? 'es_ES'
                : locale === 'ko' ? 'ko_KR'
                    : 'en_US';
        setMeta('meta[property="og:locale"]', 'content', ogLocale);
    }, [locale]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
    const ctx = useContext(I18nContext);
    if (!ctx) throw new Error('useI18n must be used within I18nProvider');
    return ctx;
}

export function getCharacterCopy(locale: Locale, id: string): CharacterCopy {
    return DICTIONARIES[locale].characters[id] ?? DICTIONARIES.en.characters.snow;
}

export function getCountdownSequence(locale: Locale): readonly string[] {
    return DICTIONARIES[locale].countdownSequence;
}
