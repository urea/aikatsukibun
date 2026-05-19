// AikatsuKibun (アイカツ！気分) インタラクティブ・ロジック (V2進化版)
// YouTube動画連携、ダイナミックテーマ切り替え、Web Audio SE、スターパーティクル

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. 要素の取得とデータ定義 ---
    const appContainer = document.getElementById('app');
    const songSelect = document.getElementById('song-select');
    const youtubePlayer = document.getElementById('youtube-player');
    const sparkleContainer = document.getElementById('sparkle-container');

    const buttons = {
        'btn-red': document.getElementById('btn-red'),
        'btn-green': document.getElementById('btn-green'),
        'btn-yellow': document.getElementById('btn-yellow')
    };

    // 楽曲・テーマ・動画マッピング
    const songData = {
        'cool_glass': {
            theme: 'theme-cool',
            videoId: 'fYibOFCMpnE', // 硝子ドール (埋め込み可能)
            sparkleEmoji: '✦'
        },
        'cute_katsudo': {
            theme: 'theme-cute',
            videoId: 'BDu-c8m3Elo', // アイドル活動！(Rock Ver.プレイ動画 - 埋め込み可能)
            sparkleEmoji: '♥'
        },
        'pop_happy': {
            theme: 'theme-pop',
            videoId: 'e9LkFKbRoq4', // ダイヤモンドハッピー(ミルキーヴィーナスコーデプレイ動画 - 埋め込み可能)
            sparkleEmoji: '★'
        }
    };

    // 現在選択されている楽曲キー
    let currentSongKey = 'cool_glass';


    // --- 2. Web Audio API 音響シンセサイザー ---
    let audioCtx = null;
    let noiseBuffer = null;

    // 音声コンテキストの初期化（ブラウザポリシー回避用）
    const initAudioContext = () => {
        if (audioCtx) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // ホワイトノイズバッファの事前生成（1回限り）
        const bufferSize = audioCtx.sampleRate * 0.15; // 0.15秒分
        noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
    };

    // ノイズバッファの取得
    const getNoiseBuffer = () => {
        if (!noiseBuffer && audioCtx) {
            const bufferSize = audioCtx.sampleRate * 0.15;
            noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
        }
        return noiseBuffer;
    };

    // アイカツ！筐体風「小気味よいタンッ＆シャンッ」タップSEの生成（3ボタン共通）
    const playTapSound = () => {
        initAudioContext();
        if (!audioCtx) return;

        // サスペンド状態ならアクティベート
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const now = audioCtx.currentTime;

        // 1. 【太鼓成分（タンッ）】
        // アタック感のある力強い打撃低音を三角波で生成
        const osc = audioCtx.createOscillator();
        const oscGain = audioCtx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240, now); // 少し引き締まったアタック音
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.08); // 周波数の急降下
        
        oscGain.gain.setValueAtTime(0.35, now); // 音量
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08); // すぐ消える
        
        osc.connect(oscGain);
        oscGain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.08);

        // 2. 【鈴／タンバリン成分（シャンッ）】
        // ハイパスフィルターを通したホワイトノイズで金属の輝きを表現
        const currentNoiseBuffer = getNoiseBuffer();
        if (currentNoiseBuffer) {
            const noiseSource = document.createElement ? null : audioCtx.createBufferSource();
            // (※安全にバッファソースを毎回生成)
            const actualSource = audioCtx.createBufferSource();
            actualSource.buffer = currentNoiseBuffer;
            
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(6500, now); // 高音域のみ（シャリシャリ感）
            
            const noiseGain = audioCtx.createGain();
            noiseGain.gain.setValueAtTime(0.18, now); // 金属的なきらめき音量
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12); // 太鼓より少し長めに残す
            
            actualSource.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(audioCtx.destination);
            
            actualSource.start(now);
            actualSource.stop(now + 0.12);
        }
    };


    // --- 3. スター・パーティクルエフェクト ---
    const createSparkleParticles = (btn) => {
        if (!sparkleContainer) return;

        // ボタンの中心座標を計算
        const rect = btn.getBoundingClientRect();
        const containerRect = sparkleContainer.getBoundingClientRect();
        
        const centerX = rect.left - containerRect.left + rect.width / 2;
        const centerY = rect.top - containerRect.top + rect.height / 2;

        const emoji = songData[currentSongKey].sparkleEmoji;
        const particleCount = 6; // 生成する星の数

        for (let i = 0; i < particleCount; i++) {
            const star = document.createElement('span');
            star.className = 'sparkle';
            star.textContent = emoji;

            // 初期位置をボタンの中心に設定
            star.style.left = `${centerX}px`;
            star.style.top = `${centerY}px`;

            // ランダムな飛び散り方向と回転角度の計算
            const angle = Math.random() * Math.PI * 2;
            const distance = 40 + Math.random() * 80;
            const tx = Math.cos(angle) * distance;
            const ty = Math.sin(angle) * distance - 20; // 若干上に飛び散るように調整
            const rot = 180 + Math.random() * 360;

            // CSS変数として注入し、CSSキーフレームアニメーションを発火
            star.style.setProperty('--tx', `${tx}px`);
            star.style.setProperty('--ty', `${ty}px`);
            star.style.setProperty('--rot', `${rot}deg`);

            sparkleContainer.appendChild(star);

            // アニメーション完了後にDOMから自動消去
            setTimeout(() => {
                star.remove();
            }, 600);
        }
    };


    // --- 4. タップ・クリックのアクティブ化共通処理 ---
    const triggerButton = (btnId) => {
        const btn = buttons[btnId];
        if (!btn) return;

        // 振動フィードバック (対応デバイスのみ)
        if (navigator.vibrate) {
            navigator.vibrate(15);
        }

        // 音声の再生 (3ボタン共通のアイカツ！筐体音)
        playTapSound();

        // パーティクルの生成
        createSparkleParticles(btn);
    };


    // --- 5. タッチ＆マウスクリックイベント登録 ---
    Object.keys(buttons).forEach(btnId => {
        const btn = buttons[btnId];
        if (!btn) return;

        // タッチ開始
        const activate = (e) => {
            e.preventDefault(); // 連打時のピンチズームやスクロールを完全に抑止
            initAudioContext(); // タップの瞬間に音声の準備を保証
            
            btn.classList.add('active');
            triggerButton(btnId);
        };

        // タッチ終了
        const deactivate = (e) => {
            e.preventDefault();
            btn.classList.remove('active');
        };

        // モバイル用タッチイベント
        btn.addEventListener('touchstart', activate, { passive: false });
        btn.addEventListener('touchend', deactivate, { passive: false });
        btn.addEventListener('touchcancel', deactivate, { passive: false });

        // PC用マウスイベント
        btn.addEventListener('mousedown', (e) => {
            initAudioContext();
            btn.classList.add('active');
            triggerButton(btnId);
        });
        
        btn.addEventListener('mouseup', () => {
            btn.classList.remove('active');
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.classList.remove('active');
        });
    });


    // --- 6. PCキーボード操作 (W, A, Dキー) の制御 ---
    const keyMap = {
        'w': 'btn-red',
        'a': 'btn-green',
        'd': 'btn-yellow'
    };

    document.addEventListener('keydown', (e) => {
        const btnId = keyMap[e.key.toLowerCase()];
        if (btnId) {
            const btn = buttons[btnId];
            if (btn && !btn.classList.contains('active')) {
                initAudioContext();
                btn.classList.add('active');
                triggerButton(btnId);
            }
        }
    });

    document.addEventListener('keyup', (e) => {
        const btnId = keyMap[e.key.toLowerCase()];
        if (btnId) {
            const btn = buttons[btnId];
            if (btn) {
                btn.classList.remove('active');
            }
        }
    });


    // --- 7. 楽曲・テーマ切り替えロジック ---
    if (songSelect) {
        songSelect.addEventListener('change', (e) => {
            const selectedKey = e.target.value;
            const data = songData[selectedKey];
            if (!data) return;

            currentSongKey = selectedKey;

            // 1. 画面全体のテーマクラスの切り替え
            Object.values(songData).forEach(d => {
                appContainer.classList.remove(d.theme);
            });
            appContainer.classList.add(data.theme);

            // 2. YouTubeのIFrameソースの動的書き換え
            // プレイリストの切り替え時にenablejsapiを有効にする
            youtubePlayer.src = `https://www.youtube.com/embed/${data.videoId}?enablejsapi=1`;
            
            // 効果音コンテキストのウォームアップ
            initAudioContext();
        });
    }

    // 画面のどこかを初めてクリックした際にオーディオを初期化する（ポリシー対策）
    document.addEventListener('click', initAudioContext, { once: true });
    document.addEventListener('touchstart', initAudioContext, { once: true });
});
