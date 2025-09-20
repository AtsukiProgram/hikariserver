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
        this.userNotifications = [];
        this.adminOverride = false;
        this.isPromptActive = false;
        this.allUsers = [];
        this.dailyContactCount = 0;
        this.lastContactDate = '';
        this.realtimeListeners = {};

        this.data = {
            news: [],
            member: [],
            schedule: [],
            web: [],
            roadmap: [],
            contact: [],
            users: {},
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

        console.log('光鯖公式ホームページ初期化完了（NEWSのundefined修正・メンバー古い順表示版）');
    }

    setupRealtimeUpdates() {
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

        const memberRef = ref(database, 'member');
        this.realtimeListeners.member = onValue(memberRef, (snapshot) => {
            if (snapshot.exists()) {
                this.data.member = snapshot.val() || [];
                if (this.currentPage === 'member') {
                    this.renderMembers() {
        const container = document.getElementById('member-list');
        container.innerHTML = '';
        
        // 🔴 重要：メンバーを作成日の古い順にソート（確実な実装）
        const sortedMembers = [...this.data.member].sort((a, b) => {
            // 複数フィールドから作成日を取得
            const getCreationDate = (item) => {
                const dateStr = item.originalDate || item.createdDate || item.date || '1970-01-01';
                return new Date(dateStr);
            };
            
            const dateA = getCreationDate(a);
            const dateB = getCreationDate(b);
            
            console.log('メンバーソート比較:', {
                memberA: a.name, dateA: dateA.toISOString(),
                memberB: b.name, dateB: dateB.toISOString(),
                result: dateA - dateB
            });
            
            return dateA - dateB; // 古い順（昇順）
        });
        
        console.log('メンバー表示順序:', sortedMembers.map((member, i) => 
            `${i+1}. ${member.name} (${member.originalDate || member.createdDate || member.date})`
        ));
        
        sortedMembers.forEach((item) => {
            const originalIndex = this.data.member.indexOf(item);
            const element = this.createContentElement(item, originalIndex, 'member');
            container.appendChild(element);
        });
        
        this.updateUI();
    }, 100);

        } catch (error) {
            console.error('権限取得エラー:', error);
            this.userMode = 'guest';
        }
    }

    async updateUserRoleInFirebase(userId, newRole) {
        try {
            const userRef = ref(database, `users/${userId}`);
            const snapshot = await get(userRef);

            if (snapshot.exists()) {
                const userData = snapshot.val();
                userData.role = newRole;
                userData.roleUpdated = new Date().toISOString();
                userData.lastUpdated = new Date().toISOString();

                await set(userRef, userData);
                console.log(`ユーザー ${userData.username} の権限を ${newRole} に更新`);

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

    async loadAllUsers() {
        try {
            const usersRef = ref(database, 'users');
            const snapshot = await get(usersRef);

            if (snapshot.exists()) {
                const users = snapshot.val();
                this.allUsers = Object.values(users).sort((a, b) =>
                    new Date(b.lastUpdated || b.lastLogin || 0) - new Date(a.lastUpdated || a.lastLogin || 0)
                );
                console.log('全ユーザーリスト更新:', this.allUsers.length, '人（最終更新新しい順）');
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

    addToUserNotifications(message) {
        if (!this.isLoggedIn) return;

        const notificationItem = {
            date: new Date().toLocaleString('ja-JP'),
            message: message,
            userId: this.currentUser.id,
            read: false
        };

        this.userNotifications.unshift(notificationItem);

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

                    this.loadUserPermissionsFromFirebase();

                    const savedNotifications = localStorage.getItem(`user_notifications_${this.currentUser.id}`);
                    if (savedNotifications) {
                        this.userNotifications = JSON.parse(savedNotifications);
                    }

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

        this.cleanupRealtimeListeners();
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
                this.handleEditSubmit() {
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

        // 🔴 重要：作成日を確実に保持（undefinedの根本解決）
        const originalItem = this.data[this.editType][this.editIndex];
        
        if (this.editType === 'news') {
            // NEWSの場合：作成日を複数フィールドで確実に保持
            const originalDate = originalItem.originalDate || originalItem.createdDate || originalItem.date || this.getCurrentDateString();
            data.originalDate = originalDate; // 最優先の作成日フィールド
            data.createdDate = originalDate;  // セカンダリ作成日フィールド  
            data.date = originalDate;         // 表示用作成日フィールド
            data.lastModified = this.getCurrentDateString(); // 最終編集日
            
            console.log('NEWS編集時の日付保持:', {
                originalDate: data.originalDate,
                createdDate: data.createdDate,
                date: data.date,
                lastModified: data.lastModified
            });
        } else {
            // その他のタブ：元の日付を保持
            data.date = originalItem.date || this.getCurrentDateString();
            
            if (this.editType === 'member') {
                // メンバーも作成日を保持
                data.originalDate = originalItem.originalDate || originalItem.createdDate || originalItem.date || this.getCurrentDateString();
                data.createdDate = originalItem.createdDate || originalItem.date || this.getCurrentDateString();
            }
        }

        this.data[this.editType][this.editIndex] = data;

        this.saveData();
        this.renderCurrentPage();
        this.hideModal();

        alert('編集内容を保存しました');
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

    // モーダル送信処理（NEWSのundefined修正・作成日保持版）
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

        // 🔴 重要：新規作成時の作成日設定（確実な実装）
        const currentDate = this.getCurrentDateString();
        
        if (this.currentPage === 'news') {
            data.originalDate = currentDate; // 最優先の作成日フィールド
            data.createdDate = currentDate;  // セカンダリ作成日フィールド
            data.date = currentDate;         // 表示用作成日フィールド
            
            console.log('NEWS新規作成時の日付設定:', {
                originalDate: data.originalDate,
                createdDate: data.createdDate,
                date: data.date
            });
        } else {
            data.date = currentDate;
            
            if (this.currentPage === 'member') {
                data.originalDate = currentDate; // メンバーも作成日を設定
                data.createdDate = currentDate;
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
        const version = document.getElementById('server-version').value.trim();
        const serverType = document.getElementById('server-type').value;
        const application = document.getElementById('server-application').value.trim();

        if (!address) {
            alert('サーバーアドレスを入力してください');
            return;
        }

        if (!serverType) {
            alert('サーバータイプを選択してください');
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

        this.data.contact.unshift(contactItem);
        this.incrementContactCount();
        this.addToUserNotifications(`お問い合わせを送信: ${title}`);

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

    // サーバー状態管理機能
    startServerStatusUpdates() {
        if (this.serverUpdateInterval) {
            clearInterval(this.serverUpdateInterval);
        }

        if (this.isApiDisabled) {
            console.log('API無効化中のため、サーバー状態更新をスキップします');
            return;
        }

        this.fetchServerStatus();

        const updateInterval = this.isFirstLoad ? this.initialUpdateInterval : this.stableUpdateInterval;

        this.serverUpdateInterval = setInterval(() => {
            if (this.data.serverConfig && this.data.serverConfig.address && !this.isApiDisabled) {
                this.fetchServerStatus();
            }
        }, updateInterval);

        console.log(`サーバー状態の定期更新を開始（${updateInterval/1000}秒間隔）`);
        this.hasEverVisitedServer = true;
        this.isFirstLoad = false;
    }

    stopServerStatusUpdates() {
        if (this.serverUpdateInterval) {
            clearInterval(this.serverUpdateInterval);
            this.serverUpdateInterval = null;
            console.log('サーバー状態の定期更新を停止');
        }
    }

    async fetchServerStatus() {
        if (!this.data.serverConfig || !this.data.serverConfig.address) {
            return;
        }

        if (this.isApiDisabled) {
            console.log('API無効化中のため、サーバー状態取得をスキップします');
            return;
        }

        if (this.isCurrentlyUpdating) {
            return;
        }

        this.isCurrentlyUpdating = true;

        const address = this.data.serverConfig.address;
        const serverType = this.data.serverConfig.serverType;

        try {
            const response = await fetch(`https://api.mcsrvstat.us/3/${address}`);

            if (response.status === 429) {
                console.warn('API制限に達しました。60秒後に再試行します');
                this.isApiDisabled = true;
                setTimeout(() => {
                    this.isApiDisabled = false;
                    this.updateFailureCount = 0;
                    this.consecutiveErrors = 0;
                    console.log('API制限が解除されました');
                }, 60000);
                this.isCurrentlyUpdating = false;
                return;
            }

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (!data || data.online === undefined) {
                throw new Error('Invalid API response');
            }

            let version = 'Unknown';
            let players = { online: 0, max: 0, sample: [] };

            if (data.players) {
                players.online = data.players.online || 0;
                players.max = data.players.max || 0;
                if (data.players.sample && data.players.sample.length > 0) {
                    players.sample = data.players.sample;
                }
            }

            if (serverType === 'BungeeCord' || serverType === 'Velocity') {
                version = this.extractProxyLobbyVersion([data], serverType);
            } else {
                version = this.extractServerVersion([data]);
            }

            this.serverStatus = {
                online: data.online === true,
                players: players,
                version: version,
                motd: data.motd ? (data.motd.clean || data.motd) : 'No MOTD',
                lastApiUpdate: new Date().toLocaleTimeString('ja-JP')
            };

            this.updateFailureCount = 0;
            this.consecutiveErrors = 0;
            this.lastSuccessfulUpdate = Date.now();

            this.serverStatusHistory.push({
                timestamp: Date.now(),
                status: this.serverStatus.online,
                players: this.serverStatus.players.online
            });

            if (this.serverStatusHistory.length > 100) {
                this.serverStatusHistory = this.serverStatusHistory.slice(-50);
            }

            if (this.currentPage === 'server') {
                this.renderServer();
            }

        } catch (error) {
            console.error('サーバー状態取得エラー:', error);
            this.updateFailureCount++;
            this.consecutiveErrors++;

            if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
                console.warn(`連続エラー${this.consecutiveErrors}回のため、API無効化`);
                this.isApiDisabled = true;
                setTimeout(() => {
                    this.isApiDisabled = false;
                    this.consecutiveErrors = 0;
                    console.log('API無効化解除');
                }, 30000);
            }

            if (this.updateFailureCount >= this.maxFailures) {
                this.serverStatus = null;
                console.warn(`API取得に${this.updateFailureCount}/${this.maxFailures}回失敗しました`);
                this.isCurrentlyUpdating = false;
                return;
            }

            this.serverStatus = {
                online: false,
                players: { online: 0, max: 0, sample: [] },
                version: 'Status unavailable',
                motd: 'Connection failed...',
                lastApiUpdate: new Date().toLocaleTimeString('ja-JP')
            };

            if (this.currentPage === 'server') {
                this.renderServer();
            }
        } finally {
            this.isCurrentlyUpdating = false;
        }
    }

    extractProxyLobbyVersion(results, serverType) {
        for (const data of results) {
            if (data.version) {
                const detailedVersionMatch = data.version.match(/(1\.21\.|1\.20\.|1\.19\.|1\.18\.|1\.17\.|1\.16\.|1\.15\.|1\.14\.|1\.13\.|1\.12\.|1\.11\.|1\.10\.|1\.9\.|1\.8\.)/);
                if (detailedVersionMatch) {
                    return `v${detailedVersionMatch[0]}`;
                }
                const generalVersionMatch = data.version.match(/(1\.\d+)/);
                if (generalVersionMatch) {
                    return `v${generalVersionMatch[0]}`;
                }
            }

            if (data.software && data.software.version) {
                const softwareVersion = data.software.version;
                if (!softwareVersion.toLowerCase().includes('proxy') &&
                    !softwareVersion.toLowerCase().includes('bungeecord') &&
                    !softwareVersion.toLowerCase().includes('velocity') &&
                    !softwareVersion.toLowerCase().includes('waterfall')) {
                    const detailedVersionMatch = softwareVersion.match(/(1\.21\.|1\.20\.|1\.19\.|1\.18\.|1\.17\.|1\.16\.|1\.15\.|1\.14\.|1\.13\.|1\.12\.|1\.11\.|1\.10\.|1\.9\.|1\.8\.)/);
                    if (detailedVersionMatch) {
                        return `v${detailedVersionMatch[0]}`;
                    }
                    const generalVersionMatch = softwareVersion.match(/(1\.\d+)/);
                    if (generalVersionMatch) {
                        return `v${generalVersionMatch[0]}`;
                    }
                }
            }

            if (data.protocol && data.protocol.version) {
                const exactVersionMap = {
                    770: '1.21.5', 769: '1.21.4', 768: '1.21.3', 767: '1.21.2', 765: '1.21.1', 763: '1.21',
                    762: '1.20.6', 761: '1.20.5', 760: '1.20.4', 759: '1.20.3', 758: '1.20.2', 757: '1.20.1', 756: '1.20',
                    755: '1.19.4', 754: '1.19.3', 753: '1.19.2', 752: '1.19.1', 751: '1.19',
                    750: '1.18.2', 749: '1.18.1', 748: '1.18',
                    747: '1.17.1', 746: '1.17',
                    745: '1.16.5', 744: '1.16.4', 743: '1.16.3', 742: '1.16.2', 741: '1.16.1', 740: '1.16',
                    578: '1.15.2', 577: '1.15.1', 575: '1.15',
                    498: '1.14.4', 490: '1.14.3', 485: '1.14.2', 480: '1.14.1', 477: '1.14',
                    404: '1.13.2', 401: '1.13.1', 393: '1.13',
                    340: '1.12.2', 338: '1.12.1', 335: '1.12',
                    316: '1.11.2', 315: '1.11.1', 315: '1.11',
                    210: '1.10.2', 210: '1.10.1', 210: '1.10',
                    184: '1.9.4', 183: '1.9.3', 176: '1.9.2', 175: '1.9.1', 169: '1.9',
                    47: '1.8.9'
                };

                const protocolVersion = data.protocol.version;
                if (exactVersionMap[protocolVersion]) {
                    return `v${exactVersionMap[protocolVersion]}`;
                }
            }
        }

        return 'Unknown Version';
    }

    extractServerVersion(results) {
        for (const data of results) {
            if (data.version && data.version.match(/1\.\d+/)) {
                return `v${data.version}`;
            }
            if (data.software && data.software.version) {
                return `v${data.software.version}`;
            }
            if (data.protocol && data.protocol.version) {
                const versionMap = {
                    768: '1.21.5', 767: '1.21.4', 766: '1.21.3', 765: '1.21.2', 764: '1.21.1', 763: '1.21',
                    762: '1.20.6', 761: '1.20.5', 760: '1.20.4', 759: '1.20.3', 758: '1.20.2', 757: '1.20.1', 756: '1.20',
                    755: '1.19.4', 754: '1.19.3', 753: '1.19.2', 752: '1.19.1', 751: '1.19',
                    47: '1.8.9'
                };
                return versionMap[data.protocol.version] ? `v${versionMap[data.protocol.version]}` : `Protocol ${data.protocol.version}`;
            }
        }
        return 'Unknown';
    }
}

// グローバルインスタンス
let lightServer;

document.addEventListener('DOMContentLoaded', () => {
    lightServer = new LightServerWebsite();
    window.lightServer = lightServer;
    console.log('光鯖公式ホームページ初期化完了（NEWSのundefined修正・メンバー古い順表示版）');
});


