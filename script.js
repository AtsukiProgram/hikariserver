// Firebase v9 Modular SDK インポート
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, get, child } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

// Discord OAuth2設定
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
        this.adminOverride = false;
        this.isPromptActive = false;
        this.currentAccountTab = 'web';

        this.data = {
            news: [],
            member: [],
            schedule: [],
            web: [],
            roadmap: [],
            contact: [],
            users: [],
            userPermissions: {},
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
        this.cleanExpiredSchedules();

        setTimeout(() => {
            this.updateUI();
            this.updateLoginUI();
            this.forceButtonRefresh();
        }, 100);

        console.log('光鯖公式ホームページ初期化完了（元のデザイン対応版）');
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

    handleSuccessfulLogin(userData) {
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

        this.checkUserPermissions();
        this.updateLoginUI();
        this.showPage('account');

        console.log('ログイン完了:', this.currentUser.username);
    }

    showFallbackAuth() {
        alert('Discord認証に失敗しました。');
    }

    checkUserPermissions() {
        if (!this.currentUser) {
            this.userMode = 'guest';
            return;
        }

        const savedPermission = localStorage.getItem(`user_permission_${this.currentUser.id}`);
        if (savedPermission) {
            this.userMode = savedPermission;
        } else {
            this.userMode = 'member';
            this.saveUserPermission(this.currentUser.id, 'member');
        }

        console.log(`ユーザー権限: ${this.userMode}`);

        setTimeout(() => {
            this.updateUI();
        }, 100);
    }

    saveUserPermission(userId, permission) {
        localStorage.setItem(`user_permission_${userId}`, permission);
        if (this.data.userPermissions) {
            this.data.userPermissions[userId] = permission;
            this.saveData();
        }
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

                    this.checkUserPermissions();

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

        this.currentAccountTab = localStorage.getItem('current_account_tab') || 'web';
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
    }

    formatDisplayName(user) {
        if (!user) return '';

        const username = user.global_name || user.username;
        const discriminator = user.discriminator;

        if (!discriminator || discriminator === '0' || discriminator === '0000') {
            return username;
        }

        return `${username}#${discriminator}`;
    }

    updateLoginUI() {
        const loginBtn = document.getElementById('loginBtn');
        const navText = loginBtn.querySelector('.nav-text');
        const navJapanese = loginBtn.querySelector('.nav-japanese');

        if (this.isLoggedIn && this.currentUser) {
            navText.textContent = 'ACCOUNT';
            navJapanese.textContent = 'アカウント';
            loginBtn.dataset.page = 'account';

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
            this.clearLoginState();
            this.updateLoginUI();
            this.showPage('top');

            console.log('ログアウト完了');
        }
    }

    setupEventListeners() {
        document.querySelectorAll('.nav-link').forEach(link => {
            const handleNavClick = (e) => {
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

    renderAccountPage() {
        if (!this.currentUser) return;

        const userInfo = document.getElementById('account-user-info');
        const avatarUrl = this.currentUser.avatar
            ? `https://cdn.discordapp.com/avatars/${this.currentUser.id}/${this.currentUser.avatar}.png?size=128`
            : `https://cdn.discordapp.com/embed/avatars/${this.currentUser.discriminator % 5}.png`;

        const displayName = this.formatDisplayName(this.currentUser);

        const userRoleHtml = `
            <div class="user-role" id="member-role-display">${this.getUserRoleDisplay()}</div>
        `;

        userInfo.innerHTML = `
            <img src="${avatarUrl}" alt="${displayName}" class="user-avatar">
            <div class="user-username">${displayName}</div>
            ${userRoleHtml}
        `;

        setTimeout(() => {
            const memberRoleElement = document.getElementById('member-role-display');
            if (memberRoleElement && this.userMode !== 'admin') {
                memberRoleElement.addEventListener('click', (e) => {
                    if (e.ctrlKey && e.shiftKey) {
                        e.preventDefault();
                        e.stopPropagation();

                        this.isPromptActive = true;
                        document.body.classList.add('prompt-active');

                        setTimeout(() => {
                            const password = prompt('管理者パスワードを入力してください:');

                            this.isPromptActive = false;
                            document.body.classList.remove('prompt-active');

                            if (password === 'atsuki0622') {
                                this.userMode = 'admin';
                                this.saveUserPermission(this.currentUser.id, 'admin');

                                this.updateLoginUI();
                                this.updateUI();
                                this.renderAccountPage();

                                alert('管理者権限を取得しました');
                            } else if (password) {
                                alert('パスワードが間違っています');
                            }
                        }, 50);
                    }
                });
            }
        }, 100);

        this.setupAccountTabs();
        this.showAccountTab(this.currentAccountTab);
    }

    getUserRoleDisplay() {
        switch (this.userMode) {
            case 'admin': return '管理者';
            case 'member': return 'メンバー';
            default: return '一般ユーザー';
        }
    }

    setupAccountTabs() {
        const tabButtons = document.querySelectorAll('.account-nav-item');

        tabButtons.forEach(button => {
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
        });

        const newTabButtons = document.querySelectorAll('.account-nav-item');
        newTabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const tab = button.dataset.tab;

                document.querySelectorAll('.account-nav-item').forEach(btn => {
                    btn.classList.remove('active');
                });

                button.classList.add('active');

                this.currentAccountTab = tab;
                localStorage.setItem('current_account_tab', tab);

                this.showAccountTab(tab);
            });
        });
    }

    showAccountTab(tabName) {
        document.querySelectorAll('.account-tab').forEach(tab => {
            tab.classList.remove('active');
        });

        document.querySelectorAll('.account-nav-item').forEach(btn => {
            btn.classList.remove('active');
        });

        const activeTabButton = document.querySelector(`[data-tab="${tabName}"]`);
        if (activeTabButton) {
            activeTabButton.classList.add('active');
        }

        const targetTab = document.getElementById(`account-tab-${tabName}`);
        if (targetTab) {
            targetTab.classList.add('active');
        }

        switch (tabName) {
            case 'web':
                this.renderWebTab();
                break;
            case 'permissions':
                this.renderPermissionsTab();
                break;
        }
    }

    renderWebTab() {
        const webList = document.getElementById('user-web-list');
        const addBtn = document.getElementById('add-user-web-btn');

        if (addBtn) {
            addBtn.onclick = () => this.showAddUserWebModal();
        }

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

    renderPermissionsTab() {
        const permissionsContent = document.getElementById('permissions-content');

        if (this.userMode === 'admin') {
            permissionsContent.innerHTML = `
                <div class="permission-role">管理者権限</div>
                <div class="permission-description">
                    すべての機能にアクセスできます。コンテンツの追加・編集・削除、ユーザーの権限管理が可能です。
                </div>
                <h4 style="margin-top: 30px; color: #2c3e50;">ユーザー権限管理</h4>
                <div id="users-list" class="users-list"></div>
            `;
            this.renderRealUsersList();
        } else {
            const permissions = this.getPermissionDescription();
            const roleDisplay = this.getUserRoleDisplay();

            permissionsContent.innerHTML = `
                <div class="permission-role">あなたは${roleDisplay}です。</div>
                <div class="permission-description">${permissions}</div>
            `;
        }
    }

    renderRealUsersList() {
        const usersList = document.getElementById('users-list');
        if (!usersList) return;

        const allUsers = this.getAllRegisteredUsers();

        usersList.innerHTML = '';

        if (allUsers.length === 0) {
            usersList.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #666;">
                    まだ登録ユーザーはいません。
                </div>
            `;
        } else {
            allUsers.forEach(user => {
                const userItem = document.createElement('div');
                userItem.className = 'user-permission-item';
                const avatarUrl = user.avatar
                    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
                    : `https://cdn.discordapp.com/embed/avatars/${user.discriminator % 5}.png`;

                const displayName = this.formatDisplayName(user);
                const currentPermission = localStorage.getItem(`user_permission_${user.id}`) || 'member';

                userItem.innerHTML = `
                    <div class="user-permission-info">
                        <img src="${avatarUrl}" alt="${displayName}" class="user-permission-avatar">
                        <div>
                            <div class="user-permission-name">${displayName}</div>
                            <div class="user-permission-id">ID: ${user.id}</div>
                        </div>
                    </div>
                    <select class="role-select" onchange="lightServer.updateUserRole('${user.id}', this.value)">
                        <option value="guest" ${currentPermission === 'guest' ? 'selected' : ''}>ゲスト</option>
                        <option value="member" ${currentPermission === 'member' ? 'selected' : ''}>メンバー</option>
                        <option value="admin" ${currentPermission === 'admin' ? 'selected' : ''}>管理者</option>
                    </select>
                `;
                usersList.appendChild(userItem);
            });
        }
    }

    getAllRegisteredUsers() {
        const users = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('user_info_')) {
                try {
                    const userId = key.replace('user_info_', '');
                    const userInfo = JSON.parse(localStorage.getItem(key));
                    if (userInfo && userInfo.id) {
                        users.push(userInfo);
                    }
                } catch (error) {
                    console.error('ユーザー情報読み込みエラー:', error);
                }
            }
        }

        if (this.currentUser && !users.find(u => u.id === this.currentUser.id)) {
            users.push(this.currentUser);
            localStorage.setItem(`user_info_${this.currentUser.id}`, JSON.stringify(this.currentUser));
        }

        return users;
    }

    updateUserRole(userId, newRole) {
        if (this.userMode !== 'admin') {
            alert('権限がありません。');
            return;
        }

        this.saveUserPermission(userId, newRole);

        if (this.currentUser && this.currentUser.id === userId) {
            this.userMode = newRole;
            this.updateLoginUI();
            this.updateUI();
        }

        console.log(`ユーザー ${userId} の権限を ${newRole} に変更しました`);
        alert(`ユーザーの権限を「${newRole}」に変更しました。`);
    }

    getPermissionDescription() {
        switch (this.userMode) {
            case 'member':
                return 'メンバー権限をお持ちです。自己紹介の追加・編集、お問い合わせの送信、専用コンテンツの閲覧が可能です。';
            case 'admin':
                return '管理者権限をお持ちです。すべての機能にアクセスでき、ユーザーの権限管理も可能です。';
            default:
                return '基本的なコンテンツの閲覧とお問い合わせの送信が可能です。';
        }
    }

    showAddUserWebModal() {
        this.modalType = 'add-user-web';
        const modal = document.getElementById('modal-overlay');
        const title = document.getElementById('modal-title');
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
                    <button type="button" class="file-select-btn" onclick="document.getElementById('hidden-file-input').click()">画像を選択</button>
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

        localStorage.setItem('user_webs', JSON.stringify(this.userWebs));

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
        const title = document.getElementById('modal-title');
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
                    <button type="button" class="file-select-btn" onclick="document.getElementById('hidden-file-input').click()">画像を変更</button>
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
        web.title = title;
        web.url = url;
        if (this.selectedImageData) {
            web.icon = this.selectedImageData;
        }
        web.updated = new Date().toISOString();

        localStorage.setItem('user_webs', JSON.stringify(this.userWebs));

        this.renderWebTab();
        this.hideModal();
    }

    deleteUserWeb(index) {
        const web = this.userWebs[index];
        if (!web) return;

        if (confirm(`「${web.title}」を削除しますか？`)) {
            this.userWebs.splice(index, 1);
            localStorage.setItem('user_webs', JSON.stringify(this.userWebs));

            this.renderWebTab();
        }
    }

    async loadData() {
        try {
            const dbRef = ref(database);
            const snapshot = await get(child(dbRef, '/'));

            if (snapshot.exists()) {
                const firebaseData = snapshot.val();
                Object.keys(this.data).forEach(key => {
                    this.data[key] = firebaseData[key] || (key === 'serverConfig' ? null : []);
                });
            }

            this.renderCurrentPage();

            if (this.data.serverConfig && this.data.serverConfig.address && this.currentPage === 'server') {
                this.startServerStatusUpdates();
            }
        } catch (error) {
            console.error('Firebase データの読み込みに失敗:', error);
            this.loadLocalData();
        }

        this.loadUserData();
    }

    loadUserData() {
        if (this.isLoggedIn && this.currentUser) {
            const savedWebs = localStorage.getItem('user_webs');

            if (savedWebs) {
                try {
                    this.userWebs = JSON.parse(savedWebs).filter(web => web.userId === this.currentUser.id);
                } catch (error) {
                    console.error('ユーザーウェブデータ読み込みエラー:', error);
                    this.userWebs = [];
                }
            }
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
            } else {
                this.data[key] = JSON.parse(localStorage.getItem(key) || '[]');
            }
        });
        this.renderCurrentPage();

        if (this.data.serverConfig && this.data.serverConfig.address && this.currentPage === 'server') {
            this.startServerStatusUpdates();
        }
    }

    saveLocalData() {
        Object.keys(this.data).forEach(key => {
            localStorage.setItem(key, JSON.stringify(this.data[key]));
        });
    }

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
            } else if (this.userMode === 'member' && (this.currentPage === 'member' || this.currentPage === 'contact')) {
                if (this.isLoggedIn && this.currentUser) {
                    showPlusBtn = true;
                    showSetBtn = false;
                }
            } else if (this.userMode === 'guest') {
                showPlusBtn = false;
                showSetBtn = false;
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
                setBtn.style.right = '30px';
                setBtn.style.bottom = '30px';
            } else {
                setBtn.style.right = '100px';
                setBtn.style.bottom = '30px';
            }
        }

        deleteButtons.forEach(btn => {
            btn.style.display = this.userMode === 'admin' ? 'block' : 'none';
        });

        editButtons.forEach(btn => {
            btn.style.display = this.userMode === 'admin' ? 'block' : 'none';
        });
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
            console.log(`期限切れの予定 ${originalLength - this.data.schedule.length} 件を自動削除しました`);
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

        const completedCount = this.data.roadmap.filter(item => item.completed === true).length;
        const totalCount = this.data.roadmap.length;

        if (completedCount === 0) {
            timeline.classList.add('all-incomplete');
        } else if (completedCount === totalCount) {
            timeline.classList.add('all-completed');
        } else {
            timeline.classList.add('mixed-status');
        }

        this.data.roadmap.forEach((item, index) => {
            const element = this.createRoadmapElement(item, index);
            timeline.appendChild(element);
        });

        container.appendChild(timeline);
        this.updateUI();
    }

    createRoadmapElement(item, index) {
        const div = document.createElement('div');
        const isCompleted = item.completed === true;
        div.className = `roadmap-item ${isCompleted ? 'completed' : 'incomplete'}`;

        const circleHtml = this.userMode === 'admin'
            ? `<div class="roadmap-toggle-circle ${isCompleted ? 'completed' : 'incomplete'}" 
                    onclick="lightServer.toggleRoadmapStatus(${index})" 
                    title="クリックで完了/未完了を切り替え"></div>`
            : `<div class="roadmap-circle ${isCompleted ? 'completed' : 'incomplete'}"></div>`;

        div.innerHTML = `
            ${circleHtml}
            <div class="roadmap-date">${item.date}</div>
            <h3>${item.title}</h3>
            <div class="roadmap-content">${this.parseDiscordMarkdown(item.content)}</div>
            <button class="edit-btn" data-type="roadmap" data-index="${index}" style="display: none;" title="編集">✏️</button>
            <button class="delete-btn" data-type="roadmap" data-index="${index}" style="display: none;">×</button>
        `;

        const editBtn = div.querySelector('.edit-btn');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showEditModal('roadmap', index);
        });

        const deleteBtn = div.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('この項目を削除しますか？')) {
                this.data.roadmap.splice(index, 1);
                this.saveData();
                this.renderCurrentPage();
            }
        });

        return div;
    }

    toggleRoadmapStatus(index) {
        if (this.userMode !== 'admin') {
            return;
        }

        const item = this.data.roadmap[index];
        if (item) {
            item.completed = !item.completed;
            this.saveData();
            this.renderRoadmap();
        }
    }

    renderContact() {
        const container = document.getElementById('contact-list');
        if (!container) return;
        container.innerHTML = '';
        if (this.data.contact.length === 0) {
            container.innerHTML = `
                <div class="no-content">
                    <p>お問い合わせはまだありません。</p>
                    <p>右下の「+」ボタンからお問い合わせを送信できます。</p>
                </div>
            `;
        } else {
            this.data.contact.forEach((item, index) => {
                const element = this.createContentElement(item, index, 'contact');
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
                        </div>
                        <div class="server-details">
                            <div class="server-detail-item">
                                <div class="server-detail-label">サーバーアドレス</div>
                                <div class="server-detail-value">${config.address}</div>
                            </div>
                            <div class="server-detail-item">
                                <div class="server-detail-label">バージョン</div>
                                <div class="server-detail-value">${config.version || 'バージョン未設定'}</div>
                            </div>
                            <div class="server-detail-item">
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
                        </div>
                        <div class="server-details">
                            <div class="server-detail-item">
                                <div class="server-detail-label">参加方法</div>
                                <div class="server-detail-value">${this.parseDiscordMarkdown(config.application)}</div>
                            </div>
                            <div class="server-detail-item">
                                <div class="server-detail-label">バージョン</div>
                                <div class="server-detail-value">${config.version || 'バージョン未設定'}</div>
                            </div>
                            <div class="server-detail-item">
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

    createContentElement(item, index, type) {
        const div = document.createElement('div');
        div.className = `${type}-item`;

        if (type === 'member') {
            div.innerHTML = `
                <img src="${item.image}" alt="${item.name}" class="member-image">
                <div class="member-info">
                    <h3>${item.name}</h3>
                    <div class="member-description">${this.parseDiscordMarkdown(item.description)}</div>
                </div>
                <button class="edit-btn" data-type="${type}" data-index="${index}" style="display: none;" title="編集">✏️</button>
                <button class="delete-btn" data-type="${type}" data-index="${index}" style="display: none;">×</button>
            `;
        } else if (type === 'web') {
            div.className = 'web-item';
            div.innerHTML = `
                <img src="${item.icon}" alt="${item.title}" class="web-icon">
                <div class="web-title">${item.title}</div>
                <button class="edit-btn" data-type="${type}" data-index="${index}" style="display: none;" title="編集">✏️</button>
                <button class="delete-btn" data-type="${type}" data-index="${index}" style="display: none;">×</button>
            `;
            div.addEventListener('click', (e) => {
                if (!e.target.matches('.edit-btn, .delete-btn')) {
                    window.open(item.url, '_blank');
                }
            });
        } else {
            div.className = 'content-item';
            div.innerHTML = `
                <h3>${item.title}</h3>
                <div class="content-body">${this.parseDiscordMarkdown(item.content)}</div>
                <div class="content-date">${item.date}</div>
                <button class="edit-btn" data-type="${type}" data-index="${index}" style="display: none;" title="編集">✏️</button>
                <button class="delete-btn" data-type="${type}" data-index="${index}" style="display: none;">×</button>
            `;
        }

        const editBtn = div.querySelector('.edit-btn');
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showEditModal(type, index);
        });

        const deleteBtn = div.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('この項目を削除しますか？')) {
                this.data[type].splice(index, 1);
                this.saveData();
                this.renderCurrentPage();
            }
        });

        return div;
    }

    showEditModal(type, index) {
        const modal = document.getElementById('modal-overlay');
        const title = document.getElementById('modal-title');
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
                            <button type="button" class="file-select-btn" onclick="document.getElementById('hidden-file-input').click()">画像を選択</button>
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
        }

        this.data[this.editType][this.editIndex] = data;

        this.saveData();
        this.renderCurrentPage();
        this.hideModal();

        alert('編集内容を保存しました');
    }

    showAddModal() {
        const modal = document.getElementById('modal-overlay');
        const title = document.getElementById('modal-title');
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
                            <button type="button" class="file-select-btn" onclick="document.getElementById('hidden-file-input').click()">画像を選択</button>
                            <span id="file-name">画像が選択されていません</span>
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
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');

        title.textContent = 'サーバー設定';

        const currentConfig = this.data.serverConfig || {};

        body.innerHTML = `
            <div class="form-group">
                <label for="server-address">サーバーアドレス</label>
                <input type="text" id="server-address" value="${currentConfig.address || ''}" placeholder="example.com または 192.168.1.1:25565">
            </div>
            <div class="form-group">
                <label for="server-version">バージョン</label>
                <input type="text" id="server-version" value="${currentConfig.version || ''}" placeholder="1.21.4">
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

        if (this.currentPage === 'roadmap') {
            data.completed = false;
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
        const version = document.getElementById('server-version').value.trim();
        const serverType = document.getElementById('server-type').value;
        const application = document.getElementById('server-application').value.trim();

        if (!address) {
            alert('サーバーアドレスを入力してください');
            return;
        }

        this.data.serverConfig = {
            address: address,
            version: version,
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

        const contactItem = {
            title: title,
            content: content,
            date: this.getCurrentDateString(),
            sender: this.isLoggedIn ? this.formatDisplayName(this.currentUser) : 'ゲスト'
        };

        this.data.contact.unshift(contactItem);
        this.saveData();
        this.renderCurrentPage();
        this.hideModal();

        alert('お問い合わせを送信しました');
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
            if (this.data.serverConfig && this.data.serverConfig.address) {
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
    console.log('光鯖公式ホームページ初期化完了（元のデザイン対応・完全版）');
});
