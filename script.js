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
        this.userMode = 'guest'; // 'guest', 'member', 'admin'
        this.currentPage = 'top';
        this.data = {
            news: [],
            member: [],
            schedule: [],
            web: [],
            roadmap: [],
            serverConfig: null // サーバー設定情報
        };
        this.serverStatus = null; // サーバーステータス情報
        this.modalType = 'add'; // 'add' or 'server-settings'

        this.init();
    }

    // Firebase からデータを読み込み
    async loadData() {
        try {
            const dbRef = ref(database);
            const snapshot = await get(child(dbRef, '/'));

            if (snapshot.exists()) {
                const firebaseData = snapshot.val();
                // データをマージ
                Object.keys(this.data).forEach(key => {
                    this.data[key] = firebaseData[key] || (key === 'serverConfig' ? null : []);
                });
            }

            this.renderCurrentPage();

            // サーバー情報がある場合、ステータスを取得
            if (this.data.serverConfig && this.data.serverConfig.address) {
                this.fetchServerStatus();
            }
        } catch (error) {
            console.error('Firebase データの読み込みに失敗:', error);
            // エラー時はlocalStorageにフォールバック
            this.loadLocalData();
        }
    }

    // Firebase にデータを保存
    async saveData() {
        try {
            await set(ref(database, '/'), this.data);
            console.log('Firebase にデータを保存しました');
        } catch (error) {
            console.error('Firebase データの保存に失敗:', error);
            // エラー時はlocalStorageにフォールバック
            this.saveLocalData();
        }
    }

    // localStorageフォールバック用メソッド
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
        }
    }

    saveLocalData() {
        Object.keys(this.data).forEach(key => {
            localStorage.setItem(key, JSON.stringify(this.data[key]));
        });
    }

    // Minecraftサーバーステータス取得（プロキシ対応）
    async fetchServerStatus() {
        if (!this.data.serverConfig || !this.data.serverConfig.address) {
            return;
        }

        const address = this.data.serverConfig.address;
        const serverType = this.data.serverConfig.serverType;

        try {
            // MCApi.us を使用してサーバーステータスを取得
            const response = await fetch(`https://api.mcsrvstat.us/3/${address}`);
            const data = await response.json();

            let version = 'Unknown';

            // プロキシサーバーの場合はロビーサーバーのバージョンを取得
            if (serverType === 'BungeeCord' || serverType === 'Velocity') {
                // プロキシサーバーの場合、可能であればロビーサーバーの情報を取得
                if (data.version) {
                    version = data.version;
                } else if (data.software) {
                    version = data.software;
                } else {
                    // プロキシの場合、一般的なロビーのバージョンを推測
                    version = 'Proxy Server';
                }
            } else {
                // 通常のサーバーの場合
                version = data.version || 'Unknown';
            }

            this.serverStatus = {
                online: data.online || false,
                players: {
                    online: data.players ? data.players.online : 0,
                    max: data.players ? data.players.max : 0
                },
                version: version,
                motd: data.motd ? data.motd.clean : 'No MOTD',
                lastUpdated: new Date().toLocaleTimeString('ja-JP')
            };

            // サーバーページが表示中の場合、再レンダリング
            if (this.currentPage === 'server') {
                this.renderServer();
            }
        } catch (error) {
            console.error('サーバーステータスの取得に失敗:', error);
            this.serverStatus = {
                online: false,
                players: { online: 0, max: 0 },
                version: 'Unknown',
                motd: 'Status unavailable',
                lastUpdated: new Date().toLocaleTimeString('ja-JP')
            };

            if (this.currentPage === 'server') {
                this.renderServer();
            }
        }
    }

    // パスワード検証
    validatePassword(input) {
        const memberPass = String.fromCharCode(122, 57, 120, 49, 121, 53, 104, 113); // z9x1y5hq
        const adminPass = String.fromCharCode(120, 48, 104, 108, 116, 52, 105, 53); // x0hlt4i5

        if (input === memberPass) {
            return 'member';
        } else if (input === adminPass) {
            return 'admin';
        }
        return false;
    }

    async init() {
        this.setupEventListeners();
        await this.loadData(); // Firebase からデータを読み込み
        this.cleanExpiredSchedules();

        // サーバーステータスを定期的に更新（5分間隔）
        setInterval(() => {
            if (this.data.serverConfig && this.data.serverConfig.address) {
                this.fetchServerStatus();
            }
        }, 300000);
    }

    setupEventListeners() {
        // ナビゲーションリンク
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;

                if (page === 'operation') {
                    this.handleOperation();
                } else {
                    this.showPage(page);
                }

                this.closeMobileMenu();
            });
        });

        // ハンバーガーメニュー
        document.getElementById('hamburger').addEventListener('click', () => {
            this.toggleMobileMenu();
        });

        // モバイルメニューの外側クリックで閉じる
        document.addEventListener('click', (e) => {
            const navLinks = document.getElementById('nav-links');
            const hamburger = document.getElementById('hamburger');

            if (!navLinks.contains(e.target) && !hamburger.contains(e.target)) {
                this.closeMobileMenu();
            }
        });

        // +ボタン（add）
        document.getElementById('admin-plus-btn').addEventListener('click', () => {
            this.modalType = 'add';
            this.showAddModal();
        });

        // 設定ボタン（set）
        document.getElementById('admin-set-btn').addEventListener('click', () => {
            this.modalType = 'server-settings';
            this.showServerSettingsModal();
        });

        // モーダル関連
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

        // ファイル選択
        document.getElementById('hidden-file-input').addEventListener('change', (e) => {
            this.handleFileSelect(e);
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
        this.updateUI();
    }

    handleOperation() {
        if (this.userMode !== 'guest') {
            this.userMode = 'guest';
            const operationBtn = document.getElementById('operationBtn');
            operationBtn.querySelector('.nav-text').textContent = 'OPERATION';
            operationBtn.querySelector('.nav-japanese').textContent = '管理';
            this.updateUI();
            alert('ログアウトしました');
        } else {
            const password = prompt('パスワードを入力してください:');
            if (password) {
                const mode = this.validatePassword(password);
                if (mode) {
                    this.userMode = mode;
                    const operationBtn = document.getElementById('operationBtn');
                    operationBtn.querySelector('.nav-text').textContent = 'LOGOUT';
                    operationBtn.querySelector('.nav-japanese').textContent = 'ログアウト';
                    this.updateUI();

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
                    // SERVERページでは+ボタンを非表示、⚙ボタンを+ボタンの位置に表示
                    showPlusBtn = false;
                    showSetBtn = true;
                } else {
                    // 他のページでは通常通り+ボタン表示
                    showPlusBtn = true;
                    showSetBtn = false;
                }
            } else if (this.userMode === 'member' && this.currentPage === 'member') {
                showPlusBtn = true; // メンバー：MEMBERページのみ
                showSetBtn = false;
            }
        }

        plusBtn.style.display = showPlusBtn ? 'flex' : 'none';
        setBtn.style.display = showSetBtn ? 'flex' : 'none';

        // SERVERページで⚙ボタンを+ボタンの位置に移動
        if (this.currentPage === 'server' && showSetBtn) {
            setBtn.style.right = '30px';
            setBtn.style.bottom = '30px';
        } else {
            setBtn.style.right = '100px';
            setBtn.style.bottom = '30px';
        }

        // 削除ボタンの表示制御（管理者のみ）
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

    renderNews() {
        const container = document.getElementById('news-list');
        container.innerHTML = '';

        const sortedNews = [...this.data.news].sort((a, b) => new Date(b.date) - new Date(a.date));

        sortedNews.forEach((item, index) => {
            const element = this.createContentElement(item, 'news', index);
            container.appendChild(element);
        });

        this.updateUI();
    }

    renderMembers() {
        const container = document.getElementById('member-list');
        container.innerHTML = '';

        this.data.member.forEach((member, index) => {
            const element = document.createElement('div');
            element.className = 'member-item';
            element.innerHTML = `
                <img src="${member.image}" alt="${member.name}" class="member-image" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjRUNGMEYxIi8+CjxwYXRoIGQ9Ik00MCA0MEMzNS41IDQwIDMyIDM2LjUgMzIgMzJDMzIgMjcuNSAzNS41IDI0IDQwIDI0QzQ0LjUgMjQgNDggMjcuNSA0OCAzMkM0OCAzNi41IDQ0LjUgNDAgNDAgNDBaTTQwIDQ0QzMwIDQ0IDIyIDUyIDIyIDYySDU4QzU4IDUyIDUwIDQ0IDQwIDQ0WiIgZmlsbD0iI0JEQzNDNyIvPgo8L3N2Zz4K'">
                <div class="member-info">
                    <h3>${member.name}</h3>
                    <div class="member-description">${this.parseDiscordMarkdown(member.description)}</div>
                </div>
                <button class="delete-btn" data-delete-type="member" data-delete-index="${index}">&times;</button>
            `;

            // 削除ボタンにイベントリスナーを追加
            const deleteBtn = element.querySelector('.delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteItem('member', index);
                });
            }

            container.appendChild(element);
        });

        this.updateUI();
    }

    renderSchedule() {
        const container = document.getElementById('schedule-list');
        container.innerHTML = '';

        const sortedSchedule = [...this.data.schedule].sort((a, b) => new Date(a.date) - new Date(b.date));

        sortedSchedule.forEach((item, index) => {
            const element = this.createContentElement(item, 'schedule', index);
            container.appendChild(element);
        });

        this.updateUI();
    }

    renderWeb() {
        const container = document.getElementById('web-list');
        container.innerHTML = '';

        this.data.web.forEach((item, index) => {
            const element = document.createElement('div');
            element.className = 'web-item';
            element.onclick = () => window.open(item.url, '_blank');

            const iconSrc = `${item.platform}.png`;

            element.innerHTML = `
                <img src="${iconSrc}" alt="${item.platform}" class="web-icon" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iOCIgZmlsbD0iIzM0OThEQiIvPgo8cGF0aCBkPSJNMjAgMTBDMTYuNjg2MyAxMCAxNCAxMi42ODYzIDE0IDE2VjI0QzE0IDI3LjMxMzcgMTYuNjg2MyAzMCAyMCAzMEMyMy4zMTM3IDMwIDI2IDI3LjMxMzcgMjYgMjRWMTZDMjYgMTIuNjg2MyAyMy4zMTM3IDEwIDIwIDEwWiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+Cg=='">
                <div class="web-title">${item.title}</div>
                <button class="delete-btn" data-delete-type="web" data-delete-index="${index}">&times;</button>
            `;

            // 削除ボタンにイベントリスナーを追加
            const deleteBtn = element.querySelector('.delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteItem('web', index);
                });
            }

            container.appendChild(element);
        });

        this.updateUI();
    }

    renderRoadmap() {
        const container = document.getElementById('roadmap-list');
        container.innerHTML = '';

        // ロードマップ作成時に設定した日付順でソート（古い日付を上に表示）
        const sortedRoadmap = [...this.data.roadmap].sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            return dateA - dateB; // 昇順ソート（古い日付が上）
        });

        sortedRoadmap.forEach((item, sortedIndex) => {
            // 元の配列でのインデックスを取得（削除機能用）
            const originalIndex = this.data.roadmap.findIndex(original =>
                original.date === item.date &&
                original.title === item.title &&
                original.content === item.content
            );

            const element = document.createElement('div');
            element.className = 'roadmap-item';
            element.innerHTML = `
                <div class="roadmap-date">${item.date}</div>
                <h3>${item.title}</h3>
                <div class="roadmap-content">${this.parseDiscordMarkdown(item.content)}</div>
                <button class="delete-btn" data-delete-type="roadmap" data-delete-index="${originalIndex}">&times;</button>
            `;

            // 削除ボタンにイベントリスナーを追加
            const deleteBtn = element.querySelector('.delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteItem('roadmap', originalIndex);
                });
            }

            container.appendChild(element);
        });

        this.updateUI();
    }

    renderServer() {
        const container = document.getElementById('server-info');

        if (!this.data.serverConfig) {
            // サーバー設定がない場合
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
            // ステータス読み込み中
            serverContent = `
                <div class="server-status-card">
                    <div class="server-status-header">
                        <div class="loading-spinner"></div>
                        <h3 class="server-status-title">サーバー状態を確認中...</h3>
                    </div>
                    <p>サーバー情報を取得しています。しばらくお待ちください。</p>
                </div>
            `;
        } else {
            // 権限による表示制御と新しいレイアウト
            const showAddress = this.userMode !== 'guest'; // メンバー以上のみアドレス表示

            if (showAddress) {
                // メンバー以上の表示形式
                serverContent = `
                    <div class="server-status-card">
                        <div class="server-status-header">
                            <div class="server-status-icon ${status.online ? 'server-status-online' : 'server-status-offline'}"></div>
                            <h3 class="server-status-title">${status.online ? 'オンライン' : 'オフライン'}</h3>
                        </div>
                        
                        <div class="server-layout-member">
                            <!-- 1行目: サーバーアドレス（全幅） -->
                            <div class="server-address-full">
                                <div class="server-detail-label">サーバーアドレス</div>
                                <div class="server-detail-value">${config.address}</div>
                            </div>
                            
                            <!-- 2行目: 人数とバージョン -->
                            <div class="server-players-section">
                                <div class="server-detail-label">参加人数</div>
                                <div class="server-detail-value server-players">${status.players.online} / ${status.players.max}</div>
                            </div>
                            
                            <div class="server-version-section">
                                <div class="server-detail-label">バージョン</div>
                                <div class="server-detail-value">${status.version}</div>
                            </div>
                            
                            <!-- 3行目: サーバー種類と最終更新 -->
                            <div class="server-type-section">
                                <div class="server-detail-label">サーバー種類</div>
                                <div class="server-detail-value">${config.serverType}</div>
                            </div>
                            
                            <div class="server-updated-section">
                                <div class="server-detail-label">最終更新</div>
                                <div class="server-detail-value">${status.lastUpdated}</div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                // 一般権限の表示形式
                serverContent = `
                    <div class="server-status-card">
                        <div class="server-status-header">
                            <div class="server-status-icon ${status.online ? 'server-status-online' : 'server-status-offline'}"></div>
                            <h3 class="server-status-title">${status.online ? 'オンライン' : 'オフライン'}</h3>
                        </div>
                        
                        <div class="server-layout-guest">
                            <!-- 1行目: 応募（全幅） -->
                            <div class="server-application-full">
                                <div class="server-detail-label">参加について</div>
                                <div class="server-application-content">${this.parseDiscordMarkdown(config.application || '参加方法については管理者にお問い合わせください。')}</div>
                            </div>
                            
                            <!-- 2行目: 人数とバージョン -->
                            <div class="server-players-section">
                                <div class="server-detail-label">参加人数</div>
                                <div class="server-detail-value server-players">${status.players.online} / ${status.players.max}</div>
                            </div>
                            
                            <div class="server-version-section">
                                <div class="server-detail-label">バージョン</div>
                                <div class="server-detail-value">${status.version}</div>
                            </div>
                            
                            <!-- 3行目: サーバー種類と最終更新 -->
                            <div class="server-type-section">
                                <div class="server-detail-label">サーバー種類</div>
                                <div class="server-detail-value">${config.serverType}</div>
                            </div>
                            
                            <div class="server-updated-section">
                                <div class="server-detail-label">最終更新</div>
                                <div class="server-detail-value">${status.lastUpdated}</div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        container.innerHTML = serverContent;
        this.updateUI();
    }

    createContentElement(item, type, index) {
        const element = document.createElement('div');
        element.className = 'content-item';

        let dateLabel = '';
        if (type === 'schedule') {
            dateLabel = `予定日: ${item.date}`;
        } else {
            dateLabel = item.date;
        }

        element.innerHTML = `
            <h3>${item.title}</h3>
            <div class="content-body">${this.parseDiscordMarkdown(item.content)}</div>
            <div class="content-date">${dateLabel}</div>
            <button class="delete-btn" data-delete-type="${type}" data-delete-index="${index}">&times;</button>
        `;

        // 削除ボタンにイベントリスナーを追加
        const deleteBtn = element.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteItem(type, index);
            });
        }

        return element;
    }

    showAddModal() {
        if (this.userMode === 'guest') return;
        if (this.userMode === 'member' && this.currentPage !== 'member') return;

        const modal = document.getElementById('modal-overlay');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');

        let formHTML = '';

        switch (this.currentPage) {
            case 'news':
                if (this.userMode !== 'admin') return;
                title.textContent = 'ニュースを追加';
                formHTML = `
                    <div class="form-group">
                        <label>題名</label>
                        <input type="text" id="input-title" required>
                    </div>
                    <div class="form-group">
                        <label>内容</label>
                        <textarea id="input-content" placeholder="Discord記法が使用できます" required></textarea>
                    </div>
                `;
                break;
            case 'member':
                if (this.userMode === 'guest') return;
                title.textContent = 'メンバーを追加';
                formHTML = `
                    <div class="form-group">
                        <label>画像</label>
                        <div class="file-input-wrapper">
                            <input type="url" id="input-image" placeholder="画像URLを入力 または">
                            <button type="button" class="file-select-btn" id="file-select-button">ファイル選択</button>
                        </div>
                        <img id="image-preview" class="image-preview" style="display: none;">
                    </div>
                    <div class="form-group">
                        <label>名前</label>
                        <input type="text" id="input-name" required>
                    </div>
                    <div class="form-group">
                        <label>説明</label>
                        <textarea id="input-description" placeholder="Discord記法が使用できます" required></textarea>
                    </div>
                `;
                break;
            case 'schedule':
                if (this.userMode !== 'admin') return;
                title.textContent = '予定を追加';
                formHTML = `
                    <div class="form-group">
                        <label>題名</label>
                        <input type="text" id="input-title" required>
                    </div>
                    <div class="form-group">
                        <label>内容</label>
                        <textarea id="input-content" placeholder="Discord記法が使用できます" required></textarea>
                    </div>
                    <div class="form-group">
                        <label>予定日</label>
                        <input type="date" id="input-date" required>
                    </div>
                `;
                break;
            case 'web':
                if (this.userMode !== 'admin') return;
                title.textContent = 'Webリンクを追加';
                formHTML = `
                    <div class="form-group">
                        <label>サイト</label>
                        <select id="input-platform" required>
                            <option value="">選択してください</option>
                            <option value="discord">Discord</option>
                            <option value="youtube">YouTube</option>
                            <option value="twitter">Twitter (X)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>題名</label>
                        <input type="text" id="input-title" required>
                    </div>
                    <div class="form-group">
                        <label>リンク</label>
                        <input type="url" id="input-url" required>
                    </div>
                `;
                break;
            case 'roadmap':
                if (this.userMode !== 'admin') return;
                title.textContent = 'ロードマップを追加';
                formHTML = `
                    <div class="form-group">
                        <label>日付</label>
                        <input type="date" id="input-date" required>
                    </div>
                    <div class="form-group">
                        <label>題名</label>
                        <input type="text" id="input-title" required>
                    </div>
                    <div class="form-group">
                        <label>内容</label>
                        <textarea id="input-content" placeholder="Discord記法が使用できます" required></textarea>
                    </div>
                `;
                break;
        }

        body.innerHTML = formHTML;

        // MEMBERページの場合、ファイル選択ボタンとプレビューのイベントリスナーを設定
        if (this.currentPage === 'member') {
            // 画像URL入力時のプレビュー
            const imageInput = document.getElementById('input-image');
            if (imageInput) {
                imageInput.addEventListener('input', (e) => {
                    this.updateImagePreview(e.target.value);
                });
            }

            // ファイル選択ボタンのイベントリスナー
            const fileSelectBtn = document.getElementById('file-select-button');
            if (fileSelectBtn) {
                fileSelectBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.selectFile();
                });
            }
        }

        modal.style.display = 'flex';
    }

    showServerSettingsModal() {
        if (this.userMode !== 'admin') return;

        const modal = document.getElementById('modal-overlay');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');

        title.textContent = 'サーバー設定';

        const config = this.data.serverConfig || {};

        const formHTML = `
            <div class="form-group">
                <label>サーバーアドレス</label>
                <input type="text" id="server-address" value="${config.address || ''}" placeholder="例: play.example.com" required>
            </div>
            <div class="form-group">
                <label>サーバー種類</label>
                <select id="server-type" required>
                    <option value="">選択してください</option>
                    <option value="BungeeCord" ${config.serverType === 'BungeeCord' ? 'selected' : ''}>BungeeCord</option>
                    <option value="Velocity" ${config.serverType === 'Velocity' ? 'selected' : ''}>Velocity</option>
                    <option value="Paper" ${config.serverType === 'Paper' ? 'selected' : ''}>Paper</option>
                    <option value="Purpur" ${config.serverType === 'Purpur' ? 'selected' : ''}>Purpur</option>
                    <option value="Fabric" ${config.serverType === 'Fabric' ? 'selected' : ''}>Fabric</option>
                    <option value="Forge" ${config.serverType === 'Forge' ? 'selected' : ''}>Forge</option>
                    <option value="Vanilla" ${config.serverType === 'Vanilla' ? 'selected' : ''}>Vanilla</option>
                    <option value="Spigot" ${config.serverType === 'Spigot' ? 'selected' : ''}>Spigot</option>
                    <option value="Bukkit" ${config.serverType === 'Bukkit' ? 'selected' : ''}>Bukkit</option>
                </select>
            </div>
            <div class="form-group">
                <label>応募・参加方法</label>
                <textarea id="server-application" placeholder="Discord記法が使用できます。一般権限のユーザーには、サーバーアドレスの代わりにここの内容が表示されます。">${config.application || ''}</textarea>
            </div>
        `;

        body.innerHTML = formHTML;
        modal.style.display = 'flex';
    }

    selectFile() {
        document.getElementById('hidden-file-input').click();
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const dataURL = event.target.result;
                const imageInput = document.getElementById('input-image');
                if (imageInput) {
                    imageInput.value = dataURL;
                    this.updateImagePreview(dataURL);
                }
            };
            reader.readAsDataURL(file);
        }
    }

    updateImagePreview(imageSrc) {
        const preview = document.getElementById('image-preview');
        if (preview) {
            if (imageSrc) {
                preview.src = imageSrc;
                preview.style.display = 'block';
            } else {
                preview.style.display = 'none';
            }
        }
    }

    hideModal() {
        document.getElementById('modal-overlay').style.display = 'none';
    }

    async handleModalSubmit() {
        const data = {};

        switch (this.currentPage) {
            case 'news':
                data.title = document.getElementById('input-title').value;
                data.content = document.getElementById('input-content').value;
                data.date = new Date().toLocaleDateString('ja-JP');
                break;
            case 'member':
                data.image = document.getElementById('input-image').value;
                data.name = document.getElementById('input-name').value;
                data.description = document.getElementById('input-description').value;
                break;
            case 'schedule':
                data.title = document.getElementById('input-title').value;
                data.content = document.getElementById('input-content').value;
                data.date = document.getElementById('input-date').value;
                break;
            case 'web':
                data.platform = document.getElementById('input-platform').value;
                data.title = document.getElementById('input-title').value;
                data.url = document.getElementById('input-url').value;
                break;
            case 'roadmap':
                data.date = document.getElementById('input-date').value;
                data.title = document.getElementById('input-title').value;
                data.content = document.getElementById('input-content').value;
                break;
        }

        for (const key in data) {
            if (!data[key]) {
                alert('すべての項目を入力してください');
                return;
            }
        }

        this.data[this.currentPage].push(data);
        await this.saveData(); // Firebase に保存
        this.renderCurrentPage();
        this.hideModal();
    }

    async handleServerSettingsSubmit() {
        const address = document.getElementById('server-address').value;
        const serverType = document.getElementById('server-type').value;
        const application = document.getElementById('server-application').value;

        if (!address || !serverType) {
            alert('サーバーアドレスとサーバー種類は必須です');
            return;
        }

        this.data.serverConfig = {
            address: address,
            serverType: serverType,
            application: application
        };

        await this.saveData();
        this.hideModal();

        // サーバーステータスを取得
        this.fetchServerStatus();

        alert('サーバー設定を保存しました');
    }

    async deleteItem(type, index) {
        if (this.userMode !== 'admin') return;

        if (confirm('削除しますか？')) {
            this.data[type].splice(index, 1);
            await this.saveData(); // Firebase に保存
            this.renderCurrentPage();
        }
    }

    async cleanExpiredSchedules() {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const originalLength = this.data.schedule.length;
        this.data.schedule = this.data.schedule.filter(item => {
            const scheduleDate = new Date(item.date);
            const scheduleDay = new Date(scheduleDate.getFullYear(), scheduleDate.getMonth(), scheduleDate.getDate());
            return scheduleDay >= today;
        });

        if (this.data.schedule.length !== originalLength) {
            await this.saveData();
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

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', () => {
    lightServer = new LightServerWebsite();

    // グローバルアクセス用
    window.lightServer = lightServer;

    // デバッグ用ログ
    console.log('Light Server Website initialized successfully!');
    console.log('lightServer object is available globally:', !!window.lightServer);
});
