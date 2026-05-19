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
            videoId: 'fYibOFCMpnE', // 硝子ドール
            sparkleEmoji: '✦'
        },
        'cute_katsudo': {
            theme: 'theme-cute',
            videoId: '1_m0kP8yD6Y', // アイドル活動！
            sparkleEmoji: '♥'
        },
        'pop_happy': {
            theme: 'theme-pop',
            videoId: 'H0MhA6n_qj4', // ダイヤモンドハッピー
            sparkleEmoji: '★'
        }
    };

    // 現在選択されている楽曲キー
    let currentSongKey = 'cool_glass';


    // --- 2. Web Audio API 音響シンセサイザー ---
    let audioCtx = null;

    // 音声コンテキストの初期化（ブラウザポリシー回避用）
    const initAudioContext = () => {
        if (audioCtx) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    };

    // 各ボタンに対応したキラキラタップSEの動的生成
    const playTapSound = (btnId) => {
        initAudioContext();
        if (!audioCtx) return;

        // サスペンド状態ならアクティベート
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const now = audioCtx.currentTime;

        // キラキラ感とシンセ打鍵音を表現するための複数オシレーター構成
        if (btnId === 'btn-red') {
            // 💜 クール: 透き通った荘厳なゴシックベル調の金属音
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now); // A5 (ラ)
            osc.frequency.exponentialRampToValueAtTime(1760, now + 0.1); // 超高速オクターブ上昇
            
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.3);
        } 
        else if (btnId === 'btn-green') {
            // 💗 キュート: 可愛らしく駆け上がる「超高速きらきらアルペジオ」
            const times = [0, 0.03, 0.06];
            const freqs = [1046.50, 1318.51, 1568.0]; // C6(ド) -> E6(ミ) -> G6(ソ)
            
            times.forEach((t, index) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freqs[index], now + t);
                
                gain.gain.setValueAtTime(0.18, now + t);
                gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.15);
                
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now + t);
                osc.stop(now + t + 0.2);
            });
        } 
        else if (btnId === 'btn-yellow') {
            // 💛 ポップ: 弾ける果実のようなスライディングポップ音
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1174.66, now); // D6 (レ)
            osc.frequency.exponentialRampToValueAtTime(587.33, now + 0.14); // オクターブ急降下
            
            gain.gain.setValueAtTime(0.22, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.2);
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

        // 音声の再生
        playTapSound(btnId);

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
