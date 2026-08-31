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
    saveProgressEyebrow: string;
    signInTitle: string;
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
    pickCharacter: string;
    playAgain: string;
    countdownSequence: readonly string[];
    defaultMessages: readonly { text: string; author: string }[];
    characters: Record<string, CharacterCopy>;
}

const EN: Dictionary = {
    languageLabel: 'Language',
    metaDescription: 'Hyunjin × Felix (Hyunlix): a cute duo fan flying game with three characters, leaderboards, and danmaku messages.',
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
    saveProgressEyebrow: 'Save progress',
    signInTitle: 'Sign in',
    username: 'Username',
    password: 'Password',
    signInBusy: 'Please wait…',
    signInSubmit: 'Sign in',
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
    loginToSave: 'Sign in to save',
    pickCharacter: 'Character select',
    playAgain: 'Play again',
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
    metaDescription: 'Hyunjin × Felix (Hyunlix): um jogo fofo de fã com três personagens, ranking e mensagens danmaku.',
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
    saveProgressEyebrow: 'Salvar progresso',
    signInTitle: 'Entrar',
    username: 'Usuário',
    password: 'Senha',
    signInBusy: 'Aguarde…',
    signInSubmit: 'Entrar',
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
    loginToSave: 'Entrar para salvar',
    pickCharacter: 'Escolher personagem',
    playAgain: 'Jogar de novo',
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
    metaDescription: 'Hyunjin × Felix (Hyunlix): un juego fan adorable con tres personajes, ranking y mensajes danmaku.',
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
    saveProgressEyebrow: 'Guardar progreso',
    signInTitle: 'Iniciar sesión',
    username: 'Usuario',
    password: 'Contraseña',
    signInBusy: 'Espera…',
    signInSubmit: 'Entrar',
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
    loginToSave: 'Inicia sesión para guardar',
    pickCharacter: 'Elegir personaje',
    playAgain: 'Jugar de nuevo',
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
    metaDescription: 'Hyunjin × Felix (Hyunlix): 세 캐릭터, 랭킹, danmaku 메시지가 있는 귀여운 팬 플라이 게임.',
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
    saveProgressEyebrow: '진행 저장',
    signInTitle: '로그인',
    username: '사용자 이름',
    password: '비밀번호',
    signInBusy: '잠시만…',
    signInSubmit: '로그인',
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
    loginToSave: '저장하려면 로그인',
    pickCharacter: '캐릭터 선택',
    playAgain: '다시 하기',
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
        document.documentElement.lang = localeToHtmlLang(locale);
        document.title = GAME_TITLE;
        const meta = document.querySelector('meta[name="description"]');
        if (meta) meta.setAttribute('content', DICTIONARIES[locale].metaDescription);
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
