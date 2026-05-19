// AikatsuKibun (アイカツ！気分) インタラクティブ・ロジック (V3 超強化版)
// YouTube動画連携、150曲選曲、お気に入り、再生履歴、おまかせ選曲、タイプ自動判別、シンセサイザーSE

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. 150曲以上の動画IDデータベース ---
    const initialVideoIds = [
        'tsKd6HdXvso', 'RjGv7Sa4YQo', '4z31xQuGTp4', '3qqJ1WpF1Cg', 'uISk1HrbFzA', 'q5d60AsaN98', 'Wy_pD0JgHR4',
        '2BN2jH1zlUA', 'bBYYGWyi_Ig', 'aKPhl4S91mM', 'ZCEXyMPKWhA', '7fJuYvx3ou0', '2t0vIcfvEeY', 'uPVjCDbc-Ow',
        'uRcy4Aj4B8w', 'BZqKDdCoTZM', 'HcHpQ_qj6WQ', 'en95U1lK2EQ', 'LQa1mIGbV1c', '72xB_012eVY', '3gVFHFm9Gxw',
        'xiXCHkBaOCg', 'ZbgdnKbyFSo', 'BoE8mVhNjO0', '6beo8GHes4U', '4H4ID0eHREE', 'jmKak1vq1Go', 'Ogu6EGNumKI',
        'N1W9IzcJ8Ug', 'pYT8w_qP6ro', 'gVw3xo5Uf-8', 'KLLJJIs9_7s', 'KATAtxUEEy4', 'RVZCWJ8XuhI', 'sRfanR9ZZ0U',
        'iXr5sT3PFKg', 'NmZm5YQf8l0', 'GlgVZ5Z76-M', '1wMEC1WZLts', 'qs4FOgqvTj0', 'lHrI8DmPCac', 'ULY7WX4_Sd8',
        'MpffoNUUGx8', 'KkPGFKp0gXA', 'pJEKdGGQXdo', '_yyszvUE4r8', 'FPSmZacW_UA', 'hwuuwNyRcKI', '-Xh9NYCRw0M',
        '9w_utuMvfOc', 'SvFOQobTzk0', 'xhBY87NDwrE', '6IEVhN5zJC0', 'VxQ4wn8cGyA', 'op0UXD2l55g', 'oj9dwIkLI_4',
        'oTME3Ur1-ak', 'w2DOYY1mFrg', 'clq4pdBCtTY', '5u5Nc1UWXgg', 'RuKpbA9RSGw', 'M4r1vx2ofUQ', 'AEMsMi7n5x8',
        'BKdhQ8GTjbU', 'n8cEgbNzGPc', 'lODsTsWgyg4', 'cNrttb3MPlY', '0GxDua-0G98', '-YAB0CUxkPE', 'Pu0wYH4CU4E',
        'cwZBNZkF4UQ', 'ujWIfR_rwIg', 'x2Po_BZM_uI', 'tezg1gSJbdo', 'VLIHkj5TrlY', 'PdOakkv6I1w', 'KBWyBfdYy5w',
        'EpSXZjzrUkg', 'OUj4Q8qx1ZQ', '1meOdSe6XTQ', 'Vh2KJq-lyLk', '5dRbGrDWIOU', '4SR6G0eoDPs', '1Jy-KfZwCeA',
        'jIRuoBkjltc', 'UNwx5x2NM9A', 'wDcemF2c3Ro', 'M73DLRbfn_c', '2pAT2OBDXXk', 'yp8Jhjt_png', 'fcPc573QgjU',
        'EOAzGVIzo7U', 'S3bGcj2Rm5o', 'rqqKNukafX0', 'EShAj8OeknA', 'tRx-ayAnRXA', 'p3lVBD4ei6k', 'WLnv4MwbumM',
        'F8V90FkxIZU', 'qpjQ6ZmhDCo', 'nC7OrqXYc6k', 'huFkGmp6eaw', 'cEO4Z7lq-q8', 'LzlDy5edLzo', 'IoK9hnz8cOs',
        '4wEIAGRAxHw', '1xwXyuePSak', 'ql5bm1VU7oQ', 'RfwQteCBfYw', 'fMz6hOoGHHU', 'XzezA5Icqoo', 'WO9D0IKmnX0',
        '9f6_hQtkQsA', '9JQFov6GazM', '8wKDBiD4XsA', 'uXhyoPjNmaw', 'iqRMeq9ajZE', 'fxBWfBLLlU', 'XTSgskSDKEw',
        'WkcqB18K60c', 'TrTFIr8f-n0', 'NLi86WxjPvs', 'MXOBWa1DLCw', 'tfAep2L872E', 'itWdwzWn0Sk', 'z8_cmTbrlNw',
        'xE_Z_Ph7fYk', 'wfqZHr40e0k', 'uepx-pu_IOI', 'r3ZOW5AQRis', 'oo6cucd8FGY', 'mNCv-dmYPS8', 'ltcZaHcarug',
        'h0kOl31dJoM', 'fXluHhS6IGQ', 'f9eRf6ccrAs', 'bWDAyRa6rGU', 'a86i2NFElAk', 'TX414PPKQTA', 'QqJs_d5PWzw',
        'KsORl3_jgMQ', 'KIKPbfhYxPY', 'ItzPBWP614E', 'I8rX7mfQd90', 'HvtKsOu48JU', 'GtXHDzYyCA', 'DjraTjOS0c4',
        'BDu-c8m3Elo', '9-ITMd0_Hmc', '3lFpoJyNmSs', '3ULbpMIz32w', 'Q1zHZ_5WoQo', 'm0FGgFsMpNc', 'K2uy7wGFFgw',
        '1x9rWKtrn9Y', 'Vnobd_FDp48', 'H5miyoLIaGk', 'ZLIqln6BSGI', 'Oqepld-YRaE', 'i_NnjpotJ5M', '5r3snDugV8M',
        'zv7he_TKHpg', 'q2tjrV2JiZY', 'kibfnTlnKBs', 'hihAM-CQyzM', 'cYstuM4CYsU', 'mkdEmQ5RttE', 'XO_2jNhCqTw',
        'VWrSZ8BjIyA', 'KbYs5YYUK7I', '2ZNxFC--4fE', 'qJ3YJ4eywvY', '1vYteBXaOyI', 'lsFTKcP9EyA', 'bz6ejOvk2_U',
        'vHnENRwluK0', 'htnIF4hkZ40', 'lZ_3EU7X3yA', 'PUR0XbH4LrQ', 'Foyc6FTiRnA', 'oz9aqDD7F_c', 'uOSDgSH_T80',
        '22vPY_1OaLY', 'J_1DFaELLPU', 'THoRA3aT4og', 'SYEqF_FY5Qo', '_Vdv7jMZzQ', 'LW9ho4Ftjh8', 'sLtVMfyuQfk',
        'AyNw00TNrCA', 'cvArV6EOysI', 'm3zcqWEBrI4', 'YPxyfDqAmYU', 'o545mbzprw4', 'O5BisaR_30Y', 'FyG3JM9_Ga0',
        'BaMR9ZcA8NU', 'AiWGcDOnFhM', 'o3IYLSbYac4', 'cvy9ts-rNTE', 'KS83f4N0pwU', 'CJUtJQ1rzg4', 'slnfBIWMni4',
        'WdpK14OXYB4', '0sZE4i8Y7k4', 'hF6YDrfCqbQ', 'dYVD26j9ZSc', 'bu5dmV11-ok', 'bh3QyscC4z4', '4KtjvHTq5jY',
        'nGpwaZusSmc', '6uduAQx_HKA', 'KRYSa79bbQE', 'Pd1Z0wX93cE', 'zOuIiDw9K_A', 'c7HeTKiV4-Y', 'tDv6rkHgV9k',
        'FAf3MKuOgGE', 'nSQYIQA6rB8', 'hUc05yg7RYM', 'dirjw0TRnJE', 'WKsfqws2NOs', 'VwZ0bzDVIMo', 'zQSZpeuS3x0',
        'SxR-zqtIg0A', 'CQYcrKCjxlI', 'wKtiP2V9yr0', 'o7JY84_bMHQ', 'sZbyRDGAOD0', 'kl6mUw3zIbE', 'A32dkTeVQwA',
        'z8ay9dAhyFg', '862yM3gCsuY', 'IOVtbv7ZEjU', 'Tn6mOEL1zJ0', 'wctOLFXwRg4', 'wPiw_E_1WBg', '9TJg8_FtCOQ',
        'vyvXYaF0a04', 'Wsr3K2GZfys', 'RYmw8Et5riA', '3iy5PjmSPNM', 'sO7NArY8qhw', 'fGdLUtMch5c', 'j9nIpp9l99w',
        'e86X5ipmG9U', 'imVC38JopIU', 'R1TEBqAnkMU', 'MwvlyT0O9xE', 'xzss0RaYK18', 'xHvKyrvQhu8', 'c8SNAvOvOOM',
        'vg8EntypJ8c', 'cMQAbcUz20g', 'dUMxFQeFFbI', 'wZWiZD4etXI', 'r9fnpDxkCH8', 'vKRBn9de308', 'd7AWyGroqxk',
        'De3tjz6BhHY', 'ByG2m8Rxx60', 'yh5nPYJR2Es', 'DC0YU_-t0y4', 'LqD2vAtHy10', 'B7DyC125qks', 'DMhXbYkz4FQ',
        '4ZGQMqSWKfw', 'bpmWBZqPl_U', '0hJperuzZ_M', 'xcsQsXU6Rj8', 'B6l3x2XrK6w', '0t0VGl6uu5k', 'lHVf_1O4AII',
        'RbyZQyiFFco', 'LMEzfV068a4', 'pn8YwQlJuyU', '-hyVsOSSPbw', '22wYlpKWqC8', 'nwuC2NSyixg', 'km0hHCZp5RY',
        'hropvmRz0_M', 'uWvlOqpAbMM', 'xb639LdgDpw', '4wignYcpqe8', 'RJTrTeEObog', 'xh_360kVOF4', 'PMpfH86vnNM',
        'EvIyzjlyH_0', 'B8tgwNoJ_8A', 'oUNR-I5V8rQ', 'b4xLiGq72AM', 'SEL5D6ya14M', '2qfgRuoMpcE', 'plFa4paRLdA',
        'ceCioX0LYU0', 'vPWL8vYPHNM', '2hYr422h1wo', 'YLn9COaWyog', 'mAwLMgpSBAQ', 'VqZUUQ0KVqw', 'S3twekqjVQc',
        'rQ19M5WXmbA', 'ixRp65POU7k', 'NzpBaiboVYU', '_5Y_mEzAOvI', 'rqt-LlEloKk', 'DEdbmXWokTI', 'VmL9z7AhPMQ',
        'UoEO_tK53ck', 'UXByUTuzQso', 'RuKpbA9RSGw', 'tZ-p6ff8s0Y', 'T460dxv4sNA', 'fQ2OExJkSjI'
    ];

    // --- 2. 要素の取得 ---
    const appContainer = document.getElementById('app');
    const songSelect = document.getElementById('song-select');
    const youtubePlayer = document.getElementById('youtube-player');
    const sparkleContainer = document.getElementById('sparkle-container');

    // コントロールボタン
    const ctrlShuffle = document.getElementById('ctrl-shuffle');
    const ctrlSelect = document.getElementById('ctrl-select');
    const ctrlFavorites = document.getElementById('ctrl-favorites');
    const ctrlHistory = document.getElementById('ctrl-history');
    const ctrlAdd = document.getElementById('ctrl-add');
    const ctrlHelp = document.getElementById('ctrl-help');

    // モーダル・オーバーレイ
    const modalOverlay = document.getElementById('modal-overlay');
    const modalHelp = document.getElementById('modal-help');
    const modalSelect = document.getElementById('modal-select');
    const modalFavorites = document.getElementById('modal-favorites');
    const modalHistory = document.getElementById('modal-history');
    const modalAdd = document.getElementById('modal-add');

    // モーダル内部要素
    const videoSearchInput = document.getElementById('video-search-input');
    const videoListContainer = document.getElementById('video-list-container');
    const favoriteListContainer = document.getElementById('favorite-list-container');
    const historyListContainer = document.getElementById('history-list-container');
    const addVideoUrlInput = document.getElementById('add-video-url');
    const btnAddSubmit = document.getElementById('btn-add-submit');
    const addVideoError = document.getElementById('add-video-error');
    const btnClearHistory = document.getElementById('btn-clear-history');
    const btnClearFavorites = document.getElementById('btn-clear-favorites');

    const buttons = {
        'btn-red': document.getElementById('btn-red'),
        'btn-green': document.getElementById('btn-green'),
        'btn-yellow': document.getElementById('btn-yellow')
    };

    // 固定のデフォルト3曲設定
    const defaultSongs = {
        'cool_glass': { theme: 'theme-cool', videoId: 'fYibOFCMpnE', sparkleEmoji: '✦', title: '硝子ドール' },
        'cute_katsudo': { theme: 'theme-cute', videoId: 'BDu-c8m3Elo', sparkleEmoji: '♥', title: 'アイドル活動！' },
        'pop_happy': { theme: 'theme-pop', videoId: 'e9LkFKbRoq4', sparkleEmoji: '★', title: 'ダイヤHappy' }
    };

    // --- 3. 状態管理 (State) ---
    let currentVideoId = 'fYibOFCMpnE';
    let currentTheme = 'theme-cool';
    let currentSparkleEmoji = '✦';
    let isMuted = true; // 初回はミュート、以後は選曲時に自動的に解除

    // LocalStorageから配列を読み込み
    let favoriteIds = JSON.parse(localStorage.getItem('fav_ids') || '[]');
    let historyIds = JSON.parse(localStorage.getItem('hist_ids') || '[]');
    let customVideos = JSON.parse(localStorage.getItem('custom_videos') || '[]'); // ユーザー追加動画データ

    // キャッシュ済みの動画詳細データ { id: { id, title, thumbnailUrl } }
    let videoCache = {};

    // --- 4. Web Audio API 音響シンセサイザー ---
    let audioCtx = null;
    let noiseBuffer = null;

    const initAudioContext = () => {
        if (audioCtx) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const bufferSize = audioCtx.sampleRate * 0.15;
        noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
    };

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

    const playTapSound = () => {
        initAudioContext();
        if (!audioCtx) return;
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const now = audioCtx.currentTime;

        // 1. 太鼓成分 (三角波)
        const osc = audioCtx.createOscillator();
        const oscGain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.08);
        oscGain.gain.setValueAtTime(0.35, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(oscGain);
        oscGain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.08);

        // 2. 鈴/タンバリン成分 (ノイズ + ハイパスフィルタ)
        const currentNoiseBuffer = getNoiseBuffer();
        if (currentNoiseBuffer) {
            const actualSource = audioCtx.createBufferSource();
            actualSource.buffer = currentNoiseBuffer;
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(6500, now);
            const noiseGain = audioCtx.createGain();
            noiseGain.gain.setValueAtTime(0.18, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            actualSource.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(audioCtx.destination);
            actualSource.start(now);
            actualSource.stop(now + 0.12);
        }
    };

    // --- 5. パーティクルエフェクト ---
    const createSparkleParticles = (btn) => {
        if (!sparkleContainer) return;
        const rect = btn.getBoundingClientRect();
        const containerRect = sparkleContainer.getBoundingClientRect();
        const centerX = rect.left - containerRect.left + rect.width / 2;
        const centerY = rect.top - containerRect.top + rect.height / 2;

        const particleCount = 6;
        for (let i = 0; i < particleCount; i++) {
            const star = document.createElement('span');
            star.className = 'sparkle';
            star.textContent = currentSparkleEmoji;
            star.style.left = `${centerX}px`;
            star.style.top = `${centerY}px`;

            const angle = Math.random() * Math.PI * 2;
            const distance = 40 + Math.random() * 80;
            const tx = Math.cos(angle) * distance;
            const ty = Math.sin(angle) * distance - 20;
            const rot = 180 + Math.random() * 360;

            star.style.setProperty('--tx', `${tx}px`);
            star.style.setProperty('--ty', `${ty}px`);
            star.style.setProperty('--rot', `${rot}deg`);

            sparkleContainer.appendChild(star);
            setTimeout(() => star.remove(), 600);
        }
    };

    const triggerButton = (btnId) => {
        const btn = buttons[btnId];
        if (!btn) return;
        if (navigator.vibrate) navigator.vibrate(15);
        playTapSound();
        createSparkleParticles(btn);
    };

    // --- 6. イベントリスナー登録 (ボタン操作系) ---
    Object.keys(buttons).forEach(btnId => {
        const btn = buttons[btnId];
        if (!btn) return;

        const activate = (e) => {
            e.preventDefault();
            initAudioContext();
            btn.classList.add('active');
            triggerButton(btnId);
        };
        const deactivate = (e) => {
            e.preventDefault();
            btn.classList.remove('active');
        };

        btn.addEventListener('touchstart', activate, { passive: false });
        btn.addEventListener('touchend', deactivate, { passive: false });
        btn.addEventListener('touchcancel', deactivate, { passive: false });
        btn.addEventListener('mousedown', (e) => {
            initAudioContext();
            btn.classList.add('active');
            triggerButton(btnId);
        });
        btn.addEventListener('mouseup', () => btn.classList.remove('active'));
        btn.addEventListener('mouseleave', () => btn.classList.remove('active'));
    });

    // キーボード操作
    const keyMap = { 'w': 'btn-red', 'a': 'btn-green', 'd': 'btn-yellow' };
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
            if (btn) btn.classList.remove('active');
        }
    });

    // --- 7. YouTubeプレイヤー連携＆テーマ変更処理 ---
    const applyTheme = (themeName) => {
        const themes = ['theme-cool', 'theme-cute', 'theme-pop'];
        themes.forEach(t => appContainer.classList.remove(t));
        appContainer.classList.add(themeName);
        currentTheme = themeName;

        // テーマごとのエフェクト絵文字設定
        if (themeName === 'theme-cute') currentSparkleEmoji = '♥';
        else if (themeName === 'theme-pop') currentSparkleEmoji = '★';
        else currentSparkleEmoji = '✦';
    };

    // 曲のタイトル名等からテーマタイプを自動判定する
    const detectThemeFromTitle = (title) => {
        const cuteRegex = /キュート|cute|ピンク|pink|アイドル活動|ハッピーレインボー|Angely Sugar|エンジェリーシュガー|マリア|さくら/i;
        const coolRegex = /クール|cool|パープル|purple|セクシー|sexy|硝子|カレイドスコープ|Spicy|ゴス|Goth|ロリゴシック|Loli|美月|ユリカ|蘭/i;
        const popRegex = /ポップ|pop|イエロー|yellow|オレンジ|orange|ダイヤ|ダイヤモンド|おとめ|きい|セイラ/i;

        if (cuteRegex.test(title)) return 'theme-cute';
        if (coolRegex.test(title)) return 'theme-cool';
        if (popRegex.test(title)) return 'theme-pop';

        // 判定不能な場合はランダムに割り振る
        const defaultThemes = ['theme-cute', 'theme-cool', 'theme-pop'];
        return defaultThemes[Math.floor(Math.random() * defaultThemes.length)];
    };

    const playVideo = (videoId, skipHistory = false) => {
        currentVideoId = videoId;
        
        // プレイヤーの書き換え
        const embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1&mute=${isMuted ? 1 : 0}`;
        youtubePlayer.src = embedUrl;

        // 2回目以降の選曲時はミュートを自動解除
        if (isMuted) isMuted = false;

        // 履歴への追加
        if (!skipHistory) {
            historyIds = [videoId, ...historyIds.filter(id => id !== videoId)].slice(0, 30);
            localStorage.setItem('hist_ids', JSON.stringify(historyIds));
        }

        // キャッシュデータの取得とテーマ判定
        getVideoDetail(videoId).then(detail => {
            const theme = detectThemeFromTitle(detail.title);
            applyTheme(theme);
        });
    };

    // --- 8. NoEmbed APIによる非同期情報取得 ---
    const getVideoDetail = async (id) => {
        if (videoCache[id]) return videoCache[id];

        // デフォルト値
        const defaultData = {
            id: id,
            title: `アイカツ！動画 (ID: ${id})`,
            thumbnailUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
        };

        try {
            const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`);
            if (response.ok) {
                const data = await response.json();
                if (!data.error) {
                    const result = {
                        id: id,
                        title: data.title || defaultData.title,
                        thumbnailUrl: data.thumbnail_url || defaultData.thumbnailUrl
                    };
                    videoCache[id] = result;
                    return result;
                }
            }
        } catch (e) {
            console.error('NoEmbed fetch error:', e);
        }

        videoCache[id] = defaultData;
        return defaultData;
    };

    // --- 9. モーダルの挙動制御 ---
    const openModal = (modalElement) => {
        modalOverlay.classList.remove('hidden');
        modalElement.classList.remove('hidden');
    };

    const closeModal = () => {
        const modals = [modalHelp, modalSelect, modalFavorites, modalHistory, modalAdd];
        modals.forEach(m => m.classList.add('hidden'));
        modalOverlay.classList.add('hidden');
    };

    // 閉じるボタンとオーバーレイにイベント登録
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', closeModal);
    });
    modalOverlay.addEventListener('click', closeModal);

    ctrlHelp.addEventListener('click', () => openModal(modalHelp));
    ctrlAdd.addEventListener('click', () => {
        addVideoError.classList.add('hidden');
        addVideoUrlInput.value = '';
        openModal(modalAdd);
    });

    // --- 10. 動画追加機能のロジック ---
    const extractVideoId = (url) => {
        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    };

    btnAddSubmit.addEventListener('click', async () => {
        const url = addVideoUrlInput.value.trim();
        const id = extractVideoId(url);
        if (!id) {
            addVideoError.textContent = '❌ 有効なYouTube URLを入力してください。';
            addVideoError.classList.remove('hidden');
            return;
        }

        addVideoError.textContent = '取得中...';
        addVideoError.classList.remove('hidden');

        const detail = await getVideoDetail(id);
        
        // カスタム動画リストに保存
        if (!customVideos.some(v => v.id === id)) {
            customVideos = [detail, ...customVideos];
            localStorage.setItem('custom_videos', JSON.stringify(customVideos));
        }

        // お気に入りにも追加
        if (!favoriteIds.includes(id)) {
            favoriteIds = [id, ...favoriteIds];
            localStorage.setItem('fav_ids', JSON.stringify(favoriteIds));
        }

        closeModal();
        playVideo(id);
    });

    // --- 11. リスト / お気に入り / 履歴 モーダルの中身動的生成 ---
    
    // リストアイテムDOM生成ヘルパー
    const createListItemDOM = (video, container, listType) => {
        const isFavorite = favoriteIds.includes(video.id);

        const li = document.createElement('li');
        li.className = 'item-card';

        const img = document.createElement('img');
        img.className = 'item-thumbnail';
        img.src = video.thumbnailUrl;
        img.alt = video.title;
        img.loading = 'lazy';

        const info = document.createElement('div');
        info.className = 'item-info';
        const titleSpan = document.createElement('span');
        titleSpan.className = 'item-title';
        titleSpan.textContent = video.title;
        info.appendChild(titleSpan);

        const actions = document.createElement('div');
        actions.className = 'item-actions';

        const favBtn = document.createElement('button');
        favBtn.className = `fav-toggle-btn ${isFavorite ? 'is-favorite' : ''}`;
        favBtn.innerHTML = '★';
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(video.id, favBtn, listType);
        });

        actions.appendChild(favBtn);

        li.appendChild(img);
        li.appendChild(info);
        li.appendChild(actions);

        // クリックで再生
        li.addEventListener('click', () => {
            closeModal();
            playVideo(video.id);
        });

        container.appendChild(li);
    };

    // お気に入りのトグル処理
    const toggleFavorite = (id, buttonElement, sourceListType) => {
        if (favoriteIds.includes(id)) {
            favoriteIds = favoriteIds.filter(favId => favId !== id);
            buttonElement.classList.remove('is-favorite');
        } else {
            favoriteIds = [id, ...favoriteIds];
            buttonElement.classList.add('is-favorite');
        }
        localStorage.setItem('fav_ids', JSON.stringify(favoriteIds));

        // モーダルが開かれている場合は再描画する
        if (sourceListType === 'fav' || !modalFavorites.classList.contains('hidden')) {
            renderFavorites();
        }
        if (sourceListType === 'select' || !modalSelect.classList.contains('hidden')) {
            renderVideoList();
        }
    };

    // 全動画リストモーダルの描画
    const renderVideoList = async () => {
        videoListContainer.innerHTML = '<li>読み込み中...</li>';

        // 全ID（デフォルト150曲 ＋ ユーザー追加分）のユニーク化
        const allIds = Array.from(new Set([...customVideos.map(v => v.id), ...initialVideoIds]));
        const filterText = videoSearchInput.value.trim().toLowerCase();

        videoListContainer.innerHTML = '';
        
        for (let id of allIds) {
            // キャッシュか初期データを取得
            let detail = videoCache[id] || customVideos.find(v => v.id === id);
            if (!detail) {
                // サムネイルを高速仮決定
                detail = {
                    id: id,
                    title: `動画 ID: ${id}`,
                    thumbnailUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
                };
            }

            if (filterText && !detail.title.toLowerCase().includes(filterText) && !detail.id.toLowerCase().includes(filterText)) {
                continue; // 検索フィルタ
            }

            createListItemDOM(detail, videoListContainer, 'select');

            // タイトルが仮のものの場合は裏で非同期フェッチして更新する
            if (!videoCache[id]) {
                getVideoDetail(id).then(updatedDetail => {
                    // 現在モーダルが開かれており、まだそのDOMがあるならタイトルを書き換える
                    const titleElements = videoListContainer.querySelectorAll('.item-title');
                    titleElements.forEach(el => {
                        if (el.textContent === detail.title) {
                            el.textContent = updatedDetail.title;
                        }
                    });
                });
            }
        }
    };

    // お気に入りリストモーダルの描画
    const renderFavorites = async () => {
        favoriteListContainer.innerHTML = '';
        if (favoriteIds.length === 0) {
            favoriteListContainer.innerHTML = '<li style="text-align:center;padding:20px;color:#aaa;">お気に入りはまだありません。</li>';
            return;
        }

        for (let id of favoriteIds) {
            const detail = await getVideoDetail(id);
            createListItemDOM(detail, favoriteListContainer, 'fav');
        }
    };

    // 再生履歴リストモーダルの描画
    const renderHistory = async () => {
        historyListContainer.innerHTML = '';
        if (historyIds.length === 0) {
            historyListContainer.innerHTML = '<li style="text-align:center;padding:20px;color:#aaa;">履歴はまだありません。</li>';
            return;
        }

        for (let id of historyIds) {
            const detail = await getVideoDetail(id);
            createListItemDOM(detail, historyListContainer, 'hist');
        }
    };

    // モーダルオープンボタンにレンダリング登録
    ctrlSelect.addEventListener('click', () => {
        videoSearchInput.value = '';
        renderVideoList();
        openModal(modalSelect);
    });

    videoSearchInput.addEventListener('input', renderVideoList);

    ctrlFavorites.addEventListener('click', () => {
        renderFavorites();
        openModal(modalFavorites);
    });

    ctrlHistory.addEventListener('click', () => {
        renderHistory();
        openModal(modalHistory);
    });

    // --- 12. データリセット処理 ---
    btnClearHistory.addEventListener('click', () => {
        if (confirm('再生履歴をすべて消去しますか？')) {
            historyIds = [];
            localStorage.setItem('hist_ids', JSON.stringify(historyIds));
            renderHistory();
        }
    });

    btnClearFavorites.addEventListener('click', () => {
        if (confirm('お気に入りをすべて消去しますか？')) {
            favoriteIds = [];
            localStorage.setItem('fav_ids', JSON.stringify(favoriteIds));
            renderFavorites();
        }
    });

    // --- 13. おまかせ選曲 (☘️) ---
    ctrlShuffle.addEventListener('click', () => {
        const allIds = Array.from(new Set([...customVideos.map(v => v.id), ...initialVideoIds]));
        if (allIds.length === 0) return;

        let randomId = currentVideoId;
        // 同じ曲が連続で選ばれないようにループ（曲数が2以上の時）
        if (allIds.length > 1) {
            while (randomId === currentVideoId) {
                randomId = allIds[Math.floor(Math.random() * allIds.length)];
            }
        } else {
            randomId = allIds[0];
        }

        playVideo(randomId);
    });

    // --- 14. 既存のセレクトボックス楽曲切り替えとの同期 ---
    if (songSelect) {
        songSelect.addEventListener('change', (e) => {
            const key = e.target.value;
            const song = defaultSongs[key];
            if (song) {
                playVideo(song.videoId);
            }
        });
    }

    // 初回ロード時の初期化
    applyTheme('theme-cool');
    document.addEventListener('click', initAudioContext, { once: true });
    document.addEventListener('touchstart', initAudioContext, { once: true });
});
