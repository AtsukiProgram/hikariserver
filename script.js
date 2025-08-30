// Firebase v9 Modular SDK インポート
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, get, child, onValue, off } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Firebase設定
const firebaseConfig = {
    apiKey: "AIzaSyBypbd3t_1FycOdFPIWLLzhz-Z7hHNFqTg",
    authDomain: "hikari-server-data.firebaseapp.com",
    databaseURL: "https://hikari-server-data-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "hikari-server-data",
    storageBucket: "hikari-server-data.firebasestorage.app",
    messagingSenderId: "513214205524",
    appId: "1:513214205524:web:11369148fb6429fe1567c1"
};

// Discord OAuth2設定（実際の認証情報）
const DISCORD_CONFIG = {
    CLIENT_ID: "1408428315974434906",
    CLIENT_SECRET: "aEhzDpiEnA0sjsnXG7FbX-KZu8176TsK",
    REDIRECT_URI: "https://hikaripage.f5.si/",
    AUTH_URL: "https://discord.com/api/oauth2/authorize",
    TOKEN_URL: "https://discord.com/api/oauth2/token",
    API_BASE: "https://discord.com/api/v10",
    SCOPE: "identify email"
};

// Firebase初期化
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

class LightServerWebsite {
    constructor() {
        this.userMode = 'guest';
        this.currentPage = 'top';
        this.isLoggedIn = false;
        this.currentUser = null;
        this.accessToken = null;
        this.refreshToken = null;
        this.userWebs = [];
        this.userNotifications = [];
        this.adminOverride = false;
        this.isPromptActive = false;
        this.allUsers = []; // 全ユーザー一覧
        this.dailyContactCount = 0; // 1日のお問い合わせ回数
        this.lastContactDate = ''; // 最後にお問い合わせした日
        this.realtimeListeners = {}; // リアルタイム更新用リスナー

        this.data = {
            news: [],
            member: [],
            schedule: [],
            web: [],
            roadmap: [],
            contact: [],
            users: {}, // ユーザー情報と権限を保存
            serverConfig: null
        };

        this.serverStatus = null;
        this.modalType = 'add';
        this.editIndex = -1;
        this.editType = '';
        this.serverUpdateInterval = null;
        this.lastSuccessfulUpdate = null;
        this.updateFailureCount = 0;
        this.maxFailures = 3;
        this.selectedImageData = null;
        this.serverStatusHistory = [];
        this.stableUpdateInterval = 15000;
        this.initialUpdateInterval = 500;
        this.consecutiveErrors = 0;
        this.maxConsecutiveErrors = 2;
        this.isApiDisabled = false;
        this.hasEverVisitedServer = false;
        this.isFirstLoad = true;
        this.isCurrentlyUpdating = false;

        this.init();
    }

    async init() {
        console.log('Discord認証システム初期化開始');

        await this.handleOAuthCallback();
        this.loadLoginState();
        this.setupEventListeners();

        await this.loadData();
        this.setupRealtimeUpdates();
        this.cleanExpiredSchedules();
        this.loadContactLimits();

        setTimeout(() => {
            this.updateUI();
            this.updateLoginUI();
            this.forceButtonRefresh();
        }, 100);

        console.log('光鯖公式ホームページ初期化完了（全改善対応版）');
    }

    // リアルタイム更新の設定
    setupRealtimeUpdates() {
        // ウェブのリアルタイム更新
        const webRef = ref(database, 'web');
        this.realtimeListeners.web = onValue(webRef, (snapshot) => {
            if (snapshot.exists()) {
                this.data.web = snapshot.val() || [];
                if (this.currentPage === 'web') {
                    this.renderWeb();
                }
                console.log('ウェブデータをリアルタイム更新');
            }
        });

        // メンバーのリアルタイム更新
        const memberRef = ref(database, 'member');
        this.realtimeListeners.member = onValue(memberRef, (snapshot) => {
            if (snapshot.exists()) {
                this.data.member = snapshot.val() || [];
                if (this.currentPage === 'member') {
                    this.renderMembers();
                }
                console.log('メンバーデータをリアルタイム更新');
            }
        });

        // お問い合わせのリアルタイム更新
        const contactRef = ref(database, 'contact');
        this.realtimeListeners.contact = onValue(contactRef, (snapshot) => {
            if (snapshot.exists()) {
                this.data.contact = snapshot.val() || [];
                if (this.currentPage === 'contact') {
                    this.renderContact();
                }
                console.log('お問い合わせデータをリアルタイム更新');
            }
        });

        // ニュースのリアルタイム更新
        const newsRef = ref(database, 'news');
        this.realtimeListeners.news = onValue(newsRef, (snapshot) => {
            if (snapshot.exists()) {
                this.data.news = snapshot.val() || [];
                if (this.currentPage === 'news') {
                    this.renderNews();
                }
                console.log('ニュースデータをリアルタイム更新');
            }
        });

        // スケジュールのリアルタイム更新
        const scheduleRef = ref(database, 'schedule');
        this.realtimeListeners.schedule = onValue(scheduleRef, (snapshot) => {
            if (snapshot.exists()) {
                this.data.schedule = snapshot.val() || [];
                if (this.currentPage === 'schedule') {
                    this.renderSchedule();
                }
                console.log('スケジュールデータをリアルタイム更新');
            }
        });

        // ロードマップのリアルタイム更新
        const roadmapRef = ref(database, 'roadmap');
        this.realtimeListeners.roadmap = onValue(roadmapRef, (snapshot) => {
            if (snapshot.exists()) {
                this.data.roadmap = snapshot.val() || [];
                if (this.currentPage === 'roadmap') {
                    this.renderRoadmap();
                }
                console.log('ロードマップデータをリアルタイム更新');
            }
        });
    }

    // リアルタイム更新のクリーンアップ
    cleanupRealtimeListeners() {
        Object.keys(this.realtimeListeners).forEach(key => {
            if (this.realtimeListeners[key]) {
                off(this.realtimeListeners[key]);
            }
        });
        this.realtimeListeners = {};
    }

    // お問い合わせ制限の読み込み
    loadContactLimits() {
        if (!this.isLoggedIn || !this.currentUser) return;

        const savedData = localStorage.getItem(`contact_limits_${this.currentUser.id}`);
        if (savedData) {
            try {
                const data = JSON.parse(savedData);
                const today = new Date().toDateString();

                if (data.date === today) {
                    this.dailyContactCount = data.count;
                    this.lastContactDate = data.date;
                } else {
                    // 日付が変わっていたらリセット
                    this.dailyContactCount = 0;
                    this.lastContactDate = today;
                    this.saveContactLimits();
                }
            } catch (error) {
                console.error('お問い合わせ制限データ読み込みエラー:', error);
                this.resetContactLimits();
            }
        } else {
            this.resetContactLimits();
        }
    }

    // お問い合わせ制限の保存
    saveContactLimits() {
        if (!this.isLoggedIn || !this.currentUser) return;

        const data = {
            count: this.dailyContactCount,
            date: this.lastContactDate
        };
        localStorage.setItem(`contact_limits_${this.currentUser.id}`, JSON.stringify(data));
    }

    // お問い合わせ制限のリセット
    resetContactLimits() {
        this.dailyContactCount = 0;
        this.lastContactDate = new Date().toDateString();
        this.saveContactLimits();
    }

    // お問い合わせ可能かチェック
    canSendContact() {
        const today = new Date().toDateString();
        if (this.lastContactDate !== today) {
            this.resetContactLimits();
            return true;
        }
        return this.dailyContactCount < 3;
    }

    // お問い合わせ回数を増やす
    incrementContactCount() {
        const today = new Date().toDateString();
        if (this.lastContactDate !== today) {
            this.resetContactLimits();
        }
        this.dailyContactCount++;
        this.lastContactDate = today;
        this.saveContactLimits();
    }

    getDiscordAuthURL() {
        const state = this.generateRandomString(32);
        localStorage.setItem('discord_oauth_state', state);

        const params = new URLSearchParams({
            client_id: DISCORD_CONFIG.CLIENT_ID,
            redirect_uri: DISCORD_CONFIG.REDIRECT_URI,
            response_type: 'code',
            scope: DISCORD_CONFIG.SCOPE,
            state: state
        });

        return `${DISCORD_CONFIG.AUTH_URL}?${params.toString()}`;
    }

    generateRandomString(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    async handleOAuthCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const error = urlParams.get('error');

        if (error) {
            console.error('Discord認証エラー:', error);
            alert('Discord認証でエラーが発生しました。');
            return;
        }

        if (code && state) {
            const savedState = localStorage.getItem('discord_oauth_state');
            if (state !== savedState) {
                console.error('OAuth状態検証失敗');
                alert('認証状態の検証に失敗しました。');
                return;
            }

            try {
                console.log('認証コード取得成功、トークン交換開始');
                await this.exchangeCodeForToken(code);

                window.history.replaceState({}, document.title, window.location.pathname);

                console.log('Discord認証完了');
            } catch (error) {
                console.error('認証処理エラー:', error);
                this.showFallbackAuth();
            }
        }
    }

    async exchangeCodeForToken(code) {
        const data = new URLSearchParams({
            client_id: DISCORD_CONFIG.CLIENT_ID,
            client_secret: DISCORD_CONFIG.CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: DISCORD_CONFIG.REDIRECT_URI
        });

        try {
            const response = await fetch(DISCORD_CONFIG.TOKEN_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: data
            });

            if (!response.ok) {
                const errorData = await response.text();
                console.error('トークン取得エラー:', errorData);
                throw new Error(`トークン取得失敗: ${response.status}`);
            }

            const tokenData = await response.json();

            localStorage.setItem('discord_tokens', JSON.stringify({
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token,
                expires_in: tokenData.expires_in,
                timestamp: Date.now()
            }));

            this.accessToken = tokenData.access_token;
            this.refreshToken = tokenData.refresh_token;

            await this.fetchUserInfo();

        } catch (error) {
            console.error('トークン交換エラー:', error);
            throw error;
        }
    }

    async fetchUserInfo() {
        try {
            const response = await fetch(`${DISCORD_CONFIG.API_BASE}/users/@me`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            if (!response.ok) {
                throw new Error(`ユーザー情報取得失敗: ${response.status}`);
            }

            const userData = await response.json();
            console.log('Discord ユーザー情報取得成功:', userData.username);

            this.handleSuccessfulLogin(userData);

        } catch (error) {
            console.error('ユーザー情報取得エラー:', error);
            throw error;
        }
    }

    async handleSuccessfulLogin(userData) {
        this.isLoggedIn = true;
        this.currentUser = {
            id: userData.id,
            username: userData.username,
            discriminator: userData.discriminator || '0000',
            avatar: userData.avatar,
            email: userData.email,
            global_name: userData.global_name || userData.username
        };

        localStorage.setItem('discord_user', JSON.stringify(this.currentUser));
        localStorage.setItem('login_timestamp', Date.now().toString());

        // ユーザー情報をFirebaseに保存/更新
        await this.saveUserToFirebase();

        // 権限をFirebaseから取得
        await this.loadUserPermissionsFromFirebase();

        // お問い合わせ制限を読み込み
        this.loadContactLimits();

        this.updateLoginUI();
        this.addToUserNotifications('Discord認証でログインしました');
        this.showPage('account');

        console.log('ログイン完了:', this.currentUser.username, 'Role:', this.userMode);
    }

    // ユーザー情報をFirebaseに保存（修正版）
    async saveUserToFirebase() {
        if (!this.currentUser) return;

        try {
            const userId = this.currentUser.id;
            const userRef = ref(database, `users/${userId}`);
            const userSnapshot = await get(userRef);

            const userData = {
                id: this.currentUser.id,
                username: this.currentUser.username,
                discriminator: this.currentUser.discriminator,
                avatar: this.currentUser.avatar,
                email: this.currentUser.email,
                global_name: this.currentUser.global_name,
                lastLogin: new Date().toISOString(),
                loginCount: userSnapshot.exists() ? (userSnapshot.val().loginCount || 0) + 1 : 1
            };

            // 初回ログイン時間を記録
            if (!userSnapshot.exists()) {
                userData.role = 'guest';
                userData.firstLogin = new Date().toISOString();
            } else {
                userData.role = userSnapshot.val().role || 'guest';
                userData.firstLogin = userSnapshot.val().firstLogin || new Date().toISOString();
            }

            await set(userRef, userData);
            console.log('ユーザー情報をFirebaseに保存:', userData.username);

        } catch (error) {
            console.error('ユーザー情報保存エラー:', error);
        }
    }

    // Firebaseからユーザー権限を取得
    async loadUserPermissionsFromFirebase() {
        if (!this.currentUser) return;

        try {
            const userId = this.currentUser.id;
            const userRef = ref(database, `users/${userId}`);
            const snapshot = await get(userRef);

            if (snapshot.exists()) {
                const userData = snapshot.val();
                this.userMode = userData.role || 'guest';
                console.log('Firebase権限取得:', this.userMode);
            } else {
                this.userMode = 'guest';
                console.log('新規ユーザー、権限をguestに設定');
            }

            // UI更新
            setTimeout(() => {
                this.updateUI();
            }, 100);

        } catch (error) {
            console.error('権限取得エラー:', error);
            this.userMode = 'guest';
        }
    }

    // ユーザー権限をFirebaseで更新（修正版）
    async updateUserRoleInFirebase(userId, newRole) {
        try {
            const userRef = ref(database, `users/${userId}`);
            const snapshot = await get(userRef);

            if (snapshot.exists()) {
                const userData = snapshot.val();
                userData.role = newRole;
                userData.roleUpdated = new Date().toISOString();

                await set(userRef, userData);
                console.log(`ユーザー ${userData.username} の権限を ${newRole} に更新`);

                // 自分自身の権限が変更された場合のみUI更新
                if (userId === this.currentUser.id) {
                    this.userMode = newRole;
                }

                return true;
            } else {
                console.error('ユーザーデータが存在しません');
                return false;
            }
        } catch (error) {
            console.error('権限更新エラー:', error);
            return false;
        }
    }

    // 全ユーザーリストを取得（初回ログイン順・修正版）
    async loadAllUsers() {
        try {
            const usersRef = ref(database, 'users');
            const snapshot = await get(usersRef);

            if (snapshot.exists()) {
                const users = snapshot.val();
                // 初回ログイン時間の早い順にソート
                this.allUsers = Object.values(users).sort((a, b) =>
                    new Date(a.firstLogin || a.lastLogin) - new Date(b.firstLogin || b.lastLogin)
                );
                console.log('全ユーザーリスト更新:', this.allUsers.length, '人（初回ログイン順）');
            } else {
                this.allUsers = [];
            }
        } catch (error) {
            console.error('ユーザーリスト取得エラー:', error);
            this.allUsers = [];
        }
    }

    showFallbackAuth() {
        alert('Discord認証に失敗しました。');
    }

    // 通知履歴に追加（旧userHistory）
    addToUserNotifications(message) {
        if (!this.isLoggedIn) return;

        const notificationItem = {
            date: new Date().toLocaleString('ja-JP'),
            message: message,
            userId: this.currentUser.id,
            read: false
        };

        this.userNotifications.unshift(notificationItem);

        // 最新50件まで保持
        if (this.userNotifications.length > 50) {
            this.userNotifications = this.userNotifications.slice(0, 50);
        }

        localStorage.setItem(`user_notifications_${this.currentUser.id}`, JSON.stringify(this.userNotifications));
    }

    loadLoginState() {
        const savedUser = localStorage.getItem('discord_user');
        const savedTokens = localStorage.getItem('discord_tokens');

        if (savedUser && savedTokens) {
            try {
                this.currentUser = JSON.parse(savedUser);
                const tokens = JSON.parse(savedTokens);

                const tokenAge = Date.now() - tokens.timestamp;
                const tokenExpiry = tokens.expires_in * 1000;

                if (tokenAge < tokenExpiry) {
                    this.accessToken = tokens.access_token;
                    this.refreshToken = tokens.refresh_token;
                    this.isLoggedIn = true;

                    // Firebaseから権限を取得
                    this.loadUserPermissionsFromFirebase();

                    // 通知履歴を読み込み
                    const savedNotifications = localStorage.getItem(`user_notifications_${this.currentUser.id}`);
                    if (savedNotifications) {
                        this.userNotifications = JSON.parse(savedNotifications);
                    }

                    // お問い合わせ制限を読み込み
                    this.loadContactLimits();

                    console.log('ログイン状態復元完了:', this.currentUser.username);
                } else {
                    console.log('トークンの有効期限切れ');
                    this.clearLoginState();
                }
            } catch (error) {
                console.error('ログイン状態復元エラー:', error);
                this.clearLoginState();
            }
        }
    }

    clearLoginState() {
        localStorage.removeItem('discord_user');
        localStorage.removeItem('discord_tokens');
        localStorage.removeItem('login_timestamp');
        localStorage.removeItem('discord_oauth_state');

        this.isLoggedIn = false;
        this.currentUser = null;
        this.accessToken = null;
        this.refreshToken = null;
        this.userMode = 'guest';
        this.adminOverride = false;
        this.userNotifications = [];
        this.dailyContactCount = 0;
        this.lastContactDate = '';

        // リアルタイムリスナーをクリーンアップ
        this.cleanupRealtimeListeners();
    }

    // ユーザー表示名フォーマット（#0問題修正）
    formatDisplayName(user) {
        if (!user) return '';

        const username = user.global_name || user.username;
        const discriminator = user.discriminator;

        // discriminator が '0' や '0000' の場合は表示しない
        if (!discriminator || discriminator === '0' || discriminator === '0000') {
            return username;
        }

        return `${username}#${discriminator}`;
    }

    // ログインUI更新（#0問題修正版）
    updateLoginUI() {
        const loginBtn = document.getElementById('loginBtn');
        const navText = loginBtn.querySelector('.nav-text');
        const navJapanese = loginBtn.querySelector('.nav-japanese');

        if (this.isLoggedIn && this.currentUser) {
            navText.textContent = 'ACCOUNT';
            navJapanese.textContent = 'アカウント';
            loginBtn.dataset.page = 'account';

            // 表示名を正しくフォーマット（#0問題解決）
            const displayName = this.formatDisplayName(this.currentUser);

            if (window.innerWidth <= 768 && displayName.length > 8) {
                navText.textContent = displayName.substring(0, 6) + '...';
            } else if (displayName.length > 12) {
                navText.textContent = displayName.substring(0, 10) + '...';
            } else {
                navText.textContent = displayName;
            }
        } else {
            navText.textContent = 'LOGIN';
            navJapanese.textContent = 'ログイン';
            loginBtn.dataset.page = 'login';
        }
    }

    logout() {
        if (confirm('ログアウトしますか？')) {
            this.addToUserNotifications('ログアウトしました');
            this.clearLoginState();
            this.updateLoginUI();
            this.showPage('top');

            console.log('ログアウト完了');
        }
    }

    setupEventListeners() {
        document.querySelectorAll('.nav-link').forEach(link => {
            const handleNavClick = (e) => {
                // プロンプト中は全てのナビゲーションを無視
                if (this.isPromptActive) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    return false;
                }

                e.preventDefault();
                const page = link.dataset.page;

                if (page === 'login' && !this.isLoggedIn) {
                    const authURL = this.getDiscordAuthURL();
                    console.log('Discord認証開始:', authURL);
                    window.location.href = authURL;
                    return;
                }

                this.showPage(page);
                this.closeMobileMenu();
            };

            link.addEventListener('click', handleNavClick, true);
            link.addEventListener('touchend', handleNavClick, true);
        });

        document.getElementById('hamburger').addEventListener('click', () => {
            this.toggleMobileMenu();
        });

        document.addEventListener('click', (e) => {
            const navLinks = document.getElementById('nav-links');
            const hamburger = document.getElementById('hamburger');

            if (!navLinks.contains(e.target) && !hamburger.contains(e.target)) {
                this.closeMobileMenu();
            }
        });

        const setupButtonListener = (id, handler) => {
            const button = document.getElementById(id);
            if (button) {
                button.removeEventListener('click', handler);
                button.removeEventListener('touchend', handler);
                button.addEventListener('click', handler, { passive: false });
                button.addEventListener('touchend', handler, { passive: false });
            }
        };

        setupButtonListener('admin-plus-btn', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.modalType = 'add';
            this.showAddModal();
        });

        setupButtonListener('admin-set-btn', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.modalType = 'server-settings';
            this.showServerSettingsModal();
        });

        document.getElementById('modal-close').addEventListener('click', () => {
            this.hideModal();
        });

        document.getElementById('modal-cancel').addEventListener('click', () => {
            this.hideModal();
        });

        document.getElementById('modal-submit').addEventListener('click', () => {
            if (this.modalType === 'server-settings') {
                this.handleServerSettingsSubmit();
            } else if (this.modalType === 'edit') {
                this.handleEditSubmit();
            } else if (this.modalType === 'contact') {
                this.handleContactSubmit();
            } else if (this.modalType === 'add-user-web') {
                this.handleAddUserWeb();
            } else if (this.modalType === 'edit-user-web') {
                this.handleEditUserWeb();
            } else if (this.modalType === 'reply-contact') {
                this.handleContactReply();
            } else {
                this.handleModalSubmit();
            }
        });

        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target === document.getElementById('modal-overlay')) {
                this.hideModal();
            }
        });

        document.getElementById('hidden-file-input').addEventListener('change', (e) => {
            this.handleFileSelect(e);
        });

        setTimeout(() => {
            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', () => {
                    this.logout();
                });
            }

            const addUserWebBtn = document.getElementById('add-user-web-btn');
            if (addUserWebBtn) {
                addUserWebBtn.addEventListener('click', () => {
                    this.showAddUserWebModal();
                });
            }

            const exportWebBtn = document.getElementById('export-web-btn');
            if (exportWebBtn) {
                exportWebBtn.addEventListener('click', () => {
                    this.exportData('web');
                });
            }
        }, 1000);

        window.addEventListener('focus', () => {
            if (this.data.serverConfig && this.data.serverConfig.address && this.currentPage === 'server' && !this.isApiDisabled) {
                this.startServerStatusUpdates();
            }
        });

        window.addEventListener('pageshow', () => {
            setTimeout(() => {
                this.updateUI();
                this.forceButtonRefresh();
            }, 50);
        });

        window.addEventListener('beforeunload', () => {
            this.stopServerStatusUpdates();
            this.cleanupRealtimeListeners();
        });

        window.addEventListener('resize', () => {
            this.updateLoginUI();
        });
    }

    showPage(page) {
        if (page === 'login') {
            if (this.isLoggedIn) {
                page = 'account';
            }
        }

        if (page === 'account') {
            if (!this.isLoggedIn) {
                page = 'login';
            } else {
                this.renderAccountPage();
            }
        }

        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

        const targetPage = document.getElementById(`${page}-page`);
        const targetNav = document.querySelector(`[data-page="${page}"]`);

        if (targetPage) {
            targetPage.classList.add('active');
        }
        if (targetNav) {
            targetNav.classList.add('active');
        }

        this.currentPage = page;
        this.renderCurrentPage();

        setTimeout(() => {
            this.updateUI();
            this.forceButtonRefresh();
        }, 50);

        if (page === 'server' && this.data.serverConfig && this.data.serverConfig.address) {
            if (!this.hasEverVisitedServer) {
                this.isFirstLoad = true;
            }
            this.startServerStatusUpdates();
        } else if (page !== 'server') {
            this.stopServerStatusUpdates();
        }
    }

    toggleMobileMenu() {
        const navLinks = document.getElementById('nav-links');
        const hamburger = document.getElementById('hamburger');

        navLinks.classList.toggle('active');
        hamburger.classList.toggle('active');
    }

    closeMobileMenu() {
        const navLinks = document.getElementById('nav-links');
        const hamburger = document.getElementById('hamburger');

        navLinks.classList.remove('active');
        hamburger.classList.remove('active');
    }

    // アカウントページレンダリング（権限管理対応版・修正版）
    renderAccountPage() {
        if (!this.currentUser) return;

        const userInfo = document.getElementById('account-user-info');
        const avatarUrl = this.currentUser.avatar
            ? `https://cdn.discordapp.com/avatars/${this.currentUser.id}/${this.currentUser.avatar}.png?size=128`
            : `https://cdn.discordapp.com/embed/avatars/${this.currentUser.discriminator % 5}.png`;

        // 表示名を正しくフォーマット
        const displayName = this.formatDisplayName(this.currentUser);

        userInfo.innerHTML = `
            <img src="${avatarUrl}" alt="${displayName}" class="user-avatar">
            <div class="user-username">${displayName}</div>
            <div class="user-role">${this.getUserRoleDisplay()}</div>
        `;

        this.setupAccountTabs();
        this.loadUserWebs();

        // 管理者パスワードトリガー：user-roleにCtrl+Shift+左クリックイベント追加（修正版）
        setTimeout(() => {
            const userRoleElement = document.querySelector('.user-role');
            if (userRoleElement) {
                userRoleElement.addEventListener('click', async (e) => {
                    if (e.ctrlKey && e.shiftKey) {
                        e.preventDefault();
                        e.stopPropagation();

                        const password = prompt('管理者パスワードを入力してください:');
                        if (password === 'atsuki0622') {
                            try {
                                // Firebase更新を待機
                                const success = await this.updateUserRoleInFirebase(this.currentUser.id, 'admin');
                                if (success) {
                                    // ローカル状態を更新
                                    this.userMode = 'admin';

                                    // 通知に記録
                                    this.addToUserNotifications('管理者権限を取得しました');

                                    // UI全体を更新
                                    this.updateLoginUI();
                                    this.updateUI();

                                    // 役割表示を更新
                                    userRoleElement.textContent = this.getUserRoleDisplay();

                                    // アカウントページを再描画
                                    this.renderPermissionsTab();

                                    alert('管理者権限を取得しました');
                                } else {
                                    alert('権限の更新に失敗しました');
                                }
                            } catch (error) {
                                console.error('権限更新エラー:', error);
                                alert('権限の更新に失敗しました');
                            }
                        } else if (password) {
                            alert('パスワードが間違っています');
                        }
                    }
                });
            }
        }, 100);
    }

    getUserRoleDisplay() {
        switch (this.userMode) {
            case 'admin': return '管理者';
            case 'member': return 'メンバー';
            case 'guest': return '一般';
            default: return '一般';
        }
    }

    setupAccountTabs() {
        // 既存のイベントリスナーを全て削除
        const tabs = document.querySelectorAll('.account-nav-item');
        tabs.forEach(tab => {
            const newTab = tab.cloneNode(true);
            tab.parentNode.replaceChild(newTab, tab);
        });

        // 修正版：一度に一つのタブのみ選択されるように改善
        document.querySelectorAll('.account-nav-item').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();

                // 全てのタブからactiveクラスを削除
                document.querySelectorAll('.account-nav-item').forEach(t => {
                    t.classList.remove('active');
                });

                // 全てのタブコンテンツからactiveクラスを削除
                document.querySelectorAll('.account-tab').forEach(content => {
                    content.classList.remove('active');
                });

                // クリックされたタブにactiveクラスを追加
                tab.classList.add('active');

                // 対応するタブコンテンツにactiveクラスを追加
                const tabName = tab.dataset.tab;
                const targetContent = document.getElementById(`account-tab-${tabName}`);
                if (targetContent) {
                    targetContent.classList.add('active');
                }

                // タブ切り替え時の処理
                this.handleTabChange(tabName);
            });
        });
    }

    handleTabChange(tabName) {
        switch (tabName) {
            case 'web':
                this.renderWebTab();
                break;
            case 'notifications':  // 履歴 → 通知に変更
                this.renderNotificationsTab();
                break;
            case 'permissions':
                this.renderPermissionsTab();
                break;
        }
    }

    renderWebTab() {
        const webList = document.getElementById('user-web-list');
        webList.innerHTML = '';

        if (this.userWebs.length === 0) {
            webList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #666;">
                    <p>まだウェブリンクを追加していません。</p>
                    <p>「ウェブを追加する」ボタンから追加してください。</p>
                </div>
            `;
        } else {
            this.userWebs.forEach((web, index) => {
                const webItem = document.createElement('div');
                webItem.className = 'user-web-item';
                webItem.innerHTML = `
                    <div class="user-web-info">
                        <img src="${web.icon || 'default.png'}" alt="${web.title}" class="user-web-icon">
                        <div class="user-web-details">
                            <h4>${web.title}</h4>
                            <div class="user-web-url">${web.url}</div>
                        </div>
                    </div>
                    <div class="user-web-actions">
                        <button class="btn btn-small btn-primary" onclick="lightServer.editUserWeb(${index})">編集</button>
                        <button class="btn btn-small btn-cancel" onclick="lightServer.deleteUserWeb(${index})">削除</button>
                    </div>
                `;
                webList.appendChild(webItem);
            });
        }
    }

    // 通知タブのレンダリング（旧履歴タブ）
    renderNotificationsTab() {
        const notificationsList = document.getElementById('user-notifications-list');
        notificationsList.innerHTML = '';

        if (this.userNotifications.length === 0) {
            notificationsList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #666;">
                    <p>通知はありません。</p>
                </div>
            `;
        } else {
            this.userNotifications.forEach(item => {
                const notificationItem = document.createElement('div');
                notificationItem.className = `notification-item ${item.read ? 'read' : 'unread'}`;
                notificationItem.innerHTML = `
                    <div class="notification-date">${item.date}</div>
                    <div class="notification-message">${item.message}</div>
                `;
                notificationsList.appendChild(notificationItem);
            });
        }
    }

    // 権限タブのレンダリング（選択肢重複防止・修正版）
    async renderPermissionsTab() {
        const permissionsContent = document.getElementById('permissions-content');

        if (this.userMode === 'admin') {
            // 最新のユーザーリストを取得
            await this.loadAllUsers();

            let userListHtml = '';
            if (this.allUsers.length === 0) {
                userListHtml = `
                    <div style="text-align: center; padding: 20px; color: #666;">
                        <p>ログインしたユーザーはいません。</p>
                    </div>
                `;
            } else {
                userListHtml = this.allUsers.map((user, index) => {
                    const displayName = this.formatDisplayName(user);
                    const avatarUrl = user.avatar
                        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=40`
                        : `https://cdn.discordapp.com/embed/avatars/${user.discriminator % 5}.png`;

                    return `
                        <div class="user-permission-item" style="position: relative; z-index: ${1000 - index}; margin-bottom: 15px;">
                            <div class="user-permission-info">
                                <img src="${avatarUrl}" alt="${displayName}" class="user-permission-avatar">
                                <div>
                                    <div class="user-permission-name">${displayName}</div>
                                    <div class="user-permission-id">初回ログイン: ${new Date(user.firstLogin || user.lastLogin).toLocaleString('ja-JP')}</div>
                                </div>
                            </div>
                            <div class="role-select-wrapper" style="position: relative; z-index: ${1000 - index};">
                                <select class="role-select" onchange="lightServer.changeUserRole('${user.id}', this.value)" style="position: relative; z-index: ${1000 - index};">
                                    <option value="guest" ${user.role === 'guest' ? 'selected' : ''}>一般</option>
                                    <option value="member" ${user.role === 'member' ? 'selected' : ''}>メンバー</option>
                                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>管理者</option>
                                </select>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            permissionsContent.innerHTML = `
                <div class="permission-role">管理者権限</div>
                <div class="permission-description">
                    すべての機能にアクセスできます。ユーザーの権限管理も可能です。
                </div>
                <h4 style="margin-top: 20px; color: #2c3e50;">ユーザー権限管理</h4>
                <div class="users-list">
                    ${userListHtml}
                </div>
                <style>
                .user-permission-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 15px;
                    border: 1px solid #ddd;
                    border-radius: 8px;
                    background: white;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .user-permission-info {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .user-permission-avatar {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                }
                .role-select-wrapper {
                    min-height: 40px;
                    min-width: 120px;
                }
                .role-select {
                    width: 100%;
                    min-width: 120px;
                    padding: 8px;
                    background: white;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    font-size: 14px;
                }
                .role-select:focus {
                    outline: none;
                    border-color: #007bff;
                    box-shadow: 0 0 0 2px rgba(0,123,255,0.25);
                }
                </style>
            `;
        } else {
            permissionsContent.innerHTML = `
                <div class="permission-role">${this.getUserRoleDisplay()}権限</div>
                <div class="permission-description">
                    ${this.userMode === 'member' ?
                        '基本的な機能にアクセスできます。個人のウェブリンク管理、お問い合わせの送信が可能です。' :
                        '基本的な閲覧機能のみ利用できます。お問い合わせの送信も可能です。'
                    }
                </div>
                <h4 style="margin-top: 20px; color: #2c3e50;">利用可能な機能</h4>
                <ul style="color: #666; margin: 10px 0 0 20px;">
                    ${this.userMode === 'member' ? `
                        <li>個人のウェブリンク管理</li>
                        <li>お問い合わせの送信（1日3回まで）</li>
                        <li>通知の確認</li>
                        <li>サーバー情報の閲覧</li>
                        <li>自分の投稿の編集・削除</li>
                    ` : `
                        <li>コンテンツの閲覧</li>
                        <li>サーバー情報の閲覧（限定的）</li>
                        <li>お問い合わせの送信（1日3回まで）</li>
                    `}
                </ul>
            `;
        }
    }

    // ユーザー権限変更（リアルタイム更新対応・修正版）
    async changeUserRole(userId, newRole) {
        if (this.userMode !== 'admin') {
            alert('権限がありません');
            return;
        }

        try {
            const success = await this.updateUserRoleInFirebase(userId, newRole);
            if (success) {
                // 最新のユーザーデータを再取得
                await this.loadAllUsers();

                // 権限タブを再描画
                await this.renderPermissionsTab();

                // 自分自身の権限が変更された場合はUI全体を更新
                if (userId === this.currentUser.id) {
                    this.userMode = newRole;
                    this.updateLoginUI();
                    this.updateUI();

                    // アカウント情報の表示も更新
                    const userRoleElement = document.querySelector('.user-role');
                    if (userRoleElement) {
                        userRoleElement.textContent = this.getUserRoleDisplay();
                    }
                }

                alert('権限を更新しました');
            } else {
                alert('権限の更新に失敗しました');
            }
        } catch (error) {
            console.error('権限変更エラー:', error);
            alert('権限の更新に失敗しました');
        }
    }

    loadUserWebs() {
        if (!this.isLoggedIn || !this.currentUser) {
            this.userWebs = [];
            return;
        }

        const savedWebs = localStorage.getItem(`user_webs_${this.currentUser.id}`);
        if (savedWebs) {
            try {
                this.userWebs = JSON.parse(savedWebs);
            } catch (error) {
                console.error('ユーザーウェブデータ読み込みエラー:', error);
                this.userWebs = [];
            }
        } else {
            this.userWebs = [];
        }
    }

    saveUserWebs() {
        if (!this.isLoggedIn || !this.currentUser) return;

        localStorage.setItem(`user_webs_${this.currentUser.id}`, JSON.stringify(this.userWebs));
    }

    showAddUserWebModal() {
        this.modalType = 'add-user-web';
        const modal = document.getElementById('modal-overlay');
        const title = document.querySelector('#modal-overlay h3');
        const body = document.getElementById('modal-body');

        title.textContent = 'ウェブを追加';

        body.innerHTML = `
            <div class="form-group">
                <label for="user-web-title">タイトル</label>
                <input type="text" id="user-web-title" placeholder="ウェブサイトの名前" required>
            </div>
            <div class="form-group">
                <label for="user-web-url">URL</label>
                <input type="url" id="user-web-url" placeholder="https://example.com" required>
            </div>
            <div class="form-group">
                <label for="user-web-image">画像</label>
                <div class="file-input-wrapper">
                    <button type="button" class="file-select-btn" onclick="document.getElementById('hidden-file-input').click()">選択</button>
                    <span id="file-name">画像を選択してください</span>
                </div>
                <img id="image-preview" class="image-preview" style="display: none;">
            </div>
        `;

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    handleAddUserWeb() {
        const title = document.getElementById('user-web-title').value.trim();
        const url = document.getElementById('user-web-url').value.trim();

        if (!title || !url) {
            alert('タイトルとURLを入力してください。');
            return;
        }

        try {
            new URL(url);
        } catch (error) {
            alert('有効なURLを入力してください。');
            return;
        }

        const webItem = {
            id: Date.now().toString(),
            title: title,
            url: url,
            icon: this.selectedImageData || this.getWebIconFromURL(url),
            created: new Date().toISOString(),
            userId: this.currentUser.id
        };

        this.userWebs.push(webItem);
        this.saveUserWebs();
        this.addToUserNotifications(`ウェブリンク「${title}」を追加しました`);

        this.renderWebTab();
        this.hideModal();

        console.log('ユーザーウェブ追加完了:', title);
    }

    getWebIconFromURL(url) {
        const domain = new URL(url).hostname.toLowerCase();

        const iconMap = {
            'youtube.com': 'youtube.png',
            'youtu.be': 'youtube.png',
            'twitter.com': 'twitter.png',
            'x.com': 'twitter.png',
            'discord.gg': 'discord.png',
            'discord.com': 'discord.png',
            'github.com': 'github.png',
            'twitch.tv': 'twitch.png'
        };

        for (const [key, icon] of Object.entries(iconMap)) {
            if (domain.includes(key)) {
                return icon;
            }
        }

        return 'default.png';
    }

    editUserWeb(index) {
        const web = this.userWebs[index];
        if (!web) return;

        this.modalType = 'edit-user-web';
        this.editIndex = index;

        const modal = document.getElementById('modal-overlay');
        const title = document.querySelector('#modal-overlay h3');
        const body = document.getElementById('modal-body');

        title.textContent = 'ウェブを編集';

        body.innerHTML = `
            <div class="form-group">
                <label for="user-web-title">タイトル</label>
                <input type="text" id="user-web-title" value="${web.title}" required>
            </div>
            <div class="form-group">
                <label for="user-web-url">URL</label>
                <input type="url" id="user-web-url" value="${web.url}" required>
            </div>
            <div class="form-group">
                <label for="user-web-image">画像</label>
                <div class="file-input-wrapper">
                    <button type="button" class="file-select-btn" onclick="document.getElementById('hidden-file-input').click()">変更</button>
                    <span id="file-name">現在の画像を変更しない</span>
                </div>
                <img id="image-preview" class="image-preview" src="${web.icon}" style="display: ${web.icon ? 'block' : 'none'};">
            </div>
        `;

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    handleEditUserWeb() {
        const title = document.getElementById('user-web-title').value.trim();
        const url = document.getElementById('user-web-url').value.trim();

        if (!title || !url) {
            alert('タイトルとURLを入力してください。');
            return;
        }

        try {
            new URL(url);
        } catch (error) {
            alert('有効なURLを入力してください。');
            return;
        }

        const web = this.userWebs[this.editIndex];
        const oldTitle = web.title;
        web.title = title;
        web.url = url;
        if (this.selectedImageData) {
            web.icon = this.selectedImageData;
        }
        web.updated = new Date().toISOString();

        this.saveUserWebs();
        this.addToUserNotifications(`ウェブリンク「${oldTitle}」を編集しました`);

        this.renderWebTab();
        this.hideModal();
    }

    deleteUserWeb(index) {
        const web = this.userWebs[index];
        if (!web) return;

        if (confirm(`「${web.title}」を削除しますか？`)) {
            this.addToUserNotifications(`ウェブリンク「${web.title}」を削除しました`);
            this.userWebs.splice(index, 1);
            this.saveUserWebs();

            this.renderWebTab();
        }
    }

    exportData(type) {
        const data = this.data[type];
        const dataStr = JSON.stringify(data, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${type}_data_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    async loadData() {
        try {
            const dbRef = ref(database);
            const snapshot = await get(child(dbRef, '/'));

            if (snapshot.exists()) {
                const firebaseData = snapshot.val();
                Object.keys(this.data).forEach(key => {
                    if (key === 'users') {
                        this.data[key] = firebaseData[key] || {};
                    } else {
                        this.data[key] = firebaseData[key] || (key === 'serverConfig' ? null : []);
                    }
                });
            }

            this.renderCurrentPage();

            if (this.data.serverConfig && this.data.serverConfig.address && this.currentPage === 'server' && !this.isApiDisabled) {
                this.startServerStatusUpdates();
            }
        } catch (error) {
            console.error('Firebase データの読み込みに失敗:', error);
            this.loadLocalData();
        }
    }

    async saveData() {
        try {
            await set(ref(database, '/'), this.data);
            console.log('Firebase にデータを保存しました');
        } catch (error) {
            console.error('Firebase データの保存に失敗:', error);
            this.saveLocalData();
        }
    }

    loadLocalData() {
        Object.keys(this.data).forEach(key => {
            if (key === 'serverConfig') {
                this.data[key] = JSON.parse(localStorage.getItem(key) || 'null');
            } else if (key === 'users') {
                this.data[key] = JSON.parse(localStorage.getItem(key) || '{}');
            } else {
                this.data[key] = JSON.parse(localStorage.getItem(key) || '[]');
            }
        });
        this.renderCurrentPage();

        if (this.data.serverConfig && this.data.serverConfig.address && this.currentPage === 'server' && !this.isApiDisabled) {
            this.startServerStatusUpdates();
        }
    }

    saveLocalData() {
        Object.keys(this.data).forEach(key => {
            localStorage.setItem(key, JSON.stringify(this.data[key]));
        });
    }

    // UI更新（お問い合わせ権限修正版）
    updateUI() {
        const plusBtn = document.getElementById('admin-plus-btn');
        const setBtn = document.getElementById('admin-set-btn');
        const deleteButtons = document.querySelectorAll('.delete-btn');
        const editButtons = document.querySelectorAll('.edit-btn');

        let showPlusBtn = false;
        let showSetBtn = false;

        if (this.currentPage !== 'top' && this.currentPage !== 'login' && this.currentPage !== 'account') {
            if (this.userMode === 'admin') {
                if (this.currentPage === 'server') {
                    showPlusBtn = false;
                    showSetBtn = true;
                } else if (this.currentPage === 'contact') {
                    showPlusBtn = false;
                    showSetBtn = false;
                } else {
                    showPlusBtn = true;
                    showSetBtn = false;
                }
            } else if (this.userMode === 'member') {
                if (this.currentPage === 'member' || this.currentPage === 'contact') {
                    if (this.isLoggedIn && this.currentUser) {
                        showPlusBtn = true;
                        showSetBtn = false;
                    }
                }
            } else if (this.userMode === 'guest') {
                // 一般ユーザーもお問い合わせ可能
                if (this.currentPage === 'contact' && this.isLoggedIn && this.currentUser) {
                    showPlusBtn = true;
                    showSetBtn = false;
                } else {
                    showPlusBtn = false;
                    showSetBtn = false;
                }
            }
        }

        if (plusBtn) {
            plusBtn.style.display = showPlusBtn ? 'flex' : 'none';
            plusBtn.offsetHeight;
        }

        if (setBtn) {
            setBtn.style.display = showSetBtn ? 'flex' : 'none';
            setBtn.offsetHeight;

            if (this.currentPage === 'server' && showSetBtn) {
                setBtn.classList.add('server-page-position');
            } else {
                setBtn.classList.remove('server-page-position');
            }
        }

        deleteButtons.forEach(btn => {
            btn.style.display = this.userMode === 'admin' ? 'flex' : 'none';
        });

        editButtons.forEach(btn => {
            btn.style.display = this.userMode === 'admin' ? 'flex' : 'none';
        });

        console.log(`UI更新: userMode=${this.userMode}, currentPage=${this.currentPage}, showPlusBtn=${showPlusBtn}, showSetBtn=${showSetBtn}`);
    }

    renderCurrentPage() {
        switch (this.currentPage) {
            case 'news':
                this.renderNews();
                break;
            case 'member':
                this.renderMembers();
                break;
            case 'schedule':
                this.renderSchedule();
                break;
            case 'web':
                this.renderWeb();
                break;
            case 'roadmap':
                this.renderRoadmap();
                break;
            case 'contact':
                this.renderContact();
                break;
            case 'server':
                this.renderServer();
                break;
        }
    }

    renderNews() {
        const container = document.getElementById('news-list');
        container.innerHTML = '';
        this.data.news.forEach((item, index) => {
            const element = this.createContentElement(item, index, 'news');
            container.appendChild(element);
        });
        this.updateUI();
    }

    renderMembers() {
        const container = document.getElementById('member-list');
        container.innerHTML = '';
        this.data.member.forEach((item, index) => {
            const element = this.createContentElement(item, index, 'member');
            container.appendChild(element);
        });
        this.updateUI();
    }

    renderSchedule() {
        const container = document.getElementById('schedule-list');
        container.innerHTML = '';
        const now = new Date();
        const originalLength = this.data.schedule.length;

        this.data.schedule = this.data.schedule.filter(item => {
            try {
                const itemDate = this.parseJapaneseDate(item.date);
                if (!itemDate) return true;
                const nextDay = new Date(itemDate);
                nextDay.setDate(itemDate.getDate() + 1);
                nextDay.setHours(0, 0, 0, 0);
                return now < nextDay;
            } catch (error) {
                console.error('日付解析エラー:', error);
                return true;
            }
        });

        if (this.data.schedule.length !== originalLength) {
            console.log(`期限切れのスケジュール ${originalLength - this.data.schedule.length} 件を自動削除しました`);
            this.saveData();
        }

        this.data.schedule.sort((a, b) => {
            try {
                const dateA = this.parseJapaneseDate(a.date);
                const dateB = this.parseJapaneseDate(b.date);
                if (!dateA || !dateB) return 0;
                const diffA = Math.abs(now - dateA);
                const diffB = Math.abs(now - dateB);
                return diffA - diffB;
            } catch (error) {
                console.error('日付ソートエラー:', error);
                return 0;
            }
        });

        this.data.schedule.forEach((item, index) => {
            const element = this.createContentElement(item, index, 'schedule');
            container.appendChild(element);
        });
        this.updateUI();
    }

    renderWeb() {
        const container = document.getElementById('web-list');
        container.innerHTML = '';
        this.data.web.forEach((item, index) => {
            const element = this.createContentElement(item, index, 'web');
            container.appendChild(element);
        });
        this.updateUI();
    }

    renderRoadmap() {
        const container = document.getElementById('roadmap-list');
        container.innerHTML = '';

        this.data.roadmap.sort((a, b) => {
            try {
                const dateA = this.parseJapaneseDate(a.date);
                const dateB = this.parseJapaneseDate(b.date);
                if (!dateA && !dateB) return 0;
                if (!dateA) return 1;
                if (!dateB) return -1;
                return dateA - dateB;
            } catch (error) {
                console.error('ロードマップ日付ソートエラー:', error);
                return 0;
            }
        });

        const timeline = document.createElement('div');
        timeline.className = 'roadmap-timeline';

        this.data.roadmap.forEach((item, index) => {
            const element = this.createContentElement(item, index, 'roadmap');
            timeline.appendChild(element);
        });

        container.appendChild(timeline);
        this.updateUI();
    }

    // お問い合わせレンダリング（自分の投稿のみ表示・修正版）
    renderContact() {
        const container = document.getElementById('contact-list');
        if (!container) return;
        container.innerHTML = '';

        // 自分のお問い合わせのみフィルタリング
        let filteredContacts = [];
        if (this.userMode === 'admin') {
            // 管理者は全ての問い合わせを見る
            filteredContacts = this.data.contact;
        } else if (this.isLoggedIn && this.currentUser) {
            // 一般・メンバーは自分のもののみ
            filteredContacts = this.data.contact.filter(item =>
                item.userId === this.currentUser.id
            );
        }

        if (filteredContacts.length === 0) {
            const message = this.userMode === 'admin' ?
                'お問い合わせはまだありません。' :
                'あなたのお問い合わせはまだありません。';
            container.innerHTML = `
                <div class="no-content">
                    <p>${message}</p>
                    ${this.userMode !== 'admin' ? '<p>右下の「+」ボタンからお問い合わせを送信できます。</p>' : ''}
                    ${this.userMode !== 'admin' && this.isLoggedIn ? `<p>残り送信回数: ${3 - this.dailyContactCount}回/日</p>` : ''}
                </div>
            `;
        } else {
            filteredContacts.forEach((item, index) => {
                const element = this.createContentElement(item, index, 'contact', true);
                container.appendChild(element);
            });
        }
        this.updateUI();
    }

    renderServer() {
        const container = document.getElementById('server-info');

        if (!this.data.serverConfig) {
            container.innerHTML = `
                <div class="server-status-card">
                    <h3 style="text-align: center; color: #666; margin-bottom: 20px;">サーバー設定がありません</h3>
                    <p style="text-align: center; color: #888;">管理者がサーバー設定を行ってください。</p>
                </div>
            `;
            this.updateUI();
            return;
        }

        const config = this.data.serverConfig;
        const status = this.serverStatus;

        let serverContent = '';

        if (!status) {
            serverContent = `
                <div class="server-status-card">
                    <div class="server-status-header">
                        <div class="loading-spinner"></div>
                        <h3 class="server-status-title">サーバー情報を取得中...</h3>
                    </div>
                    <p style="text-align: center; color: #888;">サーバーに接続しています。しばらくお待ちください。</p>
                </div>
            `;
        } else {
            const showAddress = this.userMode !== 'guest';

            if (showAddress) {
                serverContent = `
                    <div class="server-status-card">
                        <div class="server-status-header">
                            <div class="server-status-icon ${status.online ? 'server-status-online' : 'server-status-offline'}"></div>
                            <h3 class="server-status-title">${status.online ? 'オンライン' : 'オフライン'}</h3>
                            <div class="realtime-indicator">
                                <span class="realtime-badge">5秒更新</span>
                            </div>
                        </div>
                        <div class="server-layout-member-with-players">
                            <div class="server-address-full">
                                <div class="server-detail-label">サーバーアドレス</div>
                                <div class="server-detail-value">${config.address}</div>
                            </div>
                            <div class="server-players-section">
                                <div class="server-detail-label">プレイヤー</div>
                                <div class="server-detail-value server-players">${status.players ? status.players.online : 0}/${status.players ? status.players.max : 0}</div>
                            </div>
                            <div class="server-version-section">
                                <div class="server-detail-label">バージョン</div>
                                <div class="server-detail-value">${status.version}</div>
                            </div>
                            <div class="server-type-section">
                                <div class="server-detail-label">サーバータイプ</div>
                                <div class="server-detail-value">${config.serverType}</div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                serverContent = `
                    <div class="server-status-card">
                        <div class="server-status-header">
                            <div class="server-status-icon ${status.online ? 'server-status-online' : 'server-status-offline'}"></div>
                            <h3 class="server-status-title">${status.online ? 'オンライン' : 'オフライン'}</h3>
                            <div class="realtime-indicator">
                                <span class="realtime-badge">5秒更新</span>
                            </div>
                        </div>
                        <div class="server-layout-guest-with-players">
                            <div class="server-application-full">
                                <div class="server-detail-label">参加方法</div>
                                <div class="server-application-content">${this.parseDiscordMarkdown(config.application)}</div>
                            </div>
                            <div class="server-players-section">
                                <div class="server-detail-label">プレイヤー</div>
                                <div class="server-detail-value server-players">${status.players ? status.players.online : 0}/${status.players ? status.players.max : 0}</div>
                            </div>
                            <div class="server-version-section">
                                <div class="server-detail-label">バージョン</div>
                                <div class="server-detail-value">${status.version}</div>
                            </div>
                            <div class="server-type-section">
                                <div class="server-detail-label">サーバータイプ</div>
                                <div class="server-detail-value">${config.serverType}</div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        container.innerHTML = serverContent;
        this.updateUI();
    }

    forceButtonRefresh() {
        const plusBtn = document.getElementById('admin-plus-btn');
        const setBtn = document.getElementById('admin-set-btn');

        if (plusBtn) {
            plusBtn.style.display = 'none';
            setTimeout(() => {
                this.updateUI();
            }, 10);
        }

        if (setBtn) {
            setBtn.style.display = 'none';
            setTimeout(() => {
                this.updateUI();
            }, 10);
        }
    }

    getCurrentDateString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        return `${year}/${month}/${day}`;
    }

    formatDateForInput(dateString) {
        if (!dateString) return '';
        const parts = dateString.split('/');
        if (parts.length === 3) {
            const [year, month, day] = parts;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        return '';
    }

    formatDateForDisplay(dateString) {
        if (!dateString) return '';
        const parts = dateString.split('-');
        if (parts.length === 3) {
            const [year, month, day] = parts;
            return `${year}/${parseInt(month)}/${parseInt(day)}`;
        }
        return dateString;
    }

    parseJapaneseDate(dateString) {
        if (!dateString) return null;
        const parts = dateString.split('/');
        if (parts.length === 3) {
            const [year, month, day] = parts.map(Number);
            return new Date(year, month - 1, day);
        }
        return null;
    }

    cleanExpiredSchedules() {
        if (!this.data.schedule || this.data.schedule.length === 0) return;
        const now = new Date();
        const originalLength = this.data.schedule.length;

        this.data.schedule = this.data.schedule.filter(item => {
            try {
                const itemDate = this.parseJapaneseDate(item.date);
                if (!itemDate) return true;
                const nextDay = new Date(itemDate);
                nextDay.setDate(itemDate.getDate() + 1);
                nextDay.setHours(0, 0, 0, 0);
                return now < nextDay;
            } catch (error) {
                return true;
            }
        });

        if (this.data.schedule.length !== originalLength) {
            this.saveData();
            console.log(`期限切れのスケジュール ${originalLength - this.data.schedule.length} 件を削除しました`);
        }
    }

    hideModal() {
        const modal = document.getElementById('modal-overlay');
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';

        document.getElementById('hidden-file-input').value = '';
        this.selectedImageData = null;
        this.modalType = 'add';
        this.editIndex = -1;
        this.editType = '';
    }

    // コンテンツ要素作成（自分の投稿のみ編集・削除可能・修正版）
    createContentElement(item, index, type, isFiltered = false) {
        const div = document.createElement('div');
        div.className = `${type}-item`;

        // 編集・削除ボタンの表示判定
        const canEdit = this.userMode === 'admin' ||
            (this.isLoggedIn && this.currentUser &&
             (type === 'member' || type === 'contact') &&
             item.userId === this.currentUser.id);

        if (type === 'member') {
            div.innerHTML = `
                <img src="${item.image}" alt="${item.name}" class="member-image">
                <div class="member-info">
                    <h3>${item.name}</h3>
                    <div class="member-description">${this.parseDiscordMarkdown(item.description)}</div>
                </div>
                <button class="edit-btn" data-type="${type}" data-index="${index}" style="display: ${canEdit ? 'flex' : 'none'};" title="編集">✏️</button>
                <button class="delete-btn" data-type="${type}" data-index="${index}" style="display: ${canEdit ? 'flex' : 'none'};">×</button>
            `;
        } else if (type === 'web') {
            div.className = 'web-item';
            div.innerHTML = `
                <img src="${item.icon}" alt="${item.title}" class="web-icon">
                <div class="web-title">${item.title}</div>
                <button class="edit-btn" data-type="${type}" data-index="${index}" style="display: ${this.userMode === 'admin' ? 'flex' : 'none'};" title="編集">✏️</button>
                <button class="delete-btn" data-type="${type}" data-index="${index}" style="display: ${this.userMode === 'admin' ? 'flex' : 'none'};">×</button>
            `;
            div.addEventListener('click', (e) => {
                if (!e.target.matches('.edit-btn, .delete-btn')) {
                    window.open(item.url, '_blank');
                }
            });
        } else if (type === 'contact') {
            div.className = 'content-item';
            let contactContent = `
                <h3>${item.title}</h3>
                <div class="content-body">${this.parseDiscordMarkdown(item.content)}</div>
                <div class="content-date">${item.date} - ${item.sender}</div>
            `;

// 前のコードから続き...

            // 返信がある場合は表示
            if (item.reply && item.reply.content) {
                contactContent += `
                    <div class="contact-reply" style="margin-top: 10px; padding: 10px; background: #f5f5f5; border-left: 3px solid #007bff;">
                        <div style="font-weight: bold; color: #007bff;">管理者からの返信:</div>
                        <div>${this.parseDiscordMarkdown(item.reply.content)}</div>
                        <div style="font-size: 0.9em; color: #666; margin-top: 5px;">${item.reply.date} - ${item.reply.sender}</div>
                    </div>
                `;
            }

            // 管理者の場合は返信ボタンを追加
            if (this.userMode === 'admin' && (!item.reply || !item.reply.content)) {
                contactContent += `
                    <button class="btn btn-small btn-primary reply-btn" onclick="lightServer.showContactReplyModal(${index})" style="margin-top: 10px;">返信</button>
                `;
            }

            contactContent += `
                <button class="edit-btn" data-type="${type}" data-index="${index}" style="display: ${canEdit ? 'flex' : 'none'};" title="編集">✏️</button>
                <button class="delete-btn" data-type="${type}" data-index="${index}" style="display: ${canEdit ? 'flex' : 'none'};">×</button>
            `;

            div.innerHTML = contactContent;
        } else {
            div.className = 'content-item';
            div.innerHTML = `
                <h3>${item.title}</h3>
                <div class="content-body">${this.parseDiscordMarkdown(item.content)}</div>
                <div class="content-date">${item.date}</div>
                <button class="edit-btn" data-type="${type}" data-index="${index}" style="display: ${this.userMode === 'admin' ? 'flex' : 'none'};" title="編集">✏️</button>
                <button class="delete-btn" data-type="${type}" data-index="${index}" style="display: ${this.userMode === 'admin' ? 'flex' : 'none'};">×</button>
            `;
        }

        const editBtn = div.querySelector('.edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showEditModal(type, index);
            });
        }

        const deleteBtn = div.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('この項目を削除しますか？')) {
                    this.data[type].splice(index, 1);
                    this.saveData();
                    this.renderCurrentPage();
                }
            });
        }

        return div;
    }

    // お問い合わせ返信モーダル表示
    showContactReplyModal(index) {
        const item = this.data.contact[index];
        if (!item) return;

        this.modalType = 'reply-contact';
        this.editIndex = index;

        const modal = document.getElementById('modal-overlay');
        const title = document.querySelector('#modal-overlay h3');
        const body = document.getElementById('modal-body');

        title.textContent = 'お問い合わせに返信';

        body.innerHTML = `
            <div class="form-group">
                <label>元のお問い合わせ</label>
                <div style="background: #f5f5f5; padding: 10px; border-radius: 4px; margin-bottom: 10px;">
                    <h4>${item.title}</h4>
                    <div>${this.parseDiscordMarkdown(item.content)}</div>
                    <div style="font-size: 0.9em; color: #666; margin-top: 5px;">${item.date} - ${item.sender}</div>
                </div>
            </div>
            <div class="form-group">
                <label for="reply-content">返信内容</label>
                <textarea id="reply-content" placeholder="返信内容を入力してください" required></textarea>
            </div>
        `;

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    // お問い合わせ返信処理
    handleContactReply() {
        const content = document.getElementById('reply-content').value.trim();

        if (!content) {
            alert('返信内容を入力してください');
            return;
        }

        const item = this.data.contact[this.editIndex];
        if (!item) {
            alert('お問い合わせが見つかりません');
            return;
        }

        item.reply = {
            content: content,
            date: this.getCurrentDateString(),
            sender: this.formatDisplayName(this.currentUser),
            adminId: this.currentUser.id
        };

        this.saveData();
        this.renderCurrentPage();
        this.hideModal();

        alert('返信を送信しました');
    }

    showEditModal(type, index) {
        const modal = document.getElementById('modal-overlay');
        const title = document.querySelector('#modal-overlay h3');
        const body = document.getElementById('modal-body');

        this.modalType = 'edit';
        this.editIndex = index;
        this.editType = type;

        title.textContent = `${this.getPageDisplayName()}を編集`;

        const item = this.data[type][index];
        const fields = this.getFormFields();

        body.innerHTML = fields.map(field => {
            const currentValue = item[field.id] || '';

            if (field.type === 'textarea') {
                return `
                    <div class="form-group">
                        <label for="${field.id}">${field.label}</label>
                        <textarea id="${field.id}" placeholder="${field.placeholder || ''}">${currentValue}</textarea>
                    </div>
                `;
            } else if (field.type === 'file') {
                return `
                    <div class="form-group">
                        <label for="${field.id}">${field.label}</label>
                        <div class="file-input-wrapper">
                            <button type="button" class="file-select-btn" onclick="document.getElementById('hidden-file-input').click()">選択</button>
                            <span id="file-name">現在の画像を変更しない</span>
                        </div>
                        <img id="image-preview" class="image-preview" src="${currentValue}" style="display: ${currentValue ? 'block' : 'none'};">
                    </div>
                `;
            } else if (field.type === 'date') {
                return `
                    <div class="form-group">
                        <label for="${field.id}">${field.label}</label>
                        <input type="date" id="${field.id}" value="${this.formatDateForInput(currentValue)}">
                    </div>
                `;
            } else if (field.type === 'select') {
                const options = field.options.map(option =>
                    `<option value="${option}" ${option === currentValue ? 'selected' : ''}>${option.charAt(0).toUpperCase() + option.slice(1)}</option>`
                ).join('');
                return `
                    <div class="form-group">
                        <label for="${field.id}">${field.label}</label>
                        <select id="${field.id}">
                            <option value="">選択してください</option>
                            ${options}
                        </select>
                    </div>
                `;
            } else {
                return `
                    <div class="form-group">
                        <label for="${field.id}">${field.label}</label>
                        <input type="${field.type}" id="${field.id}" value="${currentValue}" placeholder="${field.placeholder || ''}">
                    </div>
                `;
            }
        }).join('');

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    handleEditSubmit() {
        const fields = this.getFormFields();
        const data = {};
        let isValid = true;

        fields.forEach(field => {
            if (field.type === 'file') {
                if (this.selectedImageData) {
                    data[field.id.replace('-', '')] = this.selectedImageData;
                } else {
                    data[field.id.replace('-', '')] = this.data[this.editType][this.editIndex][field.id.replace('-', '')];
                }
            } else if (field.type === 'select') {
                const value = document.getElementById(field.id).value.trim();
                if (!value) {
                    alert(`${field.label}を選択してください`);
                    isValid = false;
                    return;
                }
                data[field.id] = value;

                if (this.currentPage === 'web' && field.id === 'type') {
                    data.icon = this.getWebIconPath(value);
                }
            } else if (field.type === 'date') {
                const value = document.getElementById(field.id).value;
                if (!value) {
                    alert(`${field.label}を選択してください`);
                    isValid = false;
                    return;
                }
                data[field.id] = this.formatDateForDisplay(value);
            } else {
                const value = document.getElementById(field.id).value.trim();
                if (!value) {
                    alert(`${field.label}を入力してください`);
                    isValid = false;
                    return;
                }
                data[field.id] = value;
            }
        });

        if (!isValid) return;

        if (this.editType !== 'news') {
            data.date = this.data[this.editType][this.editIndex].date;
            if (this.editType === 'contact') {
                data.sender = this.data[this.editType][this.editIndex].sender;
                data.userId = this.data[this.editType][this.editIndex].userId;
                // 返信がある場合は保持
                if (this.data[this.editType][this.editIndex].reply) {
                    data.reply = this.data[this.editType][this.editIndex].reply;
                }
            }
            if (this.editType === 'member') {
                data.userId = this.data[this.editType][this.editIndex].userId;
            }
        }

        this.data[this.editType][this.editIndex] = data;

        this.saveData();
        this.renderCurrentPage();
        this.hideModal();
    }

    parseDiscordMarkdown(text) {
        if (!text) return '';
        text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        text = text.replace(/^### (.+)$/gm, '<strong>$1</strong>');
        text = text.replace(/^## (.+)$/gm, '<h3>$1</h3>');
        text = text.replace(/^# (.+)$/gm, '<h2>$1</h2>');
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" onclick="this.style.color=\'#dcddde\'">$1</span>');
        text = text.replace(/^-# (.+)$/gm, '<small>$1</small>');
        text = text.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');
        text = text.replace(/\n/g, '<br>');
        return text;
    }

    getPageDisplayName() {
        const names = {
            'news': 'ニュース',
            'member': 'メンバー',
            'schedule': 'スケジュール',
            'web': 'ウェブサイト',
            'roadmap': 'ロードマップ',
            'contact': 'お問い合わせ'
        };
        return names[this.currentPage] || 'アイテム';
    }

    getFormFields() {
        const commonFields = {
            'news': [
                { id: 'title', label: 'タイトル', type: 'text', placeholder: 'ニュースのタイトル' },
                { id: 'content', label: '内容', type: 'textarea', placeholder: 'ニュースの内容' }
            ],
            'member': [
                { id: 'name', label: '名前', type: 'text', placeholder: 'メンバーの名前' },
                { id: 'description', label: '説明', type: 'textarea', placeholder: 'メンバーの説明' },
                { id: 'image', label: '画像', type: 'file' }
            ],
            'schedule': [
                { id: 'title', label: 'タイトル', type: 'text', placeholder: 'イベントのタイトル' },
                { id: 'content', label: '詳細', type: 'textarea', placeholder: 'イベントの詳細' },
                { id: 'date', label: '日時', type: 'date' }
            ],
            'web': [
                { id: 'title', label: 'タイトル', type: 'text', placeholder: 'ウェブサイトの名前' },
                { id: 'url', label: 'URL', type: 'url', placeholder: 'https://example.com' },
                { id: 'type', label: '種類', type: 'select', options: ['discord', 'youtube', 'twitter'] }
            ],
            'roadmap': [
                { id: 'title', label: 'タイトル', type: 'text', placeholder: 'ロードマップのタイトル' },
                { id: 'content', label: '内容', type: 'textarea', placeholder: 'ロードマップの内容' },
                { id: 'date', label: '予定日', type: 'date' }
            ],
            'contact': [
                { id: 'title', label: '件名', type: 'text', placeholder: 'お問い合わせの件名' },
                { id: 'content', label: '内容', type: 'textarea', placeholder: 'お問い合わせの内容' }
            ]
        };

        return commonFields[this.currentPage] || [];
    }

    showAddModal() {
        const modal = document.getElementById('modal-overlay');
        const title = document.querySelector('#modal-overlay h3');
        const body = document.getElementById('modal-body');

        title.textContent = `${this.getPageDisplayName()}を追加`;

        const fields = this.getFormFields();

        body.innerHTML = fields.map(field => {
            if (field.type === 'textarea') {
                return `
                    <div class="form-group">
                        <label for="${field.id}">${field.label}</label>
                        <textarea id="${field.id}" placeholder="${field.placeholder}"></textarea>
                    </div>
                `;
            } else if (field.type === 'file') {
                return `
                    <div class="form-group">
                        <label for="${field.id}">${field.label}</label>
                        <div class="file-input-wrapper">
                            <button type="button" class="file-select-btn" onclick="document.getElementById('hidden-file-input').click()">選択</button>
                            <span id="file-name">ファイルが選択されていません</span>
                        </div>
                        <img id="image-preview" class="image-preview" style="display: none;">
                    </div>
                `;
            } else if (field.type === 'date') {
                return `
                    <div class="form-group">
                        <label for="${field.id}">${field.label}</label>
                        <input type="date" id="${field.id}">
                    </div>
                `;
            } else if (field.type === 'select') {
                const options = field.options.map(option =>
                    `<option value="${option}">${option.charAt(0).toUpperCase() + option.slice(1)}</option>`
                ).join('');
                return `
                    <div class="form-group">
                        <label for="${field.id}">${field.label}</label>
                        <select id="${field.id}">
                            <option value="">選択してください</option>
                            ${options}
                        </select>
                    </div>
                `;
            } else {
                return `
                    <div class="form-group">
                        <label for="${field.id}">${field.label}</label>
                        <input type="${field.type}" id="${field.id}" placeholder="${field.placeholder}">
                    </div>
                `;
            }
        }).join('');

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    showServerSettingsModal() {
        const modal = document.getElementById('modal-overlay');
        const title = document.querySelector('#modal-overlay h3');
        const body = document.getElementById('modal-body');

        title.textContent = 'サーバー設定';

        const currentConfig = this.data.serverConfig || {};

        body.innerHTML = `
            <div class="form-group">
                <label for="server-address">サーバーアドレス</label>
                <input type="text" id="server-address" value="${currentConfig.address || ''}" placeholder="example.com または 192.168.1.1:25565">
            </div>
            <div class="form-group">
                <label for="server-type">サーバータイプ</label>
                <select id="server-type">
                    <option value="Vanilla" ${currentConfig.serverType === 'Vanilla' ? 'selected' : ''}>Vanilla</option>
                    <option value="Spigot" ${currentConfig.serverType === 'Spigot' ? 'selected' : ''}>Spigot</option>
                    <option value="Paper" ${currentConfig.serverType === 'Paper' ? 'selected' : ''}>Paper</option>
                    <option value="Forge" ${currentConfig.serverType === 'Forge' ? 'selected' : ''}>Forge</option>
                    <option value="Fabric" ${currentConfig.serverType === 'Fabric' ? 'selected' : ''}>Fabric</option>
                    <option value="BungeeCord" ${currentConfig.serverType === 'BungeeCord' ? 'selected' : ''}>BungeeCord</option>
                    <option value="Velocity" ${currentConfig.serverType === 'Velocity' ? 'selected' : ''}>Velocity</option>
                </select>
            </div>
            <div class="form-group">
                <label for="server-application">参加方法</label>
                <textarea id="server-application" placeholder="サーバーへの参加方法を記載してください">${currentConfig.application || ''}</textarea>
            </div>
        `;

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    handleModalSubmit() {
        const fields = this.getFormFields();
        const data = {};
        let isValid = true;

        fields.forEach(field => {
            if (field.type === 'file') {
                if (this.selectedImageData) {
                    data[field.id.replace('-', '')] = this.selectedImageData;
                } else {
                    alert(`${field.label}を選択してください`);
                    isValid = false;
                }
            } else if (field.type === 'select') {
                const value = document.getElementById(field.id).value.trim();
                if (!value) {
                    alert(`${field.label}を選択してください`);
                    isValid = false;
                    return;
                }
                data[field.id] = value;

                if (this.currentPage === 'web' && field.id === 'type') {
                    data.icon = this.getWebIconPath(value);
                }
            } else if (field.type === 'date') {
                const value = document.getElementById(field.id).value;
                if (!value) {
                    alert(`${field.label}を選択してください`);
                    isValid = false;
                    return;
                }
                data[field.id] = this.formatDateForDisplay(value);
            } else {
                const value = document.getElementById(field.id).value.trim();
                if (!value) {
                    alert(`${field.label}を入力してください`);
                    isValid = false;
                    return;
                }
                data[field.id] = value;
            }
        });

        if (!isValid) return;

        if (this.currentPage === 'news') {
            data.date = this.getCurrentDateString();
        }

        if (this.currentPage === 'contact') {
            // お問い合わせ制限チェック
            if (!this.canSendContact()) {
                alert(`1日のお問い合わせ上限（3回）に達しています。明日0:00にリセットされます。`);
                return;
            }

            data.sender = this.isLoggedIn ? this.formatDisplayName(this.currentUser) : 'ゲスト';
            if (this.isLoggedIn && this.currentUser) {
                data.userId = this.currentUser.id;
            }

            // お問い合わせ回数を増やす
            this.incrementContactCount();
        }

        if (this.currentPage === 'member') {
            if (this.isLoggedIn && this.currentUser) {
                data.userId = this.currentUser.id;
            }
        }

        if (this.currentPage === 'web') {
            this.data[this.currentPage].push(data);
        } else {
            this.data[this.currentPage].unshift(data);
        }

        this.saveData();
        this.renderCurrentPage();
        this.hideModal();
    }

    handleServerSettingsSubmit() {
        const address = document.getElementById('server-address').value.trim();
        const serverType = document.getElementById('server-type').value;
        const application = document.getElementById('server-application').value.trim();

        if (!address) {
            alert('サーバーアドレスを入力してください');
            return;
        }

        this.data.serverConfig = {
            address: address,
            serverType: serverType,
            application: application
        };

        this.saveData();
        this.hideModal();

        if (this.currentPage === 'server') {
            this.fetchServerStatus();
            this.startServerStatusUpdates();
            this.renderServer();
        }

        alert('サーバー設定を保存しました');
    }

    handleContactSubmit() {
        const title = document.getElementById('contact-title').value.trim();
        const content = document.getElementById('contact-content').value.trim();

        if (!title || !content) {
            alert('件名と内容を入力してください');
            return;
        }

        // お問い合わせ制限チェック
        if (!this.canSendContact()) {
            alert(`1日のお問い合わせ上限（3回）に達しています。明日0:00にリセットされます。`);
            return;
        }

        const contactItem = {
            title: title,
            content: content,
            date: this.getCurrentDateString(),
            sender: this.isLoggedIn ? this.formatDisplayName(this.currentUser) : 'ゲスト'
        };

        if (this.isLoggedIn && this.currentUser) {
            contactItem.userId = this.currentUser.id;
        }

        // お問い合わせ回数を増やす
        this.incrementContactCount();

        this.data.contact.unshift(contactItem);
        this.saveData();
        this.renderCurrentPage();
        this.hideModal();
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('画像ファイルを選択してください');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.selectedImageData = e.target.result;
            const preview = document.getElementById('image-preview');
            const fileName = document.getElementById('file-name');
            if (preview) {
                preview.src = this.selectedImageData;
                preview.style.display = 'block';
            }
            if (fileName) {
                fileName.textContent = file.name;
            }
        };
        reader.readAsDataURL(file);
    }

    getWebIconPath(type) {
        const iconMap = {
            'discord': 'discord.png',
            'youtube': 'youtube.png',
            'twitter': 'twitter.png'
        };
        return iconMap[type] || 'default.png';
    }

    startServerStatusUpdates() {
        if (this.serverUpdateInterval) {
            clearInterval(this.serverUpdateInterval);
        }

        this.serverUpdateInterval = setInterval(() => {
            if (this.data.serverConfig && this.data.serverConfig.address && !this.isApiDisabled) {
                this.fetchServerStatus();
            }
        }, 5000);

        console.log('サーバー状態の定期更新を開始（5秒間隔）');
    }

    stopServerStatusUpdates() {
        if (this.serverUpdateInterval) {
            clearInterval(this.serverUpdateInterval);
            this.serverUpdateInterval = null;
        }
    }

    async fetchServerStatus() {
        if (!this.data.serverConfig || !this.data.serverConfig.address) {
            return;
        }

        const address = this.data.serverConfig.address;

        try {
            const response = await fetch(`https://api.mcsrvstat.us/3/${address}`);

            if (response.status === 429) {
                console.warn('API制限に達しました。60秒後に再試行します');
                setTimeout(() => {
                    this.updateFailureCount = 0;
                    console.log('API制限が解除されました');
                }, 60000);
                return;
            }

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (!data || data.online === undefined) {
                throw new Error('Invalid API response');
            }

            this.serverStatus = {
                online: data.online === true,
                players: {
                    online: data.players?.online || 0,
                    max: data.players?.max || 0
                },
                version: this.data.serverConfig.version || 'バージョン未設定',
                motd: data.motd ? (data.motd.clean || data.motd) : 'No MOTD',
                lastApiUpdate: new Date().toLocaleTimeString('ja-JP')
            };

            this.updateFailureCount = 0;
            this.lastSuccessfulUpdate = Date.now();

            if (this.currentPage === 'server') {
                this.renderServer();
            }

        } catch (error) {
            console.error('サーバー状態取得エラー:', error);
            this.updateFailureCount++;

            if (this.updateFailureCount >= this.maxFailures) {
                this.serverStatus = null;
                console.warn(`API取得に${this.updateFailureCount}/${this.maxFailures}回失敗しました`);
                return;
            }

            this.serverStatus = {
                online: false,
                players: {
                    online: 0,
                    max: 0
                },
                version: this.data.serverConfig.version || 'バージョン未設定',
                motd: 'Connection failed...',
                lastApiUpdate: new Date().toLocaleTimeString('ja-JP')
            };

            if (this.currentPage === 'server') {
                this.renderServer();
            }
        }
    }
}

let lightServer;

document.addEventListener('DOMContentLoaded', () => {
    lightServer = new LightServerWebsite();
    window.lightServer = lightServer;
    console.log('光鯖公式ホームページ初期化完了（全改善対応・完全版）');
});
