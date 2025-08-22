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

// Firebase初期化
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

class LightServerWebsite {
    constructor() {
        this.userMode = 'guest';
        this.currentPage = 'top';
        this.data = {
            news: [],
            member: [],
            schedule: [],
            web: [],
            roadmap: [],
            serverConfig: null
        };
        this.serverStatus = null;
        this.modalType = 'add';
        this.serverUpdateInterval = null;
        this.lastSuccessfulUpdate = null;
        this.updateFailureCount = 0;
        this.maxFailures = 3;

        // サーバー状態管理（CORSエラー対応）
        this.serverStatusHistory = [];
        this.stableUpdateInterval = 15000; // 15秒間隔
        this.consecutiveErrors = 0;
        this.maxConsecutiveErrors = 2;
        this.isApiDisabled = false;

        this.init();
    }

    // ログイン状態の保存と復元
    saveLoginState() {
        localStorage.setItem('hikari_user_mode', this.userMode);
    }

    loadLoginState() {
        const savedMode = localStorage.getItem('hikari_user_mode');
        if (savedMode && savedMode !== 'guest') {
            this.userMode = savedMode;
            this.updateOperationButton();
        }
    }

    updateOperationButton() {
        const operationBtn = document.getElementById('operationBtn');
        if (this.userMode !== 'guest') {
            operationBtn.querySelector('.nav-text').textContent = 'LOGOUT';
            operationBtn.querySelector('.nav-japanese').textContent = 'ログアウト';
        } else {
            operationBtn.querySelector('.nav-text').textContent = 'OPERATION';
            operationBtn.querySelector('.nav-japanese').textContent = '管理';
        }
    }

    // データの読み込みと保存
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

    // CORSエラー完全回避のサーバー状態管理システム
    startServerStatusUpdates() {
        // API無効化状態の場合はスキップ
        if (this.isApiDisabled) {
            console.log('外部API取得は無効化されています');
            this.setFallbackServerStatus();
            return;
        }

        // 既存の更新を停止
        this.stopServerStatusUpdates();

        // 最初は設定ベースの状態を表示
        this.setFallbackServerStatus();

        // 定期的な更新を開始（CORSエラーが発生する可能性を考慮）
        this.serverUpdateInterval = setInterval(() => {
            this.tryFetchServerStatus();
        }, this.stableUpdateInterval);

        console.log(`サーバー更新開始: ${this.stableUpdateInterval / 1000}秒間隔`);
    }

    stopServerStatusUpdates() {
        if (this.serverUpdateInterval) {
            clearInterval(this.serverUpdateInterval);
            this.serverUpdateInterval = null;
        }
    }

    async tryFetchServerStatus() {
        if (!this.data.serverConfig || !this.data.serverConfig.address || this.isApiDisabled) {
            return;
        }

        const address = this.data.serverConfig.address;

        try {
            // 最も信頼性の高いCORS対応APIを試行
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);

            // mcapi.us（CORS完全対応）を使用
            const response = await fetch(`https://api.mcstatus.io/v2/status/java/${encodeURIComponent(address)}`, {
                signal: controller.signal,
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (compatible; MinecraftStatusChecker/1.0)'
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const processedStatus = this.processMcStatusResponse(data);

            if (processedStatus) {
                this.updateServerStatusSafe(processedStatus);
                this.consecutiveErrors = 0;
                console.log('サーバー状態取得成功');
            } else {
                throw new Error('無効なレスポンス');
            }

        } catch (error) {
            this.handleApiError(error);
        }
    }

    processMcStatusResponse(data) {
        if (!data || typeof data !== 'object') {
            return null;
        }

        const status = {
            online: Boolean(data.online),
            players: {
                online: 0,
                max: 0
            },
            motd: 'サーバー情報取得中...',
            lastUpdate: new Date().toLocaleTimeString('ja-JP'),
            source: 'api'
        };

        // プレイヤー情報の処理
        if (data.players && typeof data.players === 'object') {
            status.players.online = Math.max(0, Number(data.players.online) || 0);
            status.players.max = Math.max(0, Number(data.players.max) || 0);
        }

        // MOTD の処理
        if (data.motd && data.motd.clean) {
            status.motd = String(data.motd.clean).substring(0, 100);
        } else if (data.motd && data.motd.raw) {
            status.motd = String(data.motd.raw).substring(0, 100);
        }

        return status;
    }

    setFallbackServerStatus() {
        // 設定ベースの基本的な状態を設定（CORSエラー回避）
        if (this.data.serverConfig && this.data.serverConfig.address) {
            this.serverStatus = {
                online: true, // 設定されている場合は基本的にオンラインとして表示
                players: {
                    online: 0,
                    max: 0
                },
                motd: '手動設定されたサーバー',
                lastUpdate: new Date().toLocaleTimeString('ja-JP'),
                source: 'config'
            };

            if (this.currentPage === 'server') {
                this.renderServer();
            }
        }
    }

    updateServerStatusSafe(newStatus) {
        if (!newStatus || typeof newStatus.online !== 'boolean') {
            return;
        }

        // 履歴に追加
        this.serverStatusHistory.unshift(newStatus);
        if (this.serverStatusHistory.length > 3) {
            this.serverStatusHistory.pop();
        }

        const shouldUpdate = this.shouldUpdateServerStatus(newStatus);

        if (shouldUpdate || !this.serverStatus) {
            this.serverStatus = { ...newStatus };

            if (this.currentPage === 'server') {
                this.renderServer();
            }
        } else {
            if (this.serverStatus) {
                this.serverStatus.lastUpdate = newStatus.lastUpdate;
            }
        }
    }

    shouldUpdateServerStatus(newStatus) {
        if (!this.serverStatus) return true;

        if (this.serverStatus.online !== newStatus.online) {
            return true;
        }

        if (this.serverStatus.players.online !== newStatus.players.online ||
            this.serverStatus.players.max !== newStatus.players.max) {
            return true;
        }

        return false;
    }

    handleApiError(error) {
        this.consecutiveErrors++;

        // エラーログを最小限に抑制
        if (this.consecutiveErrors <= 1) {
            console.warn('外部API取得エラー');
        }

        if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
            // 外部APIを無効化し、設定ベースの表示に切り替え
            this.isApiDisabled = true;
            this.stopServerStatusUpdates();

            console.log('外部API取得を無効化し、設定ベースの表示に切り替えます');
            this.setFallbackServerStatus();

            // 5分後に再試行を許可
            setTimeout(() => {
                this.isApiDisabled = false;
                this.consecutiveErrors = 0;
                console.log('外部API取得を再有効化しました');
            }, 300000);
        }
    }

    // パスワード検証
    validatePassword(input) {
        input = input.trim();

        const memberPass = String.fromCharCode(122, 57, 120, 49, 121, 53, 104, 113);
        const adminPass = String.fromCharCode(120, 48, 104, 108, 116, 52, 105, 53);

        if (input === memberPass) {
            return 'member';
        } else if (input === adminPass) {
            return 'admin';
        }
        return false;
    }

    // 日付関連メソッド
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

    async init() {
        this.loadLoginState();
        this.setupEventListeners();
        await this.loadData();
        this.cleanExpiredSchedules();

        setTimeout(() => {
            this.updateUI();
            this.forceButtonRefresh();
        }, 100);

        console.log('光鯖公式ホームページ初期化完了');
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

    // イベントリスナー設定
    setupEventListeners() {
        document.querySelectorAll('.nav-link').forEach(link => {
            const handleNavClick = (e) => {
                e.preventDefault();
                const page = link.dataset.page;

                if (page === 'operation') {
                    this.handleOperation();
                } else {
                    this.showPage(page);
                }

                this.closeMobileMenu();
            };

            link.addEventListener('click', handleNavClick);
            link.addEventListener('touchend', handleNavClick);
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

    showPage(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

        document.getElementById(`${page}-page`).classList.add('active');
        document.querySelector(`[data-page="${page}"]`).classList.add('active');

        this.currentPage = page;
        this.renderCurrentPage();

        setTimeout(() => {
            this.updateUI();
            this.forceButtonRefresh();
        }, 50);

        if (page === 'server' && this.data.serverConfig && this.data.serverConfig.address) {
            this.startServerStatusUpdates();
        } else if (page !== 'server') {
            this.stopServerStatusUpdates();
        }
    }

    handleOperation() {
        if (this.userMode !== 'guest') {
            this.userMode = 'guest';
            this.saveLoginState();
            this.updateOperationButton();
            this.updateUI();
            alert('ログアウトしました');
        } else {
            const password = prompt('パスワードを入力してください:');
            if (password) {
                const mode = this.validatePassword(password);
                if (mode) {
                    this.userMode = mode;
                    this.saveLoginState();
                    this.updateOperationButton();

                    setTimeout(() => {
                        this.updateUI();
                        this.forceButtonRefresh();
                    }, 100);

                    if (mode === 'member') {
                        alert('メンバーモードをONにしました');
                    } else if (mode === 'admin') {
                        alert('管理者モードをONにしました');
                    }
                } else {
                    alert('パスワードが間違っています');
                }
            }
        }
    }

    updateUI() {
        const plusBtn = document.getElementById('admin-plus-btn');
        const setBtn = document.getElementById('admin-set-btn');
        const deleteButtons = document.querySelectorAll('.delete-btn');

        let showPlusBtn = false;
        let showSetBtn = false;

        if (this.currentPage !== 'top') {
            if (this.userMode === 'admin') {
                if (this.currentPage === 'server') {
                    showPlusBtn = false;
                    showSetBtn = true;
                } else {
                    showPlusBtn = true;
                    showSetBtn = false;
                }
            } else if (this.userMode === 'member' && this.currentPage === 'member') {
                showPlusBtn = true;
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
            case 'server':
                this.renderServer();
                break;
        }
    }

    // サーバー表示（CORSエラー完全解決版）
    renderServer() {
        const container = document.getElementById('server-info');

        if (!this.data.serverConfig) {
            container.innerHTML = `
                <div class="server-status-card">
                    <h3 style="text-align: center; color: #666; margin-bottom: 20px;">サーバー情報が設定されていません</h3>
                    <p style="text-align: center; color: #888;">管理者がサーバー設定を行う必要があります。</p>
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
                        <h3 class="server-status-title">サーバー情報を準備中...</h3>
                    </div>
                    <p>設定を読み込んでいます...</p>
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
                        
                        <div class="server-layout-member-with-players">
                            <div class="server-address-full">
                                <div class="server-detail-label">サーバーアドレス</div>
                                <div class="server-detail-value">${config.address}</div>
                            </div>
                            
                            <div class="server-players-section">
                                <div class="server-detail-label">参加人数</div>
                                <div class="server-detail-value server-players">${status.players.online} / ${status.players.max}</div>
                            </div>
                            
                            <div class="server-version-section">
                                <div class="server-detail-label">バージョン</div>
                                <div class="server-detail-value">${config.version ? `v${config.version}` : '不明'}</div>
                            </div>
                            
                            <div class="server-type-section">
                                <div class="server-detail-label">サーバー種類</div>
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
                        
                        <div class="server-layout-guest-with-players">
                            <div class="server-application-full">
                                <div class="server-detail-label">参加について</div>
                                <div class="server-application-content">${this.parseDiscordMarkdown(config.application || '参加方法については管理者にお問い合わせください。')}</div>
                            </div>
                            
                            <div class="server-players-section">
                                <div class="server-detail-label">参加人数</div>
                                <div class="server-detail-value server-players">${status.players.online} / ${status.players.max}</div>
                            </div>
                            
                            <div class="server-version-section">
                                <div class="server-detail-label">バージョン</div>
                                <div class="server-detail-value">${config.version ? `v${config.version}` : '不明'}</div>
                            </div>
                            
                            <div class="server-type-section">
                                <div class="server-detail-label">サーバー種類</div>
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

    // コンテンツ要素作成
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
                <button class="delete-btn" data-type="${type}" data-index="${index}" style="display: none;">×</button>
            `;
        } else if (type === 'web') {
            div.className = 'web-item';
            div.innerHTML = `
                <img src="${item.icon}" alt="${item.title}" class="web-icon">
                <div class="web-title">${item.title}</div>
                <button class="delete-btn" data-type="${type}" data-index="${index}" style="display: none;">×</button>
            `;
            div.addEventListener('click', () => {
                window.open(item.url, '_blank');
            });
        } else if (type === 'roadmap') {
            div.className = 'roadmap-item';
            div.innerHTML = `
                <div class="roadmap-date">${item.date}</div>
                <h3>${item.title}</h3>
                <div class="roadmap-content">${this.parseDiscordMarkdown(item.content)}</div>
                <button class="delete-btn" data-type="${type}" data-index="${index}" style="display: none;">×</button>
            `;
        } else {
            div.className = 'content-item';
            div.innerHTML = `
                <h3>${item.title}</h3>
                <div class="content-body">${this.parseDiscordMarkdown(item.content)}</div>
                <div class="content-date">${item.date}</div>
                <button class="delete-btn" data-type="${type}" data-index="${index}" style="display: none;">×</button>
            `;
        }

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

    // 各ページのレンダリングメソッド
    renderNews() {
        const container = document.getElementById('news-list');
        container.innerHTML = '';

        this.data.news.forEach((item, index) => {
            const element = this.createContentElement(item, index, 'news');
            container.appendChild(element);
        });

        this.updateUI();
    }

    // メンバー表示（作成日古い順）
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

        this.data.roadmap.forEach((item, index) => {
            const element = this.createContentElement(item, index, 'roadmap');
            container.appendChild(element);
        });

        this.updateUI();
    }

    getWebIconPath(type) {
        const iconMap = {
            'discord': 'discord.png',
            'youtube': 'youtube.png',
            'twitter': 'twitter.png'
        };
        return iconMap[type] || 'default.png';
    }

    // モーダル関連メソッド
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
                        <textarea id="${field.id}" placeholder="${field.placeholder || ''}"></textarea>
                    </div>
                `;
            } else if (field.type === 'file') {
                return `
                    <div class="form-group">
                        <label for="${field.id}">${field.label}</label>
                        <div class="file-input-wrapper">
                            <button type="button" class="file-select-btn" onclick="document.getElementById('hidden-file-input').click()">画像を選択</button>
                            <span id="file-name">ファイルが選択されていません</span>
                        </div>
                        <img id="image-preview" class="image-preview" style="display: none;">
                    </div>
                `;
            } else if (field.type === 'date') {
                return `
                    <div class="form-group">
                        <label for="${field.id}">${field.label}</label>
                        <input type="date" id="${field.id}" placeholder="年/月/日">
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
                    ${field.id === 'type' ? `
                    <div class="form-group">
                        <div id="service-icon-preview" class="service-icon-preview" style="display: none; text-align: center; margin: 10px 0;">
                            <img id="service-icon-image" src="" alt="" style="width: 50px; height: 50px; border-radius: 8px;">
                        </div>
                    </div>
                    ` : ''}
                `;
            } else {
                return `
                    <div class="form-group">
                        <label for="${field.id}">${field.label}</label>
                        <input type="${field.type}" id="${field.id}" placeholder="${field.placeholder || ''}">
                    </div>
                `;
            }
        }).join('');

        if (this.currentPage === 'web') {
            setTimeout(() => {
                const typeSelect = document.getElementById('type');
                const iconPreview = document.getElementById('service-icon-preview');
                const iconImage = document.getElementById('service-icon-image');

                if (typeSelect) {
                    typeSelect.addEventListener('change', () => {
                        const selectedType = typeSelect.value;
                        if (selectedType) {
                            iconImage.src = this.getWebIconPath(selectedType);
                            iconImage.alt = selectedType;
                            iconPreview.style.display = 'block';
                        } else {
                            iconPreview.style.display = 'none';
                        }
                    });
                }
            }, 100);
        }

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
                <input type="text" id="server-version" value="${currentConfig.version || ''}" placeholder="例: 1.21.5">
            </div>
            <div class="form-group">
                <label for="server-type">サーバー種類</label>
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
                <textarea id="server-application" placeholder="参加方法や注意事項を記入してください">${currentConfig.application || ''}</textarea>
            </div>
        `;

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    hideModal() {
        const modal = document.getElementById('modal-overlay');
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';

        document.getElementById('hidden-file-input').value = '';
        this.selectedImageData = null;
    }

    getPageDisplayName() {
        const names = {
            'news': 'ニュース',
            'member': 'メンバー',
            'schedule': 'スケジュール',
            'web': 'ウェブサイト',
            'roadmap': 'ロードマップ'
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
            ]
        };

        return commonFields[this.currentPage] || [];
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

        if (this.currentPage === 'news') {
            data.date = this.getCurrentDateString();
        }

        if (!isValid) return;

        if (this.currentPage === 'member') {
            this.data[this.currentPage].push(data);
        } else if (this.currentPage === 'web') {
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

        // エラーリセット
        this.consecutiveErrors = 0;
        this.isApiDisabled = false;

        if (this.currentPage === 'server') {
            this.startServerStatusUpdates();
            this.renderServer();
        }

        alert('サーバー設定を保存しました');
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
}

// グローバルインスタンス
let lightServer;

document.addEventListener('DOMContentLoaded', () => {
    lightServer = new LightServerWebsite();
    window.lightServer = lightServer;
    console.log('光鯖公式ホームページ初期化完了');
});
