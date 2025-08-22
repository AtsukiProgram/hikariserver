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
        this.maxFailures = 2;

        // ルーティング関連
        this.validPages = ['top', 'news', 'member', 'schedule', 'web', 'roadmap', 'server'];
        this.baseUrl = window.location.origin;

        // サーバー同期改善用
        this.serverStatusHistory = [];
        this.stableUpdateInterval = 8000; // 8秒間隔で安定化
        this.consecutiveErrors = 0;

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

    // 改善されたURLルーティングシステム
    initializeRouter() {
        // 初期ルートの設定
        this.handleInitialRoute();

        // popstateイベントリスナー
        window.addEventListener('popstate', (event) => {
            this.handleRouteChange();
        });

        console.log('ルーティングシステム初期化完了');
    }

    handleInitialRoute() {
        const currentPath = window.location.pathname;
        let targetPage = 'top';

        // パスから対象ページを抽出
        if (currentPath === '/' || currentPath === '') {
            targetPage = 'top';
        } else {
            const pathSegments = currentPath.split('/').filter(segment => segment.length > 0);
            const lastSegment = pathSegments[pathSegments.length - 1];

            if (this.validPages.includes(lastSegment)) {
                targetPage = lastSegment;
            } else {
                // 無効なページの場合はtopにリダイレクト
                console.warn('無効なページ:', lastSegment);
                this.replaceRoute('top');
                return;
            }
        }

        this.setCurrentPage(targetPage);
        console.log('初期ページ設定:', targetPage);
    }

    handleRouteChange() {
        const currentPath = window.location.pathname;
        let targetPage = 'top';

        if (currentPath === '/' || currentPath === '') {
            targetPage = 'top';
        } else {
            const pathSegments = currentPath.split('/').filter(segment => segment.length > 0);
            const lastSegment = pathSegments[pathSegments.length - 1];

            if (this.validPages.includes(lastSegment)) {
                targetPage = lastSegment;
            } else {
                console.warn('無効なページへの変更:', lastSegment);
                this.replaceRoute('top');
                return;
            }
        }

        this.setCurrentPage(targetPage);
        console.log('ページ変更:', targetPage);
    }

    navigateToPage(page) {
        if (!this.validPages.includes(page)) {
            console.error('無効なページ:', page);
            return;
        }

        const newUrl = page === 'top' ? '/' : `/${page}`;
        window.history.pushState({ page: page }, '', newUrl);
        this.setCurrentPage(page);
        console.log('ナビゲート:', page);
    }

    replaceRoute(page) {
        if (!this.validPages.includes(page)) {
            console.error('無効な置換ページ:', page);
            return;
        }

        const newUrl = page === 'top' ? '/' : `/${page}`;
        window.history.replaceState({ page: page }, '', newUrl);
        this.setCurrentPage(page);
        console.log('ルート置換:', page);
    }

    setCurrentPage(page) {
        this.currentPage = page;
        this.updateActiveNavigation();
        this.renderCurrentPage();
        this.updateUI();

        // サーバーページの場合のみ状態更新開始
        if (page === 'server' && this.data.serverConfig && this.data.serverConfig.address) {
            this.startServerStatusUpdates();
        } else {
            this.stopServerStatusUpdates();
        }
    }

    updateActiveNavigation() {
        // 全ての.pageと.nav-linkからactiveクラスを削除
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });

        // 現在のページに対応する要素にactiveクラスを追加
        const currentPageElement = document.getElementById(`${this.currentPage}-page`);
        const currentNavElement = document.querySelector(`[data-page="${this.currentPage}"]`);

        if (currentPageElement) {
            currentPageElement.classList.add('active');
        }
        if (currentNavElement) {
            currentNavElement.classList.add('active');
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

    // 改善されたサーバー状態更新システム
    startServerStatusUpdates() {
        // 既存の更新を停止
        this.stopServerStatusUpdates();

        // 即座に1回実行
        this.fetchServerStatusImproved();

        // 定期的な更新を開始
        this.serverUpdateInterval = setInterval(() => {
            this.fetchServerStatusImproved();
        }, this.stableUpdateInterval);

        console.log(`サーバー更新開始: ${this.stableUpdateInterval / 1000}秒間隔`);
    }

    stopServerStatusUpdates() {
        if (this.serverUpdateInterval) {
            clearInterval(this.serverUpdateInterval);
            this.serverUpdateInterval = null;
        }
    }

    async fetchServerStatusImproved() {
        if (!this.data.serverConfig || !this.data.serverConfig.address) {
            return;
        }

        const address = this.data.serverConfig.address;

        try {
            // タイムアウト付きのfetch
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);

            const response = await fetch(`https://api.mcsrvstat.us/3/${encodeURIComponent(address)}`, {
                signal: controller.signal,
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });

            clearTimeout(timeoutId);

            // API制限チェック
            if (response.status === 429) {
                console.warn('API制限に達しました');
                this.handleServerError();
                return;
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            const processedStatus = this.processServerResponse(data);

            if (processedStatus) {
                this.updateServerStatusWithHistory(processedStatus);
                this.consecutiveErrors = 0;
            } else {
                throw new Error('無効なサーバーレスポンス');
            }

        } catch (error) {
            console.error('サーバー状態取得エラー:', error);
            this.handleServerError();
        }
    }

    processServerResponse(data) {
        if (!data || typeof data !== 'object') {
            return null;
        }

        // 基本的なサーバー状態の処理
        const status = {
            online: Boolean(data.online),
            players: {
                online: 0,
                max: 0
            },
            motd: 'サーバー情報なし',
            lastUpdate: new Date().toLocaleTimeString('ja-JP'),
            rawData: data // デバッグ用
        };

        // プレイヤー情報の安全な取得
        if (data.players && typeof data.players === 'object') {
            const onlineCount = Number(data.players.online);
            const maxCount = Number(data.players.max);

            status.players.online = isNaN(onlineCount) ? 0 : Math.max(0, onlineCount);
            status.players.max = isNaN(maxCount) ? 0 : Math.max(0, maxCount);
        }

        // MOTD の処理
        if (data.motd) {
            if (typeof data.motd === 'string') {
                status.motd = data.motd.substring(0, 100);
            } else if (data.motd.clean) {
                status.motd = String(data.motd.clean).substring(0, 100);
            } else if (data.motd.raw) {
                status.motd = String(data.motd.raw).substring(0, 100);
            }
        }

        console.log('処理されたサーバー状態:', status);
        return status;
    }

    updateServerStatusWithHistory(newStatus) {
        // 履歴に追加（最新5件まで保持）
        this.serverStatusHistory.unshift(newStatus);
        if (this.serverStatusHistory.length > 5) {
            this.serverStatusHistory.pop();
        }

        // 状態の安定性を確認
        const shouldUpdate = this.shouldUpdateServerStatus(newStatus);

        if (shouldUpdate || !this.serverStatus) {
            this.serverStatus = { ...newStatus };

            if (this.currentPage === 'server') {
                this.renderServer();
            }

            console.log('サーバー状態更新:', this.serverStatus);
        } else {
            // 時刻のみ更新
            if (this.serverStatus) {
                this.serverStatus.lastUpdate = newStatus.lastUpdate;
            }
        }
    }

    shouldUpdateServerStatus(newStatus) {
        if (!this.serverStatus) return true;

        // オンライン状態の変化
        if (this.serverStatus.online !== newStatus.online) {
            return true;
        }

        // プレイヤー数の変化
        if (this.serverStatus.players.online !== newStatus.players.online ||
            this.serverStatus.players.max !== newStatus.players.max) {
            return true;
        }

        return false;
    }

    handleServerError() {
        this.consecutiveErrors++;

        if (this.consecutiveErrors >= this.maxFailures) {
            console.warn('連続エラー上限に達しました。前回の状態を保持します。');

            // 前回の状態がない場合のみオフライン状態を設定
            if (!this.serverStatus) {
                this.serverStatus = {
                    online: false,
                    players: { online: 0, max: 0 },
                    motd: 'サーバーに接続できません',
                    lastUpdate: new Date().toLocaleTimeString('ja-JP')
                };

                if (this.currentPage === 'server') {
                    this.renderServer();
                }
            }
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
        this.initializeRouter(); // ルーター初期化
        this.setupEventListeners();
        await this.loadData();
        this.cleanExpiredSchedules();

        // iPhone Safari対応
        setTimeout(() => {
            this.updateUI();
            this.forceButtonRefresh();
        }, 100);

        console.log('光鯖公式ホームページ初期化完了（URLルーティング修正・サーバー同期改善版）');
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

    // イベントリスナー設定（ルーティング対応）
    setupEventListeners() {
        // ナビゲーションリンク
        document.querySelectorAll('.nav-link').forEach(link => {
            const handleNavClick = (e) => {
                e.preventDefault();
                const page = link.dataset.page;

                if (page === 'operation') {
                    this.handleOperation();
                } else if (this.validPages.includes(page)) {
                    this.navigateToPage(page);
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
            if (this.data.serverConfig && this.data.serverConfig.address && this.currentPage === 'server') {
                this.fetchServerStatusImproved();
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

    // サーバー表示（改善版）
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
                        <h3 class="server-status-title">サーバー状態を確認中...</h3>
                    </div>
                    <p>サーバー情報を取得しています...</p>
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

        // 作成日が古い順に表示（追加した順序を維持）
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

        // メンバーと他のページで挿入位置を調整
        if (this.currentPage === 'member') {
            // メンバーは末尾に追加（古い順表示のため）
            this.data[this.currentPage].push(data);
        } else if (this.currentPage === 'web') {
            this.data[this.currentPage].push(data);
        } else {
            // 他のページは先頭に追加
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
    console.log('光鯖公式ホームページ初期化完了（URLルーティング修正・サーバー同期改善・メンバー表示順序修正版）');
});
