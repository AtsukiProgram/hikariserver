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

            if (this.data.serverConfig && this.data.serverConfig.address) {
                this.fetchServerStatus();
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

        if (this.data.serverConfig && this.data.serverConfig.address) {
            this.fetchServerStatus();
            this.startServerStatusUpdates();
        }
    }

    saveLocalData() {
        Object.keys(this.data).forEach(key => {
            localStorage.setItem(key, JSON.stringify(this.data[key]));
        });
    }

    // リアルタイム更新システム（API制限対応：5秒間隔）
    startServerStatusUpdates() {
        if (this.serverUpdateInterval) {
            clearInterval(this.serverUpdateInterval);
        }

        // 5000ms間隔で更新（API制限を考慮）
        this.serverUpdateInterval = setInterval(() => {
            if (this.data.serverConfig && this.data.serverConfig.address) {
                this.fetchServerStatus();
            }
        }, 5000); // 5秒間隔（API制限対応）

        console.log('サーバー更新開始: 5秒間隔（API制限対応）');
    }

    stopServerStatusUpdates() {
        if (this.serverUpdateInterval) {
            clearInterval(this.serverUpdateInterval);
            this.serverUpdateInterval = null;
        }
    }

    // サーバーステータス取得（API制限対応版）
    async fetchServerStatus() {
        if (!this.data.serverConfig || !this.data.serverConfig.address) {
            return;
        }

        const address = this.data.serverConfig.address;
        const serverType = this.data.serverConfig.serverType;

        try {
            // API制限対応：1つのAPIのみ使用し、エラーハンドリング強化
            const response = await fetch(`https://api.mcsrvstat.us/3/${address}`);

            // 429エラー（Too Many Requests）の処理
            if (response.status === 429) {
                console.warn('API制限に達しました。60秒後に再試行します。');
                // 60秒間リクエストを停止
                setTimeout(() => {
                    this.updateFailureCount = 0;
                    console.log('API制限解除、リクエスト再開');
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

            let version = 'Unknown';
            let players = {
                online: 0,
                max: 0,
                sample: []
            };

            // 人数情報の取得
            if (data.players) {
                players.online = data.players.online || 0;
                players.max = data.players.max || 0;

                // プレイヤーサンプルの取得
                if (data.players.sample && data.players.sample.length > 0) {
                    players.sample = data.players.sample;
                }
            }

            // バージョン情報の取得
            if (serverType === 'BungeeCord' || serverType === 'Velocity') {
                version = this.extractProxyLobbyVersion([data], serverType);
            } else {
                version = this.extractServerVersion([data]);
            }

            // サーバーステータス更新
            this.serverStatus = {
                online: data.online || false,
                players: players,
                version: version,
                motd: data.motd ? (data.motd.clean || data.motd) : 'No MOTD',
                lastApiUpdate: new Date().toLocaleTimeString('ja-JP')
            };

            // 更新成功をカウント
            this.updateFailureCount = 0;
            this.lastSuccessfulUpdate = Date.now();

            if (this.currentPage === 'server') {
                this.renderServer();
            }

        } catch (error) {
            console.error('サーバーステータスの取得に失敗:', error);
            this.updateFailureCount++;

            // 連続失敗時は前回の成功データを保持
            if (this.updateFailureCount < this.maxFailures && this.serverStatus) {
                console.warn(`API取得失敗 ${this.updateFailureCount}/${this.maxFailures} - 前回データを保持`);
                return;
            }

            // 完全失敗時のフォールバック
            this.serverStatus = {
                online: false,
                players: { online: 0, max: 0, sample: [] },
                version: 'Status unavailable',
                motd: 'Connection failed',
                lastApiUpdate: new Date().toLocaleTimeString('ja-JP')
            };

            if (this.currentPage === 'server') {
                this.renderServer();
            }
        }
    }

    // プロキシサーバーのロビーバージョン正確抽出（最終修正版）
    extractProxyLobbyVersion(results, serverType) {
        for (const data of results) {
            // 1. protocol.name から直接取得（mcsrvstat.us APIで最も正確）
            if (data.protocol && data.protocol.name) {
                // protocol.nameは最も信頼性の高い情報源
                return `v${data.protocol.name}`;
            }

            // 2. version文字列からの正確な抽出
            if (data.version) {
                // Minecraftバージョンの正規表現（より厳密に）
                const minecraftVersionRegex = /(?:^|[^\d])1\.(\d{1,2})(?:\.(\d{1,2}))?(?:[^\d]|$)/;
                const match = data.version.match(minecraftVersionRegex);

                if (match) {
                    const majorVersion = match[1];
                    const patchVersion = match[2];

                    if (patchVersion) {
                        return `v1.${majorVersion}.${patchVersion}`;
                    } else {
                        return `v1.${majorVersion}`;
                    }
                }
            }

            // 3. software情報からバージョンを抽出
            if (data.software) {
                const softwareVersionMatch = data.software.match(/1\.(\d{1,2})(?:\.(\d{1,2}))?/);
                if (softwareVersionMatch) {
                    const majorVersion = softwareVersionMatch[1];
                    const patchVersion = softwareVersionMatch[2];

                    if (patchVersion) {
                        return `v1.${majorVersion}.${patchVersion}`;
                    } else {
                        return `v1.${majorVersion}`;
                    }
                }
            }

            // 4. protocolバージョンから正確なマッピング（フォールバック）
            if (data.protocol && data.protocol.version) {
                const exactVersionMap = {
                    // Minecraft 1.21.x系
                    770: "1.21.5", 769: "1.21.4", 768: "1.21.3", 767: "1.21.2",
                    765: "1.21.1", 763: "1.21",

                    // Minecraft 1.20.x系
                    762: "1.20.6", 761: "1.20.5", 760: "1.20.4", 759: "1.20.3",
                    758: "1.20.2", 757: "1.20.1", 756: "1.20",

                    // Minecraft 1.19.x系
                    755: "1.19.4", 754: "1.19.3", 753: "1.19.2", 752: "1.19.1", 751: "1.19",

                    // その他のバージョン
                    750: "1.18.2", 749: "1.18.1", 748: "1.18",
                    747: "1.17.1", 746: "1.17",
                    745: "1.16.5", 744: "1.16.4", 743: "1.16.3", 742: "1.16.2", 741: "1.16.1", 740: "1.16",
                    578: "1.15.2", 577: "1.15.1", 575: "1.15",
                    498: "1.14.4", 490: "1.14.3", 485: "1.14.2", 480: "1.14.1", 477: "1.14",
                    404: "1.13.2", 401: "1.13.1", 393: "1.13",
                    340: "1.12.2", 338: "1.12.1", 335: "1.12",
                    316: "1.11.2", 315: "1.11.1", 315: "1.11",
                    210: "1.10.2", 210: "1.10.1", 210: "1.10",
                    184: "1.9.4", 183: "1.9.3", 176: "1.9.2", 175: "1.9.1", 169: "1.9",
                    47: "1.8.9"
                };

                const protocolVersion = data.protocol.version;
                if (exactVersionMap[protocolVersion]) {
                    return `v${exactVersionMap[protocolVersion]}`;
                }
            }
        }

        // フォールバック: 不明な場合
        return 'Unknown Version';
    }

    // 通常サーバーのバージョン正確抽出
    extractServerVersion(results) {
        for (const data of results) {
            // protocol.nameから直接取得（最優先）
            if (data.protocol && data.protocol.name) {
                return `v${data.protocol.name}`;
            }

            // version文字列からの正確な抽出
            if (data.version) {
                const versionMatch = data.version.match(/1\.(\d{1,2})(?:\.(\d{1,2}))?/);
                if (versionMatch) {
                    const majorVersion = versionMatch[1];
                    const patchVersion = versionMatch[2];

                    if (patchVersion) {
                        return `v1.${majorVersion}.${patchVersion}`;
                    } else {
                        return `v1.${majorVersion}`;
                    }
                }
            }

            if (data.software && data.software.version) {
                const versionMatch = data.software.version.match(/1\.(\d{1,2})(?:\.(\d{1,2}))?/);
                if (versionMatch) {
                    const majorVersion = versionMatch[1];
                    const patchVersion = versionMatch[2];

                    if (patchVersion) {
                        return `v1.${majorVersion}.${patchVersion}`;
                    } else {
                        return `v1.${majorVersion}`;
                    }
                }
            }

            if (data.protocol && data.protocol.version) {
                const versionMap = {
                    770: "1.21.5", 769: "1.21.4", 768: "1.21.3", 767: "1.21.2",
                    765: "1.21.1", 763: "1.21", 762: "1.20.6", 761: "1.20.5",
                    760: "1.20.4", 759: "1.20.3", 758: "1.20.2", 757: "1.20.1",
                    756: "1.20", 755: "1.19.4", 754: "1.19.3", 753: "1.19.2",
                    752: "1.19.1", 751: "1.19", 47: "1.8.9"
                };
                return versionMap[data.protocol.version] ? `v${versionMap[data.protocol.version]}` : `Protocol ${data.protocol.version}`;
            }
        }

        return 'Unknown';
    }

    // UUIDが無い場合の疑似UUID生成
    generateFakeUUID(playerName) {
        // プレイヤー名からハッシュベースの疑似UUIDを生成
        let hash = 0;
        for (let i = 0; i < playerName.length; i++) {
            const char = playerName.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit整数に変換
        }
        const hex = Math.abs(hash).toString(16).padStart(8, '0');
        return `${hex.substr(0,8)}-${hex.substr(8,4) || '0000'}-4${hex.substr(12,3) || '000'}-${hex.substr(15,4) || '8000'}-${'0'.repeat(12)}`;
    }

    // パスワード検証
    validatePassword(input) {
        const memberPass = String.fromCharCode(122, 57, 120, 49, 121, 53, 104, 113);
        const adminPass = String.fromCharCode(120, 48, 104, 108, 116, 52, 105, 53);

        if (input === memberPass) {
            return 'member';
        } else if (input === adminPass) {
            return 'admin';
        }
        return false;
    }

    // 現在の日付を年/月/日形式で取得
    getCurrentDateString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        return `${year}/${month}/${day}`;
    }

    // 日付をYYYY-MM-DD形式（HTML date input用）に変換
    formatDateForInput(dateString) {
        if (!dateString) return '';

        // 年/月/日 形式を YYYY-MM-DD に変換
        const parts = dateString.split('/');
        if (parts.length === 3) {
            const [year, month, day] = parts;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        return '';
    }

    // YYYY-MM-DD形式を年/月/日形式に変換
    formatDateForDisplay(dateString) {
        if (!dateString) return '';

        // YYYY-MM-DD 形式を 年/月/日 に変換
        const parts = dateString.split('-');
        if (parts.length === 3) {
            const [year, month, day] = parts;
            return `${year}/${parseInt(month)}/${parseInt(day)}`;
        }
        return dateString;
    }

    // 年/月/日形式をDateオブジェクトに変換
    parseJapaneseDate(dateString) {
        if (!dateString) return null;
        const parts = dateString.split('/');
        if (parts.length === 3) {
            const [year, month, day] = parts.map(Number);
            return new Date(year, month - 1, day); // monthは0ベース
        }
        return null;
    }

    async init() {
        this.loadLoginState();
        this.setupEventListeners();
        await this.loadData();
        this.cleanExpiredSchedules();

        // iPhone Safari対応：初期化時にUIを確実に更新
        setTimeout(() => {
            this.updateUI();
            this.forceButtonRefresh();
        }, 100);

        console.log('光鯖公式ホームページ初期化完了（正確なバージョン検出対応版 - 5秒間隔）');
    }

    // iPhone Safari対応：ボタンの強制リフレッシュ
    forceButtonRefresh() {
        const plusBtn = document.getElementById('admin-plus-btn');
        const setBtn = document.getElementById('admin-set-btn');

        // 強制的に再描画を実行
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

    // イベントリスナー設定（iPhone Safari対応強化）
    setupEventListeners() {
        // ナビゲーションリンク
        document.querySelectorAll('.nav-link').forEach(link => {
            // iPhone Safari対応：touchendとclickの両方を設定
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

        // iPhone Safari対応：ボタンのイベントリスナー強化
        const setupButtonListener = (id, handler) => {
            const button = document.getElementById(id);
            if (button) {
                // 既存のイベントリスナーを削除
                button.removeEventListener('click', handler);
                button.removeEventListener('touchend', handler);

                // 新しいイベントリスナーを追加
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

        // フォーカス最適化: アクティブ時は通常頻度、非アクティブ時は低頻度
        window.addEventListener('focus', () => {
            if (this.data.serverConfig && this.data.serverConfig.address && this.currentPage === 'server') {
                console.log('ページアクティブ - サーバー更新再開（5秒間隔）');
                this.fetchServerStatus(); // 即座に更新
                this.startServerStatusUpdates(); // 5秒間隔
            }
        });

        window.addEventListener('blur', () => {
            if (this.currentPage === 'server') {
                console.log('ページ非アクティブ - 更新間隔延長（10秒間隔）');
                // 非アクティブ時は10秒間隔に変更してリソース節約
                if (this.serverUpdateInterval) {
                    clearInterval(this.serverUpdateInterval);
                    this.serverUpdateInterval = setInterval(() => {
                        if (this.data.serverConfig && this.data.serverConfig.address) {
                            this.fetchServerStatus();
                        }
                    }, 10000); // 10秒間隔
                }
            }
        });

        // iPhone Safari対応：ページ表示時の強制更新
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

        // iPhone Safari対応：ページ変更時のUI更新を遅延実行
        setTimeout(() => {
            this.updateUI();
            this.forceButtonRefresh();
        }, 50);

        if (page === 'server' && this.data.serverConfig && this.data.serverConfig.address) {
            this.fetchServerStatus();
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

                    // iPhone Safari対応：ログイン後のUI更新を確実に実行
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

    // iPhone Safari対応：UI更新メソッドの強化
    updateUI() {
        const plusBtn = document.getElementById('admin-plus-btn');
        const setBtn = document.getElementById('admin-set-btn');
        const deleteButtons = document.querySelectorAll('.delete-btn');

        let showPlusBtn = false;
        let showSetBtn = false;

        // ユーザーモードと現在のページに基づいてボタンの表示を決定
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

        // iPhone Safari対応：強制的な表示更新
        if (plusBtn) {
            plusBtn.style.display = showPlusBtn ? 'flex' : 'none';
            // ブラウザの再描画を強制
            plusBtn.offsetHeight;
        }

        if (setBtn) {
            setBtn.style.display = showSetBtn ? 'flex' : 'none';
            // ブラウザの再描画を強制
            setBtn.offsetHeight;

            // ポジションのリセット
            if (this.currentPage === 'server' && showSetBtn) {
                setBtn.style.right = '30px';
                setBtn.style.bottom = '30px';
            } else {
                setBtn.style.right = '100px';
                setBtn.style.bottom = '30px';
            }
        }

        // 削除ボタンの表示制御
        deleteButtons.forEach(btn => {
            btn.style.display = this.userMode === 'admin' ? 'block' : 'none';
        });

        // iPhone Safari対応：デバッグ情報
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
            case 'server':
                this.renderServer();
                break;
        }
    }

    // プレイヤー一覧改良版 renderServer()
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

            // 改良版プレイヤー一覧HTML生成
            let playerListHtml = '';
            if (status.online && status.players) {
                if (status.players.sample && status.players.sample.length > 0) {
                    playerListHtml = `
                        <div class="server-players-list">
                            <h4 class="players-list-title">参加プレイヤー (${status.players.sample.length}名)</h4>
                            <div class="players-container">
                    `;

                    status.players.sample.forEach(player => {
                        // 複数のスキンサービスでフォールバック
                        const skinUrl1 = `https://crafatar.com/avatars/${player.id}?size=32&overlay`;
                        const skinUrl2 = `https://mc-heads.net/avatar/${player.id}/32`;
                        const skinUrl3 = `https://minotar.net/helm/${player.name}/32`;

                        playerListHtml += `
                            <div class="player-item" title="プレイヤー: ${player.name}">
                                <img src="${skinUrl1}" 
                                     alt="${player.name}" 
                                     class="player-skin" 
                                     onerror="this.onerror=null; this.src='${skinUrl2}'; 
                                              this.onerror=function(){this.src='${skinUrl3}';}">
                                <span class="player-name">${player.name}</span>
                                <span class="player-status">オンライン</span>
                            </div>
                        `;
                    });

                    playerListHtml += `
                            </div>
                        </div>
                    `;
                } else if (status.players.online > 0) {
                    playerListHtml = `
                        <div class="server-players-list">
                            <h4 class="players-list-title">参加プレイヤー</h4>
                            <div class="players-container">
                                <div class="no-player-sample">
                                    <div class="player-count-display">
                                        <span class="large-player-count">${status.players.online}</span>
                                        <span class="player-count-label">人が参加中</span>
                                    </div>
                                    <div class="player-sample-note">
                                        <span>プレイヤー詳細情報を取得できませんでした</span>
                                        <span class="sample-help">サーバー設定で enable-query=true が必要な場合があります</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                } else {
                    playerListHtml = `
                        <div class="server-players-list">
                            <h4 class="players-list-title">参加プレイヤー</h4>
                            <div class="players-container">
                                <div class="no-player-sample">
                                    <span class="empty-server-message">現在、プレイヤーは参加していません</span>
                                </div>
                            </div>
                        </div>
                    `;
                }
            }

            if (showAddress) {
                // メンバー以上の表示
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
                                <div class="server-detail-value">${status.version}</div>
                            </div>
                            
                            <div class="server-type-section">
                                <div class="server-detail-label">サーバー種類</div>
                                <div class="server-detail-value">${config.serverType}</div>
                            </div>
                        </div>
                        
                        ${playerListHtml}
                    </div>
                `;
            } else {
                // 一般権限の表示
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
                                <div class="server-detail-value">${status.version}</div>
                            </div>
                            
                            <div class="server-type-section">
                                <div class="server-detail-label">サーバー種類</div>
                                <div class="server-detail-value">${config.serverType}</div>
                            </div>
                        </div>
                        
                        ${playerListHtml}
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

    renderMembers() {
        const container = document.getElementById('member-list');
        container.innerHTML = '';

        this.data.member.forEach((item, index) => {
            const element = this.createContentElement(item, index, 'member');
            container.appendChild(element);
        });

        this.updateUI();
    }

    // 予定表示：現在日時に近い順＆24:00過ぎたら自動削除
    renderSchedule() {
        const container = document.getElementById('schedule-list');
        container.innerHTML = '';

        const now = new Date();
        const originalLength = this.data.schedule.length;

        // 24:00（翌日の0:00）を過ぎた予定を自動削除
        this.data.schedule = this.data.schedule.filter(item => {
            try {
                const itemDate = this.parseJapaneseDate(item.date);
                if (!itemDate) return true;

                // 指定日の翌日0:00を計算
                const nextDay = new Date(itemDate);
                nextDay.setDate(itemDate.getDate() + 1);
                nextDay.setHours(0, 0, 0, 0);

                return now < nextDay;
            } catch (error) {
                console.error('日付解析エラー:', error);
                return true; // エラーの場合は削除しない
            }
        });

        // 自動削除が発生した場合はデータを保存
        if (this.data.schedule.length !== originalLength) {
            console.log(`期限切れの予定 ${originalLength - this.data.schedule.length} 件を自動削除しました`);
            this.saveData();
        }

        // 現在日時に近い順にソート
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

    // WEB表示順序変更：作成順（古い順）に表示
    renderWeb() {
        const container = document.getElementById('web-list');
        container.innerHTML = '';

        // reverseを削除して作成順（古い順）に表示
        this.data.web.forEach((item, index) => {
            const element = this.createContentElement(item, index, 'web');
            container.appendChild(element);
        });

        this.updateUI();
    }

    // ロードマップ表示：日付の古い順にソート
    renderRoadmap() {
        const container = document.getElementById('roadmap-list');
        container.innerHTML = '';

        // 日付で古い順（昇順）にソート
        this.data.roadmap.sort((a, b) => {
            try {
                const dateA = this.parseJapaneseDate(a.date);
                const dateB = this.parseJapaneseDate(b.date);

                if (!dateA && !dateB) return 0;
                if (!dateA) return 1;
                if (!dateB) return -1;

                return dateA - dateB; // 昇順ソート（古い順）
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

    // WEBタブ種類選択対応：アイコンマップ
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
                // HTML date input を使用（画像の形式に統一）
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

        // WEBページの場合、種類選択の変更イベントを追加
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

    // 日付入力統一：フォームフィールド定義を修正
    getFormFields() {
        const commonFields = {
            'news': [
                { id: 'title', label: 'タイトル', type: 'text', placeholder: 'ニュースのタイトル' },
                { id: 'content', label: '内容', type: 'textarea', placeholder: 'ニュースの内容' }
                // 日付フィールドを削除
            ],
            'member': [
                { id: 'name', label: '名前', type: 'text', placeholder: 'メンバーの名前' },
                { id: 'description', label: '説明', type: 'textarea', placeholder: 'メンバーの説明' },
                { id: 'image', label: '画像', type: 'file' }
            ],
            'schedule': [
                { id: 'title', label: 'タイトル', type: 'text', placeholder: 'イベントのタイトル' },
                { id: 'content', label: '詳細', type: 'textarea', placeholder: 'イベントの詳細' },
                { id: 'date', label: '日時', type: 'date' } // HTML date inputに統一
            ],
            'web': [
                { id: 'title', label: 'タイトル', type: 'text', placeholder: 'ウェブサイトの名前' },
                { id: 'url', label: 'URL', type: 'url', placeholder: 'https://example.com' },
                { id: 'type', label: '種類', type: 'select', options: ['discord', 'youtube', 'twitter'] }
            ],
            'roadmap': [
                { id: 'title', label: 'タイトル', type: 'text', placeholder: 'ロードマップのタイトル' },
                { id: 'content', label: '内容', type: 'textarea', placeholder: 'ロードマップの内容' },
                { id: 'date', label: '予定日', type: 'date' } // HTML date inputに統一
            ]
        };

        return commonFields[this.currentPage] || [];
    }

    // 日付処理統一：モーダル送信処理を修正
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

                // WEBページの場合、種類に基づいてアイコンを設定
                if (this.currentPage === 'web' && field.id === 'type') {
                    data.icon = this.getWebIconPath(value);
                }
            } else if (field.type === 'date') {
                // HTML date input (YYYY-MM-DD) を 年/月/日 に変換
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

        // NEWSの場合は現在の日付を自動追加
        if (this.currentPage === 'news') {
            data.date = this.getCurrentDateString();
        }

        if (!isValid) return;

        // WEBタブは末尾に追加（作成順表示のため）
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

        // サーバー情報更新開始
        if (this.currentPage === 'server') {
            this.fetchServerStatus();
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
    console.log('Light Server Website initialized successfully! (正確なバージョン検出対応版 - 5秒間隔)');
});
