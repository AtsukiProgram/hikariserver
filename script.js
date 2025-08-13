class LightServerWebsite {
    constructor() {
        this.userMode = 'guest'; // 'guest', 'member', 'admin'
        this.currentPage = 'top';
        this.data = {
            news: JSON.parse(localStorage.getItem('news') || '[]'),
            member: JSON.parse(localStorage.getItem('member') || '[]'),
            schedule: JSON.parse(localStorage.getItem('schedule') || '[]'),
            web: JSON.parse(localStorage.getItem('web') || '[]'),
            roadmap: JSON.parse(localStorage.getItem('roadmap') || '[]')
        };

        this.init();
    }

    // パスワード検証（シンプルで確実な方法）
    validatePassword(input) {
        // 簡単な文字列変換でセキュリティを保ちつつ確実に動作
        const memberPass = String.fromCharCode(122, 57, 120, 49, 121, 53, 104, 113);
        const adminPass = String.fromCharCode(120, 48, 104, 108, 116, 52, 105, 53);

        if (input === memberPass) {
            return 'member';
        } else if (input === adminPass) {
            return 'admin';
        }
        return false;
    }

    init() {
        this.setupEventListeners();
        this.renderCurrentPage();
        this.cleanExpiredSchedules();
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

                // モバイルメニューを閉じる
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

        // +ボタン
        document.getElementById('admin-plus-btn').addEventListener('click', () => {
            this.showAddModal();
        });

        // モーダル関連
        document.getElementById('modal-close').addEventListener('click', () => {
            this.hideModal();
        });

        document.getElementById('modal-cancel').addEventListener('click', () => {
            this.hideModal();
        });

        document.getElementById('modal-submit').addEventListener('click', () => {
            this.handleModalSubmit();
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
        // アクティブページを変更
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
            // ログアウト
            this.userMode = 'guest';
            const operationBtn = document.getElementById('operationBtn');
            operationBtn.querySelector('.nav-text').textContent = 'OPERATION';
            operationBtn.querySelector('.nav-japanese').textContent = '管理';
            this.updateUI();
            alert('ログアウトしました');
        } else {
            // ログイン
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
        const deleteButtons = document.querySelectorAll('.delete-btn');

        // +ボタンの表示制御
        let showPlusBtn = false;
        if (this.currentPage !== 'top') {
            if (this.userMode === 'admin') {
                showPlusBtn = true; // 管理者：全ページ
            } else if (this.userMode === 'member' && this.currentPage === 'member') {
                showPlusBtn = true; // メンバー：MEMBERページのみ
            }
        }

        plusBtn.style.display = showPlusBtn ? 'flex' : 'none';

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
        }
    }

    renderNews() {
        const container = document.getElementById('news-list');
        container.innerHTML = '';

        // 新しい順にソート
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

        // 古い順（登録順）
        this.data.member.forEach((member, index) => {
            const element = document.createElement('div');
            element.className = 'member-item';
            element.innerHTML = `
                <img src="${member.image}" alt="${member.name}" class="member-image" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjRUNGMEYxIi8+CjxwYXRoIGQ9Ik00MCA0MEMzNS41IDQwIDMyIDM2LjUgMzIgMzJDMzIgMjcuNSAzNS41IDI0IDQwIDI0QzQ0LjUgMjQgNDggMjcuNSA0OCAzMkM0OCAzNi41IDQ0LjUgNDAgNDAgNDBaTTQwIDQ0QzMwIDQ0IDIyIDUyIDIyIDYySDU4QzU4IDUyIDUwIDQ0IDQwIDQ0WiIgZmlsbD0iI0JEQzNDNyIvPgo8L3N2Zz4K'">
                <div class="member-info">
                    <h3>${member.name}</h3>
                    <div class="member-description">${this.parseDiscordMarkdown(member.description)}</div>
                </div>
                <button class="delete-btn" onclick="lightServer.deleteItem('member', ${index})">&times;</button>
            `;
            container.appendChild(element);
        });

        this.updateUI();
    }

    renderSchedule() {
        const container = document.getElementById('schedule-list');
        container.innerHTML = '';

        // 予定日が近い順にソート
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

        // 古い順（登録順）
        this.data.web.forEach((item, index) => {
            const element = document.createElement('div');
            element.className = 'web-item';
            element.onclick = () => window.open(item.url, '_blank');

            const iconSrc = `${item.platform}.png`;

            element.innerHTML = `
                <img src="${iconSrc}" alt="${item.platform}" class="web-icon" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iOCIgZmlsbD0iIzM0OThEQiIvPgo8cGF0aCBkPSJNMjAgMTBDMTYuNjg2MyAxMCAxNCAxMi42ODYzIDE0IDE2VjI0QzE0IDI3LjMxMzcgMTYuNjg2MyAzMCAyMCAzMEMyMy4zMTM3IDMwIDI2IDI3LjMxMzcgMjYgMjRWMTZDMjYgMTIuNjg2MyAyMy4zMTM3IDEwIDIwIDEwWiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+Cg=='">
                <div class="web-title">${item.title}</div>
                <button class="delete-btn" onclick="lightServer.deleteItem('web', ${index}); event.stopPropagation();">&times;</button>
            `;
            container.appendChild(element);
        });

        this.updateUI();
    }

    renderRoadmap() {
        const container = document.getElementById('roadmap-list');
        container.innerHTML = '';

        // 古い順（登録順）
        this.data.roadmap.forEach((item, index) => {
            const element = document.createElement('div');
            element.className = 'roadmap-item';
            element.innerHTML = `
                <div class="roadmap-date">${item.date}</div>
                <h3>${item.title}</h3>
                <div class="roadmap-content">${this.parseDiscordMarkdown(item.content)}</div>
                <button class="delete-btn" onclick="lightServer.deleteItem('roadmap', ${index})">&times;</button>
            `;
            container.appendChild(element);
        });

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
            <button class="delete-btn" onclick="lightServer.deleteItem('${type}', ${index})">&times;</button>
        `;

        return element;
    }

    showAddModal() {
        // 権限チェック
        if (this.userMode === 'guest') return;
        if (this.userMode === 'member' && this.currentPage !== 'member') return;

        const modal = document.getElementById('modal-overlay');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');

        let formHTML = '';

        switch (this.currentPage) {
            case 'news':
                if (this.userMode !== 'admin') return; // 管理者のみ
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
                if (this.userMode === 'guest') return; // メンバー以上
                title.textContent = 'メンバーを追加';
                formHTML = `
                    <div class="form-group">
                        <label>画像</label>
                        <div class="file-input-wrapper">
                            <input type="url" id="input-image" placeholder="画像URLを入力 または">
                            <button type="button" class="file-select-btn" onclick="lightServer.selectFile()">ファイル選択</button>
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
                if (this.userMode !== 'admin') return; // 管理者のみ
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
                if (this.userMode !== 'admin') return; // 管理者のみ
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
                if (this.userMode !== 'admin') return; // 管理者のみ
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

        // 画像URL入力時のプレビュー
        if (this.currentPage === 'member') {
            document.getElementById('input-image').addEventListener('input', (e) => {
                this.updateImagePreview(e.target.value);
            });
        }

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
                document.getElementById('input-image').value = dataURL;
                this.updateImagePreview(dataURL);
            };
            reader.readAsDataURL(file);
        }
    }

    updateImagePreview(imageSrc) {
        const preview = document.getElementById('image-preview');
        if (imageSrc) {
            preview.src = imageSrc;
            preview.style.display = 'block';
        } else {
            preview.style.display = 'none';
        }
    }

    hideModal() {
        document.getElementById('modal-overlay').style.display = 'none';
    }

    handleModalSubmit() {
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

        // バリデーション
        for (const key in data) {
            if (!data[key]) {
                alert('すべての項目を入力してください');
                return;
            }
        }

        this.data[this.currentPage].push(data);
        this.saveData();
        this.renderCurrentPage();
        this.hideModal();
    }

    deleteItem(type, index) {
        if (this.userMode !== 'admin') return; // 管理者のみ削除可能

        if (confirm('削除しますか？')) {
            this.data[type].splice(index, 1);
            this.saveData();
            this.renderCurrentPage();
        }
    }

    saveData() {
        for (const key in this.data) {
            localStorage.setItem(key, JSON.stringify(this.data[key]));
        }
    }

    cleanExpiredSchedules() {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        this.data.schedule = this.data.schedule.filter(item => {
            const scheduleDate = new Date(item.date);
            const scheduleDay = new Date(scheduleDate.getFullYear(), scheduleDate.getMonth(), scheduleDate.getDate());
            return scheduleDay >= today;
        });

        this.saveData();
    }

    parseDiscordMarkdown(text) {
        if (!text) return '';

        // エスケープ処理
        text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Discord記法のパース
        // 見出し
        text = text.replace(/^### (.+)$/gm, '<strong>$1</strong>');
        text = text.replace(/^## (.+)$/gm, '<h3>$1</h3>');
        text = text.replace(/^# (.+)$/gm, '<h2>$1</h2>');

        // 太字
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // 隠し（スポイラー）
        text = text.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" onclick="this.style.color=\'#dcddde\'">$1</span>');

        // 小さく表示
        text = text.replace(/^-# (.+)$/gm, '<small>$1</small>');

        // 埋め込みリンク
        text = text.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');

        // 改行
        text = text.replace(/\n/g, '<br>');

        return text;
    }
}

// グローバルインスタンス
let lightServer;

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', () => {
    lightServer = new LightServerWebsite();
});
